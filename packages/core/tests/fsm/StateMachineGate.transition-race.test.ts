/**
 * Bug Fix Regression: StateMachineGate.transition() race with XState subscriber
 *
 * BUG: `transition()` read `_currentState` immediately after `actor.send()`,
 * before the XState subscribe() callback had a chance to update it.
 * XState v5 dispatches subscribe() synchronously in most cases, but this is
 * not contractual. The result was `transition.changed === false` even when the
 * FSM state had changed, causing:
 *   - FSM snapshots not being persisted to fsmStore/fsmMemorySnapshots
 *   - `notifications/tools/list_changed` not being emitted
 *   - LLM session stuck in the wrong state
 *
 * FIX: `await Promise.resolve()` after `actor.send()` flushes any pending
 * microtasks (including the subscribe() callback) before reading `_currentState`.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';
import type { FsmConfig } from '../../src/fsm/StateMachineGate.js';

const config: FsmConfig = {
    id: 'transition-race-test',
    initial: 'empty',
    states: {
        empty:     { on: { ADD: 'has_items' } },
        has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
        payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
        confirmed: { type: 'final' },
    },
};

describe('Bug Fix Regression: StateMachineGate.transition() — changed flag correctness', () => {

    it('transition() returns changed=true when XState advances to a new state', async () => {
        const gate = new StateMachineGate(config);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD');

        const result = await gate.transition('ADD');

        // The subscriber must have run before we read currentState.
        // Without the await Promise.resolve() fix this could return false.
        expect(result.changed).toBe(true);
        expect(result.previousState).toBe('empty');
        expect(result.currentState).toBe('has_items');
        expect(gate.currentState).toBe('has_items');
    });

    it('transition() returns changed=false for unknown events', async () => {
        const gate = new StateMachineGate(config);

        const result = await gate.transition('NONEXISTENT_EVENT');

        expect(result.changed).toBe(false);
        expect(result.previousState).toBe('empty');
        expect(result.currentState).toBe('empty');
    });

    it('transition() currentState is consistent with gate.currentState after call', async () => {
        const gate = new StateMachineGate(config);
        gate.bindTool('add', ['empty', 'has_items'], 'ADD');

        const r1 = await gate.transition('ADD');
        expect(r1.currentState).toBe(gate.currentState);

        const r2 = await gate.transition('CHECKOUT');
        expect(r2.currentState).toBe(gate.currentState);
    });

    it('onTransition callback is triggered before transition() resolves', async () => {
        const gate = new StateMachineGate(config);
        const callbackOrder: string[] = [];

        gate.onTransition(() => callbackOrder.push('callback'));

        const result = await gate.transition('ADD');

        // The callback fires synchronously within subscribe(), then we await
        // a microtask before reading state. The callback MUST have fired
        // before transition() returned.
        expect(result.changed).toBe(true);
        expect(callbackOrder).toContain('callback');
    });

    it('multiple sequential transitions all report changed correctly', async () => {
        const gate = new StateMachineGate(config);

        const r1 = await gate.transition('ADD');
        expect(r1.changed).toBe(true);
        expect(r1.currentState).toBe('has_items');

        const r2 = await gate.transition('CHECKOUT');
        expect(r2.changed).toBe(true);
        expect(r2.currentState).toBe('payment');

        const r3 = await gate.transition('PAY');
        expect(r3.changed).toBe(true);
        expect(r3.currentState).toBe('confirmed');
    });

    it('transition.changed is true even when result is read synchronously', async () => {
        // This test simulates the scenario where ServerAttachment reads
        // transition.changed immediately after awaiting transition().
        // The bug would manifest as 'changed' being false here.
        const gate = new StateMachineGate(config);
        const snapshots: boolean[] = [];

        gate.bindTool('add', ['empty', 'has_items'], 'ADD');

        // Simulate ServerAttachment: check changed immediately
        const transition = await gate.transition('ADD');
        if (transition.changed) {
            snapshots.push(true); // Would trigger fsmStore.save() in real code
        }

        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toBe(true);
    });

    it('transition after restore() reports changed correctly', async () => {
        // Test the path where restore() sets a non-initial state and then
        // transition() advances from that restored state.
        const original = new StateMachineGate(config);
        await original.init();

        // Clone starts uninitialized — first transition triggers fresh init
        const clone = original.clone();

        // Restore to an intermediate state
        clone.restore({ state: 'has_items', updatedAt: Date.now() });
        expect(clone.currentState).toBe('has_items');

        // Transition from the restored state — changed must reflect reality
        const result = await clone.transition('CLEAR');

        expect(result.changed).toBe(true);
        expect(result.previousState).toBe('has_items');
        expect(result.currentState).toBe('empty');
    });
});
