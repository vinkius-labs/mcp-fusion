# Middleware

## The Signature

```typescript
type MiddlewareFn<TContext> = (
  ctx: TContext,
  args: Record<string, unknown>,
  next: () => Promise<unknown>,
) => Promise<unknown>;
```

Call `next()` to continue to the next middleware or handler. Don't call it to block the request. The same signature works for tool and prompt middleware — share them freely.

## Creating Middleware

### f.middleware()

Derive data and inject it into context. Like tRPC's `.use`:

```typescript
const f = initFusion<AppContext>();

const requireAuth = f.middleware(async (ctx) => {
  const user = await db.getUser(ctx.token);
  if (!user) throw new Error('Unauthorized');
  return { user, permissions: user.permissions };
});
```

The returned object merges into `ctx` via `Object.assign`. Downstream handlers see `ctx.user` and `ctx.permissions` — fully typed, no casting.

### Raw MiddlewareFn

For before/after hooks, wrap `next()` directly:

```typescript
const loggingMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  console.log(`[${new Date().toISOString()}] Action called`);
  const result = await next();
  console.log(`[${new Date().toISOString()}] Action completed`);
  return result;
};
```

### defineMiddleware()

Same as `f.middleware()` but standalone — for shared utility packages:

```typescript
import { defineMiddleware } from '@vinkius-core/mcp-fusion';

const addTenant = defineMiddleware(async (ctx: { orgId: string }) => {
  const tenant = await db.getTenant(ctx.orgId);
  return { tenant };
});
```

Both `f.middleware()` and `defineMiddleware()` return a `MiddlewareDefinition`. Call `.toMiddlewareFn()` when passing it to a tool or group.

## Scopes

```text
Global → Group → Per-Action → Handler
```

**Global** — runs for every action in the tool:

```typescript
const tool = createTool<AppContext>('platform')
  .use(loggingMiddleware)
  .use(authMiddleware);
```

**Group-scoped** — runs only for actions in that group:

```typescript
const tool = createTool<AppContext>('platform')
  .use(loggingMiddleware)
  .group('users', g => {
    g.use(requireRole('admin'))
     .action({ name: 'list', handler: listUsers })
     .action({ name: 'ban', destructive: true, handler: banUser });
  })
  .group('billing', g => {
    g.use(requireRole('finance'))
     .action({ name: 'invoices', handler: listInvoices });
  });
```

`users.ban` runs: `loggingMiddleware → requireRole('admin') → banUser`.
`billing.invoices` runs: `loggingMiddleware → requireRole('finance') → listInvoices`.

**Per-action** — via the `middleware` array:

```typescript
const billingGroup = createGroup<AppContext>({
  name: 'billing',
  middleware: [requireAuth.toMiddlewareFn()],
  actions: {
    invoices: {
      description: 'List invoices',
      input: z.object({ year: z.number() }),
      handler: async ({ ctx, input }) => ctx.db.invoices.findMany({ where: { year: input.year } }),
    },
    refund: {
      description: 'Refund an invoice',
      input: z.object({ invoiceId: z.string() }),
      middleware: [requireRole('finance')],
      handler: async ({ ctx, input }) => ctx.db.invoices.refund(input.invoiceId),
    },
  },
});
```

## Pre-Compilation

Chains are compiled at build time into a single nested function:

```typescript
const chain = (ctx, args) =>
  loggingMiddleware(ctx, args, () =>
    requireRole('admin')(ctx, args, () =>
      banUser(ctx, args)
    )
  );
```

At runtime, handler execution is a `Map.get()` lookup + one function call. No iteration, no array allocation per request.

## Patterns

**Authentication guard:**

```typescript
const authMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  if (!ctx.session?.userId) {
    return error('Authentication required. Missing token.');
  }
  return next();
};
```

**Role factory:**

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

**Audit logging** — capture the result after the handler:

```typescript
const auditLog: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  const result = await next();
  await ctx.db.auditLogs.create({
    data: { userId: ctx.session.userId, action: args.action as string, timestamp: new Date() },
  });
  return result;
};
```

**Stacking derivations:**

```typescript
const tool = createTool<AppContext>('platform')
  .use(withDatabase.toMiddlewareFn())
  .use(withCurrentUser.toMiddlewareFn())
  .action({
    name: 'dashboard',
    handler: async (ctx) => {
      // ctx.db, ctx.user, ctx.isAdmin — all typed
      return success(await ctx.db.getDashboard(ctx.user.id));
    },
  });
```

## Utilities

`resolveMiddleware(mw)` accepts either `MiddlewareFn` or `MiddlewareDefinition` and returns a `MiddlewareFn`. Useful for accepting middleware from external packages that might use either form.
