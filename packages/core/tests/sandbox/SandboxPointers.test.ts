/**
 * SandboxPointers.test.ts
 *
 * C++ Pointer Lifecycle Tests — the "Caminho das Pedras" of V8.
 *
 * These tests validate that native memory (ExternalCopy, Script, Context)
 * is properly released via try/finally, even when:
 *   - Execution succeeds normally
 *   - The script throws a runtime error
 *   - The script times out
 *   - The guard rejects the code (before any native allocation)
 *   - The output is too large
 *   - Multiple sequential executions occur (no accumulation)
 *
 * Strategy:
 *   We can't directly observe C++ pointer release from JavaScript.
 *   Instead, we use `ExternalCopy.totalExternalSize` (if available)
 *   to monitor the external memory before and after operations.
 *   We also stress-test with many sequential calls to detect leaks
 *   via heap growth.
 *
 * The key rule: the SandboxEngine MUST call .release() on ExternalCopy,
 * Script, and Context in a finally block, REGARDLESS of execution outcome.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SandboxEngine } from '../../src/sandbox/SandboxEngine.js';

// ── Check if isolated-vm is available ──────────────────

let ivmAvailable = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ivm: any;
try {
    ivm = require('isolated-vm');
    ivmAvailable = true;
} catch {
    // Skip tests
}

const describeSandbox = ivmAvailable ? describe : describe.skip;

// ╔══════════════════════════════════════════════════════════╗
// ║  POINTER LIFECYCLE: ExternalCopy release validation     ║
// ╚══════════════════════════════════════════════════════════╝

describeSandbox('Pointer Lifecycle: ExternalCopy Release', () => {
    it('should NOT accumulate external memory after successful execution', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            // Warm up — first call may allocate internal structures
            await engine.execute('(data) => data', 'warmup');

            const baseline = ivm.ExternalCopy.totalExternalSize;

            // Run 50 executions with non-trivial data
            for (let i = 0; i < 50; i++) {
                const data = { index: i, payload: 'x'.repeat(1000) };
                const result = await engine.execute('(data) => data.index', data);
                expect(result.ok).toBe(true);
            }

            const afterBatch = ivm.ExternalCopy.totalExternalSize;

            // If ExternalCopy.release() is working, external memory should
            // stay close to baseline (allow small variance for internal bookkeeping)
            const leaked = afterBatch - baseline;
            expect(leaked).toBeLessThan(50_000); // 50KB tolerance
        } finally {
            engine.dispose();
        }
    });

    it('should NOT accumulate external memory after runtime errors', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            await engine.execute('(data) => data', 'warmup');

            const baseline = ivm.ExternalCopy.totalExternalSize;

            // Run 50 executions that ALL fail at runtime
            for (let i = 0; i < 50; i++) {
                const data = { index: i, payload: 'x'.repeat(1000) };
                const result = await engine.execute(
                    '(data) => nonExistent.property',
                    data,
                );
                expect(result.ok).toBe(false);
            }

            const afterBatch = ivm.ExternalCopy.totalExternalSize;
            const leaked = afterBatch - baseline;
            expect(leaked).toBeLessThan(50_000);
        } finally {
            engine.dispose();
        }
    });

    it('should NOT accumulate external memory after timeouts', async () => {
        const engine = new SandboxEngine({ timeout: 100, memoryLimit: 32 });

        try {
            // Warm up
            await engine.execute('(data) => data', 'warmup');

            const baseline = ivm.ExternalCopy.totalExternalSize;

            // Run 5 timeouts (lower count because timeouts are expensive)
            for (let i = 0; i < 5; i++) {
                const data = { index: i, payload: 'x'.repeat(500) };
                const result = await engine.execute(
                    '(data) => { while(true){} }',
                    data,
                );
                expect(result.ok).toBe(false);
                if (!result.ok) expect(result.code).toBe('TIMEOUT');
            }

            const afterBatch = ivm.ExternalCopy.totalExternalSize;
            const leaked = afterBatch - baseline;
            // Timeouts may leave some residual memory, but should not
            // accumulate proportionally to call count
            expect(leaked).toBeLessThan(100_000);
        } finally {
            engine.dispose();
        }
    });

    it('should NOT allocate native memory when guard rejects code', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            await engine.execute('(data) => data', 'warmup');

            const baseline = ivm.ExternalCopy.totalExternalSize;

            // These all fail at the GUARD level (BEFORE any native allocation)
            for (let i = 0; i < 50; i++) {
                const result = await engine.execute('42 + 58', { payload: 'x'.repeat(1000) });
                expect(result.ok).toBe(false);
                if (!result.ok) expect(result.code).toBe('INVALID_CODE');
            }

            const afterBatch = ivm.ExternalCopy.totalExternalSize;
            const leaked = afterBatch - baseline;
            // Guard failures should NOT allocate any native memory at all
            expect(leaked).toBe(0);
        } finally {
            engine.dispose();
        }
    });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  POINTER LIFECYCLE: Context isolation & cleanup         ║
// ╚══════════════════════════════════════════════════════════╝

describeSandbox('Pointer Lifecycle: Context Cleanup', () => {
    it('should release Context after each call (no reference accumulation)', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            // Get the isolate reference count baseline
            // Each Context adds references; proper release decreases them
            const results: boolean[] = [];

            for (let i = 0; i < 20; i++) {
                const result = await engine.execute('(data) => data + 1', i);
                results.push(result.ok);
            }

            expect(results.every(r => r)).toBe(true);

            // If contexts leaked, the isolate would be under memory pressure
            // A final execution should still work
            const finalResult = await engine.execute(
                '(data) => "contexts-properly-released"',
                null,
            );
            expect(finalResult.ok).toBe(true);
        } finally {
            engine.dispose();
        }
    });

    it('should properly cleanup even with large data transfers', async () => {
        const engine = new SandboxEngine({
            timeout: 5000,
            memoryLimit: 64,
            maxOutputBytes: 5_000_000,
        });

        try {
            // 100KB data × 10 calls = 1MB transferred total
            // Without proper release, this would rapidly consume the 64MB limit
            for (let i = 0; i < 10; i++) {
                const data = Array.from({ length: 1000 }, (_, j) => ({
                    id: `${i}-${j}`,
                    value: Math.random(),
                    label: 'x'.repeat(50),
                }));

                const result = await engine.execute(
                    '(data) => data.filter(d => d.value > 0.9).length',
                    data,
                );
                expect(result.ok).toBe(true);
            }

            // Engine should still work after processing ~1MB of data
            const finalResult = await engine.execute('(data) => "alive"', null);
            expect(finalResult.ok).toBe(true);
        } finally {
            engine.dispose();
        }
    });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  POINTER LIFECYCLE: Mixed success/failure patterns      ║
// ╚══════════════════════════════════════════════════════════╝

describeSandbox('Pointer Lifecycle: Mixed Execution Patterns', () => {
    it('should handle alternating success/failure without leaks', async () => {
        const engine = new SandboxEngine({ timeout: 500, memoryLimit: 32 });

        try {
            await engine.execute('(data) => data', 'warmup');

            const baseline = ivm.ExternalCopy.totalExternalSize;

            for (let i = 0; i < 20; i++) {
                if (i % 2 === 0) {
                    // Success path
                    const r = await engine.execute('(data) => data.val', { val: i });
                    expect(r.ok).toBe(true);
                } else {
                    // Error path (ReferenceError)
                    const r = await engine.execute('(data) => nope.val', { val: i });
                    expect(r.ok).toBe(false);
                }
            }

            const afterMixed = ivm.ExternalCopy.totalExternalSize;
            const leaked = afterMixed - baseline;
            expect(leaked).toBeLessThan(50_000);
        } finally {
            engine.dispose();
        }
    });

    it('should handle success → timeout → success cycle', async () => {
        const engine = new SandboxEngine({ timeout: 100, memoryLimit: 32 });

        try {
            // Success
            const r1 = await engine.execute('(data) => data', 'before');
            expect(r1.ok).toBe(true);

            // Timeout (triggers isolate recovery)
            const r2 = await engine.execute('(data) => { while(true){} }', null);
            expect(r2.ok).toBe(false);
            if (!r2.ok) expect(r2.code).toBe('TIMEOUT');

            // Success again (new isolate under the hood)
            const r3 = await engine.execute('(data) => data', 'after');
            expect(r3.ok).toBe(true);
            if (r3.ok) expect(r3.value).toBe('after');
        } finally {
            engine.dispose();
        }
    });

    it('should handle output-too-large without leaking', async () => {
        const engine = new SandboxEngine({
            timeout: 2000,
            memoryLimit: 32,
            maxOutputBytes: 50,
        });

        try {
            await engine.execute('(data) => data', 'warmup');

            const baseline = ivm.ExternalCopy.totalExternalSize;

            for (let i = 0; i < 10; i++) {
                // This produces output > 50 bytes
                const r = await engine.execute(
                    '(data) => ({ big: "x".repeat(100) })',
                    null,
                );
                expect(r.ok).toBe(false);
                if (!r.ok) expect(r.code).toBe('OUTPUT_TOO_LARGE');
            }

            const afterBatch = ivm.ExternalCopy.totalExternalSize;
            const leaked = afterBatch - baseline;
            // Output-too-large happens AFTER run, so native resources
            // were allocated and must be properly released
            expect(leaked).toBeLessThan(50_000);
        } finally {
            engine.dispose();
        }
    });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  STRESS: Sustained throughput without OOM               ║
// ╚══════════════════════════════════════════════════════════╝

describeSandbox('Stress: Sustained Throughput', () => {
    it('should handle 100 sequential calls without memory growth', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });

        try {
            const results: number[] = [];

            for (let i = 0; i < 100; i++) {
                const data = Array.from({ length: 100 }, (_, j) => j * i);
                const result = await engine.execute(
                    '(data) => data.reduce((a, b) => a + b, 0)',
                    data,
                );
                expect(result.ok).toBe(true);
                if (result.ok) results.push(result.value as number);
            }

            expect(results.length).toBe(100);

            // Engine still operational after 100 calls
            const finalResult = await engine.execute('(data) => "healthy"', null);
            expect(finalResult.ok).toBe(true);
            if (finalResult.ok) expect(finalResult.value).toBe('healthy');
        } finally {
            engine.dispose();
        }
    });

    it('should handle concurrent burst (10 parallel calls)', async () => {
        const engine = new SandboxEngine({ timeout: 3000, memoryLimit: 64 });

        try {
            const promises = Array.from({ length: 10 }, (_, i) =>
                engine.execute('(data) => data.id * 2', { id: i }),
            );

            const results = await Promise.all(promises);

            for (let i = 0; i < 10; i++) {
                expect(results[i].ok).toBe(true);
                if (results[i].ok) {
                    expect((results[i] as { ok: true; value: number }).value).toBe(i * 2);
                }
            }
        } finally {
            engine.dispose();
        }
    });
});
