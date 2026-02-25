/**
 * Tests for createGroup() — Functional Core Alternative
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createGroup } from '../../src/core/createGroup.js';
import { success, error } from '../../src/core/response.js';

describe('createGroup', () => {
    it('should create a frozen CompiledGroup', () => {
        const group = createGroup({
            name: 'tasks',
            actions: {
                list: {
                    readOnly: true,
                    handler: async () => success([]),
                },
            },
        });

        expect(group.name).toBe('tasks');
        expect(Object.isFrozen(group)).toBe(true);
    });

    it('should list all action names', () => {
        const group = createGroup({
            name: 'billing',
            actions: {
                get_invoice: { handler: async () => success('inv') },
                pay: { handler: async () => success('paid') },
                refund: { handler: async () => success('refunded') },
            },
        });

        expect(group.actionNames).toEqual(['get_invoice', 'pay', 'refund']);
        expect(Object.isFrozen(group.actionNames)).toBe(true);
    });

    it('should execute an action by name', async () => {
        const group = createGroup<{ userId: string }>({
            name: 'test',
            actions: {
                greet: {
                    handler: async (ctx) => success(`Hello ${ctx.userId}`),
                },
            },
        });

        const result = await group.execute({ userId: 'alice' }, 'greet', {});
        expect(result.content[0]?.text).toContain('Hello alice');
    });

    it('should throw for unknown action', async () => {
        const group = createGroup({
            name: 'test',
            actions: {
                a: { handler: async () => success('a') },
            },
        });

        await expect(group.execute(undefined as never, 'unknown', {}))
            .rejects.toThrow('Unknown action "unknown" in group "test"');
    });

    it('should validate args with Zod schema', async () => {
        const group = createGroup({
            name: 'test',
            actions: {
                create: {
                    schema: z.object({ name: z.string() }),
                    handler: async (_, args) => success(args.name),
                },
            },
        });

        await expect(group.execute(undefined as never, 'create', { name: 123 as unknown }))
            .rejects.toThrow();

        const result = await group.execute(undefined as never, 'create', { name: 'valid' });
        expect(result.content[0]?.text).toContain('valid');
    });

    it('should apply global middleware', async () => {
        const log: string[] = [];

        const group = createGroup<void>({
            name: 'test',
            middleware: [
                async (_ctx, _args, next) => {
                    log.push('before');
                    const result = await next();
                    log.push('after');
                    return result;
                },
            ],
            actions: {
                run: {
                    handler: async () => {
                        log.push('handler');
                        return success('ok');
                    },
                },
            },
        });

        await group.execute(undefined as never, 'run', {});
        expect(log).toEqual(['before', 'handler', 'after']);
    });

    it('should apply per-action middleware on top of global', async () => {
        const log: string[] = [];

        const group = createGroup<void>({
            name: 'test',
            middleware: [
                async (_ctx, _args, next) => {
                    log.push('global');
                    return next();
                },
            ],
            actions: {
                run: {
                    middleware: [
                        async (_ctx, _args, next) => {
                            log.push('action');
                            return next();
                        },
                    ],
                    handler: async () => {
                        log.push('handler');
                        return success('ok');
                    },
                },
            },
        });

        await group.execute(undefined as never, 'run', {});
        expect(log).toEqual(['global', 'action', 'handler']);
    });

    it('should store and retrieve action metadata', () => {
        const group = createGroup({
            name: 'test',
            actions: {
                read: { readOnly: true, description: 'Read data', handler: async () => success('') },
                delete: { destructive: true, handler: async () => success('') },
            },
        });

        expect(group.getAction('read')?.readOnly).toBe(true);
        expect(group.getAction('read')?.description).toBe('Read data');
        expect(group.getAction('delete')?.destructive).toBe(true);
        expect(group.getAction('nonexistent')).toBeUndefined();
    });

    it('should freeze tags array', () => {
        const group = createGroup({
            name: 'test',
            tags: ['admin', 'beta'],
            actions: { a: { handler: async () => success('') } },
        });

        expect(group.tags).toEqual(['admin', 'beta']);
        expect(Object.isFrozen(group.tags)).toBe(true);
    });

    it('should support description and tags metadata', () => {
        const group = createGroup({
            name: 'billing',
            description: 'Billing operations',
            tags: ['finance'],
            actions: {
                list: { handler: async () => success([]) },
            },
        });

        expect(group.description).toBe('Billing operations');
        expect(group.tags).toContain('finance');
    });
});
