/**
 * JwtVerifier Tests
 *
 * Covers:
 * - Constructor validation
 * - HS256 native verification (signature, expiry, claims)
 * - Invalid token formats
 * - Static decode/isExpired utilities
 * - Claims validation (exp, nbf, iss, aud, requiredClaims)
 */
import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { JwtVerifier } from '../src/JwtVerifier.js';

// ── JWT Helpers ──────────────────────────────────────────

function createHS256Token(payload: Record<string, unknown>, secret: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${body}`)
        .digest('base64url');
    return `${header}.${body}.${signature}`;
}

const SECRET = 'test-secret-key-at-least-32-chars!';
const NOW = Math.floor(Date.now() / 1000);

// ============================================================================
// Constructor
// ============================================================================

describe('JwtVerifier — Constructor', () => {
    it('should throw when no verification method is provided', () => {
        expect(() => new JwtVerifier({} as any)).toThrow(/at least one of/);
    });

    it('should accept secret config', () => {
        expect(() => new JwtVerifier({ secret: SECRET })).not.toThrow();
    });

    it('should accept jwksUri config', () => {
        expect(() => new JwtVerifier({ jwksUri: 'https://example.com/.well-known/jwks.json' })).not.toThrow();
    });

    it('should accept publicKey config', () => {
        expect(() => new JwtVerifier({ publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----' })).not.toThrow();
    });
});

// ============================================================================
// HS256 Native Verification
// ============================================================================

describe('JwtVerifier — HS256 Native', () => {
    it('should verify a valid HS256 token', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET });

        const payload = await verifier.verify(token);
        expect(payload).not.toBeNull();
        expect(payload!.sub).toBe('user-1');
    });

    it('should reject a token with wrong secret', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, 'wrong-secret-key-32-chars-long!!');
        const verifier = new JwtVerifier({ secret: SECRET });

        const payload = await verifier.verify(token);
        expect(payload).toBeNull();
    });

    it('should reject a tampered payload', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);
        const parts = token.split('.');
        // Tamper with the payload
        const tampered = Buffer.from(JSON.stringify({ sub: 'admin', exp: NOW + 3600 })).toString('base64url');
        const tamperedToken = `${parts[0]}.${tampered}.${parts[2]}`;

        const verifier = new JwtVerifier({ secret: SECRET });
        const payload = await verifier.verify(tamperedToken);
        expect(payload).toBeNull();
    });

    it('should reject an expired token', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW - 120 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const result = await verifier.verifyDetailed(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
    });

    it('should accept a token within clock tolerance', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW - 30 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const payload = await verifier.verify(token);
        expect(payload).not.toBeNull();
    });

    it('should reject a not-yet-valid token (nbf)', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600, nbf: NOW + 300 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const result = await verifier.verifyDetailed(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
    });

    it('should validate issuer claim', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600, iss: 'wrong-issuer' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: 'expected-issuer' });

        const result = await verifier.verifyDetailed(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
    });

    it('should accept matching issuer', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600, iss: 'my-app' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: 'my-app' });

        const payload = await verifier.verify(token);
        expect(payload).not.toBeNull();
        expect(payload!.iss).toBe('my-app');
    });

    it('should validate audience claim', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600, aud: 'other-api' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, audience: 'my-api' });

        const result = await verifier.verifyDetailed(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
    });

    it('should validate required claims', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, requiredClaims: ['email'] });

        const result = await verifier.verifyDetailed(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
    });

    it('should pass with all required claims present', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600, email: 'test@example.com' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, requiredClaims: ['email', 'sub'] });

        const payload = await verifier.verify(token);
        expect(payload).not.toBeNull();
        expect(payload!.email).toBe('test@example.com');
    });

    it('should accept array issuer config', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW + 3600, iss: 'issuer-b' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: ['issuer-a', 'issuer-b'] });

        const payload = await verifier.verify(token);
        expect(payload).not.toBeNull();
    });
});

// ============================================================================
// Invalid Token Formats
// ============================================================================

describe('JwtVerifier — Invalid Formats', () => {
    const verifier = new JwtVerifier({ secret: SECRET });

    it('should reject empty string', async () => {
        const result = await verifier.verifyDetailed('');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('empty');
    });

    it('should reject non-JWT string', async () => {
        const payload = await verifier.verify('not-a-jwt');
        expect(payload).toBeNull();
    });

    it('should reject token with only 2 parts', async () => {
        const payload = await verifier.verify('header.payload');
        expect(payload).toBeNull();
    });

    it('should reject token with 4 parts', async () => {
        const payload = await verifier.verify('a.b.c.d');
        expect(payload).toBeNull();
    });

    it('should reject token with invalid base64 payload', async () => {
        const payload = await verifier.verify('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.!!!invalid!!!.signature');
        expect(payload).toBeNull();
    });

    it('should reject null input', async () => {
        const result = await verifier.verifyDetailed(null as unknown as string);
        expect(result.valid).toBe(false);
    });
});

// ============================================================================
// Static Utilities
// ============================================================================

describe('JwtVerifier — static decode()', () => {
    it('should decode payload without verification', () => {
        const token = createHS256Token({ sub: 'user-1', role: 'admin' }, SECRET);
        const payload = JwtVerifier.decode(token);
        expect(payload).not.toBeNull();
        expect(payload!.sub).toBe('user-1');
        expect(payload!.role).toBe('admin');
    });

    it('should decode even with wrong signature', () => {
        const token = createHS256Token({ sub: 'user-1' }, 'any-secret-key-longer-than-32-ch');
        const payload = JwtVerifier.decode(token);
        expect(payload!.sub).toBe('user-1');
    });

    it('should return null for invalid tokens', () => {
        expect(JwtVerifier.decode('not-jwt')).toBeNull();
        expect(JwtVerifier.decode('')).toBeNull();
    });
});

describe('JwtVerifier — static isExpired()', () => {
    it('should return false for valid token', () => {
        const token = createHS256Token({ exp: NOW + 3600 }, SECRET);
        expect(JwtVerifier.isExpired(token)).toBe(false);
    });

    it('should return true for expired token', () => {
        const token = createHS256Token({ exp: NOW - 120 }, SECRET);
        expect(JwtVerifier.isExpired(token)).toBe(true);
    });

    it('should return true for unparseable token', () => {
        expect(JwtVerifier.isExpired('invalid')).toBe(true);
    });

    it('should return true for token without exp', () => {
        const token = createHS256Token({ sub: 'user-1' }, SECRET);
        expect(JwtVerifier.isExpired(token)).toBe(true);
    });
});
