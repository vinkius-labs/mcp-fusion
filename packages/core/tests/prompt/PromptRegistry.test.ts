/**
 * PromptRegistry — Unit Tests
 *
 * Covers: register, registerAll, getPrompts (tag filtering),
 * routeGet (happy + error paths), interceptors, notifyChanged (debounce),
 * has, clear, size.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.js';
import { definePrompt } from '../../src/prompt/definePrompt.js';

// ── Helpers ──────────────────────────────────────────────

function makePrompt(name: string, tags?: string[]) {
    return definePrompt<void>(name, {
        ...(tags ? { tags } : {}),
        handler: async (_ctx, _args) => ({
            messages: [{
                role: 'user' as const,
                content: { type: 'text' as const, text: `Result from ${name}` },
            }],
        }),
    });
}

function makeSchemaPrompt(name: string) {
    return definePrompt<void>(name, {
        args: z.object({ query: z.string() }),
        handler: async (_ctx, args) => ({
            messages: [{
                role: 'user' as const,
                content: { type: 'text' as const, text: `Query: ${args.query}` },
            }],
        }),
    });
}

// ── Tests ────────────────────────────────────────────────

describe('PromptRegistry', () => {
    let registry: PromptRegistry<void>;

    beforeEach(() => {
        registry = new PromptRegistry<void>();
    });

    // ── register ─────────────────────────────────────────

    describe('register', () => {
        it('registers a prompt builder', () => {
            const prompt = makePrompt('greet');
            registry.register(prompt);
            expect(registry.has('greet')).toBe(true);
            expect(registry.size).toBe(1);
        });

        it('rejects duplicate names', () => {
            registry.register(makePrompt('greet'));
            expect(() => registry.register(makePrompt('greet'))).toThrow('already registered');
        });
    });

    // ── registerAll ──────────────────────────────────────

    describe('registerAll', () => {
        it('registers multiple prompts', () => {
            registry.registerAll(makePrompt('a'), makePrompt('b'), makePrompt('c'));
            expect(registry.size).toBe(3);
        });
    });

    // ── getAllPrompts ─────────────────────────────────────

    describe('getAllPrompts', () => {
        it('returns all registered prompt definitions', () => {
            registry.registerAll(makePrompt('a'), makePrompt('b'));
            const all = registry.getAllPrompts();
            expect(all).toHaveLength(2);
            expect(all.map(p => p.name).sort()).toEqual(['a', 'b']);
        });
    });

    // ── getPrompts (tag filtering) ───────────────────────

    describe('getPrompts', () => {
        beforeEach(() => {
            registry.registerAll(
                makePrompt('core-a', ['core']),
                makePrompt('core-b', ['core', 'admin']),
                makePrompt('admin-only', ['admin']),
                makePrompt('public', []),
            );
        });

        it('AND filter: returns prompts with ALL required tags', () => {
            const result = registry.getPrompts({ tags: ['core', 'admin'] });
            expect(result).toHaveLength(1);
            expect(result[0]!.name).toBe('core-b');
        });

        it('OR filter: returns prompts with ANY of the tags', () => {
            const result = registry.getPrompts({ anyTag: ['admin'] });
            expect(result).toHaveLength(2);
        });

        it('exclude filter: removes prompts with excluded tags', () => {
            const result = registry.getPrompts({ exclude: ['admin'] });
            expect(result).toHaveLength(2); // core-a and public
        });
    });

    // ── listPrompts (pagination & filters) ───────────────────────

    describe('listPrompts', () => {
        beforeEach(() => {
            // Register 50 prompts to test pagination
            const builderArray = Array.from({ length: 50 }).map((_, i) =>
                makePrompt(`prompt-${String(i).padStart(2, '0')}`, i % 2 === 0 ? ['even'] : ['odd'])
            );
            registry.registerAll(...builderArray);
        });

        it('returns initial page of prompts', async () => {
            registry.configurePagination({ pageSize: 10 });
            const { prompts, nextCursor } = await registry.listPrompts();
            
            expect(prompts).toHaveLength(10);
            expect(prompts[0]!.name).toBe('prompt-00');
            expect(prompts[9]!.name).toBe('prompt-09');
            expect(nextCursor).toBeDefined();
        });

        it('paginates over multiple pages', async () => {
            registry.configurePagination({ pageSize: 10 });
            
            const firstPage = await registry.listPrompts();
            expect(firstPage.prompts).toHaveLength(10);
            
            // Fetch page 2
            const secondPage = await registry.listPrompts({ cursor: firstPage.nextCursor });
            expect(secondPage.prompts).toHaveLength(10);
            expect(secondPage.prompts[0]!.name).toBe('prompt-10');
            expect(secondPage.prompts[9]!.name).toBe('prompt-19');
            expect(secondPage.nextCursor).toBeDefined();
        });

        it('applies filters over paginated results', async () => {
            registry.configurePagination({ pageSize: 15 });
            
            const { prompts, nextCursor } = await registry.listPrompts({
                filter: { tags: ['even'] } 
            });
            
            // Total 'even' tags is 25. First page pageSize 15, so we should get 15 evenly numbered ones?
            // Wait, the filter is applied DURING the iteration over builder maps.
            // My implementation filters allNames first, then slices.
            expect(prompts).toHaveLength(15);
            expect(prompts[0]!.name).toBe('prompt-00');
            expect(prompts[1]!.name).toBe('prompt-02');
            expect(nextCursor).toBeDefined();
            
            const secondPage = await registry.listPrompts({
                filter: { tags: ['even'] },
                cursor: nextCursor
            });
            // Remaining 'even' prompts are 10
            expect(secondPage.prompts).toHaveLength(10);
            expect(secondPage.nextCursor).toBeUndefined();
        });
    });

    // ── routeGet ─────────────────────────────────────────

    describe('routeGet', () => {
        it('routes to the correct prompt and returns result', async () => {
            registry.register(makePrompt('greet'));
            const result = await registry.routeGet(undefined as void, 'greet', {});
            expect(result.messages[0]!.content).toEqual({
                type: 'text', text: 'Result from greet',
            });
        });

        it('returns error for unknown prompt', async () => {
            registry.register(makePrompt('greet'));
            const result = await registry.routeGet(undefined as void, 'unknown', {});
            const text = (result.messages[0]!.content as { text: string }).text;
            expect(text).toContain('Unknown prompt');
            expect(text).toContain('greet');
        });

        it('passes schema-validated args to handler', async () => {
            registry.register(makeSchemaPrompt('search'));
            const result = await registry.routeGet(undefined as void, 'search', { query: 'hello' });
            expect((result.messages[0]!.content as { text: string }).text).toBe('Query: hello');
        });
    });

    // ── Interceptors ─────────────────────────────────────

    describe('interceptors', () => {
        it('prepends and appends messages', async () => {
            registry.register(makePrompt('greet'));
            registry.useInterceptor(async (_ctx, builder) => {
                builder.prependUser('Before');
                builder.appendAssistant('After');
            });

            const result = await registry.routeGet(undefined as void, 'greet', {});
            expect(result.messages).toHaveLength(3);
            expect((result.messages[0]!.content as { text: string }).text).toBe('Before');
            expect((result.messages[2]!.content as { text: string }).text).toBe('After');
            expect(result.messages[2]!.role).toBe('assistant');
        });

        it('prependContext formats structured data', async () => {
            registry.register(makePrompt('greet'));
            registry.useInterceptor(async (_ctx, builder) => {
                builder.prependContext('request', { user: 'alice', role: 'admin' });
            });

            const result = await registry.routeGet(undefined as void, 'greet', {});
            const text = (result.messages[0]!.content as { text: string }).text;
            expect(text).toContain('<request_context>');
            expect(text).toContain('user: alice');
        });

        it('receives prompt meta', async () => {
            registry.register(makePrompt('greet'));
            let receivedMeta: unknown;
            registry.useInterceptor(async (_ctx, _builder, meta) => {
                receivedMeta = meta;
            });

            await registry.routeGet(undefined as void, 'greet', {});
            expect(receivedMeta).toEqual(expect.objectContaining({ name: 'greet' }));
        });

        it('returns original result if no messages added', async () => {
            registry.register(makePrompt('greet'));
            registry.useInterceptor(async () => { /* no-op */ });

            const result = await registry.routeGet(undefined as void, 'greet', {});
            expect(result.messages).toHaveLength(1);
        });
    });

    // ── Lifecycle ────────────────────────────────────────

    describe('lifecycle', () => {
        it('has returns false for unregistered prompts', () => {
            expect(registry.has('nonexistent')).toBe(false);
        });

        it('clear removes all prompts', () => {
            registry.registerAll(makePrompt('a'), makePrompt('b'));
            registry.clear();
            expect(registry.size).toBe(0);
        });
    });

    // ── notifyChanged (debounce) ─────────────────────────

    describe('notifyChanged', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('does nothing without a notification sink', () => {
            expect(() => registry.notifyChanged()).not.toThrow();
        });

        it('calls sink after debounce', () => {
            const sink = vi.fn();
            registry.setNotificationSink(sink);
            registry.notifyChanged();

            expect(sink).not.toHaveBeenCalled();
            vi.advanceTimersByTime(100);
            expect(sink).toHaveBeenCalledOnce();
        });

        it('debounces multiple rapid calls', () => {
            const sink = vi.fn();
            registry.setNotificationSink(sink);

            registry.notifyChanged();
            registry.notifyChanged();
            registry.notifyChanged();

            vi.advanceTimersByTime(100);
            expect(sink).toHaveBeenCalledOnce();
        });
    });
});
