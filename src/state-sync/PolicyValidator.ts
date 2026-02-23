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
