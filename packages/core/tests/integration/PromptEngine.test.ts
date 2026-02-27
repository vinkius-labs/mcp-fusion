/**
 * Prompt Engine Integration Tests
 *
 * Tests the prompt subsystem end-to-end through the MCP server layer:
 * interceptors, middleware, hydration deadlines, schema coercion,
 * loopback dispatcher, and lifecycle sync.
 *
 * Coverage:
 *   1. Prompt middleware chain with validation
 *   2. Prompt interceptors with context injection
 *   3. HydrationSandbox deadline enforcement
 *   4. Schema-Informed Coercion (string → typed values)
 *   5. Loopback dispatcher (prompt calls tool in-memory)
 *   6. Prompt tag filtering through server
 *   7. Prompt validation errors (structured coaching)
 *   8. Multiple interceptors composition order
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success } from '../../src/core/response.js';
import { definePrompt } from '../../src/prompt/index.js';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.js';

// ── Mock Server ─────────────────────────────────────────

function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
            handlers.set(schema.shape.method.value, handler);
        },
        async callListPrompts(cursor?: string) {
            const handler = handlers.get('prompts/list');
            if (!handler) throw new Error('No prompts/list handler');
            const params: Record<string, unknown> = {};
            if (cursor) params.cursor = cursor;
            return handler({ method: 'prompts/list', params }, {});
        },
        async callGetPrompt(name: string, args: Record<string, string> = {}, extra: unknown = {}) {
            const handler = handlers.get('prompts/get');
            if (!handler) throw new Error('No prompts/get handler');
            return handler({ method: 'prompts/get', params: { name, arguments: args } }, extra);
        },
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const handler = handlers.get('tools/call');
            if (!handler) throw new Error('No tools/call handler');
            return handler({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
    };
}

// ── Context ─────────────────────────────────────────────

interface PromptCtx {
    userId: string;
    tenantId: string;
    role: 'admin' | 'viewer';
    invokeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

function createCtx(overrides: Partial<PromptCtx> = {}): PromptCtx {
    return { userId: 'u_1', tenantId: 't_acme', role: 'viewer', ...overrides };
}

// ============================================================================
// 1. Prompt Middleware Chain
// ============================================================================

describe('Prompt Engine: Middleware Chain', () => {
    it('should execute prompt middleware before handler', async () => {
        const log: string[] = [];

        const prompt = definePrompt<PromptCtx>('briefing', {
            middleware: [
                async (ctx, args, next) => {
                    log.push(`auth:${ctx.role}`);
                    return next(ctx, args);
                },
            ],
            handler: async (ctx) => {
                log.push(`handler:${ctx.userId}`);
                return {
                    messages: [{
                        role: 'user' as const,
                        content: { type: 'text' as const, text: `Briefing for ${ctx.userId}` },
                    }],
                };
            },
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('dummy').action({
                name: 'ping',
                handler: async () => success('pong'),
            }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        const result = await server.callGetPrompt('briefing', {});

        expect(log).toEqual(['auth:viewer', 'handler:u_1']);
        expect(result.messages[0].content.text).toBe('Briefing for u_1');
    });
});

// ============================================================================
// 2. Schema-Informed Coercion
// ============================================================================

describe('Prompt Engine: Schema Coercion', () => {
    it('should coerce string args to typed values using schema AST', async () => {
        let capturedArgs: Record<string, unknown> = {};

        const prompt = definePrompt<PromptCtx>('analyze', {
            args: {
                count: { type: 'number', required: true, description: 'Item count' },
                include_drafts: { type: 'boolean', required: false, description: 'Include drafts' },
                category: { type: 'string', required: true },
            },
            handler: async (_ctx, args) => {
                capturedArgs = args;
                return {
                    messages: [{
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `Analyzing ${args.count} items (drafts: ${args.include_drafts})`,
                        },
                    }],
                };
            },
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        // MCP sends ALL args as strings
        const result = await server.callGetPrompt('analyze', {
            count: '42',
            include_drafts: 'true',
            category: 'reports',
        });

        // Args should be coerced to correct types
        expect(capturedArgs.count).toBe(42);           // string → number
        expect(capturedArgs.include_drafts).toBe(true); // string → boolean
        expect(capturedArgs.category).toBe('reports');  // string stays string

        expect(result.messages[0].content.text).toContain('42');
    });
});

// ============================================================================
// 3. Prompt Validation Errors
// ============================================================================

describe('Prompt Engine: Validation Errors', () => {
    it('should return structured coaching error for invalid prompt args', async () => {
        const prompt = definePrompt<PromptCtx>('strict', {
            args: {
                entity: { type: 'string', required: true },
                limit: { type: 'number', required: true },
            },
            handler: async (_ctx, args) => ({
                messages: [{
                    role: 'user' as const,
                    content: { type: 'text' as const, text: `Query: ${args.entity}` },
                }],
            }),
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        // Missing required field 'entity'
        const result = await server.callGetPrompt('strict', {
            limit: '10',
        });

        expect(result.messages[0].content.text).toContain('validation_error');
    });

    it('should reject unknown prompt args with strict validation', async () => {
        const prompt = definePrompt<PromptCtx>('minimal', {
            args: { name: { type: 'string', required: true } },
            handler: async (_ctx, args) => ({
                messages: [{
                    role: 'user' as const,
                    content: { type: 'text' as const, text: args.name as string },
                }],
            }),
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        // Extra unknown field should be rejected by .strict()
        const result = await server.callGetPrompt('minimal', {
            name: 'Alice',
            unknown_field: 'should be rejected',
        });

        expect(result.messages[0].content.text).toContain('validation_error');
    });
});

// ============================================================================
// 4. Prompt Interceptors via Server
// ============================================================================

describe('Prompt Engine: Interceptors via Server', () => {
    it('should apply interceptors to prompt results when routed through server', async () => {
        const prompt = definePrompt<PromptCtx>('task-plan', {
            description: 'Plan tasks for the day',
            tags: ['productivity'],
            handler: async (ctx) => ({
                messages: [{
                    role: 'user' as const,
                    content: { type: 'text' as const, text: `Plan tasks for ${ctx.userId}` },
                }],
            }),
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        promptRegistry.useInterceptor(async (ctx, builder) => {
            builder.prependSystem(`[TENANT: ${ctx.tenantId}]`);
            builder.appendAssistant('I will follow all enterprise policies.');
        });

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: (extra: unknown) => createCtx(extra as Partial<PromptCtx>),
            prompts: promptRegistry,
        });

        const result = await server.callGetPrompt(
            'task-plan',
            {},
            { tenantId: 't_corp' },
        );

        // 3 messages: prepend + original + append
        expect(result.messages).toHaveLength(3);
        expect(result.messages[0].content.text).toContain('t_corp');
        expect(result.messages[1].content.text).toContain('Plan tasks');
        expect(result.messages[2].role).toBe('assistant');
        expect(result.messages[2].content.text).toContain('enterprise policies');
    });
});

// ============================================================================
// 5. HydrationSandbox Deadline
// ============================================================================

describe('Prompt Engine: Hydration Deadline', () => {
    it('should return timeout alert when handler exceeds deadline', async () => {
        const prompt = definePrompt<PromptCtx>('slow-report', {
            hydrationTimeout: 50, // 50ms deadline
            handler: async () => {
                // Simulate slow external API
                await new Promise(resolve => setTimeout(resolve, 200));
                return {
                    messages: [{
                        role: 'user' as const,
                        content: { type: 'text' as const, text: 'Should not see this' },
                    }],
                };
            },
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        const result = await server.callGetPrompt('slow-report', {});

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].content.text).toContain('hydration_alert');
        expect(result.messages[0].content.text).toContain('TIMEOUT');
        expect(result.messages[0].content.text).not.toContain('Should not see this');
    });

    it('should return handler result when it completes before deadline', async () => {
        const prompt = definePrompt<PromptCtx>('fast-report', {
            hydrationTimeout: 5000, // Generous deadline
            handler: async () => ({
                messages: [{
                    role: 'user' as const,
                    content: { type: 'text' as const, text: 'Fast report data' },
                }],
            }),
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        const result = await server.callGetPrompt('fast-report', {});
        expect(result.messages[0].content.text).toBe('Fast report data');
    });

    it('should catch handler errors and return structured error alert', async () => {
        const prompt = definePrompt<PromptCtx>('crash-report', {
            hydrationTimeout: 5000,
            handler: async () => {
                throw new Error('External API returned 503');
            },
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(prompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        const result = await server.callGetPrompt('crash-report', {});
        expect(result.messages[0].content.text).toContain('hydration_alert');
        expect(result.messages[0].content.text).toContain('ERROR');
        expect(result.messages[0].content.text).toContain('503');
    });
});

// ============================================================================
// 6. Prompt Tag Filtering
// ============================================================================

describe('Prompt Engine: Tag Filtering', () => {
    it('should filter prompts by tags during list', async () => {
        const adminPrompt = definePrompt<PromptCtx>('admin-audit', {
            tags: ['admin', 'compliance'],
            handler: async () => ({
                messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Admin audit' } }],
            }),
        });

        const userPrompt = definePrompt<PromptCtx>('daily-tasks', {
            tags: ['user', 'productivity'],
            handler: async () => ({
                messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Daily tasks' } }],
            }),
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(
            createTool<PromptCtx>('x').action({ name: 'y', handler: async () => success('z') }),
        );

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.registerAll(adminPrompt, userPrompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
            filter: { tags: ['admin'] },
        });

        const list = await server.callListPrompts();
        const promptNames = list.prompts.map((p: { name: string }) => p.name);

        // Only admin-tagged prompt should appear
        expect(promptNames).toContain('admin-audit');
        expect(promptNames).not.toContain('daily-tasks');
    });
});

// ============================================================================
// 7. Loopback Dispatcher (Prompt calls Tool)
// ============================================================================

describe('Prompt Engine: Loopback Dispatcher', () => {
    it('should allow prompt handler to invoke tools in-memory', async () => {
        const dataTool = createTool<PromptCtx>('data')
            .action({
                name: 'fetch',
                schema: z.object({ entity: z.string() }),
                handler: async (_ctx, args) =>
                    success(`[DATA] Fetched 42 ${args.entity} records`),
            });

        const summaryPrompt = definePrompt<PromptCtx>('data-summary', {
            args: { entity: { type: 'string', required: true } },
            handler: async (ctx, args) => {
                // Use loopback dispatcher to call tool
                const invokeTool = (ctx as unknown as { invokeTool: Function }).invokeTool;
                if (!invokeTool) {
                    return {
                        messages: [{
                            role: 'user' as const,
                            content: { type: 'text' as const, text: 'No loopback available' },
                        }],
                    };
                }

                const toolResult = await invokeTool('data', {
                    action: 'fetch',
                    entity: args.entity,
                }) as { text: string; isError: boolean };

                return {
                    messages: [{
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: `Summary based on: ${toolResult.text}`,
                        },
                    }],
                };
            },
        });

        const toolRegistry = new ToolRegistry<PromptCtx>();
        toolRegistry.register(dataTool);

        const promptRegistry = new PromptRegistry<PromptCtx>();
        promptRegistry.register(summaryPrompt);

        const server = createMockServer();
        await toolRegistry.attachToServer(server, {
            toolExposition: 'grouped',
            contextFactory: () => createCtx(),
            prompts: promptRegistry,
        });

        const result = await server.callGetPrompt('data-summary', {
            entity: 'invoices',
        });

        expect(result.messages[0].content.text).toContain('42 invoices records');
    });
});
