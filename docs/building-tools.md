# Building Tools

MCP Fusion provides four APIs to define tools. All four produce identical MCP tool definitions and coexist in the same registry.

## f.tool() {#f-tool}

The recommended API. `initFusion<AppContext>()` locks in your context type — no generics on individual tools:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const f = initFusion<{ db: Database; user: User }>();

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

Input is validated before the handler runs — bad input never reaches your code. The handler returns plain data; `f.tool()` wraps it in `success()` automatically. The dotted name `tasks.list` splits into domain + action for [tool exposition](/tool-exposition) and [routing](/routing).

### Registering the Server {#register}

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

`registry.attachToServer()` wires `tools/list` and `tools/call` handlers into the MCP SDK. One line replaces all manual `server.tool()` registrations.

## Tool Annotations {#annotations}

MCP [annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations) tell the agent what side effects a tool has:

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

For destructive operations:

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

`destructive: true` sets `destructiveHint` in MCP annotations and appends a `⚠️ DESTRUCTIVE` marker to the tool description. The MCP spec defaults `destructiveHint` to `true` for all tools — Fusion explicitly emits `false` on non-destructive actions so clients don't show unnecessary confirmation dialogs.

## Connecting a Presenter {#presenter}

The `returns` field attaches a [Presenter](/presenter) that controls exactly what the agent sees:

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

The handler returns the raw database row. The Presenter strips it to declared fields, attaches domain rules, and suggests next actions. This is the **MVA (Model-View-Agent)** pattern: handler produces Model, Presenter shapes View, middleware governs Agent access.

## Structured Errors {#tool-error}

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

The agent receives structured XML with a recovery path. Instead of hallucinating a workaround, it follows `availableActions` and calls `projects.list`.

## Streaming Progress {#streaming}

Generator handlers send real-time progress via `notifications/progress`:

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

When no `progressToken` is present in the request, progress events are silently consumed.

## Response Shortcuts {#response-shortcuts}

```typescript
import { response, ui } from '@vinkius-core/mcp-fusion';

return response.ok('Task created successfully');
```

Attach domain rules that travel with the data:

```typescript
return response.withRules(invoiceData, [
  'CRITICAL: amounts are in CENTS — divide by 100 for display.',
  'Use emojis: ✅ Paid, ⚠️ Pending, ❌ Overdue.',
]);
```

Full builder chain:

```typescript
return response(stats)
  .uiBlock(ui.echarts(chartConfig))
  .llmHint('Revenue in USD, not cents.')
  .systemRules(['Always show % change vs. last month.'])
  .build();
```

## createGroup() {#create-group}

For standalone modules, NPM packages, or plugins. Doesn't require `initFusion()`:

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

Middleware is composed once at build time via `reduceRight`. Tools are stored in a `Map<string, handler>` for constant-time dispatch. The group is `Object.freeze()`'d after construction.

## defineTool() {#define-tool}

JSON-first API — no Zod imports. Parameters are plain objects with string shorthands:

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

`{ type: 'string', min: 1, max: 200 }` converts to `z.string().min(1).max(200)` internally. Handlers receive `(ctx, args)` as positional parameters and must return `success()` or `toolError()` explicitly.

### Shared Parameters {#shared}

When every action needs the same field:

```typescript
const projects = defineTool<AppContext>('projects', {
  shared: { workspace_id: 'string' },
  actions: {
    list: {
      readOnly: true,
      handler: async (ctx, args) => {
        return success(await ctx.db.projects.findMany({ workspaceId: args.workspace_id }));
      },
    },
    create: {
      params: { name: 'string' },
      handler: async (ctx, args) => {
        return success(await ctx.db.projects.create({ workspaceId: args.workspace_id, name: args.name }));
      },
    },
  },
});
```

### Hierarchical Groups {#groups}

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
```

`authMiddleware` runs for all actions. `requireAdmin` runs only for `users.*`.

## createTool() {#create-tool}

Fluent builder for when you need Zod's full power — `.regex()`, `.refine()`, `.transform()`:

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

Zod `.describe()` strings are extracted and shown to the LLM as parameter descriptions.

## API Comparison {#comparison}

| | `f.tool()` | `createGroup()` | `defineTool()` | `createTool()` |
|---|---|---|---|---|
| **Style** | tRPC-style `{ input, ctx }` | Functional closure | Declarative config | Fluent builder |
| **Generics** | Inherited from `initFusion` | Passed to factory | Per-call `<Context>` | Per-call `<Context>` |
| **Input format** | Any Standard Schema | Any Standard Schema | JSON descriptors | Zod schemas |
| **Auto `success()`** | Yes | No | No | No |
| **Best for** | New projects, large teams | NPM packages, plugins | Quick prototyping | Complex Zod transforms |
