/**
 * State Sync — Type Definitions
 *
 * Binary cache vocabulary for LLM temporal awareness.
 * Uses RFC 7234 semantics deeply embedded in LLM pre-training data.
 *
 * There is no `max-age`. LLMs have no clock — time-based expiration
 * is meaningless inside a context window.
 *
 * @see {@link StateSyncConfig} for the public configuration interface
 * @see {@link https://arxiv.org/abs/2510.23853 | "Your LLM Agents are Temporally Blind"}
 * @see {@link https://www.preprints.org/manuscript/202601.0910 | "State Drift in Language-Conditioned Autonomous Agents"}
 *
 * @module
 */

// ── Cache Directives ─────────────────────────────────────

/**
 * Binary cache directive for tool responses.
 *
 * - `'no-store'` — Never reuse cached data. Always re-fetch.
 *   Use for volatile data: balances, inventory, patient records.
 *
 * - `'immutable'` — Safe to cache forever. Data will never change.
 *   Use for reference data: countries, currencies, ICD-10 codes.
 *
 * LLMs have seen `Cache-Control: no-store` millions of times in HTTP docs,
 * API specs, and developer discussions. The association between `no-store`
 * and "do not reuse this response" is deeply embedded in model weights.
 */
export type CacheDirective = 'no-store' | 'immutable';

// ── Policy ───────────────────────────────────────────────

/**
 * A single policy rule matched by glob pattern.
 *
 * Policies control two behaviors:
 * 1. **Description decoration** — Append `[Cache-Control: X]` to tool descriptions
 * 2. **Causal invalidation** — After successful mutations, signal which domains are stale
 *
 * @example
 * ```typescript
 * // Read tools: mark as volatile
 * { match: 'sprints.get', cacheControl: 'no-store' }
 *
 * // Write tools: mark volatile + declare causal invalidations
 * { match: 'sprints.update', invalidates: ['sprints.*'] }
 *
 * // Reference data: safe to cache forever
 * { match: 'countries.*', cacheControl: 'immutable' }
 * ```
 */
export interface SyncPolicy {
    /**
     * Glob pattern to match tool names.
     *
     * Uses dot-separated segments with wildcard support:
     * - `*` matches exactly one segment
     * - `**` matches zero or more segments
     *
     * @example `'sprints.*'`, `'tasks.update'`, `'**'`
     */
    readonly match: string;

    /** Cache directive to apply to matching tools' descriptions. */
    readonly cacheControl?: CacheDirective;

    /**
     * Glob patterns of tools whose cached data is invalidated on success.
     *
     * Only triggers when the tool call succeeds (`isError !== true`).
     * The LLM receives: `[System: Cache invalidated for X — caused by Y]`
     *
     * @example `['sprints.*', 'tasks.*']`
     */
    readonly invalidates?: readonly string[];
}

// ── Configuration ────────────────────────────────────────

/**
 * State Sync configuration.
 *
 * Policies are evaluated in declaration order (first match wins).
 * Defaults apply when no policy matches a tool.
 *
 * @example
 * ```typescript
 * const stateSync: StateSyncConfig = {
 *     defaults: { cacheControl: 'no-store' },
 *     policies: [
 *         { match: 'sprints.update', invalidates: ['sprints.*'] },
 *         { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },
 *         { match: 'countries.*',    cacheControl: 'immutable' },
 *     ],
 * };
 *
 * registry.attachToServer(server, { stateSync });
 * ```
 */
export interface StateSyncConfig {
    /** Policy rules, evaluated in declaration order (first match wins). */
    readonly policies: readonly SyncPolicy[];

    /** Defaults applied when no policy matches a tool. */
    readonly defaults?: {
        readonly cacheControl?: CacheDirective;
    };
}

// ── Resolved Policy ──────────────────────────────────────

/**
 * Result of resolving a policy for a specific tool name.
 *
 * Produced by the PolicyEngine after first-match-wins resolution.
 * Consumed by the description and response decorators.
 *
 * @internal
 */
export interface ResolvedPolicy {
    readonly cacheControl?: CacheDirective;
    readonly invalidates?: readonly string[];
}
