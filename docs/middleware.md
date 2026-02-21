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
- **`args`** — the perfectly validated arguments (post Zod parsing and `.strip()`)
- **`next()`** — calls the downstream middleware or the final execution handler. If you don't call `next()`, the handler is never executed.

---

## The Three Middleware Scopes

### 1. Global Middleware

Attaching via `.use()` directly on the root builder runs the middleware for **every** connected action in the entire tool. This is the outermost execution layer.

```typescript
const tool = createTool<AppContext>('platform')
    .use(loggingMiddleware)     // Runs first (outermost)
    .use(authMiddleware)        // Runs second
    .group('users', g => { /* ... */ })
    .group('billing', g => { /* ... */ });
```

### 2. Group-Scoped Middleware

By calling `.use()` onto a specific `ActionGroupBuilder`, the middleware strictly isolates to actions within that designated structural group. This lives perfectly between global middleware and your handler.

```typescript
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

### 3. Per-Action Middleware

Because group-scoped middleware applies natively to all actions inside the structural group, the most granular unit in MCP Fusion is the Group. If you strictly need per-action middleware, create a single-action focused group namespace.

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
            success: !result.isError, // Verify if LLM execution passed
            timestamp: new Date(),
        },
    });

    return result;
};
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
