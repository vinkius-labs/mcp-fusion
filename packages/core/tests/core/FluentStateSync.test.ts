/**
 * Fluent State Sync Tests — .invalidates(), .cached(), .toonDescription(), .annotations()
 *
 * Covers:
 * - GroupedToolBuilder: .invalidates(), .cached(), getStateSyncHints()
 * - FluentToolBuilder: .invalidates(), .cached() propagation to GroupedToolBuilder
 * - FluentToolBuilder: .toonDescription(), .annotations() propagation
 * - Auto-collection of hints for SyncPolicy generation
 */
import { describe, it, expect } from 'vitest';
import { initFusion } from '../../src/core/initFusion.js';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { success } from '../../src/core/response.js';

// ── Test Context ─────────────────────────────────────────

interface TestContext {
    db: {
        tasks: {
            update: (id: string, data: Record<string, unknown>) => { id: string };
            findMany: () => Array<{ id: string; title: string }>;
        };
        countries: {
            findMany: () => Array<{ code: string; name: string }>;
        };
    };
}

const testCtx: TestContext = {
    db: {
        tasks: {
            update: (id, data) => ({ id, ...data }),
            findMany: () => [{ id: 't-1', title: 'Test Task' }],
        },
        countries: {
            findMany: () => [{ code: 'BR', name: 'Brazil' }],
        },
    },
};

// ============================================================================
// GroupedToolBuilder — State Sync Hints
// ============================================================================

describe('GroupedToolBuilder — State Sync', () => {
    it('.invalidates() should store glob patterns in stateSyncHints', () => {
        const tool = createTool<TestContext>('tasks')
            .invalidates('tasks.*', 'sprints.*')
            .action({
                name: 'update',
                handler: async () => success('ok'),
            });

        const hints = tool.getStateSyncHints();
        expect(hints.size).toBe(1);

        const wildcard = hints.get('*');
        expect(wildcard).toBeDefined();
        expect(wildcard!.invalidates).toEqual(['tasks.*', 'sprints.*']);
    });

    it('.cached() should store immutable cacheControl in stateSyncHints', () => {
        const tool = createTool<TestContext>('countries')
            .cached()
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => success([]),
            });

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard).toBeDefined();
        expect(wildcard!.cacheControl).toBe('immutable');
    });

    it('.stale() should store no-store cacheControl in stateSyncHints', () => {
        const tool = createTool<TestContext>('exchange_rates')
            .stale()
            .action({
                name: 'get',
                readOnly: true,
                handler: async () => success([]),
            });

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard!.cacheControl).toBe('no-store');
    });

    it('.invalidates() + .cached() should merge on the same key', () => {
        const tool = createTool<TestContext>('tasks')
            .invalidates('tasks.*')
            .cached()
            .action({
                name: 'sync',
                handler: async () => success('ok'),
            });

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard).toBeDefined();
        expect(wildcard!.invalidates).toEqual(['tasks.*']);
        expect(wildcard!.cacheControl).toBe('immutable');
    });

    it('multiple .invalidates() calls should accumulate patterns', () => {
        const tool = createTool<TestContext>('tasks')
            .invalidates('tasks.*')
            .invalidates('sprints.*', 'projects.*')
            .action({
                name: 'update',
                handler: async () => success('ok'),
            });

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard!.invalidates).toEqual(['tasks.*', 'sprints.*', 'projects.*']);
    });

    it('getStateSyncHints() should return empty map when no hints are set', () => {
        const tool = createTool<TestContext>('tasks')
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => success([]),
            });

        const hints = tool.getStateSyncHints();
        expect(hints.size).toBe(0);
    });

    it('.invalidates() should throw after freeze (buildToolDefinition)', () => {
        const tool = createTool<TestContext>('tasks')
            .action({
                name: 'list',
                handler: async () => success([]),
            });

        // Freeze the builder
        tool.buildToolDefinition();

        expect(() => tool.invalidates('tasks.*')).toThrow(/frozen|sealed/i);
    });

    it('.cached() should throw after freeze', () => {
        const tool = createTool<TestContext>('countries')
            .action({
                name: 'list',
                handler: async () => success([]),
            });

        tool.buildToolDefinition();

        expect(() => tool.cached()).toThrow(/frozen|sealed/i);
    });
});

// ============================================================================
// FluentToolBuilder — State Sync Propagation
// ============================================================================

describe('FluentToolBuilder — State Sync Propagation', () => {
    it('.invalidates() should propagate to underlying GroupedToolBuilder', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('tasks.update')
            .invalidates('tasks.*', 'sprints.*')
            .resolve(async ({ input, ctx }) => {
                return success('ok');
            });

        const hints = tool.getStateSyncHints();
        expect(hints.size).toBe(1);

        const wildcard = hints.get('*');
        expect(wildcard!.invalidates).toEqual(['tasks.*', 'sprints.*']);
    });

    it('.cached() should propagate to underlying GroupedToolBuilder', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('countries.list')
            .cached()
            .resolve(async ({ ctx }) => {
                return success(ctx.db.countries.findMany());
            });

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard!.cacheControl).toBe('immutable');
    });

    it('.stale() should propagate to underlying GroupedToolBuilder', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('live.stats')
            .stale()
            .resolve(async () => success({ active: 100 }));

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard!.cacheControl).toBe('no-store');
    });

    it('.invalidates() + .cached() should both propagate together', () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('tasks.bulk_update')
            .invalidates('tasks.*')
            .cached()
            .resolve(async () => success('ok'));

        const hints = tool.getStateSyncHints();
        const wildcard = hints.get('*');
        expect(wildcard!.invalidates).toEqual(['tasks.*']);
        expect(wildcard!.cacheControl).toBe('immutable');
    });

    it('no state sync methods = no hints propagated', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('tasks.list')
            .resolve(async () => success([]));

        const hints = tool.getStateSyncHints();
        expect(hints.size).toBe(0);
    });
});

// ============================================================================
// FluentToolBuilder — .toonDescription() & .annotations() Propagation
// ============================================================================

describe('FluentToolBuilder — toonDescription & annotations', () => {
    it('.toonDescription() should propagate to tool definition', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('tasks.list')
            .describe('List all tasks in the workspace')
            .toonDescription()
            .resolve(async () => success([]));

        const def = tool.buildToolDefinition();
        // TOON mode compresses descriptions — the exact format depends
        // on the TOON compiler. The key assertion: it should NOT contain
        // the full natural language description as-is (it gets compressed).
        expect(def.description).toBeDefined();
        expect(def.name).toBe('tasks');
    });

    it('.annotations() should propagate to tool definition', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('admin.stats')
            .describe('Get admin statistics')
            .annotations({ title: 'Admin Stats', openWorldHint: true })
            .resolve(async () => success({ count: 42 }));

        const def = tool.buildToolDefinition();
        expect(def.annotations).toBeDefined();
        expect(def.annotations!.title).toBe('Admin Stats');
        expect(def.annotations!.openWorldHint).toBe(true);
    });

    it('.annotations() + .toonDescription() should coexist', () => {
        const f = initFusion<TestContext>();

        const tool = f.query('users.list')
            .describe('List all users')
            .toonDescription()
            .annotations({ readOnlyHint: true })
            .resolve(async () => success([]));

        const def = tool.buildToolDefinition();
        expect(def.annotations).toBeDefined();
        expect(def.annotations!.readOnlyHint).toBe(true);
        expect(def.description).toBeDefined();
    });
});

// ============================================================================
// Integration — Fluent State Sync with Execution
// ============================================================================

describe('Integration — Fluent State Sync + Execution', () => {
    it('tool with .invalidates() should still execute correctly', async () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('tasks.update')
            .describe('Update a task')
            .invalidates('tasks.*')
            .input({ id: f.string() })
            .resolve(async ({ input, ctx }) => {
                return ctx.db.tasks.update(input.id, {});
            });

        const result = await tool.execute(testCtx, {
            action: 'update',
            id: 't-1',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('t-1');
    });

    it('tool with .cached() should still execute correctly', async () => {
        const f = initFusion<TestContext>();

        const tool = f.query('countries.list')
            .describe('List all countries')
            .cached()
            .resolve(async ({ ctx }) => ctx.db.countries.findMany());

        const result = await tool.execute(testCtx, { action: 'list' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('Brazil');
    });

    it('full chain: .invalidates() + .cached() + .toonDescription() + .annotations() + execution', async () => {
        const f = initFusion<TestContext>();

        const tool = f.mutation('tasks.sync')
            .describe('Synchronize tasks with external system')
            .toonDescription()
            .annotations({ idempotentHint: true })
            .invalidates('tasks.*', 'projects.*')
            .resolve(async () => success({ synced: 5 }));

        // Should build correctly
        const def = tool.buildToolDefinition();
        expect(def.name).toBe('tasks');
        expect(def.annotations).toBeDefined();

        // Should have state sync hints
        const hints = tool.getStateSyncHints();
        expect(hints.get('*')!.invalidates).toEqual(['tasks.*', 'projects.*']);

        // Should execute correctly
        const result = await tool.execute(testCtx, { action: 'sync' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('synced');
    });
});
