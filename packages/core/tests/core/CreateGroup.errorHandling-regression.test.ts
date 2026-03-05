/**
 * Regression tests for Bug #6:
 * createGroup.execute() throws exceptions instead of returning ToolResponse.
 *
 * The function signature promises Promise<ToolResponse> but threw Error for
 * unknown actions and ZodError for validation failures. Callers without
 * try-catch would get unhandled exceptions, potentially crashing the MCP server.
 *
 * Fixed by using toolError() / safeParse() to return ToolResponse with isError: true.
 * Also pre-computes strict schemas at creation time (Bug #23 bonus fix).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createGroup } from '../../src/core/createGroup.js';
import { success } from '../../src/core/response.js';

describe('createGroup.execute() error handling — Bug #6 Regression', () => {
    it('returns isError ToolResponse for unknown action (never throws)', async () => {
        const group = createGroup({
            name: 'billing',
            actions: {
                pay: { handler: async () => success('paid') },
            },
        });

        // Must NOT throw — returns ToolResponse
        const result = await group.execute(undefined as never, 'refund', {});
        expect(result.isError).toBe(true);
        expect(result.content[0]?.type).toBe('text');
        expect(result.content[0]?.text).toContain('Unknown action "refund"');
        expect(result.content[0]?.text).toContain('billing');
        expect(result.content[0]?.text).toContain('INVALID_PARAMS');
    });

    it('returns isError ToolResponse for Zod validation failure (never throws)', async () => {
        const group = createGroup({
            name: 'users',
            actions: {
                create: {
                    schema: z.object({
                        name: z.string(),
                        age: z.number().int().positive(),
                    }),
                    handler: async (_, args) => success(`User: ${args.name}`),
                },
            },
        });

        // Missing required field
        const result = await group.execute(undefined as never, 'create', { name: 'Alice' });
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Validation failed');
        expect(result.content[0]?.text).toContain('INVALID_PARAMS');
    });

    it('returns isError for wrong field type', async () => {
        const group = createGroup({
            name: 'orders',
            actions: {
                get: {
                    schema: z.object({ id: z.string().uuid() }),
                    handler: async () => success('order found'),
                },
            },
        });

        const result = await group.execute(undefined as never, 'get', { id: 'not-a-uuid' });
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Validation failed');
    });

    it('returns isError for unknown fields (strict schema)', async () => {
        const group = createGroup({
            name: 'tasks',
            actions: {
                create: {
                    schema: z.object({ title: z.string() }),
                    handler: async (_, args) => success(args.title),
                },
            },
        });

        // Extra unknown field should fail strict validation
        const result = await group.execute(undefined as never, 'create', {
            title: 'Buy milk',
            extraField: 'should not be here',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Validation failed');
    });

    it('successful execution still returns normal ToolResponse', async () => {
        const group = createGroup({
            name: 'tasks',
            actions: {
                create: {
                    schema: z.object({ title: z.string() }),
                    handler: async (_, args) => success(`Created: ${args.title}`),
                },
            },
        });

        const result = await group.execute(undefined as never, 'create', { title: 'Buy milk' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('Created: Buy milk');
    });

    it('error response includes Zod field path in issues', async () => {
        const group = createGroup({
            name: 'nested',
            actions: {
                update: {
                    schema: z.object({
                        config: z.object({
                            timeout: z.number(),
                        }),
                    }),
                    handler: async () => success('updated'),
                },
            },
        });

        const result = await group.execute(undefined as never, 'update', {
            config: { timeout: 'not-a-number' },
        });
        expect(result.isError).toBe(true);
        // Should include path like 'config.timeout'
        expect(result.content[0]?.text).toMatch(/config\.timeout/);
    });

    it('error response lists available actions for unknown action', async () => {
        const group = createGroup({
            name: 'shop',
            actions: {
                list_products: { handler: async () => success('products') },
                add_to_cart: { handler: async () => success('added') },
                checkout: { handler: async () => success('done') },
            },
        });

        const result = await group.execute(undefined as never, 'nonexistent', {});
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('list_products');
        expect(result.content[0]?.text).toContain('add_to_cart');
        expect(result.content[0]?.text).toContain('checkout');
    });

    it('handler errors still propagate (only validation/routing errors are caught)', async () => {
        const group = createGroup({
            name: 'db',
            actions: {
                crash: {
                    handler: async () => { throw new Error('DB connection failed'); },
                },
            },
        });

        // Handler errors should still throw (they are runtime errors, not input errors)
        await expect(group.execute(undefined as never, 'crash', {}))
            .rejects.toThrow('DB connection failed');
    });
});
