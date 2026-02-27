/**
 * Tests for initFusion() — Canonical Fluent API entry point
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { initFusion } from '../../src/core/initFusion.js';
import { success } from '../../src/core/response.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';

interface TestContext {
    db: { users: { findMany: () => string[] } };
    userId: string;
}

describe('initFusion', () => {
    it('should create a FusionInstance with typed factory methods', () => {
        const f = initFusion<TestContext>();

        expect(f).toBeDefined();
        expect(typeof f.query).toBe('function');
        expect(typeof f.mutation).toBe('function');
        expect(typeof f.action).toBe('function');
        expect(typeof f.presenter).toBe('function');
        expect(typeof f.middleware).toBe('function');
        expect(typeof f.defineTool).toBe('function');
        expect(typeof f.registry).toBe('function');
        expect(typeof f.router).toBe('function');
    });

    it('f.query() should create a read-only tool via fluent API', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('users.list')
            .handle(async (input, ctx) => success(ctx.db.users.findMany()));

        expect(tool.getName()).toBe('users');
        expect(tool.getActionNames()).toContain('list');

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
    });

    it('f.mutation() should create a destructive tool', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('billing.get_invoice')
            .handle(async () => success('ok'));

        expect(tool.getName()).toBe('billing');
        const actionNames = tool.getActionNames();
        expect(actionNames).toContain('get_invoice');
    });

    it('f.query() handler should receive (input, ctx)', async () => {
        const f = initFusion<TestContext>();

        let receivedCtx: TestContext | undefined;
        let receivedInput: unknown;

        const tool = f.query('test.action')
            .withString('msg', 'Message')
            .handle(async (input, ctx) => {
                receivedCtx = ctx;
                receivedInput = input;
                return success('done');
            });

        const ctx: TestContext = {
            db: { users: { findMany: () => ['alice'] } },
            userId: 'u-1',
        };

        const result = await tool.execute(ctx, { action: 'action', msg: 'hello' });
        expect(receivedCtx).toBe(ctx);
        expect(receivedInput).toEqual(expect.objectContaining({ msg: 'hello' }));
    });

    it('f.query() should auto-wrap non-ToolResponse results', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('test.simple')
            .handle(async () => success({ result: 'data' }));

        const ctx: TestContext = {
            db: { users: { findMany: () => [] } },
            userId: 'u-1',
        };

        const result = await tool.execute(ctx, { action: 'simple' });
        expect(result.content).toBeDefined();
        expect(result.content[0]?.text).toContain('data');
    });

    it('f.presenter() should delegate to definePresenter', () => {
        const f = initFusion<TestContext>();

        const presenter = f.presenter({
            name: 'Invoice',
            schema: z.object({ id: z.string(), amount: z.number() }),
            rules: ['Amount in cents.'],
        });

        expect(presenter.name).toBe('Invoice');
    });

    it('f.registry() should return a ToolRegistry', () => {
        const f = initFusion<TestContext>();
        const registry = f.registry();

        expect(registry).toBeInstanceOf(ToolRegistry);
    });

    it('f.defineTool() should delegate to standard defineTool', () => {
        const f = initFusion<TestContext>();

        const tool = f.defineTool('platform', {
            actions: {
                ping: {
                    readOnly: true,
                    handler: async () => success('pong'),
                },
            },
        });

        expect(tool.getName()).toBe('platform');
        expect(tool.getActionNames()).toContain('ping');
    });

    it('f.query() with no dot in name should use "default" action', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('echo')
            .handle(async () => success('echo'));

        expect(tool.getName()).toBe('echo');
        expect(tool.getActionNames()).toContain('default');
    });

    it('f.mutation() should forward tags', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('admin.delete')
            .tags('admin', 'destructive')
            .handle(async () => success('deleted'));

        expect(tool.getTags()).toContain('admin');
        expect(tool.getTags()).toContain('destructive');
    });

    it('f.middleware() should create a MiddlewareDefinition', () => {
        const f = initFusion<TestContext>();

        const mw = f.middleware(async (ctx) => ({
            enriched: true,
        }));

        expect(mw).toBeDefined();
        expect(typeof mw.toMiddlewareFn).toBe('function');
    });
});
