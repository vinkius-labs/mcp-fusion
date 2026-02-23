/**
 * PolicyEngine — First-Match-Wins Policy Resolution
 *
 * Single responsibility: resolve a tool name to its applicable policy.
 * Delegates glob matching to GlobMatcher and validation to PolicyValidator.
 *
 * Stateless after construction. Resolution results are cached in a Map
 * for O(1) repeat lookups — the glob iteration only happens once per
 * unique tool name.
 *
 * Cache is bounded to {@link MAX_CACHE_SIZE} entries to prevent unbounded
 * memory growth from dynamic tool names.
 *
 * @example
 * ```typescript
 * const engine = new PolicyEngine(
 *     [{ match: 'sprints.*', cacheControl: 'no-store' }],
 *     { cacheControl: 'no-store' },
 * );
 *
 * engine.resolve('sprints.get');    // { cacheControl: 'no-store' }
 * engine.resolve('sprints.get');    // O(1) — cached
 * engine.resolve('unknown.tool');   // { cacheControl: 'no-store' } — default
 * ```
 *
 * @module
 */
import type { SyncPolicy, ResolvedPolicy, CacheDirective } from './types.js';
import { matchGlob } from './GlobMatcher.js';
import { validatePolicies, validateDefaults } from './PolicyValidator.js';

/**
 * Maximum number of cached resolutions.
 *
 * In practice, MCP servers have a finite set of tools (~10-200).
 * This cap exists purely as a safety net against adversarial
 * or dynamically-generated tool names that could grow unboundedly.
 * When hit, the cache is cleared (full eviction) to avoid memory leak.
 */
const MAX_CACHE_SIZE = 2048;

export class PolicyEngine {
    private readonly _policies: readonly SyncPolicy[];
    private readonly _defaultCacheControl: CacheDirective | undefined;

    /**
     * Resolution cache: avoids repeated glob iteration for the same tool name.
     * Key = tool name, Value = resolved policy or null (no match, no default).
     */
    private readonly _cache = new Map<string, ResolvedPolicy | null>();

    /**
     * Pre-computed resolved policies, one per policy entry.
     * Built once at construction time so multiple tool names matching
     * the same policy share the same frozen object reference.
     */
    private readonly _resolvedByIndex: ReadonlyArray<ResolvedPolicy | null>;

    /**
     * Pre-frozen default-only resolution. Created once at construction
     * if defaults are configured, reused for every unmatched tool name.
     */
    private readonly _defaultResolved: Readonly<ResolvedPolicy> | null;

    /**
     * Construct a PolicyEngine with eager validation.
     *
     * @param policies - Policy rules, evaluated in declaration order
     * @param defaults - Fallback applied when no policy matches
     * @throws {Error} If any policy or default is invalid
     */
    constructor(
        policies: readonly SyncPolicy[],
        defaults?: { readonly cacheControl?: CacheDirective },
    ) {
        validatePolicies(policies);
        validateDefaults(defaults);

        this._policies = Object.freeze([...policies]);
        this._defaultCacheControl = defaults?.cacheControl;

        // Pre-freeze default resolution to avoid repeated object allocation
        this._defaultResolved = this._defaultCacheControl
            ? Object.freeze({ cacheControl: this._defaultCacheControl })
            : null;

        // Pre-compute a frozen ResolvedPolicy for each policy entry.
        // This way, N tool names matching the same policy share one object.
        this._resolvedByIndex = Object.freeze(
            this._policies.map(p => this._buildResolved(p)),
        );
    }

    /**
     * Resolve the applicable policy for a tool name.
     *
     * First matching policy wins. Falls back to defaults if no match.
     * Returns `null` if no policy matches and no defaults are configured.
     *
     * Results are cached — repeated calls for the same tool name are O(1).
     */
    resolve(toolName: string): ResolvedPolicy | null {
        const cached = this._cache.get(toolName);
        if (cached !== undefined) return cached;

        const result = this._resolveUncached(toolName);

        // Bounded cache: evict all when hitting the cap.
        // In practice this never triggers for normal MCP servers,
        // but prevents unbounded growth from adversarial input.
        if (this._cache.size >= MAX_CACHE_SIZE) {
            this._cache.clear();
        }

        this._cache.set(toolName, result);
        return result;
    }

    // ── Private ──────────────────────────────────────────

    private _resolveUncached(toolName: string): ResolvedPolicy | null {
        for (let i = 0; i < this._policies.length; i++) {
            if (matchGlob(this._policies[i]!.match, toolName)) {
                return this._resolvedByIndex[i]!;
            }
        }

        // No policy matched — return pre-frozen default (or null)
        return this._defaultResolved;
    }

    /**
     * Build a frozen ResolvedPolicy from a SyncPolicy.
     * Merges policy cacheControl with the default as fallback.
     * Called once per policy at construction time.
     */
    private _buildResolved(policy: SyncPolicy): ResolvedPolicy | null {
        const cacheControl = policy.cacheControl ?? this._defaultCacheControl;
        const invalidates = policy.invalidates;
        const hasInvalidates = (invalidates?.length ?? 0) > 0;

        // No effective policy — nothing to do
        if (!cacheControl && !hasInvalidates) return null;

        // Build the object conditionally to satisfy strict typing.
        // Each branch freezes only the properties that are defined.
        if (cacheControl && hasInvalidates) {
            return Object.freeze({ cacheControl, invalidates: invalidates! });
        }
        if (cacheControl) {
            return Object.freeze({ cacheControl });
        }
        // hasInvalidates is true here (guard above ensures at least one)
        return Object.freeze({ invalidates: invalidates! });
    }
}

