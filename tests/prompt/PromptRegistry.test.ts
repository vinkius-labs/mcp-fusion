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
