/**
 * Bug #51 — FusionClient.terminalCall — action field spread order
 *
 * THE BUG: `{ action: actionName, ...args }` — spread order places
 * `action` BEFORE `...args`. If the user's schema has a field named
 * `action`, the user's value overwrites the routing field. Server
 * routes to the wrong handler.
 *
 * WHY EXISTING TESTS MISSED IT: All FusionClient tests use schemas
 * without a field named `action`. No test ever verified that the
 * routing field takes precedence over user-supplied fields.
 *
 * THE FIX: Invert spread order: `{ ...args, action: actionName }`.
 */
import { describe, it, expect } from 'vitest';
import {
    createFusionClient,
    type FusionTransport,
} from '../../src/client/FusionClient.js';
import { success } from '../../src/core/response.js';
import type { ToolResponse } from '../../src/core/response.js';

function createCapturingTransport(): FusionTransport & {
    calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    return {
        calls,
        async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
            calls.push({ name, args });
            return success('ok');
        },
    };
}

describe('Bug #51: FusionClient routing field overwrite', () => {
    it('routing action field is NOT overwritten by user args', async () => {
        const transport = createCapturingTransport();
        const client = createFusionClient(transport);

        // User has a field named 'action' in their schema
        await client.execute('orders.create' as never, { action: 'userValue', name: 'test' } as never);

        // The transport should receive the routing action, not the user's
        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0]!.name).toBe('orders');
        expect(transport.calls[0]!.args.action).toBe('create');
    });

    it('user args are preserved alongside routing field', async () => {
        const transport = createCapturingTransport();
        const client = createFusionClient(transport);

        await client.execute('orders.create' as never, { name: 'Widget', qty: 5 } as never);

        expect(transport.calls[0]!.args).toEqual({
            action: 'create',
            name: 'Widget',
            qty: 5,
        });
    });

    it('non-dotted actions pass args directly (no action field injected)', async () => {
        const transport = createCapturingTransport();
        const client = createFusionClient(transport);

        await client.execute('simple-tool' as never, { x: 1 } as never);

        expect(transport.calls[0]!.name).toBe('simple-tool');
        expect(transport.calls[0]!.args).toEqual({ x: 1 });
        expect(transport.calls[0]!.args.action).toBeUndefined();
    });

    it('action field consistently wins even with deeply nested args', async () => {
        const transport = createCapturingTransport();
        const client = createFusionClient(transport);

        const complexArgs = {
            action: 'malicious-override',
            data: { nested: true },
            config: { action: 'another-override' },
        };

        await client.execute('tool.run' as never, complexArgs as never);

        // Top-level action must be the routing action
        expect(transport.calls[0]!.args.action).toBe('run');
        // Nested action is fine — it's inside an object, not top-level
        expect((transport.calls[0]!.args.config as Record<string, unknown>).action).toBe('another-override');
    });

    it('multiple dots use first segment as tool and rest as action', async () => {
        const transport = createCapturingTransport();
        const client = createFusionClient(transport);

        await client.execute('ns.tool.action' as never, { x: 1 } as never);

        expect(transport.calls[0]!.name).toBe('ns');
        expect(transport.calls[0]!.args.action).toBe('tool.action');
    });

    it('empty args with action routing works', async () => {
        const transport = createCapturingTransport();
        const client = createFusionClient(transport);

        await client.execute('orders.list' as never, {} as never);

        expect(transport.calls[0]!.args).toEqual({ action: 'list' });
    });
});
