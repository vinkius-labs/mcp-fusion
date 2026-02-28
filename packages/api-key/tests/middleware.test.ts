/**
 * requireApiKey Middleware Tests
 *
 * Covers:
 * - Blocking unauthenticated requests with self-healing error
 * - Passing authenticated requests through to next()
 * - Key extraction from ctx.apiKey, headers x-api-key, authorization
 * - Custom options (errorCode, recoveryHint, extractKey)
 * - onValidated callback
 */
import { describe, it, expect, vi } from 'vitest';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { requireApiKey } from '../src/middleware.js';

const VALID_KEY = 'sk_live_abc123def456ghi7';

const NEXT_RESPONSE: ToolResponse = {
    content: [{ type: 'text', text: '{"ok":true}' }],
};

const nextFn = vi.fn(async () => NEXT_RESPONSE);

function parseToolError(response: ToolResponse): Record<string, string> {
    const text = response.content[0]?.text ?? '';
    const result: Record<string, string> = {};
    const codeMatch = text.match(/code="([^"]+)"/);
    if (codeMatch) result['code'] = codeMatch[1];
    return result;
}

// ============================================================================
// Default Behavior
// ============================================================================

describe('requireApiKey', () => {
    describe('missing key', () => {
        it('blocks when ctx is null', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const result = await middleware(null, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });

        it('blocks when ctx has no key', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const result = await middleware({}, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
            const body = parseToolError(result);
            expect(body['code']).toBe('APIKEY_INVALID');
        });
    });

    // ================================================================
    // Key Extraction
    // ================================================================

    describe('key extraction', () => {
        it('passes when ctx.apiKey is valid', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const result = await middleware({ apiKey: VALID_KEY }, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('passes when x-api-key header is valid', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const ctx = { headers: { 'x-api-key': VALID_KEY } };
            const result = await middleware(ctx, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('passes when authorization header has ApiKey prefix', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const ctx = { headers: { authorization: `ApiKey ${VALID_KEY}` } };
            const result = await middleware(ctx, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('passes when authorization header has Bearer prefix', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const ctx = { headers: { authorization: `Bearer ${VALID_KEY}` } };
            const result = await middleware(ctx, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });
    });

    // ================================================================
    // Invalid Keys
    // ================================================================

    describe('invalid keys', () => {
        it('blocks with wrong key', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY] });
            const result = await middleware({ apiKey: 'sk_live_wrong_key_123456' }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });

        it('blocks with key too short', async () => {
            const middleware = requireApiKey({ keys: [VALID_KEY], minLength: 30 });
            const result = await middleware({ apiKey: VALID_KEY }, {}, nextFn);
            expect(result).toHaveProperty('isError', true);
        });
    });

    // ================================================================
    // Custom Options
    // ================================================================

    describe('custom options', () => {
        it('uses custom extractKey', async () => {
            const middleware = requireApiKey({
                keys: [VALID_KEY],
                extractKey: (ctx: any) => ctx?.myKey,
            });
            const result = await middleware({ myKey: VALID_KEY }, {}, nextFn);
            expect(result).toEqual(NEXT_RESPONSE);
        });

        it('uses custom errorCode', async () => {
            const middleware = requireApiKey({
                keys: [VALID_KEY],
                errorCode: 'CUSTOM_KEY_ERROR',
            });
            const result = await middleware({}, {}, nextFn);
            const body = parseToolError(result);
            expect(body['code']).toBe('CUSTOM_KEY_ERROR');
        });

        it('calls onValidated with metadata', async () => {
            const spy = vi.fn();
            const middleware = requireApiKey({
                validator: async () => ({ valid: true, metadata: { tier: 'pro' } }),
                onValidated: spy,
            });

            await middleware({ apiKey: VALID_KEY }, {}, nextFn);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][1]).toEqual({ tier: 'pro' });
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
            const middleware = requireApiKey({ keys: [VALID_KEY] });

            const result = await middleware({ apiKey: VALID_KEY }, {}, next);
            expect(result).toEqual(customResponse);
        });
    });
});
