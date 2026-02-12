# Middleware

Middleware intercepts every action call — before or after the handler. The framework supports three scopes, pre-compiles chains at build time, and composes them right-to-left.

---

## The `MiddlewareFn` Signature

```typescript
type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<ToolResponse>,
) => Promise<ToolResponse>;
```

- `ctx` — the per-request context (database, session, user, etc.)
- `args` — the validated arguments (after Zod parsing and stripping)
- `next()` — calls the next middleware or the handler. If you don't call `next()`, the handler is never executed.

---

## Three Middleware Scopes

### Global Middleware — `.use()` on the builder

Runs for EVERY action in the tool. This is the outermost layer.

```typescript
const tool = new GroupedToolBuilder<AppContext>('platform')
    .use(loggingMiddleware)     // Runs first (outermost)
    .use(authMiddleware)        // Runs second
    .group('users', g => { ... })
    .group('billing', g => { ... });
```

### Group-Scoped Middleware — `.use()` on the ActionGroupBuilder

Runs only for actions within that group. This is between global middleware and the handler.

```typescript
const tool = new GroupedToolBuilder<AppContext>('platform')
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

### Per-Action Middleware (via Group Scope)

Since group-scoped middleware applies to all actions in the group, the most granular unit is the group. If you need per-action middleware, create a single-action group.

---

## Execution Order

The pre-compiled chain executes in this order:

```
Global MW 1 → Global MW 2 → Group MW 1 → Group MW 2 → Handler
(outermost)                                              (innermost)
```

Let's trace a real call with `loggingMiddleware` (global) and `requireAdmin` (group-scoped):

```typescript
const loggingMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] Call: ${args.action}`);
    const result = await next();
    console.log(`[${new Date().toISOString()}] Done: ${args.action} (${Date.now() - start}ms)`);
    return result;
};

const requireAdmin: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    if (ctx.role !== 'admin') {
        return error('Forbidden: admin role required');
    }
    return next();
};
```

When the LLM calls `users.ban`:

```
1. loggingMiddleware starts → logs "[...] Call: users.ban"
2.   requireAdmin checks ctx.role
3.     If admin → calls next() → banUser handler executes
4.     If not admin → returns error('Forbidden') — handler never runs
5. loggingMiddleware logs "[...] Done: users.ban (42ms)"
```

When the LLM calls `billing.invoices`:

```
1. loggingMiddleware starts → logs "[...] Call: billing.invoices"
2.   requireBilling (not requireAdmin — different group)
3.     listInvoices handler executes
4. loggingMiddleware logs "[...] Done: billing.invoices (15ms)"
```

---

## Pre-Compilation — Why It Matters

Traditional middleware systems (Express, Koa) compose chains at request time: iterate the middleware array, create closures, call them in sequence. For every request.

This framework compiles chains at build time. The `MiddlewareCompiler` processes each action once:

```typescript
// What the compiler produces (conceptual):
const chain = (ctx, args) =>
    loggingMiddleware(ctx, args, () =>
        requireAdmin(ctx, args, () =>
            banUser(ctx, args)
        )
    );

compiled.set('users.ban', chain);
```

At runtime, `execute()` does:

```typescript
const chain = this._compiledChain.get(action.key);
return await chain(ctx, args);
```

One `Map.get()`. No iteration. No runtime closure allocation. The pre-compiled chain is exactly as fast as hand-written nested function calls.

---

## Real-World Middleware Patterns

### Authentication

```typescript
const authMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    if (!ctx.session?.userId) {
        return error('Authentication required. Please provide valid credentials.');
    }
    return next();
};
```

### Role-Based Access Control

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

### Rate Limiting

```typescript
const callCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxCalls: number, windowMs: number): MiddlewareFn<AppContext> {
    return async (ctx, args, next) => {
        const key = `${ctx.session.userId}:${args.action}`;
        const now = Date.now();
        let entry = callCounts.get(key);

        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            callCounts.set(key, entry);
        }

        entry.count++;
        if (entry.count > maxCalls) {
            return error(`Rate limit exceeded. Max ${maxCalls} calls per ${windowMs / 1000}s.`);
        }

        return next();
    };
}

// Usage: 10 calls per minute per user per action
builder.use(rateLimit(10, 60_000));
```

### Audit Logging

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

### Input Sanitization

```typescript
const sanitizeStrings: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    const sanitized = { ...args };
    for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string') {
            sanitized[key] = value.trim();
        }
    }
    return next();
};
```

### Timing and Metrics

```typescript
const metrics: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    const start = performance.now();
    const result = await next();
    const duration = performance.now() - start;

    ctx.metrics.recordToolCall({
        tool: 'platform',
        action: args.action as string,
        durationMs: duration,
        success: !result.isError,
    });

    return result;
};
```

---

## Combining Middleware

A realistic production setup:

```typescript
const platform = new GroupedToolBuilder<AppContext>('platform')
    .description('Platform API')
    .use(metrics)            // Timing (outermost — captures total time)
    .use(authMiddleware)     // Authentication
    .use(auditLog)           // Audit logging (after auth, before business logic)
    .group('users', g => {
        g.use(requireRole('admin'))  // Only admins can manage users
         .action({ name: 'list', readOnly: true, handler: listUsers })
         .action({ name: 'create', schema: createUserSchema, handler: createUser })
         .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
    })
    .group('projects', g => {
        g.use(rateLimit(30, 60_000)) // Rate limit project operations
         .action({ name: 'list', readOnly: true, handler: listProjects })
         .action({ name: 'create', schema: createProjectSchema, handler: createProject });
    });
```

Pre-compiled chain for `users.ban`:

```
metrics → authMiddleware → auditLog → requireRole('admin') → banUser
```

Pre-compiled chain for `projects.list`:

```
metrics → authMiddleware → auditLog → rateLimit(30, 60000) → listProjects
```

Different security policies per namespace, all pre-compiled, zero runtime overhead.
