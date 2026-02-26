# State & Context

## Defining Context {#define}

Pass a generic to `initFusion` and every tool, middleware, and Presenter inherits the type:

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
const tasks = f.tool({
  name: 'tasks.list',
  input: z.object({}),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return ctx.db.tasks.findMany({ where: { ownerId: ctx.userId } });
  },
});
```

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

After this middleware runs, handlers see `ctx.role` and `ctx.email` alongside the base `AppContext` properties. See [Middleware](/middleware) for composition.
