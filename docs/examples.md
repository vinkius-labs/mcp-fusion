# Cookbook & Examples

Real-world, copy-pasteable patterns for every MCP Fusion feature. Each example is self-contained — pick the one closest to your use case and adapt.

---

## 1. Basic CRUD Tool

The most common pattern. A single tool with list, get, create, update, and delete actions.

::: code-group
```typescript [defineTool — No Zod]
import { defineTool, success, error, required } from '@vinkius-core/mcp-fusion';

interface AppContext {
    db: Database;
}

const projects = defineTool<AppContext>('projects', {
    description: 'Manage workspace projects',
    shared: { workspace_id: 'string' },
    actions: {
        list: {
            readOnly: true,
            params: {
                status: { enum: ['active', 'archived', 'all'] as const, optional: true },
                limit: { type: 'number', min: 1, max: 100, optional: true },
            },
            handler: async (ctx, args) => {
                const projects = await ctx.db.projects.findMany({
                    where: {
                        workspaceId: args.workspace_id,
                        ...(args.status && args.status !== 'all' && { status: args.status }),
                    },
                    take: args.limit ?? 20,
                });
                return success(projects);
            },
        },
        get: {
            readOnly: true,
            params: { id: 'string' },
            handler: async (ctx, args) => {
                const project = await ctx.db.projects.findUnique({
                    where: { id: args.id, workspaceId: args.workspace_id },
                });
                if (!project) return error(`Project "${args.id}" not found`);
                return success(project);
            },
        },
        create: {
            params: {
                name: { type: 'string', min: 1, max: 200 },
                description: { type: 'string', optional: true },
            },
            handler: async (ctx, args) => {
                const project = await ctx.db.projects.create({
                    data: {
                        workspaceId: args.workspace_id,
                        name: args.name,
                        description: args.description,
                    },
                });
                return success(project);
            },
        },
        update: {
            idempotent: true,
            params: {
                id: 'string',
                name: { type: 'string', min: 1, max: 200, optional: true },
                status: { enum: ['active', 'archived'] as const, optional: true },
            },
            handler: async (ctx, args) => {
                const project = await ctx.db.projects.update({
                    where: { id: args.id, workspaceId: args.workspace_id },
                    data: {
                        ...(args.name && { name: args.name }),
                        ...(args.status && { status: args.status }),
                    },
                });
                return success(project);
            },
        },
        delete: {
            destructive: true,
            params: { id: 'string' },
            handler: async (ctx, args) => {
                await ctx.db.projects.delete({
                    where: { id: args.id, workspaceId: args.workspace_id },
                });
                return success(`Project "${args.id}" deleted`);
            },
        },
    },
});
```
```typescript [createTool — Full Zod]
import { createTool, success, error } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface AppContext {
    db: Database;
}

const projects = createTool<AppContext>('projects')
    .description('Manage workspace projects')
    .commonSchema(z.object({
        workspace_id: z.string().describe('Workspace identifier'),
    }))
    .action({
        name: 'list',
        readOnly: true,
        schema: z.object({
            status: z.enum(['active', 'archived', 'all']).optional(),
            limit: z.number().min(1).max(100).optional(),
        }),
        handler: async (ctx, args) => {
            const projects = await ctx.db.projects.findMany({
                where: {
                    workspaceId: args.workspace_id,
                    ...(args.status && args.status !== 'all' && { status: args.status }),
                },
                take: args.limit ?? 20,
            });
            return success(projects);
        },
    })
    .action({
        name: 'get',
        readOnly: true,
        schema: z.object({ id: z.string() }),
        handler: async (ctx, args) => {
            const project = await ctx.db.projects.findUnique({
                where: { id: args.id, workspaceId: args.workspace_id },
            });
            if (!project) return error(`Project "${args.id}" not found`);
            return success(project);
        },
    })
    .action({
        name: 'create',
        schema: z.object({
            name: z.string().min(1).max(200),
            description: z.string().optional(),
        }),
        handler: async (ctx, args) => {
            const project = await ctx.db.projects.create({
                data: {
                    workspaceId: args.workspace_id,
                    name: args.name,
                    description: args.description,
                },
            });
            return success(project);
        },
    })
    .action({
        name: 'delete',
        destructive: true,
        schema: z.object({ id: z.string() }),
        handler: async (ctx, args) => {
            await ctx.db.projects.delete({
                where: { id: args.id, workspaceId: args.workspace_id },
            });
            return success(`Project "${args.id}" deleted`);
        },
    });
```
:::

---

## 2. Self-Healing Errors with `toolError()`

Give the AI actionable recovery instructions instead of generic errors.

```typescript
import { defineTool, success, toolError } from '@vinkius-core/mcp-fusion';

const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            readOnly: true,
            params: { invoice_id: 'string' },
            handler: async (ctx, args) => {
                const invoice = await ctx.db.invoices.findUnique({
                    where: { id: args.invoice_id },
                });

                if (!invoice) {
                    return toolError('InvoiceNotFound', {
                        message: `Invoice "${args.invoice_id}" does not exist.`,
                        suggestion: 'Call billing.list_invoices first to find valid IDs.',
                        availableActions: ['billing.list_invoices'],
                    });
                }

                return success(invoice);
            },
        },
        charge: {
            params: {
                invoice_id: 'string',
                amount: { type: 'number', min: 1 },
            },
            handler: async (ctx, args) => {
                const invoice = await ctx.db.invoices.findUnique({
                    where: { id: args.invoice_id },
                });

                if (!invoice) {
                    return toolError('InvoiceNotFound', {
                        message: `Invoice "${args.invoice_id}" not found.`,
                        suggestion: 'List invoices first, then retry with a valid ID.',
                        availableActions: ['billing.list_invoices'],
                    });
                }

                if (invoice.status === 'paid') {
                    return toolError('AlreadyPaid', {
                        message: `Invoice "${args.invoice_id}" is already paid.`,
                        suggestion: 'No action needed. The invoice is settled.',
                    });
                }

                if (args.amount > invoice.amount_cents) {
                    return toolError('OverPayment', {
                        message: `Amount ${args.amount} exceeds invoice total ${invoice.amount_cents}.`,
                        suggestion: `Use amount: ${invoice.amount_cents} for full payment.`,
                    });
                }

                await ctx.db.payments.create({
                    data: { invoiceId: args.invoice_id, amount: args.amount },
                });
                return success({ status: 'charged', amount: args.amount });
            },
        },
    },
});
```

::: tip What the AI sees on error
```
[InvoiceNotFound] Invoice "INV-999" does not exist.
💡 Suggestion: Call billing.list_invoices first to find valid IDs.
📋 Try: billing.list_invoices
```
This guides the AI to self-correct on the next call — no hallucination, no retry loops.
:::

---

## 3. Full MVA Presenter — Invoice Domain

Complete Presenter with schema validation, domain rules, UI blocks, cognitive guardrails, and HATEOAS suggestions.

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// ── Schema (Security Boundary) ──────────────────────────
// Only these fields reach the AI. Internal fields (tenant_id,
// password_hash, etc.) are silently stripped.

const invoiceSchema = z.object({
    id: z.string(),
    client_name: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
    due_date: z.string(),
    items: z.array(z.object({
        description: z.string(),
        amount_cents: z.number(),
    })),
});

// ── Presenter ───────────────────────────────────────────

export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)

    // Domain Rules: JIT context that travels with the data
    .systemRules([
        'CRITICAL: amount_cents is in CENTS. Always divide by 100 before displaying.',
        'Use currency format: $XX,XXX.00',
        'Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue',
        'Display due_date in human-readable format: "Jan 15, 2025"',
    ])

    // Single Item UI: gauge chart for the invoice amount
    .uiBlocks((invoice) => [
        ui.echarts({
            series: [{
                type: 'gauge',
                data: [{ value: invoice.amount_cents / 100, name: invoice.status }],
                max: Math.ceil(invoice.amount_cents / 100 * 1.5),
            }],
        }),
    ])

    // Collection UI: bar chart comparing all invoices
    .collectionUiBlocks((invoices) => [
        ui.echarts({
            xAxis: { type: 'category', data: invoices.map(i => i.id) },
            yAxis: { type: 'value' },
            series: [{
                type: 'bar',
                data: invoices.map(i => i.amount_cents / 100),
            }],
        }),
        ui.summary(
            `${invoices.length} invoices. ` +
            `Total: $${(invoices.reduce((s, i) => s + i.amount_cents, 0) / 100).toLocaleString()}`
        ),
    ])

    // Cognitive Guardrails: prevent context DDoS
    .agentLimit(50, (omitted) =>
        ui.summary(
            `⚠️ Dataset truncated. 50 shown, ${omitted} hidden. ` +
            `Use status or date_range filters to narrow results.`
        )
    )

    // HATEOAS: tell the AI what it CAN do next
    .suggestActions((invoice) => {
        if (invoice.status === 'pending') {
            return [
                { tool: 'billing.charge', reason: 'Process payment' },
                { tool: 'billing.send_reminder', reason: 'Send payment reminder email' },
            ];
        }
        if (invoice.status === 'overdue') {
            return [
                { tool: 'billing.escalate', reason: 'Escalate to collections' },
                { tool: 'billing.charge', reason: 'Attempt late payment' },
            ];
        }
        return [];   // No suggestions for paid invoices
    });
```

### Using the Presenter in a Tool

```typescript
import { defineTool } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            readOnly: true,
            params: { invoice_id: 'string' },
            returns: InvoicePresenter,     // ← Attach the Presenter
            handler: async (ctx, args) => {
                // Return RAW data — the Presenter does the rest
                return await ctx.db.invoices.findUnique({
                    where: { id: args.invoice_id },
                    include: { items: true },
                });
            },
        },
        list_invoices: {
            readOnly: true,
            params: {
                status: { enum: ['paid', 'pending', 'overdue'] as const, optional: true },
            },
            returns: InvoicePresenter,     // ← Same Presenter, auto-detects array
            handler: async (ctx, args) => {
                return await ctx.db.invoices.findMany({
                    where: args.status ? { status: args.status } : {},
                    include: { items: true },
                });
            },
        },
    },
});
```

---

## 4. Context-Aware Rules (RBAC / DLP)

Dynamic rules that change based on the user's role or tenant configuration.

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface RequestContext {
    user: { role: 'admin' | 'member' | 'viewer' };
    tenant: { locale: string; currency: string };
}

const EmployeePresenter = createPresenter('Employee')
    .schema(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        salary_cents: z.number(),
        department: z.string(),
    }))
    .systemRules((employee, ctx) => {
        const rc = ctx as RequestContext | undefined;
        return [
            // Always show
            `salary_cents is in CENTS for currency ${rc?.tenant?.currency ?? 'USD'}.`,
            `Format dates using locale: ${rc?.tenant?.locale ?? 'en-US'}.`,

            // RBAC: non-admins can't see salary details
            rc?.user?.role !== 'admin'
                ? 'RESTRICTED: Do NOT display salary information. Show "••••••" instead.'
                : null,

            // DLP: viewers see even less
            rc?.user?.role === 'viewer'
                ? 'RESTRICTED: Mask email addresses. Show only first 3 characters.'
                : null,
        ];
    })
    .uiBlocks((employee, ctx) => {
        const rc = ctx as RequestContext | undefined;

        // Only admins get the salary chart
        return [
            rc?.user?.role === 'admin'
                ? ui.echarts({
                    series: [{
                        type: 'gauge',
                        data: [{ value: employee.salary_cents / 100, name: 'Salary' }],
                    }],
                })
                : null,   // Conditionally excluded
        ];
    });
```

---

## 5. Hierarchical Groups — Platform Tool

Organize dozens of actions into logical namespaces. The AI sees `platform` as one tool but calls `platform` with `action: "users.list"` or `action: "billing.charge"`.

```typescript
import { defineTool, success, error } from '@vinkius-core/mcp-fusion';

const platform = defineTool<AppContext>('platform', {
    description: 'Platform management for workspace operations',
    shared: { org_id: 'string' },
    groups: {
        users: {
            description: 'User management',
            actions: {
                list: {
                    readOnly: true,
                    handler: async (ctx, args) => {
                        const users = await ctx.db.users.findMany({
                            where: { orgId: args.org_id },
                        });
                        return success(users);
                    },
                },
                invite: {
                    params: {
                        email: { type: 'string', description: 'Email to invite' },
                        role: { enum: ['admin', 'member', 'viewer'] as const },
                    },
                    handler: async (ctx, args) => {
                        const existing = await ctx.db.users.findByEmail(args.email);
                        if (existing) return error(`User "${args.email}" already exists`);

                        const user = await ctx.db.users.invite({
                            orgId: args.org_id,
                            email: args.email,
                            role: args.role,
                        });
                        return success(user);
                    },
                },
                ban: {
                    destructive: true,
                    params: { user_id: 'string' },
                    handler: async (ctx, args) => {
                        await ctx.db.users.ban(args.user_id);
                        return success(`User "${args.user_id}" banned`);
                    },
                },
            },
        },
        billing: {
            description: 'Billing and subscription management',
            actions: {
                status: {
                    readOnly: true,
                    handler: async (ctx, args) => {
                        const plan = await ctx.db.billing.getPlan(args.org_id);
                        return success(plan);
                    },
                },
                upgrade: {
                    params: {
                        plan: { enum: ['pro', 'enterprise'] as const },
                    },
                    handler: async (ctx, args) => {
                        const result = await ctx.db.billing.upgrade(args.org_id, args.plan);
                        return success(result);
                    },
                },
            },
        },
    },
});
```

::: tip How the AI calls it
```json
{ "action": "users.list", "org_id": "org_123" }
{ "action": "users.invite", "org_id": "org_123", "email": "alice@co.io", "role": "admin" }
{ "action": "billing.upgrade", "org_id": "org_123", "plan": "enterprise" }
```
One tool, many actions. The LLM picks the right one via the `action` discriminator.
:::

---

## 6. Authentication Middleware

Apply auth to all actions with a single `.use()` call.

```typescript
import {
    defineTool, defineMiddleware, success, error,
} from '@vinkius-core/mcp-fusion';

// ── Base context (from MCP session) ──────────────────────
interface BaseContext {
    token: string;
}

// ── Derived context (after middleware) ────────────────────
interface AuthContext extends BaseContext {
    user: { id: string; name: string; role: string };
}

// ── Auth middleware: verifies token, adds `user` to ctx ──
const withAuth = defineMiddleware(async (ctx: BaseContext) => {
    const user = await verifyJwtToken(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user };   // ← merged into ctx
});

// ── Admin guard: checks role after auth ──────────────────
const requireAdmin = defineMiddleware(async (ctx: AuthContext) => {
    if (ctx.user.role !== 'admin') {
        throw new Error('Forbidden: admin role required');
    }
    return {};   // Nothing extra to add
});

// ── Tool with stacked middleware ─────────────────────────
const admin = defineTool<BaseContext>('admin', {
    middleware: [withAuth.toMiddlewareFn()],
    groups: {
        users: {
            description: 'User admin operations',
            middleware: [requireAdmin.toMiddlewareFn()],
            actions: {
                list: {
                    readOnly: true,
                    handler: async (ctx, args) => {
                        // ctx.user is available here (from withAuth)
                        const ctxWithUser = ctx as unknown as AuthContext;
                        return success(await listUsers(ctxWithUser.user));
                    },
                },
                delete: {
                    destructive: true,
                    params: { user_id: 'string' },
                    handler: async (ctx, args) => {
                        // Both withAuth AND requireAdmin have run
                        await deleteUser(args.user_id);
                        return success('User deleted');
                    },
                },
            },
        },
    },
});
```

---

## 7. ResponseBuilder — Rich Custom Responses

When you need full control over the response blocks without a Presenter.

```typescript
import { defineTool, response, ui } from '@vinkius-core/mcp-fusion';

const analytics = defineTool<AppContext>('analytics', {
    actions: {
        dashboard: {
            readOnly: true,
            params: {
                workspace_id: 'string',
                period: { enum: ['7d', '30d', '90d'] as const, optional: true },
            },
            handler: async (ctx, args) => {
                const stats = await ctx.db.analytics.getDashboard(
                    args.workspace_id,
                    args.period ?? '30d',
                );

                return response(stats)
                    // Chart: revenue over time
                    .uiBlock(ui.echarts({
                        title: { text: 'Revenue Trend' },
                        xAxis: { type: 'category', data: stats.dates },
                        series: [{
                            type: 'line',
                            smooth: true,
                            data: stats.revenue,
                        }],
                    }))
                    // Chart: user growth
                    .uiBlock(ui.echarts({
                        title: { text: 'User Growth' },
                        xAxis: { type: 'category', data: stats.dates },
                        series: [{
                            type: 'bar',
                            data: stats.signups,
                        }],
                    }))
                    // Mermaid: conversion funnel
                    .uiBlock(ui.mermaid(`
                        graph LR
                            A[Visitors: ${stats.visitors}] --> B[Signups: ${stats.signups_total}]
                            B --> C[Active: ${stats.active}]
                            C --> D[Paid: ${stats.paid}]
                    `))
                    // Hints for the AI
                    .llmHint('Revenue figures are in USD cents. Divide by 100.')
                    .llmHint(`Data covers the last ${args.period ?? '30d'}.`)
                    // Domain rules
                    .systemRules([
                        'Always show percentage change vs. previous period.',
                        'Highlight metrics that changed more than 20%.',
                    ])
                    .build();
            },
        },
    },
});
```

### One-Line Shortcuts

```typescript
// Simple response — equivalent to success()
return response.ok({ status: 'done' });

// Data + domain rules in one call
return response.withRules(invoiceData, [
    'CRITICAL: amounts are in CENTS — divide by 100.',
    'Use emojis: ✅ Paid, ⚠️ Pending.',
]);
```

---

## 8. Streaming Progress

Long-running operations that report progress back to the AI.

```typescript
import { defineTool, success, progress } from '@vinkius-core/mcp-fusion';

const data = defineTool<AppContext>('data', {
    actions: {
        export: {
            params: {
                format: { enum: ['csv', 'json', 'xlsx'] as const },
                table: 'string',
            },
            handler: async function* (ctx, args) {
                // Step 1: Count rows
                yield progress(10, 'Counting records...');
                const count = await ctx.db.count(args.table);

                // Step 2: Fetch in batches
                const batchSize = 1000;
                const batches = Math.ceil(count / batchSize);
                const rows: unknown[] = [];

                for (let i = 0; i < batches; i++) {
                    yield progress(
                        10 + Math.round((i / batches) * 70),
                        `Fetching batch ${i + 1}/${batches}...`,
                    );
                    const batch = await ctx.db.query(args.table, {
                        offset: i * batchSize,
                        limit: batchSize,
                    });
                    rows.push(...batch);
                }

                // Step 3: Convert format
                yield progress(85, `Converting to ${args.format}...`);
                const output = await convertToFormat(rows, args.format);

                // Step 4: Upload
                yield progress(95, 'Uploading...');
                const url = await ctx.storage.upload(output, `export.${args.format}`);

                yield progress(100, 'Done!');
                return success({ url, rows: count, format: args.format });
            },
        },
    },
});
```

---

::: tip Automatic MCP Notification Wiring
When attached to an MCP server via `attachToServer()`, these `yield progress()` calls are automatically forwarded to the client as `notifications/progress` — **zero configuration**. The framework detects the `progressToken` from the client's request metadata and wires the notifications transparently. When no token is present, progress events are silently consumed with zero overhead.
:::

## 9. TOON — Token-Optimized Responses

Save ~40% tokens on array/tabular responses. Two approaches:

### Response-Level: `toonSuccess()`

```typescript
import { defineTool, toonSuccess } from '@vinkius-core/mcp-fusion';

const users = defineTool<AppContext>('users', {
    actions: {
        list: {
            readOnly: true,
            handler: async (ctx, args) => {
                const users = await ctx.db.users.findMany();
                // Instead of success(users) — saves ~40% tokens
                return toonSuccess(users);
                // Output: "id|name|email\n1|Alice|alice@co\n2|Bob|bob@co"
            },
        },
    },
});
```

### Description-Level: `.toonDescription()`

Compresses the tool description itself (the metadata the AI sees in `tools/list`).

```typescript
import { createTool, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const hugeApi = createTool<AppContext>('api')
    .description('Full platform API with 50+ actions')
    .toonDescription()    // ← TOON-encode the description
    .action({ name: 'users.list', readOnly: true, schema: z.object({}), handler: listUsers })
    .action({ name: 'users.get', readOnly: true, schema: z.object({ id: z.string() }), handler: getUser })
    // ... 48 more actions
;
```

::: tip When to use TOON
- `toonSuccess(data)` — When returning **arrays of uniform objects** (lists, tables)
- `.toonDescription()` — When your tool has **many actions** and the description is consuming too many tokens
:::

---

## 10. Presenter Composition — Nested Relations

Define Presenters once, embed them everywhere. DRY principle for domain models.

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// ── Client Presenter (reusable) ─────────────────────────
const ClientPresenter = createPresenter('Client')
    .schema(z.object({
        id: z.string(),
        name: z.string(),
        tier: z.enum(['free', 'pro', 'enterprise']),
    }))
    .systemRules([
        'Display company name prominently.',
        'Tier determines available features.',
    ]);

// ── Invoice Presenter (embeds Client) ───────────────────
const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .systemRules(['amount_cents is in CENTS. Divide by 100.'])
    .embed('client', ClientPresenter);   // ← Composition

// ── Contract Presenter (also embeds Client) ─────────────
const ContractPresenter = createPresenter('Contract')
    .schema(z.object({
        id: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        value_cents: z.number(),
    }))
    .systemRules(['value_cents is in CENTS.'])
    .embed('client', ClientPresenter);   // ← Same Client, reused
```

When an invoice includes `client` data, the Client's rules and UI blocks are automatically merged into the response. One definition, consistent perception everywhere.

---

## 11. State Sync — Prevent Stale Data

Tell the AI which data to re-fetch after mutations.

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projects, tasks, sprints);

registry.attachToServer(server, {
    contextFactory: async (extra) => createAppContext(extra),
    stateSync: {
        // Default: all tools are considered mutable (no-store)
        defaults: { cacheControl: 'no-store' },
        policies: [
            // Static data: cache forever
            { match: 'countries.*', cacheControl: 'immutable' },
            { match: 'timezones.*', cacheControl: 'immutable' },

            // Mutations invalidate related read caches
            {
                match: 'tasks.create',
                invalidates: ['tasks.*', 'projects.get', 'sprints.get'],
            },
            {
                match: 'tasks.update',
                invalidates: ['tasks.*', 'sprints.get'],
            },
            {
                match: 'sprints.close',
                invalidates: ['sprints.*', 'projects.get'],
            },
        ],
    },
});
```

::: tip What happens
After `tasks.create` succeeds, the AI receives:
```
[System: Cache invalidated for tasks.*, projects.get, sprints.get — caused by tasks.create]
```
This tells the AI to re-fetch those tools before using their data.
:::

---

## 12. Result Monad — Composable Error Handling

Chain operations that might fail without nested `if/else` blocks.

```typescript
import { defineTool, succeed, fail, error, success } from '@vinkius-core/mcp-fusion';
import type { Result } from '@vinkius-core/mcp-fusion';

// ── Pure domain functions ────────────────────────────────

async function findProject(db: Database, id: string): Promise<Result<Project>> {
    const project = await db.projects.findUnique({ where: { id } });
    if (!project) return fail(error(`Project "${id}" not found`));
    return succeed(project);
}

async function validateAccess(user: User, project: Project): Promise<Result<Project>> {
    if (project.ownerId !== user.id && user.role !== 'admin') {
        return fail(error('Forbidden: you do not own this project'));
    }
    return succeed(project);
}

async function archiveProject(db: Database, project: Project): Promise<Result<Project>> {
    if (project.status === 'archived') {
        return fail(error('Project is already archived'));
    }
    const updated = await db.projects.update({
        where: { id: project.id },
        data: { status: 'archived' },
    });
    return succeed(updated);
}

// ── Handler: compose with Result ─────────────────────────

const projects = defineTool<AppContext>('projects', {
    actions: {
        archive: {
            params: { project_id: 'string' },
            handler: async (ctx, args) => {
                // Step 1: Find
                const found = await findProject(ctx.db, args.project_id);
                if (!found.ok) return found.response;

                // Step 2: Authorize
                const authorized = await validateAccess(ctx.user, found.value);
                if (!authorized.ok) return authorized.response;

                // Step 3: Archive
                const archived = await archiveProject(ctx.db, authorized.value);
                if (!archived.ok) return archived.response;

                return success(archived.value);
            },
        },
    },
});
```

---

## 13. Testing Tools

Test your tools without an MCP server.

```typescript
import { describe, it, expect } from 'vitest';
import { projects } from './tools/projects';

describe('projects tool', () => {
    const mockDb = {
        projects: {
            findMany: async () => [
                { id: '1', name: 'Alpha', status: 'active' },
                { id: '2', name: 'Beta', status: 'archived' },
            ],
            findUnique: async ({ where }: { where: { id: string } }) =>
                where.id === '1'
                    ? { id: '1', name: 'Alpha', status: 'active' }
                    : null,
            create: async ({ data }: { data: { name: string } }) =>
                ({ id: '3', name: data.name, status: 'active' }),
        },
    };

    const ctx = { db: mockDb } as AppContext;

    it('lists projects', async () => {
        const result = await projects.execute(ctx, {
            action: 'list',
            workspace_id: 'ws_1',
        });
        expect(result.isError).toBeFalsy();
        const data = JSON.parse(result.content[0].text);
        expect(data).toHaveLength(2);
    });

    it('returns error for unknown project', async () => {
        const result = await projects.execute(ctx, {
            action: 'get',
            workspace_id: 'ws_1',
            id: 'nonexistent',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
    });

    it('validates required params', async () => {
        // Missing workspace_id — Fusion auto-rejects
        const result = await projects.execute(ctx, {
            action: 'create',
            // workspace_id: missing!
            name: 'Test',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('workspace_id');
    });

    it('strips unknown fields (security)', async () => {
        const result = await projects.execute(ctx, {
            action: 'list',
            workspace_id: 'ws_1',
            hacker_field: 'DROP TABLE',  // ← silently stripped by .strip()
        });
        expect(result.isError).toBeFalsy();
    });
});
```

---

## 14. Full Server Setup — Production Pattern

The complete wiring from tools → registry → server.

```typescript
// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ToolRegistry,
    createDebugObserver,
} from '@vinkius-core/mcp-fusion';

// Import your tools
import { projects } from './tools/projects.js';
import { tasks } from './tools/tasks.js';
import { billing } from './tools/billing.js';
import { analytics } from './tools/analytics.js';

// ── Registry ─────────────────────────────────────────────
const registry = new ToolRegistry<AppContext>();
registry.registerAll(projects, tasks, billing, analytics);

// ── Server ───────────────────────────────────────────────
async function main() {
    const server = new Server(
        { name: 'my-app', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    registry.attachToServer(server, {
        // Create context per request (auth, db connection, etc.)
        contextFactory: async (extra) => {
            const session = extra as { sessionId?: string };
            const db = await connectToDatabase();
            const user = await resolveUser(session?.sessionId);
            return { db, user, tenant: user.tenant };
        },

        // Tag-based filtering: only expose public tools
        filter: { exclude: ['internal'] },

        // Debug: structured pipeline events (disable in production)
        debug: process.env.NODE_ENV !== 'production'
            ? createDebugObserver()
            : undefined,

        // State Sync: prevent stale data
        stateSync: {
            defaults: { cacheControl: 'no-store' },
            policies: [
                { match: 'tasks.update', invalidates: ['tasks.*', 'projects.get'] },
                { match: 'billing.*', invalidates: ['billing.*'] },
            ],
        },
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🚀 Server running');
}

main();
```

---

## Next Steps

- [Quickstart →](/quickstart) — Your first tool in 5 minutes
- [Building Tools →](/building-tools) — `defineTool()` vs `createTool()` deep dive
- [Presenter (MVA View) →](/presenter) — Full Presenter API reference
- [Middleware →](/middleware) — Authentication, logging, rate limiting
- [Testing →](/testing) — Test strategies and patterns
- [API Reference →](/api-reference) — Every export documented
