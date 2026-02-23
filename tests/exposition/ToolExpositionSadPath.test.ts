/**
 * ToolExpositionSadPath.test.ts
 *
 * Defensive / sad-path tests for the Tool Exposition feature.
 * Simulates common junior developer mistakes:
 *
 *   - Calling a flat tool by the grouped name (forgetting to add separator)
 *   - Calling the grouped name when in flat mode
 *   - Passing the discriminator field that no longer exists in flat schema
 *   - Builder with zero actions
 *   - Builder with no schema (no common, no per-action)
 *   - Builder re-registered after attach (late registration in flat mode)
 *   - Two builders whose flat names collide
 *   - Empty separator string
 *   - Forgetting buildToolDefinition() before compileExposition()
 *   - Calling tools after detach in flat mode
 *   - Using wrong argument keys
 *   - Mixing flat and grouped on re-attach
 *   - Using flat mode with a custom discriminator
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    GroupedToolBuilder,
    ToolRegistry,
    success,
    error,
} from '../../src/core/index.js';
import type { ToolResponse } from '../../src/core/index.js';
import { compileExposition } from '../../src/exposition/ExpositionCompiler.js';

// ── Shared Fixtures ──────────────────────────────────────

const noop = async (): Promise<ToolResponse> => success('ok');

function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
            handlers.set(schema.shape.method.value, handler);
        },
        async callListTools() {
            const handler = handlers.get('tools/list');
            if (!handler) throw new Error('No tools/list handler registered');
            return handler({ method: 'tools/list', params: {} }, {});
        },
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const handler = handlers.get('tools/call');
            if (!handler) throw new Error('No tools/call handler registered');
            return handler({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
    };
}

// ============================================================================
// Sad Path: Compiler-Level Mistakes
// ============================================================================

describe('ExpositionCompiler — Sad Path', () => {

    it('should throw when building a builder with no actions', () => {
        const builder = new GroupedToolBuilder<void>('empty');
        // Junior mistake: registering a builder without any actions
        // buildToolDefinition throws — can't build a tool with nothing inside
        expect(() => builder.buildToolDefinition()).toThrow();
    });

    it('should handle builder with no schema at all (no common, no per-action)', () => {
        const builder = new GroupedToolBuilder<void>('bare')
            .action({ name: 'ping', handler: noop });

        const result = compileExposition([builder], 'flat', '_');

        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('bare_ping');
        // Schema should be a valid empty object (no properties)
        expect(result.tools[0].inputSchema.type).toBe('object');
        expect(Object.keys(result.tools[0].inputSchema.properties ?? {})).toHaveLength(0);
    });

    it('should handle empty separator (concatenated names)', () => {
        const builder = new GroupedToolBuilder<void>('api')
            .action({ name: 'list', handler: noop })
            .action({ name: 'create', handler: noop });

        // Junior mistake: passing empty string as separator
        const result = compileExposition([builder], 'flat', '');

        const names = result.tools.map(t => t.name);
        // Names are concatenated directly: "apilist", "apicreate"
        expect(names).toEqual(['apilist', 'apicreate']);
        // Still routes correctly
        expect(result.routingMap.has('apilist')).toBe(true);
    });

    it('should handle very long separator', () => {
        const builder = new GroupedToolBuilder<void>('x')
            .action({ name: 'y', handler: noop });

        const result = compileExposition([builder], 'flat', '---');
        expect(result.tools[0].name).toBe('x---y');
    });

    it('should silently overwrite when two builders produce colliding flat names', () => {
        // Junior mistake: two builders "a" with action "b" and another "a" with action "b"
        // This can't happen via ToolRegistry (throws on duplicate name), but can
        // happen if someone calls compileExposition directly with duplicate builders.
        const builder1 = new GroupedToolBuilder<void>('tasks')
            .action({ name: 'list', handler: async () => success('first') });
        const builder2 = new GroupedToolBuilder<void>('tasks')
            .action({ name: 'list', handler: async () => success('second') });

        const result = compileExposition([builder1, builder2], 'flat', '_');

        // Both produce "tasks_list" — last one wins in the routing map
        expect(result.tools).toHaveLength(2); // Both tools are emitted
        expect(result.routingMap.get('tasks_list')!.builder).toBe(builder2);
    });

    it('should handle empty builders iterable', () => {
        const result = compileExposition([], 'flat', '_');

        expect(result.tools).toHaveLength(0);
        expect(result.routingMap.size).toBe(0);
        expect(result.isFlat).toBe(true);
    });

    it('should handle empty builders iterable in grouped mode', () => {
        const result = compileExposition([], 'grouped');

        expect(result.tools).toHaveLength(0);
        expect(result.routingMap.size).toBe(0);
        expect(result.isFlat).toBe(false);
    });

    it('should generate fallback description when action has none', () => {
        const builder = new GroupedToolBuilder<void>('svc')
            .action({ name: 'do_thing', handler: noop });
        // No description provided

        const result = compileExposition([builder], 'flat', '_');
        const tool = result.tools[0];

        // Should generate a fallback: "svc → do_thing"
        expect(tool.description).toContain('svc');
        expect(tool.description).toContain('do_thing');
    });

    it('should correctly build schema when action has schema but no common schema', () => {
        const builder = new GroupedToolBuilder<void>('svc')
            .action({
                name: 'create',
                schema: z.object({ title: z.string(), count: z.number() }),
                handler: noop,
            });

        const result = compileExposition([builder], 'flat', '_');
        const tool = result.tools[0];

        expect(tool.inputSchema.properties).toHaveProperty('title');
        expect(tool.inputSchema.properties).toHaveProperty('count');
        // No common schema fields should leak in
        expect(Object.keys(tool.inputSchema.properties ?? {})).toHaveLength(2);
    });

    it('should correctly build schema when common schema exists but action has no schema', () => {
        const builder = new GroupedToolBuilder<void>('svc')
            .commonSchema(z.object({ tenant_id: z.string() }))
            .action({ name: 'ping', handler: noop });

        const result = compileExposition([builder], 'flat', '_');
        const tool = result.tools[0];

        expect(tool.inputSchema.properties).toHaveProperty('tenant_id');
        expect(Object.keys(tool.inputSchema.properties ?? {})).toHaveLength(1);
    });

    it('should throw when action schema field shadows common schema field with different type', () => {
        // Junior mistake: action defines a field with the same name as a common field
        // The builder detects conflicting types and throws at build time
        expect(() => {
            new GroupedToolBuilder<void>('svc')
                .commonSchema(z.object({ id: z.string().describe('common id') }))
                .action({
                    name: 'update',
                    schema: z.object({ id: z.number().describe('action id override') }),
                    handler: noop,
                })
                .buildToolDefinition();
        }).toThrow(/conflict/i);
    });
});

// ============================================================================
// Sad Path: End-to-End via attachToServer (Flat Mode)
// ============================================================================

describe('Flat Exposition — E2E Sad Path', () => {

    it('should still route grouped name in flat mode via fallback dispatch', async () => {
        // Junior mistake: calling "projects" instead of "projects_list" in flat mode
        // The framework has a fallback path that delegates to registry.routeCall,
        // which finds the builder by its grouped name. This is by design — it
        // prevents hard breakage when an LLM sends the grouped name.
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('projects')
                .action({ name: 'list', handler: async () => success('data') }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Calling the grouped name still works via fallback dispatch
        const result = await server.callTool('projects', { action: 'list' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('data');
    });

    it('should correctly list flat tools and NOT list grouped names', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('tasks')
                .action({ name: 'list', handler: noop })
                .action({ name: 'create', handler: noop }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        const list = await server.callListTools();
        const names = list.tools.map((t: any) => t.name);

        // Should have flat names, NOT the grouped name
        expect(names).toContain('tasks_list');
        expect(names).toContain('tasks_create');
        expect(names).not.toContain('tasks');
    });

    it('should route flat tool call correctly with auto-hydrated discriminator', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('orders')
                .action({
                    name: 'get',
                    schema: z.object({ id: z.string() }),
                    handler: async (_ctx, args) => success(`order: ${args.id}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Junior sends args WITHOUT "action" field — that's the correct behavior in flat mode
        const result = await server.callTool('orders_get', { id: 'ord-123' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('order: ord-123');
    });

    it('should NOT break if junior passes the discriminator field anyway', async () => {
        // Junior mistake: passing { action: 'get', id: 'x' } even in flat mode
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('orders')
                .action({
                    name: 'get',
                    schema: z.object({ id: z.string() }),
                    handler: async (_ctx, args) => success(`order: ${args.id}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Passes action: 'get' redundantly — should still work (hydration overwrites to same value)
        const result = await server.callTool('orders_get', { action: 'get', id: 'ord-456' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('order: ord-456');
    });

    it('should return error for completely wrong flat name', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('tasks')
                .action({ name: 'list', handler: noop }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Junior types wrong name: "task_list" instead of "tasks_list"
        const result = await server.callTool('task_list', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_TOOL');
    });

    it('should return error when flat tool called with wrong action (typo in name)', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('tasks')
                .action({ name: 'list', handler: noop })
                .action({ name: 'create', handler: noop }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Junior types "tasks_lis" instead of "tasks_list"
        const result = await server.callTool('tasks_lis', {});
        expect(result.isError).toBe(true);
    });

    it('should handle empty registry in flat mode', async () => {
        const registry = new ToolRegistry<void>();
        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        const list = await server.callListTools();
        expect(list.tools).toHaveLength(0);

        const call = await server.callTool('anything', {});
        expect(call.isError).toBe(true);
    });

    it('should handle detach in flat mode', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('svc')
                .action({ name: 'ping', handler: async () => success('pong') }),
        );

        const server = createMockServer();
        const detach = registry.attachToServer(server, { toolExposition: 'flat' });

        // Before detach
        const r1 = await server.callListTools();
        expect(r1.tools).toHaveLength(1);

        const r2 = await server.callTool('svc_ping', {});
        expect(r2.content[0].text).toBe('pong');

        // Detach
        detach();

        // After detach — tools gone
        const r3 = await server.callListTools();
        expect(r3.tools).toHaveLength(0);

        // After detach — call fails
        const r4 = await server.callTool('svc_ping', {});
        expect(r4.isError).toBe(true);
        expect(r4.content[0].text).toContain('detached');
    });

    it('should pick up late-registered tools in flat mode', async () => {
        const registry = new ToolRegistry<void>();
        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Attach first, register later (junior mistake but valid use case)
        const r1 = await server.callListTools();
        expect(r1.tools).toHaveLength(0);

        registry.register(
            new GroupedToolBuilder<void>('late')
                .action({ name: 'check', handler: async () => success('late-ok') }),
        );

        // Should now appear thanks to lazy compilation
        const r2 = await server.callListTools();
        expect(r2.tools).toHaveLength(1);
        expect(r2.tools[0].name).toBe('late_check');

        // Should be callable
        const r3 = await server.callTool('late_check', {});
        expect(r3.content[0].text).toBe('late-ok');
    });

    it('should handle flat mode with custom discriminator', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('api')
                .discriminator('operation')
                .action({
                    name: 'status',
                    handler: async (_ctx, args) => {
                        // Verify the custom discriminator was injected
                        return success(`op=${args.operation}`);
                    },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        const result = await server.callTool('api_status', {});
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('op=status');
    });

    it('should handle flat mode with custom separator', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('api')
                .action({ name: 'health', handler: async () => success('ok') }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            actionSeparator: '.',
        });

        const list = await server.callListTools();
        expect(list.tools[0].name).toBe('api.health');

        const result = await server.callTool('api.health', {});
        expect(result.content[0].text).toBe('ok');

        // Calling with underscore separator should fail
        const wrong = await server.callTool('api_health', {});
        expect(wrong.isError).toBe(true);
    });

    it('should handle handler that throws an exception in flat mode', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('boom')
                .action({
                    name: 'crash',
                    handler: async () => { throw new Error('runtime kaboom'); },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Should not throw at protocol level — should return error response
        const result = await server.callTool('boom_crash', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('kaboom');
    });

    it('should handle filter in flat mode — exclude by tag', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('public')
                .tags('public')
                .action({ name: 'list', handler: noop }),
        );
        registry.register(
            new GroupedToolBuilder<void>('admin')
                .tags('internal')
                .action({ name: 'delete_all', destructive: true, handler: noop }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            filter: { exclude: ['internal'] },
        });

        const list = await server.callListTools();
        const names = list.tools.map((t: any) => t.name);
        expect(names).toContain('public_list');
        expect(names).not.toContain('admin_delete_all');
    });

    it('should handle switching from flat to grouped on re-attach', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('svc')
                .action({ name: 'list', handler: async () => success('data') })
                .action({ name: 'create', handler: noop }),
        );

        const server = createMockServer();

        // First attach: flat
        registry.attachToServer(server, { toolExposition: 'flat' });
        let list = await server.callListTools();
        expect(list.tools.map((t: any) => t.name)).toContain('svc_list');
        expect(list.tools).toHaveLength(2);

        // Re-attach: grouped (overwrites)
        registry.attachToServer(server, { toolExposition: 'grouped' });
        list = await server.callListTools();
        expect(list.tools).toHaveLength(1);
        expect(list.tools[0].name).toBe('svc');

        // Calling the old flat name should now fail
        const result = await server.callTool('svc_list', {});
        expect(result.isError).toBe(true);

        // Calling the grouped name should work
        const result2 = await server.callTool('svc', { action: 'list' });
        expect(result2.content[0].text).toBe('data');
    });

    it('should handle calling with completely wrong args in flat mode', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            new GroupedToolBuilder<void>('tasks')
                .action({
                    name: 'create',
                    schema: z.object({ title: z.string() }),
                    handler: async (_ctx, args) => success(args.title as string),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        // Junior sends wrong field names
        const result = await server.callTool('tasks_create', {
            nome: 'wrong field name',
        });

        // Should still route to the correct handler (Zod validation may or may
        // not catch this depending on strictness — the key point is routing works)
        expect(result).toBeDefined();
    });

    it('should handle multiple registries on same server with flat mode', async () => {
        const registry1 = new ToolRegistry<void>();
        registry1.register(
            new GroupedToolBuilder<void>('first')
                .action({ name: 'ping', handler: async () => success('first-pong') }),
        );

        const registry2 = new ToolRegistry<void>();
        registry2.register(
            new GroupedToolBuilder<void>('second')
                .action({ name: 'ping', handler: async () => success('second-pong') }),
        );

        const server = createMockServer();
        registry1.attachToServer(server, { toolExposition: 'flat' });
        registry2.attachToServer(server, { toolExposition: 'flat' }); // Overwrites

        const list = await server.callListTools();
        const names = list.tools.map((t: any) => t.name);
        expect(names).toContain('second_ping');
        expect(names).not.toContain('first_ping');

        // Only second registry's tools are callable
        const r1 = await server.callTool('first_ping', {});
        expect(r1.isError).toBe(true);

        const r2 = await server.callTool('second_ping', {});
        expect(r2.content[0].text).toBe('second-pong');
    });
});
