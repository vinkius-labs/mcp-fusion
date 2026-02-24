/**
 * requireAuth Middleware Tests
 *
 * Validates the auth guard middleware:
 * - Blocks unauthenticated requests with self-healing error
 * - Passes authenticated requests through to next()
 * - Default token extraction patterns (ctx.token, ctx.isAuthenticated, ctx.getToken)
 * - Custom options (extractToken, errorCode, recoveryHint, recoveryAction)
 */
import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../src/middleware.js';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';

// ── Helpers ──────────────────────────────────────────────

/**
 * Parse toolError XML response into an object.
 * Format: <tool_error code="..."><message>...</message><recovery>...</recovery><available_actions>...</available_actions></tool_error>
 */
function parseToolError(response: ToolResponse): Record<string, string> {
    const text = response.content[0].text;
    const result: Record<string, string> = {};
    const codeMatch = text.match(/code="([^"]+)"/);
    if (codeMatch) result['code'] = codeMatch[1];
    const msgMatch = text.match(/<message>(.*?)<\/message>/s);
    if (msgMatch) result['message'] = msgMatch[1];
    const recoveryMatch = text.match(/<recovery>(.*?)<\/recovery>/s);
    if (recoveryMatch) result['suggestion'] = recoveryMatch[1];
    const actionsMatch = text.match(/<available_actions>(.*?)<\/available_actions>/s);
    if (actionsMatch) result['availableActions'] = actionsMatch[1];
    return result;
}

const NEXT_RESPONSE: ToolResponse = {
    content: [{ type: 'text', text: '{"ok":true}' }],
};

function nextFn(): Promise<ToolResponse> {
    return Promise.resolve(NEXT_RESPONSE);
}

// ============================================================================
// Default Behavior
// ============================================================================

describe('requireAuth', () => {
    describe('default options', () => {
        it('blocks request when ctx is null', async () => {
            const middleware = requireAuth();
            const result = await middleware(null, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
            const body = parseToolError(result as ToolResponse);
            expect(body).toHaveProperty('code', 'AUTH_REQUIRED');
        });

        it('blocks request when ctx is empty object', async () => {
            const middleware = requireAuth();
            const result = await middleware({}, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
        });

        it('blocks request when ctx is undefined', async () => {
            const middleware = requireAuth();
            const result = await middleware(undefined, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
        });
    });

    // ========================================================================
    // Default Token Extraction: ctx.token
    // ========================================================================

    describe('ctx.token extraction', () => {
        it('passes when ctx.token is a non-empty string', async () => {
            const middleware = requireAuth();
            const ctx = { token: 'valid-token' };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('blocks when ctx.token is empty string', async () => {
            const middleware = requireAuth();
            const ctx = { token: '' };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
        });

        it('blocks when ctx.token is not a string', async () => {
            const middleware = requireAuth();
            const ctx = { token: 123 };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
        });
    });

    // ========================================================================
    // Default Token Extraction: ctx.isAuthenticated()
    // ========================================================================

    describe('ctx.isAuthenticated() extraction', () => {
        it('passes when isAuthenticated returns true', async () => {
            const middleware = requireAuth();
            const ctx = { isAuthenticated: () => true };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('blocks when isAuthenticated returns false', async () => {
            const middleware = requireAuth();
            const ctx = { isAuthenticated: () => false };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
        });
    });

    // ========================================================================
    // Default Token Extraction: ctx.getToken()
    // ========================================================================

    describe('ctx.getToken() extraction', () => {
        it('passes when getToken returns a string', async () => {
            const middleware = requireAuth();
            const ctx = { getToken: () => 'my-token' };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('blocks when getToken returns null', async () => {
            const middleware = requireAuth();
            const ctx = { getToken: () => null };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toHaveProperty('isError', true);
        });
    });

    // ========================================================================
    // Extraction Priority: token > isAuthenticated > getToken
    // ========================================================================

    describe('extraction priority', () => {
        it('checks ctx.token first (skips methods)', async () => {
            const middleware = requireAuth();
            const isAuthenticated = vi.fn(() => false);
            const ctx = { token: 'direct-token', isAuthenticated };

            const result = await middleware(ctx, {}, nextFn);

            expect(result).toEqual(NEXT_RESPONSE);
            expect(isAuthenticated).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Custom Options
    // ========================================================================

    describe('custom options', () => {
        it('uses custom extractToken function', async () => {
            const middleware = requireAuth({
                extractToken: (ctx) => (ctx as { apiKey?: string })?.apiKey ?? null,
            });

            const result = await middleware({ apiKey: 'key-123' }, {}, nextFn);

            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('blocks with custom extractToken returning null', async () => {
            const middleware = requireAuth({
                extractToken: () => null,
            });

            const result = await middleware({ token: 'valid' }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });

        it('uses custom errorCode', async () => {
            const middleware = requireAuth({
                errorCode: 'CUSTOM_AUTH_ERROR',
            });

            const result = await middleware({}, {}, nextFn);
            const body = parseToolError(result as ToolResponse);
            expect(body).toHaveProperty('code', 'CUSTOM_AUTH_ERROR');
        });

        it('uses custom recoveryHint', async () => {
            const middleware = requireAuth({
                recoveryHint: 'Call login tool first',
            });

            const result = await middleware({}, {}, nextFn);
            const body = parseToolError(result as ToolResponse);
            expect(body).toHaveProperty('suggestion', 'Call login tool first');
        });

        it('uses custom recoveryAction', async () => {
            const middleware = requireAuth({
                recoveryAction: 'custom-auth',
            });

            const result = await middleware({}, {}, nextFn);
            const body = parseToolError(result as ToolResponse);
            expect(body).toHaveProperty('availableActions');
            expect(body.availableActions).toContain('custom-auth');
        });
    });

    // ========================================================================
    // next() Passthrough
    // ========================================================================

    describe('next() passthrough', () => {
        it('calls next() exactly once when authenticated', async () => {
            const middleware = requireAuth();
            const next = vi.fn(() => Promise.resolve(NEXT_RESPONSE));

            await middleware({ token: 'valid' }, {}, next);

            expect(next).toHaveBeenCalledOnce();
        });

        it('does not call next() when unauthenticated', async () => {
            const middleware = requireAuth();
            const next = vi.fn(() => Promise.resolve(NEXT_RESPONSE));

            await middleware({}, {}, next);

            expect(next).not.toHaveBeenCalled();
        });

        it('returns whatever next() returns', async () => {
            const middleware = requireAuth();
            const customResponse: ToolResponse = {
                content: [{ type: 'text', text: 'custom-data' }],
            };
            const next = vi.fn(() => Promise.resolve(customResponse));

            const result = await middleware({ token: 'valid' }, {}, next);
            expect(result).toEqual(customResponse);
        });
    });
});
