import { describe, it, expect, vi } from 'vitest';
import { buildHandler } from '../../src/runtime/HttpHandlerFactory.js';
import type { ApiAction } from '../../src/parser/types.js';

// ── Helpers ──────────────────────────────────────────────

function makeAction(overrides: Partial<ApiAction> = {}): ApiAction {
    return {
        name: 'test_action',
        method: 'get',
        path: '/items',
        params: [],
        responses: [],
        tags: [],
        ...overrides,
    };
}

// ── Tests ────────────────────────────────────────────────

describe('HttpHandlerFactory — Content-Type Header', () => {
    it('should NOT send Content-Type on GET requests', async () => {
        const handler = buildHandler(makeAction({ method: 'get' }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ data: [] }),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, {});

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers).not.toHaveProperty('Content-Type');
    });

    it('should NOT send Content-Type on HEAD requests', async () => {
        const handler = buildHandler(makeAction({ method: 'head' }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'text/plain' }),
            text: async () => '',
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, {});

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers).not.toHaveProperty('Content-Type');
    });

    it('should send Content-Type on POST requests', async () => {
        const handler = buildHandler(makeAction({
            method: 'post',
            path: '/items',
            params: [{ name: 'title', source: 'body', required: true, schema: { type: 'string' } }],
        }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ id: 1 }),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, { title: 'hello' });

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('should send Content-Type on PUT requests', async () => {
        const handler = buildHandler(makeAction({ method: 'put' }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({}),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, {});

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('should send Content-Type on PATCH requests', async () => {
        const handler = buildHandler(makeAction({ method: 'patch' }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({}),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, {});

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('should send Content-Type on DELETE requests (may have body)', async () => {
        const handler = buildHandler(makeAction({ method: 'delete' }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ deleted: true }),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, {});

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('should allow ctx.headers to override Content-Type', async () => {
        const handler = buildHandler(makeAction({ method: 'post' }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({}),
        });

        await handler({
            baseUrl: 'https://api.test',
            fetchFn: mockFetch,
            headers: { 'Content-Type': 'text/xml' },
        }, {});

        const [, opts] = mockFetch.mock.calls[0]!;
        expect(opts.headers['Content-Type']).toBe('text/xml');
    });
});

describe('HttpHandlerFactory — Path Interpolation', () => {
    it('should interpolate path params', async () => {
        const handler = buildHandler(makeAction({
            method: 'get',
            path: '/items/{id}',
            params: [{ name: 'id', source: 'path', required: true, schema: { type: 'string' } }],
        }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ id: '42' }),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, { id: '42' });

        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.test/items/42');
    });

    it('should append query params', async () => {
        const handler = buildHandler(makeAction({
            method: 'get',
            path: '/search',
            params: [{ name: 'q', source: 'query', required: true, schema: { type: 'string' } }],
        }));
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ([]),
        });

        await handler({ baseUrl: 'https://api.test', fetchFn: mockFetch }, { q: 'test' });

        const [url] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.test/search?q=test');
    });
});
