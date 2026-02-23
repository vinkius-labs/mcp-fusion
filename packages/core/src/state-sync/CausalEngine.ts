/**
 * CausalEngine — Mutation Detection + isError Guard
 *
 * Pure function. Single responsibility: given a resolved policy
 * and the tool call outcome, determine which domain patterns
 * should be invalidated.
 *
 * Safety rules:
 * 1. If the response has `isError: true` → no invalidation (mutation failed, state unchanged)
 * 2. If the policy has `invalidates` → return those patterns
 * 3. Otherwise → empty array (no invalidation needed)
 *
 * @module
 */
import type { ResolvedPolicy } from './types.js';

/**
 * Resolve which domain patterns should be invalidated after a tool call.
 *
 * The `isError` guard is critical: a failed mutation means the database
 * state didn't change, so invalidating caches would be incorrect and
 * would force unnecessary re-reads.
 *
 * @param policy  - The resolved policy for the tool that was called
 * @param isError - Whether the tool call returned an error
 * @returns Array of glob patterns to invalidate, or empty if none
 */
export function resolveInvalidations(
    policy: ResolvedPolicy | null,
    isError: boolean,
): readonly string[] {
    if (isError) return [];
    return policy?.invalidates ?? [];
}
