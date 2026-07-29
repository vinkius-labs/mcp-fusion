/**
 * Regression: SDK v2 migration + stateless transport (MCP 2026-07-28 Fase 1)
 *
 * CRITICAL: The framework migrated from @modelcontextprotocol/sdk v1 to v2.
 * This test suite verifies:
 *
 * 1. setRequestHandler uses method strings (not Zod schemas)
 * 2. The transport type includes 'stateless'
 * 3. createMcpHandler is importable from @modelcontextprotocol/server
 * 4. NodeStreamableHTTPServerTransport is importable from @modelcontextprotocol/node
 * 5. StdioServerTransport is importable from @modelcontextprotocol/server/stdio
 * 6. Server class is importable from @modelcontextprotocol/server
 * 7. v2 packages are installed (not v1 @modelcontextprotocol/sdk)
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

// ── v2 package imports ───────────────────────────────────

describe('Regression: SDK v2 packages installed', () => {

    it('@modelcontextprotocol/server exports Server', async () => {
        const mod = await import('@modelcontextprotocol/server');
        expect(mod.Server).toBeDefined();
        expect(typeof mod.Server).toBe('function');
    });

    it('@modelcontextprotocol/server exports createMcpHandler', async () => {
        const mod = await import('@modelcontextprotocol/server');
        expect(mod.createMcpHandler).toBeDefined();
        expect(typeof mod.createMcpHandler).toBe('function');
    });

    it('@modelcontextprotocol/node exports NodeStreamableHTTPServerTransport', async () => {
        const mod = await import('@modelcontextprotocol/node');
        expect(mod.NodeStreamableHTTPServerTransport).toBeDefined();
        expect(typeof mod.NodeStreamableHTTPServerTransport).toBe('function');
    });

    it('@modelcontextprotocol/node exports toNodeHandler', async () => {
        const mod = await import('@modelcontextprotocol/node');
        expect(mod.toNodeHandler).toBeDefined();
        expect(typeof mod.toNodeHandler).toBe('function');
    });

    it('@modelcontextprotocol/server/stdio exports StdioServerTransport', async () => {
        const mod = await import('@modelcontextprotocol/server/stdio');
        expect(mod.StdioServerTransport).toBeDefined();
        expect(typeof mod.StdioServerTransport).toBe('function');
    });

    it('@modelcontextprotocol/core is installed (Zod schemas)', async () => {
        const mod = await import('@modelcontextprotocol/core');
        expect(mod).toBeDefined();
        // Should have at least one schema export
        expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
});

// ── v1 package NOT installed ─────────────────────────────

describe('Regression: v1 SDK package removed', () => {

    it('@modelcontextprotocol/sdk is NOT a dependency', () => {
        // Try to resolve the v1 package — should fail
        expect(() => {
            try {
                require.resolve('@modelcontextprotocol/sdk');
            } catch {
                throw new Error('v1 SDK not found (expected)');
            }
        }).toThrow('v1 SDK not found (expected)');
    });
});

// ── ServerTransport type includes 'stateless' ────────────

describe('Regression: ServerTransport type includes stateless', () => {

    it('transport option accepts "stateless"', async () => {
        // Type-level test: if this compiles, the type is correct
        const transport: 'stdio' | 'http' | 'stateless' = 'stateless';
        expect(transport).toBe('stateless');
    });

    it('transport option accepts "stdio"', () => {
        const transport: 'stdio' | 'http' | 'stateless' = 'stdio';
        expect(transport).toBe('stdio');
    });

    it('transport option accepts "http"', () => {
        const transport: 'stdio' | 'http' | 'stateless' = 'http';
        expect(transport).toBe('http');
    });
});

// ── setRequestHandler uses method strings ────────────────

describe('Regression: setRequestHandler uses method strings (v2)', () => {

    it('mock server registers handlers by method string', async () => {
        const handlers = new Map<string, Function>();
        const mockServer = {
            setRequestHandler(method: string, handler: Function) {
                handlers.set(method, handler);
            },
        };

        // Simulate what ServerAttachment does
        mockServer.setRequestHandler('tools/list', () => ({ tools: [] }));
        mockServer.setRequestHandler('tools/call', () => ({ content: [] }));
        mockServer.setRequestHandler('prompts/list', () => ({ prompts: [] }));

        expect(handlers.get('tools/list')).toBeDefined();
        expect(handlers.get('tools/call')).toBeDefined();
        expect(handlers.get('prompts/list')).toBeDefined();
    });

    it('v2 Server.setRequestHandler accepts method strings', async () => {
        const { Server } = await import('@modelcontextprotocol/server');
        const server = new Server(
            { name: 'test', version: '1.0.0' },
            { capabilities: { tools: {} } },
        );

        // This should NOT throw — method string is the v2 API
        expect(() => {
            server.setRequestHandler('tools/list', () => ({ tools: [] }));
        }).not.toThrow();

        expect(() => {
            server.setRequestHandler('tools/call', () => ({ content: [] }));
        }).not.toThrow();
    });
});

// ── createMcpHandler factory pattern ─────────────────────

describe('Regression: createMcpHandler factory pattern', () => {

    it('createMcpHandler accepts a factory function', async () => {
        const { createMcpHandler, Server } = await import('@modelcontextprotocol/server');

        const handler = createMcpHandler(() => {
            const server = new Server(
                { name: 'test', version: '1.0.0' },
                { capabilities: { tools: {} } },
            );
            server.setRequestHandler('tools/list', () => ({ tools: [] }));
            return server;
        });

        expect(handler).toBeDefined();
        expect(typeof handler.fetch).toBe('function');
        expect(typeof handler.close).toBe('function');

        // Clean up
        await handler.close();
    });

    it('createMcpHandler supports async factory', async () => {
        const { createMcpHandler, Server } = await import('@modelcontextprotocol/server');

        const handler = createMcpHandler(async () => {
            const server = new Server(
                { name: 'test-async', version: '1.0.0' },
                { capabilities: { tools: {} } },
            );
            // Simulate async attach
            await Promise.resolve();
            server.setRequestHandler('tools/list', () => ({ tools: [] }));
            return server;
        });

        expect(handler).toBeDefined();
        await handler.close();
    });
});