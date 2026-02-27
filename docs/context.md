# State & Context

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Defining Context](#define)
- [The Context Factory](#factory)
- [Multi-Tenant Context](#multi-tenant)
- [Middleware Derivation](#middleware)
- [Context in Presenters](#presenters)

## Introduction {#introduction}

Every tool handler in MCP Fusion receives two arguments: `input` (the validated parameters from the LLM) and `ctx` (the application context). The context carries shared state — database connections, tenant IDs, user sessions, permissions — that every handler needs without manual wiring.

Define it once. Use it everywhere. Fully typed, zero annotations.

## Defining Context {#define}

Pass a generic to `initFusion()` and every tool, middleware, and Presenter inherits the type:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  userId: string;
  db: PrismaClient;
}

const f = initFusion<AppContext>();
```

Handlers receive `ctx` fully typed — no annotations, no casting:

```typescript
const tasks = f.query('tasks.list')
  .describe('List tasks for the current user')
  .handle(async (input, ctx) => {
    // ctx.db and ctx.userId are fully typed
    return ctx.db.tasks.findMany({ where: { ownerId: ctx.userId } });
  });
```

> [!TIP]
> Define `f` in a shared file (e.g. `src/fusion.ts`) and import it across your tool files. The generic parameter flows through every builder — zero annotations needed downstream.

## The Context Factory {#factory}

The `contextFactory` runs on every tool invocation. Attach it when connecting the registry to the server:

```typescript
registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    userId: extra.session?.userId ?? 'anonymous',
    db: getDatabaseInstance(),
  }),
});
```

`extra` is the MCP SDK's `RequestHandlerExtra` — it carries `session` (from SSE/WebSocket transports) and `signal` (the cancellation `AbortSignal`).

Because the factory is async and runs per-request, you can resolve dynamically renewing values: refreshed OAuth tokens, connection pools, per-tenant config.

> [!NOTE]
> Pass `extra.signal` through to your database queries and HTTP calls for cooperative cancellation. See [Cancellation](/cancellation) for details.

## Multi-Tenant Context {#multi-tenant}

Resolve the tenant in the factory. Every handler downstream receives isolated state:

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

## Middleware Derivation {#middleware}

Middleware can add properties to `ctx`. The returned object merges into context for all downstream handlers:

```typescript
const requireAuth = f.middleware(async (ctx) => {
  if (!ctx.userId || ctx.userId === 'anonymous') {
    throw new Error('Authentication required');
  }
  const user = await ctx.db.users.findUnique({ where: { id: ctx.userId } });
  return { role: user.role, email: user.email };
});
```

After this middleware runs, handlers see `ctx.role` and `ctx.email` alongside the base `AppContext` properties. See [Middleware](/middleware) for composition patterns and `defineMiddleware()`.

## Context in Presenters {#presenters}

Context flows through to Presenter callbacks — `.rules()`, `.suggest()`, and `.ui()` all receive `ctx` as their second argument:

```typescript
import { createPresenter, t, suggest } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('CENTS — divide by 100'),
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .rules((invoice, ctx) => [
    'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Mask exact totals for non-admin users.'
      : null,
  ])
  .suggest((invoice, ctx) => {
    const hints = [];
    if (invoice.status === 'pending') {
      hints.push(suggest('billing.pay', 'Process payment'));
    }
    // Only admins see the void action
    if (ctx?.user?.role === 'admin') {
      hints.push(suggest('billing.void', 'Void this invoice'));
    }
    return hints;
  });
```

> [!TIP]
> Context-aware Presenters are powerful for RBAC — different roles see different rules, different suggested actions, and different UI blocks. The same Presenter adapts its output based on who is viewing the data.