/**
 * FusionTester Integration Tests
 *
 * Exercises the in-memory MVA lifecycle emulator against a real
 * ToolRegistry with tools, Presenters, middleware, and the Egress Firewall.
 *
 * Validates:
 * - Egress Firewall (Presenter Zod schema strips hidden fields)
 * - OOM Guard (Zod rejects out-of-bounds input)
 * - System Rules (Presenter domain rules are correctly extracted)
 * - UI Blocks (Presenter SSR blocks are correctly extracted)
 * - Middleware Guards (middleware blocks unauthenticated calls)
 * - Context Overrides (overrideContext merges correctly)
 * - Error Responses (isError is correctly set)
 * - Fallback (tools without Presenter return raw data)
 * - Async contextFactory
 * - agentLimit truncation (cognitive guardrail)
 * - suggestActions (HATEOAS)
 * - collectionUiBlocks
 * - Contextual rules (dynamic functions)
 * - response() builder (manual rules, no Presenter)
 * - Handler-returned errors
 * - rawResponse shape (MCP protocol)
 * - Sequential reuse
 * - Single-item Presenter (non-array)
 * - Symbol invisibility (JSON.stringify)
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    createTool,
    ToolRegistry,
    createPresenter,
    success,
    error,
    response,
    ui,
    MVA_META_SYMBOL,
} from '@vinkius-core/mcp-fusion';
import type { MiddlewareFn, ToolResponse } from '@vinkius-core/mcp-fusion';
import { FusionTester, createFusionTester } from '../src/index.js';

// ── Test Context ─────────────────────────────────────────

interface TestContext {
    db: {
        users: {
            findMany: (args: { take: number }) => Promise<TestUser[]>;
            create: (data: { email: string; name: string }) => Promise<TestUser>;
        };
    };
    tenantId: string;
    role: string;
}

interface TestUser {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    tenantId: string;
}

// ── Presenter (Egress Firewall — strips passwordHash & tenantId) ──

const UserPresenter = createPresenter<{ id: string; name: string; email: string }>('User')
    .schema(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
    }))
    .systemRules([
        'All data is from Prisma ORM. Do not infer data outside this response.',
        'Email addresses are PII. Mask when possible.',
    ])
    .uiBlocks((user) => [
        ui.summary(`User: ${user.name} (${user.email})`),
    ]);

// ── Presenter with agentLimit + collectionUiBlocks + suggestActions ──

const RichPresenter = createPresenter<{ id: string; value: number }>('RichItem')
    .schema(z.object({
        id: z.string(),
        value: z.number(),
    }))
    .systemRules((data, ctx) => [
        'Values are in cents. Divide by 100 for display.',
        (ctx as TestContext)?.role === 'ADMIN' ? 'User is ADMIN. Show full details.' : null,
    ])
    .collectionUiBlocks((items) => [
        ui.summary(`Total: ${items.length} items, sum=${items.reduce((s, i) => s + i.value, 0)}`),
    ])
    .agentLimit(3, (omitted) =>
        ui.summary(`⚠️ Truncated. 3 shown, ${omitted} hidden. Apply filters.`)
    )
    .suggestActions((data) => {
        if (Array.isArray(data) && data.length > 0) {
            return [
                { tool: 'analytics.breakdown', reason: 'Drill into item details' },
            ];
        }
        return [];
    });

// ── Middleware (Auth Guard) ──────────────────────────────

const requireAdmin: MiddlewareFn<TestContext> = async (ctx, _args, next) => {
    if (ctx.role !== 'ADMIN') {
        return error('Unauthorized. Admin role required.');
    }
    return next();
};

// ── Mock Data ────────────────────────────────────────────

const MOCK_USERS: TestUser[] = [
    { id: '1', name: 'Alice', email: 'alice@acme.com', passwordHash: 'bcrypt$abc', tenantId: 't_777' },
    { id: '2', name: 'Bob', email: 'bob@acme.com', passwordHash: 'bcrypt$xyz', tenantId: 't_777' },
];

const MOCK_RICH_ITEMS = Array.from({ length: 10 }, (_, i) => ({
    id: `item_${i}`,
    value: (i + 1) * 1000,
    secret: 'should_be_stripped',
}));

// ── Tool Definitions ─────────────────────────────────────

const usersTool = createTool<TestContext>('users')
    .description('User management')
    .use(requireAdmin)
    .maxPayloadBytes(64 * 1024)
    .action({
        name: 'find_many',
        description: 'List users',
        readOnly: true,
        schema: z.object({
            take: z.number().int().min(1).max(50).describe('Max records to return (1-50)'),
        }),
        handler: async (ctx, args) => {
            const users = await ctx.db.users.findMany({ take: args.take });
            return users as unknown as ToolResponse;
        },
        returns: UserPresenter,
    } as any)
    .action({
        name: 'create',
        description: 'Create a user',
        destructive: false,
        schema: z.object({
            email: z.string().email(),
            name: z.string().min(1),
        }),
        handler: async (ctx, args) => {
            const user = await ctx.db.users.create({ email: args.email, name: args.name });
            return user as unknown as ToolResponse;
        },
        returns: UserPresenter,
    } as any)
    .action({
        name: 'no_presenter',
        description: 'Returns raw data without a Presenter',
        readOnly: true,
        handler: async () => {
            return success({ status: 'healthy', uptime: 42 });
        },
    })
    .action({
        name: 'manual_response',
        description: 'Uses response() builder manually (no Presenter)',
        readOnly: true,
        handler: async () => {
            return response({ message: 'Built manually' })
                .systemRules(['Manual rule 1', 'Manual rule 2'])
                .llmHint('Pay attention to the manual response.')
                .build();
        },
    })
    .action({
        name: 'handler_error',
        description: 'Handler that explicitly returns an error',
        readOnly: true,
        handler: async () => {
            return error('This handler intentionally fails.');
        },
    })
    .action({
        name: 'string_response',
        description: 'Handler that returns a plain string',
        readOnly: true,
        handler: async () => {
            return success('Operation completed successfully.');
        },
    });

const healthTool = createTool<TestContext>('health')
    .description('Health check')
    .action({
        name: 'check',
        readOnly: true,
        handler: async () => success({ status: 'ok' }),
    });

const analyticsTool = createTool<TestContext>('analytics')
    .description('Analytics with rich Presenter')
    .action({
        name: 'list',
        description: 'List items with truncation',
        readOnly: true,
        schema: z.object({
            limit: z.number().int().min(1).max(100).optional(),
        }),
        handler: async (_ctx, args) => {
            const limit = args.limit ?? 10;
            return MOCK_RICH_ITEMS.slice(0, limit) as unknown as ToolResponse;
        },
        returns: RichPresenter,
    } as any)
    .action({
        name: 'single',
        description: 'Returns a single item',
        readOnly: true,
        handler: async () => {
            return { id: 'single_1', value: 5000, secret: 'hidden' } as unknown as ToolResponse;
        },
        returns: RichPresenter,
    } as any);

// ── Registry ─────────────────────────────────────────────

const registry = new ToolRegistry<TestContext>();
registry.registerAll(usersTool, healthTool, analyticsTool);

// ── Context Factory ──────────────────────────────────────

const createMockContext = (): TestContext => ({
    db: {
        users: {
            findMany: async ({ take }: { take: number }) => MOCK_USERS.slice(0, take),
            create: async (data: { email: string; name: string }) => ({
                id: '3',
                name: data.name,
                email: data.email,
                passwordHash: 'bcrypt$new',
                tenantId: 't_777',
            }),
        },
    },
    tenantId: 't_777',
    role: 'ADMIN',
});

// ── Tests ────────────────────────────────────────────────

describe('FusionTester', () => {
    const tester = createFusionTester(registry, {
        contextFactory: createMockContext,
    });

    // ── Construction ─────────────────────────────────────

    describe('Construction', () => {
        it('should create via factory function', () => {
            const t = createFusionTester(registry, { contextFactory: createMockContext });
            expect(t).toBeInstanceOf(FusionTester);
        });

        it('should create via class constructor', () => {
            const t = new FusionTester(registry, { contextFactory: createMockContext });
            expect(t).toBeInstanceOf(FusionTester);
        });
    });

    // ── Egress Firewall ──────────────────────────────────

    describe('Egress Firewall (Presenter Zod Schema)', () => {
        it('should strip hidden fields (passwordHash, tenantId)', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 2 });
            expect(result.isError).toBe(false);

            const users = result.data as Array<Record<string, unknown>>;
            expect(users).toHaveLength(2);

            for (const user of users) {
                expect(user).not.toHaveProperty('passwordHash');
                expect(user).not.toHaveProperty('tenantId');
                expect(user).toHaveProperty('id');
                expect(user).toHaveProperty('name');
                expect(user).toHaveProperty('email');
            }
        });

        it('should preserve allowed fields accurately', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 1 });
            const users = result.data as Array<Record<string, unknown>>;
            expect(users[0]).toEqual({ id: '1', name: 'Alice', email: 'alice@acme.com' });
        });

        it('should strip fields from single-item Presenter', async () => {
            const result = await tester.callAction('analytics', 'single');
            expect(result.isError).toBe(false);
            const data = result.data as Record<string, unknown>;
            expect(data).not.toHaveProperty('secret');
            expect(data).toEqual({ id: 'single_1', value: 5000 });
        });

        it('should strip fields from collection items via RichPresenter', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 2 });
            expect(result.isError).toBe(false);
            const items = result.data as Array<Record<string, unknown>>;
            for (const item of items) {
                expect(item).not.toHaveProperty('secret');
                expect(item).toHaveProperty('id');
                expect(item).toHaveProperty('value');
            }
        });
    });

    // ── System Rules ─────────────────────────────────────

    describe('System Rules', () => {
        it('should extract Presenter system rules', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 1 });
            expect(result.systemRules).toContain('All data is from Prisma ORM. Do not infer data outside this response.');
            expect(result.systemRules).toContain('Email addresses are PII. Mask when possible.');
        });

        it('should return empty rules for tools without Presenter', async () => {
            const result = await tester.callAction('health', 'check');
            expect(result.systemRules).toEqual([]);
        });

        it('should extract contextual rules (dynamic function)', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 2 });
            expect(result.systemRules).toContain('Values are in cents. Divide by 100 for display.');
        });

        it('should include role-aware contextual rules for ADMIN', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 1 });
            expect(result.systemRules).toContain('User is ADMIN. Show full details.');
        });

        it('should extract manual rules from response() builder', async () => {
            const result = await tester.callAction('users', 'manual_response');
            expect(result.isError).toBe(false);
            expect(result.systemRules).toContain('Manual rule 1');
            expect(result.systemRules).toContain('Manual rule 2');
        });
    });

    // ── UI Blocks ────────────────────────────────────────

    describe('UI Blocks', () => {
        it('should extract Presenter UI blocks for item Presenters', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 1 });
            expect(result.uiBlocks).toBeInstanceOf(Array);
        });

        it('should return empty UI blocks for tools without Presenter', async () => {
            const result = await tester.callAction('health', 'check');
            expect(result.uiBlocks).toEqual([]);
        });

        it('should extract collectionUiBlocks from RichPresenter', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 2 });
            expect(result.uiBlocks).toBeInstanceOf(Array);
            expect(result.uiBlocks.length).toBeGreaterThan(0);
            // Should have collection summary
            const summaryBlock = result.uiBlocks.find(
                (b: any) => b.type === 'summary'
            ) as any;
            expect(summaryBlock).toBeDefined();
            expect(summaryBlock.content).toContain('Total:');
        });
    });

    // ── Agent Limit (Cognitive Guardrail) ─────────────────

    describe('Agent Limit (Cognitive Guardrail)', () => {
        it('should truncate collections beyond agentLimit', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 10 });
            expect(result.isError).toBe(false);
            const items = result.data as Array<Record<string, unknown>>;
            // agentLimit is 3, so only 3 items should be returned
            expect(items).toHaveLength(3);
        });

        it('should include truncation warning in UI blocks', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 10 });
            const truncationBlock = result.uiBlocks.find(
                (b: any) => b.content && b.content.includes('Truncated')
            ) as any;
            expect(truncationBlock).toBeDefined();
            expect(truncationBlock.content).toContain('7 hidden');
        });

        it('should NOT truncate when within limit', async () => {
            const result = await tester.callAction('analytics', 'list', { limit: 2 });
            const items = result.data as Array<Record<string, unknown>>;
            expect(items).toHaveLength(2);
        });
    });

    // ── OOM Guard (Zod Input Validation) ─────────────────

    describe('OOM Guard (Zod Input Validation)', () => {
        it('should reject take > 50', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 10000 });
            expect(result.isError).toBe(true);
        });

        it('should reject take = 0', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 0 });
            expect(result.isError).toBe(true);
        });

        it('should reject missing required fields', async () => {
            const result = await tester.callAction('users', 'find_many', {});
            expect(result.isError).toBe(true);
        });

        it('should reject non-integer take', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 3.14 });
            expect(result.isError).toBe(true);
        });

        it('should reject wrong type for take', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 'fifty' });
            expect(result.isError).toBe(true);
        });

        it('should reject invalid email on create', async () => {
            const result = await tester.callAction('users', 'create', { email: 'bad-email', name: 'Test' });
            expect(result.isError).toBe(true);
        });

        it('should reject empty name on create', async () => {
            const result = await tester.callAction('users', 'create', { email: 'valid@test.com', name: '' });
            expect(result.isError).toBe(true);
        });
    });

    // ── Middleware Guards ─────────────────────────────────

    describe('Middleware Guards', () => {
        it('should block GUEST role via requireAdmin middleware', async () => {
            const result = await tester.callAction(
                'users', 'find_many', { take: 5 },
                { role: 'GUEST' },
            );
            expect(result.isError).toBe(true);
            expect(result.data).toContain('Unauthorized');
        });

        it('should allow ADMIN role', async () => {
            const result = await tester.callAction(
                'users', 'find_many', { take: 5 },
                { role: 'ADMIN' },
            );
            expect(result.isError).toBe(false);
        });

        it('should block on create action too', async () => {
            const result = await tester.callAction(
                'users', 'create', { email: 'test@co.com', name: 'Test' },
                { role: 'VIEWER' },
            );
            expect(result.isError).toBe(true);
        });
    });

    // ── Context Overrides ────────────────────────────────

    describe('Context Overrides', () => {
        it('should merge overrideContext correctly', async () => {
            const result = await tester.callAction(
                'users', 'find_many', { take: 1 },
                { tenantId: 't_override_999' },
            );
            expect(result.isError).toBe(false);
        });

        it('should not mutate the original context', async () => {
            const ctx1 = createMockContext();
            const customTester = createFusionTester(registry, {
                contextFactory: () => ctx1,
            });
            await customTester.callAction(
                'users', 'find_many', { take: 1 },
                { role: 'GUEST' },
            );
            expect(ctx1.role).toBe('ADMIN');
        });

        it('should work without overrideContext', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 1 });
            expect(result.isError).toBe(false);
        });
    });

    // ── Error Responses ──────────────────────────────────

    describe('Error Responses', () => {
        it('should set isError for unknown tools', async () => {
            const result = await tester.callAction('nonexistent_tool', 'list');
            expect(result.isError).toBe(true);
        });

        it('should set isError for unknown actions', async () => {
            const result = await tester.callAction('users', 'nonexistent_action');
            expect(result.isError).toBe(true);
        });

        it('should set isError when handler explicitly returns error()', async () => {
            const result = await tester.callAction('users', 'handler_error');
            expect(result.isError).toBe(true);
            expect(result.data).toContain('intentionally fails');
        });

        it('should have empty MVA layers on error', async () => {
            const result = await tester.callAction('users', 'handler_error');
            expect(result.systemRules).toEqual([]);
            expect(result.uiBlocks).toEqual([]);
        });
    });

    // ── Fallback (no Presenter) ──────────────────────────

    describe('Fallback (raw data, no Presenter)', () => {
        it('should return parsed data for tools without Presenter', async () => {
            const result = await tester.callAction('health', 'check');
            expect(result.isError).toBe(false);
            expect(result.data).toEqual({ status: 'ok' });
        });

        it('should return parsed data for actions without returns field', async () => {
            const result = await tester.callAction('users', 'no_presenter');
            expect(result.isError).toBe(false);
            expect(result.data).toEqual({ status: 'healthy', uptime: 42 });
        });

        it('should handle string responses correctly', async () => {
            const result = await tester.callAction('users', 'string_response');
            expect(result.isError).toBe(false);
            expect(result.data).toBe('Operation completed successfully.');
        });
    });

    // ── Async Context Factory ────────────────────────────

    describe('Async Context Factory', () => {
        it('should support async contextFactory', async () => {
            const asyncTester = createFusionTester(registry, {
                contextFactory: async () => {
                    // Simulate async DB/auth lookup
                    await new Promise(resolve => setTimeout(resolve, 1));
                    return createMockContext();
                },
            });
            const result = await asyncTester.callAction('users', 'find_many', { take: 1 });
            expect(result.isError).toBe(false);
            expect(result.data).toBeDefined();
        });
    });

    // ── rawResponse Shape ────────────────────────────────

    describe('rawResponse (MCP Protocol Shape)', () => {
        it('should have content array on success', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 1 });
            const raw = result.rawResponse as { content: Array<{ type: string; text: string }> };
            expect(raw.content).toBeInstanceOf(Array);
            expect(raw.content.length).toBeGreaterThan(0);
            expect(raw.content[0].type).toBe('text');
        });

        it('should have isError on error response', async () => {
            const result = await tester.callAction('users', 'handler_error');
            const raw = result.rawResponse as { isError?: boolean };
            expect(raw.isError).toBe(true);
        });

        it('should NOT include Symbol key in JSON.stringify', async () => {
            const result = await tester.callAction('users', 'find_many', { take: 1 });
            const jsonStr = JSON.stringify(result.rawResponse);
            expect(jsonStr).not.toContain('mva-meta');
            expect(jsonStr).not.toContain('systemRules');
            // But the Symbol IS there in memory
            const meta = (result.rawResponse as any)[MVA_META_SYMBOL];
            expect(meta).toBeDefined();
            expect(meta.data).toBeDefined();
        });
    });

    // ── Sequential Reuse ─────────────────────────────────

    describe('Sequential Reuse', () => {
        it('should support multiple sequential calls on same tester', async () => {
            const r1 = await tester.callAction('users', 'find_many', { take: 1 });
            const r2 = await tester.callAction('health', 'check');
            const r3 = await tester.callAction('users', 'find_many', { take: 2 });

            expect(r1.isError).toBe(false);
            expect(r2.isError).toBe(false);
            expect(r3.isError).toBe(false);

            expect((r1.data as any[]).length).toBe(1);
            expect((r3.data as any[]).length).toBe(2);
        });

        it('should isolate context between calls', async () => {
            // First call as GUEST (should fail)
            const r1 = await tester.callAction('users', 'find_many', { take: 1 }, { role: 'GUEST' });
            // Second call as default ADMIN (should succeed)
            const r2 = await tester.callAction('users', 'find_many', { take: 1 });

            expect(r1.isError).toBe(true);
            expect(r2.isError).toBe(false);
        });
    });

    // ── Create Action (Single Item Presenter) ────────────

    describe('Create Action (Single Item Presenter)', () => {
        it('should strip hidden fields from single-item create response', async () => {
            const result = await tester.callAction('users', 'create', {
                email: 'new@test.com',
                name: 'New User',
            });
            expect(result.isError).toBe(false);
            const user = result.data as Record<string, unknown>;
            expect(user).not.toHaveProperty('passwordHash');
            expect(user).not.toHaveProperty('tenantId');
            expect(user.name).toBe('New User');
            expect(user.email).toBe('new@test.com');
        });

        it('should have system rules on create response', async () => {
            const result = await tester.callAction('users', 'create', {
                email: 'another@test.com',
                name: 'Another',
            });
            expect(result.systemRules.length).toBe(2);
        });
    });

    // ── callAction Without Args ──────────────────────────

    describe('callAction Without Args', () => {
        it('should work when args is omitted', async () => {
            const result = await tester.callAction('health', 'check');
            expect(result.isError).toBe(false);
        });

        it('should work when args is undefined', async () => {
            const result = await tester.callAction('health', 'check', undefined);
            expect(result.isError).toBe(false);
        });
    });

    // ── Concurrent Calls ─────────────────────────────────

    describe('Concurrent Calls', () => {
        it('should handle parallel calls correctly', async () => {
            const results = await Promise.all([
                tester.callAction('users', 'find_many', { take: 1 }),
                tester.callAction('health', 'check'),
                tester.callAction('analytics', 'list', { limit: 2 }),
            ]);

            expect(results[0].isError).toBe(false);
            expect(results[1].isError).toBe(false);
            expect(results[2].isError).toBe(false);
        });
    });

    // ── Manual response() Builder ────────────────────────

    describe('Manual response() Builder', () => {
        it('should extract MVA meta from manual response() builder', async () => {
            const result = await tester.callAction('users', 'manual_response');
            expect(result.isError).toBe(false);
            expect(result.systemRules).toContain('Manual rule 1');
            expect(result.systemRules).toContain('Manual rule 2');
        });

        it('should have data from manual response() builder', async () => {
            const result = await tester.callAction('users', 'manual_response');
            const data = result.data as Record<string, unknown>;
            expect(data.message).toBe('Built manually');
        });
    });
});

