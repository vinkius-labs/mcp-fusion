/**
 * definePrompt — Unit Tests
 *
 * Covers: prompt creation with Zod schema, JSON descriptors,
 * middleware, tags, title/description, execute lifecycle.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { definePrompt } from '../../src/prompt/definePrompt.js';

// ── Basic Creation ───────────────────────────────────────

describe('definePrompt', () => {
    describe('creation', () => {
        it('creates a prompt builder with name', () => {
            const prompt = definePrompt<void>('greet', {
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
                }),
            });
            expect(prompt.getName()).toBe('greet');
        });

        it('creates with description', () => {
            const prompt = definePrompt<void>('greet', {
                description: 'A greeting prompt',
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
                }),
            });
            expect(prompt.getDescription()).toBe('A greeting prompt');
        });

        it('creates with tags', () => {
            const prompt = definePrompt<void>('greet', {
                tags: ['core', 'public'],
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
                }),
            });
            expect(prompt.getTags()).toEqual(['core', 'public']);
        });

        it('defaults to empty tags', () => {
            const prompt = definePrompt<void>('greet', {
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
                }),
            });
            expect(prompt.getTags()).toEqual([]);
        });
    });

    // ── Schema: Zod ──────────────────────────────────────

    describe('Zod schema', () => {
        it('accepts a Zod schema for args', () => {
            const prompt = definePrompt<void>('search', {
                args: z.object({ query: z.string() }),
                handler: async (_ctx, args) => ({
                    messages: [{ role: 'user', content: { type: 'text', text: args.query } }],
                }),
            });
            const def = prompt.buildPromptDefinition();
            expect(def.arguments).toBeDefined();
            expect(def.arguments!.some(a => a.name === 'query')).toBe(true);
        });

        it('rejects nested schemas (arrays)', () => {
            expect(() => definePrompt<void>('bad', {
                args: z.object({ items: z.array(z.string()) }),
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'test' } }],
                }),
            })).toThrow('ZodArray');
        });
    });

    // ── Schema: JSON Descriptors ─────────────────────────

    describe('JSON descriptors', () => {
        it('converts JSON descriptors to Zod schema', () => {
            const prompt = definePrompt<void>('greet', {
                args: {
                    name: { type: 'string', required: true, description: 'User name' },
                    age: 'number',
                } as const,
                handler: async (_ctx, _args) => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
                }),
            });
            const def = prompt.buildPromptDefinition();
            expect(def.arguments).toBeDefined();
            expect(def.arguments!.some(a => a.name === 'name' && a.required === true)).toBe(true);
            expect(def.arguments!.some(a => a.name === 'age')).toBe(true);
        });
    });

    // ── buildPromptDefinition ────────────────────────────

    describe('buildPromptDefinition', () => {
        it('returns MCP-compliant prompt definition', () => {
            const prompt = definePrompt<void>('greet', {
                description: 'Greet someone',
                args: z.object({ name: z.string() }),
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
                }),
            });

            const def = prompt.buildPromptDefinition();
            expect(def.name).toBe('greet');
            expect(def.description).toBe('Greet someone');
            expect(def.arguments).toHaveLength(1);
            expect(def.arguments![0]!.name).toBe('name');
        });

        it('handles prompts with no args', () => {
            const prompt = definePrompt<void>('simple', {
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'done' } }],
                }),
            });

            const def = prompt.buildPromptDefinition();
            expect(def.name).toBe('simple');
            expect(def.arguments).toBeUndefined();
        });
    });

    // ── execute ──────────────────────────────────────────

    describe('execute', () => {
        it('executes handler with coerced and validated args', async () => {
            const handler = vi.fn(async (_ctx: void, args: { name: string }) => ({
                messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Hello ${args.name}` } }],
            }));

            const prompt = definePrompt<void>('greet', {
                args: z.object({ name: z.string() }),
                handler,
            });

            // Build definition to compile
            prompt.buildPromptDefinition();

            const result = await prompt.execute(undefined as void, { name: 'Alice' });
            expect(handler).toHaveBeenCalledOnce();
            expect((result.messages[0]!.content as { text: string }).text).toBe('Hello Alice');
        });

        it('executes handler without schema', async () => {
            const prompt = definePrompt<void>('simple', {
                handler: async (_ctx, args) => ({
                    messages: [{ role: 'user', content: { type: 'text', text: `args: ${JSON.stringify(args)}` } }],
                }),
            });

            prompt.buildPromptDefinition();
            const result = await prompt.execute(undefined as void, { any: 'value' });
            expect((result.messages[0]!.content as { text: string }).text).toContain('any');
        });

        it('returns validation error for invalid input', async () => {
            const prompt = definePrompt<void>('greet', {
                args: z.object({ name: z.string().min(1) }),
                handler: async () => ({
                    messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
                }),
            });

            prompt.buildPromptDefinition();
            const result = await prompt.execute(undefined as void, { name: '' });
            const text = (result.messages[0]!.content as { text: string }).text;
            expect(text).toContain('validation_error');
        });

        it('coerces number arguments from strings', async () => {
            const handler = vi.fn(async (_ctx: void, args: { count: number }) => ({
                messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `count=${args.count}` } }],
            }));

            const prompt = definePrompt<void>('counter', {
                args: z.object({ count: z.number().int() }),
                handler,
            });

            prompt.buildPromptDefinition();
            const result = await prompt.execute(undefined as void, { count: '42' });
            expect((result.messages[0]!.content as { text: string }).text).toBe('count=42');
        });
    });

    // ── Middleware ────────────────────────────────────────

    describe('middleware', () => {
        it('executes middleware chain around handler', async () => {
            const calls: string[] = [];

            const prompt = definePrompt<void>('greet', {
                middleware: [
                    async (_ctx, _args, next) => {
                        calls.push('mw-before');
                        const result = await next();
                        calls.push('mw-after');
                        return result;
                    },
                ],
                handler: async () => {
                    calls.push('handler');
                    return {
                        messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'ok' } }],
                    };
                },
            });

            prompt.buildPromptDefinition();
            await prompt.execute(undefined as void, {});
            expect(calls).toEqual(['mw-before', 'handler', 'mw-after']);
        });
    });
});
