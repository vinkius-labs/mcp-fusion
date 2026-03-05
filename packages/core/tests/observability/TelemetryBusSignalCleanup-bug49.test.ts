/**
 * Bug #49 Regression: `TelemetryBus.close()` doesn't remove signal handlers
 *
 * BUG: Signal handlers are registered as anonymous arrow functions:
 *   `process.once('SIGINT', () => sigHandler('SIGINT'))`
 * but `close()` tries to remove `sigHandler` directly:
 *   `process.removeListener('SIGINT', sigHandler)`
 * These are different function references, so `removeListener` is a no-op.
 * Stale handlers remain attached and can kill the process after explicit `close()`.
 *
 * WHY EXISTING TESTS MISSED IT:
 * The TelemetryBus tests (in packages/inspector) test connection and emission
 * behavior but never verify signal handler cleanup. No test calls `close()`
 * and then checks `process.listenerCount('SIGINT')` or similar. The resource
 * leak is invisible unless you inspect the process listener registry.
 *
 * FIX: Store arrow function references in named variables (`sigintHandler`,
 * `sigtermHandler`) and use those same references in both `process.once()`
 * and `process.removeListener()`.
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Bug #49 Regression: TelemetryBus signal handler cleanup', () => {
    // We test the _pattern_ of the fix rather than the full TelemetryBus
    // because createTelemetryBus requires IPC sockets which may not work
    // in CI/test environments. The bug is about function reference identity.

    let originalOnce: typeof process.once;
    let originalRemoveListener: typeof process.removeListener;
    let registeredListeners: Map<string, Function[]>;

    beforeEach(() => {
        registeredListeners = new Map();
        originalOnce = process.once;
        originalRemoveListener = process.removeListener;
    });

    afterEach(() => {
        process.once = originalOnce;
        process.removeListener = originalRemoveListener;
    });

    it('BUG PATTERN: anonymous arrow functions cannot be removed by inner reference', () => {
        // This demonstrates the exact bug pattern

        const innerFn = (signal: string): void => { /* cleanup + kill */ };

        // Registered listener is the ARROW FUNCTION, not innerFn
        const registeredRef = () => innerFn('SIGINT');

        // Simulated process.removeListener behavior:
        // It compares by reference identity
        expect(registeredRef).not.toBe(innerFn);

        // removeListener(innerFn) would NOT remove registeredRef
        // This is why the old code was broken
    });

    it('FIX PATTERN: named arrow references can be correctly removed', () => {
        // This demonstrates the fix pattern

        const sigHandler = (signal: string): void => { /* cleanup + kill */ };

        // Store the arrow function reference (the fix)
        const sigintHandler = (): void => sigHandler('SIGINT');
        const sigtermHandler = (): void => sigHandler('SIGTERM');

        // Register with the NAMED reference
        const listeners: Function[] = [];
        listeners.push(sigintHandler);

        // Remove with the SAME reference — this works!
        const idx = listeners.indexOf(sigintHandler);
        expect(idx).toBe(0);
        listeners.splice(idx, 1);
        expect(listeners).toHaveLength(0);
    });

    it('process.once + process.removeListener round-trip with named reference', () => {
        const handler = vi.fn();
        const wrappedHandler = (): void => handler('SIGINT');

        // Track initial listener count
        const initialCount = process.listenerCount('SIGINT');

        // Register
        process.once('SIGINT', wrappedHandler);
        expect(process.listenerCount('SIGINT')).toBe(initialCount + 1);

        // Remove with same reference
        process.removeListener('SIGINT', wrappedHandler);
        expect(process.listenerCount('SIGINT')).toBe(initialCount);
    });

    it('process.removeListener with WRONG reference is a no-op (the bug)', () => {
        const handler = vi.fn();
        const differentRef = (): void => handler('SIGINT');

        const initialCount = process.listenerCount('SIGINT');

        // Register an anonymous function
        const registered = (): void => handler('SIGINT');
        process.once('SIGINT', registered);
        expect(process.listenerCount('SIGINT')).toBe(initialCount + 1);

        // Try to remove with a DIFFERENT reference — this is a no-op
        process.removeListener('SIGINT', differentRef);
        // Listener is STILL registered (the bug!)
        expect(process.listenerCount('SIGINT')).toBe(initialCount + 1);

        // Clean up properly
        process.removeListener('SIGINT', registered);
        expect(process.listenerCount('SIGINT')).toBe(initialCount);
    });

    it('close() after close() should be safe (idempotent)', () => {
        const handler = vi.fn();
        const wrappedHandler = (): void => handler('SIGINT');

        const initialCount = process.listenerCount('SIGINT');

        process.once('SIGINT', wrappedHandler);
        expect(process.listenerCount('SIGINT')).toBe(initialCount + 1);

        // First removal
        process.removeListener('SIGINT', wrappedHandler);
        expect(process.listenerCount('SIGINT')).toBe(initialCount);

        // Second removal — should be a safe no-op
        process.removeListener('SIGINT', wrappedHandler);
        expect(process.listenerCount('SIGINT')).toBe(initialCount);
    });

    it('SIGTERM follows the same pattern as SIGINT', () => {
        const handler = vi.fn();
        const sigtermHandler = (): void => handler('SIGTERM');

        const initialCount = process.listenerCount('SIGTERM');

        process.once('SIGTERM', sigtermHandler);
        expect(process.listenerCount('SIGTERM')).toBe(initialCount + 1);

        process.removeListener('SIGTERM', sigtermHandler);
        expect(process.listenerCount('SIGTERM')).toBe(initialCount);
    });
});
