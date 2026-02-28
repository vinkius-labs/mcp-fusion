/**
 * SandboxAbortSignal.test.ts
 *
 * Comprehensive tests for the Connection Watchdog kill-switch.
 *
 * Validates that AbortSignal properly:
 *   1. Pre-flight check: already-aborted signal skips V8 entirely
 *   2. Mid-execution abort: kills isolate via dispose()
 *   3. Auto-recovery: isolate recreated after abort
 *   4. Listener cleanup: no memory leaks
 *   5. Race conditions: signal fires at various pipeline stages
 *   6. Interaction with other error paths (disposed, guard, timeout)
 *   7. Pointer lifecycle: C++ cleanup after abort
 *
 * These tests require `isolated-vm` to be installed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxEngine } from '../../src/sandbox/SandboxEngine.js';

// ── Check if isolated-vm is available ──────────────────

let ivmAvailable = false;
try {
    require('isolated-vm');
    ivmAvailable = true;
} catch {
    // isolated-vm not installed — skip tests
}

const describeSandbox = ivmAvailable ? describe : describe.skip;

// ============================================================================
// Pre-Flight Abort (Signal Already Aborted)
// ============================================================================

describeSandbox('Connection Watchdog: Pre-Flight Abort', () => {
    let engine: SandboxEngine;

    beforeEach(() => {
        engine = new SandboxEngine({ timeout: 5000, memoryLimit: 32 });
    });

    afterEach(() => {
        engine?.dispose();
    });

    it('should return ABORTED immediately when signal is already aborted', async () => {
        const ac = new AbortController();
        ac.abort(); // Pre-abort

        const result = await engine.execute(
            '(data) => data.length',
            [1, 2, 3],
            { signal: ac.signal },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('ABORTED');
            expect(result.error).toContain('before sandbox started');
        }
    });

    it('should NOT allocate V8 resources for pre-aborted signal', async () => {
        const ac = new AbortController();
        ac.abort();

        // Execute 100 times — should be instantaneous (no V8 overhead)
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            await engine.execute('(data) => data', {}, { signal: ac.signal });
        }
        const elapsed = performance.now() - start;

        // 100 pre-aborted calls should take < 50ms (just JS, no V8)
        expect(elapsed).toBeLessThan(50);
    });

    it('should still work normally after a pre-aborted call', async () => {
        const ac = new AbortController();
        ac.abort();

        // Aborted call
        const aborted = await engine.execute('(data) => data', {}, { signal: ac.signal });
        expect(aborted.ok).toBe(false);

        // Normal call (no signal) — should work
        const normal = await engine.execute('(data) => data.length', [1, 2, 3]);
        expect(normal.ok).toBe(true);
        if (normal.ok) expect(normal.value).toBe(3);
    });

    it('should return ABORTED even for invalid code (guard not reached)', async () => {
        const ac = new AbortController();
        ac.abort();

        // Invalid code — but abort check runs BEFORE guard
        const result = await engine.execute(
            'NOT_A_FUNCTION',
            {},
            { signal: ac.signal },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            // Abort check runs before guard, so code is ABORTED, not INVALID_CODE
            expect(result.code).toBe('ABORTED');
        }
    });
});

// ============================================================================
// Mid-Execution Abort (Kill-Switch)
// ============================================================================

describeSandbox('Connection Watchdog: Mid-Execution Kill-Switch', () => {
    it('should abort a long-running script via isolate.dispose()', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            const ac = new AbortController();

            // Abort after 100ms — script runs for 10s timeout
            setTimeout(() => ac.abort(), 100);

            const result = await engine.execute(
                '(data) => { while(true) {} }', // infinite loop
                {},
                { signal: ac.signal },
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('ABORTED');
                expect(result.error).toContain('during sandbox execution');
            }
        } finally {
            engine.dispose();
        }
    });

    it('should return ABORTED (not TIMEOUT) when abort fires first', async () => {
        const engine = new SandboxEngine({ timeout: 5000, memoryLimit: 32 });

        try {
            const ac = new AbortController();

            // Abort fires much sooner than 5s timeout
            setTimeout(() => ac.abort(), 50);

            const result = await engine.execute(
                '(data) => { while(true) {} }',
                {},
                { signal: ac.signal },
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                // Must be ABORTED, not TIMEOUT — abort fired first
                expect(result.code).toBe('ABORTED');
            }
        } finally {
            engine.dispose();
        }
    });

    it('should not block the event loop while aborting', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            const ac = new AbortController();
            setTimeout(() => ac.abort(), 100);

            const [sandboxResult, timerResult] = await Promise.all([
                engine.execute('(data) => { while(true) {} }', {}, { signal: ac.signal }),
                new Promise<string>(resolve => {
                    setTimeout(() => resolve('event-loop-alive'), 50);
                }),
            ]);

            expect(timerResult).toBe('event-loop-alive');
            expect(sandboxResult.ok).toBe(false);
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Auto-Recovery After Abort
// ============================================================================

describeSandbox('Connection Watchdog: Auto-Recovery', () => {
    it('should auto-recover isolate after abort-triggered dispose', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            // 1. Abort kills the isolate
            const ac = new AbortController();
            setTimeout(() => ac.abort(), 50);

            const aborted = await engine.execute(
                '(data) => { while(true) {} }',
                {},
                { signal: ac.signal },
            );
            expect(aborted.ok).toBe(false);
            if (!aborted.ok) expect(aborted.code).toBe('ABORTED');

            // 2. Next call should auto-recover (new isolate created)
            const recovered = await engine.execute(
                '(data) => data.length',
                [1, 2, 3],
            );
            expect(recovered.ok).toBe(true);
            if (recovered.ok) expect(recovered.value).toBe(3);
        } finally {
            engine.dispose();
        }
    });

    it('should auto-recover and accept signal on the next call', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            // 1. First abort
            const ac1 = new AbortController();
            setTimeout(() => ac1.abort(), 50);
            await engine.execute('(data) => { while(true) {} }', {}, { signal: ac1.signal });

            // 2. Second call with a NON-aborted signal — should work
            const ac2 = new AbortController();
            const result = await engine.execute(
                '(data) => data * 2',
                21,
                { signal: ac2.signal },
            );
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value).toBe(42);
        } finally {
            engine.dispose();
        }
    });

    it('should handle multiple abort-recovery cycles', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            for (let i = 0; i < 3; i++) {
                // Abort
                const ac = new AbortController();
                setTimeout(() => ac.abort(), 30);
                const aborted = await engine.execute(
                    '(data) => { while(true) {} }',
                    {},
                    { signal: ac.signal },
                );
                expect(aborted.ok).toBe(false);

                // Recover
                const recovered = await engine.execute('(data) => data + 1', i);
                expect(recovered.ok).toBe(true);
                if (recovered.ok) expect(recovered.value).toBe(i + 1);
            }
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Listener Cleanup (Memory Leak Prevention)
// ============================================================================

describeSandbox('Connection Watchdog: Listener Cleanup', () => {
    let engine: SandboxEngine;

    beforeEach(() => {
        engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
    });

    afterEach(() => {
        engine?.dispose();
    });

    it('should remove abort listener after successful execution', async () => {
        const ac = new AbortController();

        // Track listener count
        let addCount = 0;
        let removeCount = 0;
        const origAdd = ac.signal.addEventListener.bind(ac.signal);
        const origRemove = ac.signal.removeEventListener.bind(ac.signal);
        ac.signal.addEventListener = (...args: Parameters<typeof origAdd>) => {
            addCount++;
            return origAdd(...args);
        };
        ac.signal.removeEventListener = (...args: Parameters<typeof origRemove>) => {
            removeCount++;
            return origRemove(...args);
        };

        await engine.execute('(data) => data', 42, { signal: ac.signal });

        // Listener was added and then removed
        expect(addCount).toBe(1);
        expect(removeCount).toBe(1);
    });

    it('should remove abort listener after error', async () => {
        const ac = new AbortController();

        let removeCount = 0;
        const origRemove = ac.signal.removeEventListener.bind(ac.signal);
        ac.signal.removeEventListener = (...args: Parameters<typeof origRemove>) => {
            removeCount++;
            return origRemove(...args);
        };

        // Runtime error — listener should still be cleaned up
        await engine.execute('(data) => data.nonExistent.prop', null, { signal: ac.signal });

        expect(removeCount).toBe(1);
    });

    it('should not leak listeners across many calls', async () => {
        const ac = new AbortController();

        let addCount = 0;
        let removeCount = 0;
        const origAdd = ac.signal.addEventListener.bind(ac.signal);
        const origRemove = ac.signal.removeEventListener.bind(ac.signal);
        ac.signal.addEventListener = (...args: Parameters<typeof origAdd>) => {
            addCount++;
            return origAdd(...args);
        };
        ac.signal.removeEventListener = (...args: Parameters<typeof origRemove>) => {
            removeCount++;
            return origRemove(...args);
        };

        for (let i = 0; i < 50; i++) {
            await engine.execute('(data) => data', i, { signal: ac.signal });
        }

        // Every add was matched by a remove
        expect(addCount).toBe(50);
        expect(removeCount).toBe(50);
    });
});

// ============================================================================
// Signal Absent (Backward Compatibility)
// ============================================================================

describeSandbox('Connection Watchdog: No Signal (Backward Compat)', () => {
    let engine: SandboxEngine;

    beforeEach(() => {
        engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
    });

    afterEach(() => {
        engine?.dispose();
    });

    it('should work when no signal is passed', async () => {
        const result = await engine.execute('(data) => data * 2', 21);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe(42);
    });

    it('should work when options is undefined', async () => {
        const result = await engine.execute('(data) => data', 'hello', undefined);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe('hello');
    });

    it('should work when options is empty object', async () => {
        const result = await engine.execute('(data) => data', 'world', {});
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe('world');
    });

    it('should work when signal is undefined in options', async () => {
        const result = await engine.execute('(data) => data', 42, { signal: undefined });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe(42);
    });
});

// ============================================================================
// Edge Cases & Race Conditions
// ============================================================================

describeSandbox('Connection Watchdog: Edge Cases', () => {
    it('should handle abort AFTER successful execution (late abort = no-op)', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            const ac = new AbortController();

            // Execute a fast function
            const result = await engine.execute(
                '(data) => data + 1',
                41,
                { signal: ac.signal },
            );

            // Abort AFTER result — should be a no-op
            ac.abort();

            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value).toBe(42);

            // Engine should still work
            const next = await engine.execute('(data) => data', 'ok');
            expect(next.ok).toBe(true);
        } finally {
            engine.dispose();
        }
    });

    it('should handle disposed engine + abort signal (no crash)', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
        engine.dispose();

        const ac = new AbortController();

        // Should return UNAVAILABLE (dispose check runs before abort check)
        const result = await engine.execute('(data) => data', {}, { signal: ac.signal });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('UNAVAILABLE');
        }
    });

    it('should handle invalid code + abort signal (abort wins over guard)', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            const ac = new AbortController();
            ac.abort(); // Pre-abort

            const result = await engine.execute(
                '42',  // Invalid — not a function
                {},
                { signal: ac.signal },
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                // Abort check runs BEFORE guard → ABORTED
                expect(result.code).toBe('ABORTED');
            }
        } finally {
            engine.dispose();
        }
    });

    it('should handle abort with null data', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            const ac = new AbortController();
            setTimeout(() => ac.abort(), 50);

            const result = await engine.execute(
                '(data) => { while(true) {} }',
                null,
                { signal: ac.signal },
            );

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.code).toBe('ABORTED');
        } finally {
            engine.dispose();
        }
    });

    it('should handle concurrent abort calls (double abort is safe)', async () => {
        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            const ac = new AbortController();

            // Multiple abort triggers
            setTimeout(() => ac.abort(), 50);
            setTimeout(() => ac.abort(), 60);
            setTimeout(() => ac.abort(), 70);

            const result = await engine.execute(
                '(data) => { while(true) {} }',
                {},
                { signal: ac.signal },
            );

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.code).toBe('ABORTED');

            // Engine should auto-recover
            const recovered = await engine.execute('(data) => data', 'ok');
            expect(recovered.ok).toBe(true);
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Pointer Lifecycle After Abort
// ============================================================================

describeSandbox('Connection Watchdog: Pointer Lifecycle', () => {
    it('should not leak native memory after abort', async () => {
        const ivm = require('isolated-vm');
        const baselineSize = ivm.ExternalCopy.totalExternalSize;

        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            // Generate large data to make leaks detectable
            const largeData = Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                name: `item-${i}`,
                value: Math.random(),
            }));

            // Abort during execution
            const ac = new AbortController();
            setTimeout(() => ac.abort(), 50);

            await engine.execute(
                '(data) => { while(true) {} }',
                largeData,
                { signal: ac.signal },
            );

            // Wait for GC to clean up
            await new Promise(resolve => setTimeout(resolve, 100));

            // External size should return to (near) baseline
            const afterSize = ivm.ExternalCopy.totalExternalSize;
            // Allow some tolerance (V8 internal bookkeeping)
            expect(afterSize - baselineSize).toBeLessThan(10_000);
        } finally {
            engine.dispose();
        }
    });

    it('should not leak memory across multiple abort cycles', async () => {
        const ivm = require('isolated-vm');
        const baselineSize = ivm.ExternalCopy.totalExternalSize;

        const engine = new SandboxEngine({ timeout: 10_000, memoryLimit: 32 });

        try {
            for (let i = 0; i < 5; i++) {
                const ac = new AbortController();
                setTimeout(() => ac.abort(), 30);

                await engine.execute(
                    '(data) => { while(true) {} }',
                    { cycle: i, payload: 'x'.repeat(1000) },
                    { signal: ac.signal },
                );

                // Let GC run
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const afterSize = ivm.ExternalCopy.totalExternalSize;
            expect(afterSize - baselineSize).toBeLessThan(10_000);
        } finally {
            engine.dispose();
        }
    });
});
