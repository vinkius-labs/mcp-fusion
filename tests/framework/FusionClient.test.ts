import { describe, it, expect } from 'vitest';
import { createFusionClient, type FusionTransport } from '../../src/framework/client/FusionClient.js';
import { success, error } from '../../src/framework/response.js';
import { type ToolResponse } from '../../src/framework/response.js';

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
// createFusionClient() — Unit Tests
// ============================================================================

describe('createFusionClient()', () => {
    it('should create a client with execute method', () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);
        expect(typeof client.execute).toBe('function');
    });

    it('should split dotted action path into tool + action', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('projects.create', { name: 'Vinkius V2' });

        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0].name).toBe('projects');
        expect(transport.calls[0].args).toEqual({
            action: 'create',
            name: 'Vinkius V2',
        });
    });

    it('should handle simple (non-dotted) action names', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('ping', {});

        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0].name).toBe('ping');
        expect(transport.calls[0].args).toEqual({});
    });

    it('should handle nested group actions (two dots)', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('platform.users.list', { limit: 10 });

        expect(transport.calls[0].name).toBe('platform');
        expect(transport.calls[0].args).toEqual({
            action: 'users.list',
            limit: 10,
        });
    });

    it('should handle deeply nested paths (three+ dots)', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('a.b.c.d', { x: 1 });

        expect(transport.calls[0].name).toBe('a');
        expect(transport.calls[0].args).toEqual({
            action: 'b.c.d',
            x: 1,
        });
    });

    it('should return the transport response', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return success('result from server');
            },
        };

        const client = createFusionClient(transport);
        const result = await client.execute('test.action', {});

        expect(result.content[0].text).toBe('result from server');
    });

    it('should pass through error responses', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return error('Something went wrong');
            },
        };

        const client = createFusionClient(transport);
        const result = await client.execute('test.action', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Something went wrong');
    });

    it('should handle multiple sequential calls', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('a.one', { x: 1 });
        await client.execute('b.two', { y: 2 });
        await client.execute('c.three', { z: 3 });

        expect(transport.calls).toHaveLength(3);
        expect(transport.calls.map(c => c.name)).toEqual(['a', 'b', 'c']);
    });

    it('should support typed router map', async () => {
        type MyRouter = {
            'projects.list': { workspace_id: string };
            'projects.create': { workspace_id: string; name: string };
        };

        const transport = createMockTransport();
        const client = createFusionClient<MyRouter>(transport);

        await client.execute('projects.list', { workspace_id: 'ws_1' });
        await client.execute('projects.create', { workspace_id: 'ws_1', name: 'Test' });

        expect(transport.calls).toHaveLength(2);
    });
});

// ============================================================================
// FusionClient — Error / Edge Cases
// ============================================================================

describe('FusionClient error handling', () => {
    it('should propagate transport exceptions as rejected promises', async () => {
        const transport: FusionTransport = {
            async callTool() {
                throw new Error('Network failure');
            },
        };

        const client = createFusionClient(transport);
        await expect(client.execute('test.action', {})).rejects.toThrow('Network failure');
    });

    it('should handle empty args object', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('tool.action', {});

        expect(transport.calls[0].args).toEqual({ action: 'action' });
    });

    it('should handle args with special characters in values', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('tool.action', { query: 'hello "world" & <script>' });

        expect(transport.calls[0].args['query']).toBe('hello "world" & <script>');
    });

    it('should handle action name with leading dot', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('.weird', { x: 1 });

        expect(transport.calls[0].name).toBe('');
        expect(transport.calls[0].args).toEqual({ action: 'weird', x: 1 });
    });

    it('should handle action name with trailing dot', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('tool.', { x: 1 });

        expect(transport.calls[0].name).toBe('tool');
        expect(transport.calls[0].args).toEqual({ action: '', x: 1 });
    });

    it('should handle concurrent calls without interference', async () => {
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
            client.execute('a.one', {}),
            client.execute('b.two', {}),
            client.execute('c.three', {}),
        ]);

        expect(results).toHaveLength(3);
        results.forEach(r => {
            expect(r.content[0].text).toBeDefined();
        });
    });

    it('should preserve args that include an "action" key (override)', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        // User passes { action: 'custom' } — but the client also sets action from the path
        await client.execute('tool.fromPath', { action: 'fromUser' });

        // Since spread comes after the explicit action, user's "action" key wins
        expect(transport.calls[0].args['action']).toBe('fromUser');
    });
});
