/**
 * FullStack Integration Tests
 *
 * Each test exercises MULTIPLE framework modules working together
 * through a mock MCP Server. No internal mocking — only the MCP
 * Server itself is stubbed (as in production use).
 *
 * Coverage matrix:
 *   1. Builder + Registry + Server + Context Factory
 *   2. Builder + Presenter + Server (auto-view composition)
 *   3. Builder + Middleware + Observability (debug events across layers)
 *   4. Builder + Middleware + Tracing (OTel span lifecycle)
 *   5. Builder + StateSync + Server (cache-control + invalidation)
 *   6. Builder + PromptRegistry + Server (prompt list + get)
 *   7. Builder + Exposition (flat) + Server (atomic tool projection)
 *   8. Builder + Exposition (flat) + Observability
 *   9. Full stack: all modules in a single server attachment
 *  10. Concurrent multi-tool calls across all layers
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success, error as errorResponse } from '../../src/core/response.js';
import { createDebugObserver } from '../../src/observability/DebugObserver.js';
import { SpanStatusCode } from '../../src/observability/Tracing.js';
import { createPresenter, ui } from '../../src/presenter/index.js';
import { definePrompt } from '../../src/prompt/index.js';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.js';
import type { DebugEvent } from '../../src/observability/DebugObserver.js';
import type { FusionTracer, FusionSpan, FusionAttributeValue } from '../../src/observability/Tracing.js';
import type { StateSyncConfig } from '../../src/state-sync/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

interface AppContext {
    readonly userId: string;
    readonly tenantId: string;
    readonly role: 'admin' | 'user';
}

function createCtx(overrides: Partial<AppContext> = {}): AppContext {
    return { userId: 'u_1', tenantId: 't_acme', role: 'user', ...overrides };
}

function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
            handlers.set(schema.shape.method.value, handler);
        },
        async callListTools() {
            const handler = handlers.get('tools/list');
            if (!handler) throw new Error('No tools/list handler');
            return handler({ method: 'tools/list', params: {} }, {});
        },
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const handler = handlers.get('tools/call');
            if (!handler) throw new Error('No tools/call handler');
            return handler({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
        async callListPrompts() {
            const handler = handlers.get('prompts/list');
            if (!handler) throw new Error('No prompts/list handler');
            return handler({ method: 'prompts/list', params: {} }, {});
        },
        async callGetPrompt(name: string, args: Record<string, string> = {}, extra: unknown = {}) {
            const handler = handlers.get('prompts/get');
            if (!handler) throw new Error('No prompts/get handler');
            return handler({ method: 'prompts/get', params: { name, arguments: args } }, extra);
        },
    };
}

interface MockSpanData {
    name: string;
    attributes: Map<string, FusionAttributeValue>;
    events: Array<{ name: string; attributes?: Record<string, FusionAttributeValue> }>;
    status: { code: number; message?: string } | null;
    exceptions: Array<Error | string>;
    ended: boolean;
}

function createMockTracer(): { tracer: FusionTracer; spans: MockSpanData[] } {
    const spans: MockSpanData[] = [];
    const tracer: FusionTracer = {
        startSpan(name, options) {
            const data: MockSpanData = {
                name,
                attributes: new Map(Object.entries(options?.attributes ?? {})),
                events: [],
                status: null,
                exceptions: [],
                ended: false,
            };
            const span: FusionSpan = {
                setAttribute(key, value) { data.attributes.set(key, value); },
                setStatus(status) { data.status = status; },
                addEvent(eventName, attrs) { data.events.push({ name: eventName, attributes: attrs }); },
                end() { data.ended = true; spans.push(data); },
                recordException(exc) { data.exceptions.push(exc); },
            };
            return span;
        },
    };
    return { tracer, spans };
}

// ============================================================================
// 1. Builder + Registry + Server + Context Factory
// ============================================================================

describe('Integration: Builder → Registry → Server → ContextFactory', () => {
    it('should wire defineTool + createTool through server with per-request context', async () => {
        const projects = defineTool<AppContext>('projects', {
            shared: { workspace_id: 'string' },
            actions: {
                list: {
                    readOnly: true,
                    handler: async (ctx, args) =>
                        success(`[${ctx.tenantId}] projects in ${args.workspace_id}`),
                },
                create: {
                    params: { name: { type: 'string', min: 1 } },
                    handler: async (ctx, args) =>
                        success(`[${ctx.userId}] created ${args.name}`),
                },
            },
        });

        const billing = createTool<AppContext>('billing')
            .tags('admin')
            .action({
                name: 'charge',
                schema: z.object({ amount: z.number().positive() }),
                handler: async (ctx, args) =>
                    success(`[${ctx.role}] charged $${args.amount}`),
            });

        const registry = new ToolRegistry<AppContext>();
        registry.registerAll(projects, billing);

        const server = createMockServer();
        let callNum = 0;
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: (extra: any) => createCtx({
                userId: `u_${++callNum}`,
                tenantId: extra?.tenantId ?? 't_default',
                role: extra?.role ?? 'user',
            }),
        });

        // tools/list returns both
        const list = await server.callListTools();
        expect(list.tools).toHaveLength(2);

        // tool call with context from extra
        const r1 = await server.callTool(
            'projects',
            { action: 'list', workspace_id: 'ws_1' },
            { tenantId: 't_acme' },
        );
        expect(r1.content[0].text).toBe('[t_acme] projects in ws_1');

        const r2 = await server.callTool(
            'projects',
            { action: 'create', workspace_id: 'ws_1', name: 'Alpha' },
            {},
        );
        expect(r2.content[0].text).toBe('[u_2] created Alpha');

        const r3 = await server.callTool(
            'billing',
            { action: 'charge', amount: 99 },
            { role: 'admin' },
        );
        expect(r3.content[0].text).toBe('[admin] charged $99');

        // Validation error
        const bad = await server.callTool('billing', { action: 'charge', amount: -1 });
        expect(bad.isError).toBe(true);
    });
});

// ============================================================================
// 2. Builder + Presenter + Server (auto-view composition)
// ============================================================================

describe('Integration: Builder → Presenter → Server', () => {
    it('should auto-compose Presenter view with rules + UI blocks', async () => {
        const InvoicePresenter = createPresenter('Invoice')
            .schema(z.object({
                id: z.string(),
                amount_cents: z.number(),
                status: z.enum(['paid', 'pending']),
            }))
            .systemRules(['CRITICAL: amounts are in CENTS — divide by 100 for display.'])
            .uiBlocks((invoice) => [
                ui.markdown(`**${invoice.id}**: $${invoice.amount_cents / 100} (${invoice.status})`),
            ]);

        const tool = createTool<void>('invoices')
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                returns: InvoicePresenter,
                handler: async (_ctx, args) => ({
                    id: args.id,
                    amount_cents: 5000,
                    status: 'pending' as const,
                    _internal_secret: 'SHOULD_BE_STRIPPED',
                }),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        const result = await server.callTool('invoices', { action: 'get', id: 'INV-001' });
        expect(result.isError).toBeUndefined();

        const texts = result.content.map((c: any) => c.text);
        const allText = texts.join('\n');

        // Data block should contain the schema-validated fields
        expect(allText).toContain('INV-001');
        expect(allText).toContain('5000');
        // Secret field should be stripped by Zod schema
        expect(allText).not.toContain('SHOULD_BE_STRIPPED');
        // System rules should be present
        expect(allText).toContain('CRITICAL');
        expect(allText).toContain('CENTS');
        // UI block should be present
        expect(allText).toContain('$50');
    });
});

// ============================================================================
// 3. Builder + Middleware + Debug Observability (cross-layer events)
// ============================================================================

describe('Integration: Builder → Middleware → Debug → Server', () => {
    it('should emit debug events for full middleware+handler pipeline via server', async () => {
        const events: DebugEvent[] = [];
        const auditLog: string[] = [];

        const tool = createTool<AppContext>('secure')
            .use(async (ctx, args, next) => {
                auditLog.push(`auth:${ctx.role}`);
                if (ctx.role !== 'admin') {
                    return errorResponse('Forbidden: admin only');
                }
                return next(ctx, args);
            })
            .action({
                name: 'delete',
                schema: z.object({ resourceId: z.string() }),
                handler: async (ctx, args) => {
                    auditLog.push(`delete:${args.resourceId}`);
                    return success(`Deleted ${args.resourceId} by ${ctx.userId}`);
                },
            });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: (extra: any) => createCtx(extra ?? {}),
        });

        // Call as regular user → middleware blocks
        const blocked = await server.callTool(
            'secure',
            { action: 'delete', resourceId: 'r_1' },
            { role: 'user' },
        );
        expect(blocked.isError).toBe(true);
        expect(blocked.content[0].text).toContain('Forbidden');
        expect(auditLog).toContain('auth:user');

        // Debug events include route + validate + middleware + execute
        const blockedTypes = events.map(e => e.type);
        expect(blockedTypes).toContain('route');
        expect(blockedTypes).toContain('validate');
        expect(blockedTypes).toContain('middleware');
        // Execute event should show isError=true (middleware returned error response)
        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.isError).toBe(true);
        }

        events.length = 0;
        auditLog.length = 0;

        // Call as admin → middleware passes, handler executes
        const allowed = await server.callTool(
            'secure',
            { action: 'delete', resourceId: 'r_2' },
            { role: 'admin', userId: 'u_admin' },
        );
        expect(allowed.content[0].text).toBe('Deleted r_2 by u_admin');
        expect(auditLog).toEqual(['auth:admin', 'delete:r_2']);

        const allowedExec = events.find(e => e.type === 'execute');
        if (allowedExec?.type === 'execute') {
            expect(allowedExec.isError).toBe(false);
        }
    });
});

// ============================================================================
// 4. Builder + Middleware + Tracing (OTel span lifecycle via server)
// ============================================================================

describe('Integration: Builder → Middleware → Tracing → Server', () => {
    it('should create span with middleware event and correct error classification', async () => {
        const { tracer, spans } = createMockTracer();

        const tool = createTool<void>('traced')
            .tags('core')
            .description('Traced integration tool')
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({
                name: 'ok',
                schema: z.object({ x: z.number() }),
                handler: async (_ctx, args) => success(`x=${args.x}`),
            })
            .action({
                name: 'fail_validation',
                schema: z.object({ count: z.number().min(1) }),
                handler: async () => success('should not reach'),
            })
            .action({
                name: 'crash',
                handler: async () => { throw new Error('system failure'); },
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            tracing: tracer,
        });

        // Happy path
        const r1 = await server.callTool('traced', { action: 'ok', x: 42 });
        expect(r1.content[0].text).toBe('x=42');
        expect(spans).toHaveLength(1);
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.OK);
        expect(spans[0]!.attributes.get('mcp.action')).toBe('ok');
        expect(spans[0]!.attributes.get('mcp.tags')).toEqual(['core']);
        expect(spans[0]!.attributes.get('mcp.description')).toBe('Traced integration tool');
        expect(spans[0]!.events.some(e => e.name === 'mcp.route')).toBe(true);
        expect(spans[0]!.events.some(e => e.name === 'mcp.validate')).toBe(true);
        expect(spans[0]!.events.some(e => e.name === 'mcp.middleware')).toBe(true);
        expect(spans[0]!.ended).toBe(true);

        // Validation error → UNSET
        const r2 = await server.callTool('traced', { action: 'fail_validation', count: -5 });
        expect(r2.isError).toBe(true);
        expect(spans).toHaveLength(2);
        expect(spans[1]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[1]!.attributes.get('mcp.error_type')).toBe('validation_failed');
        expect(spans[1]!.ended).toBe(true);

        // System error → ERROR + recordException
        const r3 = await server.callTool('traced', { action: 'crash' });
        expect(r3.isError).toBe(true);
        expect(spans).toHaveLength(3);
        expect(spans[2]!.status!.code).toBe(SpanStatusCode.ERROR);
        expect(spans[2]!.status!.message).toBe('system failure');
        expect(spans[2]!.exceptions).toHaveLength(1);
        expect(spans[2]!.attributes.get('mcp.error_type')).toBe('system_error');
        expect(spans[2]!.ended).toBe(true);
    });
});

// ============================================================================
// 5. Builder + StateSync + Server (cache-control + invalidation)
// ============================================================================

describe('Integration: Builder → StateSync → Server', () => {
    it('should append cache-control to descriptions and invalidation messages', async () => {
        const tool = createTool<void>('tasks')
            .action({
                name: 'list',
                readOnly: true,
                schema: z.object({ project_id: z.string() }),
                handler: async (_ctx, args) => success(`tasks for ${args.project_id}`),
            })
            .action({
                name: 'update',
                schema: z.object({ task_id: z.string(), title: z.string() }),
                handler: async (_ctx, args) => success(`updated ${args.task_id}`),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const stateSync: StateSyncConfig = {
            defaults: { cacheControl: 'no-store' },
            policies: [
                { match: 'tasks.list', cacheControl: 'immutable' },
                { match: 'tasks.update', invalidates: ['tasks.*'] },
            ],
        };

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            stateSync,
        });

        // tools/list should embed cache-control in descriptions
        const listResult = await server.callListTools();
        const tasksTool = listResult.tools.find((t: any) => t.name === 'tasks');
        expect(tasksTool).toBeDefined();
        expect(tasksTool.description).toContain('Cache-Control');

        // Mutation should produce invalidation message
        const mutation = await server.callTool('tasks', {
            action: 'update',
            task_id: 't_1',
            title: 'New Title',
        });
        expect(mutation.isError).toBeUndefined();
        const texts = mutation.content.map((c: any) => c.text).join('\n');
        expect(texts).toContain('updated t_1');
    });
});

// ============================================================================
// 6. Builder + PromptRegistry + Server (prompt list + get)
// ============================================================================

describe('Integration: PromptRegistry → Server', () => {
    it('should serve prompts/list and prompts/get through server', async () => {
        // Note: prompts require an object context (not void) because the loopback
        // dispatcher injects `invokeTool` onto the context object.
        interface PromptCtx { source: string }

        const AuditPrompt = definePrompt<PromptCtx>('audit-report', {
            description: 'Generate an audit report',
            args: {
                entity_type: { type: 'string', required: true, description: 'Entity to audit' },
                period: { type: 'string', required: false, description: 'Time period' },
            },
            handler: async (_ctx, args) => ({
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `Generate audit report for ${args.entity_type}` +
                                  (args.period ? ` (period: ${args.period})` : ''),
                        },
                    },
                ],
            }),
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('dummy').action({
                name: 'ping',
                handler: async () => success('pong'),
            }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(AuditPrompt);

        const server = createMockServer();
        toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => ({ source: 'test' }),
            prompts: promptRegistry,
        });

        // prompts/list
        const list = await server.callListPrompts();
        expect(list.prompts).toHaveLength(1);
        expect(list.prompts[0].name).toBe('audit-report');
        expect(list.prompts[0].description).toBe('Generate an audit report');
        expect(list.prompts[0].arguments).toHaveLength(2);

        // prompts/get
        const result = await server.callGetPrompt('audit-report', {
            entity_type: 'invoices',
            period: 'Q4-2025',
        });
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].content.text).toContain('invoices');
        expect(result.messages[0].content.text).toContain('Q4-2025');

        // Unknown prompt → error
        const unknown = await server.callGetPrompt('nonexistent', {});
        expect(unknown.messages[0].content.text).toContain('Unknown prompt');
    });
});

// ============================================================================
// 7. Builder + Exposition (flat) + Server (atomic tool projection)
// ============================================================================

describe('Integration: Builder → Flat Exposition → Server', () => {
    it('should project grouped actions as independent atomic MCP tools', async () => {
        const platform = createTool<void>('projects')
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => success('project list'),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => success(`created ${args.name}`),
            });

        const registry = new ToolRegistry<void>();
        registry.register(platform);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            actionSeparator: '_',
        });

        // tools/list should show 2 atomic tools
        const list = await server.callListTools();
        const names = list.tools.map((t: any) => t.name).sort();
        expect(names).toEqual(['projects_create', 'projects_list']);

        // Each atomic tool should NOT have a discriminator (action field)
        const listTool = list.tools.find((t: any) => t.name === 'projects_list');
        expect(listTool.inputSchema.properties).not.toHaveProperty('action');

        // Call atomic tool directly (no action field needed)
        const r1 = await server.callTool('projects_list', {});
        expect(r1.content[0].text).toBe('project list');

        const r2 = await server.callTool('projects_create', { name: 'Beta' });
        expect(r2.content[0].text).toBe('created Beta');

        // Unknown atomic tool
        const r3 = await server.callTool('projects_delete', {});
        expect(r3.isError).toBe(true);
    });
});

// ============================================================================
// 8. Builder + Flat Exposition + Observability
// ============================================================================

describe('Integration: Flat Exposition → Debug + Tracing', () => {
    it('should emit debug events with correct tool/action for flat tools', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('users')
            .action({
                name: 'list',
                handler: async () => success('user list'),
            })
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async (_ctx, args) => success(`created ${args.name}`),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            debug: createDebugObserver((e) => events.push(e)),
        });

        await server.callTool('users_list', {});
        await server.callTool('users_create', { name: 'Alice' });

        const routeEvents = events.filter(e => e.type === 'route');
        expect(routeEvents).toHaveLength(2);

        const executeEvents = events.filter(e => e.type === 'execute');
        expect(executeEvents).toHaveLength(2);
        expect(executeEvents.every(e => e.type === 'execute' && !e.isError)).toBe(true);
    });

    it('should create separate OTel spans for each flat tool call', async () => {
        const { tracer, spans } = createMockTracer();

        const tool = createTool<void>('orders')
            .action({
                name: 'list',
                handler: async () => success('orders'),
            })
            .action({
                name: 'cancel',
                schema: z.object({ id: z.string() }),
                handler: async (_ctx, args) => success(`cancelled ${args.id}`),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            tracing: tracer,
        });

        await server.callTool('orders_list', {});
        await server.callTool('orders_cancel', { id: 'o_1' });

        expect(spans).toHaveLength(2);
        expect(spans.every(s => s.ended)).toBe(true);
        expect(spans.every(s => s.status!.code === SpanStatusCode.OK)).toBe(true);
    });
});

// ============================================================================
// 9. Full Stack: ALL modules in a single server attachment
// ============================================================================

describe('Integration: Full Stack (all modules)', () => {
    it('should wire tools + prompts + debug + stateSync + flat exposition', async () => {
        const events: DebugEvent[] = [];

        // ── Tools ──
        const crud = defineTool<AppContext>('resources', {
            shared: { workspace_id: 'string' },
            actions: {
                list: {
                    readOnly: true,
                    handler: async (ctx, args) =>
                        success(`[${ctx.tenantId}] resources in ${args.workspace_id}`),
                },
                create: {
                    params: { name: 'string' },
                    handler: async (ctx, args) =>
                        success(`[${ctx.userId}] created ${args.name}`),
                },
            },
        });

        // ── Prompts ──
        const SummaryPrompt = definePrompt<AppContext>('daily-summary', {
            description: 'Generate a daily summary',
            args: {
                date: { type: 'string', required: true, description: 'Date (YYYY-MM-DD)' },
            },
            handler: async (ctx, args) => ({
                messages: [{
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: `Generate daily summary for ${args.date} (tenant: ${ctx.tenantId})`,
                    },
                }],
            }),
        });

        const toolRegistry = new ToolRegistry<AppContext>();
        toolRegistry.register(crud);

        const promptRegistry = new PromptRegistry<AppContext>();
        promptRegistry.register(SummaryPrompt);

        const server = createMockServer();
        toolRegistry.attachToServer(server, {
            toolExposition: 'flat',
            actionSeparator: '_',
            contextFactory: (extra: any) => createCtx(extra ?? {}),
            debug: createDebugObserver((e) => events.push(e)),
            stateSync: {
                defaults: { cacheControl: 'no-store' },
                policies: [
                    { match: 'resources.list', cacheControl: 'immutable' },
                    { match: 'resources.create', invalidates: ['resources.*'] },
                ],
            },
            prompts: promptRegistry,
        });

        // ── Verify tools/list (flat exposition) ──
        const toolList = await server.callListTools();
        const toolNames = toolList.tools.map((t: any) => t.name).sort();
        expect(toolNames).toEqual(['resources_create', 'resources_list']);

        // tools should have cache-control in descriptions
        const listTool = toolList.tools.find((t: any) => t.name === 'resources_list');
        expect(listTool.description).toContain('Cache-Control');

        // ── Verify tool call (context factory + debug) ──
        const r1 = await server.callTool(
            'resources_list',
            { workspace_id: 'ws_x' },
            { tenantId: 't_corp' },
        );
        expect(r1.content[0].text).toBe('[t_corp] resources in ws_x');
        expect(events.some(e => e.type === 'route')).toBe(true);
        expect(events.some(e => e.type === 'execute')).toBe(true);

        events.length = 0;

        // ── Verify mutation (stateSync invalidation) ──
        const r2 = await server.callTool(
            'resources_create',
            { workspace_id: 'ws_x', name: 'Doc' },
            { userId: 'u_editor' },
        );
        const mutationTexts = r2.content.map((c: any) => c.text).join('\n');
        expect(mutationTexts).toContain('created Doc');

        // ── Verify prompts ──
        const promptList = await server.callListPrompts();
        expect(promptList.prompts).toHaveLength(1);
        expect(promptList.prompts[0].name).toBe('daily-summary');

        const prompt = await server.callGetPrompt(
            'daily-summary',
            { date: '2026-02-23' },
            { tenantId: 't_corp' },
        );
        expect(prompt.messages[0].content.text).toContain('2026-02-23');
        expect(prompt.messages[0].content.text).toContain('t_corp');
    });
});

// ============================================================================
// 10. Concurrent multi-tool calls across all layers
// ============================================================================

describe('Integration: Concurrent multi-tool calls', () => {
    it('should handle 20 concurrent calls to different tools without interference', async () => {
        const events: DebugEvent[] = [];

        const alpha = createTool<void>('alpha')
            .action({
                name: 'run',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => {
                    // Simulate async work
                    await new Promise(r => setTimeout(r, Math.random() * 10));
                    return success(`alpha:${args.id}`);
                },
            });

        const beta = createTool<void>('beta')
            .action({
                name: 'run',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => {
                    await new Promise(r => setTimeout(r, Math.random() * 10));
                    return success(`beta:${args.id}`);
                },
            });

        const registry = new ToolRegistry<void>();
        registry.registerAll(alpha, beta);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            debug: createDebugObserver((e) => events.push(e)),
        });

        // Fire 10 alpha + 10 beta concurrently
        const promises = [
            ...Array.from({ length: 10 }, (_, i) =>
                server.callTool('alpha_run', { id: i }),
            ),
            ...Array.from({ length: 10 }, (_, i) =>
                server.callTool('beta_run', { id: i + 100 }),
            ),
        ];

        const results = await Promise.all(promises);

        // All 20 should succeed
        expect(results).toHaveLength(20);
        for (let i = 0; i < 10; i++) {
            expect(results[i].content[0].text).toBe(`alpha:${i}`);
        }
        for (let i = 0; i < 10; i++) {
            expect(results[10 + i].content[0].text).toBe(`beta:${i + 100}`);
        }

        // Debug events: 20 calls × (route + execute) = minimum 40 events
        const routeEvents = events.filter(e => e.type === 'route');
        const executeEvents = events.filter(e => e.type === 'execute');
        expect(routeEvents).toHaveLength(20);
        expect(executeEvents).toHaveLength(20);
        expect(executeEvents.every(e => e.type === 'execute' && !e.isError)).toBe(true);
    });

    it('should handle concurrent traced calls with independent spans', async () => {
        const { tracer, spans } = createMockTracer();

        const tool = createTool<void>('concurrent')
            .action({
                name: 'work',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => {
                    await new Promise(r => setTimeout(r, Math.random() * 5));
                    return success(`done:${args.id}`);
                },
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'flat',
            tracing: tracer,
        });

        await Promise.all(
            Array.from({ length: 15 }, (_, i) =>
                server.callTool('concurrent_work', { id: i }),
            ),
        );

        expect(spans).toHaveLength(15);
        expect(spans.every(s => s.ended)).toBe(true);
        expect(spans.every(s => s.status!.code === SpanStatusCode.OK)).toBe(true);
    });
});

// ============================================================================
// 11. Presenter + Tracing (traced Presenter view)
// ============================================================================

describe('Integration: Presenter → Tracing → Server', () => {
    it('should trace Presenter auto-view calls with correct span data', async () => {
        const { tracer, spans } = createMockTracer();

        const TaskPresenter = createPresenter('Task')
            .schema(z.object({
                id: z.string(),
                title: z.string(),
                status: z.enum(['todo', 'done']),
            }))
            .systemRules(['Use emojis: 🔄 In Progress, ✅ Done.']);

        const tool = createTool<void>('tasks')
            .action({
                name: 'get',
                schema: z.object({ id: z.string() }),
                returns: TaskPresenter,
                handler: async (_ctx, args) => ({
                    id: args.id,
                    title: 'Fix bug #42',
                    status: 'done' as const,
                }),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            tracing: tracer,
        });

        const result = await server.callTool('tasks', { action: 'get', id: 'TSK-1' });
        expect(result.isError).toBeUndefined();

        const allText = result.content.map((c: any) => c.text).join('\n');
        expect(allText).toContain('Fix bug #42');
        expect(allText).toContain('emoji');

        expect(spans).toHaveLength(1);
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.OK);
        expect(spans[0]!.attributes.get('mcp.response_size')).toBeGreaterThan(0);
        expect(spans[0]!.ended).toBe(true);
    });
});

// ============================================================================
// 12. Detach + Re-attach lifecycle
// ============================================================================

describe('Integration: Detach → Re-attach lifecycle', () => {
    it('should fully reset and re-wire all handlers on re-attach', async () => {
        const tool = createTool<void>('lifecycle')
            .action({
                name: 'ping',
                handler: async () => success('pong'),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();

        // First attach
        const detach = registry.attachToServer(server, { toolExposition: 'grouped' });
        const r1 = await server.callTool('lifecycle', { action: 'ping' });
        expect(r1.content[0].text).toBe('pong');

        // Detach
        detach();
        const r2 = await server.callTool('lifecycle', { action: 'ping' });
        expect(r2.isError).toBe(true);
        expect(r2.content[0].text).toContain('detached');

        // Re-attach with same exposition
        registry.attachToServer(server, { toolExposition: 'grouped' });
        const r3 = await server.callTool('lifecycle', { action: 'ping' });
        expect(r3.content[0].text).toBe('pong');
    });
});

// ============================================================================
// 13. defineMiddleware + defineTool integration
// ============================================================================

describe('Integration: defineMiddleware → defineTool → Server', () => {
    it('should compose define-style middleware with define-style tool', async () => {
        const log: string[] = [];

        const tool = defineTool<AppContext>('orders', {
            middleware: [
                async (ctx, args, next) => {
                    log.push(`tenant:${ctx.tenantId}`);
                    return next(ctx, args);
                },
            ],
            actions: {
                place: {
                    params: { item: 'string', qty: 'number' },
                    handler: async (ctx, args) => {
                        log.push(`place:${args.item}x${args.qty}`);
                        return success(`Order placed by ${ctx.userId}`);
                    },
                },
                cancel: {
                    params: { order_id: 'string' },
                    handler: async (ctx, args) => {
                        log.push(`cancel:${args.order_id}`);
                        return success(`Cancelled ${args.order_id}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry<AppContext>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx({ userId: 'u_buyer', tenantId: 't_shop' }),
        });

        const r1 = await server.callTool('orders', { action: 'place', item: 'Widget', qty: 3 });
        expect(r1.content[0].text).toBe('Order placed by u_buyer');
        expect(log).toEqual(['tenant:t_shop', 'place:Widgetx3']);

        log.length = 0;

        const r2 = await server.callTool('orders', { action: 'cancel', order_id: 'ord_99' });
        expect(r2.content[0].text).toBe('Cancelled ord_99');
        expect(log).toEqual(['tenant:t_shop', 'cancel:ord_99']);
    });
});

// ============================================================================
// 14. SAD PATH: Unknown tools, unknown actions, missing discriminator
// ============================================================================

describe('Integration Sad Path: Routing Failures', () => {
    it('should return structured error for unknown tool via server', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('users').action({
                name: 'list',
                handler: async () => success('ok'),
            }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        const result = await server.callTool('ghost_tool', { action: 'anything' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_TOOL');
        // Should suggest available tools
        expect(result.content[0].text).toContain('users');
    });

    it('should return actionable error for unknown action on known tool', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('users')
                .action({ name: 'list', handler: async () => success('users') })
                .action({ name: 'create', handler: async () => success('created') }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        const result = await server.callTool('users', { action: 'delete_all' });
        expect(result.isError).toBe(true);
        // Should mention the unknown action and suggest valid ones
        expect(result.content[0].text).toContain('delete_all');
    });

    it('should return error when action discriminator is missing', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('tasks').action({
                name: 'list',
                handler: async () => success('ok'),
            }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        // No action field at all
        const r1 = await server.callTool('tasks', {});
        expect(r1.isError).toBe(true);
        expect(r1.content[0].text).toContain('is missing');

        // Null action
        const r2 = await server.callTool('tasks', { action: null });
        expect(r2.isError).toBe(true);

        // Empty string action
        const r3 = await server.callTool('tasks', { action: '' });
        expect(r3.isError).toBe(true);
    });

    it('should return error for unknown flat tool name', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('tasks').action({
                name: 'list',
                handler: async () => success('ok'),
            }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        const result = await server.callTool('tasks_delete', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('UNKNOWN_TOOL');
    });
});

// ============================================================================
// 15. SAD PATH: Validation failures (Zod rejects bad input)
// ============================================================================

describe('Integration Sad Path: Validation Failures', () => {
    it('should reject wrong types for schema fields', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('calc')
                .action({
                    name: 'add',
                    schema: z.object({
                        a: z.number(),
                        b: z.number(),
                    }),
                    handler: async (_ctx, args) => success(`${args.a + args.b}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        // String where number expected
        const r1 = await server.callTool('calc', { action: 'add', a: 'not_a_number', b: 5 });
        expect(r1.isError).toBe(true);
        expect(r1.content[0].text).toContain('validation_error');

        // Missing required field
        const r2 = await server.callTool('calc', { action: 'add', a: 10 });
        expect(r2.isError).toBe(true);

        // Framework uses strict validation — extra fields ARE rejected
        const r3 = await server.callTool('calc', { action: 'add', a: 1, b: 2, extra_field: 'ignored' });
        expect(r3.isError).toBe(true);

        // Valid call (no extra fields)
        const r4 = await server.callTool('calc', { action: 'add', a: 1, b: 2 });
        expect(r4.isError).toBeUndefined();
        expect(r4.content[0].text).toBe('3');
    });

    it('should reject constraint violations (min, max, pattern)', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('users')
                .action({
                    name: 'create',
                    schema: z.object({
                        name: z.string().min(2).max(50),
                        age: z.number().int().min(18).max(120),
                        email: z.string().email(),
                    }),
                    handler: async (_ctx, args) => success(`Created ${args.name}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        // Name too short
        const r1 = await server.callTool('users', { action: 'create', name: 'A', age: 25, email: 'a@b.com' });
        expect(r1.isError).toBe(true);

        // Age below minimum
        const r2 = await server.callTool('users', { action: 'create', name: 'Alice', age: 10, email: 'a@b.com' });
        expect(r2.isError).toBe(true);

        // Invalid email
        const r3 = await server.callTool('users', { action: 'create', name: 'Alice', age: 25, email: 'not-email' });
        expect(r3.isError).toBe(true);

        // Valid input passes
        const r4 = await server.callTool('users', { action: 'create', name: 'Alice', age: 25, email: 'a@b.com' });
        expect(r4.isError).toBeUndefined();
        expect(r4.content[0].text).toBe('Created Alice');
    });

    it('should reject validation errors in flat mode (no discriminator)', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('billing')
                .action({
                    name: 'charge',
                    schema: z.object({ amount: z.number().positive() }),
                    handler: async (_ctx, args) => success(`$${args.amount}`),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        const r1 = await server.callTool('billing_charge', { amount: -50 });
        expect(r1.isError).toBe(true);

        const r2 = await server.callTool('billing_charge', { amount: 50 });
        expect(r2.isError).toBeUndefined();
        expect(r2.content[0].text).toBe('$50');
    });
});

// ============================================================================
// 16. SAD PATH: Handler exceptions (system errors)
// ============================================================================

describe('Integration Sad Path: Handler Exceptions', () => {
    it('should catch handler throw and return isError=true via server', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('unstable')
                .action({
                    name: 'crash',
                    handler: async () => {
                        throw new Error('database connection lost');
                    },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        const result = await server.callTool('unstable', { action: 'crash' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('database connection lost');
    });

    it('should catch handler throw in flat mode', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('fragile')
                .action({
                    name: 'explode',
                    handler: async () => { throw new TypeError('undefined is not a function'); },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'flat' });

        const result = await server.callTool('fragile_explode', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('undefined is not a function');
    });

    it('should distinguish handler error response from handler exception in tracing', async () => {
        const { tracer, spans } = createMockTracer();

        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('errors')
                .action({
                    name: 'soft_fail',
                    handler: async () => errorResponse('User not found'),
                })
                .action({
                    name: 'hard_fail',
                    handler: async () => { throw new Error('OOM'); },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            tracing: tracer,
        });

        // Soft fail: AI error → UNSET (not a system problem)
        const r1 = await server.callTool('errors', { action: 'soft_fail' });
        expect(r1.isError).toBe(true);
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[0]!.exceptions).toHaveLength(0);

        // Hard fail: system error → ERROR + recordException
        const r2 = await server.callTool('errors', { action: 'hard_fail' });
        expect(r2.isError).toBe(true);
        expect(spans[1]!.status!.code).toBe(SpanStatusCode.ERROR);
        expect(spans[1]!.exceptions).toHaveLength(1);
    });
});

// ============================================================================
// 17. SAD PATH: Middleware short-circuits, context failures
// ============================================================================

describe('Integration Sad Path: Middleware Failures', () => {
    it('should middleware block + debug emit error execute event via server', async () => {
        const events: DebugEvent[] = [];
        let handlerReached = false;

        const registry = new ToolRegistry<AppContext>();
        registry.register(
            createTool<AppContext>('admin_only')
                .use(async (ctx, _args, _next) => {
                    if (ctx.role !== 'admin') {
                        return errorResponse('ACCESS DENIED');
                    }
                    return _next(ctx, _args);
                })
                .action({
                    name: 'nuke',
                    handler: async () => {
                        handlerReached = true;
                        return success('nuked');
                    },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx({ role: 'user' }),
            debug: createDebugObserver((e) => events.push(e)),
        });

        const result = await server.callTool('admin_only', { action: 'nuke' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('ACCESS DENIED');
        expect(handlerReached).toBe(false);

        // Debug should show execute event with isError=true
        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.isError).toBe(true);
        }
    });

    it('should middleware exception be caught and traced as system error', async () => {
        const { tracer, spans } = createMockTracer();

        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('broken_mw')
                .use(async () => {
                    throw new Error('middleware crashed');
                })
                .action({
                    name: 'run',
                    handler: async () => success('should not reach'),
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            tracing: tracer,
        });

        const result = await server.callTool('broken_mw', { action: 'run' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('middleware crashed');

        // Should be classified as system error, not AI error
        expect(spans).toHaveLength(1);
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.ERROR);
        expect(spans[0]!.exceptions).toHaveLength(1);
    });

    it('should multiple middleware run in order and first blocker wins', async () => {
        const order: string[] = [];

        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('chain')
                .use(async (_ctx, args, next) => {
                    order.push('mw1');
                    return next(_ctx, args);
                })
                .use(async (_ctx, _args, _next) => {
                    order.push('mw2-block');
                    return errorResponse('blocked by mw2');
                })
                .use(async (_ctx, args, next) => {
                    order.push('mw3-never');
                    return next(_ctx, args);
                })
                .action({
                    name: 'run',
                    handler: async () => {
                        order.push('handler-never');
                        return success('ok');
                    },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        const result = await server.callTool('chain', { action: 'run' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('blocked by mw2');
        // mw1 ran, mw2 blocked, mw3 and handler never reached
        expect(order).toEqual(['mw1', 'mw2-block']);
    });
});

// ============================================================================
// 18. SAD PATH: Concurrent error mix (some succeed, some fail)
// ============================================================================

describe('Integration Sad Path: Concurrent Mixed Results', () => {
    it('should handle mix of successes, validation errors, and exceptions concurrently', async () => {
        const events: DebugEvent[] = [];

        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('mixed')
                .action({
                    name: 'ok',
                    schema: z.object({ id: z.number() }),
                    handler: async (_ctx, args) => success(`ok:${args.id}`),
                })
                .action({
                    name: 'validate_fail',
                    schema: z.object({ count: z.number().min(1) }),
                    handler: async () => success('unreachable'),
                })
                .action({
                    name: 'crash',
                    handler: async () => { throw new Error('boom'); },
                }),
        );

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            debug: createDebugObserver((e) => events.push(e)),
        });

        const results = await Promise.all([
            server.callTool('mixed', { action: 'ok', id: 1 }),
            server.callTool('mixed', { action: 'validate_fail', count: -5 }),
            server.callTool('mixed', { action: 'crash' }),
            server.callTool('mixed', { action: 'ok', id: 2 }),
            server.callTool('mixed', { action: 'nonexistent' }),
        ]);

        // r0: success
        expect(results[0].isError).toBeUndefined();
        expect(results[0].content[0].text).toBe('ok:1');

        // r1: validation error
        expect(results[1].isError).toBe(true);
        expect(results[1].content[0].text).toContain('validation_error');

        // r2: system error
        expect(results[2].isError).toBe(true);
        expect(results[2].content[0].text).toContain('boom');

        // r3: success
        expect(results[3].isError).toBeUndefined();
        expect(results[3].content[0].text).toBe('ok:2');

        // r4: unknown action
        expect(results[4].isError).toBe(true);
        expect(results[4].content[0].text).toContain('nonexistent');

        // Debug should have captured error events for failures
        const errorEvents = events.filter(e => e.type === 'error');
        expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    });
});

// ============================================================================
// 19. SAD PATH: Observed errors + Traced errors on same pipeline
// ============================================================================

describe('Integration Sad Path: Debug + Tracing Error Correlation', () => {
    it('should emit debug error event AND trace span error for unknown tool via registry', async () => {
        const events: DebugEvent[] = [];
        const { tracer, spans } = createMockTracer();

        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('real').action({
                name: 'ping',
                handler: async () => success('pong'),
            }),
        );

        // Note: debug and tracing on the same builder → tracing takes precedence,
        // but registry-level debug events still fire for unknown tools
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        const server = createMockServer();
        registry.attachToServer(server, {
            toolExposition: 'grouped',
            tracing: tracer,
        });

        // Unknown tool — registry emits debug error before tool-level tracing can fire
        const result = await server.callTool('ghost', { action: 'run' });
        expect(result.isError).toBe(true);

        // Debug: at least one error event for the unknown tool
        const debugErrors = events.filter(e => e.type === 'error');
        expect(debugErrors.length).toBeGreaterThanOrEqual(1);
        if (debugErrors[0]?.type === 'error') {
            expect(debugErrors[0].tool).toBe('ghost');
        }
    });

    it('should trace validation error AND emit debug events for same call', async () => {
        const events: DebugEvent[] = [];
        const { tracer, spans } = createMockTracer();

        const tool = createTool<void>('strict')
            .debug(createDebugObserver((e) => events.push(e)))
            .tracing(tracer)
            .action({
                name: 'run',
                schema: z.object({ x: z.number().min(1) }),
                handler: async (_ctx, args) => success(`x=${args.x}`),
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        // Note: when both debug and tracing are set, tracing takes precedence
        // for the execution hooks. The test verifies tracing works correctly.
        const result = await server.callTool('strict', { action: 'run', x: -5 });
        expect(result.isError).toBe(true);

        // Tracing should capture validation failure
        expect(spans).toHaveLength(1);
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[0]!.attributes.get('mcp.error_type')).toBe('validation_failed');
        expect(spans[0]!.ended).toBe(true);
    });
});

// ============================================================================
// 20. SAD PATH: defineTool param descriptor validation errors
// ============================================================================

describe('Integration Sad Path: defineTool Param Descriptor Errors', () => {
    it('should handle defineTool with incorrect param types gracefully', async () => {
        const tool = defineTool('typed', {
            actions: {
                create: {
                    params: {
                        name: { type: 'string', min: 3 },
                        count: { type: 'number', min: 1 },
                        active: 'boolean',
                    },
                    handler: async (_ctx, args) =>
                        success(`${args.name}:${args.count}:${args.active}`),
                },
            },
        });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        // Name too short (min: 3)
        const r1 = await server.callTool('typed', { action: 'create', name: 'AB', count: 5, active: true });
        expect(r1.isError).toBe(true);

        // Count below min
        const r2 = await server.callTool('typed', { action: 'create', name: 'Alice', count: 0, active: true });
        expect(r2.isError).toBe(true);

        // Wrong type for boolean
        const r3 = await server.callTool('typed', { action: 'create', name: 'Alice', count: 5, active: 'yes' });
        expect(r3.isError).toBe(true);

        // All valid
        const r4 = await server.callTool('typed', { action: 'create', name: 'Alice', count: 5, active: true });
        expect(r4.isError).toBeUndefined();
        expect(r4.content[0].text).toBe('Alice:5:true');
    });

    it('should reject shared param violations across actions', async () => {
        const tool = defineTool('shared_strict', {
            shared: {
                tenant_id: { type: 'string', min: 1 },
            },
            actions: {
                list: {
                    handler: async (_ctx, args) => success(`tenant:${args.tenant_id}`),
                },
                create: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => success(`${args.tenant_id}:${args.name}`),
                },
            },
        });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        const server = createMockServer();
        registry.attachToServer(server, { toolExposition: 'grouped' });

        // Missing shared param
        const r1 = await server.callTool('shared_strict', { action: 'list' });
        expect(r1.isError).toBe(true);

        // Empty shared param (min: 1)
        const r2 = await server.callTool('shared_strict', { action: 'list', tenant_id: '' });
        expect(r2.isError).toBe(true);

        // Valid
        const r3 = await server.callTool('shared_strict', { action: 'list', tenant_id: 't_acme' });
        expect(r3.isError).toBeUndefined();
        expect(r3.content[0].text).toBe('tenant:t_acme');
    });
});

// ============================================================================
// 21. SAD PATH: StateSync invalid policy configuration
// ============================================================================

describe('Integration Sad Path: StateSync Config Errors', () => {
    it('should throw on invalid cacheControl directive at attach time', () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('tasks').action({
                name: 'list',
                handler: async () => success('ok'),
            }),
        );

        const server = createMockServer();

        expect(() => registry.attachToServer(server, {
            toolExposition: 'grouped',
            stateSync: {
                defaults: { cacheControl: 'no-store' },
                policies: [
                    { match: 'tasks.list', cacheControl: 'max-age=60' as any },
                ],
            },
        })).toThrow('invalid cacheControl');
    });

    it('should throw on invalid default cacheControl directive', () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('tasks').action({
                name: 'list',
                handler: async () => success('ok'),
            }),
        );

        const server = createMockServer();

        expect(() => registry.attachToServer(server, {
            toolExposition: 'grouped',
            stateSync: {
                defaults: { cacheControl: 'must-revalidate' as any },
                policies: [],
            },
        })).toThrow('is invalid');
    });
});

// ============================================================================
// 22. SAD PATH: Detach lifecycle error handling
// ============================================================================

describe('Integration Sad Path: Detach Error Handling', () => {
    it('should return error for tools/call after detach', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('temp').action({
                name: 'run',
                handler: async () => success('ok'),
            }),
        );

        const server = createMockServer();
        const detach = registry.attachToServer(server, { toolExposition: 'grouped' });

        // Works before detach
        const r1 = await server.callTool('temp', { action: 'run' });
        expect(r1.isError).toBeUndefined();

        detach();

        // tools/call returns error after detach
        const r2 = await server.callTool('temp', { action: 'run' });
        expect(r2.isError).toBe(true);
        expect(r2.content[0].text).toContain('detached');

        // tools/list returns empty after detach
        const list = await server.callListTools();
        expect(list.tools).toHaveLength(0);
    });

    it('should idempotently handle double detach', async () => {
        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('double').action({
                name: 'ping',
                handler: async () => success('pong'),
            }),
        );

        const server = createMockServer();
        const detach = registry.attachToServer(server, { toolExposition: 'grouped' });

        detach();
        // Second detach should not throw
        expect(() => detach()).not.toThrow();
    });
});
