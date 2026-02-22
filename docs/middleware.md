# Middleware

Middleware conceptually intercepts every action call before or after your route handler resolves. MCP Fusion supports three specific middleware scopes, pre-compiles chains entirely at build time, and perfectly composes them deeply right-to-left.

---

## The `MiddlewareFn` Signature

```typescript
type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<ToolResponse>,
) => Promise<ToolResponse>;
```

- **`ctx`** — the strongly-typed per-request context (database connections, auth sessions, etc.)
- **`args`** — the perfectly validated arguments (post Zod parsing and `.strict()`)
- **`next()`** — calls the downstream middleware or the final execution handler. If you don't call `next()`, the handler is never executed.

---

## The Three Middleware Scopes

### 1. Global Middleware

Attaching via `.use()` directly on the root builder runs the middleware for **every** connected action in the entire tool. This is the outermost execution layer.

::: code-group
```typescript [createTool]
const tool = createTool<AppContext>('platform')
    .use(loggingMiddleware)     // Runs first (outermost)
    .use(authMiddleware)        // Runs second
    .group('users', g => { /* ... */ })
    .group('billing', g => { /* ... */ });
```
```typescript [defineTool]
const tool = defineTool<AppContext>('platform', {
    middleware: [loggingMiddleware, authMiddleware],
    actions: { /* ... */ },
    groups: { /* ... */ },
});
```
:::

### 2. Group-Scoped Middleware

By calling `.use()` onto a specific `ActionGroupBuilder`, the middleware strictly isolates to actions within that designated structural group. This lives perfectly between global middleware and your handler.

::: code-group
```typescript [createTool]
const tool = createTool<AppContext>('platform')
    .use(loggingMiddleware)   // Global: runs for ALL actions
    .group('users', g => {
        g.use(requireAdmin)   // Group-scoped: runs ONLY for users.* actions
         .action({ name: 'list', handler: listUsers })
         .action({ name: 'ban', destructive: true, handler: banUser });
    })
    .group('billing', g => {
        g.use(requireBilling) // Group-scoped: runs ONLY for billing.* actions
         .action({ name: 'invoices', handler: listInvoices });
    });
```
```typescript [defineTool]
const tool = defineTool<AppContext>('platform', {
    middleware: [loggingMiddleware],
    groups: {
        users: {
            middleware: [requireAdmin],
            actions: {
                list: { handler: listUsers },
                ban: { destructive: true, handler: banUser },
            },
        },
        billing: {
            middleware: [requireBilling],
            actions: {
                invoices: { handler: listInvoices },
            },
        },
    },
});
```
:::

### 3. Per-Action Middleware

Because group-scoped middleware applies natively to all actions inside the structural group, the most granular unit in MCP Fusion is the Group. If you strictly need per-action middleware, create a single-action focused group namespace.

---

## Context Derivation — `defineMiddleware()`

For middleware that derives data and injects it into the context (like tRPC's `.use`), use `defineMiddleware()`:

```typescript
import { defineMiddleware } from '@vinkius-core/mcp-fusion';

const requireAuth = defineMiddleware(async (ctx: { token: string }) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user, permissions: user.permissions };
    // ↑ TypeScript infers these fields are added to ctx
});

const addTenant = defineMiddleware(async (ctx: { orgId: string }) => {
    const tenant = await db.getTenant(ctx.orgId);
    return { tenant };
});
```

### Using Derived Middleware

Convert to a `MiddlewareFn` with `.toMiddlewareFn()`:

```typescript
const tool = createTool<AppContext>('billing')
    .use(requireAuth.toMiddlewareFn())
    .use(addTenant.toMiddlewareFn())
    .action({
        name: 'refund',
        handler: async (ctx, args) => {
            // ctx.user and ctx.tenant are now available
            return success(`Refunded by ${ctx.user.id} for ${ctx.tenant.name}`);
        },
    });
```

Or in `defineTool()`:

```typescript
const tool = defineTool<AppContext>('billing', {
    middleware: [requireAuth.toMiddlewareFn(), addTenant.toMiddlewareFn()],
    actions: {
        refund: {
            handler: async (ctx, args) => success(`Refunded by ${ctx.user.id}`),
        },
    },
});
```

### How It Works

1. **`defineMiddleware(fn)` returns a `MiddlewareDefinition`** — a branded object with a `derive` function and a `toMiddlewareFn()` converter.
2. **The derive function** receives the current context, performs async work, and returns new properties.
3. **The returned properties are merged** into the context before `next()` is called.
4. **If derive throws**, the request short-circuits — `next()` is never called.

### Type Safety

`isMiddlewareDefinition()` and `resolveMiddleware()` are available for programmatic inspection:

```typescript
import { isMiddlewareDefinition, resolveMiddleware } from '@vinkius-core/mcp-fusion';

// Check if a value is a MiddlewareDefinition
isMiddlewareDefinition(requireAuth); // true
isMiddlewareDefinition(regularFn);   // false

// Resolve either type to a MiddlewareFn
const fn = resolveMiddleware(requireAuth); // Works with both
```

---

## Execution Constraints

The framework pre-compiles the chain deterministically.

```text
Global MW 1 → Global MW 2 → Group MW 1 → Group MW 2 → Handler
(outermost)                                              (innermost)
```

::: info Why Pre-Compilation Matters
Traditional Javascript middleware engines (like Express.js or Koa) compose execution arrays at request time—iterating arrays, constructing closures dynamically, and invoking sequentially on every single incoming ping.

**MCP Fusion compiles completely at build time.**

```typescript
// What the compiler builds internally:
const chain = (ctx, args) =>
    loggingMiddleware(ctx, args, () =>
        requireAdmin(ctx, args, () =>
            banUser(ctx, args)
        )
    );
```
At runtime, the `.execute()` command runs one single exact `Map.get()`. There is zero iteration overhead and zero runtime array allocation. Your middleware chain runs exactly as fast as bare-metal nested functions.
:::

---

## Real-World Patterns

### Authentication Blocks
A foundational check to verify active session capabilities on LLM connections.

```typescript
const authMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    if (!ctx.session?.userId) {
        return error('Authentication required. Missing token.');
    }
    return next();
};
```

### Role-Based Access Control (RBAC)
Restrict entire namespaces natively without copying checks into 40 distinct route handlers.

```typescript
function requireRole(...roles: string[]): MiddlewareFn<AppContext> {
    return async (ctx, args, next) => {
        if (!roles.includes(ctx.role)) {
            return error(`Forbidden: requires one of [${roles.join(', ')}]`);
        }
        return next();
    };
}

// Usage
builder.group('admin', g => {
    g.use(requireRole('admin', 'super_admin'))
     .action({ name: 'reset', destructive: true, handler: resetHandler });
});
```

### Automatic Audit Logging
Because middleware sits firmly around the `next()` lifecycle, you can inject audit logs completely invisibly.

```typescript
const auditLog: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    const result = await next();

    await ctx.db.auditLogs.create({
        data: {
            userId: ctx.session.userId,
            action: args.action as string,
            args: JSON.stringify(args),
            success: !result.isError,
            timestamp: new Date(),
        },
    });

    return result;
};
```

### Context Derivation with `defineMiddleware`
The cleanest pattern for injecting derived state:

```typescript
const withDatabase = defineMiddleware(async (ctx: { connectionString: string }) => {
    const db = await connectToDatabase(ctx.connectionString);
    return { db };
});

const withCurrentUser = defineMiddleware(async (ctx: { token: string }) => {
    const user = await verifyToken(ctx.token);
    if (!user) throw new Error('Invalid token');
    return { user, isAdmin: user.role === 'admin' };
});

const tool = createTool<AppContext>('platform')
    .use(withDatabase.toMiddlewareFn())
    .use(withCurrentUser.toMiddlewareFn())
    .action({
        name: 'dashboard',
        handler: async (ctx) => {
            // ctx.db, ctx.user, ctx.isAdmin — all available, all typed
            const data = await ctx.db.getDashboard(ctx.user.id);
            return success(data);
        },
    });
```

---

## Composing Dense APIs

A realistic production MCP module leveraging Fusion routing might combine all these patterns into deeply constrained LLM tooling surfaces:

```typescript
const platform = createTool<AppContext>('platform')
    .description('Platform API')
    .use(metrics)            
    .use(authMiddleware)     
    .use(auditLog)           
    .group('users', g => {
        g.use(requireRole('admin'))  
         .action({ name: 'create', schema: createUserSchema, handler: createUser })
         .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
    })
    .group('projects', g => {
        g.use(rateLimit(30, 60_000)) 
         .action({ name: 'list', readOnly: true, handler: listProjects })
         .action({ name: 'create', schema: createProjectSchema, handler: createProject });
    });
```
