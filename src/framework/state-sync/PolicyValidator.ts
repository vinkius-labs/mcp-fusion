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

// ── Validate Policies ────────────────────────────────────

/**
 * Validate an array of policies. Throws on the first invalid entry.
 *
 * Called at PolicyEngine construction time for fail-fast behavior.
 * Validates:
 * - `match` is a non-empty string with valid glob segments
 * - `cacheControl` is a valid directive (if present)
 * - `invalidates` is an array of non-empty strings (if present)
 *
 * @throws {Error} Descriptive error identifying the invalid policy
 */
export function validatePolicies(policies: readonly SyncPolicy[]): void {
    for (let i = 0; i < policies.length; i++) {
        const p = policies[i]!;
        const prefix = `StateSync policy[${i}] (match: "${p.match}")`;

        // match — must be non-empty string
        if (!p.match || typeof p.match !== 'string') {
            throw new Error(`${prefix}: 'match' must be a non-empty string.`);
        }

        // match — each segment must be valid
        const segments = p.match.split('.');
        for (const seg of segments) {
            if (!VALID_SEGMENT.test(seg)) {
                throw new Error(
                    `${prefix}: invalid segment "${seg}". ` +
                    `Allowed: alphanumeric, "_", "-", "*", "**".`,
                );
            }
        }

        // cacheControl — must be a valid directive
        if (p.cacheControl !== undefined && !VALID_DIRECTIVES.has(p.cacheControl)) {
            throw new Error(
                `${prefix}: invalid cacheControl "${p.cacheControl}". ` +
                `Allowed: "no-store", "immutable".`,
            );
        }

        // invalidates — must be an array of valid glob-patterned strings
        if (p.invalidates !== undefined) {
            if (!Array.isArray(p.invalidates)) {
                throw new Error(`${prefix}: 'invalidates' must be an array.`);
            }
            for (const pattern of p.invalidates) {
                if (!pattern || typeof pattern !== 'string') {
                    throw new Error(`${prefix}: 'invalidates' entries must be non-empty strings.`);
                }
                // Validate glob segments within invalidation patterns
                const patternSegments = pattern.split('.');
                for (const seg of patternSegments) {
                    if (!VALID_SEGMENT.test(seg)) {
                        throw new Error(
                            `${prefix}: invalidates pattern "${pattern}" has invalid segment "${seg}". ` +
                            `Allowed: alphanumeric, "_", "-", "*", "**".`,
                        );
                    }
                }
            }
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
