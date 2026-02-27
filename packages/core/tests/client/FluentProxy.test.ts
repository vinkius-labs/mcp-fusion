import { describe, it, expect } from 'vitest';
import {
    createFusionClient,
    FusionClientError,
    type FusionTransport,
    type ClientMiddleware,
} from '../../src/client/FusionClient.js';
import { success, error, toolError } from '../../src/core/response.js';
import { type ToolResponse } from '../../src/core/response.js';

// ============================================================================
// Mock Transport Helper
// ============================================================================

function createMockTransport(): FusionTransport & {
    calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    return {
        calls,
        async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
            calls.push({ name, args });
            return success(`${name}:${JSON.stringify(args)}`);
        },
    };
}

// ============================================================================
// FluentProxy — Core Behavior
// ============================================================================

describe('FluentProxy — Core', () => {
    it('should expose a proxy property on the client', () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);
        expect(client.proxy).toBeDefined();
    });

    it('should build dotted path from chained property accesses', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await (client.proxy as any).projects.create({ name: 'Vinkius V2' });

        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0].name).toBe('projects');
        expect(transport.calls[0].args).toEqual({
            action: 'create',
            name: 'Vinkius V2',
        });
    });

    it('should produce the same result as client.execute()', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        const resultA = await client.execute('projects.create', { name: 'V2' });
        const resultB = await (client.proxy as any).projects.create({ name: 'V2' });

        expect(resultA.content[0].text).toBe(resultB.content[0].text);
    });

    it('should handle deep nested paths (3+ segments)', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await (client.proxy as any).platform.users.list({ limit: 10 });

        expect(transport.calls[0].name).toBe('platform');
        expect(transport.calls[0].args).toEqual({
            action: 'users.list',
            limit: 10,
        });
    });

    it('should handle 4-level deep paths', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await (client.proxy as any).a.b.c.d({ x: 1 });

        expect(transport.calls[0].name).toBe('a');
        expect(transport.calls[0].args).toEqual({
            action: 'b.c.d',
            x: 1,
        });
    });

    it('should default to empty args when called without arguments', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await (client.proxy as any).health.check();

        expect(transport.calls[0].name).toBe('health');
        expect(transport.calls[0].args).toEqual({ action: 'check' });
    });

    it('should allow multiple independent calls without interference', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await (client.proxy as any).users.list({ status: 'active' });
        await (client.proxy as any).projects.create({ name: 'P1' });

        expect(transport.calls).toHaveLength(2);
        expect(transport.calls[0].name).toBe('users');
        expect(transport.calls[1].name).toBe('projects');
    });

    it('should be safe to store a partial proxy and reuse it', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        const projects = (client.proxy as any).projects;
        await projects.create({ name: 'A' });
        await projects.list({ workspace_id: 'ws_1' });

        expect(transport.calls).toHaveLength(2);
        expect(transport.calls[0].args['action']).toBe('create');
        expect(transport.calls[1].args['action']).toBe('list');
    });

    it('should be awaitable without .then trapping', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        // Accessing .then should return undefined (not create a deeper proxy)
        // so that Promise.resolve(client.proxy) doesn't blow up
        const thenValue = (client.proxy as any).then;
        expect(thenValue).toBeUndefined();
    });
});

// ============================================================================
// FluentProxy — Error Handling
// ============================================================================

describe('FluentProxy — Error Handling', () => {
    it('should propagate transport errors', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return error('Something went wrong');
            },
        };

        const client = createFusionClient(transport);
        const result = await (client.proxy as any).tool.action({});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Something went wrong');
    });

    it('should propagate transport exceptions as rejected promises', async () => {
        const transport: FusionTransport = {
            async callTool() {
                throw new Error('Network failure');
            },
        };

        const client = createFusionClient(transport);
        await expect((client.proxy as any).tool.action({})).rejects.toThrow('Network failure');
    });

    it('should respect throwOnError option', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return toolError('NOT_FOUND', {
                    message: 'Resource not found.',
                    suggestion: 'Try listing first.',
                    availableActions: ['items.list'],
                });
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });

        try {
            await (client.proxy as any).items.get({ id: '123' });
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(FusionClientError);
            const e = err as FusionClientError;
            expect(e.code).toBe('NOT_FOUND');
            expect(e.message).toBe('Resource not found.');
            expect(e.recovery).toBe('Try listing first.');
        }
    });
});

// ============================================================================
// FluentProxy — Middleware Integration
// ============================================================================

describe('FluentProxy — Middleware', () => {
    it('should apply client middleware pipeline', async () => {
        const order: string[] = [];

        const mw: ClientMiddleware = async (action, args, next) => {
            order.push(`before:${action}`);
            const result = await next(action, args);
            order.push(`after:${action}`);
            return result;
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [mw] });

        await (client.proxy as any).billing.process({ amount: 100 });

        expect(order).toEqual(['before:billing.process', 'after:billing.process']);
    });

    it('should allow middleware to enrich args', async () => {
        const authMw: ClientMiddleware = async (action, args, next) => {
            return next(action, { ...args, _token: 'jwt_xxx' });
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [authMw] });

        await (client.proxy as any).secure.endpoint({ data: 'test' });

        expect(transport.calls[0].args['_token']).toBe('jwt_xxx');
    });
});

// ============================================================================
// FluentProxy — Concurrent Usage
// ============================================================================

describe('FluentProxy — Concurrency', () => {
    it('should handle concurrent proxy calls without interference', async () => {
        let callCount = 0;
        const transport: FusionTransport = {
            async callTool(name) {
                callCount++;
                await new Promise(r => setTimeout(r, 10));
                return success(`${name}:${callCount}`);
            },
        };

        const client = createFusionClient(transport);

        const results = await Promise.all([
            (client.proxy as any).a.one({}),
            (client.proxy as any).b.two({}),
            (client.proxy as any).c.three({}),
        ]);

        expect(results).toHaveLength(3);
        results.forEach((r: ToolResponse) => {
            expect(r.content[0].text).toBeDefined();
        });
    });
});
