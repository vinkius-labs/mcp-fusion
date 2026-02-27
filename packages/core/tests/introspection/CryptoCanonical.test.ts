/**
 * CryptoCanonical — Unit Tests for canonicalize.ts & CryptoAttestation.ts
 *
 * Dedicated unit tests for the cryptographic primitives:
 * - sha256: deterministic hashing via Web Crypto API
 * - canonicalize: deterministic JSON serialization
 * - HMAC signer: sign/verify roundtrip
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { sha256, canonicalize } from '../../src/introspection/canonicalize.js';
import {
    createHmacSigner,
    attestServerDigest,
    verifyAttestation,
} from '../../src/introspection/CryptoAttestation.js';
import { computeServerDigest } from '../../src/introspection/BehaviorDigest.js';
import type { ToolContract, ActionContract } from '../../src/introspection/ToolContract.js';

// ============================================================================
// 1 · sha256
// ============================================================================

describe('sha256', () => {
    it('returns a 64-character hex digest', async () => {
        const hash = await sha256('hello');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same input produces same output', async () => {
        const a = await sha256('deterministic-test');
        const b = await sha256('deterministic-test');
        expect(a).toBe(b);
    });

    it('produces a known hash for "hello"', async () => {
        const hash = await sha256('hello');
        // SHA-256 of "hello" — well-known test vector
        expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('handles empty string', async () => {
        const hash = await sha256('');
        // SHA-256 of "" — well-known test vector
        expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('handles Unicode input', async () => {
        const hash = await sha256('こんにちは世界');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles multi-byte emoji', async () => {
        const hash = await sha256('🚀🔥💻');
        expect(hash).toHaveLength(64);
    });

    it('different inputs produce different hashes', async () => {
        const a = await sha256('input-a');
        const b = await sha256('input-b');
        expect(a).not.toBe(b);
    });

    it('handles large input', async () => {
        const largeInput = 'x'.repeat(100_000);
        const hash = await sha256(largeInput);
        expect(hash).toHaveLength(64);
    });

    it('handles newlines and whitespace', async () => {
        const a = await sha256('line1\nline2');
        const b = await sha256('line1\nline2');
        expect(a).toBe(b);
        // Whitespace matters
        const c = await sha256('line1 \nline2');
        expect(a).not.toBe(c);
    });
});

// ============================================================================
// 2 · canonicalize
// ============================================================================

describe('canonicalize', () => {
    it('sorts object keys alphabetically', () => {
        const a = canonicalize({ z: 1, a: 2, m: 3 });
        const b = canonicalize({ a: 2, m: 3, z: 1 });
        expect(a).toBe(b);
        // Keys should be in alphabetical order
        const parsed = JSON.parse(a);
        expect(Object.keys(parsed)).toEqual(['a', 'm', 'z']);
    });

    it('sorts nested object keys recursively', () => {
        const a = canonicalize({ b: { y: 1, x: 2 }, a: 1 });
        const b = canonicalize({ a: 1, b: { x: 2, y: 1 } });
        expect(a).toBe(b);
    });

    it('preserves array order (arrays are not sorted)', () => {
        const result = canonicalize({ items: [3, 1, 2] });
        const parsed = JSON.parse(result);
        expect(parsed.items).toEqual([3, 1, 2]);
    });

    it('handles null values', () => {
        const result = canonicalize({ a: null, b: 1 });
        expect(result).toContain('"a":null');
    });

    it('handles empty object', () => {
        expect(canonicalize({})).toBe('{}');
    });

    it('handles empty array', () => {
        expect(canonicalize([])).toBe('[]');
    });

    it('handles nested arrays of objects', () => {
        const a = canonicalize({ items: [{ z: 1, a: 2 }, { b: 3 }] });
        const b = canonicalize({ items: [{ a: 2, z: 1 }, { b: 3 }] });
        expect(a).toBe(b);
    });

    it('handles primitive values', () => {
        expect(canonicalize(42)).toBe('42');
        expect(canonicalize('hello')).toBe('"hello"');
        expect(canonicalize(true)).toBe('true');
        expect(canonicalize(null)).toBe('null');
    });

    it('handles deeply nested structures', () => {
        const deep = { l1: { l2: { l3: { l4: { val: 'deep' } } } } };
        const result = canonicalize(deep);
        expect(result).toContain('"val":"deep"');
    });

    it('handles special characters in keys and values', () => {
        const obj = { 'key with spaces': 'value\nwith\nnewlines', 'émoji': '🚀' };
        const result = canonicalize(obj);
        expect(result).toBeTruthy();
        const parsed = JSON.parse(result);
        expect(parsed['key with spaces']).toBe('value\nwith\nnewlines');
    });

    it('determinism: object with same structure but different insertion order', () => {
        const obj1: Record<string, unknown> = {};
        obj1['first'] = 1;
        obj1['second'] = 2;
        obj1['third'] = 3;

        const obj2: Record<string, unknown> = {};
        obj2['third'] = 3;
        obj2['first'] = 1;
        obj2['second'] = 2;

        expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    });

    it('handles boolean and number values correctly', () => {
        const result = canonicalize({ bool: false, num: 0, negNum: -1 });
        const parsed = JSON.parse(result);
        expect(parsed.bool).toBe(false);
        expect(parsed.num).toBe(0);
        expect(parsed.negNum).toBe(-1);
    });
});

// ============================================================================
// 3 · HMAC Signer
// ============================================================================

describe('createHmacSigner', () => {
    const secret = 'test-secret-at-least-32-bytes-long!!';

    it('sign returns a hex string', async () => {
        const signer = createHmacSigner(secret);
        const signature = await signer.sign('test-digest');
        expect(signature).toMatch(/^[0-9a-f]+$/);
    });

    it('sign is deterministic', async () => {
        const signer = createHmacSigner(secret);
        const sig1 = await signer.sign('same-input');
        const sig2 = await signer.sign('same-input');
        expect(sig1).toBe(sig2);
    });

    it('verify returns true for valid signature', async () => {
        const signer = createHmacSigner(secret);
        const signature = await signer.sign('my-digest');
        const valid = await signer.verify('my-digest', signature);
        expect(valid).toBe(true);
    });

    it('verify returns false for wrong digest', async () => {
        const signer = createHmacSigner(secret);
        const signature = await signer.sign('original-digest');
        const valid = await signer.verify('tampered-digest', signature);
        expect(valid).toBe(false);
    });

    it('verify returns false for wrong signature', async () => {
        const signer = createHmacSigner(secret);
        const valid = await signer.verify('my-digest', 'deadbeef');
        expect(valid).toBe(false);
    });

    it('different secrets produce different signatures', async () => {
        const signer1 = createHmacSigner('secret-one-at-least-32-bytes!!!!');
        const signer2 = createHmacSigner('secret-two-at-least-32-bytes!!!!');
        const sig1 = await signer1.sign('same-digest');
        const sig2 = await signer2.sign('same-digest');
        expect(sig1).not.toBe(sig2);
    });

    it('signer has name "hmac-sha256"', () => {
        const signer = createHmacSigner(secret);
        expect(signer.name).toBe('hmac-sha256');
    });

    it('rejects empty secret (Web Crypto API limitation)', async () => {
        const signer = createHmacSigner('');
        await expect(signer.sign('test')).rejects.toThrow();
    });
});

// ============================================================================
// 4 · Attestation Roundtrip
// ============================================================================

describe('attestServerDigest + verifyAttestation roundtrip', () => {
    const secret = 'roundtrip-test-secret-at-least-32-bytes!!';

    async function makeTestAction(): Promise<ActionContract> {
        return {
            description: 'Test action',
            destructive: false,
            idempotent: true,
            readOnly: true,
            requiredFields: [],
            presenterName: undefined,
            inputSchemaDigest: await sha256('action-schema'),
            hasMiddleware: false,
        };
    }

    async function makeTestContract(): Promise<ToolContract> {
        return {
            surface: {
                name: 'test-tool',
                description: 'A test tool',
                tags: ['test'],
                actions: { run: await makeTestAction() },
                inputSchemaDigest: await sha256('schema'),
            },
            behavior: {
                egressSchemaDigest: await sha256('egress'),
                systemRulesFingerprint: 'static:rules',
                cognitiveGuardrails: { agentLimitMax: 50, egressMaxBytes: null },
                middlewareChain: [],
                stateSyncFingerprint: null,
                concurrencyFingerprint: null,
                affordanceTopology: [],
                embeddedPresenters: [],
            },
            tokenEconomics: {
                schemaFieldCount: 3,
                unboundedCollection: false,
                baseOverheadTokens: 50,
                inflationRisk: 'low',
            },
            entitlements: {
                filesystem: false,
                network: false,
                subprocess: false,
                crypto: false,
                codeEvaluation: false,
                raw: [],
            },
        };
    }

    it('attest then verify with same secret succeeds', async () => {
        const contracts = { tool: await makeTestContract() };
        const digest = await computeServerDigest(contracts);

        const attestation = await attestServerDigest(digest, { signer: 'hmac', secret });
        expect(attestation.valid).toBe(true);
        expect(attestation.signature).toBeTruthy();

        const verification = await verifyAttestation(digest, attestation.signature!, {
            signer: 'hmac',
            secret,
        });
        expect(verification.valid).toBe(true);
    });

    it('attest then verify with different secret fails', async () => {
        const contracts = { tool: await makeTestContract() };
        const digest = await computeServerDigest(contracts);

        const attestation = await attestServerDigest(digest, { signer: 'hmac', secret });
        const verification = await verifyAttestation(digest, attestation.signature!, {
            signer: 'hmac',
            secret: 'wrong-secret-completely-different-value!!',
        });
        expect(verification.valid).toBe(false);
    });

    it('attestation result contains expected fields', async () => {
        const contracts = { tool: await makeTestContract() };
        const digest = await computeServerDigest(contracts);

        const attestation = await attestServerDigest(digest, { signer: 'hmac', secret });
        expect(attestation).toHaveProperty('valid');
        expect(attestation).toHaveProperty('computedDigest');
        expect(attestation).toHaveProperty('signerName', 'hmac-sha256');
        expect(attestation).toHaveProperty('attestedAt');
        expect(attestation).toHaveProperty('signature');
    });
});
