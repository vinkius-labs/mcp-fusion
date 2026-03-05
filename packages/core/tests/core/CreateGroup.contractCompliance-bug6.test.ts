/**
 * Bug #6 — createGroup.execute() lança exceções em vez de retornar ToolResponse.
 *
 * WHAT THE OLD TESTS MISSED:
 * The old CreateGroup.test.ts actually EXPECTED the throws:
 *   - 'should throw for unknown action' → rejects.toThrow()
 *   - 'should validate args with Zod schema' → rejects.toThrow()
 *
 * This means the old tests were testing the BUGGY behavior as if it were
 * correct! The function signature promises `Promise<ToolResponse>` but the
 * tests verified it threw exceptions. Any caller without try-catch would
 * crash the entire MCP server.
 *
 * THE FIX:
 * - Unknown action → toolError('...', 'INVALID_PARAMS') instead of throw
 * - Zod validation → safeParse() returning ToolResponse instead of parse() throwing
 * - Strict schemas pre-computed at creation time (bonus #23)
 *
 * THESE TESTS verify the contract: execute() ALWAYS returns ToolResponse,
 * NEVER throws for input validation errors. Only handler runtime errors
 * (like DB failures) are allowed to propagate as exceptions.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createGroup } from '../../src/core/createGroup.js';
import { success } from '../../src/core/response.js';

describe('Bug #6 — createGroup.execute() contract compliance', () => {

    // ── Unknown action: must return ToolResponse, NEVER throw ──

    it('execute() returns isError ToolResponse for unknown action (never throws)', async () => {
        const group = createGroup({
            name: 'orders',
            actions: {
                list: { handler: async () => success('orders') },
                create: { handler: async () => success('created') },
            },
        });

        // The old test did: await expect(group.execute(...)).rejects.toThrow()
        // That was testing the BUG as correct behavior!

        // The correct expectation: execute() resolves (no throw), returns ToolResponse
        const result = await group.execute(undefined as never, 'nonexistent', {});

        expect(result).toBeDefined();
        expect(result.isError).toBe(true);
        expect(result.content).toBeInstanceOf(Array);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0]?.type).toBe('text');
        expect(result.content[0]?.text).toContain('Unknown action');
        expect(result.content[0]?.text).toContain('nonexistent');
        expect(result.content[0]?.text).toContain('INVALID_PARAMS');
    });

    it('error response lists all available actions', async () => {
        const group = createGroup({
            name: 'store',
            actions: {
                list_products: { handler: async () => success('products') },
                add_to_cart: { handler: async () => success('added') },
                checkout: { handler: async () => success('done') },
                apply_coupon: { handler: async () => success('applied') },
            },
        });

        const result = await group.execute(undefined as never, 'invalid_action', {});
        const text = result.content[0]?.text ?? '';

        // All available actions should be listed so the LLM can self-correct
        expect(text).toContain('list_products');
        expect(text).toContain('add_to_cart');
        expect(text).toContain('checkout');
        expect(text).toContain('apply_coupon');
    });

    // ── Zod validation: must return ToolResponse, NEVER throw ZodError ──

    it('Zod validation failure returns ToolResponse (never throws ZodError)', async () => {
        const group = createGroup({
            name: 'users',
            actions: {
                create: {
                    schema: z.object({
                        name: z.string().min(1),
                        email: z.string().email(),
                        age: z.number().int().positive(),
                    }),
                    handler: async (_, args) => success(`User: ${args.name}`),
                },
            },
        });

        // Missing all required fields
        const result = await group.execute(undefined as never, 'create', {});

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Validation failed');
        expect(result.content[0]?.text).toContain('INVALID_PARAMS');
    });

    it('Zod validation error includes field paths', async () => {
        const group = createGroup({
            name: 'config',
            actions: {
                update: {
                    schema: z.object({
                        database: z.object({
                            host: z.string(),
                            port: z.number().int().min(1).max(65535),
                        }),
                        cache: z.object({
                            ttl: z.number().positive(),
                        }),
                    }),
                    handler: async () => success('updated'),
                },
            },
        });

        const result = await group.execute(undefined as never, 'update', {
            database: { host: 'localhost', port: 'not_a_number' },
            cache: { ttl: -5 },
        });

        expect(result.isError).toBe(true);
        const text = result.content[0]?.text ?? '';

        // Should include dot-separated paths like 'database.port', 'cache.ttl'
        expect(text).toMatch(/database\.port/);
        expect(text).toMatch(/cache\.ttl/);
    });

    it('wrong field type returns validation error (never throws)', async () => {
        const group = createGroup({
            name: 'tasks',
            actions: {
                create: {
                    schema: z.object({
                        title: z.string(),
                        priority: z.number().int().min(1).max(5),
                    }),
                    handler: async (_, args) => success(args.title as string),
                },
            },
        });

        const result = await group.execute(undefined as never, 'create', {
            title: 42,       // should be string
            priority: 'high', // should be number
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Validation failed');
    });

    // ── Strict schema: unknown fields cause validation error, not crash ──

    it('unknown fields fail strict schema (returns error, never throws)', async () => {
        const group = createGroup({
            name: 'api',
            actions: {
                call: {
                    schema: z.object({ endpoint: z.string() }),
                    handler: async (_, args) => success(args.endpoint as string),
                },
            },
        });

        const result = await group.execute(undefined as never, 'call', {
            endpoint: '/users',
            hackField: 'malicious',
            anotherUnknown: 123,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Validation failed');
    });

    // ── Happy path: valid input still works ──

    it('valid execution returns normal ToolResponse (not isError)', async () => {
        const group = createGroup({
            name: 'math',
            actions: {
                add: {
                    schema: z.object({ a: z.number(), b: z.number() }),
                    handler: async (_, args) => success(String((args.a as number) + (args.b as number))),
                },
            },
        });

        const result = await group.execute(undefined as never, 'add', { a: 3, b: 7 });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('10');
    });

    it('action without schema accepts any args and works', async () => {
        const group = createGroup({
            name: 'echo',
            actions: {
                say: {
                    handler: async (_, args) => success(JSON.stringify(args)),
                },
            },
        });

        const result = await group.execute(undefined as never, 'say', { anything: 'goes', nested: { x: 1 } });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('anything');
    });

    // ── Runtime handler errors: these SHOULD still throw ──

    it('handler runtime error propagates (not caught by input validation)', async () => {
        const group = createGroup({
            name: 'db',
            actions: {
                query: {
                    handler: async () => {
                        throw new Error('Connection refused');
                    },
                },
            },
        });

        // Handler errors are NOT input validation errors — they SHOULD throw
        // so the MCP server can catch and return a proper error response.
        await expect(group.execute(undefined as never, 'query', {}))
            .rejects.toThrow('Connection refused');
    });

    it('handler TypeError propagates (distinguishes from input errors)', async () => {
        const group = createGroup({
            name: 'broken',
            actions: {
                crash: {
                    handler: async () => {
                        const obj: any = null;
                        return obj.nonexistent.method(); // TypeError
                    },
                },
            },
        });

        await expect(group.execute(undefined as never, 'crash', {}))
            .rejects.toThrow(TypeError);
    });

    // ── Bonus #23: strict schemas pre-computed ──

    it('strict schema is applied consistently across multiple calls', async () => {
        const group = createGroup({
            name: 'test',
            actions: {
                op: {
                    schema: z.object({ x: z.number() }),
                    handler: async (_, args) => success(String(args.x)),
                },
            },
        });

        // Call multiple times with unknown fields — all should fail consistently
        const results = await Promise.all([
            group.execute(undefined as never, 'op', { x: 1, extra: 'a' }),
            group.execute(undefined as never, 'op', { x: 2, extra: 'b' }),
            group.execute(undefined as never, 'op', { x: 3, extra: 'c' }),
        ]);

        for (const r of results) {
            expect(r.isError).toBe(true);
            expect(r.content[0]?.text).toContain('Validation failed');
        }

        // Valid calls still work
        const valid = await group.execute(undefined as never, 'op', { x: 42 });
        expect(valid.isError).toBeUndefined();
        expect(valid.content[0]?.text).toContain('42');
    });

    // ── Edge case: empty group ──

    it('group with no actions returns error for any action name', async () => {
        const group = createGroup({
            name: 'empty',
            actions: {},
        });

        const result = await group.execute(undefined as never, 'anything', {});

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Unknown action');
    });
});
