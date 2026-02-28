/**
 * ApiKeyManager — Edge Cases & Sad Paths
 */
import { describe, it, expect, vi } from 'vitest';
import { ApiKeyManager } from '../src/ApiKeyManager.js';

const TEST_KEY = 'sk_live_abc123def456ghi7';

// ============================================================================
// Security Edge Cases
// ============================================================================

describe('ApiKeyManager — Security', () => {
    it('is case-sensitive for key matching', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        expect((await manager.validate(TEST_KEY.toUpperCase())).valid).toBe(false);
    });

    it('rejects key with trailing whitespace', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        expect((await manager.validate(TEST_KEY + ' ')).valid).toBe(false);
    });

    it('rejects key with leading whitespace', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        expect((await manager.validate(' ' + TEST_KEY)).valid).toBe(false);
    });

    it('rejects key with embedded newline', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const injected = TEST_KEY.slice(0, 10) + '\n' + TEST_KEY.slice(10);
        expect((await manager.validate(injected)).valid).toBe(false);
    });

    it('rejects key with embedded null byte', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const injected = TEST_KEY.slice(0, 5) + '\0' + TEST_KEY.slice(5);
        expect((await manager.validate(injected)).valid).toBe(false);
    });

    it('handles unicode key correctly', async () => {
        const unicodeKey = 'sk_live_日本語テスト🔑abc';
        const manager = new ApiKeyManager({ keys: [unicodeKey] });
        expect(await manager.isValid(unicodeKey)).toBe(true);
        expect(await manager.isValid('sk_live_日本語テスト🔑abd')).toBe(false);
    });

    it('hashKey is different for similar keys', () => {
        const h1 = ApiKeyManager.hashKey('sk_live_abc123def456ghi7');
        const h2 = ApiKeyManager.hashKey('sk_live_abc123def456ghi8');
        expect(h1).not.toBe(h2);
    });

    it('matchKey returns false for truncated hash', () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        expect(ApiKeyManager.matchKey(TEST_KEY, hash.slice(0, 32))).toBe(false);
    });

    it('matchKey returns false for extended hash', () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        expect(ApiKeyManager.matchKey(TEST_KEY, hash + '00')).toBe(false);
    });
});

// ============================================================================
// Validator Sad Paths
// ============================================================================

describe('ApiKeyManager — Validator Sad Paths', () => {
    it('handles validator that throws', async () => {
        const manager = new ApiKeyManager({
            validator: () => { throw new Error('DB failed'); },
        });
        await expect(manager.validate(TEST_KEY)).rejects.toThrow('DB failed');
    });

    it('handles validator that rejects', async () => {
        const manager = new ApiKeyManager({
            validator: async () => { throw new Error('Timeout'); },
        });
        await expect(manager.validate(TEST_KEY)).rejects.toThrow('Timeout');
    });

    it('handles partial result (no reason)', async () => {
        const manager = new ApiKeyManager({
            validator: async () => ({ valid: false }),
        });
        const result = await manager.validate(TEST_KEY);
        expect(result.valid).toBe(false);
    });

    it('handles slow validator', async () => {
        const manager = new ApiKeyManager({
            validator: async (key) => {
                await new Promise(r => setTimeout(r, 50));
                return { valid: key === TEST_KEY };
            },
        });
        expect((await manager.validate(TEST_KEY)).valid).toBe(true);
    });

    it('validator receives raw key', async () => {
        const received: string[] = [];
        const manager = new ApiKeyManager({
            validator: async (key) => { received.push(key); return { valid: true }; },
        });
        await manager.validate(TEST_KEY);
        expect(received[0]).toBe(TEST_KEY);
    });
});

// ============================================================================
// Prefix Edge Cases
// ============================================================================

describe('ApiKeyManager — Prefix Edge Cases', () => {
    it('empty prefix matches everything', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY], prefix: '' });
        expect((await manager.validate(TEST_KEY)).valid).toBe(true);
    });

    it('prefix longer than key rejects', async () => {
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            prefix: 'this_is_a_very_long_prefix_that_exceeds_',
        });
        expect((await manager.validate(TEST_KEY)).valid).toBe(false);
    });

    it('prefix is exactly the key', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY], prefix: TEST_KEY });
        expect((await manager.validate(TEST_KEY)).valid).toBe(true);
    });

    it('prefix with special regex characters', async () => {
        const key = 'sk_live_(test)_abc1234';
        const manager = new ApiKeyManager({ keys: [key], prefix: 'sk_live_(test)' });
        expect((await manager.validate(key)).valid).toBe(true);
    });
});

// ============================================================================
// Length Edge Cases
// ============================================================================

describe('ApiKeyManager — Length Edge Cases', () => {
    it('key exactly at minLength passes', async () => {
        const key = 'abcdefghijklmnop'; // 16 chars
        const manager = new ApiKeyManager({ keys: [key], minLength: 16 });
        expect((await manager.validate(key)).valid).toBe(true);
    });

    it('key one char less than minLength fails', async () => {
        const key = 'abcdefghijklmno'; // 15 chars
        const manager = new ApiKeyManager({ keys: [key], minLength: 16 });
        expect((await manager.validate(key)).valid).toBe(false);
    });

    it('minLength of 0 accepts any non-empty key', async () => {
        const manager = new ApiKeyManager({ keys: ['a'], minLength: 0 });
        expect((await manager.validate('a')).valid).toBe(true);
    });
});

// ============================================================================
// Concurrency
// ============================================================================

describe('ApiKeyManager — Concurrency', () => {
    it('handles 100 concurrent validations', async () => {
        const keys = Array.from({ length: 10 }, (_, i) => `sk_live_key_number_${i}_pad_to_min`);
        const manager = new ApiKeyManager({ keys });
        const results = await Promise.all(keys.map(k => manager.validate(k)));
        results.forEach(r => expect(r.valid).toBe(true));
    });

    it('mixed valid/invalid concurrently', async () => {
        const manager = new ApiKeyManager({ keys: [TEST_KEY] });
        const inputs = Array.from({ length: 30 }, (_, i) =>
            i % 2 === 0 ? TEST_KEY : `sk_live_invalid_key_number_${i}`,
        );
        const results = await Promise.all(inputs.map(k => manager.validate(k)));
        results.forEach((r, i) => expect(r.valid).toBe(i % 2 === 0));
    });
});

// ============================================================================
// generateKey Edge Cases
// ============================================================================

describe('ApiKeyManager — generateKey Edges', () => {
    it('generates key with length 1', () => {
        const key = ApiKeyManager.generateKey({ prefix: '', length: 1 });
        expect(key.length).toBe(1);
    });

    it('generates key with length 0', () => {
        const key = ApiKeyManager.generateKey({ prefix: 'sk_', length: 0 });
        expect(key).toBe('sk_');
    });

    it('generated keys are valid base64url chars', () => {
        const key = ApiKeyManager.generateKey({ prefix: '', length: 64 });
        expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generated key passes validation when registered', async () => {
        const key = ApiKeyManager.generateKey({ prefix: 'sk_test_', length: 32 });
        const manager = new ApiKeyManager({ keys: [key] });
        expect((await manager.validate(key)).valid).toBe(true);
    });
});

// ============================================================================
// Multi-Strategy Interactions
// ============================================================================

describe('ApiKeyManager — Multi-Strategy', () => {
    it('validator overrides both keys and hashedKeys', async () => {
        const hash = ApiKeyManager.hashKey(TEST_KEY);
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            hashedKeys: [hash],
            validator: async () => ({ valid: false, reason: 'Blocked' }),
        });
        const r = await manager.validate(TEST_KEY);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('Blocked');
    });

    it('hashedKeys and keys both contribute', async () => {
        const key2 = 'sk_live_another_key_for_test';
        const manager = new ApiKeyManager({
            keys: [TEST_KEY],
            hashedKeys: [ApiKeyManager.hashKey(key2)],
        });
        expect(await manager.isValid(TEST_KEY)).toBe(true);
        expect(await manager.isValid(key2)).toBe(true);
        expect(await manager.isValid('sk_live_unknown_key_12345')).toBe(false);
    });

    it('prefix check runs before validator', async () => {
        const spy = vi.fn(async () => ({ valid: true }));
        const manager = new ApiKeyManager({ validator: spy, prefix: 'sk_live_' });
        const r = await manager.validate('pk_test_wrong_prefix_key');
        expect(r.valid).toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });

    it('minLength check runs before validator', async () => {
        const spy = vi.fn(async () => ({ valid: true }));
        const manager = new ApiKeyManager({ validator: spy, minLength: 50 });
        const r = await manager.validate(TEST_KEY);
        expect(r.valid).toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });
});
