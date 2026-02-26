# State & Context

Every tool handler needs access to external state — database clients, authenticated users, tenant info, loggers. MCP Fusion handles this via typed context injection: define your context type once and it flows through every tool, middleware, and Presenter.

---

## Define Your Context {#define}

::: code-group
```typescript [initFusion — Recommended ✨]
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface AppContext {
  userId: string;
  db: PrismaClient;
}

const f = initFusion<AppContext>();

const tasks = f.tool({
  name: 'tasks.list',
  input: z.object({}),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    // ctx is typed as AppContext — no generic annotations needed
    return ctx.db.tasks.findMany({ where: { ownerId: ctx.userId } });
  },
});
```
```typescript [defineTool]
import { defineTool, success } from '@vinkius-core/mcp-fusion';

interface AppContext {
  userId: string;
  db: PrismaClient;
}

const tasks = defineTool<AppContext>('tasks', {
  actions: {
    list: {
      readOnly: true,
      handler: async (ctx, args) => {
        return success(await ctx.db.tasks.findMany({ where: { ownerId: ctx.userId } }));
      },
    },
  },
});
```
:::

::: tip Why `initFusion`?
With `initFusion<AppContext>()`, you define the context type **once**. Every `f.tool()`, `f.middleware()`, `f.prompt()`, and `f.presenter()` inherits it — zero generic annotations, zero type drift across files.
:::

---

## Supply the Context Factory {#factory}

When you attach your `ToolRegistry` to the MCP server, you provide a `contextFactory` callback. This function runs **on every tool invocation**, so the context is always fresh:

```typescript
const registry = f.registry();
registry.register(tasks);

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    userId: extra.session?.userId ?? 'anonymous',
    db: getDatabaseInstance(),
  }),
});
```

The `extra` parameter is the native MCP `RequestHandlerExtra` from the SDK. It contains transport-level metadata:

| Property | Type | Description |
|---|---|---|
| `extra.session` | `object \| undefined` | Session data from SSE/WebSocket transports |
| `extra.signal` | `AbortSignal` | Cancellation signal for the request |

Because `contextFactory` is async and runs per-request, it's safe to resolve dynamically renewing values — refreshed OAuth tokens, database connection pools, per-tenant config lookups.

---

## Multi-Tenant Context {#multi-tenant}

For multi-tenant applications, resolve the tenant in the context factory. Every handler downstream receives isolated tenant state:

```typescript
registry.attachToServer(server, {
  contextFactory: async (extra) => {
    const token = extra.session?.authToken;
    const claims = await verifyJwt(token);
    const tenant = await loadTenant(claims.tenantId);

    return {
      userId: claims.sub,
      tenantId: claims.tenantId,
      db: getTenantDatabase(tenant.databaseUrl),
      permissions: claims.permissions,
    };
  },
});
```

Handlers never see cross-tenant data — the `db` instance is scoped to the resolved tenant.

---

## Middleware Context Derivation {#middleware}

Middleware can derive additional context properties. The returned object is merged into `ctx` for all downstream handlers:

```typescript
const requireAuth = f.middleware(async (ctx) => {
  if (!ctx.userId || ctx.userId === 'anonymous') {
    throw new Error('Authentication required');
  }
  const user = await ctx.db.users.findUnique({ where: { id: ctx.userId } });
  return { role: user.role, email: user.email };
});
```

After this middleware runs, handlers receive `ctx.role` and `ctx.email` in addition to the base `AppContext` properties. See [Middleware](/middleware) for composition patterns.

---

## Next Steps {#next-steps}

- [Middleware](/middleware) — Context derivation, RBAC, composition
- [Building Tools](/building-tools) — `f.tool()`, `defineTool()`, `createTool()`
- [Enterprise Quickstart](/enterprise-quickstart) — Full multi-tenant example with JWT auth
