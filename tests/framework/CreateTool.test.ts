import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { success, error } from '../../src/framework/response.js';
import { type MiddlewareFn } from '../../src/framework/types.js';

// ============================================================================
// createTool Factory Function Tests
// ============================================================================

describe('createTool()', () => {
    it('should create a GroupedToolBuilder with the given name', () => {
        const builder = createTool('test_tool');
        expect(builder.getName()).toBe('test_tool');
    });

    it('should return a builder that supports fluent chaining', () => {
        const builder = createTool('test')
            .description('A test tool')
            .tags('core', 'test');

        expect(builder.getName()).toBe('test');
        expect(builder.getTags()).toEqual(['core', 'test']);
    });

    it('should build a valid MCP tool definition', () => {
        const builder = createTool('echo')
            .description('Echo tool')
            .action({
                name: 'say',
                schema: z.object({ message: z.string() }),
                handler: async (_ctx, args) => success(args.message as string),
            });

        const tool = builder.buildToolDefinition();
        expect(tool.name).toBe('echo');
        expect(tool.description).toContain('Echo tool');
        expect(tool.inputSchema).toBeDefined();
    });

    it('should execute actions correctly', async () => {
        const builder = createTool('greet')
            .action({
                name: 'hello',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => success(`Hello, ${args.name}!`),
            });

        const result = await builder.execute(undefined, { action: 'hello', name: 'World' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('Hello, World!');
    });

    it('should support typed context', async () => {
        interface TestCtx { userId: string }

        const builder = createTool<TestCtx>('ctx_test')
            .action({
                name: 'whoami',
                handler: async (ctx, _args) => success(ctx.userId),
            });

        const result = await builder.execute({ userId: 'user_42' }, { action: 'whoami' });
        expect(result.content[0].text).toBe('user_42');
    });

    it('should support commonSchema with type inference', async () => {
        const builder = createTool('projects')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .action({
                name: 'list',
                handler: async (_ctx, args) => success({ ws: args.workspace_id }),
            });

        const result = await builder.execute(undefined, {
            action: 'list',
            workspace_id: 'ws_123',
        });
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual({ ws: 'ws_123' });
    });

    it('should support hierarchical groups', async () => {
        const builder = createTool('platform')
            .group('users', 'User management', g => {
                g.action({
                    name: 'list',
                    handler: async (_ctx, _args) => success('user list'),
                });
            })
            .group('billing', g => {
                g.action({
                    name: 'status',
                    handler: async (_ctx, _args) => success('billing ok'),
                });
            });

        const userResult = await builder.execute(undefined, { action: 'users.list' });
        expect(userResult.content[0].text).toBe('user list');

        const billingResult = await builder.execute(undefined, { action: 'billing.status' });
        expect(billingResult.content[0].text).toBe('billing ok');
    });

    it('should support middleware', async () => {
        const calls: string[] = [];

        const logger: MiddlewareFn<void> = async (_ctx, _args, next) => {
            calls.push('before');
            const result = await next();
            calls.push('after');
            return result;
        };

        const builder = createTool('mw_test')
            .use(logger)
            .action({
                name: 'run',
                handler: async (_ctx, _args) => {
                    calls.push('handler');
                    return success('done');
                },
            });

        await builder.execute(undefined, { action: 'run' });
        expect(calls).toEqual(['before', 'handler', 'after']);
    });

    it('should return error for unknown actions', async () => {
        const builder = createTool('strict')
            .action({
                name: 'only_this',
                handler: async () => success('ok'),
            });

        const result = await builder.execute(undefined, { action: 'nonexistent' });
        expect(result.isError).toBe(true);
    });

    it('should support discriminator customization', async () => {
        const builder = createTool('custom')
            .discriminator('operation')
            .action({
                name: 'ping',
                handler: async () => success('pong'),
            });

        const result = await builder.execute(undefined, { operation: 'ping' });
        expect(result.content[0].text).toBe('pong');
    });

    it('should support toonDescription()', () => {
        const builder = createTool('toon_test')
            .toonDescription()
            .action({
                name: 'test',
                handler: async () => success('ok'),
            });

        const tool = builder.buildToolDefinition();
        expect(tool.description).toBeDefined();
    });

    it('should support getActionMetadata()', () => {
        const builder = createTool('meta_test')
            .action({
                name: 'create',
                description: 'Create something',
                destructive: false,
                readOnly: false,
                schema: z.object({ name: z.string() }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'delete',
                destructive: true,
                handler: async () => success('ok'),
            });

        const meta = builder.getActionMetadata();
        expect(meta).toHaveLength(2);
        expect(meta[0].key).toBe('create');
        expect(meta[0].destructive).toBe(false);
        expect(meta[0].requiredFields).toContain('name');
        expect(meta[1].key).toBe('delete');
        expect(meta[1].destructive).toBe(true);
    });

    it('should freeze after build', () => {
        const builder = createTool('freeze_test')
            .action({ name: 'a', handler: async () => success('ok') });

        builder.buildToolDefinition();

        expect(() => {
            builder.action({ name: 'b', handler: async () => success('nope') });
        }).toThrow(/frozen/);
    });
});
