/**
 * Fluent API Tests — Canonical with*() + .handle() API
 *
 * Covers: f.query(), f.mutation(), f.action(), .withString(), .withNumber(),
 *         .withEnum(), .withBoolean(), .withArray(), .instructions(),
 *         .use(), .returns(), f.router(), .handle() execution.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { initFusion } from '../../src/core/initFusion.js';
import { success } from '../../src/core/response.js';

// ── Test Context ─────────────────────────────────────────

interface TestContext {
    db: {
        users: {
            findMany: (opts?: { take?: number }) => Array<{ id: string; name: string }>;
            delete: (opts: { where: { id: string } }) => void;
            update: (opts: { where: { id: string }; data: Record<string, unknown> }) => { id: string; name: string };
        };
    };
    userId: string;
}

const testCtx: TestContext = {
    db: {
        users: {
            findMany: (opts) => [
                { id: '1', name: 'Alice' },
                { id: '2', name: 'Bob' },
            ].slice(0, opts?.take ?? 2),
            delete: () => {},
            update: (opts) => ({ id: opts.where.id, name: String(opts.data.name ?? 'Updated') }),
        },
    },
    userId: 'u-1',
};

// ============================================================================
// Semantic Verbs — f.query(), f.mutation(), f.action()
// ============================================================================

describe('Semantic Verbs', () => {
    it('f.query() should create a tool with readOnly action', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('users.list')
            .describe('List users')
            .withOptionalNumber('limit', 'Max results')
            .handle(async (input, ctx) => {
                return success(ctx.db.users.findMany({ take: input.limit }));
            });

        expect(tool.getName()).toBe('users');
        expect(tool.getActionNames()).toContain('list');

        // Verify readOnly
        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
    });

    it('f.mutation() should create a tool with destructive action', async () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('users.delete')
            .describe('Delete a user')
            .withString('id', 'User ID')
            .handle(async (input, ctx) => {
                ctx.db.users.delete({ where: { id: input.id } });
                return success('Deleted');
            });

        expect(tool.getName()).toBe('users');
        expect(tool.getActionNames()).toContain('delete');

        const meta = tool.getActionMetadata();
        expect(meta[0]?.destructive).toBe(true);
    });

    it('f.action() should create a neutral tool (no readOnly/destructive)', async () => {
        const f = initFusion<TestContext>();

        const tool = f.action('users.update')
            .describe('Update user')
            .idempotent()
            .withString('id', 'User ID')
            .withOptionalString('name', 'New display name')
            .handle(async (input, ctx) => {
                return success(ctx.db.users.update({
                    where: { id: input.id },
                    data: { name: input.name },
                }));
            });

        expect(tool.getName()).toBe('users');
        expect(tool.getActionNames()).toContain('update');

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(false);
        expect(meta[0]?.destructive).toBe(false);
        expect(meta[0]?.idempotent).toBe(true);
    });

    it('tool without dot should use "default" action', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('health')
            .handle(async () => success('ok'));

        expect(tool.getName()).toBe('health');
        expect(tool.getActionNames()).toContain('default');
    });

    it('semantic overrides should take precedence', () => {
        const f = initFusion<TestContext>();

        // Query is readOnly by default, but we can add destructive too
        const tool = f.query('users.sync')
            .describe('Sync users (has side effects)')
            .readOnly() // explicit override (stays readOnly)
            .destructive() // add destructive
            .handle(async () => success('synced'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
        expect(meta[0]?.destructive).toBe(true);
    });
});

// ============================================================================
// Handler & Execution
// ============================================================================

describe('Handler Execution', () => {
    it('handler should receive typed (input, ctx)', async () => {
        const f = initFusion<TestContext>();

        let receivedInput: unknown;
        let receivedCtx: unknown;

        const tool = f.query('test.exec')
            .withString('msg', 'Message')
            .handle(async (input, ctx) => {
                receivedInput = input;
                receivedCtx = ctx;
                return success('done');
            });

        await tool.execute(testCtx, { action: 'exec', msg: 'hello' });

        expect(receivedInput).toEqual(expect.objectContaining({ msg: 'hello' }));
        expect(receivedCtx).toBe(testCtx);
    });

    it('implicit success() wrapping — return raw data', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('test.raw')
            .withNumber('limit', 'Max results')
            .handle(async (input, ctx) => {
                // Return raw data — framework should wrap with success()
                return ctx.db.users.findMany({ take: input.limit });
            });

        const result = await tool.execute(testCtx, { action: 'raw', limit: 1 });
        expect(result.content).toBeDefined();
        expect(result.content[0]?.text).toContain('Alice');
        expect(result.isError).toBeUndefined();
    });

    it('explicit ToolResponse should pass through', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('test.explicit')
            .handle(async () => success('explicit response'));

        const result = await tool.execute(testCtx, { action: 'explicit' });
        expect(result.content[0]?.text).toBe('explicit response');
    });
});

// ============================================================================
// with*() Parameter Declaration
// ============================================================================

describe('with*() Parameter Declaration', () => {
    it('.withString() should add a required string parameter', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('params.string')
            .withString('name', 'User name')
            .handle(async (input) => success(input.name));

        const result = await tool.execute(testCtx, { action: 'string', name: 'Alice' });
        expect(result.content[0]?.text).toContain('Alice');
    });

    it('.withOptionalString() should add an optional string parameter', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('params.optstr')
            .withOptionalString('title', 'Optional title')
            .handle(async (input) => success(input.title ?? 'fallback'));

        // Without the optional param
        const result = await tool.execute(testCtx, { action: 'optstr' });
        expect(result.content[0]?.text).toContain('fallback');
    });

    it('.withNumber() should add a required number parameter', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('params.num')
            .withNumber('limit', 'Max results')
            .handle(async (input) => success(`limit=${input.limit}`));

        const result = await tool.execute(testCtx, { action: 'num', limit: 42 });
        expect(result.content[0]?.text).toContain('42');
    });

    it('.withBoolean() should add a required boolean parameter', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('params.bool')
            .withBoolean('active', 'Filter by active status')
            .handle(async (input) => success(`active=${input.active}`));

        const result = await tool.execute(testCtx, { action: 'bool', active: true });
        expect(result.content[0]?.text).toContain('true');
    });

    it('.withEnum() should add a required enum parameter', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('params.enum')
            .withEnum('status', ['active', 'inactive', 'suspended'] as const, 'Filter by status')
            .handle(async (input) => success(`status=${input.status}`));

        const result = await tool.execute(testCtx, { action: 'enum', status: 'active' });
        expect(result.content[0]?.text).toContain('active');
    });

    it('.withEnum() should reject invalid values', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('params.enumval')
            .withEnum('status', ['active', 'inactive'] as const, 'Status')
            .handle(async (input) => success(input.status));

        const result = await tool.execute(testCtx, { action: 'enumval', status: 'INVALID' });
        expect(result.isError).toBe(true);
    });

    it('.withArray() should add a required array parameter', async () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('params.arr')
            .withArray('tags', 'string', 'Tags to apply')
            .handle(async (input) => success(input.tags.join(',')));

        const result = await tool.execute(testCtx, { action: 'arr', tags: ['a', 'b', 'c'] });
        expect(result.content[0]?.text).toContain('a,b,c');
    });

    it('chained with*() should accumulate all parameters', async () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('params.chain')
            .withString('id', 'Entity ID')
            .withOptionalString('name', 'New name')
            .withNumber('priority', 'Priority level')
            .withOptionalBoolean('active', 'Active flag')
            .withEnum('type', ['task', 'bug', 'feature'] as const, 'Entity type')
            .handle(async (input) => {
                return success({
                    id: input.id,
                    priority: input.priority,
                    type: input.type,
                });
            });

        const result = await tool.execute(testCtx, {
            action: 'chain',
            id: 't-1',
            priority: 5,
            type: 'task',
        });
        expect(result.content[0]?.text).toContain('t-1');
        expect(result.content[0]?.text).toContain('task');
    });
});

// ============================================================================
// AI-First DX — .instructions()
// ============================================================================

describe('AI-First DX', () => {
    it('.instructions() should inject text into description', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('docs.search')
            .describe('Search documentation')
            .instructions('Use ONLY when the user asks about internal policies.')
            .handle(async () => success('results'));

        const def = tool.buildToolDefinition();
        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Use ONLY when the user asks about internal policies.');
        expect(def.description).toContain('Search documentation');
    });

    it('.instructions() without .describe() should still work', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('docs.help')
            .instructions('Only for help queries.')
            .handle(async () => success('help'));

        const def = tool.buildToolDefinition();
        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Only for help queries.');
    });
});

// ============================================================================
// Context Derivation — .use()
// ============================================================================

describe('Context Derivation (.use())', () => {
    it('.use() middleware should enrich context', async () => {
        const f = initFusion<TestContext>();

        let enrichedAdmin: unknown;

        const tool = f.mutation('admin.delete')
            .use(async ({ ctx, next }) => {
                // Simulate auth check + inject admin info
                return next({ ...ctx, adminUser: { name: 'SuperAdmin', role: 'admin' } });
            })
            .withString('id', 'User ID')
            .handle(async (input, ctx) => {
                enrichedAdmin = (ctx as Record<string, unknown>).adminUser;
                return success(`Deleted ${input.id}`);
            });

        await tool.execute(testCtx, { action: 'delete', id: 'u-99' });

        expect(enrichedAdmin).toEqual({ name: 'SuperAdmin', role: 'admin' });
    });
});

// ============================================================================
// Tags
// ============================================================================

describe('Tags', () => {
    it('.tags() should set capability tags', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('admin.stats')
            .tags('admin', 'reporting')
            .handle(async () => success('stats'));

        expect(tool.getTags()).toContain('admin');
        expect(tool.getTags()).toContain('reporting');
    });
});

// ============================================================================
// Router Grouping
// ============================================================================

describe('FluentRouter', () => {
    it('router should prefix action names', () => {
        const f = initFusion<TestContext>();

        const users = f.router('users');

        const tool = users.query('list')
            .handle(async () => success('list'));

        expect(tool.getName()).toBe('users');
        expect(tool.getActionNames()).toContain('list');
    });

    it('router should inherit middleware', async () => {
        const f = initFusion<TestContext>();
        let middlewareRan = false;

        const users = f.router('users')
            .use(async (_ctx, _args, next) => {
                middlewareRan = true;
                return next();
            });

        const tool = users.query('list')
            .handle(async () => success('list'));

        await tool.execute(testCtx, { action: 'list' });
        expect(middlewareRan).toBe(true);
    });

    it('router should inherit tags', () => {
        const f = initFusion<TestContext>();

        const admin = f.router('admin')
            .tags('admin', 'restricted');

        const tool = admin.mutation('purge')
            .handle(async () => success('purged'));

        expect(tool.getTags()).toContain('admin');
        expect(tool.getTags()).toContain('restricted');
    });

    it('router mutation should be destructive by default', () => {
        const f = initFusion<TestContext>();

        const users = f.router('users');

        const tool = users.mutation('delete')
            .withString('id', 'User ID')
            .handle(async () => success('deleted'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.destructive).toBe(true);
    });

    it('router query should be readOnly by default', () => {
        const f = initFusion<TestContext>();

        const users = f.router('users');

        const tool = users.query('count')
            .handle(async () => success('42'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
    });
});

// ============================================================================
// Internal APIs (kept for power users, not documented)
// ============================================================================

describe('Internal APIs', () => {
    it('f.defineTool() should still work (internal)', () => {
        const f = initFusion<TestContext>();

        const tool = f.defineTool('platform', {
            actions: {
                ping: {
                    readOnly: true,
                    handler: async () => success('pong'),
                },
            },
        });

        expect(tool.getName()).toBe('platform');
        expect(tool.getActionNames()).toContain('ping');
    });

    it('f.middleware() should still work', () => {
        const f = initFusion<TestContext>();

        const mw = f.middleware(async (ctx) => ({
            enriched: true,
        }));

        expect(mw).toBeDefined();
        expect(typeof mw.toMiddlewareFn).toBe('function');
    });

    it('f.registry() should still work', () => {
        const f = initFusion<TestContext>();
        const registry = f.registry();
        expect(registry).toBeDefined();
    });
});

// ============================================================================
// Multiple .use() Middleware Stacking
// ============================================================================

describe('Multiple .use() Middleware Stacking', () => {
    it('multiple .use() should merge context cumulatively', async () => {
        const f = initFusion<TestContext>();
        const log: string[] = [];

        const tool = f.mutation('admin.action')
            .use(async ({ ctx, next }) => {
                log.push('mw1');
                return next({ ...ctx, auth: { role: 'admin' } });
            })
            .use(async ({ ctx, next }) => {
                log.push('mw2');
                return next({ ...ctx, tenant: 'acme' });
            })
            .handle(async (input, ctx) => {
                const c = ctx as Record<string, unknown>;
                return success({ auth: c.auth, tenant: c.tenant });
            });

        const result = await tool.execute(testCtx, { action: 'action' });
        expect(log).toEqual(['mw1', 'mw2']);
        expect(result.content[0]?.text).toContain('admin');
        expect(result.content[0]?.text).toContain('acme');
    });
});

// ============================================================================
// Schema Validation at Runtime
// ============================================================================

describe('Schema Validation', () => {
    it('withNumber() should reject string input at runtime', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('validate.strict')
            .withNumber('limit', 'Max results')
            .handle(async (input) => {
                return success({ limit: input.limit });
            });

        // String instead of number should fail validation
        const result = await tool.execute(testCtx, {
            action: 'strict',
            limit: 'not-a-number',
        });

        expect(result.isError).toBe(true);
    });

    it('withEnum() should reject invalid enum value at runtime', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('validate.enum')
            .withEnum('status', ['active', 'inactive'] as const, 'Status')
            .handle(async (input) => success(input.status));

        const result = await tool.execute(testCtx, {
            action: 'enum',
            status: 'BOGUS',
        });

        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// Tool Definition Compilation
// ============================================================================

describe('Tool Definition Compilation', () => {
    it('fluent tool should produce valid MCP tool definition with input schema', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('reports.daily')
            .describe('Generate daily report')
            .instructions('Use only for end-of-day summaries')
            .withString('date', 'ISO date (YYYY-MM-DD)')
            .withOptionalEnum('format', ['pdf', 'csv', 'html'] as const, 'Output format')
            .handle(async () => success('report'));

        const def = tool.buildToolDefinition();

        expect(def.name).toBe('reports');
        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Generate daily report');
        expect(def.inputSchema).toBeDefined();
        expect(def.inputSchema.properties).toHaveProperty('action');
        expect(def.inputSchema.properties).toHaveProperty('date');
        expect(def.inputSchema.properties).toHaveProperty('format');
    });

    it('router tool should produce valid MCP tool definition', () => {
        const f = initFusion<TestContext>();

        const api = f.router('api').tags('v2');

        const tool = api.query('health')
            .describe('Health check')
            .handle(async () => success('ok'));

        const def = tool.buildToolDefinition();

        expect(def.name).toBe('api');
    });
});
