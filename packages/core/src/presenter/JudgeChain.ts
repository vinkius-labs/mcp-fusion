/**
 * JudgeChain — Multi-Adapter LLM Evaluation Primitive
 *
 * Composable evaluation engine that supports 1 or more LLM judges
 * with configurable execution strategies. Designed to be shared
 * between PromptFirewall (output) and InputFirewall (input).
 *
 * Strategies:
 * - `fallback`: Try adapters sequentially. First success wins.
 *   If all fail → result depends on `failOpen` config.
 * - `consensus`: ALL adapters must agree. Any rejection → blocked.
 *   If any adapter fails → result depends on `failOpen` config.
 *
 * Reuses {@link SemanticProbeAdapter} from the Governance module
 * ("no hidden network dependencies" — the adapter is user-provided).
 *
 * @module
 */
import type { SemanticProbeAdapter } from '../introspection/SemanticProbe.js';

// ── Re-export ────────────────────────────────────────────

export type { SemanticProbeAdapter };
import { toErrorMessage } from '../core/ErrorUtils.js';

// ── Types ────────────────────────────────────────────────

/**
 * Execution strategy for the judge chain.
 *
 * - `fallback` — Sequential: try each adapter until one succeeds.
 * - `consensus` — Parallel: ALL adapters must agree to pass.
 */
export type JudgeStrategy = 'fallback' | 'consensus';

/**
 * Configuration for a JudgeChain.
 *
 * @example
 * ```typescript
 * const chain = createJudgeChain({
 *     adapters: [gptMini, claudeHaiku],
 *     strategy: 'fallback',
 *     timeoutMs: 3000,
 *     failOpen: false,
 * });
 * ```
 */
export interface JudgeChainConfig {
    /** One or more LLM adapters to use for evaluation */
    readonly adapters: readonly SemanticProbeAdapter[];

    /**
     * Execution strategy.
     *
     * - `'fallback'` — Try adapters sequentially. First success wins.
     * - `'consensus'` — ALL adapters must agree.
     *
     * @default 'fallback'
     */
    readonly strategy?: JudgeStrategy;

    /**
     * Timeout per individual adapter call in milliseconds.
     * Uses `Promise.race` with `AbortSignal.timeout` internally.
     *
     * @default 5000
     */
    readonly timeoutMs?: number;

    /**
     * Behavior when ALL adapters fail (timeout, error, unparseable).
     *
     * - `false` (default) — **Fail-closed**: content is BLOCKED.
     * - `true` — **Fail-open**: content PASSES (use with caution).
     *
     * @default false
     */
    readonly failOpen?: boolean;
}

/**
 * Structured result from a single adapter evaluation.
 */
export interface JudgeResult {
    /** Name of the adapter that produced this result */
    readonly adapterName: string;
    /** Whether the content passed the evaluation */
    readonly passed: boolean;
    /** Raw response from the adapter */
    readonly rawResponse: string;
    /** Evaluation duration in milliseconds */
    readonly durationMs: number;
}

/**
 * Aggregated result from the full judge chain evaluation.
 */
export interface JudgeChainResult {
    /** Whether the content passed the chain (considering strategy) */
    readonly passed: boolean;
    /** Individual results from each adapter that was called */
    readonly results: readonly JudgeResult[];
    /** Total evaluation duration in milliseconds */
    readonly totalDurationMs: number;
    /** Whether the result was determined by failOpen/failClosed (all adapters failed) */
    readonly fallbackTriggered: boolean;
}

/**
 * A compiled judge chain — call `evaluate(prompt)` to run.
 */
export interface JudgeChain {
    /** Execute the chain with the given prompt */
    evaluate(prompt: string): Promise<JudgeChainResult>;

    /** The underlying configuration */
    readonly config: Readonly<Required<JudgeChainConfig>>;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a compiled JudgeChain from configuration.
 *
 * @param config - Chain configuration (adapters, strategy, timeouts)
 * @returns A compiled {@link JudgeChain} ready for evaluation
 *
 * @example
 * ```typescript
 * import { createJudgeChain } from '@vurb/core';
 *
 * const chain = createJudgeChain({
 *     adapters: [
 *         { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) },
 *         { name: 'claude-haiku', evaluate: (p) => claude.message(p) },
 *     ],
 *     strategy: 'fallback',
 *     timeoutMs: 3000,
 * });
 *
 * const result = await chain.evaluate('Is this safe?');
 * if (!result.passed) { // blocked }
 * ```
 */
export function createJudgeChain(config: JudgeChainConfig): JudgeChain {
    if (config.adapters.length === 0) {
        throw new Error('[vurb] JudgeChain requires at least one adapter.');
    }

    const resolved: Required<JudgeChainConfig> = {
        adapters: config.adapters,
        strategy: config.strategy ?? 'fallback',
        timeoutMs: config.timeoutMs ?? 5000,
        failOpen: config.failOpen ?? false,
    };

    return {
        config: resolved,
        evaluate: (prompt: string) => executeChain(resolved, prompt),
    };
}

// ── Execution ────────────────────────────────────────────

/**
 * Execute a single adapter with timeout guard.
 *
 * Uses `Promise.race` pattern. On timeout, rejects with a descriptive error.
 *
 * @internal
 */
async function executeAdapter(
    adapter: SemanticProbeAdapter,
    prompt: string,
    timeoutMs: number,
    parseFn: (raw: string) => boolean,
): Promise<JudgeResult> {
    const start = Date.now();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Judge "${adapter.name}" timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        const rawResponse = await Promise.race([
            adapter.evaluate(prompt),
            timeoutPromise,
        ]);

        clearTimeout(timer);

        const passed = parseFn(rawResponse);

        return {
            adapterName: adapter.name,
            passed,
            rawResponse,
            durationMs: Date.now() - start,
        };
    } catch (err) {
        clearTimeout(timer);

        return {
            adapterName: adapter.name,
            passed: false,
            rawResponse: `ERROR: ${toErrorMessage(err)}`,
            durationMs: Date.now() - start,
        };
    }
}

/**
 * Execute the full chain with the configured strategy.
 *
 * @internal
 */
async function executeChain(
    config: Required<JudgeChainConfig>,
    prompt: string,
): Promise<JudgeChainResult> {
    const start = Date.now();
    const parseFn = parseJudgePass;

    if (config.strategy === 'fallback') {
        return executeFallback(config, prompt, parseFn, start);
    }

    return executeConsensus(config, prompt, parseFn, start);
}

/**
 * Fallback strategy: try adapters sequentially until one succeeds.
 *
 * @internal
 */
async function executeFallback(
    config: Required<JudgeChainConfig>,
    prompt: string,
    parseFn: (raw: string) => boolean,
    start: number,
): Promise<JudgeChainResult> {
    const results: JudgeResult[] = [];

    for (const adapter of config.adapters) {
        const result = await executeAdapter(adapter, prompt, config.timeoutMs, parseFn);
        results.push(result);

        // If we got a real response (not an error), use it
        if (!result.rawResponse.startsWith('ERROR:')) {
            return {
                passed: result.passed,
                results,
                totalDurationMs: Date.now() - start,
                fallbackTriggered: false,
            };
        }
        // Otherwise, try next adapter
    }

    // All adapters failed — apply failOpen/failClosed
    return {
        passed: config.failOpen,
        results,
        totalDurationMs: Date.now() - start,
        fallbackTriggered: true,
    };
}

/**
 * Consensus strategy: ALL adapters must agree.
 *
 * Runs all adapters in parallel. If any fails with an error,
 * the result depends on `failOpen`. If any returns `passed: false`,
 * the content is blocked regardless of `failOpen`.
 *
 * @internal
 */
async function executeConsensus(
    config: Required<JudgeChainConfig>,
    prompt: string,
    parseFn: (raw: string) => boolean,
    start: number,
): Promise<JudgeChainResult> {
    const settled = await Promise.allSettled(
        config.adapters.map(adapter =>
            executeAdapter(adapter, prompt, config.timeoutMs, parseFn),
        ),
    );

    const results: JudgeResult[] = [];
    let anyError = false;
    let anyRejected = false;

    for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
            results.push(outcome.value);
            if (outcome.value.rawResponse.startsWith('ERROR:')) {
                anyError = true;
            } else if (!outcome.value.passed) {
                anyRejected = true;
            }
        } else {
            anyError = true;
            results.push({
                adapterName: 'unknown',
                passed: false,
                rawResponse: `ERROR: ${String(outcome.reason)}`,
                durationMs: Date.now() - start,
            });
        }
    }

    // If any judge explicitly rejected → always blocked
    if (anyRejected) {
        return {
            passed: false,
            results,
            totalDurationMs: Date.now() - start,
            fallbackTriggered: false,
        };
    }

    // Bug #8 fix: in consensus mode, errors violate the "ALL must agree" contract.
    // Treat adapter errors as implicit rejections — the consensus requires every
    // adapter to succeed AND agree. failOpen only applies to fallback strategy.
    if (anyError) {
        return {
            passed: false,
            results,
            totalDurationMs: Date.now() - start,
            fallbackTriggered: true,
        };
    }

    // All judges passed
    return {
        passed: true,
        results,
        totalDurationMs: Date.now() - start,
        fallbackTriggered: false,
    };
}

// ── Response Parsing ─────────────────────────────────────

/**
 * Parse a judge's raw response to determine pass/fail.
 *
 * Expects a JSON response with a `"safe"` boolean field.
 * Falls back to text matching for non-JSON responses.
 *
 * @internal
 */
function parseJudgePass(raw: string): boolean {
    try {
        // Bug #150 fix: use extractLastJson instead of greedy regex
        // to avoid capturing non-JSON text between multiple braces.
        const jsonStr = extractLastJson(raw);
        if (jsonStr) {
            const parsed = JSON.parse(jsonStr) as {
                safe?: boolean;
                passed?: boolean;
                allowed?: boolean;
            };

            // Support multiple field names
            if (typeof parsed.safe === 'boolean') return parsed.safe;
            if (typeof parsed.passed === 'boolean') return parsed.passed;
            if (typeof parsed.allowed === 'boolean') return parsed.allowed;
        }
    } catch {
        // Fall through to text matching
    }

    // Text-based fallback — conservative (default: fail-closed)
    const lower = raw.toLowerCase();
    if (lower.includes('"safe": true') || lower.includes('"safe":true')) return true;
    if (lower.includes('"safe": false') || lower.includes('"safe":false')) return false;

    // Unparseable → treated as error (passthrough depends on failOpen)
    return false;
}

/**
 * Extract the last valid JSON object from a string.
 *
 * Scans from the end to find the last `}`, then tries each `{`
 * position from right-to-left, validating via `JSON.parse`.
 * This avoids the greedy regex problem AND handles braces
 * inside JSON string values (which break naive brace counting).
 *
 * Exported for reuse by PromptFirewall's `extractDetailedRejections`.
 *
 * @internal
 */
export function extractLastJson(raw: string): string | null {
    const lastClose = raw.lastIndexOf('}');
    if (lastClose === -1) return null;

    // Try each `{` from right to left — closest match to last `}` first.
    // JSON.parse validates correctness (handles braces inside strings,
    // nested objects, etc.) so no brace-counting heuristics are needed.
    for (let i = lastClose - 1; i >= 0; i--) {
        if (raw[i] === '{') {
            const candidate = raw.slice(i, lastClose + 1);
            try {
                JSON.parse(candidate);
                return candidate;
            } catch {
                continue;
            }
        }
    }
    return null;
}
