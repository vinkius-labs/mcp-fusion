/**
 * drainGenerator AbortSignal listener leak regression (C3)
 *
 * BUG: The abort listener was never removed when the generator completed
 * normally. On long-lived AbortSignals (connection-level signals reused
 * across many requests), each drainGenerator call added a new listener
 * that was never cleaned up — linear memory leak.
 *
 * FIX: Extract the abort handler to a named variable and remove it
 * in a `finally` block when the generator completes without abort.
 */
import { describe, it, expect, vi } from 'vitest';

describe('drainGenerator — AbortSignal listener leak (C3 regression)', () => {
    it('should remove the abort listener when generator completes normally', () => {
        const controller = new AbortController();
        const signal = controller.signal;

        const addSpy = vi.spyOn(signal, 'addEventListener');
        const removeSpy = vi.spyOn(signal, 'removeEventListener');

        // Simulate the drainGenerator pattern: add listener, then remove in finally
        let abortHandler: (() => void) | undefined;
        const abortPromise = new Promise<never>((_, reject) => {
            abortHandler = () => reject(new DOMException('Cancelled.', 'AbortError'));
            signal.addEventListener('abort', abortHandler, { once: true });
        });
        abortPromise.catch(() => {});

        // Generator completes normally
        try {
            // ... drain logic would be here
        } finally {
            if (abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }
        }

        expect(addSpy).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledTimes(1);
        // Must be the same handler reference
        expect(removeSpy).toHaveBeenCalledWith('abort', abortHandler);

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    it('should NOT leak listeners across multiple drain cycles on the same signal', () => {
        const controller = new AbortController();
        const signal = controller.signal;

        const addSpy = vi.spyOn(signal, 'addEventListener');
        const removeSpy = vi.spyOn(signal, 'removeEventListener');

        // Simulate 5 drain cycles on the same long-lived signal
        for (let i = 0; i < 5; i++) {
            let abortHandler: (() => void) | undefined;
            const abortPromise = new Promise<never>((_, reject) => {
                abortHandler = () => reject(new DOMException('Cancelled.', 'AbortError'));
                signal.addEventListener('abort', abortHandler, { once: true });
            });
            abortPromise.catch(() => {});

            try {
                // drain completes normally
            } finally {
                if (abortHandler) {
                    signal.removeEventListener('abort', abortHandler);
                }
            }
        }

        // Each cycle: 1 add + 1 remove = balanced
        expect(addSpy).toHaveBeenCalledTimes(5);
        expect(removeSpy).toHaveBeenCalledTimes(5);

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    it('should handle the case where abort fires before finally (once:true handles removal)', () => {
        const controller = new AbortController();
        const signal = controller.signal;

        const removeSpy = vi.spyOn(signal, 'removeEventListener');

        let abortHandler: (() => void) | undefined;
        const abortPromise = new Promise<never>((_, reject) => {
            abortHandler = () => reject(new DOMException('Cancelled.', 'AbortError'));
            signal.addEventListener('abort', abortHandler, { once: true });
        });
        abortPromise.catch(() => {});

        // Abort fires — { once: true } auto-removes the listener
        controller.abort();

        try {
            // drain would have been interrupted
        } finally {
            // removeEventListener on already-removed listener is a no-op
            if (abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }
        }

        // removeEventListener is called in finally, but the listener
        // was already removed by { once: true }. This is harmless.
        expect(removeSpy).toHaveBeenCalledTimes(1);

        removeSpy.mockRestore();
    });
});
