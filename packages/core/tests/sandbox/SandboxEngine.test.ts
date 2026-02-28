/**
 * SandboxEngine.test.ts
 *
 * Tests for the Zero-Trust V8 Isolate engine.
 *
 * These tests require `isolated-vm` to be installed.
 * When `isolated-vm` is NOT available, the suite is skipped
 * gracefully (the SandboxEngine constructor throws a clear error).
 *
 * Validates:
 *   - Successful execution of arrow functions
 *   - Timeout enforcement (no event loop blocking)
 *   - Output size limits
 *   - V8 isolation: no process, require, fs, globalThis leaks
 *   - Disposed engine returns UNAVAILABLE
 *   - Error classification (SYNTAX, RUNTIME, INVALID_CODE)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SandboxEngine } from '../../src/sandbox/SandboxEngine.js';

// ── Check if isolated-vm is available ──────────────────

let ivmAvailable = false;
try {
    require('isolated-vm');
    ivmAvailable = true;
} catch {
    // isolated-vm not installed — skip heavy tests
}

// ============================================================================
// Constructor & Availability
// ============================================================================

describe('SandboxEngine: Availability', () => {
    (ivmAvailable ? it.skip : it)(
        'should throw clear error when isolated-vm is not installed',
        () => {
            // This test only runs when isolated-vm is NOT available
            expect(() => new SandboxEngine()).toThrow('isolated-vm');
        },
    );
});

// ============================================================================
// Execution Tests (require isolated-vm)
// ============================================================================

const describeSandbox = ivmAvailable ? describe : describe.skip;

describeSandbox('SandboxEngine: Execution', () => {
    let engine: SandboxEngine;

    beforeAll(() => {
        engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32, maxOutputBytes: 10_000 });
    });

    afterAll(() => {
        engine?.dispose();
    });

    it('should execute a simple filter', async () => {
        const data = [
            { name: 'A', risk: 95 },
            { name: 'B', risk: 30 },
            { name: 'C', risk: 88 },
        ];
        const result = await engine.execute(
            '(data) => data.filter(d => d.risk > 80)',
            data,
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toEqual([
                { name: 'A', risk: 95 },
                { name: 'C', risk: 88 },
            ]);
            expect(result.executionMs).toBeGreaterThan(0);
        }
    });

    it('should execute a map transformation', async () => {
        const data = [1, 2, 3, 4, 5];
        const result = await engine.execute(
            '(data) => data.map(x => x * x)',
            data,
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toEqual([1, 4, 9, 16, 25]);
        }
    });

    it('should execute a reduce aggregation', async () => {
        const data = [{ amount: 100 }, { amount: 250 }, { amount: 50 }];
        const result = await engine.execute(
            '(data) => data.reduce((sum, d) => sum + d.amount, 0)',
            data,
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(400);
        }
    });

    it('should return a scalar value', async () => {
        const result = await engine.execute('(data) => data.length', [1, 2, 3]);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(3);
        }
    });

    it('should handle null/undefined data gracefully', async () => {
        const result = await engine.execute('(data) => data === null', null);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(true);
        }
    });
});

// ============================================================================
// Security Tests (V8 Isolation)
// ============================================================================

describeSandbox('SandboxEngine: V8 Isolation (Security)', () => {
    let engine: SandboxEngine;

    beforeAll(() => {
        engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
    });

    afterAll(() => {
        engine?.dispose();
    });

    it('should NOT have process object (ReferenceError)', async () => {
        const result = await engine.execute('(data) => process.env', {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('RUNTIME');
            expect(result.error).toContain('process');
        }
    });

    it('should NOT have require function', async () => {
        // Guard catches require(), but if someone obfuscates,
        // the V8 Context has no require — ReferenceError
        const result = await engine.execute(
            '(data) => { const r = globalThis["req" + "uire"]; return r("fs"); }',
            {},
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('RUNTIME');
        }
    });

    it('should NOT have console.log', async () => {
        const result = await engine.execute('(data) => console.log("leaked")', {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('RUNTIME');
        }
    });

    it('should NOT allow setTimeout', async () => {
        const result = await engine.execute(
            '(data) => setTimeout(() => {}, 100)',
            {},
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('RUNTIME');
        }
    });
});

// ============================================================================
// Timeout Tests
// ============================================================================

describeSandbox('SandboxEngine: Timeout', () => {
    it('should enforce timeout on infinite loop', async () => {
        const engine = new SandboxEngine({ timeout: 200, memoryLimit: 32 });

        try {
            const result = await engine.execute(
                '(data) => { while(true) {} }',
                {},
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('TIMEOUT');
                expect(result.error).toContain('timed out');
            }
        } finally {
            engine.dispose();
        }
    });

    it('should NOT block the event loop during timeout', async () => {
        const engine = new SandboxEngine({ timeout: 200, memoryLimit: 32 });

        try {
            // Fire the sandbox AND a timer concurrently
            // If the event loop is blocked, promiseResult won't resolve
            const [sandboxResult, timerResult] = await Promise.all([
                engine.execute('(data) => { while(true) {} }', {}),
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
// Output Size Guard
// ============================================================================

describeSandbox('SandboxEngine: Output Size', () => {
    it('should reject output exceeding maxOutputBytes', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32, maxOutputBytes: 100 });

        try {
            // Generate a large output
            const result = await engine.execute(
                '(data) => "x".repeat(500)',
                null,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('OUTPUT_TOO_LARGE');
                expect(result.error).toContain('exceeds');
            }
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Error Classification
// ============================================================================

describeSandbox('SandboxEngine: Error Classification', () => {
    let engine: SandboxEngine;

    beforeAll(() => {
        engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
    });

    afterAll(() => {
        engine?.dispose();
    });

    it('should classify guard failure as INVALID_CODE', async () => {
        const result = await engine.execute('42 + 58', {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('INVALID_CODE');
        }
    });

    it('should classify TypeError as RUNTIME', async () => {
        const result = await engine.execute(
            '(data) => data.nonExistent.property',
            null,
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('RUNTIME');
        }
    });
});

// ============================================================================
// Dispose Tests
// ============================================================================

describeSandbox('SandboxEngine: Lifecycle', () => {
    it('should return UNAVAILABLE after dispose', async () => {
        const engine = new SandboxEngine({ timeout: 1000, memoryLimit: 16 });
        engine.dispose();

        const result = await engine.execute('(data) => data', {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('UNAVAILABLE');
        }
    });

    it('should be idempotent on double dispose', () => {
        const engine = new SandboxEngine({ timeout: 1000, memoryLimit: 16 });
        engine.dispose();
        expect(() => engine.dispose()).not.toThrow();
        expect(engine.isDisposed).toBe(true);
    });
});
