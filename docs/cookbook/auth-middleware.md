# Authentication Middleware

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Defining Middleware](#defining)
- [Applying Middleware with .use()](#applying)
- [Stacking Middleware](#stacking)
- [Multi-Tenant Isolation](#multi-tenant)
- [The Context Factory](#context-factory)

## Introduction {#introduction}

Every production MCP server needs authentication. Without it, anyone with transport access can invoke destructive tools, read sensitive data, or impersonate other tenants. MCP Fusion's middleware system lets you protect tools with a single `.use()` call — no copy-pasting auth checks into every handler.

Middleware in MCP Fusion follows the **onion model**: each layer wraps the next, and the returned object gets merged into `ctx` for downstream layers and handlers. Define it once, apply it everywhere.

## Defining Middleware {#defining}

Use `f.middleware()` to create a reusable middleware function. It receives the current `ctx` and returns an object to merge into context:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  token: string;
  db: DatabaseClient;
}

const f = initFusion<AppContext>();

const withAuth = f.middleware(async (ctx) => {
  const user = await verifyJwtToken(ctx.token);
  if (!user) throw new Error('Authentication required');
  return { user };  // ← merged into ctx
});
```

After `withAuth` runs, every downstream handler sees `ctx.user` with full type inference. If the token is invalid, the middleware throws and the handler never executes — the AI receives a structured error.

## Applying Middleware with .use() {#applying}

Apply middleware to any tool with `.use()`. It participates in the fluent chain like any other method:

```typescript
export const listUsers = f.query('users.list')
  .describe('List all users in the organization')
  .use(withAuth)
  .handle(async (input, ctx) => {
    // ctx.user is available here — typed, validated, guaranteed
    return ctx.db.users.findMany({
      where: { orgId: ctx.user.orgId },
    });
  });
```

> [!NOTE]
> `.use()` can appear anywhere in the chain before `.handle()`. The convention is to place it after `.describe()` and before parameter declarations, but the order between `.use()`, `.withString()`, etc. doesn't affect behavior.

## Stacking Middleware {#stacking}

Chain multiple `.use()` calls to compose authorization layers. They execute in order — each one enriches `ctx` for the next:

```typescript
// Layer 1: Verify the JWT token and add user to context
const withAuth = f.middleware(async (ctx) => {
  const user = await verifyJwtToken(ctx.token);
  if (!user) throw new Error('Authentication required');
  return { user };
});

// Layer 2: Check admin role (depends on withAuth having run first)
const requireAdmin = f.middleware(async (ctx) => {
  const user = (ctx as any).user;
  if (user.role !== 'admin') {
    throw new Error('Forbidden: admin role required');
  }
  return { isAdmin: true };
});

// Apply both — withAuth runs first, then requireAdmin
export const deleteUser = f.mutation('users.delete')
  .describe('Permanently delete a user account')
  .use(withAuth)
  .use(requireAdmin)
  .withString('user_id', 'User ID to delete')
  .handle(async (input, ctx) => {
    await ctx.db.users.delete({ where: { id: input.user_id } });
    return { deleted: true, id: input.user_id };
  });
```

If `withAuth` throws, `requireAdmin` never runs. If `requireAdmin` throws, the handler never runs. Each layer acts as a gate.

## Multi-Tenant Isolation {#multi-tenant}

In SaaS applications, tenant isolation is critical. Use middleware to resolve the tenant from the JWT claims and inject a tenant-scoped database connection:

```typescript
const withTenant = f.middleware(async (ctx) => {
  const claims = await verifyJwt(ctx.token);
  const tenant = await loadTenantConfig(claims.tenantId);

  return {
    tenantId: claims.tenantId,
    tenantDb: getTenantDatabase(tenant.databaseUrl),
    permissions: claims.permissions,
    locale: tenant.locale,
  };
});

export const listOrders = f.query('orders.list')
  .describe('List orders for the current tenant')
  .use(withAuth)
  .use(withTenant)
  .withOptionalEnum('status', ['pending', 'shipped', 'delivered'] as const, 'Order status filter')
  .handle(async (input, ctx) => {
    // ctx.tenantDb is a tenant-scoped database connection
    // Impossible to accidentally query another tenant's data
    return ctx.tenantDb.orders.findMany({
      where: input.status ? { status: input.status } : {},
    });
  });
```

> [!IMPORTANT]
> The middleware creates a **per-request** tenant-scoped connection. Even if the handler code has bugs, it physically cannot query another tenant's database — the isolation is architectural, not behavioral.

## The Context Factory {#context-factory}

The `contextFactory` runs on every tool invocation and builds the initial `AppContext`. This is where you extract the JWT token from the MCP session:

```typescript
const registry = f.registry();
registry.registerAll(listUsers, deleteUser, listOrders);

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    token: extra.session?.authToken ?? '',
    db: getDatabaseInstance(),
  }),
});
```

`extra` is the MCP SDK's `RequestHandlerExtra` — it carries `session` (from HTTP/SSE/WebSocket transports) and `signal` (the cancellation `AbortSignal`). The factory is async and runs per-request, so you can resolve dynamically renewing tokens, rotated credentials, or per-request config.