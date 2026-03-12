/**
 * Presenter Tests
 *
 * Unit tests for the Presenter engine (MVA View Layer):
 * - createPresenter() factory
 * - Zod schema validation
 * - System rules injection
 * - uiBlocks (single item) and collectionUiBlocks (arrays)
 * - Branded type detection
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter, isPresenter } from '../../src/presenter/Presenter.js';
import { isResponseBuilder } from '../../src/presenter/ResponseBuilder.js';
import { ui } from '../../src/presenter/ui.js';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending']),
});

describe('Presenter', () => {
    describe('createPresenter() factory', () => {
        it('should create a presenter with a name', () => {
            const presenter = createPresenter('Invoice');
            expect(presenter.name).toBe('Invoice');
        });

        it('should be detectable via isPresenter()', () => {
            const presenter = createPresenter('Invoice');
            expect(isPresenter(presenter)).toBe(true);
        });

        it('should reject non-presenter objects', () => {
            expect(isPresenter({})).toBe(false);
            expect(isPresenter(null)).toBe(false);
            expect(isPresenter('string')).toBe(false);
        });
    });

    describe('.schema() — Zod validation', () => {
        it('should validate data through the Zod schema', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema);

            const result = presenter.make({ id: 'INV-1', amount_cents: 45000, status: 'paid' });
            expect(isResponseBuilder(result)).toBe(true);

            const built = result.build();
            expect(built.content[0].type).toBe('text');
            const parsed = JSON.parse(built.content[0].text);
            expect(parsed.id).toBe('INV-1');
            expect(parsed.amount_cents).toBe(45000);
        });

        it('should throw on invalid data', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema);

            expect(() => presenter.make({
                id: 123, // should be string
                amount_cents: 'not-a-number',
                status: 'invalid',
            })).toThrow();
        });

        it('should strip unknown fields (Zod default)', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema);

            const result = presenter.make({
                id: 'INV-1',
                amount_cents: 45000,
                status: 'paid',
                secret_field: 'should be stripped',
            });

            const built = result.build();
            const parsed = JSON.parse(built.content[0].text);
            expect(parsed.secret_field).toBeUndefined();
        });
    });

    describe('.systemRules() — JIT context', () => {
        it('should inject system rules into the response', () => {
            const presenter = createPresenter('Invoice')
                .systemRules([
                    'CRITICAL: amount_cents is in CENTS. Divide by 100.',
                    'Format: $XX,XXX.00',
                ]);

            const result = presenter.make({ id: 'INV-1' }).build();

            // Data block + Rules block = 2 blocks
            expect(result.content.length).toBe(2);
            expect(result.content[1].text).toContain('domain_rules');
            expect(result.content[1].text).toContain('Divide by 100');
            expect(result.content[1].text).toContain('$XX,XXX.00');
        });
    });

    describe('.uiBlocks() — single item SSR', () => {
        it('should generate UI blocks for a single item', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .uiBlocks((invoice: { id: string; amount_cents: number; status: string }) => [
                    ui.echarts({ series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }] }),
                ]);

            const result = presenter.make({ id: 'INV-1', amount_cents: 45000, status: 'paid' }).build();

            // Data block + UI block = 2 blocks
            expect(result.content.length).toBe(2);
            expect(result.content[1].text).toContain('echarts');
            expect(result.content[1].text).toContain('450'); // 45000/100
        });
    });

    describe('.collectionUiBlocks() — array aggregation', () => {
        it('should generate aggregated UI blocks for arrays', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .collectionUiBlocks((invoices: Array<{ id: string; amount_cents: number; status: string }>) => [
                    ui.echarts({
                        xAxis: { data: invoices.map(i => i.id) },
                        series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
                    }),
                ]);

            const data = [
                { id: 'INV-1', amount_cents: 45000, status: 'paid' as const },
                { id: 'INV-2', amount_cents: 12000, status: 'pending' as const },
            ];

            const result = presenter.make(data).build();

            // Data block + 1 aggregated UI block = 2 blocks
            expect(result.content.length).toBe(2);
            expect(result.content[1].text).toContain('INV-1');
            expect(result.content[1].text).toContain('INV-2');
            expect(result.content[1].text).toContain('bar');
        });

        it('should validate each item in the array independently', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema);

            expect(() => presenter.make([
                { id: 'INV-1', amount_cents: 45000, status: 'paid' },
                { id: 123, amount_cents: 'bad', status: 'invalid' }, // Invalid second item
            ])).toThrow();
        });
    });

    describe('composition — Presenter .make() returns composable builder', () => {
        it('should allow adding llmHint after .make()', () => {
            const presenter = createPresenter('Invoice')
                .systemRules(['Rule 1']);

            const result = presenter.make({ id: 'INV-1' })
                .llmHint('This client has overdue balance')
                .build();

            // Data + Hints + Rules = 3 blocks
            expect(result.content.length).toBe(3);
            expect(result.content[1].text).toContain('overdue balance');
            expect(result.content[2].text).toContain('Rule 1');
        });

        it('should allow adding extra uiBlock after .make()', () => {
            const presenter = createPresenter('Invoice')
                .uiBlocks(() => [ui.echarts({ type: 'gauge' })]);

            const result = presenter.make({ id: 'INV-1' })
                .uiBlock('mermaid', '```mermaid\ngraph TD\n```')
                .build();

            // Data + echarts UI + mermaid UI = 3 blocks
            expect(result.content.length).toBe(3);
            expect(result.content[1].text).toContain('echarts');
            expect(result.content[2].text).toContain('mermaid');
        });
    });

    describe('reusability — same Presenter, multiple calls', () => {
        it('should be reusable across multiple make() calls', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .systemRules(['Format currency correctly']);

            const r1 = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'paid' }).build();
            const r2 = presenter.make({ id: 'INV-2', amount_cents: 200, status: 'pending' }).build();

            expect(JSON.parse(r1.content[0].text).id).toBe('INV-1');
            expect(JSON.parse(r2.content[0].text).id).toBe('INV-2');

            // Both should have rules
            expect(r1.content[1].text).toContain('Format currency');
            expect(r2.content[1].text).toContain('Format currency');
        });
    });

    describe('no schema — unvalidated presenter', () => {
        it('should work without a schema (pass-through)', () => {
            const presenter = createPresenter('Generic')
                .systemRules(['Always be polite']);

            const result = presenter.make({ anything: 'goes' }).build();
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.anything).toBe('goes');
            expect(result.content[1].text).toContain('Always be polite');
        });
    });

    describe('.collectionSuggestActions() — collection-level suggestions', () => {
        it('should aggregate suggestions from all items in the collection', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .collectionSuggestActions((invoices) => [
                    invoices.some(i => i.status === 'pending')
                        ? { tool: 'billing.batch_pay', reason: 'Batch payment available' }
                        : null,
                    invoices.length > 1
                        ? { tool: 'billing.export', reason: 'Export all invoices' }
                        : null,
                ]);

            const data = [
                { id: 'INV-1', amount_cents: 45000, status: 'paid' as const },
                { id: 'INV-2', amount_cents: 12000, status: 'pending' as const },
            ];

            const result = presenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');

            expect(text).toContain('billing.batch_pay');
            expect(text).toContain('billing.export');
        });

        it('should filter null suggestions', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .collectionSuggestActions((invoices) => [
                    invoices.some(i => i.status === 'pending')
                        ? { tool: 'billing.batch_pay', reason: 'Pay all' }
                        : null,
                ]);

            // All paid — no suggestions
            const data = [
                { id: 'INV-1', amount_cents: 45000, status: 'paid' as const },
            ];

            const result = presenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).not.toContain('action_suggestions');
        });

        it('should prefer collectionSuggestActions over suggestActions for arrays', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .suggestActions(() => [
                    { tool: 'per_item_tool', reason: 'Should not appear' },
                ])
                .collectionSuggestActions((invoices) => [
                    { tool: 'batch_tool', reason: `Processing ${invoices.length} items` },
                ]);

            const data = [
                { id: 'INV-1', amount_cents: 100, status: 'paid' as const },
                { id: 'INV-2', amount_cents: 200, status: 'pending' as const },
            ];

            const result = presenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');

            expect(text).toContain('batch_tool');
            expect(text).not.toContain('per_item_tool');
        });

        it('should still use suggestActions for single items', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .suggestActions((inv) => [
                    { tool: 'item_tool', reason: `Status: ${inv.status}` },
                ])
                .collectionSuggestActions(() => [
                    { tool: 'batch_tool', reason: 'Should not appear for single' },
                ]);

            const result = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'paid' }).build();
            const text = result.content.map(c => c.text).join('\n');

            expect(text).toContain('item_tool');
            expect(text).not.toContain('batch_tool');
        });

        it('should work with fluent alias .collectionSuggest()', () => {
            const presenter = createPresenter('Invoice')
                .collectionSuggest((items) => [
                    { tool: 'alias_test', reason: `${items.length} items` },
                ]);

            const result = presenter.make([{ id: 'INV-1' }, { id: 'INV-2' }]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('alias_test');
        });
    });

    describe('.collectionRules() — collection-level system rules', () => {
        it('should inject static collection rules for arrays', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .collectionRules(['Display a total row at the bottom.']);

            const data = [
                { id: 'INV-1', amount_cents: 45000, status: 'paid' as const },
                { id: 'INV-2', amount_cents: 12000, status: 'pending' as const },
            ];

            const result = presenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('Display a total row at the bottom');
        });

        it('should not inject collection rules for single items', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .collectionRules(['This should NOT appear for single items.']);

            const result = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'paid' }).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).not.toContain('This should NOT appear');
        });

        it('should support dynamic collection rules with full array', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .collectionRules((invoices) => [
                    `Total: ${invoices.length} invoices.`,
                    invoices.some(i => i.status === 'pending')
                        ? '⚠️ Some invoices are still pending.'
                        : null,
                ]);

            const data = [
                { id: 'INV-1', amount_cents: 100, status: 'paid' as const },
                { id: 'INV-2', amount_cents: 200, status: 'pending' as const },
            ];

            const result = presenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('Total: 2 invoices');
            expect(text).toContain('Some invoices are still pending');
        });

        it('should merge per-item rules AND collection rules', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .systemRules(['CRITICAL: amounts in CENTS.'])
                .collectionRules(['Show a summary after the table.']);

            const data = [
                { id: 'INV-1', amount_cents: 100, status: 'paid' as const },
            ];

            const result = presenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('amounts in CENTS');
            expect(text).toContain('Show a summary after the table');
        });
    });

    describe('embed in collections — processes all array items', () => {
        it('should process embeds for all items in a collection', () => {
            const clientPresenter = createPresenter('Client')
                .systemRules(['Show client name in bold.']);

            const invoicePresenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .embed('client', clientPresenter);

            const data = [
                { id: 'INV-1', amount_cents: 100, status: 'paid' as const, client: { name: 'Alice' } },
                { id: 'INV-2', amount_cents: 200, status: 'pending' as const, client: { name: 'Bob' } },
            ];

            const result = invoicePresenter.make(data).build();
            const text = result.content.map(c => c.text).join('\n');

            // The child rules should appear (deduplicated)
            expect(text).toContain('Show client name in bold');
        });

        it('should deduplicate static rules from embeds across array items', () => {
            const clientPresenter = createPresenter('Client')
                .systemRules(['Format: bold client names.', 'Use 📋 for client sections.']);

            const invoicePresenter = createPresenter('Invoice')
                .embed('client', clientPresenter);

            const data = [
                { id: 'INV-1', client: { name: 'Alice' } },
                { id: 'INV-2', client: { name: 'Bob' } },
                { id: 'INV-3', client: { name: 'Charlie' } },
            ];

            const result = invoicePresenter.make(data).build();

            // Count how many blocks contain the rule text — should be exactly 1
            const ruleBlocks = result.content.filter(c =>
                c.text.includes('Format: bold client names'),
            );
            expect(ruleBlocks.length).toBe(1);
        });
    });
});
