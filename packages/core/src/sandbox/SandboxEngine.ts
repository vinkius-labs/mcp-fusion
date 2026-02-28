/**
 * SandboxEngine — Zero-Trust V8 Isolate for Computation Delegation
 *
 * Allows LLMs to send JavaScript functions as strings to be executed
 * in a sealed V8 isolate. The data stays on the client's machine,
 * only the result travels back to the LLM.
 *
 * Architecture (V8 Engineering Rules):
 *   1. ONE Isolate per SandboxEngine (boot ~5-10ms), reused across requests
 *   2. NEW Context per execute() call (~0.1ms), pristine and empty
 *   3. ExternalCopy + Script + Context are ALWAYS released in `finally`
 *   4. Execution is ALWAYS async (script.run, never runSync)
 *   5. Context is empty — no process, require, fs, globalThis injected
 *   6. AbortSignal kills isolate.dispose() instantly (Connection Watchdog)
 *
 * The `isolated-vm` package is a peerDependency (optional).
 * If not installed, the engine throws a clear error at construction time.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  SandboxEngine (owns 1 Isolate)                         │
 *   │                                                         │
 *   │  execute(code, data, { signal? })                       │
 *   │    ┌──────────┐                                         │
 *   │    │ Abort?   │ pre-flight signal check                  │
 *   │    ├──────────┤                                         │
 *   │    │ Guard    │ fail-fast syntax check                   │
 *   │    ├──────────┤                                         │
 *   │    │ Context  │ new per request (empty!)                 │
 *   │    ├──────────┤                                         │
 *   │    │ Copy In  │ ExternalCopy (deep, no refs)             │
 *   │    ├──────────┤                                         │
 *   │    │ Compile  │ isolate.compileScript                    │
 *   │    ├──────────┤                                         │
 *   │    │ Run      │ script.run (ASYNC, with timeout + abort) │
 *   │    ├──────────┤                                         │
 *   │    │ Copy Out │ JSON.parse result                        │
 *   │    └──────────┘                                         │
 *   │                                                         │
 *   │  finally: signal.removeEventListener()                  │
 *   │           inputCopy.release()                           │
 *   │           script.release()                              │
 *   │           context.release()                             │
 *   └─────────────────────────────────────────────────────────┘
 *
 * @module
 */

import { validateSandboxCode } from './SandboxGuard.js';

// ── Types ────────────────────────────────────────────────

/**
 * Configuration for a SandboxEngine instance.
 *
 * All fields are optional — sensible defaults are applied.
 *
 * @example
 * ```typescript
 * const engine = new SandboxEngine({
 *     timeout: 3000,       // Kill after 3s
 *     memoryLimit: 64,     // 64MB per isolate
 *     maxOutputBytes: 512_000, // 500KB max result
 * });
 * ```
 */
export interface SandboxConfig {
    /**
     * Maximum execution time in milliseconds.
     * If the script exceeds this, the V8 isolate kills it.
     * @default 5000
     */
    timeout?: number;

    /**
     * Maximum memory for the V8 isolate in megabytes.
     * If exceeded, the isolate dies and is recreated on next call.
     * @default 128
     */
    memoryLimit?: number;

    /**
     * Maximum size of the serialized output in bytes.
     * Prevents a malicious script from returning gigabytes of data.
     * @default 1_048_576 (1MB)
     */
    maxOutputBytes?: number;
}

/**
 * Error codes for sandbox execution failures.
 *
 * - `TIMEOUT`: Script exceeded the time limit
 * - `MEMORY`: Isolate ran out of memory (auto-recovered)
 * - `SYNTAX`: JavaScript syntax error in the provided code
 * - `RUNTIME`: Script threw an error during execution
 * - `OUTPUT_TOO_LARGE`: Result exceeds `maxOutputBytes`
 * - `INVALID_CODE`: Failed the SandboxGuard fail-fast check
 * - `UNAVAILABLE`: `isolated-vm` is not installed
 * - `ABORTED`: Execution was cancelled via AbortSignal (client disconnect)
 */
export type SandboxErrorCode =
    | 'TIMEOUT'
    | 'MEMORY'
    | 'SYNTAX'
    | 'RUNTIME'
    | 'OUTPUT_TOO_LARGE'
    | 'INVALID_CODE'
    | 'UNAVAILABLE'
    | 'ABORTED';

/**
 * Result of a sandbox execution.
 *
 * @example
 * ```typescript
 * const result = await engine.execute('(data) => data.length', [1, 2, 3]);
 * if (result.ok) {
 *     console.log(result.value);       // 3
 *     console.log(result.executionMs); // 0.42
 * } else {
 *     console.log(result.code);  // 'TIMEOUT'
 *     console.log(result.error); // 'Script execution timed out (5000ms)'
 * }
 * ```
 */
export type SandboxResult<T = unknown> =
    | { readonly ok: true; readonly value: T; readonly executionMs: number }
    | { readonly ok: false; readonly error: string; readonly code: SandboxErrorCode };

// ── Constants ────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576; // 1MB

// ── Lazy Require ─────────────────────────────────────────

/**
 * Lazy-load isolated-vm to avoid hard dependency.
 * Returns `null` if the package is not installed.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ivm: any = undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIvm(): any {
    if (_ivm !== undefined) return _ivm;
    try {
        // Dynamic import would be cleaner but isolated-vm uses
        // native bindings that require synchronous resolution.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        _ivm = require('isolated-vm');
    } catch {
        _ivm = null;
    }
    return _ivm;
}

// ── Engine Implementation ────────────────────────────────

/**
 * Zero-trust V8 sandbox for executing LLM-provided JavaScript.
 *
 * Creates a single V8 `Isolate` at construction time and reuses it
 * across all `execute()` calls. Each call gets a fresh, empty `Context`
 * with no dangerous globals (no `process`, `require`, `fs`, etc.).
 *
 * If the isolate dies (e.g., OOM), it is automatically recreated
 * on the next `execute()` call.
 *
 * @example
 * ```typescript
 * const sandbox = new SandboxEngine({ timeout: 3000, memoryLimit: 64 });
 *
 * const result = await sandbox.execute(
 *     '(data) => data.filter(d => d.risk > 90)',
 *     [{ name: 'A', risk: 95 }, { name: 'B', risk: 30 }],
 * );
 *
 * if (result.ok) {
 *     console.log(result.value); // [{ name: 'A', risk: 95 }]
 * }
 *
 * // IMPORTANT: dispose when no longer needed
 * sandbox.dispose();
 * ```
 */
export class SandboxEngine {
    private readonly _timeout: number;
    private readonly _memoryLimit: number;
    private readonly _maxOutputBytes: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _isolate: any; // ivm.Isolate
    private _disposed = false;

    constructor(config?: SandboxConfig) {
        this._timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;
        this._memoryLimit = config?.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB;
        this._maxOutputBytes = config?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

        const ivm = getIvm();
        if (!ivm) {
            throw new Error(
                'SandboxEngine requires the "isolated-vm" package. ' +
                'Install it with: npm install isolated-vm',
            );
        }

        this._isolate = new ivm.Isolate({ memoryLimit: this._memoryLimit });
    }

    /**
     * Execute a JavaScript function string against the provided data.
     *
     * The function is compiled and run in a sealed V8 isolate with:
     * - No `process`, `require`, `fs`, or network access
     * - Strict timeout enforcement (async, non-blocking)
     * - Memory limit enforcement
     * - Automatic C++ pointer cleanup (ExternalCopy, Script, Context)
     * - Cooperative cancellation via AbortSignal (Connection Watchdog)
     *
     * @param code - A JavaScript function expression as a string.
     *   Must be an arrow function or function expression.
     *   Example: `(data) => data.filter(d => d.value > 10)`
     *
     * @param data - The data to pass into the function.
     *   Deeply copied into the isolate (no references leak).
     *
     * @param options - Optional execution options.
     * @param options.signal - AbortSignal for cooperative cancellation.
     *   When the signal fires (e.g., MCP client disconnects), the engine
     *   calls `isolate.dispose()` to kill the V8 C++ threads instantly.
     *   The isolate is auto-recovered on the next `.execute()` call.
     *
     * @returns A `SandboxResult` with the computed value or an error.
     */
    async execute<T = unknown>(
        code: string,
        data: unknown,
        options?: { signal?: AbortSignal },
    ): Promise<SandboxResult<T>> {
        if (this._disposed) {
            return { ok: false, error: 'SandboxEngine has been disposed.', code: 'UNAVAILABLE' };
        }

        const signal = options?.signal;

        // ── Step 0: Pre-flight abort check ───────────────
        // If the signal is already aborted (client disconnected before
        // we even started), skip all V8 allocation entirely.
        if (signal?.aborted) {
            return {
                ok: false,
                error: 'Execution aborted: client disconnected before sandbox started.',
                code: 'ABORTED',
            };
        }

        // ── Step 1: Fail-fast guard ─────────────────────
        const guard = validateSandboxCode(code);
        if (!guard.ok) {
            return { ok: false, error: guard.violation!, code: 'INVALID_CODE' };
        }

        // ── Step 2: Ensure isolate is alive ─────────────
        this._ensureIsolate();

        const ivm = getIvm();
        const isolate = this._isolate;

        // ── Step 3: Wire abort kill-switch ──────────────
        // When the signal fires, we call isolate.dispose() which
        // immediately kills the V8 C++ threads. The _ensureIsolate()
        // method will recreate a fresh isolate on the next call.
        let aborted = false;
        const onAbort = signal ? () => {
            aborted = true;
            try { isolate.dispose(); } catch { /* may already be dead */ }
        } : undefined;

        if (signal && onAbort) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        // ── Step 4: Execute in sealed context ───────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let inputCopy: any | undefined;   // ivm.ExternalCopy
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let context: any | undefined;     // ivm.Context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let script: any | undefined;      // ivm.Script

        const startMs = performance.now();

        try {
            // Create pristine context (NO globals injected — this IS the security)
            context = await isolate.createContext();

            // Deep-copy data into isolated heap (no references!)
            inputCopy = new ivm.ExternalCopy(data);
            await context.global.set('__input__', inputCopy.copyInto());

            // Compile with wrapper: call the function and serialize result
            const wrappedCode = `const __fn__ = ${code};\nJSON.stringify(__fn__(__input__));`;
            script = await isolate.compileScript(wrappedCode);

            // ASYNC execution — never blocks the Node.js event loop
            const rawResult = await script.run(context, { timeout: this._timeout });

            const executionMs = performance.now() - startMs;

            // ── Step 5: Output size guard ───────────────
            if (typeof rawResult === 'string' && rawResult.length > this._maxOutputBytes) {
                return {
                    ok: false,
                    error: `Output size (${rawResult.length} bytes) exceeds limit (${this._maxOutputBytes} bytes). ` +
                        'Use more selective filters to reduce the result set.',
                    code: 'OUTPUT_TOO_LARGE',
                };
            }

            // ── Step 6: Parse result ────────────────────
            const parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
            return { ok: true, value: parsed as T, executionMs };

        } catch (err: unknown) {
            // If the abort listener disposed the isolate, classify as ABORTED
            // (not MEMORY — the user disconnected, not an OOM condition)
            if (aborted) {
                return {
                    ok: false,
                    error: 'Execution aborted: client disconnected during sandbox execution.',
                    code: 'ABORTED',
                };
            }
            return this._classifyError(err);
        } finally {
            // ── MANDATORY ABORT LISTENER CLEANUP ─────────
            // Remove the listener to prevent memory leaks when
            // execution completes before the signal fires.
            if (signal && onAbort) {
                signal.removeEventListener('abort', onAbort);
            }

            // ── MANDATORY C++ POINTER RELEASE ────────────
            // Order matters: release inner resources first.
            // After abort-triggered dispose, these will throw
            // but the catch blocks handle dead-isolate gracefully.
            try { inputCopy?.release(); } catch { /* already released or isolate dead */ }
            try { script?.release(); } catch { /* already released or isolate dead */ }
            try { context?.release(); } catch { /* already released or isolate dead */ }
        }
    }

    /**
     * Release all resources held by this engine.
     *
     * After calling `dispose()`, any subsequent `execute()` calls
     * will return `{ ok: false, code: 'UNAVAILABLE' }`.
     */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        try {
            this._isolate?.dispose();
        } catch {
            // Isolate may already be dead (OOM)
        }
    }

    /**
     * Check if the engine has been disposed.
     */
    get isDisposed(): boolean {
        return this._disposed;
    }

    // ── Private ──────────────────────────────────────────

    /**
     * Ensure the isolate is alive. If it died (OOM), create a new one.
     * @internal
     */
    private _ensureIsolate(): void {
        const ivm = getIvm();
        // Check if isolate is still usable
        try {
            if (this._isolate?.isDisposed) {
                this._isolate = new ivm.Isolate({ memoryLimit: this._memoryLimit });
            }
        } catch {
            // isDisposed threw → isolate is dead, recreate
            this._isolate = new ivm.Isolate({ memoryLimit: this._memoryLimit });
        }
    }

    /**
     * Classify an error from V8 execution into a typed SandboxResult.
     * @internal
     */
    private _classifyError(err: unknown): SandboxResult<never> {
        const message = err instanceof Error ? err.message : String(err);

        // Timeout: isolated-vm throws a specific error
        if (message.includes('Script execution timed out')) {
            return {
                ok: false,
                error: `Script execution timed out (${this._timeout}ms). ` +
                    'Simplify the computation or increase the timeout limit.',
                code: 'TIMEOUT',
            };
        }

        // Memory: V8 kills the isolate
        if (
            message.includes('Isolate was disposed') ||
            message.includes('out of memory') ||
            message.includes('allocation failed')
        ) {
            // Mark isolate for recreation on next call
            try { this._isolate?.dispose(); } catch { /* ignore */ }
            return {
                ok: false,
                error: `Isolate ran out of memory (${this._memoryLimit}MB limit). ` +
                    'Reduce the data size or simplify the computation.',
                code: 'MEMORY',
            };
        }

        // Syntax: V8 compilation error
        if (message.includes('SyntaxError')) {
            return {
                ok: false,
                error: `JavaScript syntax error: ${message}`,
                code: 'SYNTAX',
            };
        }

        // Runtime: any other V8 error (ReferenceError, TypeError, etc.)
        return {
            ok: false,
            error: `Runtime error: ${message}`,
            code: 'RUNTIME',
        };
    }
}
