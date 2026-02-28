/**
 * requireJwt Middleware — Edge Cases & Sad Paths
 *
 * Comprehensive tests covering:
 * - Context edge cases: non-object, array, number, function
 * - Extraction priority and fallthrough
 * - Bearer prefix variations
 * - next() failure propagation
 * - onVerified error propagation
 * - Concurrent middleware invocations
 * - Custom recovery hints in error response
 * - extractToken that throws
 */
import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'node:crypto';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { requireJwt } from '../src/middleware.js';

// ── JWT Helper ───────────────────────────────────────────

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
const VALID_TOKEN = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);

const NEXT_RESPONSE: ToolResponse = {
    content: [{ type: 'text', text: '{"ok":true}' }],
};

function parseToolError(response: ToolResponse): Record<string, string> {
    const text = response.content[0]?.text ?? '';
    const result: Record<string, string> = {};
    const codeMatch = text.match(/code="([^"]+)"/);
    if (codeMatch) result['code'] = codeMatch[1];
    const msgMatch = text.match(/<message>(.*?)<\/message>/s);
    if (msgMatch) result['message'] = msgMatch[1];
    const recMatch = text.match(/<recovery>(.*?)<\/recovery>/s);
    if (recMatch) result['recovery'] = recMatch[1];
    return result;
}

// ============================================================================
// Context Edge Cases
// ============================================================================

describe('requireJwt — context edge cases', () => {
    const middleware = requireJwt({ secret: SECRET });
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('blocks when ctx is undefined', async () => {
        const result = await middleware(undefined, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('blocks when ctx is a number', async () => {
        const result = await middleware(42 as any, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('blocks when ctx is a string', async () => {
        const result = await middleware('a string' as any, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('blocks when ctx is a function', async () => {
        const result = await middleware((() => {}) as any, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('blocks when ctx is an array', async () => {
        const result = await middleware([] as any, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('blocks when ctx.token is a number', async () => {
        const result = await middleware({ token: 12345 }, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('blocks when ctx.headers is not an object', async () => {
        const result = await middleware({ headers: 'bad' }, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });
});

// ============================================================================
// Bearer Prefix Variations
// ============================================================================

describe('requireJwt — Bearer prefix variations', () => {
    const middleware = requireJwt({ secret: SECRET });
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('handles "Bearer " with trailing space (double space)', async () => {
        // "Bearer  <token>" — extra space. Bearer + space is stripped, leaving " <token>"
        const ctx = { headers: { authorization: `Bearer  ${VALID_TOKEN}` } };
        const result = await middleware(ctx, {}, nextFn);
        // Should fail because the token starts with a space
        expect(result).toHaveProperty('isError', true);
    });

    it('handles "bearer " (lowercase) — no prefix strip', async () => {
        // Our implementation checks "Bearer " with capital B
        const ctx = { headers: { authorization: `bearer ${VALID_TOKEN}` } };
        const result = await middleware(ctx, {}, nextFn);
        // "bearer ..." is treated as raw token (won't parse as JWT), should fail
        expect(result).toHaveProperty('isError', true);
    });

    it('handles "BEARER " (uppercase) — no prefix strip', async () => {
        const ctx = { headers: { authorization: `BEARER ${VALID_TOKEN}` } };
        const result = await middleware(ctx, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('handles "Bearer" without space — treated as raw token', async () => {
        const ctx = { headers: { authorization: `Bearer${VALID_TOKEN}` } };
        const result = await middleware(ctx, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });
});

// ============================================================================
// Extraction Priority
// ============================================================================

describe('requireJwt — extraction priority', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('ctx.token takes priority over ctx.jwt', async () => {
        const goodToken = VALID_TOKEN;
        const badToken = createHS256Token({ sub: 'u', exp: NOW + 3600 }, 'wrong-secret-32-chars-long!!!!!');
        const middleware = requireJwt({ secret: SECRET });

        const result = await middleware({ token: goodToken, jwt: badToken }, {}, nextFn);
        expect(result).toEqual(NEXT_RESPONSE);
    });

    it('ctx.jwt takes priority over headers.authorization', async () => {
        const goodToken = VALID_TOKEN;
        const badToken = createHS256Token({ sub: 'u', exp: NOW + 3600 }, 'wrong-secret-32-chars-long!!!!!');
        const middleware = requireJwt({ secret: SECRET });

        const ctx = { jwt: goodToken, headers: { authorization: `Bearer ${badToken}` } };
        const result = await middleware(ctx, {}, nextFn);
        expect(result).toEqual(NEXT_RESPONSE);
    });
});

// ============================================================================
// next() Failure Propagation
// ============================================================================

describe('requireJwt — next() errors', () => {
    it('propagates error when next() throws', async () => {
        const middleware = requireJwt({ secret: SECRET });
        const throwingNext = vi.fn(async () => {
            throw new Error('Downstream failed');
        });

        await expect(
            middleware({ token: VALID_TOKEN }, {}, throwingNext),
        ).rejects.toThrow('Downstream failed');
    });

    it('propagates error when next() rejects', async () => {
        const middleware = requireJwt({ secret: SECRET });
        const rejectingNext = vi.fn(() => Promise.reject(new Error('Rejection')));

        await expect(
            middleware({ token: VALID_TOKEN }, {}, rejectingNext),
        ).rejects.toThrow('Rejection');
    });
});

// ============================================================================
// onVerified Edge Cases
// ============================================================================

describe('requireJwt — onVerified edge cases', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('onVerified receives the original ctx reference (mutation works)', async () => {
        const ctx: Record<string, unknown> = { token: VALID_TOKEN };
        const middleware = requireJwt({
            secret: SECRET,
            onVerified: (c, payload) => {
                (c as any).userId = payload.sub;
            },
        });

        await middleware(ctx, {}, nextFn);
        expect(ctx['userId']).toBe('user-1');
    });

    it('onVerified throwing does NOT block the middleware (crashes bubble up)', async () => {
        const middleware = requireJwt({
            secret: SECRET,
            onVerified: () => {
                throw new Error('callback crashed');
            },
        });

        await expect(
            middleware({ token: VALID_TOKEN }, {}, nextFn),
        ).rejects.toThrow('callback crashed');
    });
});

// ============================================================================
// extractToken Edge Cases
// ============================================================================

describe('requireJwt — custom extractToken edge cases', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('extractToken returning undefined blocks the request', async () => {
        const middleware = requireJwt({
            secret: SECRET,
            extractToken: () => undefined,
        });
        const result = await middleware({ token: VALID_TOKEN }, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('extractToken returning empty string blocks the request', async () => {
        const middleware = requireJwt({
            secret: SECRET,
            extractToken: () => '',
        });
        const result = await middleware({ token: VALID_TOKEN }, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });

    it('extractToken that throws crashes the middleware call', async () => {
        const middleware = requireJwt({
            secret: SECRET,
            extractToken: () => { throw new Error('extract failed'); },
        });

        await expect(
            middleware({}, {}, nextFn),
        ).rejects.toThrow('extract failed');
    });
});

// ============================================================================
// Self-Healing Error Structure
// ============================================================================

describe('requireJwt — self-healing error structure', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('error contains custom recoveryHint', async () => {
        const middleware = requireJwt({
            secret: SECRET,
            recoveryHint: 'Call jwt_auth action=login first',
        });
        const result = await middleware({}, {}, nextFn);
        const body = parseToolError(result);
        expect(body['recovery']).toContain('Call jwt_auth action=login first');
    });

    it('error contains invalid token reason in message', async () => {
        const expired = createHS256Token({ sub: 'u', exp: NOW - 300 }, SECRET);
        const middleware = requireJwt({ secret: SECRET, clockTolerance: 60 });
        const result = await middleware({ token: expired }, {}, nextFn);

        expect(result).toHaveProperty('isError', true);
        const body = parseToolError(result);
        expect(body['message']).toContain('JWT verification failed');
    });
});

// ============================================================================
// Concurrency
// ============================================================================

describe('requireJwt — concurrency', () => {
    it('handles 50 concurrent middleware calls', async () => {
        const middleware = requireJwt({ secret: SECRET });
        const tokens = Array.from({ length: 50 }, (_, i) =>
            createHS256Token({ sub: `user-${i}`, exp: NOW + 3600 }, SECRET),
        );

        const results = await Promise.all(
            tokens.map(t => {
                const next = vi.fn(async () => NEXT_RESPONSE);
                return middleware({ token: t }, {}, next);
            }),
        );

        results.forEach(r => {
            expect(r).toEqual(NEXT_RESPONSE);
        });
    });
});
