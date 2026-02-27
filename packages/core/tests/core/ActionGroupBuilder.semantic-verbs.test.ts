/**
 * Ultra-Robust Tests for ActionGroupBuilder Semantic Verbs
 *
 * .query(name, handler)    → readOnly: true
 * .action(name, handler)   → neither readOnly nor destructive
 * .mutation(name, handler)  → destructive: true
 *
 * Covers:
 *  - Metadata correctness per verb
 *  - Handler execution with context and args
 *  - Middleware integration (group-scoped, global, stacking)
 *  - Validation (commonSchema, action schema)
 *  - Error handling (throws, non-Error throws)
 *  - User semantic mistakes (duplicate names, dots, wrong verb choice)
 *  - Complex real-world domain scenarios
 *  - Annotation aggregation for mixed verb groups
 *  - omitCommon interactions
 *  - Frozen builder behavior
 *  - Flat vs grouped exposition
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { GroupedToolBuilder } from '../../src/core/index.js';
import { success, error } from '../../src/core/response.js';
import type { ToolResponse, MiddlewareFn } from '../../src/core/index.js';

// ── Realistic Context Types ─────────────────────────────

interface AppContext {
    userId: string;
    tenantId: string;
    role: 'admin' | 'user' | 'viewer';
    db: {
        users: {
            findMany: () => Promise<Array<{ id: string; name: string }>>;
            findById: (id: string) => Promise<{ id: string; name: string } | null>;
            create:   (data: { email: string; role: string }) => Promise<{ id: string }>;
            ban:      (id: string, reason: string) => Promise<void>;
            delete:   (id: string) => Promise<void>;
        };
        orders: {
            findMany: (filter: Record<string, unknown>) => Promise<Array<{ id: string; total: number }>>;
            cancel:   (id: string) => Promise<void>;
            refund:   (id: string, amount: number) => Promise<{ refundId: string }>;
        };
        audit: {
            log: (entry: { actor: string; action: string; target: string }) => Promise<void>;
        };
    };
}

const mockDb: AppContext['db'] = {
    users: {
        findMany: vi.fn(async () => [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }]),
        findById: vi.fn(async (id) => id === 'u1' ? { id: 'u1', name: 'Alice' } : null),
        create:   vi.fn(async () => ({ id: 'u3' })),
        ban:      vi.fn(async () => {}),
        delete:   vi.fn(async () => {}),
    },
    orders: {
        findMany: vi.fn(async () => [{ id: 'o1', total: 99.99 }]),
        cancel:   vi.fn(async () => {}),
        refund:   vi.fn(async () => ({ refundId: 'r1' })),
    },
    audit: {
        log: vi.fn(async () => {}),
    },
};

function createCtx(overrides: Partial<AppContext> = {}): AppContext {
    return {
        userId: 'admin-001',
        tenantId: 'tenant-abc',
        role: 'admin',
        db: mockDb,
        ...overrides,
    };
}

const noopHandler = async (): Promise<ToolResponse> => success('ok');

// ============================================================================
// 1. Metadata Correctness — Each verb sets the right flags
// ============================================================================

describe('Semantic Verbs — Metadata Correctness', () => {
    it('.query() sets readOnly:true, no destructive flag', () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User management', (g) => g
                .query('list', async (ctx) =>
                    success(JSON.stringify(await ctx.db.users.findMany()))
                )
            );

        const meta = builder.getActionMetadata();
        expect(meta).toHaveLength(1);
        expect(meta[0]!.key).toBe('users.list');
        expect(meta[0]!.readOnly).toBe(true);
        expect(meta[0]!.destructive).toBe(false);
        expect(meta[0]!.idempotent).toBe(false);
        expect(meta[0]!.groupName).toBe('users');
    });

    it('.action() sets neither readOnly nor destructive', () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User management', (g) => g
                .action('invite', async (ctx, args) => {
                    const user = await ctx.db.users.create({
                        email: args.email as string,
                        role: args.role as string,
                    });
                    return success(`Invited user ${user.id}`);
                })
            );

        const meta = builder.getActionMetadata();
        expect(meta[0]!.readOnly).toBe(false);
        expect(meta[0]!.destructive).toBe(false);
    });

    it('.mutation() sets destructive:true, no readOnly flag', () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User management', (g) => g
                .mutation('ban', async (ctx, args) => {
                    await ctx.db.users.ban(args.user_id as string, args.reason as string);
                    return success('User banned');
                })
            );

        const meta = builder.getActionMetadata();
        expect(meta[0]!.destructive).toBe(true);
        expect(meta[0]!.readOnly).toBe(false);
    });

    it('preserves group description on each action metadata', () => {
        const builder = new GroupedToolBuilder<AppContext>('admin')
            .group('billing', 'Revenue & subscription management', (g) => g
                .query('invoices', noopHandler)
                .action('upgrade', noopHandler)
                .mutation('refund', noopHandler)
            );

        builder.getActionMetadata().forEach((m) => {
            expect(m.groupName).toBe('billing');
        });
    });
});

// ============================================================================
// 2. Handler Execution — Real domain logic with context
// ============================================================================

describe('Semantic Verbs — Handler Execution', () => {
    it('.query() handler receives context and returns data', async () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User mgmt', (g) => g
                .query('list', async (ctx) => {
                    const users = await ctx.db.users.findMany();
                    return success(JSON.stringify({
                        tenant: ctx.tenantId,
                        count: users.length,
                        users,
                    }));
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(createCtx(), { action: 'users.list' });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0]!.text as string);
        expect(data.tenant).toBe('tenant-abc');
        expect(data.count).toBe(2);
        expect(data.users).toHaveLength(2);
    });

    it('.action() handler receives context + args and creates a resource', async () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User mgmt', (g) => g
                .action('invite', async (ctx, args) => {
                    const user = await ctx.db.users.create({
                        email: args.email as string,
                        role: args.role as string,
                    });
                    return success(`Created user ${user.id} for tenant ${ctx.tenantId}`);
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(createCtx(), {
            action: 'users.invite',
            email: 'bob@example.com',
            role: 'editor',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]!.text).toContain('Created user u3');
        expect(result.content[0]!.text).toContain('tenant-abc');
    });

    it('.mutation() handler executes destructive operation', async () => {
        const banFn = vi.fn(async () => {});
        const auditFn = vi.fn(async () => {});

        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User mgmt', (g) => g
                .mutation('ban', async (ctx, args) => {
                    await banFn(args.user_id, args.reason);
                    await auditFn({
                        actor: ctx.userId,
                        action: 'ban',
                        target: args.user_id,
                    });
                    return success(`User ${args.user_id} banned by ${ctx.userId}`);
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(createCtx(), {
            action: 'users.ban',
            user_id: 'u42',
            reason: 'Spam',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]!.text).toContain('u42 banned by admin-001');
        expect(banFn).toHaveBeenCalledWith('u42', 'Spam');
        expect(auditFn).toHaveBeenCalledOnce();
    });

    it('handler error is wrapped in error response, not thrown', async () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User mgmt', (g) => g
                .query('get', async (ctx, args) => {
                    const user = await ctx.db.users.findById(args.id as string);
                    if (!user) throw new Error(`User ${args.id} not found`);
                    return success(JSON.stringify(user));
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(createCtx(), {
            action: 'users.get',
            id: 'nonexistent',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('User nonexistent not found');
    });

    it('handler throwing non-Error value is caught gracefully', async () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('infra', 'Infrastructure', (g) => g
                .mutation('reboot', async () => {
                    throw 'DEVICE_UNREACHABLE';
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(createCtx(), { action: 'infra.reboot' });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('DEVICE_UNREACHABLE');
    });

    it('handler returning error() response propagates isError', async () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'User mgmt', (g) => g
                .action('invite', async (_ctx, args) => {
                    if (!args.email) return error('Email is required');
                    return success('Invited');
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(createCtx(), { action: 'users.invite' });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('Email is required');
    });
});

// ============================================================================
// 3. Middleware Integration — Group-scoped, global, stacking
// ============================================================================

describe('Semantic Verbs — Middleware Integration', () => {
    it('group middleware runs before every verb type in the group', async () => {
        const log: string[] = [];

        const authGuard: MiddlewareFn<AppContext> = async (ctx, _args, next) => {
            log.push(`auth:${ctx.role}`);
            if (ctx.role === 'viewer') return error('Forbidden');
            return next();
        };

        const builder = new GroupedToolBuilder<AppContext>('admin')
            .group('users', 'User operations', (g) => g
                .use(authGuard)
                .query('list', async () => { log.push('query:list'); return success('users'); })
                .action('invite', async () => { log.push('action:invite'); return success('invited'); })
                .mutation('ban', async () => { log.push('mutation:ban'); return success('banned'); })
            );

        builder.buildToolDefinition();

        // Test query
        await builder.execute(createCtx({ role: 'admin' }), { action: 'users.list' });
        expect(log).toEqual(['auth:admin', 'query:list']);

        log.length = 0;

        // Test action
        await builder.execute(createCtx({ role: 'user' }), { action: 'users.invite' });
        expect(log).toEqual(['auth:user', 'action:invite']);

        log.length = 0;

        // Test mutation
        await builder.execute(createCtx({ role: 'admin' }), { action: 'users.ban' });
        expect(log).toEqual(['auth:admin', 'mutation:ban']);
    });

    it('group middleware can short-circuit (deny access)', async () => {
        const rbacGuard: MiddlewareFn<AppContext> = async (ctx, _args, _next) => {
            if (ctx.role !== 'admin') return error(`Role "${ctx.role}" insufficient`);
            return _next();
        };

        const builder = new GroupedToolBuilder<AppContext>('admin')
            .group('danger', 'Destructive operations', (g) => g
                .use(rbacGuard)
                .mutation('delete_all', async () => success('Everything deleted'))
            );

        builder.buildToolDefinition();

        const denied = await builder.execute(
            createCtx({ role: 'viewer' }),
            { action: 'danger.delete_all' },
        );
        expect(denied.isError).toBe(true);
        expect(denied.content[0]!.text).toContain('"viewer" insufficient');

        const allowed = await builder.execute(
            createCtx({ role: 'admin' }),
            { action: 'danger.delete_all' },
        );
        expect(allowed.isError).toBeUndefined();
    });

    it('global + group middleware stack in correct order', async () => {
        const log: string[] = [];

        const globalMw: MiddlewareFn<AppContext> = async (_ctx, _args, next) => {
            log.push('global');
            return next();
        };

        const groupMw: MiddlewareFn<AppContext> = async (_ctx, _args, next) => {
            log.push('group');
            return next();
        };

        const builder = new GroupedToolBuilder<AppContext>('platform')
            .use(globalMw)
            .group('users', 'Users', (g) => g
                .use(groupMw)
                .query('list', async () => { log.push('handler'); return success('ok'); })
            );

        builder.buildToolDefinition();
        await builder.execute(createCtx(), { action: 'users.list' });

        expect(log).toEqual(['global', 'group', 'handler']);
    });

    it('multiple group middlewares stack in declaration order', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('secure', 'Secured area', (g) => g
                .use(async (_ctx, _args, next) => { log.push('mw1'); return next(); })
                .use(async (_ctx, _args, next) => { log.push('mw2'); return next(); })
                .use(async (_ctx, _args, next) => { log.push('mw3'); return next(); })
                .query('data', async () => { log.push('handler'); return success('ok'); })
            );

        builder.buildToolDefinition();
        await builder.execute(createCtx(), { action: 'secure.data' });

        expect(log).toEqual(['mw1', 'mw2', 'mw3', 'handler']);
    });

    it('middleware on one group does NOT affect other groups', async () => {
        const log: string[] = [];

        const secretGuard: MiddlewareFn<AppContext> = async (_ctx, _args, next) => {
            log.push('secret-guard');
            return next();
        };

        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('public', 'Public API', (g) => g
                .query('health', async () => { log.push('health'); return success('ok'); })
            )
            .group('secret', 'Internal API', (g) => g
                .use(secretGuard)
                .query('metrics', async () => { log.push('metrics'); return success('ok'); })
            );

        builder.buildToolDefinition();

        // Public group — no middleware
        await builder.execute(createCtx(), { action: 'public.health' });
        expect(log).toEqual(['health']);

        log.length = 0;

        // Secret group — has middleware
        await builder.execute(createCtx(), { action: 'secret.metrics' });
        expect(log).toEqual(['secret-guard', 'metrics']);
    });
});

// ============================================================================
// 4. Validation — commonSchema + semantic verbs
// ============================================================================

describe('Semantic Verbs — Schema Validation', () => {
    it('commonSchema is enforced on .query() calls', async () => {
        const builder = new GroupedToolBuilder<AppContext>('saas')
            .commonSchema(z.object({
                workspace_id: z.string().min(3),
                session_token: z.string(),
            }))
            .group('reports', 'Reports', (g) => g
                .query('revenue', noopHandler)
            );

        builder.buildToolDefinition();

        // Missing both common fields → validation error
        const result = await builder.execute(createCtx(), { action: 'reports.revenue' });
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('workspace_id');
        expect(result.content[0]!.text).toContain('session_token');
    });

    it('commonSchema is enforced on .mutation() calls', async () => {
        const builder = new GroupedToolBuilder<AppContext>('saas')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .group('data', 'Data ops', (g) => g
                .mutation('purge', noopHandler)
            );

        builder.buildToolDefinition();

        // Missing workspace_id
        const result = await builder.execute(createCtx(), { action: 'data.purge' });
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('workspace_id');
    });

    it('commonSchema + action schema merge for .action() with config', async () => {
        const builder = new GroupedToolBuilder<AppContext>('saas')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .group('users', 'Users', (g) => g
                .action({
                    name: 'invite',
                    schema: z.object({ email: z.string().email() }),
                    handler: async (_ctx, args) =>
                        success(`Invited ${args.email} to ${args.workspace_id}`),
                })
            );

        builder.buildToolDefinition();

        // Both valid
        const ok = await builder.execute(createCtx(), {
            action: 'users.invite',
            workspace_id: 'ws-1',
            email: 'alice@test.com',
        });
        expect(ok.isError).toBeUndefined();
        expect(ok.content[0]!.text).toContain('Invited alice@test.com to ws-1');

        // Invalid email format
        const bad = await builder.execute(createCtx(), {
            action: 'users.invite',
            workspace_id: 'ws-1',
            email: 'not-an-email',
        });
        expect(bad.isError).toBe(true);
        expect(bad.content[0]!.text).toContain('email');
    });

    it('unknown action returns descriptive error with available actions', async () => {
        const builder = new GroupedToolBuilder<AppContext>('platform')
            .group('users', 'Users', (g) => g
                .query('list', noopHandler)
                .action('invite', noopHandler)
                .mutation('ban', noopHandler)
            );

        builder.buildToolDefinition();

        const result = await builder.execute(createCtx(), {
            action: 'users.typo_action',
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('UNKNOWN_ACTION');
        expect(result.content[0]!.text).toContain('users.list');
        expect(result.content[0]!.text).toContain('users.invite');
        expect(result.content[0]!.text).toContain('users.ban');
    });
});

// ============================================================================
// 5. User Semantic Mistakes — Edge cases and misuse patterns
// ============================================================================

describe('Semantic Verbs — User Mistakes & Edge Cases', () => {
    it('rejects dot in action name via .query()', () => {
        expect(() => {
            new GroupedToolBuilder('test')
                .group('g', 'group', (g) => g.query('users.list', noopHandler));
        }).toThrow('must not contain dots');
    });

    it('rejects dot in action name via .action(name, handler)', () => {
        expect(() => {
            new GroupedToolBuilder('test')
                .group('g', 'group', (g) => g.action('v2.create', noopHandler));
        }).toThrow('must not contain dots');
    });

    it('rejects dot in action name via .mutation()', () => {
        expect(() => {
            new GroupedToolBuilder('test')
                .group('g', 'group', (g) => g.mutation('data.purge', noopHandler));
        }).toThrow('must not contain dots');
    });

    it('rejects mixing flat .action() with .group() using semantic verbs', () => {
        const builder = new GroupedToolBuilder('test')
            .group('g', 'Group', (g) => g.query('list', noopHandler));

        expect(() => {
            builder.action({ name: 'flat', handler: noopHandler });
        }).toThrow('Cannot use .action() and .group()');
    });

    it('rejects .group() after flat .action() even with verbs', () => {
        const builder = new GroupedToolBuilder('test')
            .action({ name: 'flat', handler: noopHandler });

        expect(() => {
            builder.group('g', 'Group', (g) => g.query('list', noopHandler));
        }).toThrow('Cannot use .group() and .action()');
    });

    it('allows duplicate action names in DIFFERENT groups (compound keys differ)', () => {
        const builder = new GroupedToolBuilder('platform')
            .group('users', 'Users', (g) => g.query('list', noopHandler))
            .group('orders', 'Orders', (g) => g.query('list', noopHandler));

        const names = builder.getActionNames();
        expect(names).toEqual(['users.list', 'orders.list']);
    });

    it('empty group name still generates valid compound keys', () => {
        // While unusual, this shouldn't crash — it generates ".list" as key
        const builder = new GroupedToolBuilder('test')
            .group('', 'Empty name', (g) => g.query('list', noopHandler));

        const names = builder.getActionNames();
        expect(names).toEqual(['.list']);
    });

    it('handles very long action names without crashing', () => {
        const longName = 'a'.repeat(200);
        const builder = new GroupedToolBuilder('test')
            .group('g', 'group', (g) => g.query(longName, noopHandler));

        const meta = builder.getActionMetadata();
        expect(meta[0]!.key).toBe(`g.${longName}`);
    });

    it('semantic verbs work inside callback-style group configurator', () => {
        // Users might define the callback separately
        const configureUsers = (g: any) => g
            .query('list', noopHandler)
            .action('invite', noopHandler)
            .mutation('ban', noopHandler);

        const builder = new GroupedToolBuilder('platform')
            .group('users', 'User management', configureUsers);

        expect(builder.getActionNames()).toEqual([
            'users.list', 'users.invite', 'users.ban',
        ]);
    });

    it('builder freezes after build — semantic verbs through group should fail', () => {
        const builder = new GroupedToolBuilder('test')
            .group('g', 'Group', (g) => g.query('list', noopHandler));

        builder.buildToolDefinition();

        expect(() => {
            builder.group('g2', 'Another', (g) => g.query('more', noopHandler));
        }).toThrow('frozen');
    });
});

// ============================================================================
// 6. Complex Real-World Scenario: Multi-Tenant SaaS Admin Panel
// ============================================================================

describe('Scenario — Multi-Tenant SaaS Admin Panel', () => {
    function buildAdminTool() {
        const auditLog: Array<{ actor: string; verb: string; target: string }> = [];

        const auditMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
            const result = await next();
            auditLog.push({
                actor: ctx.userId,
                verb: args.action as string,
                target: (args.user_id ?? args.order_id ?? 'N/A') as string,
            });
            return result;
        };

        const builder = new GroupedToolBuilder<AppContext>('admin')
            .description('Multi-tenant SaaS administration panel')
            .commonSchema(z.object({ workspace_id: z.string() }))
            .use(auditMiddleware)
            .group('users', 'User lifecycle management', (g) => g
                .query('list', async (ctx) =>
                    success(JSON.stringify(await ctx.db.users.findMany()))
                )
                .query('get', async (ctx, args) => {
                    const user = await ctx.db.users.findById(args.user_id as string);
                    if (!user) return error(`User ${args.user_id} not found`);
                    return success(JSON.stringify(user));
                })
                .action('invite', async (ctx, args) => {
                    const user = await ctx.db.users.create({
                        email: args.email as string,
                        role: args.role as string,
                    });
                    return success(`Invited user ${user.id}`);
                })
                .mutation('deactivate', async (_ctx, args) => {
                    await mockDb.users.delete(args.user_id as string);
                    return success(`User ${args.user_id} deactivated`);
                })
            )
            .group('orders', 'Order management', (g) => g
                .query('list', async () =>
                    success(JSON.stringify(await mockDb.orders.findMany({})))
                )
                .action('update_status', async (_ctx, args) =>
                    success(`Order ${args.order_id} → ${args.status}`)
                )
                .mutation('cancel', async (_ctx, args) => {
                    await mockDb.orders.cancel(args.order_id as string);
                    return success(`Order ${args.order_id} cancelled`);
                })
                .mutation('refund', async (_ctx, args) => {
                    const r = await mockDb.orders.refund(
                        args.order_id as string,
                        args.amount as number,
                    );
                    return success(`Refund ${r.refundId} issued`);
                })
            )
            .group('audit', 'Compliance and audit trail', (g) => g
                .query('logs', async () =>
                    success(JSON.stringify(auditLog))
                )
                .query('export', async () =>
                    success('CSV export generated')
                )
            );

        return { builder, auditLog };
    }

    it('generates correct action names across all groups', () => {
        const { builder } = buildAdminTool();
        expect(builder.getActionNames()).toEqual([
            'users.list', 'users.get', 'users.invite', 'users.deactivate',
            'orders.list', 'orders.update_status', 'orders.cancel', 'orders.refund',
            'audit.logs', 'audit.export',
        ]);
    });

    it('generates correct metadata for each verb type', () => {
        const { builder } = buildAdminTool();
        const meta = builder.getActionMetadata();

        // Queries: readOnly
        const queries = meta.filter((m) => m.readOnly);
        expect(queries.map((q) => q.key)).toEqual([
            'users.list', 'users.get', 'orders.list', 'audit.logs', 'audit.export',
        ]);

        // Mutations: destructive
        const mutations = meta.filter((m) => m.destructive);
        expect(mutations.map((m) => m.key)).toEqual([
            'users.deactivate', 'orders.cancel', 'orders.refund',
        ]);

        // Actions: neither
        const actions = meta.filter((m) => !m.readOnly && !m.destructive);
        expect(actions.map((a) => a.key)).toEqual([
            'users.invite', 'orders.update_status',
        ]);
    });

    it('enforces commonSchema on all verb types', async () => {
        const { builder } = buildAdminTool();
        builder.buildToolDefinition();

        // Missing workspace_id on query
        const r1 = await builder.execute(createCtx(), { action: 'users.list' });
        expect(r1.isError).toBe(true);
        expect(r1.content[0]!.text).toContain('workspace_id');

        // Missing workspace_id on mutation
        const r2 = await builder.execute(createCtx(), { action: 'orders.cancel' });
        expect(r2.isError).toBe(true);

        // Valid workspace_id on query
        const r3 = await builder.execute(createCtx(), {
            action: 'users.list',
            workspace_id: 'ws-123',
        });
        expect(r3.isError).toBeUndefined();
    });

    it('generates tool annotation: destructive + not readOnly (mixed)', () => {
        const { builder } = buildAdminTool();
        const tool = builder.buildToolDefinition();
        const ann = (tool as any).annotations;

        // Mixed actions → readOnly is false
        expect(ann.readOnlyHint).toBe(false);
        // Has mutations → destructive is true
        expect(ann.destructiveHint).toBe(true);
    });

    it('description includes modules with action names', () => {
        const { builder } = buildAdminTool();
        const tool = builder.buildToolDefinition();

        expect(tool.description).toContain('Modules:');
        expect(tool.description).toContain('users');
        expect(tool.description).toContain('orders');
        expect(tool.description).toContain('audit');
    });

    it('global audit middleware records all calls across groups', async () => {
        const { builder, auditLog } = buildAdminTool();
        builder.buildToolDefinition();

        const r1 = await builder.execute(createCtx(), {
            action: 'users.list',
            workspace_id: 'ws-1',
        });
        expect(r1.isError).toBeUndefined();

        const r2 = await builder.execute(createCtx({ userId: 'ops-bot' }), {
            action: 'orders.list',
            workspace_id: 'ws-1',
        });
        expect(r2.isError).toBeUndefined();

        expect(auditLog).toHaveLength(2);
        expect(auditLog[0]!.actor).toBe('admin-001');
        expect(auditLog[0]!.verb).toBe('users.list');
        expect(auditLog[1]!.actor).toBe('ops-bot');
        expect(auditLog[1]!.verb).toBe('orders.list');
    });
});

// ============================================================================
// 7. Complex Scenario: IoT Fleet Management
// ============================================================================

describe('Scenario — IoT Fleet Management', () => {
    interface IoTContext {
        operatorId: string;
        fleetId: string;
    }

    it('complex multi-group with mixed verbs + middleware + omitCommon', () => {
        const log: string[] = [];

        const rateLimiter: MiddlewareFn<IoTContext> = async (_ctx, _args, next) => {
            log.push('rate-limit');
            return next();
        };

        const builder = new GroupedToolBuilder<IoTContext>('fleet')
            .description('IoT fleet management')
            .commonSchema(z.object({
                fleet_id: z.string(),
                api_key: z.string(),
            }))
            .use(rateLimiter)
            .group('telemetry', 'Sensor telemetry', (g) => g
                .query('latest', async () => success('temp: 22.5°C'))
                .query('history', async () => success('[22.1, 22.3, 22.5]'))
            )
            .group('commands', 'Device commands', (g) => g
                .action('configure', async (_ctx, args) =>
                    success(`Config updated: interval=${args.interval}`)
                )
                .mutation('reboot', async (_ctx, args) =>
                    success(`Device ${args.device_id} rebooting`)
                )
                .mutation('factory_reset', async (_ctx, args) =>
                    success(`Device ${args.device_id} wiped`)
                )
            )
            .group('firmware', 'OTA firmware updates', (g) => g
                .omitCommon('api_key')
                .query('check', async () => success('v2.3.1 available'))
                .action('schedule', async () => success('Update scheduled for 3 AM'))
                .mutation('force_update', async () => success('Force updating all devices'))
            );

        // Verify action names
        expect(builder.getActionNames()).toEqual([
            'telemetry.latest', 'telemetry.history',
            'commands.configure', 'commands.reboot', 'commands.factory_reset',
            'firmware.check', 'firmware.schedule', 'firmware.force_update',
        ]);

        // Verify metadata distribution
        const meta = builder.getActionMetadata();
        expect(meta.filter((m) => m.readOnly).map((m) => m.key)).toEqual([
            'telemetry.latest', 'telemetry.history', 'firmware.check',
        ]);
        expect(meta.filter((m) => m.destructive).map((m) => m.key)).toEqual([
            'commands.reboot', 'commands.factory_reset', 'firmware.force_update',
        ]);
        expect(meta.filter((m) => !m.readOnly && !m.destructive).map((m) => m.key)).toEqual([
            'commands.configure', 'firmware.schedule',
        ]);

        // Annotations: mixed → destructive=true, readOnly=false
        const tool = builder.buildToolDefinition();
        expect((tool as any).annotations.destructiveHint).toBe(true);
        expect((tool as any).annotations.readOnlyHint).toBe(false);
    });
});

// ============================================================================
// 8. Annotation Aggregation Edge Cases
// ============================================================================

describe('Semantic Verbs — Annotation Aggregation', () => {
    it('all queries → readOnlyHint=true, destructiveHint=false', () => {
        const builder = new GroupedToolBuilder('readonly')
            .group('a', 'A', (g) => g.query('x', noopHandler))
            .group('b', 'B', (g) => g.query('y', noopHandler).query('z', noopHandler));

        const tool = builder.buildToolDefinition();
        expect((tool as any).annotations.readOnlyHint).toBe(true);
        expect((tool as any).annotations.destructiveHint).toBe(false);
    });

    it('all mutations → readOnlyHint=false, destructiveHint=true', () => {
        const builder = new GroupedToolBuilder('destructive')
            .group('ops', 'Operations', (g) => g
                .mutation('wipe', noopHandler)
                .mutation('nuke', noopHandler)
            );

        const tool = builder.buildToolDefinition();
        expect((tool as any).annotations.readOnlyHint).toBe(false);
        expect((tool as any).annotations.destructiveHint).toBe(true);
    });

    it('all .action() → readOnlyHint=false, destructiveHint=false', () => {
        const builder = new GroupedToolBuilder('neutral')
            .group('ops', 'Operations', (g) => g
                .action('create', noopHandler)
                .action('update', noopHandler)
            );

        const tool = builder.buildToolDefinition();
        expect((tool as any).annotations.readOnlyHint).toBe(false);
        expect((tool as any).annotations.destructiveHint).toBe(false);
    });

    it('one mutation among queries → readOnly drops to false', () => {
        const builder = new GroupedToolBuilder('mostly-readonly')
            .group('ops', 'Operations', (g) => g
                .query('list', noopHandler)
                .query('get', noopHandler)
                .query('search', noopHandler)
                .mutation('delete', noopHandler)     // one destructive
            );

        const tool = builder.buildToolDefinition();
        expect((tool as any).annotations.readOnlyHint).toBe(false);
        expect((tool as any).annotations.destructiveHint).toBe(true);
    });

    it('[DESTRUCTIVE] marker appears in description for mutations', () => {
        const builder = new GroupedToolBuilder('tool')
            .description('Tool')
            .group('g', 'Group', (g) => g
                .query('safe', noopHandler)
                .mutation('dangerous', noopHandler)
            );

        const tool = builder.buildToolDefinition();
        expect(tool.description).toContain('[DESTRUCTIVE]');
    });
});

// ============================================================================
// 9. omitCommon + Semantic Verbs Interactions
// ============================================================================

describe('Semantic Verbs — omitCommon Interactions', () => {
    it('group-level omitCommon applies to all verbs in group', async () => {
        const builder = new GroupedToolBuilder<AppContext>('app')
            .commonSchema(z.object({
                workspace_id: z.string(),
                session_token: z.string(),
            }))
            .group('profile', 'Self-service (no workspace needed)', (g) => g
                .omitCommon('workspace_id')
                .query('me', async (ctx) => success(`User: ${ctx.userId}`))
                .action('update_avatar', async () => success('Avatar updated'))
                .mutation('delete_account', async () => success('Account deleted'))
            );

        builder.buildToolDefinition();

        // Only session_token is required (workspace_id is omitted)
        const result = await builder.execute(createCtx(), {
            action: 'profile.me',
            session_token: 'tok-123',
            // NO workspace_id — should be fine because omitted
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]!.text).toContain('User: admin-001');
    });

    it('omitCommon on group does NOT affect other groups', async () => {
        const builder = new GroupedToolBuilder<AppContext>('app')
            .commonSchema(z.object({
                workspace_id: z.string(),
            }))
            .group('profile', 'Profile', (g) => g
                .omitCommon('workspace_id')
                .query('me', noopHandler)
            )
            .group('projects', 'Projects', (g) => g
                .query('list', noopHandler)
            );

        builder.buildToolDefinition();

        // Profile: workspace_id omitted → OK without it
        const r1 = await builder.execute(createCtx(), { action: 'profile.me' });
        expect(r1.isError).toBeUndefined();

        // Projects: workspace_id still required
        const r2 = await builder.execute(createCtx(), { action: 'projects.list' });
        expect(r2.isError).toBe(true);
        expect(r2.content[0]!.text).toContain('workspace_id');
    });
});

// ============================================================================
// 10. Discriminator & Tool Definition Shape
// ============================================================================

describe('Semantic Verbs — Tool Definition Shape', () => {
    it('discriminator enum contains all compound keys from all verbs', () => {
        const builder = new GroupedToolBuilder('admin')
            .group('users', 'Users', (g) => g
                .query('list', noopHandler)
                .action('invite', noopHandler)
                .mutation('ban', noopHandler)
            )
            .group('billing', 'Billing', (g) => g
                .query('balance', noopHandler)
                .mutation('charge', noopHandler)
            );

        const tool = builder.buildToolDefinition();
        const actionEnum = (tool.inputSchema.properties as any).action.enum;

        expect(actionEnum).toEqual([
            'users.list', 'users.invite', 'users.ban',
            'billing.balance', 'billing.charge',
        ]);
    });

    it('custom discriminator works with semantic verbs', () => {
        const builder = new GroupedToolBuilder('api')
            .discriminator('method')
            .group('resources', 'Resources', (g) => g
                .query('get', noopHandler)
                .action('post', noopHandler)
                .mutation('delete', noopHandler)
            );

        const tool = builder.buildToolDefinition();

        expect((tool.inputSchema.properties as any).method).toBeDefined();
        expect((tool.inputSchema.properties as any).action).toBeUndefined();
        expect(tool.inputSchema.required).toContain('method');
    });

    it('missing discriminator at runtime returns helpful error', async () => {
        const builder = new GroupedToolBuilder<AppContext>('admin')
            .group('users', 'Users', (g) => g
                .query('list', noopHandler)
            );

        builder.buildToolDefinition();

        const result = await builder.execute(createCtx(), {});
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toContain('is missing');
    });

    it('previewPrompt works with all semantic verbs', () => {
        const builder = new GroupedToolBuilder('admin')
            .description('Admin panel')
            .group('users', 'Users', (g) => g
                .query('list', noopHandler)
                .action('invite', noopHandler)
                .mutation('ban', noopHandler)
            );

        const preview = builder.previewPrompt();

        expect(preview).toContain('MCP Tool Preview: admin');
        expect(preview).toContain('Actions: 3');
        expect(preview).toContain('list');
        expect(preview).toContain('invite');
        expect(preview).toContain('ban');
    });
});
