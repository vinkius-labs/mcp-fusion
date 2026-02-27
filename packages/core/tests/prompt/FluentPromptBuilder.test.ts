/**
 * FluentPromptBuilder — Unit Tests
 *
 * Covers: fluent chaining, .input() with descriptors and Zod,
 * delegation to definePrompt(), execute lifecycle, middleware,
 * tags, title, icons, timeout, handler requirement.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { FluentPromptBuilder } from '../../src/prompt/FluentPromptBuilder.js';
import { initFusion } from '../../src/core/initFusion.js';
import { PromptMessage } from '../../src/prompt/PromptMessage.js';

// ============================================================================
// Core Builder — Chaining & Metadata
// ============================================================================

describe('FluentPromptBuilder — Core', () => {
    it('should store the name at construction', () => {
        const builder = new FluentPromptBuilder('greet');
        expect(builder.getName()).toBe('greet');
    });

    it('should chain .describe()', () => {
        const builder = new FluentPromptBuilder('greet')
            .describe('Greet someone')
            .handler(async () => ({ messages: [] }));

        expect(builder.getDescription()).toBe('Greet someone');
    });

    it('should chain .title()', () => {
        const builder = new FluentPromptBuilder('greet')
            .title('Greeting')
            .handler(async () => ({ messages: [] }));

        const def = builder.buildPromptDefinition();
        expect(def.name).toBe('greet');
    });

    it('should chain .tags()', () => {
        const builder = new FluentPromptBuilder('greet')
            .tags('public', 'core')
            .handler(async () => ({ messages: [] }));

        expect(builder.getTags()).toEqual(['public', 'core']);
    });

    it('should report hasMiddleware correctly', () => {
        const noMw = new FluentPromptBuilder('a').handler(async () => ({ messages: [] }));
        expect(noMw.hasMiddleware()).toBe(false);

        const withMw = new FluentPromptBuilder('b')
            .use(async (_ctx, _args, next) => next())
            .handler(async () => ({ messages: [] }));
        expect(withMw.hasMiddleware()).toBe(true);
    });

    it('should chain .timeout()', () => {
        const builder = new FluentPromptBuilder('slow')
            .timeout(5000)
            .handler(async () => ({ messages: [] }));

        expect(builder.getHydrationTimeout()).toBe(5000);
    });

    it('should throw if handler is not set when building', () => {
        const builder = new FluentPromptBuilder('incomplete');
        expect(() => builder.buildPromptDefinition()).toThrow('.handler()');
    });
});

// ============================================================================
// .input() — Fluent Descriptors & Zod
// ============================================================================

describe('FluentPromptBuilder — .input()', () => {
    it('should accept Zod schema via .input()', () => {
        const builder = new FluentPromptBuilder('search')
            .input(z.object({ query: z.string() }))
            .handler(async (_ctx, args) => ({
                messages: [{ role: 'user', content: { type: 'text', text: args.query } }],
            }));

        const def = builder.buildPromptDefinition();
        expect(def.arguments).toBeDefined();
        expect(def.arguments!.some(a => a.name === 'query')).toBe(true);
    });

    it('should accept JSON param descriptors via .input()', () => {
        const builder = new FluentPromptBuilder('greet')
            .input({
                name: { type: 'string', required: true, description: 'User name' },
                age: 'number',
            })
            .handler(async () => ({
                messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
            }));

        const def = builder.buildPromptDefinition();
        expect(def.arguments).toBeDefined();
        expect(def.arguments!.some(a => a.name === 'name' && a.required === true)).toBe(true);
    });

    it('should handle prompts with no input', () => {
        const builder = new FluentPromptBuilder('simple')
            .handler(async () => ({
                messages: [{ role: 'user', content: { type: 'text', text: 'done' } }],
            }));

        const def = builder.buildPromptDefinition();
        expect(def.arguments).toBeUndefined();
    });
});

// ============================================================================
// Execute Lifecycle
// ============================================================================

describe('FluentPromptBuilder — execute()', () => {
    it('should execute handler with validated args', async () => {
        const handler = vi.fn(async (_ctx: void, args: { name: string }) => ({
            messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Hello ${args.name}` } }],
        }));

        const builder = new FluentPromptBuilder<void>('greet')
            .input(z.object({ name: z.string() }))
            .handler(handler);

        const result = await builder.execute(undefined as void, { name: 'Alice' });
        expect(handler).toHaveBeenCalledOnce();
        expect((result.messages[0]!.content as { text: string }).text).toBe('Hello Alice');
    });

    it('should execute handler without schema', async () => {
        const builder = new FluentPromptBuilder<void>('simple')
            .handler(async (_ctx, args) => ({
                messages: [{ role: 'user', content: { type: 'text', text: JSON.stringify(args) } }],
            }));

        const result = await builder.execute(undefined as void, { key: 'val' });
        expect((result.messages[0]!.content as { text: string }).text).toContain('key');
    });

    it('should return validation error for invalid input', async () => {
        const builder = new FluentPromptBuilder<void>('strict')
            .input(z.object({ name: z.string().min(1) }))
            .handler(async () => ({
                messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
            }));

        const result = await builder.execute(undefined as void, { name: '' });
        const text = (result.messages[0]!.content as { text: string }).text;
        expect(text).toContain('validation_error');
    });

    it('should coerce string argument to number', async () => {
        const builder = new FluentPromptBuilder<void>('counter')
            .input(z.object({ count: z.number().int() }))
            .handler(async (_ctx, args) => ({
                messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `count=${args.count}` } }],
            }));

        const result = await builder.execute(undefined as void, { count: '42' });
        expect((result.messages[0]!.content as { text: string }).text).toBe('count=42');
    });
});

// ============================================================================
// Middleware
// ============================================================================

describe('FluentPromptBuilder — middleware', () => {
    it('should execute middleware around handler', async () => {
        const calls: string[] = [];

        const builder = new FluentPromptBuilder<void>('greet')
            .use(async (_ctx, _args, next) => {
                calls.push('mw-before');
                const result = await next();
                calls.push('mw-after');
                return result;
            })
            .handler(async () => {
                calls.push('handler');
                return {
                    messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'ok' } }],
                };
            });

        await builder.execute(undefined as void, {});
        expect(calls).toEqual(['mw-before', 'handler', 'mw-after']);
    });
});

// ============================================================================
// initFusion() Integration — f.prompt() Fluent Overload
// ============================================================================

describe('f.prompt() — fluent overload', () => {
    const f = initFusion();

    it('should return FluentPromptBuilder when called with name only', () => {
        const builder = f.prompt('greet');
        expect(builder).toBeInstanceOf(FluentPromptBuilder);
    });

    it('should register and execute a fully fluent prompt', async () => {
        const prompt = f.prompt('welcome')
            .describe('Welcome message')
            .input({ name: { type: 'string', required: true } })
            .handler(async (_ctx, args) => ({
                messages: [{ role: 'user', content: { type: 'text', text: `Welcome ${args.name}!` } }],
            }));

        const result = await prompt.execute(undefined as void, { name: 'Alice' });
        expect((result.messages[0]!.content as { text: string }).text).toBe('Welcome Alice!');
    });

    it('should still support config-bag signature (backward compat)', () => {
        const prompt = f.prompt('compat', {
            args: z.object({ x: z.string() }),
            handler: async () => ({
                messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
            }),
        });

        // Config-bag returns a PromptBuilder (not FluentPromptBuilder)
        expect(prompt.getName()).toBe('compat');
        expect(prompt.buildPromptDefinition().arguments).toBeDefined();
    });
});
