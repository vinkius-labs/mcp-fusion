# Building Tools

MCP Fusion provides multiple APIs to define tools, lead by a modern **Fluent API** designed for AI-First DX. All APIs produce identical MCP tool definitions and coexist in the same registry.

## Semantic Fluent API (Recommended) {#fluent-api}

The recommended way to build tools. Uses semantic verbs (`query`, `mutation`, `action`) with a chainable, type-safe builder.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

// ── Query: Read-only, no side effects ──────────────────
export const listTasks = f.query('tasks.list')
  .describe('Lists all tasks for the current user')
  .instructions('Use this to give the user an overview of their work.')
  .input({
    status: f.enum(['open', 'closed']).optional(),
  })
  .resolve(async ({ input, ctx }) => {
    return ctx.db.tasks.findMany({ status: input.status });
  });

// ── Mutation: Destructive, irreversible ───────────────
export const deleteTask = f.mutation('tasks.delete')
  .describe('Permanently delete a task')
  .instructions('ALWAYS confirm with the user before deleting.')
  .input({ id: f.string() })
  .resolve(async ({ input, ctx }) => {
    await ctx.db.tasks.delete(input.id);
    return { deleted: true };
  });
```

### Why use the Fluent API?

1. **Semantic Defaults**: `f.query()` automatically sets `readOnly: true`, while `f.mutation()` sets `destructive: true`.
2. **AI-First DX**: `.instructions()` embeds prompt engineering directly into the tool definition, reducing hallucinations.
3. **Type Chaining**: Context and Input types accumulate as you chain calls, providing full IDE autocomplete in `.resolve()`.
4. **Implicit success()**: Handlers return raw data; the builder wraps it in `success()` automatically.

---

### Registering the Server {#register}

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.register(listTasks, deleteTask);

const server = new McpServer({ name: 'my-api', version: '1.0.0' });
registry.attachToServer(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

`registry.attachToServer()` wires `tools/list` and `tools/call` handlers into the MCP SDK. One line replaces all manual `server.tool()` registrations.

---

## Input Schema Shorthands {#shorthands}

The `.input()` method supports Zod, JSON descriptors, or Fusion's chainable helpers:

```typescript
// 1. Fusion Helpers (Zero Zod import)
.input({ 
  id: f.string().uuid(),
  count: f.number().min(1).max(100),
  tags: f.array(f.string()).optional()
})

// 2. Zod Object
.input(z.object({
  query: z.string().describe('Search term')
}))

// 3. JSON Shorthand
.input({ 
  workspace_id: 'string',
  priority: { enum: ['high', 'low'] }
})
```

---

## Connecting a Presenter {#presenter}

The `.returns()` method attaches a [Presenter](/presenter) that controls exactly what the agent sees:

```typescript
import { InvoicePresenter } from './presenters/InvoicePresenter';

export const getInvoice = f.query('billing.get')
  .describe('Retrieve an invoice by ID')
  .input({ id: f.string() })
  .returns(InvoicePresenter) // ← Bridges Model to View
  .resolve(async ({ input, ctx }) => {
    return ctx.db.invoices.findUnique(input.id);
  });
```

The handler returns the raw database row. The Presenter strips it to declared fields, attaches domain rules, and suggests next actions. This is the **MVA (Model-View-Agent)** pattern.

---

## Context Derivation (Middleware) {#middleware}

Enrich your context before it reaches the handler using `.use()`:

```typescript
export const secureTool = f.query('admin.stats')
  .use(async ({ ctx, next }) => {
    const session = await checkAuth(ctx.token);
    if (!session.isAdmin) throw new Error('Unauthorized');
    
    // next() injects new data into the context for downstream
    return next({ ...ctx, session });
  })
  .resolve(async ({ ctx }) => {
    // ctx.session is fully typed here!
    return ctx.db.getStats(ctx.session.orgId);
  });
```

---

## Structured Errors {#tool-error}

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

export const getProject = f.query('projects.get')
  .input({ id: f.string() })
  .resolve(async ({ input, ctx }) => {
    const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
    if (!project) {
      return toolError('ProjectNotFound', {
        message: `Project '${input.id}' does not exist.`,
        suggestion: 'Call projects.list to see available projects.',
        availableActions: ['projects.list'],
      });
    }
    return project;
  });
```

The agent receives structured XML with a recovery path. Instead of hallucinating a workaround, it follows `availableActions`.

---

## Streaming Progress {#streaming}

Generator handlers send real-time progress via `notifications/progress`:

```typescript
import { progress, success } from '@vinkius-core/mcp-fusion';

export const deploy = f.action('infra.deploy')
  .input({ env: f.enum(['staging', 'production']) })
  .resolve(async function* ({ input, ctx }) {
    yield progress(10, 'Cloning repository...');
    await cloneRepo(ctx.repoUrl);

    yield progress(90, 'Running tests...');
    const results = await runTests();

    return success(results);
  });
```

---

## Alternative APIs {#alternatives}

While the Fluent API is recommended, Fusion supports other styles for specialized needs:

### f.tool()
Legacy tRPC-style configuration object.
```typescript
const tool = f.tool({
  name: 'users.get',
  input: z.object({ id: z.string() }),
  handler: async ({ input, ctx }) => { ... }
});
```

### defineTool()
Declarative, JSON-first API. Best for quick prototyping without Zod.
```typescript
const tasks = defineTool('tasks', {
  actions: {
    list: { readOnly: true, handler: async (ctx, args) => { ... } }
  }
});
```

### createGroup()
Functional closure for standalone modules or plugins.
```typescript
const billing = createGroup({ name: 'billing', tools: [...] });
```

---

## API Comparison {#comparison}

| | **Fluent (f.query)** | `f.tool()` | `defineTool()` | `createGroup()` |
|---|---|---|---|---|
| **Style** | Chainable (Semantic) | Config Object | Declarative JSON | Functional closure |
| **AI-First DX** | ✅ `.instructions()` | ❌ | ❌ | ❌ |
| **Context** | Injected & Derived | Injected | Positional Arg | Positional Arg |
| **Auto `success()`** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Best for** | **All new projects** | Legacy migration | No-Zod environments | External plugins |
