/**
 * Canonical — Shared Cryptographic Primitives
 *
 * Deterministic JSON serialization and SHA-256 hashing
 * used across governance modules. Single source of truth
 * eliminates duplication and guarantees behavioral consistency.
 *
 * Uses Web Crypto API (globalThis.crypto.subtle) for runtime
 * agnosticism — works on Node.js 20+, Cloudflare Workers, Deno, Bun.
 *
 * @module
 * @internal
 */

// ============================================================================
// Hashing
// ============================================================================

/**
 * SHA-256 hash of a string, returned as lowercase hex.
 *
 * Uses the Web Crypto API (crypto.subtle) for runtime agnosticism.
 *
 * @param input - The string to hash
 * @returns 64-character hex digest
 */
export async function sha256(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);

    // Web Crypto API (browsers, Cloudflare Workers, Deno, Bun, Node 20+)
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
        return hexFromBuffer(hashBuffer);
    }

    // Node.js fallback (test environments, older Node versions)
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(data).digest('hex');
}

/**
 * Convert an ArrayBuffer to lowercase hex string.
 * @internal
 */
function hexFromBuffer(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
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
