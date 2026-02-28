/**
 * ApiKeyManager Tests
 *
 * Covers:
 * - Constructor validation
 * - Static key set validation
 * - Hash-based key validation
 * - Async validator function
 * - Prefix validation
 * - Minimum length check
 * - Static utilities: hashKey, matchKey, generateKey
 * - Timing-safe comparison
 * - Edge cases: empty input, null, duplicates
 */
import { describe, it, expect, vi } from 'vitest';
import { ApiKeyManager } from '../src/ApiKeyManager.js';

const TEST_KEY = 'sk_live_abc123def456ghi7';
const TEST_KEY_2 = 'sk_live_xyz789uvw012abc3';

// ============================================================================
// Constructor
// ============================================================================

describe('ApiKeyManager — Constructor', () => {
    it('should throw when no validation method is provided', () => {
        expect(() => new ApiKeyManager({} as any)).toThrow(/at least one of/);
    });

    it('should accept keys config', () => {
        expect(() => new ApiKeyManager({ keys: [TEST_KEY] })).not.toThrow();
    });

    it('should accept hashedKeys config', () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        expect(() => new ApiKeyManager({ hashedKeys: [hash] })).not.toThrow();
    });

    it('should accept validator config', () => {
        expect(() => new ApiKeyManager({
            validator: async () => ({ valid: true }),
        })).not.toThrow();
    });
});

// ============================================================================
// Static Key Set
// ============================================================================

describe('ApiKeyManager — Static Keys', () => {
    it('should validate a known key', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY, TEST_KEY_2] });
        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(true);
    });

    it('should reject an unknown key', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const result = await manager.validate('sk_live_unknown_key_1234');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Invalid');
    });

    it('should validate second key in set', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY, TEST_KEY_2] });
        const result = await manager.validate(TEST_KEY_2);
        expect(result.valid).toBe(true);
    });

    it('isValid() shorthand should return boolean', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        expect(await manager.isValid(TEST_KEY)).toBe(true);
        expect(await manager.isValid('invalid-key-at-least-16ch')).toBe(false);
    });
});

// ============================================================================
// Hash-Based Validation
// ============================================================================

describe('ApiKeyManager — Hashed Keys', () => {
    it('should validate a key against its hash', async () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        const manager = new ApiKeyManager({ hashedKeys: [hash] });

        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(true);
    });

    it('should reject a key that does not match any hash', async () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        const manager = new ApiKeyManager({ hashedKeys: [hash] });

        const result = await manager.validate(TEST_KEY_2);
        expect(result.valid).toBe(false);
    });

    it('should support mixed keys and hashedKeys', async () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY_2);
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            hashedKeys: [hash],
        });

        expect(await manager.isValid(TEST_KEY)).toBe(true);
        expect(await manager.isValid(TEST_KEY_2)).toBe(true);
    });
});

// ============================================================================
// Async Validator
// ============================================================================

describe('ApiKeyManager — Async Validator', () => {
    it('should use validator function', async () => {
        const validator = vi.fn(async (key: string) => ({
            valid: key === TEST_KEY,
            metadata: { userId: 'u-1' },
        }));

        const manager = new ApiKeyManager({ validator });

        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(true);
        expect(result.metadata).toEqual({ userId: 'u-1' });
        expect(validator).toHaveBeenCalledWith(TEST_KEY);
    });

    it('should reject via validator', async () => {
        const manager = new ApiKeyManager({
            validator: async () => ({ valid: false, reason: 'Key revoked' }),
        });

        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Key revoked');
    });

    it('validator takes priority over static keys', async () => {
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            validator: async () => ({ valid: false, reason: 'Blocked by validator' }),
        });

        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(false);
    });
});

// ============================================================================
// Prefix & Length Validation
// ============================================================================

describe('ApiKeyManager — Prefix & Length', () => {
    it('should reject key without required prefix', async () => {
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            prefix: 'pk_',
        });

        const result = await manager.validate(TEST_KEY); // starts with sk_
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('pk_');
    });

    it('should accept key with correct prefix', async () => {
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            prefix: 'sk_',
        });

        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(true);
    });

    it('should reject key shorter than minLength', async () => {
        const manager = new ApiKeyManager({
            keys: ['short'],
            minLength: 20,
        });

        const result = await manager.validate('short');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('short');
    });

    it('should use default minLength of 16', async () => {
        const manager = new ApiKeyManager({
            keys: ['short-key'],
        });

        const result = await manager.validate('short-key');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('short');
    });
});

// ============================================================================
// Static Utilities
// ============================================================================

describe('ApiKeyManager — Static Utilities', () => {
    it('hashKey() should produce consistent SHA-256 hex', () => {
        const hash1 = ApiKeyManager.hashKey(TEST_KEY);
        const hash2 = ApiKeyManager.hashKey(TEST_KEY);
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('hashKey() should produce different hashes for different keys', () => {
        const hash1 = ApiKeyManager.hashKey(TEST_KEY);
        const hash2 = ApiKeyManager.hashKey(TEST_KEY_2);
        expect(hash1).not.toBe(hash2);
    });

    it('matchKey() should return true for matching key', () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        expect(ApiKeyManager.matchKey(TEST_KEY, hash)).toBe(true);
    });

    it('matchKey() should return false for non-matching key', () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        expect(ApiKeyManager.matchKey(TEST_KEY_2, hash)).toBe(false);
    });

    it('generateKey() should produce key with default prefix', () => {
        const key = ApiKeyManager.generateKey();
        expect(key).toMatch(/^sk_/);
        expect(key.length).toBeGreaterThan(3);
    });

    it('generateKey() should use custom prefix and length', () => {
        const key = ApiKeyManager.generateKey({ prefix: 'api_', length: 16 });
        expect(key).toMatch(/^api_/);
        expect(key.length).toBe(4 + 16); // prefix + length
    });

    it('generateKey() should produce unique keys', () => {
        const keys = new Set<string>();
        for (let i = 0; i < 100; i++) {
            keys.add(ApiKeyManager.generateKey());
        }
        expect(keys.size).toBe(100);
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('ApiKeyManager — Edge Cases', () => {
    it('should reject empty string', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const result = await manager.validate('');
        expect(result.valid).toBe(false);
    });

    it('should reject null', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const result = await manager.validate(null as unknown as string);
        expect(result.valid).toBe(false);
    });

    it('should reject undefined', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const result = await manager.validate(undefined as unknown as string);
        expect(result.valid).toBe(false);
    });

    it('should handle very long key without crash', async () => {
        const longKey = 'sk_' + 'a'.repeat(10000);
        const manager = new ApiKeyManager({ keys: [longKey] });
        const result = await manager.validate(longKey);
        expect(result.valid).toBe(true);
    });
});
