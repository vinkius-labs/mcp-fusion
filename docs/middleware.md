# Middleware

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [f.middleware() — Context Derivation](#f-middleware)
- [defineMiddleware() — Standalone Packages](#define-middleware)
- [Per-Tool .use() — Inline Chain](#per-tool)
- [Raw MiddlewareFn](#raw)
- [Execution Order](#order)
- [Pre-Compilation](#pre-compilation)
- [Common Patterns](#patterns)

## Introduction {#introduction}

Every production application has cross-cutting concerns — authentication, authorization, auditing, rate limiting, tenant resolution. Without middleware, you'd duplicate these checks in every handler. This is especially painful when generating tools from [@vinkius-core/mcp-fusion-openapi-gen](/openapi-gen) or [@vinkius-core/mcp-fusion-prisma-gen](/prisma-gen) — dozens of auto-generated handlers that all need the same auth and audit layer:

```typescript
// ❌ Without middleware — validation repeated in every tool
.handle(async (input, ctx) => {
  const session = await checkAuth(ctx.token);
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Forbidden');
  await ctx.db.auditLogs.create({ data: { userId: session.id, action: 'stats' } });
  // ...finally, the actual logic
})
```

MCP Fusion's middleware system lets you extract these concerns into reusable, composable functions that run before (or after) the handler. The context is enriched at each step — fully typed, no casting. This design allows you to enforce a true **Zero-Trust Architecture for AI Agents**, guaranteeing **Data Exfiltration Prevention** at the edge because the untrusted LLM request is sanitized and authorized before it ever touches your database handlers.

## f.middleware() — Context Derivation {#f-middleware}

The primary pattern. Create a middleware that derives data and injects it into context — like tRPC's `.use()`:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const requireAuth = f.middleware(async (ctx) => {
  const user = await db.getUser(ctx.token);
  if (!user) throw new Error('Unauthorized');
  return { user, permissions: user.permissions };
});
```

The returned object merges into `ctx` via `Object.assign`. Downstream handlers see `ctx.user` and `ctx.permissions` — fully typed, no annotations.

> [!TIP]
> `f.middleware()` returns a `MiddlewareDefinition`. Call `.toMiddlewareFn()` when passing it to a tool or group that expects a raw `MiddlewareFn`.

## defineMiddleware() — Standalone Packages {#define-middleware}

Same as `f.middleware()` but without needing an `initFusion()` instance — for shared utility packages:

```typescript
import { defineMiddleware } from '@vinkius-core/mcp-fusion';

const addTenant = defineMiddleware(async (ctx: { orgId: string }) => {
  const tenant = await db.getTenant(ctx.orgId);
  return { tenant };
});
```

Use `defineMiddleware()` when building reusable middleware libraries that don't know the application's context type.

## Per-Tool .use() — Inline Chain {#per-tool}

Apply middleware to a single tool with `.use()`. The middleware receives `{ ctx, next }` and can enrich the context or halt execution:

```typescript
export const adminStats = f.query('admin.stats')
  .describe('Retrieve administrative system statistics')
  .use(async ({ ctx, next }) => {
    const session = await checkAuth(ctx.token);
    if (!session.isAdmin) throw new Error('Unauthorized');
    return next({ ...ctx, session });
  })
  .handle(async (input, ctx) => {
    // ctx.session is fully typed here
    return ctx.db.getStats(ctx.session.orgId);
  });
```

Stack multiple `.use()` calls for layered derivations:

```typescript
export const sensitiveTool = f.query('admin.sensitive_data')
  .describe('Access restricted data')
  .use(async ({ ctx, next }) => {
    const session = await checkAuth(ctx.token);
    if (!session) throw new Error('Unauthorized');
    return next({ ...ctx, session });
  })
  .use(async ({ ctx, next }) => {
    if (!ctx.session.permissions.includes('read:sensitive')) {
      throw new Error('Insufficient permissions');
    }
    return next({ ...ctx, canReadSensitive: true });
  })
  .handle(async (input, ctx) => {
    // ctx.session AND ctx.canReadSensitive are both typed
    return ctx.db.sensitiveData.findMany();
  });
```

## Raw MiddlewareFn {#raw}

For before/after hooks that need to wrap `next()` directly:

```typescript
import { type MiddlewareFn } from '@vinkius-core/mcp-fusion';

const loggingMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  console.log(`[${new Date().toISOString()}] Action called`);
  const result = await next();
  console.log(`[${new Date().toISOString()}] Action completed`);
  return result;
};
```

The signature:

```typescript
type MiddlewareFn<TContext> = (
  ctx: TContext,
  args: Record<string, unknown>,
  next: () => Promise<unknown>,
) => Promise<unknown>;
```

Call `next()` to continue to the next middleware or handler. Don't call it to block the request. The same signature works for tool and prompt middleware — share them freely.

## Execution Order {#order}

Middleware executes in declaration order, outermost first:

```text
Global → Per-Tool .use() → Handler
```

For tools with multiple `.use()` calls:

```text
.use(authMiddleware) → .use(permissionCheck) → .handle(handler)
```

Each step can:
- **Enrich**: Return `next({ ...ctx, newProp })` to add properties
- **Guard**: Throw or return an error to halt execution
- **Observe**: Call `const result = await next()` to run after the handler

## Pre-Compilation {#pre-compilation}

Middleware chains are compiled at registration time into a single nested function. There's no array iteration, no allocation per request:

```typescript
// What the compiler produces (conceptual):
const chain = (ctx, args) =>
  loggingMiddleware(ctx, args, () =>
    authMiddleware(ctx, args, () =>
      handler(ctx, args)
    )
  );
```

At runtime, handler execution is a `Map.get()` lookup + one function call. O(1) dispatch.

## Common Patterns {#patterns}

### Authentication Guard

```typescript
const authMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  if (!ctx.session?.userId) {
    return error('Authentication required. Missing token.');
  }
  return next();
};
```

### Role Factory

```typescript
function requireRole(...roles: string[]): MiddlewareFn<AppContext> {
  return async (ctx, args, next) => {
    if (!roles.includes(ctx.role)) {
      return error(`Forbidden: requires one of [${roles.join(', ')}]`);
    }
    return next();
  };
}
```

### Audit Logging

Capture the result **after** the handler completes:

```typescript
const auditLog: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  const result = await next();
  await ctx.db.auditLogs.create({
    data: {
      userId: ctx.session.userId,
      action: args.action as string,
      timestamp: new Date(),
    },
  });
  return result;
};
```

### Stacking Derivations

Compose multiple derivation middlewares into a shared base:

```typescript
const withDatabase = f.middleware(async (ctx) => {
  const db = await getDbConnection(ctx.tenantId);
  return { db };
});

const withCurrentUser = f.middleware(async (ctx) => {
  const user = await ctx.db.users.findUnique({ where: { id: ctx.userId } });
  return { user, isAdmin: user?.role === 'admin' };
});

// Apply to tools:
export const dashboard = f.query('admin.dashboard')
  .describe('Get the admin dashboard')
  .use(async ({ ctx, next }) => {
    const dbCtx = await withDatabase.toMiddlewareFn()(ctx, {}, async () => ({}));
    return next({ ...ctx, ...dbCtx });
  })
  .handle(async (input, ctx) => {
    return ctx.db.getDashboard(ctx.user.id);
  });
```

> [!NOTE]
> `resolveMiddleware(mw)` accepts either `MiddlewareFn` or `MiddlewareDefinition` and returns a `MiddlewareFn`. Useful for accepting middleware from external packages that might use either form.
