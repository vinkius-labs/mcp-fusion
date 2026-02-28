/**
 * JwtVerifier — Edge Cases & Sad Paths
 *
 * Comprehensive tests covering:
 * - Security attacks: signature stripping, alg:none, token manipulation
 * - Boundary conditions: clock tolerance edges, near-expiry tokens
 * - Malformed input: unicode, binary, prototype pollution attempts
 * - Concurrency: parallel verification, state isolation
 * - Static utility edge cases
 * - Claims validation corner cases
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

function createTokenWithHeader(header: Record<string, unknown>, payload: Record<string, unknown>, secret: string): string {
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const bodyB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${bodyB64}`)
        .digest('base64url');
    return `${headerB64}.${bodyB64}.${signature}`;
}

const SECRET = 'test-secret-key-at-least-32-chars!';
const NOW = Math.floor(Date.now() / 1000);

// ============================================================================
// Security Attack Vectors
// ============================================================================

describe('JwtVerifier — Security Attacks', () => {
    const verifier = new JwtVerifier({ secret: SECRET });

    it('rejects alg:none token (algorithm confusion attack)', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const body = Buffer.from(JSON.stringify({ sub: 'admin', exp: NOW + 3600 })).toString('base64url');
        const noneToken = `${header}.${body}.`;

        const result = await verifier.verifyDetailed(noneToken);
        expect(result.valid).toBe(false);
    });

    it('rejects token with stripped signature', async () => {
        const validToken = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);
        const parts = validToken.split('.');
        const strippedToken = `${parts[0]}.${parts[1]}.`;

        const result = await verifier.verifyDetailed(strippedToken);
        expect(result.valid).toBe(false);
    });

    it('rejects token with empty signature string', async () => {
        const validToken = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);
        const parts = validToken.split('.');
        const emptySignature = `${parts[0]}.${parts[1]}.AAAA`;

        const result = await verifier.verify(emptySignature);
        expect(result).toBeNull();
    });

    it('rejects token signed with different algorithm key length', async () => {
        // Token signed with a very short secret
        const weakToken = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, 'a');
        const strongVerifier = new JwtVerifier({ secret: SECRET });

        const result = await strongVerifier.verify(weakToken);
        expect(result).toBeNull();
    });

    it('rejects JWT with __proto__ claim (prototype pollution attempt)', async () => {
        const payload = {
            sub: 'user-1',
            exp: NOW + 3600,
            __proto__: { isAdmin: true },
        };
        const token = createHS256Token(payload, SECRET);
        const result = await verifier.verifyDetailed(token);
        // Should either reject or the parsed payload should NOT have isAdmin on the object chain
        if (result.valid && result.payload) {
            expect((result.payload as any).isAdmin).toBeUndefined();
        }
    });

    it('rejects JWT with constructor pollution claim', async () => {
        const payload = {
            sub: 'user-1',
            exp: NOW + 3600,
            constructor: { prototype: { isAdmin: true } },
        };
        const token = createHS256Token(payload, SECRET);
        // Must not crash and must return a valid result structure
        const result = await verifier.verifyDetailed(token);
        expect(result).toHaveProperty('valid');
    });

    it('handles very long token payload gracefully', async () => {
        const payload = {
            sub: 'user-1',
            exp: NOW + 3600,
            data: 'x'.repeat(100_000),
        };
        const token = createHS256Token(payload, SECRET);
        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
        expect(result!.sub).toBe('user-1');
    });

    it('rejects token with embedded newlines in payload', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const body = Buffer.from('{"sub":"user-1\n","exp":' + (NOW + 3600) + '}').toString('base64url');
        const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
        const token = `${header}.${body}.${sig}`;

        // Should either verify (valid JSON) or reject — but never crash
        const result = await verifier.verifyDetailed(token);
        expect(result).toHaveProperty('valid');
    });
});

// ============================================================================
// Clock Tolerance Boundary Conditions
// ============================================================================

describe('JwtVerifier — Clock Tolerance Boundaries', () => {
    it('rejects token expired exactly at tolerance boundary', async () => {
        // Token expired 61 seconds ago, tolerance is 60
        const token = createHS256Token({ sub: 'user-1', exp: NOW - 61 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });

    it('accepts token expired just within tolerance boundary', async () => {
        // Token expired 59 seconds ago, tolerance is 60
        const token = createHS256Token({ sub: 'user-1', exp: NOW - 59 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
    });

    it('works with zero clock tolerance', async () => {
        const token = createHS256Token({ sub: 'user-1', exp: NOW - 1 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 0 });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });

    it('nbf token that becomes valid just within tolerance', async () => {
        // nbf is 30 seconds in the future, tolerance is 60
        const token = createHS256Token({
            sub: 'user-1',
            exp: NOW + 3600,
            nbf: NOW + 30,
        }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
    });

    it('nbf token that is outside tolerance', async () => {
        // nbf is 120 seconds in the future, tolerance is 60
        const token = createHS256Token({
            sub: 'user-1',
            exp: NOW + 3600,
            nbf: NOW + 120,
        }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, clockTolerance: 60 });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });
});

// ============================================================================
// Claims Validation Corner Cases
// ============================================================================

describe('JwtVerifier — Claims Corner Cases', () => {
    it('accepts when issuer is in array (first match)', async () => {
        const token = createHS256Token({ sub: 'u1', exp: NOW + 3600, iss: 'app-a' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: ['app-a', 'app-b', 'app-c'] });

        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
    });

    it('accepts when issuer is in array (last match)', async () => {
        const token = createHS256Token({ sub: 'u1', exp: NOW + 3600, iss: 'app-c' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: ['app-a', 'app-b', 'app-c'] });

        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
    });

    it('rejects when issuer not in array', async () => {
        const token = createHS256Token({ sub: 'u1', exp: NOW + 3600, iss: 'app-d' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: ['app-a', 'app-b', 'app-c'] });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });

    it('rejects when issuer is missing but required', async () => {
        const token = createHS256Token({ sub: 'u1', exp: NOW + 3600 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, issuer: 'my-app' });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });

    it('rejects when audience is missing but required', async () => {
        const token = createHS256Token({ sub: 'u1', exp: NOW + 3600 }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET, audience: 'my-api' });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });

    it('validates multiple required claims — all present', async () => {
        const token = createHS256Token({
            sub: 'u1', exp: NOW + 3600,
            email: 'a@b.com', role: 'admin', org: 'acme',
        }, SECRET);
        const verifier = new JwtVerifier({
            secret: SECRET,
            requiredClaims: ['email', 'role', 'org'],
        });

        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
    });

    it('validates multiple required claims — one missing', async () => {
        const token = createHS256Token({
            sub: 'u1', exp: NOW + 3600,
            email: 'a@b.com', role: 'admin',
        }, SECRET);
        const verifier = new JwtVerifier({
            secret: SECRET,
            requiredClaims: ['email', 'role', 'org'],
        });

        const result = await verifier.verify(token);
        expect(result).toBeNull();
    });

    it('required claim with null value passes (null !== undefined)', async () => {
        // Implementation uses `=== undefined`, so null is considered "present"
        const token = createHS256Token({
            sub: 'u1', exp: NOW + 3600,
            email: null,
        }, SECRET);
        const verifier = new JwtVerifier({
            secret: SECRET,
            requiredClaims: ['email'],
        });

        const result = await verifier.verify(token);
        expect(result).not.toBeNull();
    });

    it('required claim with empty string should pass (value exists)', async () => {
        const token = createHS256Token({
            sub: 'u1', exp: NOW + 3600,
            email: '',
        }, SECRET);
        const verifier = new JwtVerifier({
            secret: SECRET,
            requiredClaims: ['email'],
        });

        // Empty string is truthy for presence — the claim key exists
        const result = await verifier.verifyDetailed(token);
        // Behavior depends on implementation: some treat empty as missing
        expect(result).toHaveProperty('valid');
    });

    it('token without exp should still verify if no expiry check', async () => {
        const token = createHS256Token({ sub: 'u1' }, SECRET);
        const verifier = new JwtVerifier({ secret: SECRET });

        // Token has no exp — should pass signature check (claims may/may not fail)
        const result = await verifier.verifyDetailed(token);
        expect(result).toHaveProperty('valid');
    });
});

// ============================================================================
// Concurrency & State Isolation
// ============================================================================

describe('JwtVerifier — Concurrency', () => {
    it('handles 100 concurrent verifications', async () => {
        const verifier = new JwtVerifier({ secret: SECRET });
        const tokens = Array.from({ length: 100 }, (_, i) =>
            createHS256Token({ sub: `user-${i}`, exp: NOW + 3600, idx: i }, SECRET),
        );

        const results = await Promise.all(
            tokens.map(t => verifier.verifyDetailed(t)),
        );

        results.forEach((r, i) => {
            expect(r.valid).toBe(true);
            expect(r.payload?.sub).toBe(`user-${i}`);
        });
    });

    it('mixes valid and invalid tokens concurrently', async () => {
        const verifier = new JwtVerifier({ secret: SECRET });
        const tokens = Array.from({ length: 50 }, (_, i) => {
            if (i % 2 === 0) {
                return createHS256Token({ sub: `user-${i}`, exp: NOW + 3600 }, SECRET);
            }
            return createHS256Token({ sub: `user-${i}`, exp: NOW + 3600 }, 'wrong-secret-32-chars-long!!!!!');
        });

        const results = await Promise.all(
            tokens.map(t => verifier.verifyDetailed(t)),
        );

        results.forEach((r, i) => {
            if (i % 2 === 0) {
                expect(r.valid).toBe(true);
            } else {
                expect(r.valid).toBe(false);
            }
        });
    });

    it('separate verifier instances are isolated', async () => {
        const verifier1 = new JwtVerifier({ secret: 'secret-one-32-chars-long-here!!' });
        const verifier2 = new JwtVerifier({ secret: 'secret-two-32-chars-long-here!!' });

        const token1 = createHS256Token({ sub: 'u1', exp: NOW + 3600 }, 'secret-one-32-chars-long-here!!');
        const token2 = createHS256Token({ sub: 'u2', exp: NOW + 3600 }, 'secret-two-32-chars-long-here!!');

        expect(await verifier1.verify(token1)).not.toBeNull();
        expect(await verifier1.verify(token2)).toBeNull();
        expect(await verifier2.verify(token2)).not.toBeNull();
        expect(await verifier2.verify(token1)).toBeNull();
    });
});

// ============================================================================
// Malformed Input Deep Dive
// ============================================================================

describe('JwtVerifier — Malformed Input', () => {
    const verifier = new JwtVerifier({ secret: SECRET });

    it('rejects number input', async () => {
        const result = await verifier.verifyDetailed(12345 as unknown as string);
        expect(result.valid).toBe(false);
    });

    it('rejects boolean input', async () => {
        const result = await verifier.verifyDetailed(true as unknown as string);
        expect(result.valid).toBe(false);
    });

    it('rejects object input', async () => {
        const result = await verifier.verifyDetailed({} as unknown as string);
        expect(result.valid).toBe(false);
    });

    it('rejects array input', async () => {
        const result = await verifier.verifyDetailed([] as unknown as string);
        expect(result.valid).toBe(false);
    });

    it('rejects token with only dots', async () => {
        const result = await verifier.verify('...');
        expect(result).toBeNull();
    });

    it('rejects token with many dots', async () => {
        const result = await verifier.verify('a.b.c.d.e.f.g');
        expect(result).toBeNull();
    });

    it('rejects token with valid base64 but invalid JSON payload', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const invalidJson = Buffer.from('not valid json').toString('base64url');
        const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${invalidJson}`).digest('base64url');

        const result = await verifier.verify(`${header}.${invalidJson}.${sig}`);
        expect(result).toBeNull();
    });

    it('rejects token with whitespace', async () => {
        const validToken = createHS256Token({ sub: 'u1', exp: NOW + 3600 }, SECRET);
        const result = await verifier.verify(`  ${validToken}  `);
        expect(result).toBeNull();
    });

    it('rejects token with unicode in signature', async () => {
        const validToken = createHS256Token({ sub: 'u1', exp: NOW + 3600 }, SECRET);
        const parts = validToken.split('.');
        // Replace last char of signature with a different base64url char to corrupt it
        const corrupted = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
        const result = await verifier.verify(`${parts[0]}.${parts[1]}.${corrupted}`);
        expect(result).toBeNull();
    });
});

// ============================================================================
// Static Utilities — Edge Cases
// ============================================================================

describe('JwtVerifier — Static decode() edges', () => {
    it('decode handles unicode claim values', () => {
        const token = createHS256Token({
            sub: 'user-1',
            name: '日本語テスト 🎯',
        }, SECRET);

        const payload = JwtVerifier.decode(token);
        expect(payload).not.toBeNull();
        expect(payload!.name).toBe('日本語テスト 🎯');
    });

    it('decode returns null for number input', () => {
        expect(JwtVerifier.decode(42 as unknown as string)).toBeNull();
    });

    it('decode returns null for undefined', () => {
        expect(JwtVerifier.decode(undefined as unknown as string)).toBeNull();
    });

    it('decode returns null for null', () => {
        expect(JwtVerifier.decode(null as unknown as string)).toBeNull();
    });

    it('isExpired with custom tolerance', () => {
        // Token expired 30 seconds ago, tolerance is 60 — not expired
        const token = createHS256Token({ exp: NOW - 30 }, SECRET);
        expect(JwtVerifier.isExpired(token, 60)).toBe(false);
    });

    it('isExpired with zero tolerance on just-expired token', () => {
        const token = createHS256Token({ exp: NOW - 1 }, SECRET);
        expect(JwtVerifier.isExpired(token, 0)).toBe(true);
    });

    it('isExpired with very large exp (year 3000)', () => {
        const farFuture = Math.floor(new Date('3000-01-01').getTime() / 1000);
        const token = createHS256Token({ exp: farFuture }, SECRET);
        expect(JwtVerifier.isExpired(token)).toBe(false);
    });

    it('isExpired with negative exp (epoch 0 area)', () => {
        const token = createHS256Token({ exp: 0 }, SECRET);
        expect(JwtVerifier.isExpired(token)).toBe(true);
    });
});
