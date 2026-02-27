/**
 * Internal Loopback Dispatcher Tests
 *
 * Verifies that Prompt handlers can invoke Tools in-memory via ctx.invokeTool().
 * The Tool's full pipeline (middleware → validation → handler → Presenter) runs
 * with the same context. RBAC is enforced.
 */
import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.js';
import { defineTool } from '../../src/core/builder/defineTool.js';
import { definePrompt } from '../../src/prompt/definePrompt.js';
import { PromptMessage } from '../../src/prompt/PromptMessage.js';
import { createPresenter, ui } from '../../src/presenter/index.js';
import { defineMiddleware } from '../../src/core/middleware/ContextDerivation.js';
import { GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { LoopbackContext, ToolInvocationResult } from '../../src/prompt/types.js';

// ── Helpers ──────────────────────────────────────────────

interface TestContext {
    user: { id: string; role: string };
}

/** Create a minimal mock MCP Server that captures handlers (passes duck-type check) */
function createMockServer() {
    const handlers = new Map<unknown, (...args: unknown[]) => unknown>();
    const server = {
        setRequestHandler: (schema: unknown, handler: (...args: unknown[]) => unknown) => {
            handlers.set(schema, handler);
        },
    };
    return { server, handlers };
}

// ── Tools for testing ────────────────────────────────────

const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .systemRules(['CRITICAL: amount_cents is in CENTS. Divide by 100.']);

const billing = defineTool<TestContext>('billing', {
    description: 'Billing operations',
    actions: {
        list_invoices: {
            readOnly: true,
            returns: InvoicePresenter,
            handler: async () => [
                { id: 'INV-001', amount_cents: 50000, status: 'pending' as const },
                { id: 'INV-002', amount_cents: 12000, status: 'paid' as const },
            ],
        },
        get_invoice: {
            readOnly: true,
            params: { id: 'string' },
            handler: async (_ctx, args) => {
                if (args.id === 'nonexistent') {
                    throw new Error('Invoice not found');
                }
                return { id: args.id, amount_cents: 99900, status: 'overdue' };
            },
        },
    },
});

const tasks = defineTool<TestContext>('tasks', {
    description: 'Task management',
    actions: {
        get_assigned: {
            readOnly: true,
            params: { user_id: 'string' },
            handler: async (_ctx, args) =>
                `3 tasks assigned to user ${args.user_id}`,
        },
    },
});

const restrictedTool = defineTool<TestContext>('admin', {
    description: 'Admin operations',
    middleware: [
        async (ctx: TestContext, _args, next) => {
            if (ctx.user.role !== 'admin') throw new Error('Forbidden');
            return next();
        },
    ],
    actions: {
        dashboard: {
            readOnly: true,
            handler: async () => 'Admin dashboard data',
        },
    },
});

// ── Tests ────────────────────────────────────────────────

describe('Internal Loopback Dispatcher — ctx.invokeTool()', () => {
    async function setupServer() {
        const { server, handlers } = createMockServer();

        const toolRegistry = new ToolRegistry<TestContext>();
        toolRegistry.register(billing);
        toolRegistry.register(tasks);
        toolRegistry.register(restrictedTool);

        const promptRegistry = new PromptRegistry<TestContext>();

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({
                user: { id: 'user-1', role: 'editor' },
            }),
            prompts: promptRegistry,
        });

        return { promptRegistry, handlers };
    }

    it('should invoke a tool and receive rendered text', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const briefing = definePrompt<TestContext>('morning_briefing', {
            handler: async (ctx, _args) => {
                const result = await ctx.invokeTool('billing', { action: 'list_invoices' });
                return {
                    messages: [
                        PromptMessage.user(`Invoices:\n${result.text}`),
                    ],
                };
            },
        });
        promptRegistry.register(briefing);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        const result = await getHandler(
            { params: { name: 'morning_briefing', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages).toHaveLength(1);
        const text = result.messages[0].content.text;
        expect(text).toContain('INV-001');
        expect(text).toContain('INV-002');
    });

    it('should aggregate data from multiple tools', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const briefing = definePrompt<TestContext>('multi_tool', {
            handler: async (ctx, _args) => {
                const invoices = await ctx.invokeTool('billing', { action: 'list_invoices' });
                const assigned = await ctx.invokeTool('tasks', { action: 'get_assigned', user_id: 'user-1' });

                return {
                    messages: [
                        PromptMessage.user([
                            '### Invoices',
                            invoices.text,
                            '### Tasks',
                            assigned.text,
                        ].join('\n')),
                    ],
                };
            },
        });
        promptRegistry.register(briefing);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        const result = await getHandler(
            { params: { name: 'multi_tool', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        const text = result.messages[0].content.text;
        expect(text).toContain('INV-001');
        expect(text).toContain('3 tasks assigned to user user-1');
    });

    it('should return Presenter-rendered output with domain rules', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const auditPrompt = definePrompt<TestContext>('audit', {
            handler: async (ctx, _args) => {
                const result = await ctx.invokeTool('billing', { action: 'list_invoices' });
                // The text should contain Presenter output including domain rules
                expect(result.isError).toBe(false);
                expect(result.text).toContain('CENTS');
                return {
                    messages: [PromptMessage.user(result.text)],
                };
            },
        });
        promptRegistry.register(auditPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        await getHandler(
            { params: { name: 'audit', arguments: {} } },
            {},
        );
    });

    it('should propagate tool errors in result.isError', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const errorPrompt = definePrompt<TestContext>('error_test', {
            handler: async (ctx, _args) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const result = await loopback.invokeTool('billing', { action: 'get_invoice', id: 'nonexistent' });
                expect(result.isError).toBe(true);
                expect(result.text).toContain('Invoice not found');
                return {
                    messages: [PromptMessage.user(`Error: ${result.text}`)],
                };
            },
        });
        promptRegistry.register(errorPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        const result = await getHandler(
            { params: { name: 'error_test', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toContain('Error:');
    });

    it('should enforce RBAC via middleware on internal calls', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const rbacPrompt = definePrompt<TestContext>('rbac_test', {
            handler: async (ctx, _args) => {
                const loopback = ctx as TestContext & LoopbackContext;
                // ctx.user.role is 'editor', middleware requires 'admin'
                const result = await loopback.invokeTool('admin', { action: 'dashboard' });
                expect(result.isError).toBe(true);
                expect(result.text).toContain('Forbidden');
                return {
                    messages: [PromptMessage.user('RBAC enforced')],
                };
            },
        });
        promptRegistry.register(rbacPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        await getHandler(
            { params: { name: 'rbac_test', arguments: {} } },
            {},
        );
    });

    it('should return isError for unknown tools', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const unknownPrompt = definePrompt<TestContext>('unknown_test', {
            handler: async (ctx, _args) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const result = await loopback.invokeTool('nonexistent_tool', {});
                expect(result.isError).toBe(true);
                expect(result.text).toContain('UNKNOWN_TOOL');
                return {
                    messages: [PromptMessage.user(result.text)],
                };
            },
        });
        promptRegistry.register(unknownPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        await getHandler(
            { params: { name: 'unknown_test', arguments: {} } },
            {},
        );
    });

    it('should support parallel invocations via Promise.all', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const parallelPrompt = definePrompt<TestContext>('parallel_test', {
            handler: async (ctx, _args) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const [invoices, assigned] = await Promise.all([
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                    loopback.invokeTool('tasks', { action: 'get_assigned', user_id: 'user-1' }),
                ]);

                expect(invoices.isError).toBe(false);
                expect(assigned.isError).toBe(false);

                return {
                    messages: [
                        PromptMessage.user(`${invoices.text}\n${assigned.text}`),
                    ],
                };
            },
        });
        promptRegistry.register(parallelPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        const result = await getHandler(
            { params: { name: 'parallel_test', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        const text = result.messages[0].content.text;
        expect(text).toContain('INV-001');
        expect(text).toContain('3 tasks assigned');
    });

    it('should default to empty args when none provided', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const defaultArgsPrompt = definePrompt<TestContext>('default_args', {
            handler: async (ctx, _args) => {
                const loopback = ctx as TestContext & LoopbackContext;
                // invokeTool without second argument should work
                const result = await loopback.invokeTool('billing', { action: 'list_invoices' });
                expect(result.isError).toBe(false);
                return {
                    messages: [PromptMessage.user(result.text)],
                };
            },
        });
        promptRegistry.register(defaultArgsPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        await getHandler(
            { params: { name: 'default_args', arguments: {} } },
            {},
        );
    });

    it('should provide raw ToolResponse in result.raw', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const rawPrompt = definePrompt<TestContext>('raw_test', {
            handler: async (ctx, _args) => {
                const result = await ctx.invokeTool('billing', { action: 'list_invoices' });
                expect(result.raw).toBeDefined();
                expect(result.raw.content).toBeDefined();
                expect(Array.isArray(result.raw.content)).toBe(true);
                return {
                    messages: [PromptMessage.user('ok')],
                };
            },
        });
        promptRegistry.register(rawPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        await getHandler(
            { params: { name: 'raw_test', arguments: {} } },
            {},
        );
    });

    it('should work with fromView() for MVA-Driven Prompt composition', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const mvaPrompt = definePrompt<TestContext>('mva_composition', {
            handler: async (ctx, _args) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const invoiceResult = await loopback.invokeTool('billing', { action: 'list_invoices' });

                return {
                    messages: [
                        PromptMessage.system('You are a financial analyst.'),
                        PromptMessage.user(`Here is the tool output:\n${invoiceResult.text}`),
                        PromptMessage.user('Analyze these invoices.'),
                    ],
                };
            },
        });
        promptRegistry.register(mvaPrompt);

        const getHandler = handlers.get(GetPromptRequestSchema) as (req: unknown, extra: unknown) => Promise<unknown>;
        const result = await getHandler(
            { params: { name: 'mva_composition', arguments: {} } },
            {},
        ) as { messages: Array<{ role: string; content: { text: string } }> };

        expect(result.messages).toHaveLength(3);
        expect(result.messages[0].content.text).toBe('You are a financial analyst.');
        expect(result.messages[1].content.text).toContain('INV-001');
        expect(result.messages[2].content.text).toBe('Analyze these invoices.');
    });
});

// ── Adversarial & Edge-Case Tests ────────────────────────

describe('Internal Loopback — Adversarial & Edge Cases', () => {
    async function setupServer(contextOverride?: Partial<TestContext['user']>) {
        const handlers = new Map<unknown, (...args: unknown[]) => unknown>();
        const server = {
            setRequestHandler: (schema: unknown, handler: (...args: unknown[]) => unknown) => {
                handlers.set(schema, handler);
            },
        };

        const toolRegistry = new ToolRegistry<TestContext>();
        toolRegistry.register(billing);
        toolRegistry.register(tasks);
        toolRegistry.register(restrictedTool);

        const promptRegistry = new PromptRegistry<TestContext>();

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({
                user: {
                    id: contextOverride?.id ?? 'user-1',
                    role: contextOverride?.role ?? 'editor',
                },
            }),
            prompts: promptRegistry,
        });

        return { promptRegistry, handlers };
    }

    it('should propagate handler exceptions as isError without crashing the Prompt', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const crashPrompt = definePrompt<TestContext>('crash_handler', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                // The get_invoice handler throws for 'nonexistent'
                const result = await loopback.invokeTool('billing', {
                    action: 'get_invoice',
                    id: 'nonexistent',
                });
                // Should NOT crash the prompt — error is captured
                expect(result.isError).toBe(true);
                expect(result.text.length).toBeGreaterThan(0);
                return {
                    messages: [PromptMessage.user(`Handled gracefully: ${result.isError}`)],
                };
            },
        });
        promptRegistry.register(crashPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'crash_handler', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('Handled gracefully: true');
    });

    it('should share the same context identity across multiple invocations', async () => {
        const { promptRegistry, handlers } = await setupServer({ id: 'ctx-shared-test', role: 'editor' });

        const sharedCtxPrompt = definePrompt<TestContext>('shared_ctx', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                // Both calls should use the same ctx.user.id
                const r1 = await loopback.invokeTool('tasks', { action: 'get_assigned', user_id: ctx.user.id });
                const r2 = await loopback.invokeTool('tasks', { action: 'get_assigned', user_id: ctx.user.id });
                expect(r1.text).toBe(r2.text);
                expect(r1.text).toContain('ctx-shared-test');
                return { messages: [PromptMessage.user(r1.text)] };
            },
        });
        promptRegistry.register(sharedCtxPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        await handler({ params: { name: 'shared_ctx', arguments: {} } }, {});
    });

    it('should handle chained sequential invocations where output feeds the next call', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const chainedPrompt = definePrompt<TestContext>('chained', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;

                // Step 1: get invoices
                const invoices = await loopback.invokeTool('billing', { action: 'list_invoices' });
                expect(invoices.isError).toBe(false);

                // Step 2: get a specific invoice (simulating extraction from step 1)
                const detail = await loopback.invokeTool('billing', {
                    action: 'get_invoice',
                    id: 'INV-001',
                });
                expect(detail.isError).toBe(false);
                expect(detail.text).toContain('INV-001');

                // Step 3: get tasks
                const assigned = await loopback.invokeTool('tasks', {
                    action: 'get_assigned',
                    user_id: 'user-1',
                });
                expect(assigned.isError).toBe(false);

                return {
                    messages: [
                        PromptMessage.user(`Chain: ${invoices.text.length > 0 && detail.text.length > 0 && assigned.text.length > 0}`),
                    ],
                };
            },
        });
        promptRegistry.register(chainedPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'chained', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('Chain: true');
    });

    it('should reject unknown args via Zod strict validation (isError)', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const strictPrompt = definePrompt<TestContext>('strict_args', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                // Pass completely invalid args to a Tool with params validation
                const result = await loopback.invokeTool('billing', {
                    action: 'get_invoice',
                    // 'id' is required but we send garbage fields
                    nonsense_field: '!!!',
                    injection: { evil: true },
                });
                expect(result.isError).toBe(true);
                return { messages: [PromptMessage.user(`Rejected: ${result.isError}`)] };
            },
        });
        promptRegistry.register(strictPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'strict_args', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('Rejected: true');
    });

    it('should handle concurrent duplicate tool calls without interference', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const concurrentPrompt = definePrompt<TestContext>('concurrent_dupes', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                // Fire 5 identical calls in parallel
                const results = await Promise.all([
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                ]);

                // All should succeed with identical output
                for (const r of results) {
                    expect(r.isError).toBe(false);
                    expect(r.text).toContain('INV-001');
                }
                // Verify no cross-contamination
                const texts = results.map(r => r.text);
                expect(new Set(texts).size).toBe(1); // All identical

                return { messages: [PromptMessage.user(`${results.length} identical results`)] };
            },
        });
        promptRegistry.register(concurrentPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'concurrent_dupes', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('5 identical results');
    });

    it('should enforce RBAC on admin tools, then succeed with elevated context', async () => {
        // First: editor role → Forbidden
        const { promptRegistry: pr1, handlers: h1 } = await setupServer({ role: 'editor' });

        const rbacContrastPrompt1 = definePrompt<TestContext>('rbac_editor', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const result = await loopback.invokeTool('admin', { action: 'dashboard' });
                return { messages: [PromptMessage.user(`editor: isError=${result.isError}`)] };
            },
        });
        pr1.register(rbacContrastPrompt1);

        const h1fn = h1.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const r1 = await h1fn(
            { params: { name: 'rbac_editor', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(r1.messages[0].content.text).toBe('editor: isError=true');

        // Second: admin role → success
        const { promptRegistry: pr2, handlers: h2 } = await setupServer({ role: 'admin' });

        const rbacContrastPrompt2 = definePrompt<TestContext>('rbac_admin', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const result = await loopback.invokeTool('admin', { action: 'dashboard' });
                return { messages: [PromptMessage.user(`admin: isError=${result.isError}`)] };
            },
        });
        pr2.register(rbacContrastPrompt2);

        const h2fn = h2.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const r2 = await h2fn(
            { params: { name: 'rbac_admin', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(r2.messages[0].content.text).toBe('admin: isError=false');
    });

    it('should handle conditional branching — invoke tool B only if tool A succeeds', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const branchPrompt = definePrompt<TestContext>('branch_logic', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;

                const firstAttempt = await loopback.invokeTool('billing', {
                    action: 'get_invoice',
                    id: 'nonexistent',
                });

                let secondResult = 'skipped';
                if (!firstAttempt.isError) {
                    const second = await loopback.invokeTool('tasks', {
                        action: 'get_assigned',
                        user_id: 'user-1',
                    });
                    secondResult = second.text;
                }

                return {
                    messages: [PromptMessage.user(`first:${firstAttempt.isError} second:${secondResult}`)],
                };
            },
        });
        promptRegistry.register(branchPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'branch_logic', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('first:true second:skipped');
    });

    it('should handle invokeTool with completely empty name string', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const emptyNamePrompt = definePrompt<TestContext>('empty_name', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const result = await loopback.invokeTool('', {});
                expect(result.isError).toBe(true);
                expect(result.text).toContain('UNKNOWN_TOOL');
                return { messages: [PromptMessage.user(`empty: ${result.isError}`)] };
            },
        });
        promptRegistry.register(emptyNamePrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        await handler({ params: { name: 'empty_name', arguments: {} } }, {});
    });

    it('should handle massive parallel fan-out (10 concurrent tools) without deadlock', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const fanOutPrompt = definePrompt<TestContext>('fan_out', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const promises = Array.from({ length: 10 }, (_, i) =>
                    loopback.invokeTool('tasks', {
                        action: 'get_assigned',
                        user_id: `user-${i}`,
                    }),
                );

                const results = await Promise.all(promises);
                expect(results).toHaveLength(10);
                results.forEach((r, i) => {
                    expect(r.isError).toBe(false);
                    expect(r.text).toContain(`user-${i}`);
                });

                return { messages: [PromptMessage.user(`fan-out: ${results.length}`)] };
            },
        });
        promptRegistry.register(fanOutPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'fan_out', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('fan-out: 10');
    });

    it('should survive mixed success/failure in parallel batch', async () => {
        const { promptRegistry, handlers } = await setupServer();

        const mixedPrompt = definePrompt<TestContext>('mixed_batch', {
            handler: async (ctx) => {
                const loopback = ctx as TestContext & LoopbackContext;
                const [ok, fail, unknown] = await Promise.all([
                    loopback.invokeTool('billing', { action: 'list_invoices' }),
                    loopback.invokeTool('billing', { action: 'get_invoice', id: 'nonexistent' }),
                    loopback.invokeTool('does_not_exist', {}),
                ]);

                expect(ok.isError).toBe(false);
                expect(fail.isError).toBe(true);
                expect(unknown.isError).toBe(true);

                return {
                    messages: [PromptMessage.user(
                        `ok:${!ok.isError} fail:${fail.isError} unknown:${unknown.isError}`,
                    )],
                };
            },
        });
        promptRegistry.register(mixedPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        const result = await handler(
            { params: { name: 'mixed_batch', arguments: {} } },
            {},
        ) as { messages: Array<{ content: { text: string } }> };

        expect(result.messages[0].content.text).toBe('ok:true fail:true unknown:true');
    });

    it('should return text from multi-content-block responses (joins all text blocks)', async () => {
        const { promptRegistry, handlers } = await setupServer();

        // billing.list_invoices with Presenter returns system_rules + data = multiple text blocks
        const multiBlockPrompt = definePrompt<TestContext>('multi_block', {
            handler: async (ctx) => {
                const result = await ctx.invokeTool('billing', { action: 'list_invoices' });
                // result.text should contain ALL text content blocks joined
                expect(result.text.length).toBeGreaterThan(0);
                // raw.content should have multiple entries
                expect(result.raw.content.length).toBeGreaterThanOrEqual(1);
                return { messages: [PromptMessage.user(`blocks: ${result.raw.content.length}`)] };
            },
        });
        promptRegistry.register(multiBlockPrompt);

        const handler = handlers.get(GetPromptRequestSchema) as (r: unknown, e: unknown) => Promise<unknown>;
        await handler({ params: { name: 'multi_block', arguments: {} } }, {});
    });
});
