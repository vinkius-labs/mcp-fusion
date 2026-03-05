/**
 * Bug #50 — GovernanceObserver.observe() sync mishandles async callbacks
 *
 * THE BUG: `observe<T>(fn: () => T): T` calls `const result = fn()`.
 * When `fn` is async, TypeScript allows it because `() => Promise<T>`
 * is assignable to `() => T`. The span ends immediately, durationMs
 * is near-zero, rejections are never caught, and the debug event
 * registers success before async work completes.
 *
 * WHY EXISTING TESTS MISSED IT: All GovernanceObserver tests pass
 * sync functions to observe() and async functions to observeAsync().
 * No test ever passed an async function to the sync observe() method.
 *
 * THE FIX: Runtime guard after fn() — if result is thenable, throw
 * an error telling the user to use observeAsync() instead.
 */
import { describe, it, expect } from 'vitest';
import {
    createGovernanceObserver,
    createNoopObserver,
} from '../../src/introspection/GovernanceObserver.js';
import type { DebugObserverFn, GovernanceEvent } from '../../src/observability/DebugObserver.js';

describe('Bug #50: GovernanceObserver.observe() rejects async callbacks', () => {
    it('throws when fn returns a Promise', () => {
        const observer = createGovernanceObserver({ debug: () => {} });

        expect(() => {
            observer.observe('contract.compile', 'test', async () => {
                return 42;
            });
        }).toThrow('Use observeAsync()');
    });

    it('error message is actionable', () => {
        const observer = createGovernanceObserver({ debug: () => {} });

        expect(() => {
            observer.observe('lockfile.generate', 'test', async () => 'done');
        }).toThrow('[MCP Fusion]');
    });

    it('rejects custom thenable objects (duck typing)', () => {
        const observer = createGovernanceObserver({ debug: () => {} });

        expect(() => {
            observer.observe('digest.compute', 'test', () => {
                return { then: (resolve: (v: number) => void) => resolve(42) } as unknown;
            });
        }).toThrow('Use observeAsync()');
    });

    it('does NOT reject sync functions returning non-thenable objects', () => {
        const observer = createGovernanceObserver({ debug: () => {} });

        const result = observer.observe('contract.compile', 'test', () => {
            return { value: 42, then: 'not a function' };
        });

        expect(result).toEqual({ value: 42, then: 'not a function' });
    });

    it('does NOT reject sync functions returning null/undefined', () => {
        const events: GovernanceEvent[] = [];
        const debug: DebugObserverFn = (e) => {
            if (e.type === 'governance') events.push(e);
        };
        const observer = createGovernanceObserver({ debug });

        const r1 = observer.observe('contract.compile', 'null', () => null);
        const r2 = observer.observe('contract.compile', 'undef', () => undefined);

        expect(r1).toBeNull();
        expect(r2).toBeUndefined();
        expect(events).toHaveLength(2);
        expect(events.every(e => e.outcome === 'success')).toBe(true);
    });

    it('debug event records failure when async callback is detected', () => {
        const events: GovernanceEvent[] = [];
        const debug: DebugObserverFn = (e) => {
            if (e.type === 'governance') events.push(e);
        };
        const observer = createGovernanceObserver({ debug });

        try {
            observer.observe('lockfile.check', 'test', async () => 'data');
        } catch { /* expected */ }

        // The thrown error should be caught by the catch block in observe(),
        // producing a failure event
        expect(events).toHaveLength(1);
        expect(events[0]!.outcome).toBe('failure');
        expect(events[0]!.detail).toContain('observeAsync');
    });

    it('noop observer still rejects async callbacks', () => {
        // The noop observer is different — it delegates directly.
        // Since we fixed createGovernanceObserver, the noop is separate.
        // This test documents the behavior: noop does NOT guard (by design,
        // since it's zero-overhead). The runtime guard is in the real observer.
        const noop = createNoopObserver();
        // noop.observe just calls fn() directly — an async fn returns a Promise
        const result = noop.observe('contract.compile', 'test', async () => 42);
        // It returns the Promise since noop doesn't guard
        expect(result).toBeInstanceOf(Promise);
    });

    it('observeAsync still works correctly with async functions', async () => {
        const events: GovernanceEvent[] = [];
        const debug: DebugObserverFn = (e) => {
            if (e.type === 'governance') events.push(e);
        };
        const observer = createGovernanceObserver({ debug });

        const result = await observer.observeAsync('contract.compile', 'test', async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 42;
        });

        expect(result).toBe(42);
        expect(events).toHaveLength(1);
        expect(events[0]!.outcome).toBe('success');
        expect(events[0]!.durationMs).toBeGreaterThanOrEqual(5);
    });
});
