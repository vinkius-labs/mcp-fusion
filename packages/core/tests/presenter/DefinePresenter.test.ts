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
});
