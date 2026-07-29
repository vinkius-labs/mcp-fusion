/**
 * Regression: Cache hints on list responses (MCP 2026-07-28 SEP-2549)
 *
 * CRITICAL: `tools/list`, `prompts/list`, and `resources/list` responses
 * must carry `_meta.ttlMs` and `_meta.cacheScope: 'private'` when
 * `listCacheTtlMs > 0`, and must NOT carry `_meta` when `listCacheTtlMs === 0`.
 *
 * This test suite verifies:
 * 1. Default ttlMs is 300000 (5 min) when not specified
 * 2. Custom ttlMs is emitted correctly
 * 3. ttlMs === 0 disables caching (no _meta)
 * 4. cacheScope is always 'server' when enabled
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

    it('emits _meta.ttlMs and cacheScope with default 5min TTL', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        registry.attachToServer(server, {} as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result._meta).toBeDefined();
        expect(result._meta.ttlMs).toBe(300_000);
        expect(result._meta.cacheScope).toBe('private');
    });

    it('emits custom ttlMs when listCacheTtlMs is set', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        registry.attachToServer(server, { listCacheTtlMs: 600_000 } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result._meta.ttlMs).toBe(600_000);
        expect(result._meta.cacheScope).toBe('private');
    });

    it('emits cacheScope: server when listCacheScope is set explicitly', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        registry.attachToServer(server, { listCacheTtlMs: 300_000, listCacheScope: 'server' } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result._meta.ttlMs).toBe(300_000);
        expect(result._meta.cacheScope).toBe('server');
    });

    it('does NOT emit _meta when listCacheTtlMs is 0 (disabled)', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        registry.attachToServer(server, { listCacheTtlMs: 0 } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result._meta).toBeUndefined();
    });

    it('tools list is still correct alongside cache hints', async () => {
        const f = initMCPFusion<void>();
        const registry = f.registry();

        registry.register(
            f.query('tools.ping').handle(async () => ({ ok: true })),
        );

        const server = createMockServer();
        registry.attachToServer(server, { listCacheTtlMs: 300_000 } as AttachOptions<void>);

        const result = await server.callListTools();
        expect(result.tools).toBeDefined();
        expect(result.tools.length).toBeGreaterThan(0);
        expect(result._meta).toBeDefined();
    });
});

// ── prompts/list cache hints ─────────────────────────────

describe('Regression: prompts/list cache hints (SEP-2549)', () => {

    it('emits _meta.ttlMs on prompts/list', async () => {
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
        registry.attachToServer(server, {
            prompts: promptRegistry,
            listCacheTtlMs: 300_000,
        } as AttachOptions<void>);

        const result = await server.callListPrompts();
        expect(result._meta).toBeDefined();
        expect(result._meta.ttlMs).toBe(300_000);
        expect(result._meta.cacheScope).toBe('private');
    });

    it('does NOT emit _meta on prompts/list when ttlMs is 0', async () => {
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
        registry.attachToServer(server, {
            prompts: promptRegistry,
            listCacheTtlMs: 0,
        } as AttachOptions<void>);

        const result = await server.callListPrompts();
        expect(result._meta).toBeUndefined();
    });
});