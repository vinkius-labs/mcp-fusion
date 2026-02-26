# Cookbook & Examples

Copy-paste patterns for every MCP Fusion feature. Each example is self-contained.


## 1. Basic CRUD Tool

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
    db: Database;
}

const f = initFusion<AppContext>();

const listProjects = f.tool({
    name: 'projects.list',
    description: 'List all projects in a workspace',
    input: {
        workspace_id: 'string',
        status: { enum: ['active', 'archived', 'all'] as const, optional: true },
        limit: { type: 'number', min: 1, max: 100, optional: true },
    },
    handler: async ({ input, ctx }) => {
        return await ctx.db.projects.findMany({
            where: {
                workspaceId: input.workspace_id,
                ...(input.status && input.status !== 'all' && { status: input.status }),
            },
            take: input.limit ?? 20,
        });
    },
});

const getProject = f.tool({
    name: 'projects.get',
    description: 'Get a single project by ID',
    input: { workspace_id: 'string', id: 'string' },
    handler: async ({ input, ctx }) => {
        const project = await ctx.db.projects.findUnique({
            where: { id: input.id, workspaceId: input.workspace_id },
        });
        if (!project) throw new Error(`Project "${input.id}" not found`);
        return project;
    },
});

const createProject = f.tool({
    name: 'projects.create',
    description: 'Create a new project',
    input: {
        workspace_id: 'string',
        name: { type: 'string', min: 1, max: 200 },
        description: { type: 'string', optional: true },
    },
    handler: async ({ input, ctx }) => {
        return await ctx.db.projects.create({ data: input });
    },
});

const deleteProject = f.tool({
    name: 'projects.delete',
    description: 'Delete a project permanently',
    input: { workspace_id: 'string', id: 'string' },
    handler: async ({ input, ctx }) => {
        await ctx.db.projects.delete({
            where: { id: input.id, workspaceId: input.workspace_id },
        });
        return `Project "${input.id}" deleted`;
    },
});

// Register all
const registry = f.registry();
registry.register(listProjects);
registry.register(getProject);
registry.register(createProject);
registry.register(deleteProject);
```


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

The AI sees the error as structured XML:

```xml
<tool_error code="InvoiceNotFound">
<message>Invoice "INV-999" does not exist.</message>
<recovery>Call billing.list_invoices first to find valid IDs.</recovery>
<available_actions>billing.list_invoices</available_actions>
</tool_error>
```


## 3. Full MVA Presenter — Invoice Domain

Complete Presenter with validation, rules, UI blocks, guardrails, and HATEOAS.

```typescript
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    client_name: z.string(),
    amount_cents: z.number().describe('CRITICAL: Value is in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending', 'overdue']).describe('Use emojis: ✅ paid, ⏳ pending, 🔴 overdue'),
    due_date: z.string().describe('Display in human-readable format: "Jan 15, 2025"'),
    items: z.array(z.object({
        description: z.string(),
        amount_cents: z.number(),
    })),
});

export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    autoRules: true, // ← auto-extracts .describe() as system rules
    systemRules: ['Use currency format: $XX,XXX.00'],

    uiBlocks: (invoice) => [
        ui.echarts({
            series: [{
                type: 'gauge',
                data: [{ value: invoice.amount_cents / 100, name: invoice.status }],
                max: Math.ceil(invoice.amount_cents / 100 * 1.5),
            }],
        }),
    ],

    collectionUi: (invoices) => [
        ui.echarts({
            xAxis: { type: 'category', data: invoices.map(i => i.id) },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
        }),
        ui.summary(
            `${invoices.length} invoices. ` +
            `Total: $${(invoices.reduce((s, i) => s + i.amount_cents, 0) / 100).toLocaleString()}`
        ),
    ],

    agentLimit: {
        max: 50,
        onTruncate: (omitted) => ui.summary(
            `⚠️ Dataset truncated. 50 shown, ${omitted} hidden. ` +
            `Use status or date_range filters to narrow results.`
        ),
    },

    suggestActions: (invoice) => {
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
        return [];
    },
});
```

### Using the Presenter in a Tool

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const f = initFusion<AppContext>();

const getInvoice = f.tool({
    name: 'billing.get_invoice',
    description: 'Gets an invoice by ID',
    input: { invoice_id: 'string' },
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique({
            where: { id: input.invoice_id },
            include: { items: true },
        });
    },
});

const listInvoices = f.tool({
    name: 'billing.list_invoices',
    description: 'Lists invoices with optional status filter',
    input: {
        status: { enum: ['paid', 'pending', 'overdue'] as const, optional: true },
    },
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findMany({
            where: input.status ? { status: input.status } : {},
            include: { items: true },
        });
    },
});
```


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


## 5. Hierarchical Groups — Platform Tool

Organize many actions into named groups under a single tool.

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

The AI calls the tool using the `action` discriminator:

```json
{ "action": "users.list", "org_id": "org_123" }
{ "action": "users.invite", "org_id": "org_123", "email": "alice@co.io", "role": "admin" }
{ "action": "billing.upgrade", "org_id": "org_123", "plan": "enterprise" }
```


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

When attached to an MCP server via `attachToServer()`, `yield progress()` calls are automatically forwarded as `notifications/progress` — zero configuration.


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

Use `toonSuccess(data)` for arrays of uniform objects. Use `.toonDescription()` when your tool has many actions and the description consumes too many tokens.


## 10. Prompts — Reusable Context Templates 

Prompts inject structured context into the conversation — users select them from a menu in their MCP client.

### Basic Prompt — No Zod

```typescript
import { initFusion, PromptMessage } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

// Code review prompt — plain JSON descriptors, no Zod needed
const codeReview = f.prompt({
    name: 'code-review',
    description: 'Review code for quality and suggest improvements',
    args: {
        language: { enum: ['typescript', 'python', 'go', 'rust'] as const },
        focus: {
            type: 'string',
            description: 'Area to focus on: performance, security, readability',
            optional: true,
        },
        severity: {
            enum: ['strict', 'moderate', 'lenient'] as const,
            description: 'How strict the review should be',
            optional: true,
        },
    } as const,
    handler: async ({ args }) => {
        const focusHint = args.focus ? ` Focus specifically on ${args.focus}.` : '';
        const severity = args.severity ?? 'moderate';
        return [
            PromptMessage.user(
                `You are a ${severity} code reviewer for ${args.language}.${focusHint}\n\n` +
                `Review the code I'm about to share. For each issue found:\n` +
                `1. Describe the problem\n` +
                `2. Explain the impact\n` +
                `3. Provide the corrected code`
            ),
        ];
    },
});

const registry = f.registry();
registry.registerPrompt(codeReview);
```

### Multi-Modal Prompt — Images & Resources

```typescript
const debugUI = f.prompt({
    name: 'debug-ui',
    description: 'Debug a UI issue from a screenshot',
    args: {
        component: { type: 'string', description: 'Component name' },
        framework: { enum: ['react', 'vue', 'svelte'] as const },
    } as const,
    handler: async ({ args }) => [
        PromptMessage.user(
            `I have a ${args.framework} component "${args.component}" with a visual bug. ` +
            `Analyze the screenshot and the component source code below.`
        ),
        PromptMessage.image('https://screenshots.example.com/bug-report.png', 'image/png'),
        PromptMessage.resource(`file:///src/components/${args.component}.tsx`, 'text/typescript'),
    ],
});
```

### Prompt with Presenter Bridge — `fromView()`

Connect prompts to your MVA Presenters for rich, rule-aware context:

```typescript
import { definePresenter, PromptMessage } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const ProjectPresenter = definePresenter({
    name: 'Project',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        status: z.enum(['active', 'archived']).describe('Use emojis: 🟢 active, 📦 archived'),
        budget_cents: z.number().describe('CRITICAL: Value is in CENTS. Divide by 100.'),
    }),
    autoRules: true,
});

const planSprint = f.prompt({
    name: 'plan-sprint',
    description: 'Plan the next sprint based on project state',
    args: { project_id: 'string' } as const,
    handler: async ({ args, ctx }) => {
        const project = await ctx.db.projects.findUnique({
            where: { id: args.project_id },
        });

        return [
            PromptMessage.user('Plan the next 2-week sprint for this project:'),
            // fromView() injects Presenter rules + UI blocks automatically
            PromptMessage.fromView(project, ProjectPresenter),
            PromptMessage.user(
                'Consider the budget, current status, and team velocity. ' +
                'Output a sprint backlog as a markdown table.'
            ),
        ];
    },
});
```

### Prompt with Zod Args

```typescript
import { z } from 'zod';
import { PromptMessage } from '@vinkius-core/mcp-fusion';

const sqlHelper = f.prompt({
    name: 'sql-helper',
    description: 'Generate SQL queries from natural language',
    args: z.object({
        dialect: z.enum(['postgresql', 'mysql', 'sqlite']),
        tables: z.string().describe('Comma-separated table names to query'),
        intent: z.string().describe('What you want to query in plain English'),
    }),
    handler: async ({ args }) => [
        PromptMessage.user(
            `You are a ${args.dialect} expert. Available tables: ${args.tables}.\n\n` +
            `Generate an optimized SQL query for: "${args.intent}"\n\n` +
            `Rules:\n` +
            `- Use CTEs for complex queries\n` +
            `- Add comments explaining each section\n` +
            `- Include an EXPLAIN plan estimate`
        ),
    ],
});
```

| Use Case | Use |
|---|---|
| Execute an action (CRUD, API call) | `f.tool()` |
| Pre-fill LLM context with instructions | `f.prompt()` |
| User-triggered template (slash command) | `f.prompt()` |
| Automated by the LLM during reasoning | `f.tool()` |
| Accepts arrays or complex nested input | `f.tool()` |
| Appears in MCP client menu as a template | `f.prompt()` |


## 11. Presenter Composition — Nested Relations

Define Presenters once, embed them everywhere.

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


## 12. State Sync — Prevent Stale Data

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

After `tasks.create` succeeds, the AI receives a cache invalidation notice:

```
[System: Cache invalidated for tasks.*, projects.get, sprints.get — caused by tasks.create]
```


## 13. Result Monad — Composable Error Handling

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


## 14. Testing Tools

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

    it('rejects unknown fields (.strict() security)', async () => {
        const result = await projects.execute(ctx, {
            action: 'list',
            workspace_id: 'ws_1',
            hacker_field: 'DROP TABLE',  // ← rejected by .strict() with actionable error
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('hacker_field');
    });
});
```


## 15. Full Server Setup — Production Pattern

The complete wiring from tools → registry → server.

```typescript
// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initFusion, autoDiscover, createDebugObserver } from '@vinkius-core/mcp-fusion';

interface AppContext {
    db: Database;
    user: User;
    tenant: Tenant;
}

// ── Initialize ───────────────────────────────────────────
const f = initFusion<AppContext>();
const registry = f.registry();

// Auto-discover all tools from the filesystem
await autoDiscover(registry, './src/tools');

// ── Server ───────────────────────────────────────────────
async function main() {
    const server = new Server(
        { name: 'my-app', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    registry.attachToServer(server, {
        contextFactory: async (extra) => {
            const session = extra as { sessionId?: string };
            const db = await connectToDatabase();
            const user = await resolveUser(session?.sessionId);
            return { db, user, tenant: user.tenant };
        },
        filter: { exclude: ['internal'] },
        debug: process.env.NODE_ENV !== 'production'
            ? createDebugObserver()
            : undefined,
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


## 16. HMR Dev Server 

Hot-reload tools on file change during development — the LLM client stays connected.

```typescript
// src/dev.ts
import { createDevServer, autoDiscover } from '@vinkius-core/mcp-fusion/dev';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
    { name: 'my-app-dev', version: '1.0.0' },
    { capabilities: { tools: {} } },
);

const devServer = createDevServer({
    dir: './src/tools',
    setup: async (registry) => await autoDiscover(registry, './src/tools'),
    onReload: (file) => console.error(`♻️ Reloaded: ${file}`),
    server,
});

await devServer.start();

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🔥 Dev server running with HMR');
```


## 17. Functional Groups — Standalone Modules 

Build self-contained tool modules with pre-composed middleware.

```typescript
import { createGroup, success } from '@vinkius-core/mcp-fusion';

const billingGroup = createGroup<AppContext>({
    name: 'billing',
    description: 'Payment processing',
    middleware: [authMiddleware, auditLog],
    tools: [
        {
            name: 'charge',
            description: 'Charge an invoice',
            input: {
                invoice_id: 'string',
                amount: { type: 'number', min: 1, description: 'Amount in cents' },
            },
            handler: async ({ input, ctx }) => {
                await ctx.billing.charge(input.invoice_id, input.amount);
                return success({ charged: true });
            },
        },
        {
            name: 'refund',
            description: 'Refund a payment',
            input: { payment_id: 'string' },
            handler: async ({ input, ctx }) => {
                await ctx.billing.refund(input.payment_id);
                return success({ refunded: true });
            },
        },
    ],
});

registry.register(billingGroup);
```
