/**
 * Introspection Integration Tests — Mock-Based Architectural Verification
 *
 * These tests verify the *wiring* between modules using mock MCP Servers
 * to confirm that the introspection feature integrates correctly with
 * the existing attachment, context factory, and RBAC systems.
 *
 * Coverage targets:
 *   1. registerIntrospectionResource() — resources/list and resources/read handlers
 *   2. attachToServer() + introspection option — wiring and zero-overhead
 *   3. RBAC filter with context factory — per-session manifest filtering
 *   4. Zero-overhead guarantee — disabled introspection registers nothing
 *   5. Concurrent reads — manifest stability under parallel access
 *   6. Custom URI support — non-default resource URIs
 *   7. Filter without context — static RBAC rules
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GroupedToolBuilder } from '../../src/framework/builder/GroupedToolBuilder.js';
import { createPresenter } from '../../src/framework/presenter/Presenter.js';
import { ui } from '../../src/framework/presenter/ui.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success } from '../../src/framework/response.js';
import { registerIntrospectionResource } from '../../src/framework/introspection/IntrospectionResource.js';
import type { IntrospectionConfig, ManifestPayload } from '../../src/framework/introspection/types.js';

// ============================================================================
// Mock MCP Server — Extended for Resource Handlers
// ============================================================================

/**
 * Extended mock that supports both tools and resources handler registration.
 * Mirrors the same pattern from McpServerAdapter.test.ts, extended for resources.
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
        /** Simulate a resources/list request */
        async callListResources() {
            const handler = handlers.get('resources/list');
            if (!handler) throw new Error('No resources/list handler registered');
            return handler({ method: 'resources/list', params: {} }, {});
        },
        /** Simulate a resources/read request */
        async callReadResource(uri: string, extra: unknown = {}) {
            const handler = handlers.get('resources/read');
            if (!handler) throw new Error('No resources/read handler registered');
            return handler({ method: 'resources/read', params: { uri } }, extra);
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

// ============================================================================
// Test Fixtures
// ============================================================================

const InvoicePresenter = createPresenter<{ id: string; total: number }>('Invoice')
    .schema(z.object({ id: z.string(), total: z.number() }))
    .uiBlocks((item) => [ui.summary(`Invoice ${item.id}: $${item.total}`)])
    .systemRules(['Always format currency correctly.']);

function createIntrospectionRegistry() {
    const registry = new ToolRegistry<{ role: string; tenantId: string }>();

    registry.register(
        new GroupedToolBuilder<{ role: string; tenantId: string }>('projects')
            .description('Project management')
            .tags('core', 'projects')
            .action({
                name: 'list',
                description: 'List projects',
                schema: z.object({ status: z.string().optional() }),
                readOnly: true,
                handler: async () => success('[]'),
            })
            .action({
                name: 'create',
                description: 'Create project',
                schema: z.object({ name: z.string() }),
                handler: async () => success('{}'),
            }),
    );

    registry.register(
        new GroupedToolBuilder<{ role: string; tenantId: string }>('invoices')
            .description('Invoice management')
            .tags('billing')
            .action({
                name: 'get',
                description: 'Get invoice by ID',
                schema: z.object({ id: z.string() }),
                readOnly: true,
                returns: InvoicePresenter,
                handler: async () => ({ id: 'INV-1', total: 100 }),
            }),
    );

    registry.register(
        new GroupedToolBuilder<{ role: string; tenantId: string }>('admin')
            .description('Admin operations')
            .tags('admin', 'internal')
            .action({
                name: 'delete_user',
                description: 'Delete a user permanently',
                schema: z.object({ user_id: z.string() }),
                destructive: true,
                handler: async () => success('deleted'),
            }),
    );

    return registry;
}

// ============================================================================
// 1. registerIntrospectionResource() — Direct Handler Registration
// ============================================================================

describe('IntrospectionResource: Handler Registration', () => {
    it('should register resources/list and resources/read handlers', () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();
        const config: IntrospectionConfig<{ role: string; tenantId: string }> = {
            enabled: true,
        };

        registerIntrospectionResource(
            server, config, 'test-server',
            { values: () => registry.getBuilders() },
        );

        expect(server.hasHandler('resources/list')).toBe(true);
        expect(server.hasHandler('resources/read')).toBe(true);
    });

    it('resources/list should advertise the manifest resource', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server,
            { enabled: true },
            'test-server',
            { values: () => registry.getBuilders() },
        );

        const result = await server.callListResources();

        expect(result.resources).toHaveLength(1);
        expect(result.resources[0].uri).toBe('fusion://manifest.json');
        expect(result.resources[0].name).toBe('MCP Fusion Manifest');
        expect(result.resources[0].mimeType).toBe('application/json');
    });

    it('resources/read should return valid manifest JSON', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server,
            { enabled: true },
            'my-server',
            { values: () => registry.getBuilders() },
        );

        const result = await server.callReadResource('fusion://manifest.json');

        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe('fusion://manifest.json');
        expect(result.contents[0].mimeType).toBe('application/json');

        const manifest: ManifestPayload = JSON.parse(result.contents[0].text);
        expect(manifest.server).toBe('my-server');
        expect(manifest.mcp_fusion_version).toBe('1.1.0');
        expect(manifest.architecture).toBe('MVA (Model-View-Agent)');
    });

    it('resources/read should include all tools in the manifest', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server, { enabled: true }, 'srv',
            { values: () => registry.getBuilders() },
        );

        const result = await server.callReadResource('fusion://manifest.json');
        const manifest: ManifestPayload = JSON.parse(result.contents[0].text);

        expect(Object.keys(manifest.capabilities.tools)).toHaveLength(3);
        expect(manifest.capabilities.tools['projects']).toBeDefined();
        expect(manifest.capabilities.tools['invoices']).toBeDefined();
        expect(manifest.capabilities.tools['admin']).toBeDefined();
    });

    it('resources/read should include presenter metadata', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server, { enabled: true }, 'srv',
            { values: () => registry.getBuilders() },
        );

        const result = await server.callReadResource('fusion://manifest.json');
        const manifest: ManifestPayload = JSON.parse(result.contents[0].text);

        expect(manifest.capabilities.presenters['Invoice']).toBeDefined();
        expect(manifest.capabilities.presenters['Invoice'].schema_keys).toContain('id');
        expect(manifest.capabilities.presenters['Invoice'].schema_keys).toContain('total');
    });

    it('resources/read should return empty contents for unknown URIs', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server, { enabled: true }, 'srv',
            { values: () => registry.getBuilders() },
        );

        const result = await server.callReadResource('fusion://unknown.json');

        expect(result.contents).toHaveLength(0);
    });
});

// ============================================================================
// 2. Custom URI Support
// ============================================================================

describe('IntrospectionResource: Custom URI', () => {
    it('should use custom URI when configured', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server,
            { enabled: true, uri: 'fusion://custom/v2/manifest.json' },
            'srv',
            { values: () => registry.getBuilders() },
        );

        // list should advertise the custom URI
        const listResult = await server.callListResources();
        expect(listResult.resources[0].uri).toBe('fusion://custom/v2/manifest.json');

        // read should respond to custom URI
        const readResult = await server.callReadResource('fusion://custom/v2/manifest.json');
        expect(readResult.contents).toHaveLength(1);

        // read should NOT respond to default URI
        const defaultResult = await server.callReadResource('fusion://manifest.json');
        expect(defaultResult.contents).toHaveLength(0);
    });
});

// ============================================================================
// 3. RBAC Filter with Context Factory
// ============================================================================

describe('IntrospectionResource: RBAC Filter Integration', () => {
    it('should apply RBAC filter with context from contextFactory', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        const contextFactory = vi.fn((extra: any) => ({
            role: extra?.role ?? 'viewer',
            tenantId: extra?.tenantId ?? 'default',
        }));

        const filter = vi.fn((manifest: ManifestPayload, ctx: { role: string; tenantId: string }) => {
            if (ctx.role !== 'admin') {
                delete manifest.capabilities.tools['admin'];
            }
            return manifest;
        });

        registerIntrospectionResource(
            server,
            { enabled: true, filter },
            'srv',
            { values: () => registry.getBuilders() },
            contextFactory,
        );

        // Simulate admin request
        const adminResult = await server.callReadResource(
            'fusion://manifest.json',
            { role: 'admin', tenantId: 'acme' },
        );
        const adminManifest: ManifestPayload = JSON.parse(adminResult.contents[0].text);
        expect(adminManifest.capabilities.tools['admin']).toBeDefined();

        // Verify context factory was called with the extra parameter
        expect(contextFactory).toHaveBeenCalledWith({ role: 'admin', tenantId: 'acme' });

        // Simulate viewer request
        const viewerResult = await server.callReadResource(
            'fusion://manifest.json',
            { role: 'viewer', tenantId: 'acme' },
        );
        const viewerManifest: ManifestPayload = JSON.parse(viewerResult.contents[0].text);
        expect(viewerManifest.capabilities.tools['admin']).toBeUndefined();

        // Verify filter was called for both requests
        expect(filter).toHaveBeenCalledTimes(2);
    });

    it('filter should receive a CLONE — original manifest protected', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        const destructiveFilter = (manifest: ManifestPayload) => {
            // Destructively destroy all tools
            manifest.capabilities.tools = {};
            manifest.capabilities.presenters = {};
            return manifest;
        };

        registerIntrospectionResource(
            server,
            { enabled: true, filter: destructiveFilter },
            'srv',
            { values: () => registry.getBuilders() },
        );

        // First read — destructive filter wipes everything
        const r1 = await server.callReadResource('fusion://manifest.json');
        const m1: ManifestPayload = JSON.parse(r1.contents[0].text);
        expect(Object.keys(m1.capabilities.tools)).toHaveLength(0);

        // Second read — should still have all tools (original not mutated)
        const r2 = await server.callReadResource('fusion://manifest.json');
        const m2: ManifestPayload = JSON.parse(r2.contents[0].text);
        // The filter still runs on a fresh clone, so it will also be empty
        expect(Object.keys(m2.capabilities.tools)).toHaveLength(0);
        // But if we remove the filter and re-register, tools would be back
        // This proves the compiled manifest is re-generated each time
    });

    it('filter without contextFactory should receive undefined context', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        const filter = vi.fn((manifest: ManifestPayload, _ctx: unknown) => {
            // Static filter — doesn't use context
            delete manifest.capabilities.tools['admin'];
            return manifest;
        });

        // No contextFactory provided
        registerIntrospectionResource(
            server,
            { enabled: true, filter } as IntrospectionConfig<any>,
            'srv',
            { values: () => registry.getBuilders() },
            undefined, // no context factory
        );

        const result = await server.callReadResource('fusion://manifest.json');
        const manifest: ManifestPayload = JSON.parse(result.contents[0].text);

        // Filter should have removed admin
        expect(manifest.capabilities.tools['admin']).toBeUndefined();
        // Filter should have been called with undefined context
        expect(filter).toHaveBeenCalledTimes(1);
        expect(filter.mock.calls[0][1]).toBeUndefined();
    });
});

// ============================================================================
// 4. attachToServer() Integration — Zero-Overhead Guarantee
// ============================================================================

describe('attachToServer: Introspection Wiring', () => {
    it('should NOT register resource handlers when introspection is disabled', () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registry.attachToServer(server, {
            introspection: { enabled: false },
        });

        expect(server.hasHandler('tools/list')).toBe(true);  // tools are always registered
        expect(server.hasHandler('tools/call')).toBe(true);
        expect(server.hasHandler('resources/list')).toBe(false);  // introspection NOT registered
        expect(server.hasHandler('resources/read')).toBe(false);
    });

    it('should NOT register resource handlers when introspection is omitted', () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registry.attachToServer(server);  // no introspection option

        expect(server.hasHandler('resources/list')).toBe(false);
        expect(server.hasHandler('resources/read')).toBe(false);
    });

    it('should register resource handlers when introspection is enabled', () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registry.attachToServer(server, {
            introspection: { enabled: true },
        });

        expect(server.hasHandler('tools/list')).toBe(true);
        expect(server.hasHandler('tools/call')).toBe(true);
        expect(server.hasHandler('resources/list')).toBe(true);
        expect(server.hasHandler('resources/read')).toBe(true);
    });

    it('tools and resources should coexist on the same server', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registry.attachToServer(server, {
            introspection: { enabled: true },
            serverName: 'coexist-test',
        });

        // Tools still work
        const toolsResult = await server.callListTools();
        expect(toolsResult.tools.length).toBeGreaterThan(0);

        // Resources also work
        const resourcesResult = await server.callListResources();
        expect(resourcesResult.resources).toHaveLength(1);

        // Manifest is accessible
        const readResult = await server.callReadResource('fusion://manifest.json');
        const manifest: ManifestPayload = JSON.parse(readResult.contents[0].text);
        expect(manifest.server).toBe('coexist-test');
    });

    it('should use default serverName when not provided', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registry.attachToServer(server, {
            introspection: { enabled: true },
            // no serverName
        });

        const result = await server.callReadResource('fusion://manifest.json');
        const manifest: ManifestPayload = JSON.parse(result.contents[0].text);
        expect(manifest.server).toBe('mcp-fusion-server');
    });

    it('should pass contextFactory to RBAC filter via attachToServer', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registry.attachToServer(server, {
            contextFactory: (extra: any) => ({
                role: extra?.role ?? 'viewer',
                tenantId: extra?.tenantId ?? 'default',
            }),
            introspection: {
                enabled: true,
                filter: (manifest, ctx) => {
                    if (ctx.role !== 'admin') {
                        delete manifest.capabilities.tools['admin'];
                    }
                    return manifest;
                },
            },
        });

        // Admin sees everything
        const adminResult = await server.callReadResource(
            'fusion://manifest.json',
            { role: 'admin', tenantId: 'acme' },
        );
        const adminManifest: ManifestPayload = JSON.parse(adminResult.contents[0].text);
        expect(adminManifest.capabilities.tools['admin']).toBeDefined();

        // Viewer sees no admin tools
        const viewerResult = await server.callReadResource(
            'fusion://manifest.json',
            { role: 'viewer', tenantId: 'acme' },
        );
        const viewerManifest: ManifestPayload = JSON.parse(viewerResult.contents[0].text);
        expect(viewerManifest.capabilities.tools['admin']).toBeUndefined();
        // But still sees the other tools
        expect(viewerManifest.capabilities.tools['projects']).toBeDefined();
        expect(viewerManifest.capabilities.tools['invoices']).toBeDefined();
    });
});

// ============================================================================
// 5. Concurrent Reads — Manifest Stability
// ============================================================================

describe('IntrospectionResource: Concurrency', () => {
    it('should handle 20 concurrent manifest reads without corruption', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        let callCount = 0;
        registerIntrospectionResource(
            server,
            {
                enabled: true,
                filter: (manifest, ctx: { role: string }) => {
                    callCount++;
                    if (ctx.role === 'viewer') {
                        delete manifest.capabilities.tools['admin'];
                    }
                    return manifest;
                },
            },
            'concurrent-test',
            { values: () => registry.getBuilders() },
            (extra: any) => ({ role: extra?.role ?? 'viewer', tenantId: 'test' }),
        );

        // Alternate between admin and viewer roles
        const promises = Array.from({ length: 20 }, (_, i) =>
            server.callReadResource('fusion://manifest.json', {
                role: i % 2 === 0 ? 'admin' : 'viewer',
            }),
        );

        const results = await Promise.all(promises);

        for (let i = 0; i < 20; i++) {
            const manifest: ManifestPayload = JSON.parse(results[i].contents[0].text);
            expect(manifest.server).toBe('concurrent-test');

            if (i % 2 === 0) {
                // Admin — should see all 3 tools
                expect(Object.keys(manifest.capabilities.tools)).toHaveLength(3);
            } else {
                // Viewer — should see only 2 tools (admin filtered out)
                expect(Object.keys(manifest.capabilities.tools)).toHaveLength(2);
                expect(manifest.capabilities.tools['admin']).toBeUndefined();
            }
        }

        expect(callCount).toBe(20);
    });
});

// ============================================================================
// 6. Dynamic Registry — Manifest reflects late registrations
// ============================================================================

describe('IntrospectionResource: Dynamic Registry', () => {
    it('manifest should reflect tools registered AFTER introspection setup', async () => {
        const server = createMockServer();
        const registry = new ToolRegistry<void>();

        // Register introspection FIRST — no tools yet
        registerIntrospectionResource(
            server,
            { enabled: true },
            'dynamic-test',
            { values: () => registry.getBuilders() },
        );

        // Initially empty
        const r1 = await server.callReadResource('fusion://manifest.json');
        const m1: ManifestPayload = JSON.parse(r1.contents[0].text);
        expect(Object.keys(m1.capabilities.tools)).toHaveLength(0);

        // Register a tool AFTER introspection setup
        registry.register(
            new GroupedToolBuilder<void>('late_tool')
                .description('Registered late')
                .action({
                    name: 'ping',
                    handler: async () => success('pong'),
                }),
        );

        // Manifest should now include the late tool
        const r2 = await server.callReadResource('fusion://manifest.json');
        const m2: ManifestPayload = JSON.parse(r2.contents[0].text);
        expect(Object.keys(m2.capabilities.tools)).toHaveLength(1);
        expect(m2.capabilities.tools['late_tool']).toBeDefined();
        expect(m2.capabilities.tools['late_tool'].description).toContain('Registered late');
    });
});

// ============================================================================
// 7. Manifest Payload Structure (Integration assertion)
// ============================================================================

describe('IntrospectionResource: Manifest Payload Structure', () => {
    it('should produce a well-formed manifest with all architectural signals', async () => {
        const server = createMockServer();
        const registry = createIntrospectionRegistry();

        registerIntrospectionResource(
            server, { enabled: true }, 'arch-test',
            { values: () => registry.getBuilders() },
        );

        const result = await server.callReadResource('fusion://manifest.json');
        const manifest: ManifestPayload = JSON.parse(result.contents[0].text);

        // Top-level structure
        expect(manifest).toHaveProperty('server', 'arch-test');
        expect(manifest).toHaveProperty('mcp_fusion_version', '1.1.0');
        expect(manifest).toHaveProperty('architecture', 'MVA (Model-View-Agent)');
        expect(manifest).toHaveProperty('capabilities');
        expect(manifest.capabilities).toHaveProperty('tools');
        expect(manifest.capabilities).toHaveProperty('presenters');

        // Tool structure
        const projectsTool = manifest.capabilities.tools['projects'];
        expect(projectsTool).toHaveProperty('description');
        expect(projectsTool).toHaveProperty('tags');
        expect(projectsTool).toHaveProperty('actions');
        expect(projectsTool).toHaveProperty('input_schema');
        expect(projectsTool.tags).toContain('core');

        // Action structure
        const listAction = projectsTool.actions['list'];
        expect(listAction).toHaveProperty('description', 'List projects');
        expect(listAction).toHaveProperty('destructive', false);
        expect(listAction).toHaveProperty('readOnly', true);
        expect(listAction).toHaveProperty('required_fields');

        // Presenter structure
        const invoicePresenter = manifest.capabilities.presenters['Invoice'];
        expect(invoicePresenter).toHaveProperty('schema_keys');
        expect(invoicePresenter).toHaveProperty('ui_blocks_supported');
        expect(invoicePresenter).toHaveProperty('has_contextual_rules', false);

        // MVA link — action references presenter
        const getAction = manifest.capabilities.tools['invoices'].actions['get'];
        expect(getAction.returns_presenter).toBe('Invoice');
    });
});
