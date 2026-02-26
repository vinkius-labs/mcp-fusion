# Namespaces & Routing

As your MCP server grows beyond a handful of tools, two problems appear. First, every tool definition consumes tokens in the agent's context window — 100 flat tools can burn thousands of tokens before the agent starts reasoning about the user's request. Second, the agent struggles to choose between semantically similar names like `user_preferences_update` and `system_preferences_update`.

MCP Fusion solves both problems by separating how you _author_ tools from how the agent _discovers_ them. You organize tools as files in a directory tree. The framework maps that tree into MCP tool definitions with clear naming, discriminators, and shared schemas.

---

## File-Based Routing with `autoDiscover()` {#auto-discover}

The manual pattern — importing every tool file and calling `registry.register()` — doesn't scale. With 30 tool files, you maintain a 30-line import list that breaks every time you add, rename, or delete a file.

`autoDiscover()` scans a directory and registers all exported tools automatically:

```typescript
import { initFusion, autoDiscover } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();
const registry = f.registry();

await autoDiscover(registry, './src/tools');
```

Your file structure becomes your routing table:

```text
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   ├── pay.ts          → billing.pay
│   └── refund.ts       → billing.refund
├── users/
│   ├── list.ts         → users.list
│   ├── invite.ts       → users.invite
│   └── ban.ts          → users.ban
└── analytics/
    └── dashboard.ts    → analytics.dashboard
```

Add a new file, export a tool from it — it's registered on the next server start. Delete a file — it's gone. No import lists to maintain.

Each tool file needs to export a builder. `autoDiscover()` checks three things in order:

1. **Default export** — `export default f.tool({ ... })`
2. **Named `tool` export** — `export const tool = f.tool({ ... })`
3. **Any exported builder** — any value with `.getName()` and `.buildToolDefinition()`

Here's what a tool file looks like:

```typescript
// src/tools/billing/pay.ts
import { f } from '../../fusion';
import { z } from 'zod';

export default f.tool({
  name: 'billing.pay',
  description: 'Process a payment for an invoice',
  input: z.object({ invoice_id: z.string(), amount: z.number() }),
  handler: async ({ input, ctx }) => {
    return await ctx.billing.charge(input.invoice_id, input.amount);
  },
});
```

::: tip HMR Dev Server
Pair `autoDiscover()` with `createDevServer()` for hot-reload during development — edit a tool file and the LLM client picks up the change without restarting the server. See the [DX Guide](/dx-guide#hmr-dev-server-createdevserver).
:::

---

## Discriminators {#discriminators}

When a tool has multiple actions (e.g., `list`, `create`, `delete`), the framework compiles them behind a single MCP endpoint with an `enum` discriminator field. This is what the agent sees:

```jsonc
{
  "properties": {
    "action": { "type": "string", "enum": ["list", "create", "delete"] },
    "workspace_id": { "type": "string" },
    "name": { "type": "string" }
  }
}
```

The `action` field forces the agent to select an explicit path. Instead of guessing between `projects_list` and `projects_create`, the agent picks a value from a constrained enum — reducing routing ambiguity.

By default, MCP Fusion uses `action` as the discriminator key. This happens automatically when you use `defineTool()` or `createTool()` with multiple actions. With `f.tool()`, each tool is already a single action, so discriminators only apply when you use [grouped exposition](/tool-exposition).

---

## Shared Schemas {#shared-schemas}

In a SaaS application, most operations need a `workspace_id`. Without shared schemas, you repeat the same field in every tool's input:

```typescript
// Without shared schemas — workspace_id repeated in every tool
const listProjects = f.tool({
  name: 'projects.list',
  input: z.object({ workspace_id: z.string() }),
  handler: async ({ input }) => { /* ... */ },
});
const createProject = f.tool({
  name: 'projects.create',
  input: z.object({ workspace_id: z.string(), name: z.string() }),
  handler: async ({ input }) => { /* ... */ },
});
```

With `defineTool()`, the `shared` field injects common parameters into every action:

```typescript
const projects = defineTool<AppContext>('projects', {
  description: 'Manage workspace projects',
  shared: { workspace_id: 'string' },
  actions: {
    list: {
      readOnly: true,
      handler: async (ctx, args) => {
        // args.workspace_id is available — injected by shared
        return success(await ctx.db.projects.findMany({ workspaceId: args.workspace_id }));
      },
    },
    create: {
      params: { name: 'string' },
      handler: async (ctx, args) => {
        // args.workspace_id + args.name — both typed
        return success(await ctx.db.projects.create({
          workspaceId: args.workspace_id,
          name: args.name,
        }));
      },
    },
  },
});
```

The `workspace_id` field appears once in the compiled schema, not once per action. The agent sends it once per call, and every handler receives it. With `createTool()`, the equivalent is `.commonSchema()`:

```typescript
const projects = createTool<void>('projects')
  .commonSchema(z.object({
    workspaceId: z.string().describe('The active SaaS workspace ID'),
  }))
  .action({ name: 'list', readOnly: true, handler: listProjects })
  .action({
    name: 'create',
    schema: z.object({ name: z.string() }),
    handler: createProject,
  });
```

---

## Hierarchical Groups {#hierarchical}

When a single domain (e.g., "platform admin") has 30+ actions, flat lists become unwieldy. Groups let you organize actions into namespaces, each with its own description and middleware:

```typescript
const platform = defineTool<AppContext>('platform', {
  description: 'Central API for the Platform',
  shared: { workspace_id: 'string' },
  middleware: [authMiddleware],
  groups: {
    users: {
      description: 'User management',
      middleware: [requireAdmin],
      actions: {
        invite: {
          params: { email: 'string' },
          handler: async (ctx, args) => { /* ... */ },
        },
        ban: {
          destructive: true,
          params: { user_id: 'string' },
          handler: async (ctx, args) => { /* ... */ },
        },
      },
    },
    billing: {
      description: 'Billing operations',
      actions: {
        refund: {
          destructive: true,
          params: { invoice_id: 'string' },
          handler: async (ctx, args) => { /* ... */ },
        },
      },
    },
  },
});
```

The discriminator values become dot-notation paths: `users.invite`, `users.ban`, `billing.refund`. The agent still sees one MCP tool named `platform`, but the actions are namespaced. The `authMiddleware` runs for all actions; `requireAdmin` runs only for `users.*`.

::: warning Exclusive Mode
You cannot mix `.action()` and `.group()` on the same root builder. Once you use `.group()`, all actions must live inside groups — this prevents namespace collisions at the type level.
:::

---

## Tool Exposition {#exposition}

By default, MCP Fusion expands grouped actions into independent flat tools on the MCP wire — `projects.list` becomes `projects_list`, `projects.create` becomes `projects_create`. Each action gets its own schema, annotations, and description.

To keep grouped behavior (one MCP tool, discriminator enum), set `toolExposition: 'grouped'` in `attachToServer()`:

```typescript
registry.attachToServer(server, { toolExposition: 'grouped' });
```

The choice between flat and grouped affects how many tools the agent sees and how much schema information each carries. For the full comparison, decision guide, and wire-format examples, see the [Tool Exposition Guide](/tool-exposition).

---

## Where to Go Next {#next-steps}

- [Tool Exposition](/tool-exposition) — flat vs. grouped wire format, token trade-offs, O(1) dispatch
- [Building Tools](/building-tools) — `f.tool()`, `defineTool()`, `createTool()`, `createGroup()` in detail
- [DX Guide](/dx-guide) — `autoDiscover()` options, `createDevServer()` HMR, JSON descriptors
