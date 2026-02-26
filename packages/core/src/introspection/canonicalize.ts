/**
 * Canonical — Shared Cryptographic Primitives
 *
 * Deterministic JSON serialization and SHA-256 hashing
 * used across governance modules. Single source of truth
 * eliminates duplication and guarantees behavioral consistency.
 *
 * @module
 * @internal
 */
import { createHash } from 'node:crypto';

// ============================================================================
// Hashing
// ============================================================================

/**
 * SHA-256 hash of a string, returned as lowercase hex.
 *
 * @param input - The string to hash
 * @returns 64-character hex digest
 */
export function sha256(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Canonical JSON serialization with deterministic key ordering.
 *
 * Guarantees that two structurally identical objects produce
 * the same string regardless of property insertion order.
 * This is critical for content-addressed hashing — the same
 * contract must always produce the same digest.
 *
 * @param obj - The value to serialize
 * @returns Deterministic JSON string
 */
export function canonicalize(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) => {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return Object.keys(value as Record<string, unknown>)
                .sort()
                .reduce<Record<string, unknown>>((sorted, k) => {
                    sorted[k] = (value as Record<string, unknown>)[k];
                    return sorted;
                }, {});
        }
        return value;
    });
}
