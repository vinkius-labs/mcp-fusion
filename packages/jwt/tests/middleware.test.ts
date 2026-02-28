/**
 * requireJwt Middleware Tests
 *
 * Covers:
 * - Blocking unauthenticated requests with self-healing error
 * - Passing authenticated requests through to next()
 * - Token extraction from ctx.token, ctx.jwt, headers.authorization
 * - Bearer prefix handling
 * - Custom options (errorCode, recoveryHint, extractToken)
 * - onVerified callback
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

const nextFn = vi.fn(async () => NEXT_RESPONSE);

function parseToolError(response: ToolResponse): Record<string, string> {
    const text = response.content[0]?.text ?? '';
    const result: Record<string, string> = {};
    const codeMatch = text.match(/code="([^"]+)"/);
    if (codeMatch) result['code'] = codeMatch[1];
    const msgMatch = text.match(/<message>(.*?)<\/message>/);
    if (msgMatch) result['message'] = msgMatch[1];
    return result;
}

// ============================================================================
// Default Behavior
// ============================================================================

describe('requireJwt', () => {
    describe('missing token', () => {
        it('blocks when ctx is null', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware(null, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });

        it('blocks when ctx has no token', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware({}, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
            const body = parseToolError(result);
            expect(body['code']).toBe('JWT_INVALID');
        });

        it('blocks when ctx.token is empty', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware({ token: '' }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });
    });

    // ================================================================
    // Token Extraction
    // ================================================================

    describe('token extraction', () => {
        it('passes when ctx.token has valid JWT', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware({ token: VALID_TOKEN }, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('passes when ctx.jwt has valid JWT', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware({ jwt: VALID_TOKEN }, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('passes when headers.authorization has Bearer token', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const ctx = { headers: { authorization: `Bearer ${VALID_TOKEN}` } };
            const result = await middleware(ctx, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('passes with raw token in authorization (no Bearer prefix)', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const ctx = { headers: { authorization: VALID_TOKEN } };
            const result = await middleware(ctx, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });
    });

    // ================================================================
    // Invalid Tokens
    // ================================================================

    describe('invalid tokens', () => {
        it('blocks with expired token', async () => {
            const expired = createHS256Token({ sub: 'user-1', exp: NOW - 120 }, SECRET);
            const middleware = requireJwt({ secret: SECRET, clockTolerance: 60 });
            const result = await middleware({ token: expired }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });

        it('blocks with wrong secret', async () => {
            const wrongToken = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, 'wrong-secret-at-least-32-chars!!');
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware({ token: wrongToken }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });

        it('blocks with malformed JWT', async () => {
            const middleware = requireJwt({ secret: SECRET });
            const result = await middleware({ token: 'not.a.jwt' }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });
    });

    // ================================================================
    // Custom Options
    // ================================================================

    describe('custom options', () => {
        it('uses custom extractToken', async () => {
            const middleware = requireJwt({
                secret: SECRET,
                extractToken: (ctx: any) => ctx?.myCustomField,
            });
            const result = await middleware({ myCustomField: VALID_TOKEN }, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('uses custom errorCode', async () => {
            const middleware = requireJwt({
                secret: SECRET,
                errorCode: 'CUSTOM_AUTH_ERROR',
            });
            const result = await middleware({}, {}, nextFn);
            const body = parseToolError(result);
            expect(body['code']).toBe('CUSTOM_AUTH_ERROR');
        });

        it('calls onVerified with decoded payload', async () => {
            const spy = vi.fn();
            const middleware = requireJwt({
                secret: SECRET,
                onVerified: spy,
            });

            await middleware({ token: VALID_TOKEN }, {}, nextFn);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][1]).toHaveProperty('sub', 'user-1');
        });
    });

    // ================================================================
    // next() passthrough
    // ================================================================

    describe('next() passthrough', () => {
        it('returns what next() returns on success', async () => {
            const customResponse: ToolResponse = {
                content: [{ type: 'text', text: '{"data":"custom"}' }],
            };
            const next = vi.fn(async () => customResponse);
            const middleware = requireJwt({ secret: SECRET });

            const result = await middleware({ token: VALID_TOKEN }, {}, next);
            expect(result).toEqual(customResponse);
        });
    });
});
