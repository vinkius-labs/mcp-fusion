/**
 * PolicyValidator — Fail-Fast Policy Validation
 *
 * Pure functions. Single responsibility: validate SyncPolicy arrays
 * and default config at construction time.
 *
 * Every validation error is caught eagerly — no invalid configuration
 * survives past PolicyEngine construction.
 *
 * @module
 */
import type { SyncPolicy, CacheDirective } from './types.js';
import { matchGlob } from './GlobMatcher.js';

// ── Constants ────────────────────────────────────────────

/** Valid cache directives — binary vocabulary, no max-age. */
export const VALID_DIRECTIVES: ReadonlySet<string> = new Set(['no-store', 'immutable']);

/** Valid glob segment: alphanumeric, `_`, `-`, `*`, `**`. */
const VALID_SEGMENT = /^(\*{1,2}|[a-zA-Z0-9_-]+)$/;

// ── Private Helpers ──────────────────────────────────────

/**
 * Assert that a glob pattern string is non-empty and has valid segments.
 *
 * @param pattern - The glob pattern to validate
 * @param label   - Human-readable label for the error message (e.g. "'match'")
 * @param prefix  - Context prefix for error grouping (e.g. "policy[0]")
 * @throws {Error} If the pattern is empty or contains invalid segments
 */
function assertValidGlob(pattern: string, label: string, prefix: string): void {
    if (pattern === '' || typeof pattern !== 'string') {
        throw new Error(`${prefix}: ${label} must be a non-empty string.`);
    }

    for (const seg of pattern.split('.')) {
        if (!VALID_SEGMENT.test(seg)) {
            throw new Error(
                `${prefix}: ${label} pattern "${pattern}" has invalid segment "${seg}". ` +
                `Allowed: alphanumeric, "_", "-", "*", "**".`,
            );
        }
    }
}

/**
 * Assert that a cache directive is one of the recognized values.
 *
 * @param directive - The directive value to check
 * @param prefix    - Context prefix for error grouping
 * @throws {Error} If the directive is not recognized
 */
function assertValidDirective(directive: string, prefix: string): void {
    if (!VALID_DIRECTIVES.has(directive)) {
        throw new Error(
            `${prefix}: invalid cacheControl "${directive}". ` +
            `Allowed: "no-store", "immutable".`,
        );
    }
}

/**
 * Assert that an invalidation list contains only valid glob patterns.
 *
 * @param invalidates - The array of invalidation patterns
 * @param prefix      - Context prefix for error grouping
 * @throws {Error} If any entry is not a valid glob string
 */
function assertValidInvalidates(invalidates: unknown, prefix: string): void {
    if (!Array.isArray(invalidates)) {
        throw new Error(`${prefix}: 'invalidates' must be an array.`);
    }

    for (const pattern of invalidates as string[]) {
        assertValidGlob(pattern, "'invalidates' entries must be non-empty strings. Entry", prefix);
    }
}

// ── Validate Policies ────────────────────────────────────

/**
 * Validate an array of policies. Throws on the first invalid entry.
 *
 * Called at PolicyEngine construction time for fail-fast behavior.
 *
 * @throws {Error} Descriptive error identifying the invalid policy
 */
export function validatePolicies(policies: readonly SyncPolicy[]): void {
    for (let i = 0; i < policies.length; i++) {
        const p = policies[i]!;
        const prefix = `StateSync policy[${i}]`;

        assertValidGlob(p.match, "'match'", prefix);

        if (p.cacheControl !== undefined) {
            assertValidDirective(p.cacheControl, prefix);
        }

        if (p.invalidates !== undefined) {
            assertValidInvalidates(p.invalidates, prefix);
        }
    }
}

// ── Validate Defaults ────────────────────────────────────

/**
 * Validate the defaults config. Throws if cacheControl is invalid.
 *
 * @throws {Error} If the default cacheControl directive is not recognized
 */
export function validateDefaults(
    defaults?: { readonly cacheControl?: CacheDirective },
): void {
    if (defaults?.cacheControl !== undefined && !VALID_DIRECTIVES.has(defaults.cacheControl)) {
        throw new Error(
            `StateSync default cacheControl "${defaults.cacheControl}" is invalid. ` +
            `Allowed: "no-store", "immutable".`,
        );
    }
}

// ── Overlap Detection ────────────────────────────────────

/**
 * Warning produced when two policies potentially overlap.
 *
 * Overlapping policies are not an error (first-match-wins is deterministic),
 * but they can cause subtle configuration bugs when the user expects a
 * more-specific policy to fire but a broader one shadows it.
 *
 * @example
 * ```typescript
 * const warnings = detectOverlaps(policies);
 * warnings.forEach(w => console.warn(`[StateSync] ${w.message}`));
 * ```
 */
export interface OverlapWarning {
    /** Human-readable description of the overlap. */
    readonly message: string;
    /** Index of the shadowing (earlier) policy. */
    readonly shadowingIndex: number;
    /** Index of the shadowed (later) policy. */
    readonly shadowedIndex: number;
}

/**
 * Detect potentially overlapping glob policies.
 *
 * Checks if a broader policy at index `i` could shadow a more-specific
 * policy at index `j > i`. Uses GlobMatcher to test if the earlier
 * pattern matches the later pattern's literal segments.
 *
 * This is a heuristic: it only catches cases where the later policy's
 * `match` string (treated as a literal tool name) would match the
 * earlier policy's glob. It does NOT do full set-intersection analysis.
 *
 * @param policies - The policies array to analyze
 * @returns Array of overlap warnings (empty if no overlaps detected)
 */
export function detectOverlaps(policies: readonly SyncPolicy[]): readonly OverlapWarning[] {
    const warnings: OverlapWarning[] = [];

    for (let i = 0; i < policies.length; i++) {
        for (let j = i + 1; j < policies.length; j++) {
            const earlier = policies[i]!.match;
            const later = policies[j]!.match;

            // If the later policy's match pattern (as a literal name)
            // would be caught by the earlier policy's glob, it's shadowed.
            if (matchGlob(earlier, later)) {
                warnings.push({
                    message:
                        `policy[${i}] (match: "${earlier}") shadows policy[${j}] (match: "${later}"). ` +
                        `The later policy will never match because first-match-wins applies.`,
                    shadowingIndex: i,
                    shadowedIndex: j,
                });
            }
        }
    }

    return warnings;
}
