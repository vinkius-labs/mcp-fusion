/**
 * Presenter E2E Tests
 *
 * Full-pipeline integration tests exercising:
 * createTool → action(returns: Presenter) → registry.routeCall → multi-block ToolResponse
 *
 * Also verifies backward compatibility and manual ResponseBuilder usage.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success } from '../../src/core/response.js';
import { response } from '../../src/presenter/ResponseBuilder.js';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { ui } from '../../src/presenter/ui.js';

// ── Fixtures ─────────────────────────────────────────────

interface AppContext {
    userId: string;
}

function createCtx(): AppContext {
    return { userId: 'u_test' };
}

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending']),
});

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules([
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
        'Format: $XX,XXX.00. Emojis: ✅ Paid, ⚠️ Pending.',
    ])
    .uiBlocks((invoice: { id: string; amount_cents: number; status: string }) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
    ])
    .collectionUiBlocks((invoices: Array<{ id: string; amount_cents: number; status: string }>) => [
        ui.echarts({
            xAxis: { data: invoices.map(i => i.id) },
            series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
        }),
    ]);

// ============================================================================
// E2E: Presenter Pipeline — Single Item
// ============================================================================

describe('E2E: Presenter Pipeline — Single Item', () => {
    it('should pipe raw handler return through Presenter and produce multi-block response', async () => {
        const tool = createTool<AppContext>('invoices')
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                returns: InvoicePresenter,
                handler: async (_ctx, args) => {
                    // Handler returns RAW DATA — not ToolResponse
                    return { id: args.id, amount_cents: 450000, status: 'paid' };
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'invoices', {
            action: 'get', id: 'INV-123',
        });

        // Should have: data + UI (echarts) + rules = 3 blocks
        expect(result.content.length).toBeGreaterThanOrEqual(3);

        // Block 1: Data (JSON)
        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe('INV-123');
        expect(data.amount_cents).toBe(450000);
        expect(data.status).toBe('paid');

        // Block 2: UI (echarts)
        expect(result.content[1].text).toContain('echarts');
        expect(result.content[1].text).toContain('4500'); // 450000/100

        // Block 3: Rules
        const rulesBlock = result.content.find(c => c.text.includes('domain_rules'));
        expect(rulesBlock).toBeDefined();
        expect(rulesBlock!.text).toContain('CENTS');
        expect(rulesBlock!.text).toContain('$XX,XXX.00');
    });
});

// ============================================================================
// E2E: Presenter Pipeline — Collection
// ============================================================================

describe('E2E: Presenter Pipeline — Collection', () => {
    it('should use collectionUiBlocks for array returns', async () => {
        const tool = createTool<AppContext>('invoices')
            .action({
                name: 'list',
                returns: InvoicePresenter,
                handler: async () => {
                    return [
                        { id: 'INV-1', amount_cents: 10000, status: 'paid' },
                        { id: 'INV-2', amount_cents: 20000, status: 'pending' },
                    ];
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'invoices', { action: 'list' });

        // Block 1: Data (JSON array)
        const data = JSON.parse(result.content[0].text);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(2);

        // Block 2: Aggregated bar chart (not 2 individual ones)
        expect(result.content[1].text).toContain('bar');
        expect(result.content[1].text).toContain('INV-1');
        expect(result.content[1].text).toContain('INV-2');
    });
});

// ============================================================================
// E2E: Backward Compatibility
// ============================================================================

describe('E2E: Backward Compatibility', () => {
    it('should work identically for tools WITHOUT returns (classic handler)', async () => {
        const tool = createTool<AppContext>('classic')
            .action({
                name: 'ping',
                handler: async () => success('pong from classic handler'),
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'classic', { action: 'ping' });
        expect(result.content).toHaveLength(1);
        expect(result.content[0].text).toBe('pong from classic handler');
        expect(result.isError).toBeUndefined();
    });

    it('should coexist: Presenter tools and classic tools in same registry', async () => {
        const classicTool = createTool<AppContext>('classic')
            .action({
                name: 'ping',
                handler: async () => success('classic pong'),
            });

        const presenterTool = createTool<AppContext>('invoices')
            .action({
                name: 'get',
                returns: InvoicePresenter,
                handler: async () => ({ id: 'INV-1', amount_cents: 100, status: 'paid' }),
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(classicTool);
        registry.register(presenterTool);

        const classicResult = await registry.routeCall(createCtx(), 'classic', { action: 'ping' });
        expect(classicResult.content[0].text).toBe('classic pong');

        const presenterResult = await registry.routeCall(createCtx(), 'invoices', { action: 'get' });
        expect(presenterResult.content.length).toBeGreaterThan(1);
    });
});

// ============================================================================
// E2E: Manual ResponseBuilder in Handler
// ============================================================================

describe('E2E: Manual ResponseBuilder usage', () => {
    it('should handle ResponseBuilder returned from handler (auto-build)', async () => {
        const tool = createTool<AppContext>('manual')
            .action({
                name: 'rich',
                handler: async () => {
                    return response({ custom: 'data' })
                        .llmHint('This is a manual hint')
                        .uiBlock('mermaid', ui.mermaid('graph TD; A-->B').content)
                        .build();
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'manual', { action: 'rich' });

        // Data + UI + Hints = 3 blocks
        expect(result.content.length).toBe(3);
        expect(JSON.parse(result.content[0].text)).toEqual({ custom: 'data' });
        expect(result.content[1].text).toContain('mermaid');
        expect(result.content[2].text).toContain('manual hint');
    });

    it('should auto-build ResponseBuilder if handler forgets to call .build()', async () => {
        const tool = createTool<AppContext>('auto')
            .action({
                name: 'lazy',
                handler: async () => {
                    // Returns ResponseBuilder WITHOUT calling .build()
                    return response('auto-built');
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'auto', { action: 'lazy' });
        expect(result.content[0].text).toBe('auto-built');
    });
});

// ============================================================================
// E2E: Override — handler with Presenter but returns ToolResponse directly
// ============================================================================

describe('E2E: Presenter Override', () => {
    it('should respect direct ToolResponse even when Presenter is configured', async () => {
        const SimplePresenter = createPresenter('Simple')
            .systemRules(['This rule should NOT appear']);

        const tool = createTool<AppContext>('override')
            .action({
                name: 'manual',
                returns: SimplePresenter,
                handler: async () => {
                    // Handler explicitly returns ToolResponse — bypasses Presenter
                    return success('I bypassed the Presenter');
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'override', { action: 'manual' });
        expect(result.content).toHaveLength(1);
        expect(result.content[0].text).toBe('I bypassed the Presenter');
    });
});
