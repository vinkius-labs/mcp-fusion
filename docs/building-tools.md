# Building Tools

In a raw MCP server, you register tools with `server.tool()` — a name, a schema, a callback. It works, but every handler becomes a monolith: validation, auth checks, data fetching, response formatting, and error handling mixed into one function. Add 30 tools and you have 30 monoliths.

MCP Fusion provides four APIs to define tools. All four produce identical MCP tool definitions and coexist in the same registry. The difference is how much ceremony each API requires — and what it gives you in return.

---

## Your First Tool with `f.tool()` {#f-tool}

The recommended API. After calling `initFusion<AppContext>()`, every tool inherits your context type automatically — no generic annotations on individual tools.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const f = initFusion<{ db: Database; user: User }>();
```

With `f` in hand, define a tool by passing a configuration object. The handler receives `{ input, ctx }` — fully typed by inference:

```typescript
const listTasks = f.tool({
  name: 'tasks.list',
  description: 'Lists all tasks for the current user',
  input: z.object({
    status: z.enum(['open', 'closed']).optional(),
  }),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return ctx.db.tasks.findMany({ status: input.status });
  },
});
```

Three things happened here that differ from raw MCP:

1. **Input is validated before the handler runs.** If the agent sends `{ status: 42 }`, validation rejects it and the handler never executes. The agent receives a structured error with the exact field that failed.
2. **The handler returns plain data.** No `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` wrapping — `f.tool()` auto-wraps the return value in `success()`.
3. **The dotted name `tasks.list`** splits into domain `tasks` + action `list`. This feeds into [tool exposition](/tool-exposition) and [routing](/routing).

### Registering and Starting the Server {#register}

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.register(listTasks);

const server = new McpServer({ name: 'my-api', version: '1.0.0' });
registry.attachToServer(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

`registry.attachToServer()` wires MCP Fusion's pipeline into the MCP SDK. It registers `tools/list` and `tools/call` handlers. One line replaces all the manual `server.tool()` registrations you'd write in a raw server.

---

## Tool Annotations {#annotations}

MCP defines [annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations) that tell the agent (and the human supervising it) what kind of side effects a tool has. In a raw server you'd manually construct the annotation object. In MCP Fusion, set boolean flags:

```typescript
const getUser = f.tool({
  name: 'users.get',
  description: 'Retrieve a user profile',
  input: z.object({ id: z.string() }),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return ctx.db.users.findUnique({ where: { id: input.id } });
  },
});
```

`readOnly: true` tells the MCP client this tool doesn't modify state. Agents and clients use this to decide which tools are safe to call without user confirmation.

For operations that permanently delete or mutate data, set `destructive: true`:

```typescript
const deleteUser = f.tool({
  name: 'users.delete',
  description: 'Permanently delete a user account',
  input: z.object({ id: z.string() }),
  destructive: true,
  handler: async ({ input, ctx }) => {
    await ctx.db.users.delete({ where: { id: input.id } });
    return { deleted: true };
  },
});
```

The framework does two things with `destructive: true`: it sets `destructiveHint: true` in the MCP annotations, and the `DescriptionGenerator` appends a `⚠️ DESTRUCTIVE` marker to the tool description. LLMs trained on safety data recognize this and request user confirmation before executing.

::: info
The MCP spec defaults `destructiveHint` to `true` for all tools. MCP Fusion explicitly emits `destructiveHint: false` on non-destructive actions so clients like Claude Desktop and Cursor don't show unnecessary confirmation dialogs.
:::

---

## Connecting a Presenter {#presenter}

Without a Presenter, your handler's return value goes straight to the agent — every field, every column. With the `returns` field, you attach a [Presenter](/presenter) that controls exactly what the agent sees:

```typescript
import { InvoicePresenter } from './presenters/InvoicePresenter';

const getInvoice = f.tool({
  name: 'billing.get',
  description: 'Retrieve an invoice by ID',
  input: z.object({ id: z.string() }),
  returns: InvoicePresenter,
  handler: async ({ input, ctx }) => {
    return ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```

The handler returns the raw database row — 15+ columns. The Presenter strips it to the declared fields, attaches domain rules, and suggests next actions. The handler's only job is to fetch data. Everything else is separated into the Presenter layer.

This is the **MVA (Model-View-Agent)** pattern: the handler produces the Model, the Presenter shapes the View, and middleware governs Agent access. See [Presenter Guide](/presenter) for the full configuration API.

---

## Structured Errors with `toolError()` {#tool-error}

When a tool call fails, the agent needs more than a stack trace. It needs to know _what went wrong_ and _what to try next_. `toolError()` provides structured recovery instructions:

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

const getProject = f.tool({
  name: 'projects.get',
  description: 'Retrieve a project by ID',
  input: z.object({ id: z.string() }),
  handler: async ({ input, ctx }) => {
    const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
    if (!project) {
      return toolError('ProjectNotFound', {
        message: `Project '${input.id}' does not exist.`,
        suggestion: 'Call projects.list to see available projects.',
        availableActions: ['projects.list'],
      });
    }
    return project;
  },
});
```

The agent receives a structured error with a recovery path:

```xml
<tool_error code="ProjectNotFound">
  <message>Project 'xyz' does not exist.</message>
  <recovery>Call projects.list to see available projects.</recovery>
  <available_actions>projects.list</available_actions>
</tool_error>
```

Instead of giving up or hallucinating a workaround, the agent follows the `availableActions` hint and calls `projects.list`. This is self-healing behavior — the error contains the instructions to recover from it.

---

## Streaming Progress {#streaming}

Some operations take seconds or minutes — repository cloning, batch processing, report generation. Without progress feedback, the agent and the user stare at a spinner. Generator handlers with `progress()` solve this:

```typescript
import { progress, success } from '@vinkius-core/mcp-fusion';

const deploy = f.tool({
  name: 'infra.deploy',
  description: 'Deploy the application to staging',
  input: z.object({ env: z.enum(['staging', 'production']) }),
  handler: async function* ({ input, ctx }) {
    yield progress(10, 'Cloning repository...');
    await cloneRepo(ctx.repoUrl);

    yield progress(50, 'Installing dependencies...');
    await installDeps();

    yield progress(90, 'Running tests...');
    const results = await runTests();

    return success(results);
  },
});
```

When the MCP client includes a `progressToken` in its request metadata, each `yield progress()` is forwarded as a `notifications/progress` message. The client shows real-time progress to the user. When no token is present, progress events are silently consumed — no overhead, no code changes.

---

## Response Shortcuts {#response-shortcuts}

For handlers that don't use a Presenter but need more than a plain return value, MCP Fusion provides response builders:

```typescript
import { response, ui } from '@vinkius-core/mcp-fusion';

// Plain text response
return response.ok('Task created successfully');
```

`response.ok()` wraps a string into a valid MCP response. For richer output, attach domain rules that travel with the data:

```typescript
return response.withRules(invoiceData, [
  'CRITICAL: amounts are in CENTS — divide by 100 for display.',
  'Use emojis: ✅ Paid, ⚠️ Pending, ❌ Overdue.',
]);
```

Domain rules are text instructions injected into the response. The agent reads them alongside the data — it doesn't guess that `amount_cents` needs division, the data tells it. For full control, use the builder chain:

```typescript
return response(stats)
  .uiBlock(ui.echarts(chartConfig))
  .llmHint('Revenue in USD, not cents.')
  .systemRules(['Always show % change vs. last month.'])
  .build();
```

---

## Alternative API: `createGroup()` {#create-group}

When you're building a standalone module — an NPM package, a plugin, a self-contained domain — `createGroup()` bundles related tools with pre-composed middleware. It doesn't require `initFusion()`, so consuming projects don't need to share a Fusion instance.

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
      description: 'Retrieve an invoice by ID',
      input: z.object({ id: z.string() }),
      handler: async ({ input, ctx }) => {
        return success(await ctx.db.invoices.find(input.id));
      },
    },
    {
      name: 'pay',
      description: 'Process payment for an invoice',
      input: z.object({ invoice_id: z.string(), amount: z.number() }),
      handler: async ({ input, ctx }) => {
        await ctx.billing.charge(input.invoice_id, input.amount);
        return success({ paid: true });
      },
    },
  ],
});

registry.register(billingGroup);
```

The middleware chain is composed once at build time via `reduceRight`, not on every request. Tools are stored in a `Map<string, handler>` for constant-time dispatch. The group is `Object.freeze()`'d after construction — no accidental mutation at runtime.

---

## Alternative API: `defineTool()` {#define-tool}

The JSON-first API. No Zod imports required — parameters are plain objects with string shorthands. Ideal for rapid prototyping or when your inputs are simple primitives:

```typescript
import { defineTool, success } from '@vinkius-core/mcp-fusion';

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
  },
});
```

The shorthand `{ type: 'string', min: 1, max: 200 }` is equivalent to `z.string().min(1).max(200)`. The framework converts descriptors to Zod internally — same validation, same error messages. For the full descriptor reference, see the [DX Guide](/dx-guide#json-descriptors).

`defineTool()` handlers receive `(ctx, args)` as positional parameters and must return `success()` or `toolError()` explicitly — there's no auto-wrapping.

### Shared Parameters {#shared}

When every action in a tool needs the same field (e.g., `workspace_id`), use `shared` to inject it once:

```typescript
const projects = defineTool<AppContext>('projects', {
  shared: { workspace_id: 'string' },
  actions: {
    list: {
      readOnly: true,
      handler: async (ctx, args) => {
        // args.workspace_id is available here
        return success(await ctx.db.projects.findMany({ workspaceId: args.workspace_id }));
      },
    },
    create: {
      params: { name: 'string' },
      handler: async (ctx, args) => {
        // args.workspace_id + args.name — both available
        return success(await ctx.db.projects.create({ workspaceId: args.workspace_id, name: args.name }));
      },
    },
  },
});
```

### Hierarchical Groups {#groups}

For large API surfaces, organize actions into groups. Each group can have its own middleware:

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
// Actions: users.list | users.ban | billing.invoices
```

The `authMiddleware` runs for all actions. `requireAdmin` runs only for `users.*`. This gives you per-namespace access control without duplicating middleware in every action.

---

## Alternative API: `createTool()` {#create-tool}

The builder pattern. Use it when you need Zod's full power — `.regex()`, `.refine()`, `.transform()`, custom error maps:

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
    description: 'Create a new task',
    schema: z.object({
      title: z.string().min(1).describe('The name of the task to create'),
      priority: z.enum(['low', 'medium', 'high']).optional(),
    }),
    handler: async (ctx, args) => {
      return success({ status: 'created', title: args.title });
    },
  });
```

Zod `.describe()` strings are extracted and passed to the LLM as parameter descriptions — the agent knows what each field expects without reading external documentation. Handler arguments are inferred from the schema — no manual type casts.

---

## API Comparison {#comparison}

All four APIs produce identical MCP tool definitions. The differences are ergonomic:

| | `f.tool()` | `createGroup()` | `defineTool()` | `createTool()` |
|---|---|---|---|---|
| **Style** | tRPC-style `{ input, ctx }` | Functional closure | Declarative config | Fluent builder |
| **Generics** | Inherited from `initFusion` | Passed to factory | Per-call `<Context>` | Per-call `<Context>` |
| **Input format** | Any Standard Schema | Any Standard Schema | JSON descriptors | Zod schemas |
| **Auto `success()`** | Yes | No | No | No |
| **Best for** | New projects, large teams | NPM packages, plugins | Quick prototyping | Complex Zod transforms |

Start with `f.tool()`. Switch to `defineTool()` when you want zero Zod imports, `createTool()` when you need transforms/refines, or `createGroup()` when building distributable modules.

---

## Where to Go Next {#next-steps}

- [Routing & Namespaces](/routing) — file-based routing, discriminators, hierarchical namespacing
- [Tool Exposition](/tool-exposition) — flat vs. grouped MCP wire format
- [Presenter Guide](/presenter) — control exactly what the agent sees
- [Middleware](/middleware) — authentication, rate limiting, context derivation
- [Error Handling](/error-handling) — error categories, recovery patterns, validation errors
