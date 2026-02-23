/**
 * TypeSafety.test.ts — Exhaustive Type Safety Verification
 *
 * Covers Tasks 2.1 (InferRouter) and 2.2 (typed handler args) with
 * both compile-time type assertions and runtime behavior verification.
 *
 * Categories:
 * 1. InferRouter — compile-time key+arg extraction
 * 2. createTypedRegistry — runtime correctness
 * 3. Typed handler args — defineTool() path
 * 4. Typed handler args — createTool() path
 * 5. Backward compatibility — no regressions
 * 6. Integration — full pipeline end-to-end
 * 7. Edge cases and adversarial scenarios
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTool, GroupedToolBuilder } from '../../src/core/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { createTypedRegistry } from '../../src/client/createTypedRegistry.js';
import { createFusionClient } from '../../src/client/FusionClient.js';
import { success, error } from '../../src/core/response.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import type { InferRouter, TypedToolRegistry } from '../../src/client/InferRouter.js';
import type { FusionTransport, RouterMap } from '../../src/client/FusionClient.js';

// ============================================================================
// Test Context
// ============================================================================

interface AppContext {
    userId: string;
    db: { query: (sql: string) => Promise<string[]> };
}

// ============================================================================
// 1. InferRouter — Compile-Time Key+Arg Extraction
// ============================================================================

describe('InferRouter — compile-time inference', () => {
    it('should infer single tool with single action (schema)', () => {
        const users = createTool<AppContext>('users')
            .action({
                name: 'list',
                schema: z.object({ limit: z.number(), offset: z.number().optional() }),
                handler: async (_ctx, _args) => success('ok'),
            });

        const reg = createTypedRegistry<AppContext>()(users);
        type R = InferRouter<typeof reg>;

        // These MUST compile — proves key + arg types are inferred
        const _args: R['users.list'] = { limit: 10 };
        const _argsOpt: R['users.list'] = { limit: 10, offset: 5 };

        expect(_args.limit).toBe(10);
        expect(_argsOpt.offset).toBe(5);
    });

    it('should infer multiple actions on the same tool', () => {
        const users = createTool<AppContext>('users')
            .action({
                name: 'list',
                schema: z.object({ page: z.number() }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'create',
                schema: z.object({ email: z.string(), role: z.string() }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'delete',
                schema: z.object({ user_id: z.string() }),
                handler: async () => success('ok'),
            });

        const reg = createTypedRegistry<AppContext>()(users);
        type R = InferRouter<typeof reg>;

        const _list: R['users.list'] = { page: 1 };
        const _create: R['users.create'] = { email: 'a@b.com', role: 'admin' };
        const _delete: R['users.delete'] = { user_id: 'u_123' };

        expect(_list.page).toBe(1);
        expect(_create.email).toBe('a@b.com');
        expect(_delete.user_id).toBe('u_123');
    });

    it('should merge multiple tools into a single flat RouterMap', () => {
        const users = createTool<AppContext>('users')
            .action({
                name: 'list',
                schema: z.object({ active: z.boolean() }),
                handler: async () => success('ok'),
            });

        const billing = createTool<AppContext>('billing')
            .action({
                name: 'charge',
                schema: z.object({ amount: z.number(), currency: z.string() }),
                handler: async () => success('ok'),
            });

        const audit = createTool<AppContext>('audit')
            .action({
                name: 'log',
                schema: z.object({ event: z.string(), severity: z.number() }),
                handler: async () => success('ok'),
            });

        const reg = createTypedRegistry<AppContext>()(users, billing, audit);
        type R = InferRouter<typeof reg>;

        const _u: R['users.list'] = { active: true };
        const _b: R['billing.charge'] = { amount: 99.99, currency: 'USD' };
        const _a: R['audit.log'] = { event: 'login', severity: 1 };

        expect(_u.active).toBe(true);
        expect(_b.currency).toBe('USD');
        expect(_a.severity).toBe(1);
    });

    it('should propagate commonSchema fields into inferred args', () => {
        const projects = createTool<AppContext>('projects')
            .commonSchema(z.object({
                workspace_id: z.string(),
                region: z.enum(['us', 'eu']),
            }))
            .action({
                name: 'list',
                schema: z.object({ status: z.string().optional() }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async () => success('ok'),
            });

        const reg = createTypedRegistry<AppContext>()(projects);
        type R = InferRouter<typeof reg>;

        // Both common + action-specific fields must be present
        const _list: R['projects.list'] = {
            workspace_id: 'ws_1',
            region: 'us',
            status: 'active',
        };
        const _create: R['projects.create'] = {
            workspace_id: 'ws_1',
            region: 'eu',
            name: 'My Project',
        };

        expect(_list.workspace_id).toBe('ws_1');
        expect(_create.region).toBe('eu');
    });

    it('should handle enum and optional types in schema', () => {
        const config = createTool<AppContext>('config')
            .action({
                name: 'set',
                schema: z.object({
                    key: z.string(),
                    value: z.string(),
                    env: z.enum(['dev', 'staging', 'prod']),
                    ttl: z.number().optional(),
                }),
                handler: async () => success('ok'),
            });

        const reg = createTypedRegistry<AppContext>()(config);
        type R = InferRouter<typeof reg>;

        const _args: R['config.set'] = {
            key: 'api_url',
            value: 'https://api.example.com',
            env: 'prod',
            // ttl is optional — omitting it is valid
        };

        expect(_args.env).toBe('prod');
    });

    it('should handle untyped actions gracefully (Record<string, unknown>)', () => {
        const tools = createTool<AppContext>('tools')
            .action({ name: 'ping', handler: async () => success('pong') });

        const reg = createTypedRegistry<AppContext>()(tools);
        type R = InferRouter<typeof reg>;

        // Untyped → Record<string, unknown>, so any key is valid
        const _args: R['tools.ping'] = { anything: 'goes', extra: 42 };
        expect(_args).toBeDefined();
    });
});

// ============================================================================
// 2. createTypedRegistry — Runtime Correctness
// ============================================================================

describe('createTypedRegistry — runtime', () => {
    it('should route calls through the inner registry', async () => {
        const echo = createTool<AppContext>('echo')
            .action({
                name: 'say',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const reg = createTypedRegistry<AppContext>()(echo);
        const result = await reg.registry.routeCall(
            { userId: 'u1', db: { query: async () => [] } },
            'echo',
            { action: 'say', msg: 'hello world' },
        );

        expect(result.content[0].text).toBe('hello world');
    });

    it('should throw on duplicate tool registration', () => {
        const t1 = createTool<AppContext>('dup').action({ name: 'a', handler: async () => success('ok') });
        const t2 = createTool<AppContext>('dup').action({ name: 'b', handler: async () => success('ok') });

        expect(() => createTypedRegistry<AppContext>()(t1, t2)).toThrow(/already registered/i);
    });

    it('should support size, has, and clear on inner registry', () => {
        const t1 = createTool<AppContext>('alpha').action({ name: 'x', handler: async () => success('ok') });
        const t2 = createTool<AppContext>('beta').action({ name: 'y', handler: async () => success('ok') });
        const t3 = createTool<AppContext>('gamma').action({ name: 'z', handler: async () => success('ok') });

        const reg = createTypedRegistry<AppContext>()(t1, t2, t3);

        expect(reg.registry.size).toBe(3);
        expect(reg.registry.has('alpha')).toBe(true);
        expect(reg.registry.has('beta')).toBe(true);
        expect(reg.registry.has('gamma')).toBe(true);
        expect(reg.registry.has('delta')).toBe(false);

        reg.registry.clear();
        expect(reg.registry.size).toBe(0);
    });

    it('should produce valid tool definitions from inner registry', () => {
        const users = createTool<AppContext>('users')
            .description('User management')
            .action({
                name: 'list',
                readOnly: true,
                schema: z.object({ active: z.boolean().optional() }),
                handler: async () => success('ok'),
            });

        const reg = createTypedRegistry<AppContext>()(users);
        const tools = reg.registry.getAllTools();

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('users');
        expect(tools[0].description).toContain('User management');
    });

    it('should preserve _builders tuple for type extraction', () => {
        const a = createTool<AppContext>('a').action({ name: 'x', handler: async () => success('ok') });
        const b = createTool<AppContext>('b').action({ name: 'y', handler: async () => success('ok') });

        const reg = createTypedRegistry<AppContext>()(a, b);

        expect(reg._builders).toHaveLength(2);
        expect(reg._builders[0]).toBe(a);
        expect(reg._builders[1]).toBe(b);
    });

    it('should work with empty builder list', () => {
        const reg = createTypedRegistry<AppContext>()();

        expect(reg.registry.size).toBe(0);
        expect(reg._builders).toHaveLength(0);
        expect(reg.registry.getAllTools()).toEqual([]);
    });
});

// ============================================================================
// 3. Typed handler args — defineTool() path
// ============================================================================

describe('Typed handler args — defineTool() path', () => {
    it('should infer string params in handler args', async () => {
        const tool = defineTool('echo', {
            actions: {
                say: {
                    params: { message: 'string' },
                    handler: async (_ctx, args) => {
                        const msg: string = args.message;
                        return success(msg);
                    },
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'say', message: 'typed!' });
        expect(result.content[0].text).toBe('typed!');
    });

    it('should infer number params in handler args', async () => {
        const tool = defineTool('math', {
            actions: {
                add: {
                    params: { a: 'number', b: 'number' },
                    handler: async (_ctx, args) => {
                        const sum: number = args.a + args.b;
                        return success(String(sum));
                    },
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'add', a: 3, b: 7 });
        expect(result.content[0].text).toBe('10');
    });

    it('should infer boolean params in handler args', async () => {
        const tool = defineTool('flags', {
            actions: {
                toggle: {
                    params: { enabled: 'boolean' },
                    handler: async (_ctx, args) => {
                        const flag: boolean = args.enabled;
                        return success(flag ? 'ON' : 'OFF');
                    },
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'toggle', enabled: true });
        expect(result.content[0].text).toBe('ON');
    });

    it('should infer object-style number params with constraints', async () => {
        const tool = defineTool('data', {
            actions: {
                fetch: {
                    params: {
                        limit: { type: 'number', min: 1, max: 100 },
                        page: { type: 'number', int: true, optional: true },
                    },
                    handler: async (_ctx, args) => {
                        const limit: number = args.limit;
                        return success(String(limit));
                    },
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'fetch', limit: 50 });
        expect(result.content[0].text).toBe('50');
    });

    it('should merge shared params with action params', async () => {
        const tool = defineTool('projects', {
            shared: {
                workspace_id: 'string',
                region: { type: 'string', optional: true },
            },
            actions: {
                create: {
                    params: { name: 'string', description: 'string' },
                    handler: async (_ctx, args) => {
                        const wsId: string = args.workspace_id;
                        const name: string = args.name;
                        const desc: string = args.description;
                        return success(`${wsId}:${name}:${desc}`);
                    },
                },
            },
        });

        const result = await tool.execute(undefined, {
            action: 'create',
            workspace_id: 'ws_1',
            name: 'Test',
            description: 'A test project',
        });
        expect(result.content[0].text).toBe('ws_1:Test:A test project');
    });

    it('should handle actions without params (shared only)', async () => {
        const tool = defineTool('projects', {
            shared: { workspace_id: 'string' },
            actions: {
                list: {
                    readOnly: true,
                    handler: async (_ctx, args) => {
                        const wsId: string = args.workspace_id;
                        return success(`listing:${wsId}`);
                    },
                },
            },
        });

        const result = await tool.execute(undefined, {
            action: 'list',
            workspace_id: 'ws_1',
        });
        expect(result.content[0].text).toBe('listing:ws_1');
    });

    it('should handle actions with no shared and no params', async () => {
        const tool = defineTool('health', {
            actions: {
                check: {
                    readOnly: true,
                    handler: async (_ctx, _args) => success('healthy'),
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'check' });
        expect(result.content[0].text).toBe('healthy');
    });

    it('should type enum params correctly', async () => {
        const tool = defineTool('sorter', {
            actions: {
                sort: {
                    params: {
                        field: 'string',
                        direction: { enum: ['asc', 'desc'] as const },
                    },
                    handler: async (_ctx, args) => {
                        return success(`${args.field}:${args.direction}`);
                    },
                },
            },
        });

        const result = await tool.execute(undefined, {
            action: 'sort', field: 'name', direction: 'asc',
        });
        expect(result.content[0].text).toBe('name:asc');
    });

    it('should type multiple actions independently', async () => {
        const tool = defineTool('crud', {
            shared: { table: 'string' },
            actions: {
                read: {
                    params: { id: 'string' },
                    readOnly: true,
                    handler: async (_ctx, args) => {
                        const tbl: string = args.table;
                        const id: string = args.id;
                        return success(`read:${tbl}:${id}`);
                    },
                },
                write: {
                    params: { id: 'string', data: 'string' },
                    handler: async (_ctx, args) => {
                        const tbl: string = args.table;
                        const id: string = args.id;
                        const data: string = args.data;
                        return success(`write:${tbl}:${id}:${data}`);
                    },
                },
                delete: {
                    params: { id: 'string' },
                    destructive: true,
                    handler: async (_ctx, args) => {
                        return success(`delete:${args.table}:${args.id}`);
                    },
                },
            },
        });

        const r1 = await tool.execute(undefined, { action: 'read', table: 'users', id: '1' });
        const r2 = await tool.execute(undefined, { action: 'write', table: 'users', id: '1', data: 'john' });
        const r3 = await tool.execute(undefined, { action: 'delete', table: 'users', id: '1' });

        expect(r1.content[0].text).toBe('read:users:1');
        expect(r2.content[0].text).toBe('write:users:1:john');
        expect(r3.content[0].text).toBe('delete:users:1');
    });
});

// ============================================================================
// 4. Typed handler args — createTool() path
// ============================================================================

describe('Typed handler args — createTool() path', () => {
    it('should type args from Zod schema in handler', async () => {
        const tool = createTool<void>('users')
            .action({
                name: 'create',
                schema: z.object({
                    email: z.string().email(),
                    name: z.string().min(1),
                    age: z.number().int().optional(),
                }),
                handler: async (_ctx, args) => {
                    const email: string = args.email;
                    const name: string = args.name;
                    const age: number | undefined = args.age;
                    return success(`${email}:${name}:${age ?? 'N/A'}`);
                },
            });

        const result = await tool.execute(undefined, {
            action: 'create',
            email: 'test@example.com',
            name: 'John',
            age: 30,
        });
        expect(result.content[0].text).toBe('test@example.com:John:30');
    });

    it('should merge commonSchema with action schema in handler args', async () => {
        const tool = createTool<void>('projects')
            .commonSchema(z.object({
                workspace_id: z.string(),
                org: z.string(),
            }))
            .action({
                name: 'list',
                schema: z.object({ limit: z.number().optional() }),
                handler: async (_ctx, args) => {
                    const ws: string = args.workspace_id;
                    const org: string = args.org;
                    const limit: number | undefined = args.limit;
                    return success(`${ws}:${org}:${limit ?? 'all'}`);
                },
            });

        const result = await tool.execute(undefined, {
            action: 'list',
            workspace_id: 'ws_1',
            org: 'vinkius',
            limit: 25,
        });
        expect(result.content[0].text).toBe('ws_1:vinkius:25');
    });

    it('should handle omitCommon correctly — omitted fields excluded from handler args type', async () => {
        const tool = createTool<void>('projects')
            .commonSchema(z.object({
                workspace_id: z.string(),
                region: z.string(),
            }))
            .action({
                name: 'global_list',
                schema: z.object({ status: z.string().optional() }),
                omitCommon: ['workspace_id', 'region'],
                handler: async (_ctx, args) => {
                    // omitted common fields should not be in args at runtime
                    return success(`status:${args.status ?? 'all'}`);
                },
            });

        const result = await tool.execute(undefined, {
            action: 'global_list',
            status: 'active',
        });
        expect(result.content[0].text).toBe('status:active');
    });

    it('should handle chained actions each accumulating into TRouterMap', () => {
        const tool = createTool<void>('multi')
            .action({
                name: 'a',
                schema: z.object({ x: z.number() }),
                handler: async () => success('a'),
            })
            .action({
                name: 'b',
                schema: z.object({ y: z.string() }),
                handler: async () => success('b'),
            })
            .action({
                name: 'c',
                schema: z.object({ z: z.boolean() }),
                handler: async () => success('c'),
            });

        const reg = createTypedRegistry<void>()(tool);
        type R = InferRouter<typeof reg>;

        // All three actions must be in the router map
        const _a: R['multi.a'] = { x: 1 };
        const _b: R['multi.b'] = { y: 'hello' };
        const _c: R['multi.c'] = { z: true };

        expect(_a.x).toBe(1);
        expect(_b.y).toBe('hello');
        expect(_c.z).toBe(true);
    });

    it('should handle complex Zod types (arrays, nested objects, transforms)', async () => {
        const tool = createTool<void>('analytics')
            .action({
                name: 'query',
                schema: z.object({
                    metrics: z.array(z.string()),
                    filters: z.object({
                        from: z.string(),
                        to: z.string(),
                    }),
                    limit: z.number().optional(),
                }),
                handler: async (_ctx, args) => {
                    return success(`${args.metrics.length}:${args.filters.from}-${args.filters.to}`);
                },
            });

        const result = await tool.execute(undefined, {
            action: 'query',
            metrics: ['cpu', 'memory'],
            filters: { from: '2026-01-01', to: '2026-02-01' },
        });
        expect(result.content[0].text).toBe('2:2026-01-01-2026-02-01');
    });
});

// ============================================================================
// 5. Backward Compatibility — No Regressions
// ============================================================================

describe('Backward compatibility', () => {
    it('should allow GroupedToolBuilder without explicit TName/TRouterMap', () => {
        // Existing code that creates builders without the new generics
        const builder = new GroupedToolBuilder<void>('legacy');
        builder.action({ name: 'ping', handler: async () => success('pong') });

        expect(builder.getName()).toBe('legacy');
        expect(builder.getActionNames()).toContain('ping');
    });

    it('should allow ToolRegistry to work with non-typed builders', async () => {
        const registry = new ToolRegistry<void>();
        const builder = new GroupedToolBuilder<void>('test');
        builder.action({
            name: 'echo',
            handler: async (_ctx, args) => success(String((args as Record<string, unknown>)['msg'] ?? 'default')),
        });

        registry.register(builder);
        const result = await registry.routeCall(undefined, 'test', { action: 'echo', msg: 'hi' });
        expect(result.content[0].text).toBe('hi');
    });

    it('should work with createTool<Context>(name) without explicit TName', () => {
        // Even without capturing TName as literal, createTool should work
        const name = 'dynamic' as string;
        const tool = createTool<void>(name);
        tool.action({ name: 'x', handler: async () => success('ok') });

        expect(tool.getName()).toBe('dynamic');
    });

    it('should preserve defineTool return type as GroupedToolBuilder', () => {
        const tool = defineTool('test', {
            actions: {
                run: { handler: async () => success('ok') },
            },
        });

        // Must be registerable in ToolRegistry
        const registry = new ToolRegistry<void>();
        registry.register(tool);
        expect(registry.has('test')).toBe(true);
    });

    it('should still support manual RouterMap definition for FusionClient', async () => {
        // The old way: manually define RouterMap
        type ManualRouter = {
            'echo.say': { message: string };
        };

        const transport: FusionTransport = {
            callTool: async (_name, args) => success(String((args as Record<string, unknown>)['message'])),
        };

        const client = createFusionClient<ManualRouter>(transport);
        const result = await client.execute('echo.say', { message: 'manual' });
        expect(result.content[0].text).toBe('manual');
    });
});

// ============================================================================
// 6. Integration — Full Pipeline End-to-End
// ============================================================================

describe('Full pipeline integration', () => {
    it('createTool → createTypedRegistry → InferRouter → FusionClient — complete flow', async () => {
        const projects = createTool<AppContext>('projects')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .action({
                name: 'list',
                readOnly: true,
                schema: z.object({ status: z.string().optional() }),
                handler: async (_ctx, args) => success(`list:${args.workspace_id}:${args.status ?? 'all'}`),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => success(`create:${args.workspace_id}:${args.name}`),
            })
            .action({
                name: 'delete',
                destructive: true,
                schema: z.object({ project_id: z.string() }),
                handler: async (_ctx, args) => success(`delete:${args.workspace_id}:${args.project_id}`),
            });

        const billing = createTool<AppContext>('billing')
            .action({
                name: 'charge',
                schema: z.object({ amount: z.number(), currency: z.string() }),
                handler: async (_ctx, args) => success(`charge:${args.amount}:${args.currency}`),
            });

        const reg = createTypedRegistry<AppContext>()(projects, billing);
        type AppRouter = InferRouter<typeof reg>;

        const ctx: AppContext = {
            userId: 'u_test',
            db: { query: async () => [] },
        };

        const transport: FusionTransport = {
            callTool: (name, args) => reg.registry.routeCall(ctx, name, args),
        };

        const client = createFusionClient<AppRouter>(transport);

        // All calls are type-safe
        const r1 = await client.execute('projects.list', { workspace_id: 'ws_1', status: 'active' });
        const r2 = await client.execute('projects.create', { workspace_id: 'ws_1', name: 'NewProject' });
        const r3 = await client.execute('projects.delete', { workspace_id: 'ws_1', project_id: 'p_42' });
        const r4 = await client.execute('billing.charge', { amount: 99.99, currency: 'EUR' });

        expect(r1.content[0].text).toBe('list:ws_1:active');
        expect(r2.content[0].text).toBe('create:ws_1:NewProject');
        expect(r3.content[0].text).toBe('delete:ws_1:p_42');
        expect(r4.content[0].text).toBe('charge:99.99:EUR');
    });

    it('defineTool → ToolRegistry → routeCall — handler receives typed args', async () => {
        const received: Record<string, unknown>[] = [];

        const tool = defineTool('capture', {
            shared: { tenant: 'string' },
            actions: {
                log: {
                    params: { level: 'string', message: 'string' },
                    handler: async (_ctx, args) => {
                        received.push({
                            tenant: args.tenant,
                            level: args.level,
                            message: args.message,
                        });
                        return success('logged');
                    },
                },
            },
        });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        await registry.routeCall(undefined, 'capture', {
            action: 'log',
            tenant: 'acme',
            level: 'error',
            message: 'Something broke',
        });

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            tenant: 'acme',
            level: 'error',
            message: 'Something broke',
        });
    });

    it('should validate args at runtime even with compile-time types', async () => {
        const tool = createTool<void>('strict')
            .action({
                name: 'run',
                schema: z.object({ count: z.number().min(1).max(100) }),
                handler: async (_ctx, args) => success(String(args.count)),
            });

        // Valid args
        const r1 = await tool.execute(undefined, { action: 'run', count: 50 });
        expect(r1.content[0].text).toBe('50');

        // Invalid args — still fails at runtime even though types "look ok"
        const r2 = await tool.execute(undefined, { action: 'run', count: 200 });
        expect(r2.isError).toBe(true);
    });

    it('should reject unknown fields at runtime (.strict() security boundary)', async () => {
        const tool = createTool<void>('secure')
            .action({
                name: 'run',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => {
                    const keys = Object.keys(args);
                    return success(keys.sort().join(','));
                },
            });

        const result = await tool.execute(undefined, {
            action: 'run',
            name: 'legit',
            injected: 'malicious',
        });

        // .strict() rejects unknown fields — 'injected' causes a validation error
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('injected');
    });
});

// ============================================================================
// 7. Edge Cases & Adversarial Scenarios
// ============================================================================

describe('Edge cases & adversarial', () => {
    it('should handle tools with single-character names', () => {
        const a = createTool<void>('a')
            .action({
                name: 'x',
                schema: z.object({ v: z.string() }),
                handler: async () => success('ok'),
            });

        const reg = createTypedRegistry<void>()(a);
        type R = InferRouter<typeof reg>;

        const _args: R['a.x'] = { v: 'val' };
        expect(_args.v).toBe('val');
    });

    it('should handle large number of builders (10+)', () => {
        const builders = Array.from({ length: 10 }, (_, i) =>
            createTool<void>(`tool_${i}`)
                .action({ name: 'run', handler: async () => success(`ok_${i}`) })
        );

        const reg = createTypedRegistry<void>()(...builders);
        expect(reg.registry.size).toBe(10);

        for (let i = 0; i < 10; i++) {
            expect(reg.registry.has(`tool_${i}`)).toBe(true);
        }
    });

    it('should handle tools with many actions (20+)', async () => {
        let builder = createTool<void>('mega');
        for (let i = 0; i < 20; i++) {
            builder = builder.action({
                name: `action_${i}`,
                handler: async () => success(`result_${i}`),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any;
        }

        expect(builder.getActionNames()).toHaveLength(20);

        const result = await builder.execute(undefined, { action: 'action_5' });
        expect(result.content[0].text).toBe('result_5');
    });

    it('should handle defineTool with Zod schema instead of ParamsMap', async () => {
        const tool = defineTool('zod_direct', {
            actions: {
                run: {
                    params: z.object({ x: z.number() }),
                    handler: async (_ctx, args) => {
                        // When params is a ZodObject (not ParamsMap), args fall back to wider type
                        return success(String((args as Record<string, unknown>)['x']));
                    },
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'run', x: 42 });
        expect(result.content[0].text).toBe('42');
    });

    it('should handle empty createTypedRegistry with InferRouter', () => {
        const reg = createTypedRegistry<void>()();
        type R = InferRouter<typeof reg>;

        // Empty registry → empty router (Record<string, never> intersection)
        // This is a type-level check — no runtime assertion needed
        expect(reg.registry.size).toBe(0);
    });

    it('should handle context passing through the full pipeline', async () => {
        interface CustomCtx { role: 'admin' | 'user'; }

        const tool = createTool<CustomCtx>('rbac')
            .action({
                name: 'check',
                schema: z.object({ resource: z.string() }),
                handler: async (ctx, args) => {
                    return success(`${ctx.role}:${args.resource}`);
                },
            });

        const reg = createTypedRegistry<CustomCtx>()(tool);
        const result = await reg.registry.routeCall(
            { role: 'admin' },
            'rbac',
            { action: 'check', resource: 'secrets' },
        );

        expect(result.content[0].text).toBe('admin:secrets');
    });

    it('should handle error responses without breaking types', async () => {
        const tool = createTool<void>('fallible')
            .action({
                name: 'fail',
                schema: z.object({ should_fail: z.boolean() }),
                handler: async (_ctx, args) => {
                    if (args.should_fail) return error('Intentional failure');
                    return success('ok');
                },
            });

        const r1 = await tool.execute(undefined, { action: 'fail', should_fail: true });
        expect(r1.isError).toBe(true);

        const r2 = await tool.execute(undefined, { action: 'fail', should_fail: false });
        expect(r2.isError).toBeUndefined();
        expect(r2.content[0].text).toBe('ok');
    });

    it('should handle concurrent registry route calls without interference', async () => {
        const counter = { value: 0 };

        const tool = createTool<void>('concurrent')
            .action({
                name: 'increment',
                schema: z.object({ amount: z.number() }),
                handler: async (_ctx, args) => {
                    counter.value += args.amount;
                    return success(String(counter.value));
                },
            });

        const reg = createTypedRegistry<void>()(tool);

        // Fire 10 concurrent calls
        const promises = Array.from({ length: 10 }, (_, i) =>
            reg.registry.routeCall(undefined, 'concurrent', {
                action: 'increment',
                amount: 1,
            })
        );

        await Promise.all(promises);
        expect(counter.value).toBe(10);
    });
});
