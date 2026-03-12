/**
 * Tests for definePresenter() — Declarative Presenter API
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { definePresenter } from '../../src/presenter/definePresenter.js';
import { ui } from '../../src/presenter/ui.js';
import { isPresenter } from '../../src/presenter/Presenter.js';
import { MVA_META_SYMBOL, type MvaMeta } from '../../src/testing/MvaMetaSymbol.js';

describe('definePresenter', () => {
    it('should create a Presenter from a config object', () => {
        const presenter = definePresenter({
            name: 'Task',
            schema: z.object({ id: z.string(), title: z.string() }),
        });

        expect(isPresenter(presenter)).toBe(true);
        expect(presenter.name).toBe('Task');
    });

    it('should infer types from schema and build a response', () => {
        const presenter = definePresenter({
            name: 'Invoice',
            schema: z.object({
                id: z.string(),
                amount_cents: z.number(),
            }),
            rules: ['CRITICAL: in CENTS. Divide by 100.'],
            ui: (inv) => [ui.markdown(`Amount: ${inv.amount_cents / 100}`)],
        });

        const result = presenter.make({ id: 'inv-1', amount_cents: 5000 }).build();
        const textContent = result.content.map(c => c.text).join('\n');

        expect(textContent).toContain('"id": "inv-1"');
        expect(textContent).toContain('Amount: 50');
        expect(textContent).toContain('CRITICAL: in CENTS');
    });

    it('should support dynamic context-aware rules', () => {
        const presenter = definePresenter({
            name: 'User',
            schema: z.object({ name: z.string(), email: z.string() }),
            rules: (_user, ctx) => [
                (ctx as { role?: string })?.role !== 'admin' ? 'Mask email' : null,
            ],
        });

        const result = presenter.make({ name: 'Alice', email: 'a@b.com' }, { role: 'viewer' }).build();
        const text = result.content.map(c => c.text).join('\n');
        expect(text).toContain('Mask email');
    });

    it('should support collectionUi blocks', () => {
        const presenter = definePresenter({
            name: 'Task',
            schema: z.object({ title: z.string() }),
            collectionUi: (tasks) => [
                ui.summary(`${tasks.length} tasks found`),
            ],
        });

        const result = presenter.make([{ title: 'A' }, { title: 'B' }]).build();
        const text = result.content.map(c => c.text).join('\n');
        expect(text).toContain('2 tasks found');
    });

    it('should support agentLimit with truncation', () => {
        const presenter = definePresenter({
            name: 'Item',
            schema: z.object({ id: z.number() }),
            agentLimit: {
                max: 2,
                onTruncate: (n) => ui.summary(`${n} items hidden`),
            },
        });

        const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
        const result = presenter.make(items).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('3 items hidden');
    });

    it('should support suggestActions for HATEOAS hints', () => {
        const presenter = definePresenter({
            name: 'Order',
            schema: z.object({ status: z.string() }),
            suggestActions: (order) =>
                order.status === 'pending'
                    ? [{ tool: 'orders.approve', reason: 'Ready for approval' }]
                    : [],
        });

        const result = presenter.make({ status: 'pending' }).build();
        const text = result.content.map(c => c.text).join('\n');
        expect(text).toContain('orders.approve');
    });

    it('should support embeds for relational composition', () => {
        const childPresenter = definePresenter({
            name: 'Client',
            schema: z.object({ name: z.string() }),
            rules: ['Always show client name in bold.'],
        });

        const parentPresenter = definePresenter({
            name: 'Invoice',
            schema: z.object({ id: z.string() }),
            embeds: [{ key: 'client', presenter: childPresenter }],
        });

        const data = { id: 'inv-1', client: { name: 'Alice' } };
        const result = parentPresenter.make(data).build();
        const text = result.content.map(c => c.text).join('\n');

        expect(text).toContain('Always show client name in bold');
    });

    it('should work without a schema (untyped passthrough)', () => {
        const presenter = definePresenter({
            name: 'Raw',
            rules: ['Display raw data.'],
        });

        const result = presenter.make({ anything: true }).build();
        expect(result.content.length).toBeGreaterThan(0);
    });

    describe('collectionSuggestions — declarative config', () => {
        it('should wire collectionSuggestions into the Presenter', () => {
            const presenter = definePresenter({
                name: 'Order',
                schema: z.object({ id: z.string(), status: z.string() }),
                collectionSuggestions: (orders) => [
                    orders.some(o => o.status === 'pending')
                        ? { tool: 'orders.batch_approve', reason: 'Approve pending orders' }
                        : null,
                ],
            });

            const result = presenter.make([
                { id: '1', status: 'paid' },
                { id: '2', status: 'pending' },
            ]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('orders.batch_approve');
        });

        it('should not fire collectionSuggestions for single items', () => {
            const presenter = definePresenter({
                name: 'Order',
                schema: z.object({ id: z.string(), status: z.string() }),
                collectionSuggestions: () => [
                    { tool: 'batch_only', reason: 'Should not appear' },
                ],
            });

            const result = presenter.make({ id: '1', status: 'paid' }).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).not.toContain('batch_only');
        });

        it('should prefer collectionSuggestions over suggestActions for arrays', () => {
            const presenter = definePresenter({
                name: 'Order',
                schema: z.object({ id: z.string(), status: z.string() }),
                suggestActions: () => [
                    { tool: 'item_level', reason: 'per-item' },
                ],
                collectionSuggestions: (orders) => [
                    { tool: 'collection_level', reason: `Batch of ${orders.length}` },
                ],
            });

            const result = presenter.make([
                { id: '1', status: 'a' },
                { id: '2', status: 'b' },
            ]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('collection_level');
            expect(text).not.toContain('item_level');
        });
    });

    describe('collectionRules — declarative config', () => {
        it('should wire static collectionRules into the Presenter', () => {
            const presenter = definePresenter({
                name: 'Task',
                schema: z.object({ title: z.string(), done: z.boolean() }),
                collectionRules: ['Show a progress bar at the top.'],
            });

            const result = presenter.make([
                { title: 'A', done: true },
                { title: 'B', done: false },
            ]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('Show a progress bar at the top');
        });

        it('should wire dynamic collectionRules that receive full array', () => {
            const presenter = definePresenter({
                name: 'Task',
                schema: z.object({ title: z.string(), done: z.boolean() }),
                collectionRules: (tasks) => [
                    `Progress: ${tasks.filter(t => t.done).length}/${tasks.length} done.`,
                ],
            });

            const result = presenter.make([
                { title: 'A', done: true },
                { title: 'B', done: false },
                { title: 'C', done: true },
            ]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('Progress: 2/3 done');
        });

        it('should not inject collectionRules for single items', () => {
            const presenter = definePresenter({
                name: 'Task',
                schema: z.object({ title: z.string() }),
                collectionRules: ['COLLECTION ONLY RULE'],
            });

            const result = presenter.make({ title: 'Solo' }).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).not.toContain('COLLECTION ONLY RULE');
        });

        it('should merge per-item rules, Zod descriptions, and collectionRules', () => {
            const presenter = definePresenter({
                name: 'Invoice',
                schema: z.object({
                    amount: z.number().describe('CRITICAL: in CENTS'),
                }),
                rules: ['Format currency with $ prefix.'],
                collectionRules: ['Add a total row at the bottom.'],
            });

            const result = presenter.make([
                { amount: 100 },
                { amount: 200 },
            ]).build();
            const text = result.content.map(c => c.text).join('\n');

            // Zod description auto-rule
            expect(text).toContain('CRITICAL: in CENTS');
            // Per-item static rule
            expect(text).toContain('Format currency with $ prefix');
            // Collection rule
            expect(text).toContain('Add a total row at the bottom');
        });
    });

    describe('edge cases — robustness', () => {
        it('should handle empty array with collectionSuggestions gracefully', () => {
            const presenter = definePresenter({
                name: 'Empty',
                schema: z.object({ id: z.string() }),
                collectionSuggestions: () => [
                    { tool: 'should_not_appear', reason: 'Empty array' },
                ],
            });

            const result = presenter.make([]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).not.toContain('should_not_appear');
        });

        it('should handle empty array with collectionRules gracefully', () => {
            const presenter = definePresenter({
                name: 'Empty',
                schema: z.object({ id: z.string() }),
                collectionRules: (items) => [
                    `Count: ${items.length}`,
                ],
            });

            const result = presenter.make([]).build();
            // Empty array — collectionRules should still fire (isArray is true)
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('Count: 0');
        });

        it('should forward context to collectionSuggestions', () => {
            const presenter = definePresenter({
                name: 'Contextual',
                schema: z.object({ id: z.string() }),
                collectionSuggestions: (items, ctx) => [
                    (ctx as { admin?: boolean })?.admin
                        ? { tool: 'admin.bulk_delete', reason: 'Admin action' }
                        : null,
                ],
            });

            const result = presenter.make(
                [{ id: '1' }, { id: '2' }],
                { admin: true },
            ).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('admin.bulk_delete');

            // Without admin context — no suggestion
            const presenter2 = definePresenter({
                name: 'Contextual2',
                schema: z.object({ id: z.string() }),
                collectionSuggestions: (_items, ctx) => [
                    (ctx as { admin?: boolean })?.admin
                        ? { tool: 'admin.bulk_delete', reason: 'Admin action' }
                        : null,
                ],
            });
            const result2 = presenter2.make(
                [{ id: '1' }],
                { admin: false },
            ).build();
            const text2 = result2.content.map(c => c.text).join('\n');
            expect(text2).not.toContain('admin.bulk_delete');
        });

        it('should forward context to collectionRules', () => {
            const presenter = definePresenter({
                name: 'Contextual',
                schema: z.object({ id: z.string() }),
                collectionRules: (items, ctx) => [
                    (ctx as { locale?: string })?.locale === 'pt-BR'
                        ? 'Formate datas em DD/MM/YYYY.'
                        : 'Format dates as MM/DD/YYYY.',
                ],
            });

            const result = presenter.make(
                [{ id: '1' }],
                { locale: 'pt-BR' },
            ).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('DD/MM/YYYY');
        });

        it('should combine agentLimit + collectionRules + collectionSuggestions', () => {
            const presenter = definePresenter({
                name: 'Combined',
                schema: z.object({ id: z.number() }),
                agentLimit: {
                    max: 2,
                    onTruncate: (n) => ({ type: 'summary', content: `⚠️ ${n} hidden` }),
                },
                collectionRules: (items) => [
                    `Showing ${items.length} items.`,
                ],
                collectionSuggestions: (items) => [
                    items.length >= 2
                        ? { tool: 'data.paginate', reason: 'Load more results' }
                        : null,
                ],
            });

            const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
            const result = presenter.make(items).build();
            const text = result.content.map(c => c.text).join('\n');

            // agentLimit truncates to 2, so 3 hidden
            expect(text).toContain('3 hidden');
            // collectionRules sees the truncated array (2 items)
            expect(text).toContain('Showing 2 items');
            // collectionSuggestions sees the truncated array
            expect(text).toContain('data.paginate');
        });

        it('should handle single-item array (length 1) with collection features', () => {
            const presenter = definePresenter({
                name: 'SingleArray',
                schema: z.object({ status: z.string() }),
                collectionRules: (items) => [
                    `Found ${items.length} item(s).`,
                ],
                collectionSuggestions: (items) => [
                    { tool: 'batch_op', reason: `Batch of ${items.length}` },
                ],
            });

            const result = presenter.make([{ status: 'active' }]).build();
            const text = result.content.map(c => c.text).join('\n');
            expect(text).toContain('Found 1 item(s)');
            expect(text).toContain('Batch of 1');
        });
    });
});

