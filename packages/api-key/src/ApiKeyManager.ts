/**
 * API Key Manager — Validation & Hashing
 *
 * Validates API keys using multiple strategies:
 * - Static key set (in-memory)
 * - SHA-256 hash comparison (for safe storage)
 * - Async validator function (database lookup)
 *
 * All comparisons use timing-safe operations to prevent timing attacks.
 *
 * @example
 * ```ts
 * import { ApiKeyManager } from '@vinkius-core/mcp-fusion-api-key';
 *
 * // Static keys
 * const manager = new ApiKeyManager({
 *     keys: ['sk_live_abc123', 'sk_live_def456'],
 * });
 *
 * // Hash-based (for DB storage)
 * const hash = ApiKeyManager.hashKey('sk_live_abc123');
 * const manager = new ApiKeyManager({ hashedKeys: [hash] });
 *
 * // Async validator (DB lookup)
 * const manager = new ApiKeyManager({
 *     validator: async (key) => {
 *         const record = await db.apiKeys.findByKey(key);
 *         return record ? { valid: true, metadata: { userId: record.userId } } : { valid: false };
 *     },
 * });
 * ```
 */

import * as crypto from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyManagerConfig {
    /** Static set of valid API keys (plaintext). */
    readonly keys?: readonly string[];

    /** Set of pre-hashed keys (SHA-256 hex). Use `ApiKeyManager.hashKey()` to generate. */
    readonly hashedKeys?: readonly string[];

    /**
     * Async validator function for dynamic key lookup (e.g., database).
     * Takes priority over `keys` and `hashedKeys` when provided.
     */
    readonly validator?: (key: string) => Promise<ApiKeyValidationResult>;

    /** Prefix required on API keys (e.g., 'sk_live_'). Optional. */
    readonly prefix?: string;

    /** Minimum key length. Default: 16 */
    readonly minLength?: number;
}

export interface ApiKeyValidationResult {
    /** Whether the key is valid. */
    readonly valid: boolean;

    /** Optional metadata about the key owner (userId, scopes, etc.). */
    readonly metadata?: Record<string, unknown>;

    /** Reason for rejection (only when valid is false). */
    readonly reason?: string;
}

// ============================================================================
// ApiKeyManager
// ============================================================================

export class ApiKeyManager {
    private readonly _config: ApiKeyManagerConfig;
    private readonly _minLength: number;
    private readonly _keyHashes: Set<string>;

    constructor(config: ApiKeyManagerConfig) {
        if (!config.keys?.length && !config.hashedKeys?.length && !config.validator) {
            throw new Error('ApiKeyManager requires at least one of: keys, hashedKeys, validator');
        }
        this._config = config;
        this._minLength = config.minLength ?? 16;

        // Pre-hash static keys for timing-safe comparison
        this._keyHashes = new Set<string>();
        if (config.keys) {
            for (const key of config.keys) {
                this._keyHashes.add(ApiKeyManager.hashKey(key));
            }
        }
        if (config.hashedKeys) {
            for (const hash of config.hashedKeys) {
                this._keyHashes.add(hash);
            }
        }
    }

    // ── Public API ───────────────────────────────────────

    /**
     * Validate an API key.
     *
     * @param key - Raw API key string
     * @returns Validation result with optional metadata
     */
    async validate(key: string): Promise<ApiKeyValidationResult> {
        // Format checks
        if (!key || typeof key !== 'string') {
            return { valid: false, reason: 'API key is empty or not a string' };
        }

        if (key.length < this._minLength) {
            return { valid: false, reason: `API key too short (min ${this._minLength} chars)` };
        }

        if (this._config.prefix && !key.startsWith(this._config.prefix)) {
            return { valid: false, reason: `API key must start with '${this._config.prefix}'` };
        }

        // Async validator takes priority
        if (this._config.validator) {
            return this._config.validator(key);
        }

        // Hash-based comparison (timing-safe)
        const keyHash = ApiKeyManager.hashKey(key);
        const isValid = this._isHashInSet(keyHash);

        return isValid
            ? { valid: true }
            : { valid: false, reason: 'Invalid API key' };
    }

    /**
     * Quick boolean check without detailed result.
     */
    async isValid(key: string): Promise<boolean> {
        const result = await this.validate(key);
        return result.valid;
    }

    // ── Static Utilities ─────────────────────────────────

    /**
     * Hash an API key using SHA-256 for safe storage.
     *
     * @param rawKey - Plaintext API key
     * @returns Hex-encoded SHA-256 hash
     */
    static hashKey(rawKey: string): string {
        return crypto.createHash('sha256').update(rawKey).digest('hex');
    }

    /**
     * Compare a raw key against a stored hash using timing-safe comparison.
     *
     * @param rawKey - Plaintext API key
     * @param storedHash - SHA-256 hex hash to compare against
     * @returns Whether the key matches the hash
     */
    static matchKey(rawKey: string, storedHash: string): boolean {
        const keyHash = ApiKeyManager.hashKey(rawKey);
        return ApiKeyManager._timingSafeCompare(keyHash, storedHash);
    }

    /**
     * Generate a random API key with optional prefix.
     *
     * @param options - Generation options
     * @returns Random API key string
     */
    static generateKey(options?: { prefix?: string; length?: number }): string {
        const prefix = options?.prefix ?? 'sk_';
        const length = options?.length ?? 32;
        const random = crypto.randomBytes(length).toString('base64url').slice(0, length);
        return `${prefix}${random}`;
    }

    // ── Private Helpers ──────────────────────────────────

    /**
     * Check if a hash exists in the pre-computed set using timing-safe comparison.
     * @internal
     */
    private _isHashInSet(hash: string): boolean {
        for (const stored of this._keyHashes) {
            if (ApiKeyManager._timingSafeCompare(hash, stored)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Timing-safe string comparison to prevent timing attacks.
     * @internal
     */
    private static _timingSafeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        try {
            return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
        } catch {
            return false;
        }
    }
}
