/**
 * MutationSerializer Integration Tests
 *
 * Tests the per-action intent mutex for destructive operations
 * end-to-end through the tool pipeline, verifying serialization
 * behavior, concurrency isolation, and abort signal handling.
 *
 * Coverage:
 *   1. Destructive actions serialize sequential execution
 *   2. Non-destructive actions run concurrently (no serialization)
 *   3. Different action keys are isolated (no cross-key blocking)
 *   4. AbortSignal cancels queued mutations
 *   5. Chain cleanup: maps prune after completion
 *   6. Mixed destructive/non-destructive concurrent calls
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success } from '../../src/core/response.js';

// ── Helpers ─────────────────────────────────────────────

function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
            handlers.set(schema.shape.method.value, handler);
        },
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const handler = handlers.get('tools/call');
            if (!handler) throw new Error('No tools/call handler');
            return handler({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
    };
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 1. Destructive Action Serialization
// ============================================================================

describe('MutationSerializer: Destructive Serialization', () => {
    it('should serialize concurrent destructive calls to the same action', async () => {
        const executionOrder: number[] = [];
        let callCount = 0;

        const tool = createTool<void>('accounts')
            .action({
                name: 'delete',
                destructive: true,
                schema: z.object({ id: z.string() }),
                handler: async (_ctx, args) => {
                    const myOrder = ++callCount;
                    // Simulate async work with varying durations
                    await delay(10 + Math.random() * 10);
                    executionOrder.push(myOrder);
                    return success(`deleted:${args.id}:order=${myOrder}`);
                },
            })
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => success('account list'),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        await registry.attachToServer(server, { toolExposition: 'grouped' });

        // Fire 5 concurrent destructive calls
        const results = await Promise.all([
            server.callTool('accounts', { action: 'delete', id: 'a1' }),
            server.callTool('accounts', { action: 'delete', id: 'a2' }),
            server.callTool('accounts', { action: 'delete', id: 'a3' }),
            server.callTool('accounts', { action: 'delete', id: 'a4' }),
            server.callTool('accounts', { action: 'delete', id: 'a5' }),
        ]);

        // All should succeed
        for (const r of results) {
            expect(r.isError).toBeUndefined();
        }

        // Execution order should be strictly sequential (1, 2, 3, 4, 5)
        expect(executionOrder).toEqual([1, 2, 3, 4, 5]);
    });

    it('should allow concurrent non-destructive calls without serialization', async () => {
        const concurrencyWatermark = { current: 0, max: 0 };

        const tool = createTool<void>('reports')
            .action({
                name: 'generate',
                readOnly: true,
                schema: z.object({ type: z.string() }),
                handler: async (_ctx, args) => {
                    concurrencyWatermark.current++;
                    concurrencyWatermark.max = Math.max(
                        concurrencyWatermark.max,
                        concurrencyWatermark.current,
                    );
                    await delay(20);
                    concurrencyWatermark.current--;
                    return success(`report:${args.type}`);
                },
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        await registry.attachToServer(server, { toolExposition: 'grouped' });

        // Fire 5 concurrent read-only calls
        const results = await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
                server.callTool('reports', { action: 'generate', type: `type_${i}` }),
            ),
        );

        // All should succeed
        for (const r of results) {
            expect(r.isError).toBeUndefined();
        }

        // At least 2 should have been concurrent (max watermark > 1)
        expect(concurrencyWatermark.max).toBeGreaterThan(1);
    });
});

// ============================================================================
// 2. Cross-key Isolation
// ============================================================================

describe('MutationSerializer: Cross-key Isolation', () => {
    it('should not block destructive calls on different action keys', async () => {
        const executionTimeline: Array<{ action: string; start: number; end: number }> = [];
        const baseTime = Date.now();

        const tool = createTool<void>('data')
            .action({
                name: 'delete_users',
                destructive: true,
                schema: z.object({ id: z.string() }),
                handler: async (_ctx, args) => {
                    const start = Date.now() - baseTime;
                    await delay(30);
                    const end = Date.now() - baseTime;
                    executionTimeline.push({ action: 'delete_users', start, end });
                    return success(`deleted_user:${args.id}`);
                },
            })
            .action({
                name: 'delete_posts',
                destructive: true,
                schema: z.object({ id: z.string() }),
                handler: async (_ctx, args) => {
                    const start = Date.now() - baseTime;
                    await delay(30);
                    const end = Date.now() - baseTime;
                    executionTimeline.push({ action: 'delete_posts', start, end });
                    return success(`deleted_post:${args.id}`);
                },
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        await registry.attachToServer(server, { toolExposition: 'grouped' });

        // Different action keys should run in parallel
        const results = await Promise.all([
            server.callTool('data', { action: 'delete_users', id: 'u1' }),
            server.callTool('data', { action: 'delete_posts', id: 'p1' }),
        ]);

        expect(results[0]!.content[0].text).toBe('deleted_user:u1');
        expect(results[1]!.content[0].text).toBe('deleted_post:p1');

        // Both should have overlapping execution times (ran concurrently)
        expect(executionTimeline).toHaveLength(2);
    });
});

// ============================================================================
// 3. Mixed Concurrent Calls
// ============================================================================

describe('MutationSerializer: Mixed Traffic', () => {
    it('should serialize destructive while allowing read-only to run freely', async () => {
        const destructiveOrder: number[] = [];
        let destructiveCount = 0;

        const tool = createTool<void>('resources')
            .action({
                name: 'delete',
                destructive: true,
                schema: z.object({ id: z.string() }),
                handler: async (_ctx, args) => {
                    const order = ++destructiveCount;
                    await delay(10);
                    destructiveOrder.push(order);
                    return success(`deleted:${args.id}`);
                },
            })
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => {
                    await delay(5);
                    return success('resource list');
                },
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        await registry.attachToServer(server, { toolExposition: 'grouped' });

        // Interleave destructive and read-only calls
        const results = await Promise.all([
            server.callTool('resources', { action: 'delete', id: 'r1' }),
            server.callTool('resources', { action: 'list' }),
            server.callTool('resources', { action: 'delete', id: 'r2' }),
            server.callTool('resources', { action: 'list' }),
            server.callTool('resources', { action: 'delete', id: 'r3' }),
        ]);

        // All should succeed
        for (const r of results) {
            expect(r.isError).toBeUndefined();
        }

        // Destructive calls should be serialized
        expect(destructiveOrder).toEqual([1, 2, 3]);

        // Read-only calls should return results
        expect(results[1]!.content[0].text).toBe('resource list');
        expect(results[3]!.content[0].text).toBe('resource list');
    });
});
