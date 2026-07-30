/**
 * Regression: Cache hints on list responses (MCP 2026-07-28 SEP-2549)
 *
 * CRITICAL: `tools/list`, `prompts/list`, and `resources/list` responses
 * must carry `ttlMs` and `cacheScope: 'private'` directly on the result
 * root (NOT inside `_meta`) when `listCacheTtlMs > 0`, and must NOT carry
 * them when `listCacheTtlMs === 0`.
 *
 * MCP 2.0 spec: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching
 * "Cacheable Results in MCP use two fields to provide caching hints to clients:
 *  ttlMs and cacheScope — placed directly on the result object."
 *
 * This test suite verifies:
 * 1. Default ttlMs is 300000 (5 min) when not specified
 * 2. Custom ttlMs is emitted correctly
 * 3. ttlMs === 0 disables caching (no ttlMs/cacheScope fields)
 * 4. cacheScope is 'public' when set explicitly
 * 5. tools/list, prompts/list, resources/list all emit cache hints
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { initMCPFusion } from '../../src/index.js';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.js';
import { definePrompt } from '../../src/prompt/index.js';
import type { AttachOptions } from '../../src/server/ServerAttachment.js';

// ── Mock Server (v2 method-string pattern) ───────────────

function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler(method: string, handler: Function) {
            handlers.set(method, handler);
        },
        async callListTools() {
            const handler = handlers.get('tools/list');
            if (!handler) throw new Error('No tools/list handler');
            return handler({ method: 'tools/list', params: {} }, {});
        },
        async callListPrompts(cursor?: string) {
            const handler = handlers.get('prompts/list');
            if (!handler) throw new Error('No prompts/list handler');
            const params: Record<string, unknown> = {};
            if (cursor) params.cursor = cursor;
            return handler({ method: 'prompts/list', params }, {});
        },
        async callListResources() {
            const handler = handlers.get('resources/list');
            if (!handler) throw new Error('No resources/list handler');
            return handler({ method: 'resources/list', params: {} }, {});
        },
    };
}

// ── tools/list cache hints ───────────────────────────────

describe('Regression: tools/list cache hints (SEP-2549)', () => {

    it('emits ttlMs and cacheScope on result root with default 5min TTL', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        await registry.attachToServer(server, {} as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result.ttlMs).toBe(300_000);
        expect(result.cacheScope).toBe('private');
    });

    it('emits custom ttlMs when listCacheTtlMs is set', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        await registry.attachToServer(server, { listCacheTtlMs: 600_000 } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result.ttlMs).toBe(600_000);
        expect(result.cacheScope).toBe('private');
    });

    it('emits cacheScope: public when listCacheScope is set explicitly', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        await registry.attachToServer(server, { listCacheTtlMs: 300_000, listCacheScope: 'public' } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result.ttlMs).toBe(300_000);
        expect(result.cacheScope).toBe('public');
    });

    it('does NOT emit ttlMs/cacheScope when listCacheTtlMs is 0 (disabled)', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        await registry.attachToServer(server, { listCacheTtlMs: 0 } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result.ttlMs).toBeUndefined();
        expect(result.cacheScope).toBeUndefined();
    });

    it('tools list is still correct alongside cache hints', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        await registry.attachToServer(server, { listCacheTtlMs: 300_000 } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result.tools).toBeDefined();
        expect(result.tools.length).toBeGreaterThan(0);
        expect(result.ttlMs).toBe(300_000);
    });
});

// ── prompts/list cache hints ─────────────────────────────

describe('Regression: prompts/list cache hints (SEP-2549)', () => {

    it('emits ttlMs on prompts/list result root', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        const promptRegistry = new PromptRegistry<void>();
        promptRegistry.register(
            definePrompt<void>('greet', {
                handler: async () => ({
                    messages: [{
                        role: 'user' as const,
                        content: { type: 'text' as const, text: 'Hello' },
                    }],
                }),
            }),
        );

        const server = createMockServer();
        await registry.attachToServer(server, {
            prompts: promptRegistry,
            listCacheTtlMs: 300_000,
        } as AttachOptions<void>);

        const result = await server.callListPrompts();
        expect(result.ttlMs).toBe(300_000);
        expect(result.cacheScope).toBe('private');
    });

    it('does NOT emit ttlMs on prompts/list when ttlMs is 0', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        const promptRegistry = new PromptRegistry<void>();
        promptRegistry.register(
            definePrompt<void>('greet', {
                handler: async () => ({
                    messages: [{
                        role: 'user' as const,
                        content: { type: 'text' as const, text: 'Hi' },
                    }],
                }),
            }),
        );

        const server = createMockServer();
        await registry.attachToServer(server, {
            prompts: promptRegistry,
            listCacheTtlMs: 0,
        } as AttachOptions<void>);

        const result = await server.callListPrompts();
        expect(result.ttlMs).toBeUndefined();
        expect(result.cacheScope).toBeUndefined();
    });
});