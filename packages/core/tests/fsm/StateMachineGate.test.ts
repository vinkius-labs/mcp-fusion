/**
 * FSM State Gate Tests — StateMachineGate, .bindState(), and integration
 *
 * Covers:
 * - StateMachineGate: constructor, bindTool, isToolAllowed, hasBindings, getTransitionEvent
 * - StateMachineGate: transition (manual fallback), snapshot/restore, onTransition
 * - FluentToolBuilder: .bindState() metadata propagation to GroupedToolBuilder
 * - GroupedToolBuilder: getFsmBinding(), getToolName()
 * - Integration: FSM gate filtering + execution + auto-transition
 * - Edge Cases: final states, invalid events, unbounded tools, empty FSM
 */
import { describe, it, expect, vi } from 'vitest';
import { initFusion } from '../../src/core/initFusion.js';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { success } from '../../src/core/response.js';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';
import type { FsmConfig, FsmSnapshot } from '../../src/fsm/StateMachineGate.js';

// ── Shared FSM Config ────────────────────────────────────

const checkoutConfig: FsmConfig = {
    id: 'checkout',
    initial: 'empty',
    states: {
        empty:     { on: { ADD_ITEM: 'has_items' } },
        has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
        payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
        confirmed: { type: 'final' },
    },
};

// ── Test Context ─────────────────────────────────────────

interface TestContext {
    userId: string;
}

// ============================================================================
// StateMachineGate — Constructor & Initial State
// ============================================================================

describe('StateMachineGate — Constructor', () => {
    it('should initialize with the correct initial state', () => {
        const gate = new StateMachineGate(checkoutConfig);
        expect(gate.currentState).toBe('empty');
    });

    it('should start with no bindings', () => {
        const gate = new StateMachineGate(checkoutConfig);
        expect(gate.hasBindings).toBe(false);
    });

    it('should accept config without an id', () => {
        const gate = new StateMachineGate({
            initial: 'idle',
            states: { idle: {}, active: {} },
        });
        expect(gate.currentState).toBe('idle');
    });
});

// ============================================================================
// StateMachineGate — Tool Binding
// ============================================================================

describe('StateMachineGate — bindTool', () => {
    it('should register a tool binding', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items']);
        expect(gate.hasBindings).toBe(true);
    });

    it('should be chainable', () => {
        const gate = new StateMachineGate(checkoutConfig);
        const result = gate.bindTool('cart_add', ['empty', 'has_items']);
        expect(result).toBe(gate);
    });

    it('should support multiple bindings', () => {
        const gate = new StateMachineGate(checkoutConfig)
            .bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM')
            .bindTool('cart_checkout', ['has_items'], 'CHECKOUT')
            .bindTool('cart_pay', ['payment'], 'PAY');

        expect(gate.hasBindings).toBe(true);
    });

    it('should override existing binding for same tool name', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty']);
        expect(gate.isToolAllowed('cart_add')).toBe(true);

        gate.bindTool('cart_add', ['payment']); // Override
        expect(gate.isToolAllowed('cart_add')).toBe(false); // empty != payment
    });
});

// ============================================================================
// StateMachineGate — isToolAllowed
// ============================================================================

describe('StateMachineGate — isToolAllowed', () => {
    it('should allow unbounded tools in any state', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items']);

        // 'cart_list' is not bound — always visible
        expect(gate.isToolAllowed('cart_list')).toBe(true);
    });

    it('should allow tools bound to the current state', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items']);

        expect(gate.isToolAllowed('cart_add')).toBe(true); // current: empty
    });

    it('should deny tools not bound to the current state', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_checkout', ['has_items']);

        expect(gate.isToolAllowed('cart_checkout')).toBe(false); // current: empty
    });

    it('should reflect state changes after transition', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');

        expect(gate.isToolAllowed('cart_checkout')).toBe(false); // empty

        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');
        expect(gate.isToolAllowed('cart_checkout')).toBe(true); // has_items
        expect(gate.isToolAllowed('cart_add')).toBe(true); // still visible
    });
});

// ============================================================================
// StateMachineGate — getTransitionEvent
// ============================================================================

describe('StateMachineGate — getTransitionEvent', () => {
    it('should return the transition event for a bound tool', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');

        expect(gate.getTransitionEvent('cart_add')).toBe('ADD_ITEM');
    });

    it('should return undefined for tools without a transition', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_view', ['empty', 'has_items']);

        expect(gate.getTransitionEvent('cart_view')).toBeUndefined();
    });

    it('should return undefined for unregistered tools', () => {
        const gate = new StateMachineGate(checkoutConfig);
        expect(gate.getTransitionEvent('whatever')).toBeUndefined();
    });
});

// ============================================================================
// StateMachineGate — getVisibleToolNames
// ============================================================================

describe('StateMachineGate — getVisibleToolNames', () => {
    it('should filter tool names by current state', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items']);
        gate.bindTool('cart_checkout', ['has_items']);
        gate.bindTool('cart_pay', ['payment']);

        const allTools = ['cart_add', 'cart_checkout', 'cart_pay', 'cart_list'];
        const visible = gate.getVisibleToolNames(allTools);

        expect(visible).toContain('cart_add');
        expect(visible).toContain('cart_list'); // ungated
        expect(visible).not.toContain('cart_checkout');
        expect(visible).not.toContain('cart_pay');
    });

    it('should return all tools when no bindings exist', () => {
        const gate = new StateMachineGate(checkoutConfig);
        const allTools = ['a', 'b', 'c'];

        expect(gate.getVisibleToolNames(allTools)).toEqual(['a', 'b', 'c']);
    });
});

// ============================================================================
// StateMachineGate — Transition (Manual Fallback)
// ============================================================================

describe('StateMachineGate — transition (manual fallback)', () => {
    it('should advance state on valid event', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        const result = await gate.transition('ADD_ITEM');

        expect(result.changed).toBe(true);
        expect(result.previousState).toBe('empty');
        expect(result.currentState).toBe('has_items');
        expect(gate.currentState).toBe('has_items');
    });

    it('should not change state on invalid event', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        const result = await gate.transition('INVALID_EVENT');

        expect(result.changed).toBe(false);
        expect(result.previousState).toBe('empty');
        expect(result.currentState).toBe('empty');
    });

    it('should handle multi-step workflow', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');

        await gate.transition('CHECKOUT');
        expect(gate.currentState).toBe('payment');

        await gate.transition('PAY');
        expect(gate.currentState).toBe('confirmed');
    });

    it('should handle backward transitions', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        expect(gate.currentState).toBe('payment');

        await gate.transition('CANCEL');
        expect(gate.currentState).toBe('has_items');
    });

    it('should not transition from a final state with no events', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        await gate.transition('PAY');
        expect(gate.currentState).toBe('confirmed');

        // Final state has type: 'final' and no 'on' events
        const result = await gate.transition('RESET');
        expect(result.changed).toBe(false);
        expect(result.currentState).toBe('confirmed');
    });

    it('should ignore events not defined in current state', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        // In 'empty', only ADD_ITEM is valid
        const result = await gate.transition('PAY');
        expect(result.changed).toBe(false);
        expect(gate.currentState).toBe('empty');
    });
});

// ============================================================================
// StateMachineGate — onTransition
// ============================================================================

describe('StateMachineGate — onTransition', () => {
    it('should fire callback on state change', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();
        gate.onTransition(spy);

        await gate.transition('ADD_ITEM');

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should not fire callback when state does not change', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();
        gate.onTransition(spy);

        await gate.transition('INVALID');

        expect(spy).not.toHaveBeenCalled();
    });

    it('should support multiple callbacks', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        gate.onTransition(spy1);
        gate.onTransition(spy2);

        await gate.transition('ADD_ITEM');

        expect(spy1).toHaveBeenCalledTimes(1);
        expect(spy2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe function should remove callback', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();
        const unsub = gate.onTransition(spy);

        unsub();

        await gate.transition('ADD_ITEM');
        expect(spy).not.toHaveBeenCalled();
    });
});

// ============================================================================
// StateMachineGate — Snapshot & Restore (Persistence)
// ============================================================================

describe('StateMachineGate — snapshot/restore', () => {
    it('snapshot() should capture current state and timestamp', () => {
        const gate = new StateMachineGate(checkoutConfig);

        const snap = gate.snapshot();
        expect(snap.state).toBe('empty');
        expect(snap.updatedAt).toBeLessThanOrEqual(Date.now());
        expect(snap.updatedAt).toBeGreaterThan(0);
    });

    it('restore() should set state from snapshot', () => {
        const gate = new StateMachineGate(checkoutConfig);

        const snap: FsmSnapshot = { state: 'payment', updatedAt: Date.now() };
        gate.restore(snap);

        expect(gate.currentState).toBe('payment');
    });

    it('restore() should ignore invalid states', () => {
        const gate = new StateMachineGate(checkoutConfig);

        gate.restore({ state: 'nonexistent', updatedAt: Date.now() });
        expect(gate.currentState).toBe('empty'); // unchanged
    });

    it('round-trip: snapshot → restore should preserve state', async () => {
        const gate1 = new StateMachineGate(checkoutConfig);
        await gate1.transition('ADD_ITEM');
        await gate1.transition('CHECKOUT');

        const snap = gate1.snapshot();
        expect(snap.state).toBe('payment');

        const gate2 = new StateMachineGate(checkoutConfig);
        gate2.restore(snap);
        expect(gate2.currentState).toBe('payment');

        // Can continue transitioning
        await gate2.transition('PAY');
        expect(gate2.currentState).toBe('confirmed');
    });
});

// ============================================================================
// StateMachineGate — dispose
// ============================================================================

describe('StateMachineGate — dispose', () => {
    it('should clear all transition callbacks', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();
        gate.onTransition(spy);

        gate.dispose();

        await gate.transition('ADD_ITEM');
        expect(spy).not.toHaveBeenCalled();
    });
});

// ============================================================================
// initFusion — f.fsm() factory
// ============================================================================

describe('initFusion — f.fsm()', () => {
    it('should create a StateMachineGate instance', () => {
        const f = initFusion<TestContext>();
        const gate = f.fsm(checkoutConfig);

        expect(gate).toBeInstanceOf(StateMachineGate);
        expect(gate.currentState).toBe('empty');
    });

    it('should create independent instances', () => {
        const f = initFusion<TestContext>();
        const gate1 = f.fsm(checkoutConfig);
        const gate2 = f.fsm(checkoutConfig);

        gate1.bindTool('a', ['empty']);
        expect(gate1.hasBindings).toBe(true);
        expect(gate2.hasBindings).toBe(false);
    });
});

// ============================================================================
// FluentToolBuilder — .bindState() propagation
// ============================================================================

describe('FluentToolBuilder — .bindState()', () => {
    it('should propagate FSM states to GroupedToolBuilder', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('cart.add_item')
            .describe('Add item to cart')
            .bindState(['empty', 'has_items'], 'ADD_ITEM')
            .handle(async () => success('ok'));

        const binding = tool.getFsmBinding();
        expect(binding).toBeDefined();
        expect(binding!.states).toEqual(['empty', 'has_items']);
        expect(binding!.transition).toBe('ADD_ITEM');
    });

    it('should propagate without transition event', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('cart.view')
            .describe('View cart contents')
            .bindState(['empty', 'has_items', 'payment'])
            .handle(async () => success([]));

        const binding = tool.getFsmBinding();
        expect(binding).toBeDefined();
        expect(binding!.states).toEqual(['empty', 'has_items', 'payment']);
        expect(binding!.transition).toBeUndefined();
    });

    it('should return undefined when no bindState is called', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('users.list')
            .describe('List users')
            .handle(async () => success([]));

        const binding = tool.getFsmBinding();
        expect(binding).toBeUndefined();
    });

    it('should support single state string', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('cart.pay')
            .describe('Process payment')
            .bindState('payment', 'PAY')
            .handle(async () => success('paid'));

        const binding = tool.getFsmBinding();
        expect(binding).toBeDefined();
        expect(binding!.states).toEqual(['payment']);
        expect(binding!.transition).toBe('PAY');
    });

    it('should be chainable with other fluent methods', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('cart.add_item')
            .describe('Add item to cart')
            .tags('cart', 'shopping')
            .bindState(['empty', 'has_items'], 'ADD_ITEM')
            .withString('item_id', 'Product ID')
            .handle(async (input) => success({ added: input.item_id }));

        // Verify all fluent methods worked
        expect(tool.getTags()).toContain('cart');
        expect(tool.getFsmBinding()!.states).toEqual(['empty', 'has_items']);

        const def = tool.buildToolDefinition();
        expect(def.name).toBe('cart');
    });

    it('.bindState() should coexist with .invalidates() and .cached()', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('cart.add_item')
            .describe('Add item')
            .bindState(['empty', 'has_items'], 'ADD_ITEM')
            .invalidates('cart.*')
            .handle(async () => success('ok'));

        // Both should work
        expect(tool.getFsmBinding()!.states).toEqual(['empty', 'has_items']);

        const hints = tool.getStateSyncHints();
        expect(hints.get('*')!.invalidates).toEqual(['cart.*']);
    });
});

// ============================================================================
// GroupedToolBuilder — .bindState()
// ============================================================================

describe('GroupedToolBuilder — .bindState()', () => {
    it('should store FSM binding on GroupedToolBuilder', () => {
        const tool = createTool<TestContext>('cart')
            .bindState(['empty', 'has_items'], 'ADD_ITEM')
            .action({
                name: 'add_item',
                handler: async () => success('ok'),
            });

        const binding = tool.getFsmBinding();
        expect(binding).toBeDefined();
        expect(binding!.states).toEqual(['empty', 'has_items']);
        expect(binding!.transition).toBe('ADD_ITEM');
    });

    it('.getToolName() should return the tool name', () => {
        const tool = createTool<TestContext>('cart')
            .action({
                name: 'add_item',
                handler: async () => success('ok'),
            });

        expect(tool.getToolName()).toBe('cart');
    });

    it('.bindState() should throw after freeze', () => {
        const tool = createTool<TestContext>('cart')
            .action({
                name: 'list',
                handler: async () => success([]),
            });

        tool.buildToolDefinition();

        expect(() => tool.bindState(['empty'])).toThrow(/frozen|sealed/i);
    });

    it('.getFsmBinding() should return undefined when not set', () => {
        const tool = createTool<TestContext>('users')
            .action({
                name: 'list',
                handler: async () => success([]),
            });

        expect(tool.getFsmBinding()).toBeUndefined();
    });
});

// ============================================================================
// Integration — Full Workflow Simulation
// ============================================================================

describe('Integration — FSM State Gate Workflow', () => {
    it('should gate tools through a complete checkout flow', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        // Bind tools to states
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate.bindTool('cart_pay', ['payment'], 'PAY');
        gate.bindTool('cart_clear', ['has_items'], 'CLEAR');

        const allTools = ['cart_add', 'cart_checkout', 'cart_pay', 'cart_clear', 'cart_view'];

        // State: empty
        let visible = gate.getVisibleToolNames(allTools);
        expect(visible).toEqual(['cart_add', 'cart_view']);

        // Transition: ADD_ITEM → has_items
        await gate.transition('ADD_ITEM');
        visible = gate.getVisibleToolNames(allTools);
        expect(visible).toEqual(['cart_add', 'cart_checkout', 'cart_clear', 'cart_view']);
        expect(visible).not.toContain('cart_pay');

        // Transition: CHECKOUT → payment
        await gate.transition('CHECKOUT');
        visible = gate.getVisibleToolNames(allTools);
        expect(visible).toEqual(['cart_pay', 'cart_view']);
        expect(visible).not.toContain('cart_add');
        expect(visible).not.toContain('cart_checkout');

        // Transition: PAY → confirmed (final)
        await gate.transition('PAY');
        visible = gate.getVisibleToolNames(allTools);
        expect(visible).toEqual(['cart_view']); // Only ungated tools
    });

    it('should handle the CANCEL flow (backward transition)', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate.bindTool('cart_pay', ['payment'], 'PAY');
        gate.bindTool('cart_cancel', ['payment'], 'CANCEL');

        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        expect(gate.currentState).toBe('payment');

        // Cancel goes back
        await gate.transition('CANCEL');
        expect(gate.currentState).toBe('has_items');
        expect(gate.isToolAllowed('cart_checkout')).toBe(true);
        expect(gate.isToolAllowed('cart_pay')).toBe(false);
    });

    it('should support serverless round-trip (snapshot + restore + gate)', async () => {
        // Simulate request 1: add item
        const gate1 = new StateMachineGate(checkoutConfig);
        gate1.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate1.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');

        await gate1.transition('ADD_ITEM');
        const snap = gate1.snapshot();

        // Simulate request 2: restore and continue
        const gate2 = new StateMachineGate(checkoutConfig);
        gate2.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate2.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate2.restore(snap);

        expect(gate2.currentState).toBe('has_items');
        expect(gate2.isToolAllowed('cart_checkout')).toBe(true);

        await gate2.transition('CHECKOUT');
        expect(gate2.currentState).toBe('payment');
    });

    it('should fire onTransition during workflow', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const transitions: string[] = [];

        gate.onTransition(() => {
            transitions.push(gate.currentState);
        });

        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        await gate.transition('PAY');

        expect(transitions).toEqual(['has_items', 'payment', 'confirmed']);
    });

    it('tools with .bindState() should still execute normally', async () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('cart.add_item')
            .describe('Add item to cart')
            .bindState(['empty', 'has_items'], 'ADD_ITEM')
            .withString('product_id', 'Product ID')
            .handle(async (input) => success({ added: input.product_id }));

        const ctx: TestContext = { userId: 'u-1' };
        const result = await tool.execute(ctx, {
            action: 'add_item',
            product_id: 'p-42',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('p-42');
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('FSM State Gate — Edge Cases', () => {
    it('single-state FSM should work', () => {
        const gate = new StateMachineGate({
            initial: 'active',
            states: { active: {} },
        });

        gate.bindTool('do_thing', ['active']);
        expect(gate.isToolAllowed('do_thing')).toBe(true);
    });

    it('all tools bound to one state should hide in other state', async () => {
        const gate = new StateMachineGate({
            initial: 'idle',
            states: {
                idle: { on: { START: 'running' } },
                running: { on: { STOP: 'idle' } },
            },
        });

        gate.bindTool('run_job', ['running']);
        gate.bindTool('stop_job', ['running']);

        expect(gate.isToolAllowed('run_job')).toBe(false);
        expect(gate.isToolAllowed('stop_job')).toBe(false);

        await gate.transition('START');
        expect(gate.isToolAllowed('run_job')).toBe(true);
        expect(gate.isToolAllowed('stop_job')).toBe(true);
    });

    it('empty tool list should not crash isToolAllowed', () => {
        const gate = new StateMachineGate(checkoutConfig);
        const visible = gate.getVisibleToolNames([]);
        expect(visible).toEqual([]);
    });

    it('binding to nonexistent states should not crash', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('ghost_tool', ['nonexistent_state']);

        // Tool is bound but current state 'empty' != 'nonexistent_state'
        expect(gate.isToolAllowed('ghost_tool')).toBe(false);
    });

    it('multiple rapid transitions should be deterministic', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        await gate.transition('CANCEL');
        await gate.transition('CHECKOUT');
        await gate.transition('PAY');

        expect(gate.currentState).toBe('confirmed');
    });

    it('snapshot should capture state after transitions', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');

        const snap = gate.snapshot();
        expect(snap.state).toBe('payment');
    });
});
