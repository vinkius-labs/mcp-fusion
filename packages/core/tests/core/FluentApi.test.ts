/**
 * Fluent API Tests — Semantic Verbs, Schema Helpers, Type Chaining
 *
 * Covers: f.query(), f.mutation(), f.action(), f.string(), f.number(),
 *         .instructions(), .use(), .returns(), f.router(), Zod interop.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { initFusion } from '../../src/core/initFusion.js';
import { success } from '../../src/core/response.js';
import {
    FluentString, FluentNumber, FluentBoolean, FluentEnum, FluentArray,
    isFluentDescriptor, resolveFluentParams,
} from '../../src/core/builder/FluentSchemaHelpers.js';

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
// Schema Helpers
// ============================================================================

describe('FluentSchemaHelpers', () => {
    it('f.string() should produce a StringParamDef', () => {
        const f = initFusion<TestContext>();
        const desc = f.string().min(3).max(100).describe('User name').toDescriptor();

        expect(desc).toEqual({
            type: 'string',
            description: 'User name',
            min: 3,
            max: 100,
        });
    });

    it('f.number() should produce a NumberParamDef', () => {
        const f = initFusion<TestContext>();
        const desc = f.number().min(1).max(100).default(10).describe('Max results').toDescriptor();

        expect(desc).toEqual({
            type: 'number',
            description: 'Max results (default: 10)',
            min: 1,
            max: 100,
        });
    });

    it('f.boolean() should produce a BooleanParamDef', () => {
        const f = initFusion<TestContext>();
        const desc = f.boolean().default(true).describe('Include archived').toDescriptor();

        expect(desc).toEqual({
            type: 'boolean',
            description: 'Include archived (default: true)',
        });
    });

    it('f.enum() should produce an EnumParamDef', () => {
        const f = initFusion<TestContext>();
        const desc = f.enum('active', 'inactive', 'suspended').describe('User status').toDescriptor();

        expect(desc).toEqual({
            enum: ['active', 'inactive', 'suspended'],
            description: 'User status',
        });
    });

    it('f.array() should produce an ArrayParamDef', () => {
        const f = initFusion<TestContext>();
        const desc = f.array('string').min(1).max(10).describe('Tag list').toDescriptor();

        expect(desc).toEqual({
            array: 'string',
            description: 'Tag list',
            min: 1,
            max: 10,
        });
    });

    it('.optional() should mark the descriptor as optional', () => {
        const f = initFusion<TestContext>();
        const desc = f.string().optional().describe('Optional field').toDescriptor();

        expect(desc).toEqual({
            type: 'string',
            description: 'Optional field',
            optional: true,
        });
    });

    it('.example() should add a single example (AI-First DX)', () => {
        const f = initFusion<TestContext>();
        const desc = f.string().example('How to request vacation?').describe('Search query').toDescriptor();

        expect(desc).toEqual({
            type: 'string',
            description: 'Search query',
            examples: ['How to request vacation?'],
        });
    });

    it('.examples() should add multiple examples', () => {
        const f = initFusion<TestContext>();
        const desc = f.number().examples(1, 5, 10).describe('Page size').toDescriptor();

        expect(desc).toEqual({
            type: 'number',
            description: 'Page size',
            examples: [1, 5, 10],
        });
    });

    it('.int() should mark number as integer', () => {
        const f = initFusion<TestContext>();
        const desc = f.number().int().min(0).toDescriptor();

        expect(desc).toEqual({
            type: 'number',
            int: true,
            min: 0,
        });
    });

    it('.regex() should add pattern to string', () => {
        const f = initFusion<TestContext>();
        const desc = f.string().regex('^[a-z]+$').describe('Slug').toDescriptor();

        expect(desc).toEqual({
            type: 'string',
            description: 'Slug',
            regex: '^[a-z]+$',
        });
    });
});

// ============================================================================
// Semantic Verbs — f.query(), f.mutation(), f.action()
// ============================================================================

describe('Semantic Verbs', () => {
    it('f.query() should create a tool with readOnly action', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('users.list')
            .describe('List users')
            .input({
                limit: f.number().min(1).max(100).default(10).describe('Max results'),
            })
            .resolve(async ({ input, ctx }) => {
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
            .input({ id: f.string().describe('User ID') })
            .resolve(async ({ input, ctx }) => {
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
            .input({
                id: f.string(),
                name: f.string().optional(),
            })
            .resolve(async ({ input, ctx }) => {
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
            .resolve(async () => success('ok'));

        expect(tool.getName()).toBe('health');
        expect(tool.getActionNames()).toContain('default');
    });

    it('semantic overrides should take precedence', () => {
        const f = initFusion<TestContext>();

        // Query is readOnly by default, but we override to NOT readOnly
        const tool = f.query('users.sync')
            .describe('Sync users (has side effects)')
            .readOnly() // explicit override (stays readOnly)
            .destructive() // add destructive
            .resolve(async () => success('synced'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
        expect(meta[0]?.destructive).toBe(true);
    });
});

// ============================================================================
// Handler & Execution
// ============================================================================

describe('Handler Execution', () => {
    it('handler should receive typed { input, ctx }', async () => {
        const f = initFusion<TestContext>();

        let receivedInput: unknown;
        let receivedCtx: unknown;

        const tool = f.query('test.exec')
            .input({
                msg: f.string().describe('Message'),
            })
            .resolve(async ({ input, ctx }) => {
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
            .input({ limit: f.number() })
            .resolve(async ({ input, ctx }) => {
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
            .resolve(async () => success('explicit response'));

        const result = await tool.execute(testCtx, { action: 'explicit' });
        expect(result.content[0]?.text).toBe('explicit response');
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
            .resolve(async () => success('results'));

        const def = tool.buildToolDefinition();
        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Use ONLY when the user asks about internal policies.');
        expect(def.description).toContain('Search documentation');
    });

    it('.instructions() without .describe() should still work', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('docs.help')
            .instructions('Only for help queries.')
            .resolve(async () => success('help'));

        const def = tool.buildToolDefinition();
        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Only for help queries.');
    });
});

// ============================================================================
// Zod Interoperability
// ============================================================================

describe('Zod Interoperability', () => {
    it('.input() should accept native Zod schemas', async () => {
        const f = initFusion<TestContext>();

        const schema = z.object({
            limit: z.number().min(1).max(100).optional(),
            status: z.enum(['active', 'inactive']),
        });

        const tool = f.query('users.search')
            .input(schema)
            .resolve(async ({ input }) => {
                return success({ limit: input.limit, status: input.status });
            });

        expect(tool.getName()).toBe('users');

        const result = await tool.execute(testCtx, {
            action: 'search',
            limit: 10,
            status: 'active',
        });
        expect(result.content[0]?.text).toContain('active');
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
            .input({ id: f.string() })
            .resolve(async ({ input, ctx }) => {
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
            .resolve(async () => success('stats'));

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
            .resolve(async () => success('list'));

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
            .resolve(async () => success('list'));

        await tool.execute(testCtx, { action: 'list' });
        expect(middlewareRan).toBe(true);
    });

    it('router should inherit tags', () => {
        const f = initFusion<TestContext>();

        const admin = f.router('admin')
            .tags('admin', 'restricted');

        const tool = admin.mutation('purge')
            .resolve(async () => success('purged'));

        expect(tool.getTags()).toContain('admin');
        expect(tool.getTags()).toContain('restricted');
    });

    it('router mutation should be destructive by default', () => {
        const f = initFusion<TestContext>();

        const users = f.router('users');

        const tool = users.mutation('delete')
            .input({ id: f.string() })
            .resolve(async () => success('deleted'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.destructive).toBe(true);
    });

    it('router query should be readOnly by default', () => {
        const f = initFusion<TestContext>();

        const users = f.router('users');

        const tool = users.query('count')
            .resolve(async () => success('42'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
    });
});

// ============================================================================
// Backward Compatibility
// ============================================================================

describe('Backward Compatibility', () => {
    it('existing f.tool() API should still work', async () => {
        const f = initFusion<TestContext>();

        const tool = f.tool({
            name: 'legacy.ping',
            handler: async () => success('pong'),
        });

        expect(tool.getName()).toBe('legacy');
        expect(tool.getActionNames()).toContain('ping');

        const result = await tool.execute(testCtx, { action: 'ping' });
        expect(result.content[0]?.text).toBe('pong');
    });

    it('existing f.defineTool() API should still work', () => {
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

    it('existing f.middleware() should still work', () => {
        const f = initFusion<TestContext>();

        const mw = f.middleware(async (ctx) => ({
            enriched: true,
        }));

        expect(mw).toBeDefined();
        expect(typeof mw.toMiddlewareFn).toBe('function');
    });

    it('existing f.registry() should still work', () => {
        const f = initFusion<TestContext>();
        const registry = f.registry();
        expect(registry).toBeDefined();
    });
});

// ============================================================================
// Edge Cases — Multiple .use() Stacking
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
            .resolve(async ({ ctx }) => {
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
// Edge Cases — ParamsMap Shorthand Input
// ============================================================================

describe('ParamsMap Shorthand Input', () => {
    it('.input() should accept plain ParamsMap (JSON descriptors)', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('test.shorthand')
            .input({
                name: 'string',
                age: { type: 'number' as const, min: 0 },
                active: 'boolean',
            })
            .resolve(async ({ input }) => {
                return success({ name: input.name, age: input.age });
            });

        const result = await tool.execute(testCtx, {
            action: 'shorthand',
            name: 'Alice',
            age: 30,
            active: true,
        });
        expect(result.content[0]?.text).toContain('Alice');
    });
});

// ============================================================================
// Edge Cases — Schema Validation at Runtime
// ============================================================================

describe('Schema Validation', () => {
    it('fluent schema should reject invalid input at runtime', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('validate.strict')
            .input({
                limit: f.number().min(1).max(100),
            })
            .resolve(async ({ input }) => {
                return success({ limit: input.limit });
            });

        // String instead of number should fail validation
        const result = await tool.execute(testCtx, {
            action: 'strict',
            limit: 'not-a-number',
        });

        expect(result.isError).toBe(true);
    });

    it('Zod schema should reject invalid input at runtime', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('validate.zod')
            .input(z.object({ email: z.string().email() }))
            .resolve(async ({ input }) => success(input.email));

        const result = await tool.execute(testCtx, {
            action: 'zod',
            email: 'not-an-email',
        });

        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// Edge Cases — isFluentDescriptor + resolveFluentParams
// ============================================================================

describe('FluentDescriptor Utilities', () => {
    it('isFluentDescriptor should detect fluent helpers', () => {
        expect(isFluentDescriptor(new FluentString())).toBe(true);
        expect(isFluentDescriptor(new FluentNumber())).toBe(true);
        expect(isFluentDescriptor(new FluentBoolean())).toBe(true);
        expect(isFluentDescriptor(new FluentEnum('a', 'b'))).toBe(true);
        expect(isFluentDescriptor(new FluentArray('string'))).toBe(true);
    });

    it('isFluentDescriptor should reject non-fluent values', () => {
        expect(isFluentDescriptor('string')).toBe(false);
        expect(isFluentDescriptor({ type: 'string' })).toBe(false);
        expect(isFluentDescriptor(123)).toBe(false);
        expect(isFluentDescriptor(null)).toBe(false);
        expect(isFluentDescriptor(undefined)).toBe(false);
    });

    it('resolveFluentParams should convert mixed maps', () => {
        const resolved = resolveFluentParams({
            name: new FluentString().min(3).describe('Name'),
            age: { type: 'number', min: 0 }, // plain ParamDef passthrough
            tags: new FluentArray('string').min(1),
        });

        expect(resolved.name).toEqual({ type: 'string', description: 'Name', min: 3 });
        expect(resolved.age).toEqual({ type: 'number', min: 0 }); // untouched
        expect(resolved.tags).toEqual({ array: 'string', min: 1 });
    });
});

// ============================================================================
// Edge Cases — buildToolDefinition with Input Schema
// ============================================================================

describe('Tool Definition Compilation', () => {
    it('fluent tool should produce valid MCP tool definition with input schema', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('reports.daily')
            .describe('Generate daily report')
            .instructions('Use only for end-of-day summaries')
            .input({
                date: f.string().regex('^\\d{4}-\\d{2}-\\d{2}$').describe('ISO date'),
                format: f.enum('pdf', 'csv', 'html').optional(),
            })
            .resolve(async () => success('report'));

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
            .resolve(async () => success('ok'));

        const def = tool.buildToolDefinition();

        expect(def.name).toBe('api');
    });
});

