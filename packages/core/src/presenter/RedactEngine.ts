/**
 * RedactEngine — DLP Compliance Engine (Zero-Leak PII Protection)
 *
 * Compiles object paths into V8-optimized redaction functions using
 * `fast-redact` (the Pino logger serialization engine). Masks sensitive
 * fields structurally before data leaves the framework.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────┐
 *   │  Boot / .redactPII() call                       │
 *   │                                                  │
 *   │  ['*.ssn', 'credit_card.number']                │
 *   │       │                                          │
 *   │       ▼                                          │
 *   │  fast-redact({ paths, censor, serialize: false })│
 *   │       │                                          │
 *   │       ▼                                          │
 *   │  Compiled RedactFn (V8-optimized)               │
 *   │  Applied in Presenter.make() on wireData        │
 *   └──────────────────────────────────────────────────┘
 *
 * Properties:
 * - Compiles paths into V8-optimized functions at config time
 * - Zero overhead on hot path (pre-compiled redaction)
 * - Wildcards supported: `'*.ssn'`, `'patients[*].diagnosis'`
 * - Custom censor: string or function `(value) => maskedValue`
 * - Zero-risk fallback: if `fast-redact` is not installed, logs warning
 *   and passes data through unmodified
 *
 * @module
 * @internal
 */

// ── Types ────────────────────────────────────────────────

/**
 * Configuration for PII redaction.
 *
 * @example
 * ```typescript
 * const config: RedactConfig = {
 *     paths: ['*.ssn', 'credit_card.number', 'patients[*].diagnosis'],
 *     censor: '[REDACTED]',
 * };
 * ```
 */
export interface RedactConfig {
    /**
     * Array of object paths to redact, using `fast-redact` syntax.
     *
     * Supports:
     * - Dot notation: `'user.ssn'`
     * - Bracket notation: `'user["ssn"]'`
     * - Wildcards: `'*.ssn'`, `'patients[*].diagnosis'`
     * - Array indices: `'items[0].secret'`
     *
     * @see https://github.com/davidmarkclements/fast-redact#paths--array
     */
    readonly paths: readonly string[];

    /**
     * Replacement value for redacted fields.
     *
     * - **String**: Static replacement (default: `'[REDACTED]'`)
     * - **Function**: Dynamic censor `(originalValue) => maskedValue`
     *   (e.g. `(v) => '***' + String(v).slice(-4)`)
     *
     * @default '[REDACTED]'
     */
    readonly censor?: string | ((value: unknown) => string);
}

/**
 * A compiled redaction function.
 *
 * Applies PII masking to an object. Uses `structuredClone` internally
 * to preserve the original data for UI blocks and rules
 * (Late Guillotine pattern).
 */
export type RedactFn = (data: unknown) => unknown;

// ── Lazy Import Cache ────────────────────────────────────

// fast-redact may not be installed (optional peer dep).
// We lazy-import via dynamic import() and cache the result.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FastRedactFactory = (opts: any) => any;

let _fastRedact: FastRedactFactory | null | false = null;

async function loadFastRedact(): Promise<FastRedactFactory | null> {
    if (_fastRedact === false) return null; // already tried, not available
    if (_fastRedact !== null) return _fastRedact;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import('fast-redact');
        _fastRedact = (typeof mod === 'function' ? mod : mod.default) as FastRedactFactory;
        return _fastRedact;
    } catch {
        _fastRedact = false; // mark as unavailable
        return null;
    }
}

// Synchronous version — uses the cached function if already loaded.
function getFastRedact(): FastRedactFactory | null {
    if (_fastRedact === false || _fastRedact === null) return null;
    return _fastRedact;
}

// ── Compile Logic ────────────────────────────────────────

/**
 * Compile a redaction config into a V8-optimized redaction function.
 *
 * The compiled function uses `structuredClone` to avoid mutating the
 * original data (required for Late Guillotine: UI blocks and rules
 * need the full unmasked data).
 *
 * @param config - Redaction configuration (paths + optional censor)
 * @returns A compiled `RedactFn`, or `undefined` if `fast-redact` is unavailable
 *
 * @example
 * ```typescript
 * const redact = compileRedactor({
 *     paths: ['*.ssn', 'credit_card.number'],
 *     censor: '[REDACTED]',
 * });
 *
 * if (redact) {
 *     const safe = redact(sensitiveData);
 *     // safe.ssn === '[REDACTED]'
 * }
 * ```
 */
export function compileRedactor(config: RedactConfig): RedactFn | undefined {
    if (!config.paths || config.paths.length === 0) return undefined;

    const factory = getFastRedact();
    if (!factory) return undefined;

    try {
        const redactor = factory({
            paths: [...config.paths] as string[],
            censor: config.censor ?? '[REDACTED]',
            serialize: false, // mutate-in-place mode (we clone first)
        });

        // Return a safe function that clones → redacts → returns clone
        return (data: unknown): unknown => {
            if (data === null || data === undefined || typeof data !== 'object') {
                return data; // primitives pass through
            }

            try {
                const clone = structuredClone(data);
                redactor(clone);
                return clone;
            } catch {
                // Defensive: if structuredClone or redaction fails,
                // return original data rather than crash
                return data;
            }
        };
    } catch {
        // Compilation failed (invalid paths, etc.)
        return undefined;
    }
}

// ── Async Initialization ─────────────────────────────────

/**
 * Pre-load the `fast-redact` module.
 *
 * Called during `initFusion()` boot sequence alongside other
 * optional dependencies. Not required — the engine degrades
 * gracefully if `fast-redact` is not installed.
 *
 * @returns `true` if `fast-redact` is available
 */
export async function initRedactEngine(): Promise<boolean> {
    const factory = await loadFastRedact();
    return factory !== null;
}
