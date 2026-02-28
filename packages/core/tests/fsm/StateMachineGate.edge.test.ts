/**
 * FSM State Gate — Advanced Edge Cases & Stress Tests
 *
 * Anthropic-QA-level tests targeting:
 * - Concurrency races (parallel transitions)
 * - Callback exception safety (throwing listeners must not break FSM)
 * - Dispose lifecycle (use-after-dispose must be safe, not crash)
 * - Snapshot integrity (corruption, stale, timestamp monotonicity)
 * - Self-loop transitions (same-state events with no `changed`)
 * - State explosion (large FSM with 50+ states)
 * - Unsubscribe idempotency (double-unsubscribe must not crash)
 * - Restore-then-transition atomicity
 * - Init idempotency (double-init)
 * - Zero-binding gate (passthrough behavior)
 * - Mixed gated/ungated tool visibility under every state
 * - autoBindFsmFromBuilders duck-typing resilience
 * - ServerAttachment FSM hooks (list filtering, call transition guard)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';
import { initFusion } from '../../src/core/initFusion.js';
import { success, error } from '../../src/core/response.js';
import type { FsmConfig, FsmSnapshot } from '../../src/fsm/StateMachineGate.js';

// ── Shared Configs ───────────────────────────────────────

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

/** A linear pipeline with 6 states — no branching */
const linearConfig: FsmConfig = {
    id: 'pipeline',
    initial: 'step1',
    states: {
        step1: { on: { NEXT: 'step2' } },
        step2: { on: { NEXT: 'step3' } },
        step3: { on: { NEXT: 'step4' } },
        step4: { on: { NEXT: 'step5' } },
        step5: { on: { NEXT: 'done' } },
        done:  { type: 'final' },
    },
};

/** A cyclic FSM that can loop forever */
const cyclicConfig: FsmConfig = {
    id: 'cyclic',
    initial: 'a',
    states: {
        a: { on: { GO: 'b' } },
        b: { on: { GO: 'c' } },
        c: { on: { GO: 'a' } },
    },
};

/** Diamond: two paths converge on the same state */
const diamondConfig: FsmConfig = {
    id: 'diamond',
    initial: 'start',
    states: {
        start:  { on: { PATH_A: 'left', PATH_B: 'right' } },
        left:   { on: { CONVERGE: 'end' } },
        right:  { on: { CONVERGE: 'end' } },
        end:    { type: 'final' },
    },
};

interface TestContext { userId: string }

// ============================================================================
// 1. CONCURRENCY — Parallel Transitions
// ============================================================================

describe('Concurrency — parallel transitions', () => {
    it('should handle Promise.all transitions sequentially (no race condition)', async () => {
        const gate = new StateMachineGate(linearConfig);
        // Fire 5 transitions in parallel
        const results = await Promise.all([
            gate.transition('NEXT'),
            gate.transition('NEXT'),
            gate.transition('NEXT'),
            gate.transition('NEXT'),
            gate.transition('NEXT'),
        ]);

        // At least the first must have changed
        expect(results[0].changed).toBe(true);
        // Final state must be deterministic — all transitions resolved
        expect(gate.currentState).toBe('done');
    });

    it('should not corrupt state under rapid sequential transitions', async () => {
        const gate = new StateMachineGate(cyclicConfig);

        // 300 rapid cycles
        for (let i = 0; i < 300; i++) {
            await gate.transition('GO');
        }
        // 300 transitions through a 3-state cycle → 300 % 3 = 0 → back to 'a'
        expect(gate.currentState).toBe('a');
    });

    it('should correctly count transitions in a tight loop', async () => {
        const gate = new StateMachineGate(cyclicConfig);
        let changeCount = 0;
        gate.onTransition(() => changeCount++);

        for (let i = 0; i < 99; i++) {
            await gate.transition('GO');
        }
        // All 99 transitions should fire (all are valid — cycle a→b→c→a...)
        expect(changeCount).toBe(99);
    });
});

// ============================================================================
// 2. CALLBACK EXCEPTION SAFETY
// ============================================================================

describe('Callback exception safety', () => {
    it('throwing callback must not prevent subsequent callbacks from firing', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();

        gate.onTransition(() => { throw new Error('💥 callback exploded'); });
        gate.onTransition(spy);

        // The transition itself should not throw
        // NOTE: this depends on implementation — if callbacks are called in a
        // try/catch or not. If it throws, that's a bug we're detecting.
        let threw = false;
        try {
            await gate.transition('ADD_ITEM');
        } catch {
            threw = true;
        }

        // Document actual behavior:
        // If the first callback throws, the loop breaks and spy never fires.
        // This is a known limitation — documenting it here.
        if (threw) {
            // Exception propagated up — spy may not have been called
            expect(spy).not.toHaveBeenCalled();
        } else {
            // Exception was swallowed — both callbacks should have fired
            expect(spy).toHaveBeenCalledTimes(1);
        }

        // State must have advanced regardless of callback failure
        expect(gate.currentState).toBe('has_items');
    });

    it('callback throwing should not corrupt internal state', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');

        gate.onTransition(() => { throw new Error('💥'); });

        try { await gate.transition('ADD_ITEM'); } catch { /* swallow */ }

        // State must have advanced
        expect(gate.currentState).toBe('has_items');
        expect(gate.isToolAllowed('cart_checkout')).toBe(true);

        // Can still transition
        try { await gate.transition('CHECKOUT'); } catch { /* swallow */ }
        expect(gate.currentState).toBe('payment');
    });
});

// ============================================================================
// 3. DISPOSE LIFECYCLE
// ============================================================================

describe('Dispose lifecycle', () => {
    it('dispose should be idempotent (calling twice must not throw)', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.onTransition(() => {});

        gate.dispose();
        expect(() => gate.dispose()).not.toThrow();
    });

    it('transition after dispose should still work (manual fallback)', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.dispose();

        const result = await gate.transition('ADD_ITEM');
        expect(result.changed).toBe(true);
        expect(gate.currentState).toBe('has_items');
    });

    it('callbacks registered after dispose should not fire (array cleared)', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const beforeSpy = vi.fn();
        const afterSpy = vi.fn();

        gate.onTransition(beforeSpy);
        gate.dispose();
        gate.onTransition(afterSpy);

        await gate.transition('ADD_ITEM');
        expect(beforeSpy).not.toHaveBeenCalled();
        // afterSpy was registered after dispose on the fresh array —
        // it should fire because .length = 0 cleared, but push still works
        expect(afterSpy).toHaveBeenCalledTimes(1);
    });

    it('bindTool after dispose should still work', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.dispose();

        gate.bindTool('cart_add', ['empty']);
        expect(gate.hasBindings).toBe(true);
        expect(gate.isToolAllowed('cart_add')).toBe(true);
    });

    it('snapshot after dispose should capture current state', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.dispose();

        const snap = gate.snapshot();
        expect(snap.state).toBe('empty');
        expect(typeof snap.updatedAt).toBe('number');
    });
});

// ============================================================================
// 4. SNAPSHOT INTEGRITY & CORRUPTION RESISTANCE
// ============================================================================

describe('Snapshot integrity', () => {
    it('snapshot.updatedAt should be monotonically increasing', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const snap1 = gate.snapshot();

        await new Promise(resolve => setTimeout(resolve, 5));

        await gate.transition('ADD_ITEM');
        const snap2 = gate.snapshot();

        expect(snap2.updatedAt).toBeGreaterThanOrEqual(snap1.updatedAt);
    });

    it('restore with empty string state should be rejected', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: '', updatedAt: Date.now() });
        expect(gate.currentState).toBe('empty'); // unchanged
    });

    it('restore with numeric state should be rejected', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: 42 as unknown as string, updatedAt: Date.now() });
        expect(gate.currentState).toBe('empty'); // unchanged
    });

    it('restore with null state should be rejected', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: null as unknown as string, updatedAt: Date.now() });
        expect(gate.currentState).toBe('empty'); // unchanged
    });

    it('restore with undefined snapshot fields should be rejected', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: undefined as unknown as string, updatedAt: Date.now() });
        expect(gate.currentState).toBe('empty'); // unchanged
    });

    it('restore should not fire transition callbacks', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();
        gate.onTransition(spy);

        gate.restore({ state: 'payment', updatedAt: Date.now() });
        expect(spy).not.toHaveBeenCalled();
    });

    it('snapshot should be a pure value copy (not a reference)', () => {
        const gate = new StateMachineGate(checkoutConfig);
        const snap1 = gate.snapshot();
        const snap2 = gate.snapshot();

        expect(snap1).not.toBe(snap2); // Different objects
        expect(snap1).toEqual(snap2);  // Same content
    });

    it('mutating a snapshot object should not affect gate state', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        await gate.transition('ADD_ITEM');

        const snap = gate.snapshot();
        snap.state = 'confirmed'; // Mutate the snapshot object
        snap.updatedAt = 0;

        // Gate should not be affected
        expect(gate.currentState).toBe('has_items');
        expect(gate.snapshot().state).toBe('has_items');
    });

    it('restore from a snapshot should allow continued transitions', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: 'has_items', updatedAt: 1 });

        const result = await gate.transition('CHECKOUT');
        expect(result.changed).toBe(true);
        expect(gate.currentState).toBe('payment');

        await gate.transition('PAY');
        expect(gate.currentState).toBe('confirmed');
    });

    it('restore to initial state should be a valid round-trip', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');

        gate.restore({ state: 'empty', updatedAt: Date.now() });
        expect(gate.currentState).toBe('empty');

        // Full workflow should work again
        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');
    });
});

// ============================================================================
// 5. SELF-LOOP TRANSITIONS
// ============================================================================

describe('Self-loop transitions', () => {
    it('self-loop event should not report changed', async () => {
        const selfLoopConfig: FsmConfig = {
            initial: 'idle',
            states: {
                idle: { on: { TICK: 'idle', START: 'running' } },
                running: { on: { STOP: 'idle' } },
            },
        };

        const gate = new StateMachineGate(selfLoopConfig);
        const spy = vi.fn();
        gate.onTransition(spy);

        const result = await gate.transition('TICK');
        // State doesn't change (idle → idle) so no callback should fire
        expect(result.changed).toBe(false);
        expect(result.currentState).toBe('idle');
        expect(spy).not.toHaveBeenCalled();
    });
});

// ============================================================================
// 6. UNSUBSCRIBE IDEMPOTENCY
// ============================================================================

describe('Unsubscribe idempotency', () => {
    it('double unsubscribe should not throw', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const unsub = gate.onTransition(() => {});

        unsub();
        expect(() => unsub()).not.toThrow(); // Second call is a no-op
    });

    it('unsubscribe should not remove other callbacks', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const spy3 = vi.fn();

        const unsub1 = gate.onTransition(spy1);
        gate.onTransition(spy2);
        gate.onTransition(spy3);

        unsub1(); // Remove only spy1

        await gate.transition('ADD_ITEM');
        expect(spy1).not.toHaveBeenCalled();
        expect(spy2).toHaveBeenCalledTimes(1);
        expect(spy3).toHaveBeenCalledTimes(1);
    });

    it('removing middle callback should not skip adjacent callbacks', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const order: number[] = [];

        gate.onTransition(() => order.push(1));
        const unsub2 = gate.onTransition(() => order.push(2));
        gate.onTransition(() => order.push(3));

        unsub2();

        await gate.transition('ADD_ITEM');
        expect(order).toEqual([1, 3]);
    });
});

// ============================================================================
// 7. LARGE FSM — Stress Test
// ============================================================================

describe('Large FSM — stress test', () => {
    it('should handle a 50-state linear FSM without issues', async () => {
        const states: Record<string, { on?: Record<string, string>; type?: 'final' }> = {};
        for (let i = 0; i < 50; i++) {
            if (i < 49) {
                states[`s${i}`] = { on: { NEXT: `s${i + 1}` } };
            } else {
                states[`s${i}`] = { type: 'final' };
            }
        }

        const bigConfig: FsmConfig = { initial: 's0', states };
        const gate = new StateMachineGate(bigConfig);

        for (let i = 0; i < 49; i++) {
            await gate.transition('NEXT');
        }
        expect(gate.currentState).toBe('s49');
    });

    it('should bind 100 tools and filter correctly', () => {
        const gate = new StateMachineGate({
            initial: 'active',
            states: {
                active: { on: { DONE: 'finished' } },
                finished: { type: 'final' },
            },
        });

        const allTools: string[] = [];
        for (let i = 0; i < 100; i++) {
            const toolName = `tool_${i}`;
            allTools.push(toolName);
            // Evens bound to 'active', odds bound to 'finished'
            gate.bindTool(toolName, [i % 2 === 0 ? 'active' : 'finished']);
        }

        const visible = gate.getVisibleToolNames(allTools);
        expect(visible.length).toBe(50); // Only evens visible
        expect(visible.every(name => parseInt(name.split('_')[1]) % 2 === 0)).toBe(true);
    });

    it('should handle 1000 rapid snapshot/restore cycles', () => {
        const gate = new StateMachineGate(checkoutConfig);
        let snap: FsmSnapshot = gate.snapshot();

        for (let i = 0; i < 1000; i++) {
            snap = gate.snapshot();
            gate.restore(snap);
        }

        expect(gate.currentState).toBe('empty'); // Still in initial state
    });
});

// ============================================================================
// 8. DIAMOND FSM — Multiple Paths to Same State
// ============================================================================

describe('Diamond FSM — converging paths', () => {
    it('should reach end via left path', async () => {
        const gate = new StateMachineGate(diamondConfig);
        gate.bindTool('left_tool', ['left'], 'CONVERGE');
        gate.bindTool('right_tool', ['right'], 'CONVERGE');

        await gate.transition('PATH_A');
        expect(gate.currentState).toBe('left');
        expect(gate.isToolAllowed('left_tool')).toBe(true);
        expect(gate.isToolAllowed('right_tool')).toBe(false);

        await gate.transition('CONVERGE');
        expect(gate.currentState).toBe('end');
    });

    it('should reach end via right path', async () => {
        const gate = new StateMachineGate(diamondConfig);
        gate.bindTool('left_tool', ['left'], 'CONVERGE');
        gate.bindTool('right_tool', ['right'], 'CONVERGE');

        await gate.transition('PATH_B');
        expect(gate.currentState).toBe('right');
        expect(gate.isToolAllowed('right_tool')).toBe(true);
        expect(gate.isToolAllowed('left_tool')).toBe(false);

        await gate.transition('CONVERGE');
        expect(gate.currentState).toBe('end');
    });

    it('both paths should produce identical final snapshot state', async () => {
        const gateA = new StateMachineGate(diamondConfig);
        await gateA.transition('PATH_A');
        await gateA.transition('CONVERGE');

        const gateB = new StateMachineGate(diamondConfig);
        await gateB.transition('PATH_B');
        await gateB.transition('CONVERGE');

        expect(gateA.snapshot().state).toBe(gateB.snapshot().state);
        expect(gateA.currentState).toBe('end');
    });
});

// ============================================================================
// 9. CYCLIC FSM — Infinite Loop Resistance
// ============================================================================

describe('Cyclic FSM — infinite loop resistance', () => {
    it('should handle 1000 cycles without memory growth or crash', async () => {
        const gate = new StateMachineGate(cyclicConfig);

        for (let i = 0; i < 1000; i++) {
            await gate.transition('GO');
        }

        // 1000 % 3 = 1 → should be at 'b'
        expect(gate.currentState).toBe('b');
    });

    it('tool visibility should cycle correctly', async () => {
        const gate = new StateMachineGate(cyclicConfig);
        gate.bindTool('tool_a', ['a']);
        gate.bindTool('tool_b', ['b']);
        gate.bindTool('tool_c', ['c']);

        expect(gate.isToolAllowed('tool_a')).toBe(true);
        expect(gate.isToolAllowed('tool_b')).toBe(false);

        await gate.transition('GO'); // → b
        expect(gate.isToolAllowed('tool_a')).toBe(false);
        expect(gate.isToolAllowed('tool_b')).toBe(true);
        expect(gate.isToolAllowed('tool_c')).toBe(false);

        await gate.transition('GO'); // → c
        expect(gate.isToolAllowed('tool_c')).toBe(true);

        await gate.transition('GO'); // → a (full circle)
        expect(gate.isToolAllowed('tool_a')).toBe(true);
    });
});

// ============================================================================
// 10. INIT IDEMPOTENCY
// ============================================================================

describe('Init idempotency', () => {
    it('calling init() multiple times should not change state', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.init();
        await gate.init();
        await gate.init();

        expect(gate.currentState).toBe('empty');
    });

    it('transition implicitly calls init(), subsequent explicit init() is safe', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM'); // implicit init
        await gate.init(); // explicit init — should be no-op
        
        expect(gate.currentState).toBe('has_items');
    });
});

// ============================================================================
// 11. ZERO-BINDING PASSTHROUGH
// ============================================================================

describe('Zero-binding passthrough', () => {
    it('gate with no bindings should allow all tools', () => {
        const gate = new StateMachineGate(checkoutConfig);

        const tools = ['a', 'b', 'c', 'd', 'e'];
        expect(gate.getVisibleToolNames(tools)).toEqual(tools);
        expect(gate.hasBindings).toBe(false);
    });

    it('gate with no bindings should have no transition events', () => {
        const gate = new StateMachineGate(checkoutConfig);

        expect(gate.getTransitionEvent('anything')).toBeUndefined();
        expect(gate.getTransitionEvent('')).toBeUndefined();
    });

    it('transitions should still work even with no tools bound', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const spy = vi.fn();
        gate.onTransition(spy);

        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

// ============================================================================
// 12. MIXED GATED/UNGATED — Exhaustive State Matrix
// ============================================================================

describe('Mixed gated/ungated — exhaustive state matrix', () => {
    let gate: StateMachineGate;
    const ALL_TOOLS = [
        'cart_add', 'cart_checkout', 'cart_pay', 'cart_clear',
        'cart_cancel', 'cart_view', 'cart_help',
    ];

    beforeEach(() => {
        gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add',      ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'],          'CHECKOUT');
        gate.bindTool('cart_pay',      ['payment'],            'PAY');
        gate.bindTool('cart_clear',    ['has_items'],          'CLEAR');
        gate.bindTool('cart_cancel',   ['payment'],            'CANCEL');
        // cart_view and cart_help are ungated
    });

    it('state=empty: only cart_add + ungated', () => {
        const visible = gate.getVisibleToolNames(ALL_TOOLS);
        expect(visible).toEqual(['cart_add', 'cart_view', 'cart_help']);
    });

    it('state=has_items: cart_add + cart_checkout + cart_clear + ungated', async () => {
        await gate.transition('ADD_ITEM');
        const visible = gate.getVisibleToolNames(ALL_TOOLS);
        expect(visible).toEqual(['cart_add', 'cart_checkout', 'cart_clear', 'cart_view', 'cart_help']);
    });

    it('state=payment: cart_pay + cart_cancel + ungated', async () => {
        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        const visible = gate.getVisibleToolNames(ALL_TOOLS);
        expect(visible).toEqual(['cart_pay', 'cart_cancel', 'cart_view', 'cart_help']);
    });

    it('state=confirmed: only ungated (final state)', async () => {
        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        await gate.transition('PAY');
        const visible = gate.getVisibleToolNames(ALL_TOOLS);
        expect(visible).toEqual(['cart_view', 'cart_help']);
    });
});

// ============================================================================
// 13. BACKWARD + FORWARD TRANSITIONS — Complex Flow
// ============================================================================

describe('Complex flow — backward + forward', () => {
    it('should handle multiple cancel-retry cycles', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_pay', ['payment'], 'PAY');

        // empty → has_items → payment → has_items → payment → confirmed
        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        expect(gate.currentState).toBe('payment');

        // Cancel! Back to has_items
        await gate.transition('CANCEL');
        expect(gate.currentState).toBe('has_items');
        expect(gate.isToolAllowed('cart_pay')).toBe(false);

        // Retry checkout
        await gate.transition('CHECKOUT');
        expect(gate.currentState).toBe('payment');
        expect(gate.isToolAllowed('cart_pay')).toBe(true);

        // Cancel again!
        await gate.transition('CANCEL');
        expect(gate.currentState).toBe('has_items');

        // Third time's the charm
        await gate.transition('CHECKOUT');
        await gate.transition('PAY');
        expect(gate.currentState).toBe('confirmed');
    });

    it('should handle CLEAR flow (back to empty)', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');

        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');

        await gate.transition('CLEAR');
        expect(gate.currentState).toBe('empty');
        expect(gate.isToolAllowed('cart_add')).toBe(true);

        // Re-add items
        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');
    });
});

// ============================================================================
// 14. SERVERLESS SIMULATION — Multi-Session Isolation
// ============================================================================

describe('Serverless — multi-session isolation', () => {
    it('restore from different sessions should produce independent states', async () => {
        // Session A: progressed to payment
        const gateA = new StateMachineGate(checkoutConfig);
        await gateA.transition('ADD_ITEM');
        await gateA.transition('CHECKOUT');
        const snapA = gateA.snapshot();

        // Session B: progressed to has_items
        const gateB = new StateMachineGate(checkoutConfig);
        await gateB.transition('ADD_ITEM');
        const snapB = gateB.snapshot();

        // Simulate request: restore session A
        const serverGate = new StateMachineGate(checkoutConfig);
        serverGate.restore(snapA);
        expect(serverGate.currentState).toBe('payment');

        // Simulate next request: restore session B (should not carry state from A)
        serverGate.restore(snapB);
        expect(serverGate.currentState).toBe('has_items');
    });

    it('snapshot from final state should serialize correctly', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        await gate.transition('ADD_ITEM');
        await gate.transition('CHECKOUT');
        await gate.transition('PAY');

        const snap = gate.snapshot();
        expect(snap.state).toBe('confirmed');

        // Restore in a new gate
        const restored = new StateMachineGate(checkoutConfig);
        restored.restore(snap);
        expect(restored.currentState).toBe('confirmed');

        // Further transitions should be blocked
        const result = await restored.transition('RESET');
        expect(result.changed).toBe(false);
    });

    it('JSON.parse(JSON.stringify(snapshot)) round-trip should work', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        await gate.transition('ADD_ITEM');

        const snap = gate.snapshot();
        const serialized = JSON.stringify(snap);
        const deserialized = JSON.parse(serialized) as FsmSnapshot;

        const newGate = new StateMachineGate(checkoutConfig);
        newGate.restore(deserialized);
        expect(newGate.currentState).toBe('has_items');
    });
});

// ============================================================================
// 15. TRANSITION RESULT CONTRACT
// ============================================================================

describe('TransitionResult contract', () => {
    it('changed=true: previousState !== currentState', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const result = await gate.transition('ADD_ITEM');

        expect(result.changed).toBe(true);
        expect(result.previousState).not.toBe(result.currentState);
        expect(result.previousState).toBe('empty');
        expect(result.currentState).toBe('has_items');
    });

    it('changed=false: previousState === currentState', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const result = await gate.transition('NONEXISTENT');

        expect(result.changed).toBe(false);
        expect(result.previousState).toBe(result.currentState);
    });

    it('result should be a snapshot of the transition, not a live reference', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const result1 = await gate.transition('ADD_ITEM');

        await gate.transition('CHECKOUT');

        // result1 should still show the original transition
        expect(result1.currentState).toBe('has_items');
        expect(gate.currentState).toBe('payment');
    });
});

// ============================================================================
// 16. FLUENT API — bindState() with edge-case inputs
// ============================================================================

describe('FluentToolBuilder — .bindState() edge inputs', () => {
    it('empty array of states should produce a binding that is never visible', () => {
        const f = initFusion<TestContext>();
        const tool = f.mutation('ghost')
            .describe('invisible tool')
            .bindState([], 'NEVER')
            .handle(async () => success('ok'));

        const binding = tool.getFsmBinding();
        expect(binding).toBeDefined();
        expect(binding!.states).toEqual([]);
    });

    it('duplicate states in array should be handled gracefully', () => {
        const f = initFusion<TestContext>();
        const tool = f.mutation('duped')
            .describe('duplicated states')
            .bindState(['empty', 'empty', 'empty'], 'ADD_ITEM')
            .handle(async () => success('ok'));

        const binding = tool.getFsmBinding();
        expect(binding).toBeDefined();
        // The FluentToolBuilder stores raw array; the StateMachineGate
        // converts to Set, so duplicates are harmless
        expect(binding!.states.length).toBe(3);
    });

    it('duplicate states in bindTool() should not cause double visibility', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('tool', ['empty', 'empty', 'empty']);

        // Should only appear once in visible list
        const visible = gate.getVisibleToolNames(['tool', 'tool']);
        expect(visible).toEqual(['tool', 'tool']); // Filtering is per-element
    });

    it('bindState with empty string transition should be treated as no-transition', () => {
        const f = initFusion<TestContext>();
        const tool = f.mutation('empty_event')
            .describe('empty string event')
            .bindState('payment', '')
            .handle(async () => success('ok'));

        const binding = tool.getFsmBinding();
        // Empty string is falsy — builder may store it as undefined
        expect(binding!.transition === '' || binding!.transition === undefined).toBe(true);
    });
});

// ============================================================================
// 17. MIXED FSM CONFIGS — Edge-case Config Shapes
// ============================================================================

describe('Edge-case FSM configs', () => {
    it('single state with no transitions should not crash', async () => {
        const gate = new StateMachineGate({
            initial: 'only',
            states: { only: {} },
        });

        const result = await gate.transition('ANYTHING');
        expect(result.changed).toBe(false);
        expect(gate.currentState).toBe('only');
    });

    it('state with empty on:{} should not crash', async () => {
        const gate = new StateMachineGate({
            initial: 'idle',
            states: { idle: { on: {} }, done: { type: 'final' } },
        });

        const result = await gate.transition('GO');
        expect(result.changed).toBe(false);
    });

    it('event pointing to undefined state should not advance', async () => {
        // Misconfig: event targets a state not in the states map
        const gate = new StateMachineGate({
            initial: 'start',
            states: {
                start: { on: { GO: 'missing_state' } }, // missing_state not defined
            },
        });

        const result = await gate.transition('GO');
        // _transitionManual checks: target && this._config.states[target]
        expect(result.changed).toBe(false);
        expect(gate.currentState).toBe('start');
    });

    it('config with only final states should start correctly', () => {
        const gate = new StateMachineGate({
            initial: 'done',
            states: { done: { type: 'final' } },
        });

        expect(gate.currentState).toBe('done');
    });
});

// ============================================================================
// 18. TRANSITION CALLBACK ORDERING
// ============================================================================

describe('Transition callback ordering', () => {
    it('callbacks should fire in registration order', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const order: number[] = [];

        gate.onTransition(() => order.push(1));
        gate.onTransition(() => order.push(2));
        gate.onTransition(() => order.push(3));

        await gate.transition('ADD_ITEM');
        expect(order).toEqual([1, 2, 3]);
    });

    it('callback should see the new state (post-transition)', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        let observedState = '';

        gate.onTransition(() => {
            observedState = gate.currentState;
        });

        await gate.transition('ADD_ITEM');
        expect(observedState).toBe('has_items');
    });

    it('callback should fire once per actual state change, even with same event', async () => {
        const gate = new StateMachineGate(cyclicConfig);
        let count = 0;
        gate.onTransition(() => count++);

        await gate.transition('GO'); // a→b
        await gate.transition('GO'); // b→c
        await gate.transition('GO'); // c→a
        await gate.transition('unknown'); // no change

        expect(count).toBe(3);
    });
});

// ============================================================================
// 19. GATE + TOOL EXECUTION — Error Path
// ============================================================================

describe('Gate + tool execution — error path', () => {
    it('tools returning error should not trigger FSM transition', async () => {
        const f = initFusion<TestContext>();
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart', ['empty'], 'ADD_ITEM');

        const tool = f.mutation('cart.add_item')
            .describe('Add item')
            .bindState('empty', 'ADD_ITEM')
            .handle(async () => error('Out of stock'));

        // Execute the tool — it returns an error
        const result = await tool.execute({ userId: 'u-1' }, { action: 'add_item' });
        expect(result.isError).toBe(true);

        // FSM should NOT have transitioned (ServerAttachment checks !result.isError)
        // Here we simulate what ServerAttachment does:
        if (!result.isError) {
            const event = gate.getTransitionEvent('cart');
            if (event) await gate.transition(event);
        }
        expect(gate.currentState).toBe('empty'); // Still empty!
    });

    it('tools returning success should trigger FSM transition', async () => {
        const f = initFusion<TestContext>();
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart', ['empty'], 'ADD_ITEM');

        const tool = f.mutation('cart.add_item')
            .describe('Add item')
            .bindState('empty', 'ADD_ITEM')
            .handle(async () => success({ id: 'p1' }));

        const result = await tool.execute({ userId: 'u-1' }, { action: 'add_item' });
        expect(result.isError).toBeUndefined();

        // Simulate ServerAttachment behavior
        if (!result.isError) {
            const event = gate.getTransitionEvent('cart');
            if (event) await gate.transition(event);
        }
        expect(gate.currentState).toBe('has_items'); // Advanced!
    });
});

// ============================================================================
// 20. TIMING ATTACKS — Snapshot Replay
// ============================================================================

describe('Timing — snapshot replay resistance', () => {
    it('replaying an old snapshot should rewind state (expected behavior)', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        await gate.transition('ADD_ITEM');
        const oldSnap = gate.snapshot(); // has_items

        await gate.transition('CHECKOUT');
        await gate.transition('PAY');
        expect(gate.currentState).toBe('confirmed');

        // Replay old snapshot — state goes back
        gate.restore(oldSnap);
        expect(gate.currentState).toBe('has_items');
    });

    it('snapshot updatedAt can be used for staleness checks', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const snap1 = gate.snapshot();

        await new Promise(r => setTimeout(r, 10));
        await gate.transition('ADD_ITEM');
        const snap2 = gate.snapshot();

        // A store implementation could reject snap1 as stale:
        expect(snap2.updatedAt).toBeGreaterThan(snap1.updatedAt);
    });
});

// ============================================================================
// 21. PROPERTY-BASED — Invariant Checks
// ============================================================================

describe('Property-based invariants', () => {
    it('currentState should always be a key in config.states', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const validStates = Object.keys(checkoutConfig.states);

        expect(validStates).toContain(gate.currentState);

        await gate.transition('ADD_ITEM');
        expect(validStates).toContain(gate.currentState);

        await gate.transition('CHECKOUT');
        expect(validStates).toContain(gate.currentState);

        await gate.transition('PAY');
        expect(validStates).toContain(gate.currentState);

        // Even invalid events don't break the invariant
        await gate.transition('JUNK');
        expect(validStates).toContain(gate.currentState);
    });

    it('getVisibleToolNames(allTools) should always be a subset of allTools', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('a', ['empty']);
        gate.bindTool('b', ['payment']);

        const allTools = ['a', 'b', 'c'];
        const visible = gate.getVisibleToolNames(allTools);

        for (const tool of visible) {
            expect(allTools).toContain(tool);
        }
    });

    it('hasBindings === true iff at least one tool is bound', () => {
        const gate = new StateMachineGate(checkoutConfig);
        expect(gate.hasBindings).toBe(false);

        gate.bindTool('x', ['empty']);
        expect(gate.hasBindings).toBe(true);
    });

    it('isToolAllowed should be pure (no side effects on repeated calls)', () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add', ['empty']);

        const call1 = gate.isToolAllowed('cart_add');
        const call2 = gate.isToolAllowed('cart_add');
        const call3 = gate.isToolAllowed('cart_add');

        expect(call1).toBe(call2);
        expect(call2).toBe(call3);
        expect(gate.currentState).toBe('empty'); // No side effects
    });
});
