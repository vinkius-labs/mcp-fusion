# Namespaces & Routing

MCP Fusion separates how you author tools from how the agent discovers them. You organize tools as files in a directory tree; the framework maps that tree into MCP tool definitions with clear naming, discriminators, and shared schemas.

## File-Based Routing {#auto-discover}

`autoDiscover()` scans a directory and registers all exported tools:

```typescript
import { initFusion, autoDiscover } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();
const registry = f.registry();

await autoDiscover(registry, './src/tools');
```

Your file structure becomes the routing table:

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

Add a file — it's registered on the next start. Delete a file — it's gone. Each tool file exports a builder. `autoDiscover()` checks for a default export first, then a named `tool` export, then any value with `.getName()` and `.buildToolDefinition()`:

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

Pair `autoDiscover()` with `createDevServer()` for hot-reload during development. See the [DX Guide](/dx-guide#hmr-dev-server-createdevserver).

## Discriminators {#discriminators}

When a tool has multiple actions, the framework compiles them behind a single MCP endpoint with an `enum` discriminator:

```jsonc
{
  "properties": {
    "action": { "type": "string", "enum": ["list", "create", "delete"] },
    "workspace_id": { "type": "string" },
    "name": { "type": "string" }
  }
}
```

The `action` field forces the agent to select a value from a constrained enum instead of guessing between semantically similar tool names. The default key is `action`; override it with `.discriminator('operation')`.

## Shared Schemas {#shared-schemas}

With `defineTool()`, the `shared` field injects common parameters into every action:

```typescript
const projects = defineTool<AppContext>('projects', {
  description: 'Manage workspace projects',
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
        return success(await ctx.db.projects.create({
          workspaceId: args.workspace_id,
          name: args.name,
        }));
      },
    },
  },
});
```

`workspace_id` appears once in the compiled schema, not once per action. With `createTool()`, the equivalent is `.commonSchema()`:

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

## Hierarchical Groups {#hierarchical}

Groups organize actions into namespaces, each with its own description and middleware:

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

Discriminator values become dot-notation paths: `users.invite`, `users.ban`, `billing.refund`. You cannot mix `.action()` and `.group()` on the same root builder — once you use `.group()`, all actions must live inside groups.

## Tool Exposition {#exposition}

By default, grouped actions expand into independent flat tools on the wire: `projects.list` → `projects_list`. To keep grouped behavior (one MCP tool with a discriminator enum):

```typescript
registry.attachToServer(server, { toolExposition: 'grouped' });
```

See the [Tool Exposition Guide](/tool-exposition) for the full comparison and decision guide.
