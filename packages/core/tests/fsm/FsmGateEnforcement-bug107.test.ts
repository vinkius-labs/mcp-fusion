/**
 * Bug #107 Regression: FSM Gate must also enforce on tools/call
 *
 * BUG: The FSM State Gate only filtered tools from `tools/list`, but
 * `tools/call` dispatched without any `fsm.isToolAllowed()` check.
 * A client that knew a tool's name could bypass the FSM gate entirely.
 *
 * FIX: Added `fsm.isToolAllowed(name)` guard in `createToolCallHandler`
 * before dispatch. Returns `toolError('FORBIDDEN')` with self-healing
 * hints (current state, available tools).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';
import type { FsmConfig } from '../../src/fsm/StateMachineGate.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ── Helpers ──────────────────────────────────────────────

function createMockServer() {
    const handlers = new Map<unknown, (...args: unknown[]) => unknown>();
    const server = {
        setRequestHandler: (schema: unknown, handler: (...args: unknown[]) => unknown) => {
            handlers.set(schema, handler);
        },
    };
    return { server, handlers };
}

const orderWorkflow: FsmConfig = {
    id: 'order-workflow',
    initial: 'idle',
    states: {
        idle:     { on: { CREATE: 'created' } },
        created:  { on: { SHIP: 'shipped' } },
        shipped:  { type: 'final' },
    },
};

const orders = defineTool<void>('orders', {
    description: 'Order management',
    actions: {
        create: {
            handler: async () => 'order-created',
        },
        ship: {
            handler: async () => 'order-shipped',
        },
        list: {
            readOnly: true,
            handler: async () => 'orders-list',
        },
    },
});

// ── Tests ────────────────────────────────────────────────

describe('Bug #107: FSM gate enforcement on tools/call', () => {

    it('should reject a gated tool call when not in allowed state', async () => {
        const { server, handlers } = createMockServer();
        const registry = new ToolRegistry<void>();
        registry.register(orders);

        const fsm = new StateMachineGate(orderWorkflow);
        // orders_create is only allowed in 'idle' state
        // orders_ship is only allowed in 'created' state
        // orders_list is always visible (ungated)
        fsm.bindTool('orders_create', ['idle'], 'CREATE');
        fsm.bindTool('orders_ship', ['created'], 'SHIP');

        await registry.attachToServer(server, { fsm });

        const callHandler = handlers.get(CallToolRequestSchema) as Function;

        // In 'idle' state, calling 'orders_ship' should be rejected
        const result = await callHandler(
            { params: { name: 'orders_ship', arguments: { action: 'ship' } } },
            {},
        );

        expect(result.isError).toBe(true);
        const text = result.content[0].text as string;
        expect(text).toContain('FORBIDDEN');
        expect(text).toContain('orders_ship');
        expect(text).toContain('idle');
    });

    it('should allow a gated tool call when in the correct state', async () => {
        const { server, handlers } = createMockServer();
        const registry = new ToolRegistry<void>();
        registry.register(orders);

        const fsm = new StateMachineGate(orderWorkflow);
        fsm.bindTool('orders_create', ['idle'], 'CREATE');
        fsm.bindTool('orders_ship', ['created'], 'SHIP');

        await registry.attachToServer(server, { fsm });

        const callHandler = handlers.get(CallToolRequestSchema) as Function;

        // In 'idle' state, calling 'orders_create' should succeed
        const result = await callHandler(
            { params: { name: 'orders_create', arguments: { action: 'create' } } },
            {},
        );

        expect(result.isError).toBeFalsy();
    });

    it('should allow ungated tools regardless of FSM state', async () => {
        const { server, handlers } = createMockServer();
        const registry = new ToolRegistry<void>();
        registry.register(orders);

        const fsm = new StateMachineGate(orderWorkflow);
        // Only bind create and ship; list is ungated
        fsm.bindTool('orders_create', ['idle'], 'CREATE');
        fsm.bindTool('orders_ship', ['created'], 'SHIP');

        await registry.attachToServer(server, { fsm });

        const callHandler = handlers.get(CallToolRequestSchema) as Function;

        // 'orders_list' is ungated — should always work
        const result = await callHandler(
            { params: { name: 'orders_list', arguments: { action: 'list' } } },
            {},
        );

        expect(result.isError).toBeFalsy();
    });

    it('should include available tools in the rejection error', async () => {
        const { server, handlers } = createMockServer();
        const registry = new ToolRegistry<void>();
        registry.register(orders);

        const fsm = new StateMachineGate(orderWorkflow);
        fsm.bindTool('orders_create', ['idle'], 'CREATE');
        fsm.bindTool('orders_ship', ['created'], 'SHIP');

        await registry.attachToServer(server, { fsm });

        const callHandler = handlers.get(CallToolRequestSchema) as Function;

        // Call the gated 'orders_ship' while in 'idle' state
        const result = await callHandler(
            { params: { name: 'orders_ship', arguments: { action: 'ship' } } },
            {},
        );

        const text = result.content[0].text as string;
        // The error should suggest available tools
        expect(text).toContain('available_actions');
        // orders_create should be available (allowed in 'idle')
        expect(text).toContain('orders_create');
        // orders_list should be available (ungated)
        expect(text).toContain('orders_list');
    });

    it('tools/list should also hide FSM-gated tools (pre-existing behavior)', async () => {
        const { server, handlers } = createMockServer();
        const registry = new ToolRegistry<void>();
        registry.register(orders);

        const fsm = new StateMachineGate(orderWorkflow);
        fsm.bindTool('orders_create', ['idle'], 'CREATE');
        fsm.bindTool('orders_ship', ['created'], 'SHIP');

        await registry.attachToServer(server, { fsm });

        const listHandler = handlers.get(ListToolsRequestSchema) as Function;
        const { tools } = await listHandler({}, {});

        const toolNames = tools.map((t: { name: string }) => t.name);
        // In 'idle' state: orders_create (allowed), orders_list (ungated) visible
        // orders_ship (not allowed in 'idle') hidden
        expect(toolNames).toContain('orders_create');
        expect(toolNames).toContain('orders_list');
        expect(toolNames).not.toContain('orders_ship');
    });
});
