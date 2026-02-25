# Building Tools

**MCP Fusion** provides **four complementary APIs** for defining tools. Choose the one that fits your use case — all produce identical MCP tool definitions and can coexist in the same registry.

---

## API Comparison

| Feature | `f.tool()` ✨ | `createGroup()` | `defineTool()` | `createTool()` |
|---|---|---|---|---|
| **Style** | tRPC-style `{ input, ctx }` | Functional closure | Declarative config | Fluent builder |
| **Generics** | None — inherited from `initFusion` | None — passed to factory | `<Context>` on every call | `<Context>` on every call |
| **Params** | Any Standard Schema | Any Standard Schema | Plain strings / JSON | Full Zod |
| **Middleware** | Via `f.middleware()` on registry | Pre-composed at build | `middleware` array | `.middleware()` chain |
| **Auto `success()`** | Yes — plain return auto-wraps | No | No | No |
| **Best for** | New projects, teams | Standalone modules | Quick prototyping | Complex Zod transforms |

---

## Recommended: `f.tool()` <Badge type="tip" text="NEW v2.7" />

The tRPC-style API. Initialize once with `initFusion()`, then build tools with zero generics and `{ input, ctx }` destructured handlers.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// 1. Define context type ONCE
const f = initFusion<{ db: Database; user: User }>();

// 2. Define tools — zero generics, auto success() wrapping
const listTasks = f.tool({
    name: 'tasks.list',
    description: 'Lists all tasks',
    input: z.object({
        status: z.enum(['open', 'closed']).optional(),
    }),
    handler: async ({ input, ctx }) => {
        const tasks = await ctx.db.tasks.findMany({ status: input.status });
        return tasks; // ← auto-wrapped in success() 
    },
});

const createTask = f.tool({
    name: 'tasks.create',
    description: 'Creates a new task',
    input: z.object({
        title: z.string().min(1).max(200),
        priority: z.enum(['low', 'medium', 'high']).optional(),
    }),
    handler: async ({ input, ctx }) => {
        const task = await ctx.db.tasks.create(input);
        return { status: 'created', id: task.id };
    },
});

// 3. Register all tools
const registry = f.registry();
registry.register(listTasks);
registry.register(createTask);
```

### Key features of `f.tool()`:

1. **Zero generics** — context type flows from `initFusion<AppContext>()` to every tool
2. **`{ input, ctx }` handler** — destructured, fully typed, no positional args
3. **Auto `success()` wrapping** — return plain data and it's automatically wrapped in `success()`
4. **Auto name splitting** — `'tasks.create'` automatically creates domain `tasks` + action `create`
5. **Standard Schema support** — use Zod, Valibot, ArkType, or any Standard Schema v1 validator

### MVA Integration with Presenter

```typescript
import { InvoicePresenter } from './presenters/InvoicePresenter';

const getInvoice = f.tool({
    name: 'billing.get_invoice',
    description: 'Gets an invoice by ID',
    input: z.object({ id: z.string() }),
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique(input.id);
        // Raw data → Presenter validates, attaches rules, renders UI
    },
});
```

### Server Setup

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
    { name: 'my-api', version: '1.0.0' },
    { capabilities: { tools: {} } }
);
registry.attachToServer(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## `createGroup()` — Functional Closures <Badge type="tip" text="NEW v2.7" />

Build standalone tool modules with pre-composed middleware and O(1) dispatch. Ideal for NPM packages or independent modules.

```typescript
import { createGroup, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const billingGroup = createGroup<AppContext>({
    name: 'billing',
    description: 'Billing operations',
    middleware: [authMiddleware, rateLimitMiddleware],
    tools: [
        {
            name: 'get_invoice',
            description: 'Gets an invoice by ID',
            input: z.object({ id: z.string() }),
            handler: async ({ input, ctx }) => {
                return success(await ctx.db.invoices.find(input.id));
            },
        },
        {
            name: 'pay',
            description: 'Processes payment for an invoice',
            input: z.object({ invoice_id: z.string(), amount: z.number() }),
            handler: async ({ input, ctx }) => {
                await ctx.billing.charge(input.invoice_id, input.amount);
                return success({ paid: true });
            },
        },
    ],
});

// Register the entire group at once
registry.register(billingGroup);
```

### Key features of `createGroup()`:

- **Pre-composed middleware** — middleware chain is composed once at build time via `reduceRight`, not on every request
- **O(1) dispatch** — tools are stored in a `Map<string, handler>` for constant-time lookup
- **Frozen by default** — the group is `Object.freeze()`'d after construction
- **Standalone** — no `initFusion()` needed; great for library authors

---

## Option B: `defineTool()` — JSON-First

The simplest way to define tools. No Zod imports required.

```typescript
import { defineTool, success, error } from '@vinkius-core/mcp-fusion';

const tasks = defineTool<void>('tasks', {
    description: 'Manage tasks across the system',
    actions: {
        list: {
            readOnly: true,
            handler: async (ctx, args) => {
                return success([{ id: 1, name: 'Setup repo' }]);
            },
        },
        create: {
            params: {
                title: { type: 'string', min: 1, max: 200 },
                priority: { enum: ['low', 'medium', 'high'] as const, optional: true },
            },
            handler: async (ctx, args) => {
                return success({ status: 'created', title: args.title });
            },
        },
        delete: {
            destructive: true,
            params: { task_id: 'number' },
            handler: async (ctx, args) => success('Deleted'),
        },
    },
});
```

### Parameter Shorthand

For simple parameters, use string shorthands instead of full descriptors:

```typescript
// These are equivalent:
params: { name: 'string' }
params: { name: { type: 'string' } }

// Full descriptor with constraints:
params: {
    name: { type: 'string', min: 1, max: 100 },
    age: { type: 'number', min: 0, max: 150 },
    role: { enum: ['admin', 'user'] as const },
    tags: { type: 'string', array: true },
    email: { type: 'string', regex: '^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
    nickname: { type: 'string', optional: true },
}
```

### Shared Parameters

Use `shared` to inject common fields into **every** action:

```typescript
const projects = defineTool<AppContext>('projects', {
    shared: { workspace_id: 'string' },
    actions: {
        list: { handler: async (ctx, args) => success(/* args.workspace_id is here */) },
        create: {
            params: { name: 'string' },
            handler: async (ctx, args) => success(/* args.workspace_id + args.name */),
        },
    },
});
```

### Groups (Hierarchical Namespacing)

Organize large API surfaces into groups:

```typescript
const platform = defineTool<AppContext>('platform', {
    shared: { org_id: 'string' },
    middleware: [authMiddleware],
    groups: {
        users: {
            description: 'User management',
            middleware: [requireAdmin],
            actions: {
                list: { readOnly: true, handler: listUsers },
                ban: { destructive: true, params: { user_id: 'string' }, handler: banUser },
            },
        },
        billing: {
            description: 'Billing operations',
            actions: {
                invoices: { readOnly: true, handler: listInvoices },
            },
        },
    },
});
// Actions become: users.list | users.ban | billing.invoices
```

### Compile-Time Handler Validation

If your handler returns the wrong type, `defineTool()` shows a **readable** TypeScript error:

```text
❌ Type Error: handler must return ToolResponse. Use return success(data) or return error(msg).
```

Instead of the usual multi-line recursive generic explosion.

---

## Option C: `createTool()` — Builder Pattern (Full Zod)

The builder pattern gives you full access to Zod's `.regex()`, `.refine()`, `.transform()`, and advanced validation:

```typescript
import { createTool, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const tasks = createTool<void>('tasks')
    .description('Manage tasks across the system')
    .action({
        name: 'list',
        description: 'List all available tasks',
        readOnly: true,
        handler: async (ctx, args) => {
            return success([{ id: 1, name: 'Setup repo' }]);
        },
    })
    .action({
        name: 'create',
        description: 'Creates a new task',
        schema: z.object({
            title: z.string().min(1).describe('The name of the task to create'),
            priority: z.enum(['low', 'medium', 'high']).optional(),
        }),
        handler: async (ctx, args) => {
            // args: { title: string, priority?: 'low' | 'medium' | 'high' }
            return success({ status: 'created', title: args.title });
        },
    })
```

### Why Zod is Powerful Here:
1. **Descriptions are auto-mapped:** Providing `.describe('...')` on your Zod string passes that exact description clearly to the AI model.
2. **Infinite Runtime Safety:** If the Model guesses an incorrect input (e.g., trying to pass `priority: "ultra"`), Fusion's `.strict()` engine rejects the input automatically and returns an actionable error directly back to the AI. Your handler code **never fires** with bad data.
3. **TypeScript Inference:** You never have to manually cast outputs or write secondary TypeScript interfaces.

---

## Destructive Actions

When dealing with operations that permanently delete or mutate data, inform the AI model clearly.

Both APIs support `destructive: true`:

::: code-group
```typescript [defineTool]
delete: {
    destructive: true,
    params: { taskId: 'number' },
    handler: async (ctx, args) => success(`Task ${args.taskId} deleted.`),
}
```
```typescript [createTool]
.action({
    name: 'delete',
    destructive: true,
    schema: z.object({ taskId: z.number() }),
    handler: async (ctx, args) => success(`Task ${args.taskId} deleted.`),
})
```
:::

Setting `destructive: true` accomplishes two things:
1. The framework marks the entire tool definition with flags warning connected systems that mutation is occurring.
2. The `DescriptionGenerator` appends a `⚠️ DESTRUCTIVE` warning. LLMs trained on safety data recognize this and automatically request user confirmation.

---

## Self-Healing Errors

Use `toolError()` to provide structured recovery instructions to LLM agents:

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    const project = await db.findProject(args.id);
    if (!project) {
        return toolError('ProjectNotFound', {
            message: `Project '${args.id}' does not exist.`,
            suggestion: 'Call projects.list to see available projects.',
            availableActions: ['projects.list'],
        });
    }
    return success(project);
}
```

The LLM receives a structured error with recovery hints:
```xml
<tool_error code="ProjectNotFound">
<message>Project 'xyz' does not exist.</message>
<recovery>Call projects.list to see available projects.</recovery>
<available_actions>projects.list</available_actions>
</tool_error>
```

---

## Streaming Progress

For long-running operations, use generator handlers with `progress()`:

```typescript
import { progress, success } from '@vinkius-core/mcp-fusion';

handler: async function* (ctx, args) {
    yield progress(10, 'Cloning repository...');
    await cloneRepo(args.url);
    
    yield progress(50, 'Installing dependencies...');
    await installDeps();
    
    yield progress(90, 'Running tests...');
    const results = await runTests();
    
    return success(results);
}
```

Progress events are automatically forwarded to the MCP client as `notifications/progress` when the client includes a `progressToken` in its request metadata. **Zero configuration required** — the framework detects the token and wires the notifications transparently.

| Internal Event | MCP Wire Format |
|---|---|
| `yield progress(50, 'Building...')` | `notifications/progress { progressToken, progress: 50, total: 100, message: 'Building...' }` |

When no `progressToken` is present (the client didn't opt in), progress events are silently consumed — **zero overhead**.

---

## MVA Integration — `returns: Presenter`

Attach a [Presenter](/presenter) to any action with the `returns` field. When set, your handler returns **raw data** instead of `ToolResponse`. The framework pipes it through the Presenter automatically.

::: code-group
```typescript [f.tool() — Recommended ✨]
import { initFusion } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const f = initFusion<AppContext>();

const getInvoice = f.tool({
    name: 'billing.get',
    description: 'Gets an invoice by ID',
    input: z.object({ id: z.string() }),
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique({ where: { id: input.id } });
        // Raw data → Presenter validates, attaches rules, renders UI
    },
});
```
```typescript [defineTool]
import { defineTool } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const billing = defineTool<AppContext>('billing', {
    actions: {
        get: {
            readOnly: true,
            params: { id: 'string' },
            returns: InvoicePresenter,
            handler: async (ctx, args) => {
                return await ctx.db.invoices.findUnique({ where: { id: args.id } });
            },
        },
    },
});
```
```typescript [createTool]
import { createTool } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const billing = createTool<AppContext>('billing')
    .action({
        name: 'get',
        readOnly: true,
        schema: z.object({ id: z.string() }),
        returns: InvoicePresenter,
        handler: async (ctx, args) => {
            return await ctx.db.invoices.findUnique({ where: { id: args.id } });
        },
    });
```
:::

> **See:** [Presenter →](/presenter) for the full configuration API.

---

## Response Shortcuts

For handlers that don't use a Presenter but need more than `success()`:

```typescript
import { response, ui } from '@vinkius-core/mcp-fusion';

// Quick one-liner response
return response.ok('Task created successfully');

// Response with domain rules (no chaining needed)
return response.withRules(invoiceData, [
    'CRITICAL: amounts are in CENTS — divide by 100.',
    'Use emojis: ✅ Paid, ⚠️ Pending.',
]);

// Full builder chain for maximum control
return response(stats)
    .uiBlock(ui.echarts(chartConfig))
    .llmHint('Revenue in USD, not cents.')
    .systemRules(['Always show % change vs. last month.'])
    .build();
```

---

## Next Steps

- [DX Guide →](/dx-guide) — `initFusion()`, `definePresenter()`, `autoDiscover()`, Standard Schema
- [Presenter (MVA View) →](/presenter) — Domain-level Presenters for consistent agent perception
- [Context & Dependency Injection →](/context)
- [Middleware & Context Derivation →](/middleware)
- [Hierarchical Routing →](/routing)
