import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTypedRegistry } from '../../src/framework/client/createTypedRegistry.js';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { success } from '../../src/framework/response.js';
import { type InferRouter, type TypedToolRegistry } from '../../src/framework/client/InferRouter.js';
import { type FusionTransport, createFusionClient } from '../../src/framework/client/FusionClient.js';
import { type ToolResponse } from '../../src/framework/response.js';

// ============================================================================
// Test Context
// ============================================================================

interface TestContext {
    userId: string;
}

// ============================================================================
// createTypedRegistry() — Runtime Tests
// ============================================================================

describe('createTypedRegistry()', () => {
    it('should create a typed registry with the inner ToolRegistry', () => {
        const projects = createTool<TestContext>('projects')
            .action({ name: 'list', handler: async () => success('ok') });

        const registry = createTypedRegistry<TestContext>()(projects);

        expect(registry.registry).toBeDefined();
        expect(registry.registry.has('projects')).toBe(true);
        expect(registry.registry.size).toBe(1);
    });

    it('should register multiple builders', () => {
        const projects = createTool<TestContext>('projects')
            .action({ name: 'list', handler: async () => success('ok') });
        const billing = createTool<TestContext>('billing')
            .action({ name: 'refund', handler: async () => success('ok') });

        const registry = createTypedRegistry<TestContext>()(projects, billing);

        expect(registry.registry.size).toBe(2);
        expect(registry.registry.has('projects')).toBe(true);
        expect(registry.registry.has('billing')).toBe(true);
    });

    it('should preserve builder references in _builders', () => {
        const projects = createTool<TestContext>('projects')
            .action({ name: 'list', handler: async () => success('ok') });

        const registry = createTypedRegistry<TestContext>()(projects);

        expect(registry._builders).toHaveLength(1);
        expect(registry._builders[0]).toBe(projects);
    });

    it('should route calls through the inner registry', async () => {
        const projects = createTool<TestContext>('projects')
            .action({
                name: 'list',
                handler: async () => success('project-list'),
            });

        const registry = createTypedRegistry<TestContext>()(projects);

        const result = await registry.registry.routeCall(
            { userId: 'u1' },
            'projects',
            { action: 'list' },
        );

        expect(result.content[0].text).toBe('project-list');
    });

    it('should throw on duplicate tool names (via inner registry)', () => {
        const tool1 = createTool<TestContext>('projects')
            .action({ name: 'list', handler: async () => success('ok') });
        const tool2 = createTool<TestContext>('projects')
            .action({ name: 'create', handler: async () => success('ok') });

        expect(() => createTypedRegistry<TestContext>()(tool1, tool2))
            .toThrow(/already registered/i);
    });

    it('should work with empty builder list', () => {
        const registry = createTypedRegistry<TestContext>()();

        expect(registry.registry.size).toBe(0);
    });
});

// ============================================================================
// InferRouter — Type-Level Tests (compile-time verification)
// ============================================================================

describe('InferRouter type inference', () => {
    it('should infer action names from builders with schemas', () => {
        const projects = createTool<TestContext>('projects')
            .action({
                name: 'list',
                schema: z.object({ status: z.string().optional() }),
                handler: async (_ctx, _args) => success('ok'),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, _args) => success('ok'),
            });

        const registry = createTypedRegistry<TestContext>()(projects);

        // The InferRouter type should contain 'projects.list' and 'projects.create' keys
        type AppRouter = InferRouter<typeof registry>;

        // Type-level assertions: these lines only compile if InferRouter
        // correctly infers the specific keys and arg types.
        const _listArgs: AppRouter['projects.list'] = { status: 'active' };
        const _createArgs: AppRouter['projects.create'] = { name: 'Test' };

        expect(_listArgs).toBeDefined();
        expect(_createArgs).toBeDefined();
    });

    it('should infer multiple tools into a single merged RouterMap', () => {
        const projects = createTool<TestContext>('projects')
            .action({
                name: 'list',
                schema: z.object({ workspace_id: z.string() }),
                handler: async (_ctx, _args) => success('ok'),
            });

        const billing = createTool<TestContext>('billing')
            .action({
                name: 'refund',
                schema: z.object({ invoice_id: z.string(), amount: z.number() }),
                handler: async (_ctx, _args) => success('ok'),
            });

        const registry = createTypedRegistry<TestContext>()(projects, billing);
        type AppRouter = InferRouter<typeof registry>;

        // Both tools are in the map
        const _projectArgs: AppRouter['projects.list'] = { workspace_id: 'ws_1' };
        const _billingArgs: AppRouter['billing.refund'] = { invoice_id: 'inv_1', amount: 42 };

        expect(_projectArgs.workspace_id).toBe('ws_1');
        expect(_billingArgs.amount).toBe(42);
    });

    it('should include common schema fields in inferred args', () => {
        const projects = createTool<TestContext>('projects')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .action({
                name: 'list',
                schema: z.object({ status: z.string().optional() }),
                handler: async (_ctx, _args) => success('ok'),
            });

        const registry = createTypedRegistry<TestContext>()(projects);
        type AppRouter = InferRouter<typeof registry>;

        // Args should include both common (workspace_id) and action-specific (status)
        const _args: AppRouter['projects.list'] = {
            workspace_id: 'ws_1',
            status: 'active',
        };

        expect(_args.workspace_id).toBe('ws_1');
    });

    it('should work end-to-end: createTypedRegistry → InferRouter → FusionClient', async () => {
        const projects = createTool<TestContext>('projects')
            .action({
                name: 'list',
                schema: z.object({ limit: z.number().optional() }),
                handler: async () => success('projects-listed'),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async () => success('project-created'),
            });

        const registry = createTypedRegistry<TestContext>()(projects);
        type AppRouter = InferRouter<typeof registry>;

        // Create a transport that delegates to the real registry
        const transport: FusionTransport = {
            async callTool(name, args) {
                return registry.registry.routeCall({ userId: 'test' }, name, args);
            },
        };

        const client = createFusionClient<AppRouter>(transport);

        // These calls compile because InferRouter provides correct keys + arg types
        const listResult = await client.execute('projects.list', { limit: 10 });
        expect(listResult.content[0].text).toBe('projects-listed');

        const createResult = await client.execute('projects.create', { name: 'Test' });
        expect(createResult.content[0].text).toBe('project-created');
    });

    it('should handle actions without schemas (untyped), inferring Record<string, unknown>', () => {
        const projects = createTool<TestContext>('projects')
            .action({ name: 'list', handler: async () => success('ok') });

        const registry = createTypedRegistry<TestContext>()(projects);
        type AppRouter = InferRouter<typeof registry>;

        // Untyped actions should have Record<string, unknown> args
        const _args: AppRouter['projects.list'] = { anything: 'goes' };
        expect(_args).toBeDefined();
    });
});

// ============================================================================
// Integration: TypedToolRegistry preserves registry operations
// ============================================================================

describe('TypedToolRegistry integration', () => {
    it('should support getAllTools() through inner registry', () => {
        const projects = createTool<TestContext>('projects')
            .description('Manage projects')
            .action({ name: 'list', handler: async () => success('ok') });

        const registry = createTypedRegistry<TestContext>()(projects);

        const tools = registry.registry.getAllTools();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('projects');
    });

    it('should support has() and clear() through inner registry', () => {
        const projects = createTool<TestContext>('projects')
            .action({ name: 'list', handler: async () => success('ok') });

        const registry = createTypedRegistry<TestContext>()(projects);

        expect(registry.registry.has('projects')).toBe(true);
        expect(registry.registry.has('nonexistent')).toBe(false);

        registry.registry.clear();
        expect(registry.registry.size).toBe(0);
    });
});

// ============================================================================
// Task 2.2: Typed handler args via schema inference
// ============================================================================

describe('Typed handler args (Task 2.2)', () => {
    describe('createTool() path — Zod schema inference', () => {
        it('should type handler args from Zod schema', async () => {
            const tool = createTool<TestContext>('projects')
                .action({
                    name: 'create',
                    schema: z.object({
                        name: z.string(),
                        status: z.enum(['active', 'archived']).optional(),
                    }),
                    handler: async (_ctx, args) => {
                        // Type assertion: args.name is string, args.status is optional enum
                        // These accesses compile WITHOUT casts — that's the point
                        const name: string = args.name;
                        const status: 'active' | 'archived' | undefined = args.status;
                        return success(`${name}:${status ?? 'default'}`);
                    },
                });

            const result = await tool.execute(
                { userId: 'u1' },
                { action: 'create', name: 'Test', status: 'active' },
            );
            expect(result.content[0].text).toBe('Test:active');
        });

        it('should merge common schema fields with action schema in handler args', async () => {
            const tool = createTool<TestContext>('projects')
                .commonSchema(z.object({ workspace_id: z.string() }))
                .action({
                    name: 'list',
                    schema: z.object({ limit: z.number().optional() }),
                    handler: async (_ctx, args) => {
                        // Both common and action-specific fields are typed
                        const wsId: string = args.workspace_id;
                        const limit: number | undefined = args.limit;
                        return success(`${wsId}:${limit ?? 'all'}`);
                    },
                });

            const result = await tool.execute(
                { userId: 'u1' },
                { action: 'list', workspace_id: 'ws_1', limit: 10 },
            );
            expect(result.content[0].text).toBe('ws_1:10');
        });
    });

    describe('defineTool() path — ParamsMap inference', () => {
        it('should type handler args from ParamsMap params', async () => {
            const { defineTool } = await import('../../src/framework/builder/defineTool.js');

            const tool = defineTool('echo', {
                actions: {
                    say: {
                        params: { message: 'string' },
                        handler: async (_ctx, args) => {
                            // args.message should be typed as string — no cast needed
                            const msg: string = args.message;
                            return success(msg);
                        },
                    },
                },
            });

            const result = await tool.execute(undefined, { action: 'say', message: 'hello' });
            expect(result.content[0].text).toBe('hello');
        });

        it('should merge shared + action params in handler args', async () => {
            const { defineTool } = await import('../../src/framework/builder/defineTool.js');

            const tool = defineTool('projects', {
                shared: { workspace_id: 'string' },
                actions: {
                    create: {
                        params: { name: 'string' },
                        handler: async (_ctx, args) => {
                            // Both shared (workspace_id) and action (name) are typed
                            const wsId: string = args.workspace_id;
                            const name: string = args.name;
                            return success(`${wsId}:${name}`);
                        },
                    },
                },
            });

            const result = await tool.execute(
                undefined,
                { action: 'create', workspace_id: 'ws_1', name: 'Test' },
            );
            expect(result.content[0].text).toBe('ws_1:Test');
        });

        it('should type number and boolean params correctly', async () => {
            const { defineTool } = await import('../../src/framework/builder/defineTool.js');

            const tool = defineTool('data', {
                actions: {
                    query: {
                        params: {
                            limit: { type: 'number', min: 1, max: 100 },
                            verbose: 'boolean',
                        },
                        handler: async (_ctx, args) => {
                            const limit: number = args.limit;
                            const verbose: boolean = args.verbose;
                            return success(`${limit}:${verbose}`);
                        },
                    },
                },
            });

            const result = await tool.execute(
                undefined,
                { action: 'query', limit: 50, verbose: true },
            );
            expect(result.content[0].text).toBe('50:true');
        });

        it('should handle actions without params (fallback to shared + unknown)', async () => {
            const { defineTool } = await import('../../src/framework/builder/defineTool.js');

            const tool = defineTool('projects', {
                shared: { workspace_id: 'string' },
                actions: {
                    list: {
                        readOnly: true,
                        handler: async (_ctx, args) => {
                            // No params → args should include shared + Record<string, unknown>
                            const wsId: string = args.workspace_id;
                            return success(wsId);
                        },
                    },
                },
            });

            const result = await tool.execute(
                undefined,
                { action: 'list', workspace_id: 'ws_1' },
            );
            expect(result.content[0].text).toBe('ws_1');
        });
    });
});

