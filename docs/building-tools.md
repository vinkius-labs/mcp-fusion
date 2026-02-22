# Building Tools

MCP Fusion provides **two complementary APIs** for defining tools. Choose the one that fits your use case — both produce identical MCP tool definitions and can coexist in the same registry.

---

## API Comparison

| Feature | `defineTool()` | `createTool()` |
|---|---|---|
| **Syntax** | Declarative config object | Fluent builder chain |
| **Params** | Plain strings, JSON descriptors | Full Zod schemas |
| **Zod needed?** | No (auto-converts to Zod) | Yes |
| **Shared params** | `shared` field | `.commonSchema()` |
| **Groups** | `groups` field | `.group()` |
| **MVA Presenter** | `returns: Presenter` | `returns: Presenter` |
| **Annotations** | `annotations: {...}` | `.annotations({...})` |
| **TOON** | `toonDescription: true` | `.toonDescription()` |
| **Best for** | Rapid prototyping, simple params | Complex validation, transforms |

---

## Option A: `defineTool()` — JSON-First

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

## Option B: `createTool()` — Builder Pattern (Full Zod)

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
2. **Infinite Runtime Safety:** If the Model guesses an incorrect input (e.g., trying to pass `priority: "ultra"`), Fusion's `.strip()` engine bounces the execution automatically and returns a helpful error directly back to the AI. Your handler code **never fires** with bad data.
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
```text
[ProjectNotFound] Project 'xyz' does not exist.
💡 Suggestion: Call projects.list to see available projects.
📋 Try: projects.list
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
                // Raw data → Presenter validates, attaches rules, renders UI
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

- [Presenter (MVA View) →](/presenter) — Domain-level Presenters for consistent agent perception
- [Context & Dependency Injection →](/context)
- [Middleware & Context Derivation →](/middleware)
- [Hierarchical Routing →](/routing)
