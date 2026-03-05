/**
 * Regression tests for Bug #3:
 * Race condition — concurrent requests sharing mutable FSM state.
 *
 * The StateMachineGate instance was shared between all concurrent requests.
 * Two simultaneous requests could interleave restore() → transition() → save(),
 * corrupting the FSM state. Fixed by adding clone() method and using
 * per-request clones in serverless/edge handlers.
 */
import { describe, it, expect } from 'vitest';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';

const CHECKOUT_CONFIG = {
    id: 'checkout',
    initial: 'empty',
    states: {
        empty:     { on: { ADD_ITEM: 'has_items' } },
        has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
        payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
        confirmed: { type: 'final' as const },
    },
};

describe('StateMachineGate.clone() — Bug #3 Regression', () => {
    it('clone() creates an independent copy with same config', () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');

        const clone = gate.clone();
        expect(clone.currentState).toBe('empty');
        expect(clone.isToolAllowed('cart_add')).toBe(true);
        expect(clone.isToolAllowed('cart_checkout')).toBe(false);
    });

    it('clone state mutations do not affect the original', async () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');

        const clone = gate.clone();
        await clone.transition('ADD_ITEM');

        expect(clone.currentState).toBe('has_items');
        expect(gate.currentState).toBe('empty'); // original untouched
    });

    it('original state mutations do not affect the clone', async () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        const clone = gate.clone();

        await gate.transition('ADD_ITEM');

        expect(gate.currentState).toBe('has_items');
        expect(clone.currentState).toBe('empty'); // clone untouched
    });

    it('clone preserves restored state', () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');

        gate.restore({ state: 'has_items', updatedAt: Date.now() });
        const clone = gate.clone();

        expect(clone.currentState).toBe('has_items');
        expect(clone.isToolAllowed('cart_checkout')).toBe(true);
    });

    it('clone preserves all bindings including transition events', () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate.bindTool('cart_pay', ['payment'], 'PAY');

        const clone = gate.clone();

        expect(clone.getTransitionEvent('cart_add')).toBe('ADD_ITEM');
        expect(clone.getTransitionEvent('cart_checkout')).toBe('CHECKOUT');
        expect(clone.getTransitionEvent('cart_pay')).toBe('PAY');
        expect(clone.hasBindings).toBe(true);
    });

    it('concurrent clones do not interfere — simulates parallel requests', async () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate.bindTool('cart_pay', ['payment'], 'PAY');

        // Simulate two concurrent requests (serverless scenario)
        // Session A is at 'empty', Session B is at 'has_items'
        const cloneA = gate.clone();
        const cloneB = gate.clone();

        // Session B restores from store
        cloneB.restore({ state: 'has_items', updatedAt: Date.now() });

        // Concurrent transitions
        await cloneA.transition('ADD_ITEM');     // empty → has_items
        await cloneB.transition('CHECKOUT');     // has_items → payment

        // Each clone has independent state
        expect(cloneA.currentState).toBe('has_items');
        expect(cloneB.currentState).toBe('payment');
        expect(gate.currentState).toBe('empty'); // shared original untouched
    });

    it('clone snapshots are independent', async () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);

        const cloneA = gate.clone();
        const cloneB = gate.clone();

        cloneA.restore({ state: 'payment', updatedAt: Date.now() });
        await cloneB.transition('ADD_ITEM');

        const snapA = cloneA.snapshot();
        const snapB = cloneB.snapshot();

        expect(snapA.state).toBe('payment');
        expect(snapB.state).toBe('has_items');
    });

    it('clone tool visibility reflects cloned state, not original', () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        gate.bindTool('cart_add', ['empty', 'has_items']);
        gate.bindTool('cart_checkout', ['has_items']);
        gate.bindTool('cart_pay', ['payment']);

        // Clone from 'empty', restore to 'payment'
        const clone = gate.clone();
        clone.restore({ state: 'payment', updatedAt: Date.now() });

        const allTools = ['cart_add', 'cart_checkout', 'cart_pay', 'unrelated_tool'];
        const visibleOriginal = gate.getVisibleToolNames(allTools);
        const visibleClone = clone.getVisibleToolNames(allTools);

        expect(visibleOriginal).toEqual(['cart_add', 'unrelated_tool']);
        expect(visibleClone).toEqual(['cart_pay', 'unrelated_tool']);
    });

    it('clone starts uninitialized — no XState actor leaked', () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);
        const clone = gate.clone();

        // Clone should be disposable without error (no actor to stop)
        expect(() => clone.dispose()).not.toThrow();
    });

    it('multiple rapid clones from same gate all work independently', async () => {
        const gate = new StateMachineGate(CHECKOUT_CONFIG);

        const clones = Array.from({ length: 10 }, () => gate.clone());

        // Each clone transitions independently
        const results = await Promise.all(
            clones.map((c, i) => {
                if (i % 2 === 0) return c.transition('ADD_ITEM');
                return Promise.resolve({ changed: false, previousState: 'empty', currentState: 'empty' });
            }),
        );

        // Even-indexed clones moved, odd stayed
        clones.forEach((c, i) => {
            expect(c.currentState).toBe(i % 2 === 0 ? 'has_items' : 'empty');
        });

        // Original is still at 'empty'
        expect(gate.currentState).toBe('empty');
    });
});
