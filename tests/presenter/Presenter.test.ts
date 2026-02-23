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
});
