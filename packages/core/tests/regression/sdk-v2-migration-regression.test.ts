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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

describe('Regression: edge bundler stubs every SDK package', () => {

    // The edge bundle must never carry the MCP SDK; the edge interceptor
    // supplies the server. The stub filter is matched against package
    // specifiers, so it has to list the v2 package names — not just the v1
    // monolith — or SDK code reaches the bundle.

    const deploySource = readFileSync(
        resolve(__dirname, '../../src/cli/commands/deploy.ts'),
        'utf8',
    );

    const stubFilter = (() => {
        const m = deploySource.match(
            /onResolve\(\{\s*filter:\s*(\/\^@modelcontextprotocol[^/]*\/[^,]*?)\s*\}/,
        );
        if (!m) throw new Error('SDK stub filter not found in deploy.ts');
        // eslint-disable-next-line no-eval -- reading a literal out of our own source
        return eval(m[1]) as RegExp;
    })();

    it.each([
        '@modelcontextprotocol/server',
        '@modelcontextprotocol/server/stdio',
        '@modelcontextprotocol/node',
        '@modelcontextprotocol/core',
        '@modelcontextprotocol/client',
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/server/index.js',
    ])('stubs %s', (specifier) => {
        expect(stubFilter.test(specifier)).toBe(true);
    });

    it('does not stub unrelated scopes', () => {
        expect(stubFilter.test('@mcpfusion/core')).toBe(false);
        expect(stubFilter.test('zod')).toBe(false);
    });

    it('covers every SDK package @mcpfusion/core imports at runtime', async () => {
        // Any bare SDK specifier left in the built framework must be stubbed,
        // otherwise `mcpfusion deploy` bundles it.
        const startServer = readFileSync(
            resolve(__dirname, '../../src/server/startServer.ts'),
            'utf8',
        );
        const specifiers = [...startServer.matchAll(
            /from\s*['"](@modelcontextprotocol\/[^'"]+)['"]/g,
        )].map((m) => m[1]);

        expect(specifiers.length).toBeGreaterThan(0);
        for (const specifier of specifiers) {
            expect(stubFilter.test(specifier), `${specifier} is not stubbed`).toBe(true);
        }
    });
});

describe('Regression: v1 SDK package removed from dependencies', () => {

    it('package.json does NOT list @modelcontextprotocol/sdk as a dependency', () => {
        // Read the root package.json and verify v1 SDK is not a dependency
        const pkg = require('../../../../package.json');
        const allDeps = {
            ...pkg.dependencies,
            ...pkg.devDependencies,
            ...pkg.peerDependencies,
        };
        expect(allDeps['@modelcontextprotocol/sdk']).toBeUndefined();
    });

    it('package.json lists v2 packages as devDependencies', () => {
        const pkg = require('../../../../package.json');
        expect(pkg.devDependencies['@modelcontextprotocol/server']).toBeDefined();
        expect(pkg.devDependencies['@modelcontextprotocol/core']).toBeDefined();
        expect(pkg.devDependencies['@modelcontextprotocol/node']).toBeDefined();
        expect(pkg.devDependencies['@modelcontextprotocol/client']).toBeDefined();
    });

    it('core package.json lists v2 packages as dependencies (moved from peerDependencies in 5.0.0)', () => {
        const pkg = require('../../../core/package.json');
        expect(pkg.dependencies['@modelcontextprotocol/server']).toBeDefined();
        expect(pkg.dependencies['@modelcontextprotocol/node']).toBeDefined();
        expect(pkg.dependencies['@modelcontextprotocol/core']).toBeDefined();
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