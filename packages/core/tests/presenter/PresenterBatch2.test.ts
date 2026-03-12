/**
 * Tests for Batch 2 MVA Improvements:
 *
 * - #7: UiBlock Metadata (layout hints via `meta`)
 * - #6: Presenter Composition via `extendPresenter()`
 * - #5: Async Callbacks via `makeAsync()`
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { definePresenter, extendPresenter } from '../../src/presenter/definePresenter.js';
import { ui } from '../../src/presenter/ui.js';
import { isPresenter } from '../../src/presenter/Presenter.js';
import type { UiBlockMeta } from '../../src/presenter/ui.js';

// ── Shared Schemas ──────────────────────────────────────

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
});

const taskSchema = z.object({
    title: z.string(),
    done: z.boolean(),
});

// ── #7: UiBlock Metadata ────────────────────────────────

describe('UiBlock Metadata (#7)', () => {
    describe('ui.* helpers — meta parameter', () => {
        it('should accept optional meta on ui.echarts()', () => {
            const block = ui.echarts(
                { series: [{ type: 'gauge', data: [{ value: 42 }] }] },
                { title: 'Revenue', width: 'full', priority: 1 },
            );
            expect(block.type).toBe('echarts');
            expect(block.meta).toEqual({ title: 'Revenue', width: 'full', priority: 1 });
        });

        it('should accept optional meta on ui.markdown()', () => {
            const block = ui.markdown('# Hello', { title: 'Greeting' });
            expect(block.type).toBe('markdown');
            expect(block.meta).toEqual({ title: 'Greeting' });
        });

        it('should accept optional meta on ui.mermaid()', () => {
            const block = ui.mermaid('graph TD; A-->B', { width: 'half' });
            expect(block.type).toBe('mermaid');
            expect(block.meta?.width).toBe('half');
        });

        it('should accept optional meta on ui.table()', () => {
            const block = ui.table(['A', 'B'], [['1', '2']], { priority: 5 });
            expect(block.type).toBe('markdown');
            expect(block.meta?.priority).toBe(5);
        });

        it('should accept optional meta on ui.summary()', () => {
            const block = ui.summary('3 items found', { title: 'Summary' });
            expect(block.type).toBe('summary');
            expect(block.meta?.title).toBe('Summary');
        });

        it('should accept optional meta on ui.codeBlock()', () => {
            const block = ui.codeBlock('xml', '<root/>', { width: 'quarter' });
            expect(block.type).toBe('xml');
            expect(block.meta?.width).toBe('quarter');
        });

        it('should accept optional meta on ui.list()', () => {
            const block = ui.list(['item1', 'item2'], { title: 'Checklist' });
            expect(block.type).toBe('markdown');
            expect(block.meta?.title).toBe('Checklist');
        });

        it('should accept optional meta on ui.json()', () => {
            const block = ui.json({ key: 'value' }, { priority: 10 });
            expect(block.type).toBe('json');
            expect(block.meta?.priority).toBe(10);
        });

        it('should produce no meta field when omitted', () => {
            const block = ui.echarts({ series: [] });
            expect(block.meta).toBeUndefined();
        });
    });

    describe('ResponseBuilder — XML attribute rendering', () => {
        it('should render meta as XML attributes on ui_passthrough', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .uiBlocks((inv: { id: string; amount_cents: number; status: string }) => [
                    ui.echarts(
                        { series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] },
                        { title: 'Revenue Chart', width: 'full', priority: 1 },
                    ),
                ]);

            const result = presenter.make({ id: 'INV-1', amount_cents: 50000, status: 'paid' }).build();
            const uiBlock = result.content.find(c => c.text.includes('ui_passthrough'));

            expect(uiBlock).toBeDefined();
            expect(uiBlock!.text).toContain('title="Revenue Chart"');
            expect(uiBlock!.text).toContain('width="full"');
            expect(uiBlock!.text).toContain('priority="1"');
            expect(uiBlock!.text).toContain('type="echarts"');
        });

        it('should render only type attribute when no meta is present', () => {
            const presenter = createPresenter('Invoice')
                .uiBlocks(() => [ui.markdown('Hello')]);

            const result = presenter.make({ id: 'INV-1' }).build();
            const uiBlock = result.content.find(c => c.text.includes('ui_passthrough'));

            expect(uiBlock).toBeDefined();
            expect(uiBlock!.text).toContain('type="markdown"');
            expect(uiBlock!.text).not.toContain('title=');
            expect(uiBlock!.text).not.toContain('width=');
            expect(uiBlock!.text).not.toContain('priority=');
        });

        it('should support partial meta (only some fields set)', () => {
            const presenter = createPresenter('Invoice')
                .uiBlocks(() => [ui.echarts({ series: [] }, { width: 'half' })]);

            const result = presenter.make({ id: 'INV-1' }).build();
            const uiBlock = result.content.find(c => c.text.includes('ui_passthrough'));

            expect(uiBlock!.text).toContain('width="half"');
            expect(uiBlock!.text).not.toContain('title=');
            expect(uiBlock!.text).not.toContain('priority=');
        });

        it('should render priority=0 correctly (falsy but valid)', () => {
            const presenter = createPresenter('Task')
                .uiBlocks(() => [ui.summary('test', { priority: 0 })]);

            const result = presenter.make({ title: 'A' }).build();
            const uiBlock = result.content.find(c => c.text.includes('ui_passthrough'));
            expect(uiBlock!.text).toContain('priority="0"');
        });
    });
});

// ── #6: extendPresenter() Composition ───────────────────

describe('extendPresenter() (#6)', () => {
    const BaseConfig = {
        rules: ['CRITICAL: amounts in CENTS. Divide by 100.'] as readonly string[],
        redactPII: { paths: ['*.ssn'] },
    };

    it('should create a valid Presenter from base + overrides', () => {
        const presenter = extendPresenter(BaseConfig, {
            name: 'Invoice',
            schema: invoiceSchema,
        });

        expect(isPresenter(presenter)).toBe(true);
        expect(presenter.name).toBe('Invoice');
    });

    it('should merge static rules additively', () => {
        const presenter = extendPresenter(BaseConfig, {
            name: 'Invoice',
            schema: invoiceSchema,
            rules: ['Format as currency.'],
        });

        const result = presenter.make({ id: 'INV-1', amount_cents: 1000, status: 'paid' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('in CENTS');       // base rule
        expect(text).toContain('Format as currency'); // override rule
    });

    it('should chain dynamic rules from base + override', () => {
        const base = {
            rules: (data: unknown) => [`Base rule for ${(data as { id: string }).id}`],
        };

        const presenter = extendPresenter(base, {
            name: 'Invoice',
            schema: invoiceSchema,
            rules: (data: { id: string }) => [`Override rule for ${data.id}`],
        });

        const result = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'paid' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('Base rule for INV-1');
        expect(text).toContain('Override rule for INV-1');
    });

    it('should chain static base + dynamic override', () => {
        const base = {
            rules: ['Static base rule'] as readonly string[],
        };

        const presenter = extendPresenter(base, {
            name: 'Invoice',
            schema: invoiceSchema,
            rules: (data: { status: string }) => [`Status: ${data.status}`],
        });

        const result = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'pending' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('Static base rule');
        expect(text).toContain('Status: pending');
    });

    it('should override UI when defined', () => {
        const base = {
            ui: () => [ui.summary('Base UI')],
        };

        const presenter = extendPresenter(base, {
            name: 'Invoice',
            schema: invoiceSchema,
            ui: (inv: { amount_cents: number }) => [ui.markdown(`$${inv.amount_cents / 100}`)],
        });

        const result = presenter.make({ id: 'INV-1', amount_cents: 5000, status: 'paid' }).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('$50');       // override UI
        expect(text).not.toContain('Base UI'); // base UI not used
    });

    it('should inherit base UI when override does not define it', () => {
        const base = {
            ui: () => [ui.summary('Base summary')],
        };

        const presenter = extendPresenter(base, {
            name: 'Invoice',
            schema: invoiceSchema,
        });

        const result = presenter.make({ id: 'INV-1', amount_cents: 100, status: 'paid' }).build();
        const text = result.content.map(c => c.text).join('\n');
        expect(text).toContain('Base summary');
    });

    it('should merge embeds additively', () => {
        const childA = definePresenter({ name: 'ChildA', rules: ['Rule from A'] });
        const childB = definePresenter({ name: 'ChildB', rules: ['Rule from B'] });

        const base = {
            embeds: [{ key: 'childA', presenter: childA }],
        };

        const presenter = extendPresenter(base, {
            name: 'Parent',
            schema: z.object({ id: z.string() }),
            embeds: [{ key: 'childB', presenter: childB }],
        });

        const data = { id: 'P-1', childA: { x: 1 }, childB: { y: 2 } };
        const result = presenter.make(data).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('Rule from A');
        expect(text).toContain('Rule from B');
    });

    it('should merge redactPII paths additively', () => {
        const base = {
            redactPII: { paths: ['*.ssn'] },
        };

        const presenter = extendPresenter(base, {
            name: 'User',
            schema: z.object({ name: z.string() }),
            redactPII: { paths: ['*.creditCard'] },
        });

        // The merged config should contain both paths
        // We verify via the getRedactPaths() introspection method
        expect(presenter.getRedactPaths()).toContain('*.ssn');
        expect(presenter.getRedactPaths()).toContain('*.creditCard');
    });

    it('should use only base rules when override has none', () => {
        const presenter = extendPresenter(BaseConfig, {
            name: 'Simple',
            schema: z.object({ id: z.string() }),
        });

        const result = presenter.make({ id: 'X-1' }).build();
        const text = result.content.map(c => c.text).join('\n');
        expect(text).toContain('in CENTS');
    });

    it('should override agentLimit when defined', () => {
        const base = {
            agentLimit: { max: 10, onTruncate: (n: number) => ui.summary(`${n} hidden (base)`) },
        };

        const presenter = extendPresenter(base, {
            name: 'Item',
            schema: z.object({ id: z.number() }),
            agentLimit: { max: 2, onTruncate: (n: number) => ui.summary(`${n} hidden (override)`) },
        });

        const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const result = presenter.make(items).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('2 hidden (override)');
        expect(text).not.toContain('hidden (base)');
    });

    it('should work without a schema (untyped passthrough)', () => {
        const base = { rules: ['Base rule'] as readonly string[] };

        const presenter = extendPresenter(base, {
            name: 'Raw',
        });

        const result = presenter.make({ anything: true }).build();
        const text = result.content.map(c => c.text).join('\n');
        expect(text).toContain('Base rule');
    });
});

// ── #5: Async Callbacks (makeAsync) ─────────────────────

describe('makeAsync() (#5)', () => {
    describe('fluent API configuration', () => {
        it('should configure asyncUiBlocks without errors', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .asyncUiBlocks(async (inv) => [ui.markdown(`Async: $${inv.amount_cents / 100}`)]);

            expect(presenter.hasAsyncCallbacks()).toBe(true);
        });

        it('should configure asyncRules without errors', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .asyncRules(async () => ['Async rule']);

            expect(presenter.hasAsyncCallbacks()).toBe(true);
        });

        it('should configure asyncSuggestActions without errors', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .asyncSuggestActions(async () => [{ tool: 'test', reason: 'async' }]);

            expect(presenter.hasAsyncCallbacks()).toBe(true);
        });

        it('should report hasAsyncCallbacks() = false when none configured', () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema);

            expect(presenter.hasAsyncCallbacks()).toBe(false);
        });

        it('should support method chaining for all async methods', () => {
            const presenter = createPresenter('Task')
                .schema(taskSchema)
                .asyncUiBlocks(async () => [])
                .asyncCollectionUiBlocks(async () => [])
                .asyncRules(async () => [])
                .asyncSuggestActions(async () => []);

            expect(presenter.hasAsyncCallbacks()).toBe(true);
        });
    });

    describe('makeAsync() — single item', () => {
        it('should include sync blocks AND async blocks', async () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .uiBlocks((inv: { amount_cents: number }) => [ui.summary(`Sync: $${inv.amount_cents / 100}`)])
                .asyncUiBlocks(async (inv) => [ui.markdown(`Async: $${inv.amount_cents / 100}`)]);

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 5000, status: 'paid' });
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).toContain('Sync: $50');  // sync UI
            expect(text).toContain('Async: $50'); // async UI
        });

        it('should include async rules in the response', async () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .systemRules(['Static rule'])
                .asyncRules(async (inv) => [`Payment status: ${inv.status}`]);

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'overdue' });
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).toContain('Static rule');
            expect(text).toContain('Payment status: overdue');
        });

        it('should include async suggestions in the response', async () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .asyncSuggestActions(async (inv) =>
                    inv.status === 'pending'
                        ? [{ tool: 'billing.pay', reason: 'Offer immediate payment' }]
                        : [],
                );

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'pending' });
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).toContain('billing.pay');
        });

        it('should filter null values from async UI blocks', async () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .asyncUiBlocks(async (inv) => [
                    inv.status === 'paid' ? ui.summary('Paid!') : null,
                    ui.markdown('Always here'),
                ]);

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'pending' });
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).not.toContain('Paid!');
            expect(text).toContain('Always here');
        });

        it('should filter null values from async suggestions', async () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .asyncSuggestActions(async () => [
                    null,
                    { tool: 'valid.tool', reason: 'This should appear' },
                ]);

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'paid' });
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).toContain('valid.tool');
        });
    });

    describe('makeAsync() — collection', () => {
        it('should use asyncCollectionUiBlocks for arrays', async () => {
            const presenter = createPresenter('Task')
                .schema(taskSchema)
                .asyncCollectionUiBlocks(async (tasks) => [
                    ui.summary(`${tasks.filter(t => t.done).length}/${tasks.length} completed`),
                ]);

            const data = [{ title: 'A', done: true }, { title: 'B', done: false }, { title: 'C', done: true }];
            const result = await presenter.makeAsync(data);
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).toContain('2/3 completed');
        });

        it('should not use asyncItemUiBlocks when data is an array', async () => {
            const presenter = createPresenter('Task')
                .schema(taskSchema)
                .asyncUiBlocks(async () => [ui.summary('Should NOT appear for arrays')]);

            const result = await presenter.makeAsync([{ title: 'A', done: true }]);
            const built = result.build();
            const text = built.content.map(c => c.text).join('\n');

            expect(text).not.toContain('Should NOT appear');
        });
    });

    describe('makeAsync() — without async callbacks', () => {
        it('should produce identical output to sync make()', async () => {
            const presenter = createPresenter('Invoice')
                .schema(invoiceSchema)
                .systemRules(['Static rule'])
                .uiBlocks((inv: { amount_cents: number }) => [ui.summary(`$${inv.amount_cents / 100}`)]);

            const data = { id: 'INV-1', amount_cents: 3000, status: 'paid' as const };

            const syncResult = presenter.make(data).build();
            const asyncResult = (await presenter.makeAsync(data)).build();

            // Both should produce the same content blocks count
            expect(asyncResult.content.length).toBe(syncResult.content.length);

            // Content texts should match
            for (let i = 0; i < syncResult.content.length; i++) {
                expect(asyncResult.content[i].text).toBe(syncResult.content[i].text);
            }
        });
    });

    describe('definePresenter — async config fields', () => {
        it('should wire asyncUi from config', async () => {
            const presenter = definePresenter({
                name: 'Invoice',
                schema: invoiceSchema,
                asyncUi: async (inv) => [ui.markdown(`Async: ${inv.id}`)],
            });

            expect(presenter.hasAsyncCallbacks()).toBe(true);

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'paid' });
            const text = result.build().content.map(c => c.text).join('\n');
            expect(text).toContain('Async: INV-1');
        });

        it('should wire asyncCollectionUi from config', async () => {
            const presenter = definePresenter({
                name: 'Task',
                schema: taskSchema,
                asyncCollectionUi: async (tasks) => [ui.summary(`${tasks.length} tasks (async)`)],
            });

            const result = await presenter.makeAsync([{ title: 'A', done: true }]);
            const text = result.build().content.map(c => c.text).join('\n');
            expect(text).toContain('1 tasks (async)');
        });

        it('should wire asyncRules from config', async () => {
            const presenter = definePresenter({
                name: 'Invoice',
                schema: invoiceSchema,
                asyncRules: async (inv) => [`Async rule for ${inv.id}`],
            });

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'paid' });
            const text = result.build().content.map(c => c.text).join('\n');
            expect(text).toContain('Async rule for INV-1');
        });

        it('should wire asyncSuggestActions from config', async () => {
            const presenter = definePresenter({
                name: 'Invoice',
                schema: invoiceSchema,
                asyncSuggestActions: async (inv) =>
                    inv.status === 'overdue'
                        ? [{ tool: 'billing.remind', reason: 'Send reminder' }]
                        : [],
            });

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'overdue' });
            const text = result.build().content.map(c => c.text).join('\n');
            expect(text).toContain('billing.remind');
        });
    });

    describe('extendPresenter — async callback inheritance', () => {
        it('should inherit asyncUi from base config', async () => {
            const base = {
                asyncUi: async (data: unknown) => [ui.summary(`Base async: ${(data as { id: string }).id}`)],
            };

            const presenter = extendPresenter(base, {
                name: 'Invoice',
                schema: invoiceSchema,
            });

            expect(presenter.hasAsyncCallbacks()).toBe(true);

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'paid' });
            const text = result.build().content.map(c => c.text).join('\n');
            expect(text).toContain('Base async: INV-1');
        });

        it('should override asyncUi when defined in overrides', async () => {
            const base = {
                asyncUi: async () => [ui.summary('Base async')],
            };

            const presenter = extendPresenter(base, {
                name: 'Invoice',
                schema: invoiceSchema,
                asyncUi: async (inv: { id: string }) => [ui.summary(`Override async: ${inv.id}`)],
            });

            const result = await presenter.makeAsync({ id: 'INV-1', amount_cents: 100, status: 'paid' });
            const text = result.build().content.map(c => c.text).join('\n');

            expect(text).toContain('Override async: INV-1');
            expect(text).not.toContain('Base async');
        });
    });
});
