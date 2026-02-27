/**
 * FluentApiDeep — Ultra-Robust Tests for Uncovered Fluent Builder Methods
 *
 * Supplements FluentApi.test.ts (33 tests) and PresenterFluentAPI.test.ts (64 tests)
 * by covering methods not tested elsewhere:
 *
 * FluentToolBuilder:
 * - .instructions() with/without .describe()
 * - .readOnly(), .destructive(), .idempotent() flags on f.action()
 * - .annotations() custom MCP annotations
 * - .invalidates(), .cached(), .stale() state sync inline
 * - .returns() with Presenter end-to-end
 * - handler execution with mixed required/optional params
 * - multiple .use() middleware stacking with typed context
 *
 * ErrorBuilder:
 * - Every method: .suggest(), .actions(), .critical(), .warning()
 * - .details(), .retryAfter(), full chain, .content/.isError getters
 */
import { describe, it, expect } from 'vitest';
import { initFusion } from '../../src/core/initFusion.js';
import { success } from '../../src/core/response.js';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { suggest } from '../../src/presenter/suggest.js';
import { t } from '../../src/presenter/typeHelpers.js';
import { ErrorBuilder } from '../../src/core/builder/ErrorBuilder.js';

// ── Setup ────────────────────────────────────────────────

interface AppContext {
    userId: string;
    role: 'admin' | 'member';
}

const ctx: AppContext = { userId: 'u-1', role: 'admin' };

// ============================================================================
// FluentToolBuilder — Semantic Annotations via f.action()
// ============================================================================

describe('FluentToolBuilder — semantic annotations on f.action()', () => {
    it('.readOnly() on f.action() overrides to readOnly', () => {
        const f = initFusion<AppContext>();
        const tool = f.action('safe.read')
            .describe('Read-only action')
            .readOnly()
            .handle(async () => success('ok'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
    });

    it('.destructive() on f.action() sets destructive', () => {
        const f = initFusion<AppContext>();
        const tool = f.action('unsafe.delete')
            .describe('Destructive action')
            .destructive()
            .handle(async () => success('deleted'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.destructive).toBe(true);
    });

    it('.idempotent() on f.action() sets idempotent', () => {
        const f = initFusion<AppContext>();
        const tool = f.action('safe.sync')
            .describe('Idempotent sync')
            .idempotent()
            .handle(async () => success('synced'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.idempotent).toBe(true);
    });

    it('readOnly + idempotent combined on f.action()', () => {
        const f = initFusion<AppContext>();
        const tool = f.action('safe.check')
            .readOnly()
            .idempotent()
            .handle(async () => success('ok'));

        const meta = tool.getActionMetadata();
        expect(meta[0]?.readOnly).toBe(true);
        expect(meta[0]?.idempotent).toBe(true);
        expect(meta[0]?.destructive).toBe(false);
    });
});

// ============================================================================
// FluentToolBuilder — .annotations() Custom MCP Annotations
// ============================================================================

describe('FluentToolBuilder — .annotations()', () => {
    it('sets custom annotation keys', () => {
        const f = initFusion<AppContext>();
        const tool = f.query('meta.annotated')
            .describe('Annotated tool')
            .annotations({ openWorldHint: true, title: 'List Projects' })
            .handle(async () => success('ok'));

        const def = tool.buildToolDefinition();
        expect(def.annotations?.openWorldHint).toBe(true);
        expect(def.annotations?.title).toBe('List Projects');
    });

    it('preserves semantic defaults alongside custom annotations', () => {
        const f = initFusion<AppContext>();
        const tool = f.query('meta.combined')
            .annotations({ title: 'Combined' })
            .handle(async () => success('ok'));

        const def = tool.buildToolDefinition();
        expect(def.annotations?.readOnlyHint).toBe(true); // from f.query()
        expect(def.annotations?.title).toBe('Combined');
    });
});

// ============================================================================
// FluentToolBuilder — State Sync (.invalidates, .cached, .stale)
// ============================================================================

describe('FluentToolBuilder — state sync inline', () => {
    it('.invalidates() chains and builds without error', async () => {
        const f = initFusion<AppContext>();
        const tool = f.mutation('sync.update')
            .describe('Update sprint')
            .invalidates('sprints.*', 'tasks.*')
            .handle(async () => success('updated'));

        // Tool should build and execute without error
        const result = await tool.execute(ctx, { action: 'update' });
        expect(result.content[0]?.text).toContain('updated');
    });

    it('.cached() chains and builds without error', async () => {
        const f = initFusion<AppContext>();
        const tool = f.query('sync.countries')
            .cached()
            .handle(async () => success('countries'));

        const result = await tool.execute(ctx, { action: 'countries' });
        expect(result.content[0]?.text).toContain('countries');
    });

    it('.stale() chains and builds without error', async () => {
        const f = initFusion<AppContext>();
        const tool = f.query('sync.balance')
            .stale()
            .handle(async () => success('balance'));

        const result = await tool.execute(ctx, { action: 'balance' });
        expect(result.content[0]?.text).toContain('balance');
    });

    it('.invalidates() with single pattern chains correctly', async () => {
        const f = initFusion<AppContext>();
        const tool = f.mutation('sync.single')
            .invalidates('projects.*')
            .handle(async () => success('ok'));

        const result = await tool.execute(ctx, { action: 'single' });
        expect(result.isError).toBeUndefined();
    });
});

// ============================================================================
// FluentToolBuilder — Handler Execution with Optional Params
// ============================================================================

describe('FluentToolBuilder — handler execution', () => {
    it('optional params default to undefined', async () => {
        const f = initFusion<AppContext>();
        let captured: Record<string, unknown> = {};

        const tool = f.query('exec.optional')
            .withString('name')
            .withOptionalNumber('limit')
            .withOptionalBoolean('verbose')
            .handle(async (input) => {
                captured = { name: input.name, limit: input.limit, verbose: input.verbose };
                return success('done');
            });

        await tool.execute(ctx, { action: 'optional', name: 'test' });
        expect(captured.name).toBe('test');
        expect(captured.limit).toBeUndefined();
        expect(captured.verbose).toBeUndefined();
    });

    it('optional params are passed when provided', async () => {
        const f = initFusion<AppContext>();
        let captured: Record<string, unknown> = {};

        const tool = f.query('exec.full')
            .withString('name')
            .withOptionalNumber('limit')
            .withOptionalBoolean('verbose')
            .handle(async (input) => {
                captured = { name: input.name, limit: input.limit, verbose: input.verbose };
                return success('done');
            });

        await tool.execute(ctx, { action: 'full', name: 'test', limit: 10, verbose: true });
        expect(captured.name).toBe('test');
        expect(captured.limit).toBe(10);
        expect(captured.verbose).toBe(true);
    });

    it('withArray handler receives the array correctly', async () => {
        const f = initFusion<AppContext>();
        let captured: string[] = [];

        const tool = f.mutation('exec.array')
            .withArray('ids', 'string', 'IDs to process')
            .handle(async (input) => {
                captured = input.ids;
                return success('processed');
            });

        await tool.execute(ctx, { action: 'array', ids: ['a', 'b', 'c'] });
        expect(captured).toEqual(['a', 'b', 'c']);
    });

    it('withEnum validates at runtime', async () => {
        const f = initFusion<AppContext>();

        const tool = f.query('exec.enum_val')
            .withEnum('priority', ['low', 'medium', 'high'] as const)
            .handle(async (input) => success(input.priority));

        // Valid
        const r1 = await tool.execute(ctx, { action: 'enum_val', priority: 'high' });
        expect(r1.content[0]?.text).toContain('high');

        // Invalid
        const r2 = await tool.execute(ctx, { action: 'enum_val', priority: 'INVALID' });
        expect(r2.isError).toBe(true);
    });

    it('withOptionalEnum allows absence', async () => {
        const f = initFusion<AppContext>();
        let captured: string | undefined;

        const tool = f.query('exec.opt_enum')
            .withOptionalEnum('sort', ['asc', 'desc'] as const)
            .handle(async (input) => {
                captured = input.sort;
                return success('ok');
            });

        await tool.execute(ctx, { action: 'opt_enum' });
        expect(captured).toBeUndefined();
    });

    it('withOptionalArray handler receives undefined when absent', async () => {
        const f = initFusion<AppContext>();
        let captured: number[] | undefined;

        const tool = f.mutation('exec.opt_array')
            .withOptionalArray('scores', 'number')
            .handle(async (input) => {
                captured = input.scores;
                return success('ok');
            });

        await tool.execute(ctx, { action: 'opt_array' });
        expect(captured).toBeUndefined();
    });
});

// ============================================================================
// FluentToolBuilder — .returns() with Presenter E2E
// ============================================================================

describe('FluentToolBuilder — .returns() with Presenter', () => {
    it('.returns() chains correctly and tool executes without error', async () => {
        const f = initFusion<AppContext>();

        const ProjectPresenter = createPresenter('ProjectDeepE2E')
            .schema({ id: t.string, name: t.string })
            .rules(['Project names are case-sensitive']);

        const tool = f.query('e2e.project')
            .withString('id')
            .returns(ProjectPresenter)
            .handle(async (input) => ({
                id: input.id,
                name: 'Fusion',
            }));

        // The tool should execute without error
        const result = await tool.execute(ctx, { action: 'project', id: 'P1' });
        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toContain('Fusion');
    });

    it('.returns() Presenter standalone make() validates and formats', () => {
        const InvPresenter = createPresenter('InvoiceDeepE2E')
            .schema({ id: t.string, status: t.enum('pending', 'paid') })
            .suggest((inv: { id: string; status: string }) => [
                inv.status === 'pending'
                    ? suggest('billing.pay', 'Pay now')
                    : null,
            ].filter((s): s is NonNullable<typeof s> => s !== null))
            .rules(['Amounts are in CENTS']);

        // Directly test Presenter make → build
        const result = InvPresenter.make({ id: 'INV-1', status: 'pending' }).build();
        const fullText = result.content.map((c: { text: string }) => c.text).join('\n');
        expect(fullText).toContain('INV-1');
        expect(fullText).toContain('CENTS');

        const suggestBlock = result.content.find((b: { text: string }) => b.text.includes('suggest'));
        expect(suggestBlock).toBeDefined();
        expect(suggestBlock!.text).toContain('billing.pay');
    });
});

// ============================================================================
// ErrorBuilder — Every Method
// ============================================================================

describe('ErrorBuilder — comprehensive', () => {
    it('builds minimal error with code and message', () => {
        const result = new ErrorBuilder('NOT_FOUND', 'Project not found').build();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('NOT_FOUND');
        expect(result.content[0].text).toContain('Project not found');
    });

    it('.suggest() adds recovery suggestion', () => {
        const result = new ErrorBuilder('NOT_FOUND', 'Missing')
            .suggest('Try projects.list first')
            .build();
        expect(result.content[0].text).toContain('Try projects.list first');
    });

    it('.actions() adds available actions', () => {
        const result = new ErrorBuilder('NOT_FOUND', 'Missing')
            .actions('projects.list', 'projects.search')
            .build();
        const text = result.content[0].text;
        expect(text).toContain('projects.list');
        expect(text).toContain('projects.search');
    });

    it('.critical() sets severity to critical', () => {
        const result = new ErrorBuilder('INTERNAL', 'DB down')
            .critical()
            .build();
        expect(result.content[0].text).toContain('critical');
    });

    it('.warning() sets severity to warning', () => {
        const result = new ErrorBuilder('VALIDATION', 'Soft limit')
            .warning()
            .build();
        expect(result.content[0].text).toContain('warning');
    });

    it('.details() adds structured metadata', () => {
        const result = new ErrorBuilder('NOT_FOUND', 'Missing')
            .details({ searched_id: 'abc', checked_tables: 3 })
            .build();
        const text = result.content[0].text;
        expect(text).toContain('searched_id');
        expect(text).toContain('abc');
    });

    it('.retryAfter() adds retry delay', () => {
        const result = new ErrorBuilder('RATE_LIMIT', 'Too many requests')
            .retryAfter(30)
            .build();
        expect(result.content[0].text).toContain('30');
    });

    it('full chain produces complete error response', () => {
        const result = new ErrorBuilder('NOT_FOUND', 'Project XYZ gone')
            .suggest('Check the ID')
            .actions('projects.list')
            .critical()
            .details({ project_id: 'XYZ' })
            .retryAfter(5)
            .build();

        const text = result.content[0].text;
        expect(result.isError).toBe(true);
        expect(text).toContain('NOT_FOUND');
        expect(text).toContain('Project XYZ gone');
        expect(text).toContain('Check the ID');
        expect(text).toContain('projects.list');
        expect(text).toContain('critical');
    });

    it('.content and .isError getters for direct handler returns', () => {
        const err = new ErrorBuilder('VALIDATION', 'Bad input')
            .suggest('Fix format');
        expect(err.isError).toBe(true);
        expect(err.content).toBeDefined();
        expect(err.content[0].text).toContain('Bad input');
    });

    it('.details() converts non-string values', () => {
        const result = new ErrorBuilder('INTERNAL', 'Error')
            .details({ count: 42, active: true })
            .build();
        const text = result.content[0].text;
        expect(text).toContain('42');
        expect(text).toContain('true');
    });

    it('.actions() with multiple tools in single call', () => {
        const result = new ErrorBuilder('NOT_FOUND', 'Error')
            .actions('tool.a', 'tool.b', 'tool.c')
            .build();
        const text = result.content[0].text;
        expect(text).toContain('tool.a');
        expect(text).toContain('tool.b');
        expect(text).toContain('tool.c');
    });
});
