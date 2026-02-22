/**
 * McpServerAdapter.test.ts
 *
 * Tests for ToolRegistry.attachToServer() — 1-line MCP SDK integration.
 *
 * Validates:
 *   - Server duck-type detection (Server vs McpServer)
 *   - tools/list handler (all tools, filtered by tags)
 *   - tools/call handler (routing, unknown tools, empty args)
 *   - Context factory (per-request context creation)
 *   - Detach function (cleanup)
 *   - Error handling (invalid server, handler errors)
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GroupedToolBuilder } from '../../src/framework/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success } from '../../src/framework/response.js';

// ============================================================================
// Test Helpers — Mock MCP Server
// ============================================================================

/**
 * Minimal mock that mirrors the MCP SDK Server's handler registration.
 * Tracks registered handlers by schema method for verification.
 */
function createMockServer() {
    const handlers = new Map<string, Function>();

    return {
        /** Mock setRequestHandler — stores handler by schema method */
        setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
            handlers.set(schema.shape.method.value, handler);
        },
        /** Simulate a tools/list request */
        async callListTools() {
            const handler = handlers.get('tools/list');
            if (!handler) throw new Error('No tools/list handler registered');
            return handler({ method: 'tools/list', params: {} }, {});
        },
        /** Simulate a tools/call request */
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const handler = handlers.get('tools/call');
            if (!handler) throw new Error('No tools/call handler registered');
            return handler({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
        /** Check if a handler is registered */
        hasHandler(method: string) {
            return handlers.has(method);
        },
        /** Get raw handler for inspection */
        getHandler(method: string) {
            return handlers.get(method);
        },
    };
}

/** Creates a mock McpServer (wraps a Server at `.server`) */
function createMockMcpServer() {
    const lowLevel = createMockServer();
    return {
        server: lowLevel,
        // McpServer also has its own methods — but we only need the bridge
        connect: vi.fn(),
        close: vi.fn(),
    };
}

/** Creates a test registry with sample tools */
function createTestRegistry() {
    const registry = new ToolRegistry<void>();
    registry.register(
        new GroupedToolBuilder('users')
            .tags('public', 'crud')
            .action({
                name: 'list',
                schema: z.object({ page: z.number().optional() }),
                handler: async (_ctx, args) =>
                    success(`users page ${args.page ?? 1}`),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) =>
                    success(`created user: ${args.name}`),
            }),
    );
    registry.register(
        new GroupedToolBuilder('billing')
            .tags('admin', 'billing')
            .action({
                name: 'charge',
                schema: z.object({ amount: z.number().positive() }),
                handler: async (_ctx, args) =>
                    success(`charged $${args.amount}`),
            }),
    );
    return registry;
}

// ============================================================================
// Tests
// ============================================================================

describe('MCP Server Adapter: Server Detection', () => {
    it('should detect low-level Server by setRequestHandler', () => {
        const registry = createTestRegistry();
        const server = createMockServer();

        expect(() => registry.attachToServer(server)).not.toThrow();
        expect(server.hasHandler('tools/list')).toBe(true);
        expect(server.hasHandler('tools/call')).toBe(true);
    });

    it('should detect McpServer by .server property', () => {
        const registry = createTestRegistry();
        const mcpServer = createMockMcpServer();

        expect(() => registry.attachToServer(mcpServer)).not.toThrow();
        expect(mcpServer.server.hasHandler('tools/list')).toBe(true);
        expect(mcpServer.server.hasHandler('tools/call')).toBe(true);
    });

    it('should throw for null/undefined server', () => {
        const registry = createTestRegistry();

        expect(() => registry.attachToServer(null)).toThrow('requires a Server or McpServer');
        expect(() => registry.attachToServer(undefined)).toThrow('requires a Server or McpServer');
    });

    it('should throw for plain object without setRequestHandler', () => {
        const registry = createTestRegistry();

        expect(() => registry.attachToServer({})).toThrow('does not have setRequestHandler');
        expect(() => registry.attachToServer({ server: {} })).toThrow('does not have setRequestHandler');
    });

    it('should throw for primitive values', () => {
        const registry = createTestRegistry();

        expect(() => registry.attachToServer(42)).toThrow('requires a Server');
        expect(() => registry.attachToServer('server')).toThrow('requires a Server');
    });
});

describe('MCP Server Adapter: tools/list', () => {
    it('should return all tools when no filter specified', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const result = await server.callListTools();

        expect(result.tools).toHaveLength(2);
        const names = result.tools.map((t: any) => t.name);
        expect(names).toContain('users');
        expect(names).toContain('billing');
    });

    it('should return filtered tools when tags specified', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server, { filter: { tags: ['public'] } });

        const result = await server.callListTools();

        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('users');
    });

    it('should exclude tools with exclude filter', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server, { filter: { exclude: ['admin'] } });

        const result = await server.callListTools();

        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('users');
    });

    it('should return empty array when no tools match filter', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server, { filter: { tags: ['nonexistent'] } });

        const result = await server.callListTools();

        expect(result.tools).toHaveLength(0);
    });

    it('should include full tool definitions with inputSchema and description', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const result = await server.callListTools();
        const usersTool = result.tools.find((t: any) => t.name === 'users');

        expect(usersTool).toBeDefined();
        expect(usersTool.description).toBeDefined();
        expect(usersTool.inputSchema).toBeDefined();
        expect(usersTool.inputSchema.type).toBe('object');
        expect(usersTool.inputSchema.properties).toHaveProperty('action');
    });
});

describe('MCP Server Adapter: tools/call', () => {
    it('should route call to correct tool and action', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const result = await server.callTool('users', { action: 'list', page: 3 });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('users page 3');
    });

    it('should handle multiple tools independently', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const r1 = await server.callTool('users', { action: 'create', name: 'Alice' });
        const r2 = await server.callTool('billing', { action: 'charge', amount: 42 });

        expect(r1.content[0].text).toBe('created user: Alice');
        expect(r2.content[0].text).toBe('charged $42');
    });

    it('should return error for unknown tool', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const result = await server.callTool('hacking_tool', { action: 'exploit' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown tool');
        expect(result.content[0].text).toContain('users');
        expect(result.content[0].text).toContain('billing');
    });

    it('should handle missing arguments gracefully', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        // No action field
        const result = await server.callTool('users', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('is missing');
    });

    it('should handle undefined arguments (defaults to empty object)', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const result = await server.callTool('users');

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('is missing');
    });

    it('should validate arguments through Zod', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const result = await server.callTool('billing', {
            action: 'charge',
            amount: -10,  // negative — should fail positive() check
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('VALIDATION FAILED');
    });
});

describe('MCP Server Adapter: Context Factory', () => {
    it('should pass factory-created context to handlers', async () => {
        interface AppCtx { tenantId: string; requestId: string }
        const registry = new ToolRegistry<AppCtx>();
        registry.register(
            new GroupedToolBuilder<AppCtx>('whoami')
                .action({
                    name: 'identify',
                    handler: async (ctx) =>
                        success(`tenant:${ctx.tenantId}, req:${ctx.requestId}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            contextFactory: (extra: any) => ({
                tenantId: extra?.tenantId ?? 'default',
                requestId: extra?.requestId ?? 'unknown',
            }),
        });

        const result = await server.callTool(
            'whoami',
            { action: 'identify' },
            { tenantId: 'acme', requestId: 'req-123' }, // extra
        );

        expect(result.content[0].text).toBe('tenant:acme, req:req-123');
    });

    it('should create fresh context for each call', async () => {
        let callCount = 0;
        const registry = new ToolRegistry<{ callNum: number }>();
        registry.register(
            new GroupedToolBuilder<{ callNum: number }>('counter')
                .action({
                    name: 'get',
                    handler: async (ctx) => success(`call:${ctx.callNum}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            contextFactory: () => ({ callNum: ++callCount }),
        });

        const r1 = await server.callTool('counter', { action: 'get' });
        const r2 = await server.callTool('counter', { action: 'get' });

        expect(r1.content[0].text).toBe('call:1');
        expect(r2.content[0].text).toBe('call:2');
    });

    it('should use undefined context when no factory provided', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('simple')
                .action({
                    name: 'ping',
                    handler: async () => success('pong'),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server); // No contextFactory

        const result = await server.callTool('simple', { action: 'ping' });
        expect(result.content[0].text).toBe('pong');
    });
});

describe('MCP Server Adapter: Detach Function', () => {
    it('should return a detach function', () => {
        const registry = createTestRegistry();
        const server = createMockServer();

        const detach = registry.attachToServer(server);

        expect(typeof detach).toBe('function');
    });

    it('should reset handlers after detach', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();

        const detach = registry.attachToServer(server);

        // Before detach — working
        const r1 = await server.callListTools();
        expect(r1.tools).toHaveLength(2);

        // Detach
        detach();

        // After detach — empty tools
        const r2 = await server.callListTools();
        expect(r2.tools).toHaveLength(0);

        // After detach — call returns error
        const r3 = await server.callTool('users', { action: 'list' });
        expect(r3.isError).toBe(true);
        expect(r3.content[0].text).toContain('detached');
    });

    it('should allow re-attaching after detach', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();

        const detach1 = registry.attachToServer(server);
        detach1();

        // Re-attach
        registry.attachToServer(server);

        const result = await server.callListTools();
        expect(result.tools).toHaveLength(2);
    });
});

describe('MCP Server Adapter: McpServer Integration', () => {
    it('should wire handlers through McpServer.server', async () => {
        const registry = createTestRegistry();
        const mcpServer = createMockMcpServer();

        registry.attachToServer(mcpServer);

        // Call through the inner server
        const result = await mcpServer.server.callListTools();
        expect(result.tools).toHaveLength(2);

        const callResult = await mcpServer.server.callTool('users', {
            action: 'create',
            name: 'Bob',
        });
        expect(callResult.content[0].text).toBe('created user: Bob');
    });
});

describe('MCP Server Adapter: Edge Cases', () => {
    it('should handle empty registry', async () => {
        const registry = new ToolRegistry<void>();
        const server = createMockServer();

        registry.attachToServer(server);

        const result = await server.callListTools();
        expect(result.tools).toHaveLength(0);

        const callResult = await server.callTool('anything', {});
        expect(callResult.isError).toBe(true);
    });

    it('should reflect tools added after attach', async () => {
        const registry = new ToolRegistry<void>();
        const server = createMockServer();

        registry.attachToServer(server);

        // Initially empty
        let result = await server.callListTools();
        expect(result.tools).toHaveLength(0);

        // Register a tool after attach
        registry.register(
            new GroupedToolBuilder<void>('late')
                .action({ name: 'ping', handler: async () => success('late pong') }),
        );

        // Now it should appear
        result = await server.callListTools();
        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('late');
    });

    it('should handle concurrent calls correctly', async () => {
        const registry = createTestRegistry();
        const server = createMockServer();
        registry.attachToServer(server);

        const promises = Array.from({ length: 20 }, (_, i) =>
            server.callTool('users', { action: 'create', name: `user-${i}` })
        );

        const results = await Promise.all(promises);

        for (let i = 0; i < 20; i++) {
            expect(results[i].content[0].text).toBe(`created user: user-${i}`);
        }
    });

    it('should handle attach to the same server twice (last wins)', async () => {
        const registry1 = new ToolRegistry<void>();
        registry1.register(
            new GroupedToolBuilder<void>('first')
                .action({ name: 'ping', handler: async () => success('first') }),
        );

        const registry2 = new ToolRegistry<void>();
        registry2.register(
            new GroupedToolBuilder<void>('second')
                .action({ name: 'ping', handler: async () => success('second') }),
        );

        const server = createMockServer();
        registry1.attachToServer(server);
        registry2.attachToServer(server); // Overwrites

        const result = await server.callListTools();
        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('second');
    });
});
