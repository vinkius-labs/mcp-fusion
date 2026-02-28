/**
 * requireApiKey Middleware — Edge Cases & Sad Paths
 */
import { describe, it, expect, vi } from 'vitest';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { requireApiKey } from '../src/middleware.js';

const VALID_KEY = 'sk_live_abc123def456ghi7';
const NEXT_RESPONSE: ToolResponse = { content: [{ type: 'text', text: '{"ok":true}' }] };

function parseToolError(response: ToolResponse): Record<string, string> {
    const text = response.content[0]?.text ?? '';
    const r: Record<string, string> = {};
    const codeMatch = text.match(/code="([^"]+)"/);
    if (codeMatch) r['code'] = codeMatch[1];
    const msgMatch = text.match(/<message>(.*?)<\/message>/s);
    if (msgMatch) r['message'] = msgMatch[1];
    const recMatch = text.match(/<recovery>(.*?)<\/recovery>/s);
    if (recMatch) r['recovery'] = recMatch[1];
    return r;
}

// ============================================================================
// Context Edge Cases
// ============================================================================

describe('requireApiKey — context edge cases', () => {
    const middleware = requireApiKey({ keys: [VALID_KEY] });
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('blocks when ctx is undefined', async () => {
        const r = await middleware(undefined, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('blocks when ctx is a number', async () => {
        const r = await middleware(42 as any, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('blocks when ctx is a string', async () => {
        const r = await middleware('str' as any, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('blocks when ctx is a function', async () => {
        const r = await middleware((() => {}) as any, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('blocks when ctx is an array', async () => {
        const r = await middleware([] as any, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('blocks when ctx.apiKey is a number', async () => {
        const r = await middleware({ apiKey: 12345 }, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('blocks when ctx.headers is not an object', async () => {
        const r = await middleware({ headers: 'bad' }, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });
});

// ============================================================================
// Authorization Prefix Variations
// ============================================================================

describe('requireApiKey — auth prefix variations', () => {
    const middleware = requireApiKey({ keys: [VALID_KEY] });
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('handles "ApiKey " with double space — fails', async () => {
        const ctx = { headers: { authorization: `ApiKey  ${VALID_KEY}` } };
        const r = await middleware(ctx, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('handles "apikey " (lowercase) — no prefix strip', async () => {
        const ctx = { headers: { authorization: `apikey ${VALID_KEY}` } };
        const r = await middleware(ctx, {}, nextFn);
        // "apikey sk_live..." treated as raw, likely too short or wrong
        expect(r).toHaveProperty('isError', true);
    });

    it('handles "ApiKey" without space — treated as raw', async () => {
        const ctx = { headers: { authorization: `ApiKey${VALID_KEY}` } };
        const r = await middleware(ctx, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('passes with raw key in authorization (no prefix)', async () => {
        const ctx = { headers: { authorization: VALID_KEY } };
        const r = await middleware(ctx, {}, nextFn);
        expect(r).toEqual(NEXT_RESPONSE);
    });
});

// ============================================================================
// Extraction Priority
// ============================================================================

describe('requireApiKey — extraction priority', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('ctx.apiKey takes priority over x-api-key header', async () => {
        const middleware = requireApiKey({ keys: [VALID_KEY] });
        const ctx = {
            apiKey: VALID_KEY,
            headers: { 'x-api-key': 'sk_live_wrong_key_1234567' },
        };
        const r = await middleware(ctx, {}, nextFn);
        expect(r).toEqual(NEXT_RESPONSE);
    });

    it('x-api-key takes priority over authorization header', async () => {
        const middleware = requireApiKey({ keys: [VALID_KEY] });
        const ctx = {
            headers: {
                'x-api-key': VALID_KEY,
                authorization: 'ApiKey sk_live_wrong_key_1234567',
            },
        };
        const r = await middleware(ctx, {}, nextFn);
        expect(r).toEqual(NEXT_RESPONSE);
    });
});

// ============================================================================
// next() Failure Propagation
// ============================================================================

describe('requireApiKey — next() errors', () => {
    it('propagates error when next() throws', async () => {
        const middleware = requireApiKey({ keys: [VALID_KEY] });
        const throwingNext = vi.fn(async () => { throw new Error('Downstream failed'); });

        await expect(
            middleware({ apiKey: VALID_KEY }, {}, throwingNext),
        ).rejects.toThrow('Downstream failed');
    });

    it('propagates rejection from next()', async () => {
        const middleware = requireApiKey({ keys: [VALID_KEY] });
        const rejectingNext = vi.fn(() => Promise.reject(new Error('Rejection')));

        await expect(
            middleware({ apiKey: VALID_KEY }, {}, rejectingNext),
        ).rejects.toThrow('Rejection');
    });
});

// ============================================================================
// onValidated Edge Cases
// ============================================================================

describe('requireApiKey — onValidated edge cases', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('onValidated mutates the original ctx reference', async () => {
        const ctx: Record<string, unknown> = { apiKey: VALID_KEY };
        const middleware = requireApiKey({
            validator: async () => ({ valid: true, metadata: { userId: 'u-1' } }),
            onValidated: (c, meta) => { (c as any).userId = meta?.userId; },
        });

        await middleware(ctx, {}, nextFn);
        expect(ctx['userId']).toBe('u-1');
    });

    it('onValidated throwing crashes the middleware call', async () => {
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            onValidated: () => { throw new Error('callback crashed'); },
        });

        await expect(
            middleware({ apiKey: VALID_KEY }, {}, nextFn),
        ).rejects.toThrow('callback crashed');
    });

    it('onValidated receives undefined metadata when none returned', async () => {
        const spy = vi.fn();
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            onValidated: spy,
        });

        await middleware({ apiKey: VALID_KEY }, {}, nextFn);
        expect(spy).toHaveBeenCalledTimes(1);
        // metadata should be undefined when using static keys
        expect(spy.mock.calls[0][1]).toBeUndefined();
    });
});

// ============================================================================
// extractKey Edge Cases
// ============================================================================

describe('requireApiKey — custom extractKey edge cases', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('extractKey returning undefined blocks', async () => {
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            extractKey: () => undefined,
        });
        const r = await middleware({ apiKey: VALID_KEY }, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('extractKey returning empty string blocks', async () => {
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            extractKey: () => '',
        });
        const r = await middleware({ apiKey: VALID_KEY }, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
    });

    it('extractKey that throws crashes the middleware', async () => {
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            extractKey: () => { throw new Error('extract failed'); },
        });
        await expect(middleware({}, {}, nextFn)).rejects.toThrow('extract failed');
    });
});

// ============================================================================
// Self-Healing Error Structure
// ============================================================================

describe('requireApiKey — self-healing error structure', () => {
    const nextFn = vi.fn(async () => NEXT_RESPONSE);

    it('error contains custom recoveryHint', async () => {
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            recoveryHint: 'Set x-api-key header',
        });
        const r = await middleware({}, {}, nextFn);
        const body = parseToolError(r);
        expect(body['recovery']).toContain('Set x-api-key header');
    });

    it('error contains validation failure reason', async () => {
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            prefix: 'pk_',
        });
        const r = await middleware({ apiKey: VALID_KEY }, {}, nextFn);
        expect(r).toHaveProperty('isError', true);
        const body = parseToolError(r);
        expect(body['message']).toContain('API key validation failed');
    });
});

// ============================================================================
// Concurrency
// ============================================================================

describe('requireApiKey — concurrency', () => {
    it('handles 50 concurrent middleware calls', async () => {
        const middleware = requireApiKey({ keys: [VALID_KEY] });
        const results = await Promise.all(
            Array.from({ length: 50 }, () => {
                const next = vi.fn(async () => NEXT_RESPONSE);
                return middleware({ apiKey: VALID_KEY }, {}, next);
            }),
        );
        results.forEach(r => expect(r).toEqual(NEXT_RESPONSE));
    });
});
