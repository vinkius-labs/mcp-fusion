/**
 * End-to-End Tests
 *
 * These tests simulate real-world scenarios exercising the full stack:
 * defineTool / createTool → ToolRegistry → routeCall → middleware → handler → response
 *
 * No mocking. All layers are real.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success, error, toolError } from '../../src/core/response.js';
import { progress } from '../../src/core/execution/ProgressHelper.js';
import { defineMiddleware } from '../../src/core/middleware/ContextDerivation.js';
import { createFusionClient, type FusionTransport } from '../../src/client/FusionClient.js';
import { type MiddlewareFn } from '../../src/core/types.js';

// ============================================================================
// Helpers
// ============================================================================

interface AppContext {
    userId: string;
    token: string;
    isAdmin: boolean;
}

function createCtx(overrides: Partial<AppContext> = {}): AppContext {
    return { userId: 'u_test', token: 'tok_valid', isAdmin: false, ...overrides };
}

// ============================================================================
// E2E: defineTool → Registry → routeCall
// ============================================================================

describe('E2E: defineTool → Registry → routeCall', () => {
    it('should register a defineTool and route a call through the registry', async () => {
        const projects = defineTool<AppContext>('projects', {
            shared: { workspace_id: 'string' },
            actions: {
                list: {
                    readOnly: true,
                    handler: async (ctx, args) => {
                        const ws = (args as Record<string, unknown>)['workspace_id'];
                        return success(`Listed projects for ws=${ws} by user=${ctx.userId}`);
                    },
                },
                create: {
                    params: { name: { type: 'string', min: 1, max: 100 } },
                    handler: async (ctx, args) => {
                        const a = args as Record<string, unknown>;
                        return success(`Created "${a['name']}" in ws=${a['workspace_id']}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry<AppContext>();
        registry.register(projects);

        // Happy path
        const list = await registry.routeCall(createCtx(), 'projects', {
            action: 'list', workspace_id: 'ws_42',
        });
        expect(list.content[0].text).toBe('Listed projects for ws=ws_42 by user=u_test');

        const create = await registry.routeCall(createCtx(), 'projects', {
            action: 'create', workspace_id: 'ws_42', name: 'Vinkius',
        });
        expect(create.content[0].text).toBe('Created "Vinkius" in ws=ws_42');

        // Validation error: name too short (empty → min 1)
        const fail = await registry.routeCall(createCtx(), 'projects', {
            action: 'create', workspace_id: 'ws_42', name: '',
        });
        expect(fail.isError).toBe(true);

        // Unknown action
        const unknown = await registry.routeCall(createCtx(), 'projects', {
            action: 'nonexistent',
        });
        expect(unknown.isError).toBe(true);

        // Unknown tool
        const noTool = await registry.routeCall(createCtx(), 'nope', { action: 'x' });
        expect(noTool.isError).toBe(true);
        expect(noTool.content[0].text).toContain('UNKNOWN_TOOL');
    });

    it('should validate shared params are required in all actions', async () => {
        const tool = defineTool('strict_shared', {
            shared: { tenant_id: 'string' },
            actions: {
                run: { handler: async () => success('ok') },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Missing shared param
        const result = await registry.routeCall(undefined, 'strict_shared', {
            action: 'run',
            // tenant_id is missing
        });
        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// E2E: createTool + Zod Power Mode → Registry
// ============================================================================

describe('E2E: createTool with Zod → Registry', () => {
    it('should support full Zod validation with custom regex', async () => {
        const emailSchema = z.object({
            email: z.string().regex(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/),
            age: z.number().int().min(18),
        });

        const tool = createTool<AppContext>('users')
            .action({
                name: 'register',
                schema: emailSchema,
                handler: async (ctx, args) => {
                    return success(`Registered ${args.email}, age ${args.age}`);
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        // Valid
        const ok = await registry.routeCall(createCtx(), 'users', {
            action: 'register', email: 'test@example.com', age: 25,
        });
        expect(ok.content[0].text).toBe('Registered test@example.com, age 25');

        // Invalid email
        const badEmail = await registry.routeCall(createCtx(), 'users', {
            action: 'register', email: 'not-an-email', age: 25,
        });
        expect(badEmail.isError).toBe(true);

        // Underage
        const young = await registry.routeCall(createCtx(), 'users', {
            action: 'register', email: 'kid@example.com', age: 15,
        });
        expect(young.isError).toBe(true);

        // Non-integer age
        const float = await registry.routeCall(createCtx(), 'users', {
            action: 'register', email: 'test@example.com', age: 25.5,
        });
        expect(float.isError).toBe(true);
    });

    it('should coexist: createTool + defineTool in same registry', async () => {
        const toolA = defineTool('tool_a', {
            actions: { ping: { handler: async () => success('from-defineTool') } },
        });

        const toolB = createTool('tool_b').action({
            name: 'ping',
            handler: async () => success('from-createTool'),
        });

        const registry = new ToolRegistry();
        registry.register(toolA);
        registry.register(toolB);

        expect(registry.size).toBe(2);

        const rA = await registry.routeCall(undefined, 'tool_a', { action: 'ping' });
        const rB = await registry.routeCall(undefined, 'tool_b', { action: 'ping' });
        expect(rA.content[0].text).toBe('from-defineTool');
        expect(rB.content[0].text).toBe('from-createTool');
    });
});

// ============================================================================
// E2E: Middleware + Context Derivation → Handler
// ============================================================================

describe('E2E: Middleware pipeline', () => {
    it('should auth middleware → derive user → handler sees derived ctx', async () => {
        const requireAuth = defineMiddleware(async (ctx: AppContext) => {
            if (!ctx.token) throw new Error('Unauthorized');
            return { sessionId: 'sess_' + ctx.userId };
        });

        const tool = createTool<AppContext>('secure')
            .use(requireAuth.toMiddlewareFn())
            .action({
                name: 'whoami',
                handler: async (ctx) => {
                    const sess = (ctx as any).sessionId;
                    return success(`user=${ctx.userId}, session=${sess}`);
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const ok = await registry.routeCall(createCtx(), 'secure', { action: 'whoami' });
        expect(ok.content[0].text).toBe('user=u_test, session=sess_u_test');

        const fail = await registry.routeCall(
            createCtx({ token: '' }),
            'secure',
            { action: 'whoami' },
        );
        expect(fail.isError).toBe(true);
        expect(fail.content[0].text).toContain('Unauthorized');
    });

    it('should stack global + group middleware in correct order', async () => {
        const order: string[] = [];

        const globalMw: MiddlewareFn<void> = async (_ctx, _args, next) => {
            order.push('global');
            return next();
        };

        const groupMw: MiddlewareFn<void> = async (_ctx, _args, next) => {
            order.push('group');
            return next();
        };

        const tool = defineTool('ordered', {
            middleware: [globalMw],
            groups: {
                admin: {
                    middleware: [groupMw],
                    actions: {
                        reset: {
                            handler: async () => {
                                order.push('handler');
                                return success('done');
                            },
                        },
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        await registry.routeCall(undefined, 'ordered', { action: 'admin.reset' });
        expect(order).toEqual(['global', 'group', 'handler']);
    });

    it('should middleware short-circuit without reaching handler', async () => {
        let handlerCalled = false;

        const blocker: MiddlewareFn<void> = async () => {
            return error('Blocked by middleware');
        };

        const tool = createTool('blocked')
            .use(blocker)
            .action({
                name: 'run',
                handler: async () => { handlerCalled = true; return success('ok'); },
            });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(undefined, 'blocked', { action: 'run' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('<tool_error>');
        expect(handlerCalled).toBe(false);
    });
});

// ============================================================================
// E2E: Streaming Progress → Registry
// ============================================================================

describe('E2E: Streaming Progress pipeline', () => {
    it('should drain generator and return final result via registry', async () => {
        const tool = createTool<AppContext>('deploy')
            .action({
                name: 'run',
                handler: (async function* (ctx: AppContext, _args: any) {
                    yield progress(10, 'Cloning...');
                    yield progress(50, `Building for ${ctx.userId}...`);
                    yield progress(90, 'Deploying...');
                    return success(`Deployed by ${ctx.userId}`);
                }) as any,
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const result = await registry.routeCall(createCtx(), 'deploy', { action: 'run' });
        expect(result.content[0].text).toBe('Deployed by u_test');
        expect(result.isError).toBeUndefined();
    });

    it('should handle generator error via registry', async () => {
        const tool = createTool('gen_fail')
            .action({
                name: 'crash',
                handler: (async function* (_ctx: any, _args: any) {
                    yield progress(50, 'Halfway...');
                    throw new Error('Explosion 💥');
                }) as any,
            });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(undefined, 'gen_fail', { action: 'crash' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Explosion');
    });
});

// ============================================================================
// E2E: Self-Healing Errors → Registry
// ============================================================================

describe('E2E: Self-healing errors', () => {
    it('should return toolError with suggestion through the full pipeline', async () => {
        const tool = defineTool('lookup', {
            actions: {
                get: {
                    params: { id: 'string' },
                    handler: async (_ctx, args) => {
                        const id = (args as Record<string, unknown>)['id'];
                        if (id === 'nonexistent') {
                            return toolError('NotFound', {
                                message: `Item "${id}" not found.`,
                                suggestion: 'Use lookup.list to see available IDs.',
                                availableActions: ['lookup.list'],
                            });
                        }
                        return success(`Found: ${id}`);
                    },
                },
                list: {
                    readOnly: true,
                    handler: async () => success(['item1', 'item2']),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const ok = await registry.routeCall(undefined, 'lookup', { action: 'get', id: 'item1' });
        expect(ok.content[0].text).toBe('Found: item1');

        const fail = await registry.routeCall(undefined, 'lookup', { action: 'get', id: 'nonexistent' });
        expect(fail.isError).toBe(true);
        expect(fail.content[0].text).toContain('code="NotFound"');
        expect(fail.content[0].text).toContain('<recovery>');
        expect(fail.content[0].text).toContain('<available_actions>lookup.list</available_actions>');
    });
});

// ============================================================================
// E2E: FusionClient → ToolRegistry (simulated transport)
// ============================================================================

describe('E2E: FusionClient → ToolRegistry', () => {
    it('should type-safe client call a real registry', async () => {
        const projects = defineTool('projects', {
            actions: {
                list: { handler: async () => success('project list') },
                create: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => success(`created ${(args as any)['name']}`),
                },
            },
        });

        const billing = defineTool('billing', {
            actions: {
                status: { handler: async () => success('billing ok') },
            },
        });

        const registry = new ToolRegistry();
        registry.register(projects);
        registry.register(billing);

        // Create a transport that routes to our registry
        const transport: FusionTransport = {
            async callTool(name, args) {
                return registry.routeCall(undefined, name, args);
            },
        };

        type AppRouter = {
            'projects.list': Record<string, never>;
            'projects.create': { name: string };
            'billing.status': Record<string, never>;
        };

        const client = createFusionClient<AppRouter>(transport);

        const r1 = await client.execute('projects.list', {});
        expect(r1.content[0].text).toBe('project list');

        const r2 = await client.execute('projects.create', { name: 'Vinkius' });
        expect(r2.content[0].text).toBe('created Vinkius');

        const r3 = await client.execute('billing.status', {});
        expect(r3.content[0].text).toBe('billing ok');
    });

    it('should client receive validation errors from registry', async () => {
        const tool = defineTool('strict', {
            actions: {
                run: {
                    params: { count: 'number' },
                    handler: async () => success('ok'),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const transport: FusionTransport = {
            async callTool(name, args) {
                return registry.routeCall(undefined, name, args);
            },
        };

        const client = createFusionClient(transport);

        const fail = await client.execute('strict.run', { count: 'not_a_number' } as any);
        expect(fail.isError).toBe(true);
    });

    it('should client receive self-healing errors from registry', async () => {
        const tool = defineTool('guarded', {
            actions: {
                get: {
                    params: { id: 'string' },
                    handler: async () =>
                        toolError('NotFound', {
                            message: 'Not found',
                            suggestion: 'Use guarded.list',
                            availableActions: ['guarded.list'],
                        }),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const transport: FusionTransport = {
            async callTool(name, args) {
                return registry.routeCall(undefined, name, args);
            },
        };

        const client = createFusionClient(transport);
        const result = await client.execute('guarded.get', { id: 'x' } as any);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('code="NotFound"');
        expect(result.content[0].text).toContain('<available_actions>guarded.list</available_actions>');
    });
});

// ============================================================================
// E2E: Full Stack — defineTool + Zod + Middleware + Generator + Client
// ============================================================================

describe('E2E: Full stack scenario', () => {
    it('should combine all features in a realistic platform tool', async () => {
        const order: string[] = [];

        const auditLog: MiddlewareFn<AppContext> = async (ctx, _args, next) => {
            order.push(`audit:${ctx.userId}`);
            return next();
        };

        const requireAdmin = defineMiddleware(async (ctx: AppContext) => {
            if (!ctx.isAdmin) throw new Error('Admin access required');
            return { adminLevel: 'super' };
        });

        // defineTool with JSON params
        const users = defineTool<AppContext>('users', {
            description: 'User management',
            tags: ['core'],
            middleware: [auditLog],
            actions: {
                list: {
                    readOnly: true,
                    params: { limit: { type: 'number', optional: true, min: 1, max: 100 } },
                    handler: async (_ctx, args) => {
                        const limit = (args as Record<string, unknown>)['limit'] ?? 10;
                        return success({ users: [], limit });
                    },
                },
                ban: {
                    destructive: true,
                    params: { user_id: 'string' },
                    handler: async (ctx, args) => {
                        const uid = (args as Record<string, unknown>)['user_id'];
                        return success(`${uid} banned by ${ctx.userId}`);
                    },
                },
            },
        });

        // createTool with Zod + generator
        const deploy = createTool<AppContext>('deploy')
            .use(auditLog)
            .use(requireAdmin.toMiddlewareFn())
            .action({
                name: 'run',
                schema: z.object({ env: z.enum(['staging', 'production']) }),
                handler: (async function* (ctx: AppContext, args: { env: string }) {
                    yield progress(10, 'Preparing...');
                    yield progress(50, `Building ${args.env}...`);
                    yield progress(90, 'Deploying...');
                    const level = (ctx as any).adminLevel;
                    return success(`Deployed to ${args.env} by ${ctx.userId} (${level})`);
                }) as any,
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(users);
        registry.register(deploy);

        // Wire up client
        const transport: FusionTransport = {
            async callTool(name, args) {
                return registry.routeCall(createCtx({ isAdmin: true }), name, args);
            },
        };

        const client = createFusionClient(transport);

        // Test users.list
        const listResult = await client.execute('users.list', { limit: 5 } as any);
        expect(listResult.isError).toBeUndefined();
        expect(order).toContain('audit:u_test');

        // Test users.ban
        order.length = 0;
        const banResult = await client.execute('users.ban', { user_id: 'u_bad' } as any);
        expect(banResult.content[0].text).toBe('u_bad banned by u_test');
        expect(order).toContain('audit:u_test');

        // Test deploy.run (generator + admin middleware)
        order.length = 0;
        const deployResult = await client.execute('deploy.run', { env: 'production' } as any);
        expect(deployResult.content[0].text).toBe('Deployed to production by u_test (super)');
        expect(order).toContain('audit:u_test');

        // Test deploy.run with bad env
        const badEnv = await registry.routeCall(
            createCtx({ isAdmin: true }),
            'deploy',
            { action: 'run', env: 'invalid' },
        );
        expect(badEnv.isError).toBe(true);

        // Test deploy.run without admin
        const noAdmin = await registry.routeCall(
            createCtx({ isAdmin: false }),
            'deploy',
            { action: 'run', env: 'staging' },
        );
        expect(noAdmin.isError).toBe(true);
        expect(noAdmin.content[0].text).toContain('Admin access required');
    });

    it('should handle mixed Zod and JSON params for different actions in same tool', async () => {
        const tool = defineTool('hybrid', {
            actions: {
                simple: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => success(`hi ${(args as any)['name']}`),
                },
                complex: {
                    params: z.object({
                        email: z.string().email(),
                        tags: z.array(z.string()).min(1),
                    }),
                    handler: async (_ctx, args) => {
                        const a = args as any;
                        return success(`${a['email']}:${a['tags'].join(',')}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // JSON params action
        const r1 = await registry.routeCall(undefined, 'hybrid', { action: 'simple', name: 'Alice' });
        expect(r1.content[0].text).toBe('hi Alice');

        // Zod params action — valid
        const r2 = await registry.routeCall(undefined, 'hybrid', {
            action: 'complex', email: 'a@b.com', tags: ['x'],
        });
        expect(r2.content[0].text).toBe('a@b.com:x');

        // Zod params action — invalid email
        const r3 = await registry.routeCall(undefined, 'hybrid', {
            action: 'complex', email: 'nope', tags: ['x'],
        });
        expect(r3.isError).toBe(true);

        // Zod params action — empty tags
        const r4 = await registry.routeCall(undefined, 'hybrid', {
            action: 'complex', email: 'a@b.com', tags: [],
        });
        expect(r4.isError).toBe(true);
    });

    it('should groups with shared params + defineTool route correctly', async () => {
        const platform = defineTool('platform', {
            shared: { org_id: 'string' },
            groups: {
                users: {
                    description: 'User ops',
                    actions: {
                        list: {
                            handler: async (_ctx, args) =>
                                success(`users in ${(args as any)['org_id']}`),
                        },
                    },
                },
                billing: {
                    description: 'Billing ops',
                    actions: {
                        invoice: {
                            params: { month: 'number' },
                            handler: async (_ctx, args) => {
                                const a = args as any;
                                return success(`invoice ${a['org_id']}/${a['month']}`);
                            },
                        },
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(platform);

        const r1 = await registry.routeCall(undefined, 'platform', {
            action: 'users.list', org_id: 'org_1',
        });
        expect(r1.content[0].text).toBe('users in org_1');

        const r2 = await registry.routeCall(undefined, 'platform', {
            action: 'billing.invoice', org_id: 'org_1', month: 3,
        });
        expect(r2.content[0].text).toBe('invoice org_1/3');

        // Missing shared param
        const r3 = await registry.routeCall(undefined, 'platform', {
            action: 'users.list',
        });
        expect(r3.isError).toBe(true);
    });
});

// ============================================================================
// E2E: Registry error boundaries
// ============================================================================

describe('E2E: Registry error boundaries', () => {
    it('should reject duplicate tool registration', () => {
        const registry = new ToolRegistry();
        const t = defineTool('dup', { actions: { x: { handler: async () => success('ok') } } });
        registry.register(t);

        const t2 = defineTool('dup', { actions: { y: { handler: async () => success('ok') } } });
        expect(() => registry.register(t2)).toThrow('already registered');
    });

    it('should handle handler returning undefined (invalid at runtime)', async () => {
        const tool = createTool('bad_handler').action({
            name: 'run',
            handler: async () => undefined as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // MVA Pipeline: postProcessResult wraps raw returns in valid ToolResponse
        // This is improved behavior — pipeline always returns a valid response
        const result = await registry.routeCall(undefined, 'bad_handler', { action: 'run' });
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
    });

    it('should handle handler that throws synchronously', async () => {
        const tool = createTool('sync_throw').action({
            name: 'run',
            handler: (() => { throw new Error('Sync boom'); }) as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(undefined, 'sync_throw', { action: 'run' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Sync boom');
    });

    it('should handle missing action param gracefully', async () => {
        const tool = defineTool('needs_action', {
            actions: { run: { handler: async () => success('ok') } },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(undefined, 'needs_action', {});
        expect(result.isError).toBe(true);
    });

    it('should clear registry and reject calls to removed tools', async () => {
        const registry = new ToolRegistry();
        const tool = defineTool('temp', { actions: { x: { handler: async () => success('ok') } } });
        registry.register(tool);

        expect(registry.has('temp')).toBe(true);
        registry.clear();
        expect(registry.has('temp')).toBe(false);
        expect(registry.size).toBe(0);

        const result = await registry.routeCall(undefined, 'temp', { action: 'x' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_TOOL');
    });
});
