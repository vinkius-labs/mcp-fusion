# Hierarchical Groups

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Flat Prefix Routing (`f.router`)](#flat-prefix-routing)
- [Grouped Endpoint Builder (`createTool`)](#grouped-endpoint-builder)
- [Shared Middleware](#shared-middleware)
- [Action Naming](#naming)

## Introduction {#introduction}

For small APIs, individual `f.query()` and `f.mutation()` definitions work perfectly. But when your domain grows to 50+ actions across multiple entities, you need **hierarchical groups** — a way to organize actions under a domain tree with shared middleware, shared descriptions, and automatic namespace prefixing.

MCP Fusion provides two modern patterns depending on your exposition strategy: **Prefix Routing** (for flat exposition) and **Grouped Builders** (for single-endpoint exposition).

## Flat Prefix Routing (`f.router`) {#flat-prefix-routing}

The most common approach for large APIs is to keep tools "flat" (one MCP endpoint per action) but group them logically during definition to avoid repetitive typing and share middleware.

The `FluentRouter` acts as a shared prefix context:

```typescript
import { f } from '../fusion';

const users = f.router('users')
  .describe('User management');

// Tool name: "users.list"
export const listUsers = users.query('list')
  .handle(async (input, ctx) => ctx.db.users.findMany());

// Tool name: "users.create"
export const createUser = users.mutation('create')
  .withString('name', 'User name')
  .handle(async (input, ctx) => ctx.db.users.create({ data: input }));
```

### Deep Namespaces

Instead of infinitely nested closures (which create massive, unreadable files), the modern pattern is to instantiate routers for specific deep namespaces. This encourages splitting domains into multiple files:

```typescript
// src/tools/platform/admin/index.ts
import { f } from '../../../fusion';

// Deep namespace router
const admin = f.router('platform.users.admin')
  .describe('Admin-only user operations')
  .use(requireAdminContext);

// Tool name: "platform.users.admin.reset"
export const resetUser = admin.mutation('reset')
  .withString('userId', 'User ID')
  .handle(async (input, ctx) => ctx.db.users.resetPassword(input.userId));
```

## Grouped Endpoint Builder (`createTool`) {#grouped-endpoint-builder}

If your agent struggles with too many individual flat tools, you can group related actions behind a single MCP endpoint using `createTool()`. The framework will expose this as one tool and use an `action` enum to dispatch the call.

```typescript
import { createTool, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const platformTool = createTool<AppContext>('platform')
  .description('Platform administration')
  .group('users', 'User management', (g) => g
      .query('list', async (ctx) => success(await ctx.db.users.findMany()))
      
      // Inline `.action()` requires explicit readOnly or destructive flags
      .action({
        name: 'delete',
        destructive: true,
        schema: z.object({ id: z.string() }),
        handler: async (ctx, args) => {
          await ctx.db.users.delete({ where: { id: args.id } });
          return success({ deleted: args.id });
        },
      })
  )
  .group('billing', 'Billing operations', (g) => g
      .query('invoices', async (ctx) => success(await ctx.db.invoices.findMany()))
  );
```

This exposes exactly **one** MCP tool named `platform`. The inputs will require a `group` and `action` composite discriminator:
- `{ group: "users", action: "list" }`
- `{ group: "users", action: "delete", id: "123" }`

## Shared Middleware {#shared-middleware}

Apply middleware at the router or group level — it automatically applies to all actions within that group without duplication:

### With `f.router`:
```typescript
const adminTools = f.router('admin')
  .describe('Administration panel')
  .use(async ({ ctx, next }) => {
    // This runs for EVERY action in this router
    const user = await verifyJwt(ctx.token);
    if (user.role !== 'admin') throw new Error('Admin access required');
    return next({ ...ctx, user });
  });

export const getStats = adminTools.query('stats')
  .handle(async (input, ctx) => ctx.db.stats.getSummary()); // ctx.user is available
```

### With `createTool`:
```typescript
const admin = createTool<AppContext>('admin')
  .group('system', 'System controls', (g) => g
    .use(requireAdmin) // Middleware scoped only to the "system" group
    .mutation('purge_cache', async (ctx) => {
      await ctx.cache.flushAll();
      return success({ purged: true });
    })
  );
```

## Action Naming {#naming}

Tool names are built automatically based on your strategy:

| Strategy | Definition | Resulting MCP Tool Name | Discriminators |
|---|---|---|---|
| **Prefix Routing** | `f.router('users').query('list')` | `users.list` | None (Flat tool) |
| **Prefix Routing** | `f.router('a.b').query('c')` | `a.b.c` | None (Flat tool) |
| **Group Builder** | `createTool('admin').group('users').query('list')` | `admin` | `group="users"`, `action="list"` |

> [!TIP]
> The separator used for flat prefixes (`.`) is configured via the `actionSeparator` property in `attachToServer()`.