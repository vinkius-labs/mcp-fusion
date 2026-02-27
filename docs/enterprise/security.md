# Security & Authentication

MCP Fusion enforces security through four pipeline layers — `contextFactory`, middleware, tag filtering, and Presenters — each executing in strict order, where any failure skips all subsequent stages.


## Layer 1: contextFactory — Identity Extraction {#context-factory}

Every MCP request enters through `contextFactory`. It receives the MCP SDK's `extra` object — containing `_meta` (client metadata), `signal` (abort for [cancellation](/cancellation)), and `sendNotification` — and returns the seed context for the pipeline.

### Extraction, Not Validation

The key insight: `contextFactory` _extracts_ raw identity material. It doesn't verify tokens or resolve users — that's middleware's job. This separation keeps the entry point fast and synchronous:

```typescript
contextFactory: (extra: any) => ({
  rawToken: extra?._meta?.token,
  requestId: crypto.randomUUID(),
  requestedAt: new Date(),
}),
```

The seed context is raw material. Middleware will transform `rawToken` into a verified user identity. If `contextFactory` throws, nothing else runs — no middleware, no handler. This is the first circuit breaker.

### Enforcing Mandatory Auth

For servers where every request requires authentication, reject early:

```typescript
contextFactory: (extra: any) => {
  const token = extra?._meta?.token;
  if (!token) throw new Error('Authentication required');
  return { rawToken: token, requestId: crypto.randomUUID() };
},
```

This one-line check prevents the entire pipeline from running without a token. No middleware code even loads. Think of `contextFactory` as the bouncer checking you have a ticket — middleware is the scanner verifying the ticket is valid.

The location of auth tokens in MCP requests is not standardized. `extra._meta.token` is a common convention but not universal. Check your client's documentation. For OAuth-based flows, see the [OAuth guide](/oauth).


## Layer 2: Middleware — Authorization Enforcement {#middleware}

Middleware in MCP Fusion follows tRPC's context derivation model. Your function receives the current context, returns an object, and that object is merged into `ctx` via `Object.assign`. TypeScript infers the resulting type — no manual generics.

### The Three APIs

MCP Fusion provides three ways to define middleware. Each targets a different scope.

#### `f.middleware()` — Application-Scoped

The default choice. Inherits your `AppContext` type and provides full inference:

```typescript
export const authMiddleware = f.middleware(async (ctx) => {
  const token = (ctx as any).rawToken;
  if (!token) throw new Error('Missing authentication token');
  const payload = await verifyJWT(token);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  return { db: prisma, user: { id: user.id, role: user.role, tenantId: user.tenantId } };
});
```

After this runs, every downstream stage receives `ctx.db`, `ctx.user.id`, `ctx.user.role`, and `ctx.user.tenantId` with full type inference. TypeScript knows the shape — access `ctx.user.email` and the compiler complains.

#### `defineMiddleware()` — Shareable Across Projects

For reusable middleware that doesn't depend on a specific app's context type — npm packages, shared infrastructure, cross-team utilities:

```typescript
export const rateLimiter = defineMiddleware(async (ctx: { requestId: string }) => {
  const count = await redis.incr(`rate:${ctx.requestId}`);
  await redis.expire(`rate:${ctx.requestId}`, 60);
  if (count > 100) throw new Error('Rate limit exceeded');
  return { rateLimited: false, remainingRequests: 100 - count };
});
```

The middleware declares its own input type (`{ requestId: string }`) and output. It doesn't know about `AppContext`, `PrismaClient`, or your user model. Any application providing `requestId` in context can use it.

#### `MiddlewareFn` — Low-Level Pipeline Access

For cross-cutting concerns that need to _wrap_ the downstream pipeline — timing, error catching, retries. The `next()` function invokes everything downstream:

```typescript
const timing: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  const start = Date.now();
  try {
    const result = await next();
    console.log(`[OK] ${ctx.user.id} → ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`[ERR] ${ctx.user.id} → ${Date.now() - start}ms`);
    throw error;
  }
};
```

Code _after_ `await next()` runs _after_ the handler completes. This is the only API that gives you post-execution access — ideal for timing, logging, and circuit breakers.

**When to use which?** `f.middleware()` for 90% of cases (auth, tenant). `defineMiddleware()` for npm packages. `MiddlewareFn` when you need `next()`.

### The Pipeline Guarantee {#pipeline-guarantee}

Stages execute in strict sequence. If any throws, everything after it is skipped — the function is never called, not silently caught:

```text
contextFactory → middleware[0] → middleware[1] → ... → handler
```

This is what makes the security model trustworthy: authentication isn't something you remember to check. It's something the pipeline enforces _before_ the handler exists in the call stack.

### Composition {#middleware-composition}

Middleware arrays execute in order. Each return is merged into `ctx` before the next runs:

```typescript
const enterpriseStack = [rateLimiter, authMiddleware, tenantResolver];
```

Three stages, each building on the previous. The handler receives the accumulated context from all three. Add a middleware to the array — it runs at that position. Remove it — it doesn't. The handler's `ctx` type updates automatically.

Order matters. If `tenantResolver` reads `ctx.user.tenantId`, it must appear _after_ `authMiddleware`. Place it before and `ctx.user` won't exist yet.


## Layer 3: Tag-Based Access Control {#tag-filtering}

In a raw MCP server, every registered tool appears in `tools/list`. If you register `admin.purge`, every agent sees it — even agents that should never know destructive operations exist. Tags solve this at the registry level.

### Declaring Tags

Tags are string arrays on the tool definition. They carry no inherent semantics — the framework doesn't interpret `'admin'` as special:

```typescript
const adminTool = f.mutation('admin.purge')
  .describe('Purge system data')
  .tags('admin', 'destructive')
  .use(authMiddleware)
  .handle(async (input, ctx) => { /* ... */ });
```

### Filtering at Attachment

The semantics come from how you filter at `attachToServer()`. Three filter modes cover every access pattern:

```typescript
// Public API — expose ONLY read tools
attachToServer(publicServer, registry, {
  filter: { tags: ['read'] },          // AND: must have ALL listed tags
  contextFactory: (extra) => ({ rawToken: extra?._meta?.token }),
});
```

```typescript
// Admin server — expose everything EXCEPT destructive
attachToServer(adminServer, registry, {
  filter: { exclude: ['destructive'] }, // NOT: must NOT have any listed tag
  contextFactory: (extra) => ({ rawToken: extra?._meta?.token }),
});
```

```typescript
// Dashboard — expose tools with ANY analytics-related tag
attachToServer(dashboardServer, registry, {
  filter: { anyTag: ['analytics', 'reporting'] }, // OR: at least one must match
  contextFactory: (extra) => ({ rawToken: extra?._meta?.token }),
});
```

| Filter | Logic | Description |
|---|---|---|
| `tags` | AND | Tool must have **all** listed tags |
| `anyTag` | OR | Tool must have **at least one** |
| `exclude` | NOT | Tool must **not** have any |

Combine them freely: `{ tags: ['read'], exclude: ['beta'] }` means "must have `read` AND must NOT have `beta`."

### Why Filtering Beats Handler Checks

With `{ tags: ['read'] }`, `admin.purge` is **invisible**. Not "forbidden" — the tool doesn't exist in the agent's universe:

| Approach | Agent Sees Tool? | On Call Attempt | Token Cost |
|---|---|---|---|
| Handler check | Yes | Error response | Wasted |
| Tag filter | No | Impossible | Zero |

The agent never wastes tokens calling tools it can't use. Its planning uses only tools it can invoke. By controlling the agent's _capability surface_ (not just its permissions), you prevent the agent from even knowing about operations it shouldn't access.

### One Registry, Multiple Surfaces

This enables a useful deployment pattern: one registry, multiple servers with different filters. Same codebase, same tests — different capability surfaces per deployment target.

Tag filtering uses `Set`-based O(1) lookups. The performance impact is negligible even with thousands of tools.


## Layer 4: Presenter as Defense-in-Depth {#presenter-security}

Even with perfect middleware and role checks, there's a residual risk: the handler calls `SELECT *` and returns every column. In MCP Fusion, the Presenter's Zod schema acts as the last allowlist — enforced at the framework level, not by the developer.

This strict MVA separation guarantees robust **Prompt Injection Defense for MCP**. Malicious payloads hidden inside database rows cannot hijack the system rules or tool schemas because the Presenter parses, sterilizes, and strictly structures the data *before* it enters the LLM context window.

### The Allowlist Model

The Presenter doesn't trust the handler. The handler returns a full database row. The schema strips everything undeclared:

```typescript
const UserPresenter = f.presenter({
  name: 'User',
  schema: z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
  }),
});
```

**Raw MCP Servers leak `password_hashes` directly to the LLM.** The database row has `password_hash`, `ssn`, `internal_notes`, `billing_rate`. The agent receives `id`, `name`, `role`. The other fields never reach the wire because MCP Fusion strips them at RAM level via the Zod `.strip()` Egress Firewall. When a migration adds a new column, it doesn't leak unless explicitly added to the schema. The default is _invisible_.


**Do not** use `z.passthrough()` on the Presenter schema. It defeats the security model by allowing undeclared fields through.

### Context DDoS & LLM OOM Prevention

A raw MCP server returning 100,000 records from a bad query will flood the LLM, triggering a fatal Out of Memory (OOM) error or incurring massive API costs. MCP Fusion features Built-in **Context DDoS Prevention** via the Presenter `.agentLimit()` guardrail. When bound to a presenter, the framework automatically truncates large payloads and injects a deterministic warning array, forcing the AI to paginate rather than crashing the context window (ensuring predictable **LLM Token Economics**).

### Per-Caller Perception

Presenter rules receive the runtime context, enabling different guidance per role without conditional handler logic:

```typescript
rules: (order, ctx) => {
  const role = (ctx as AppContext).user?.role;
  return [
    'Monetary values are in cents. Divide by 100 for display.',
    role !== 'finance' ? 'Cost and margin fields are excluded for your access level.' : null,
  ];
},
```

A `viewer` receives a note explaining the omission. A `finance` user receives the values directly. Same tool, same handler, same Presenter — different perception.

Rules are perception guidance, not access control. If you need to _prevent_ a field from reaching non-finance users, make the schema conditional or use two Presenters. Rules explain; schemas enforce.


## Structured Error Recovery {#error-recovery}

When authorization fails inside a handler, the agent needs more than `"Error: forbidden"`. Without recovery guidance, it retries blindly — wasting tokens, hitting the same error, frustrating the user.

`toolError()` returns a structured response that _teaches_ the agent how to recover:

```typescript
if (ctx.user.role !== 'admin') {
  return toolError('FORBIDDEN', {
    message: 'Only admin users can delete accounts',
    suggestion: 'Contact an administrator to perform this action',
    availableActions: ['users.list', 'users.get'],
  });
}
```

The agent receives four pieces of information in one response:

| Field | Purpose |
|---|---|
| Code (`FORBIDDEN`) | Programmatic — the agent can branch on this |
| `message` | Human-readable explanation |
| `suggestion` | A recovery directive the agent can act on |
| `availableActions` | Concrete tool names the agent can call instead |

Instead of guessing, the agent updates its plan. The user sees a coherent recovery instead of repeated failures. `toolError()` also accepts `severity`, `details`, and `retryAfter` for rate limiting. See [Error Handling](/error-handling) for the full API.


## Security Invariants {#invariants}

Every guarantee below is enforced by the framework, not by convention:

| Layer | Guarantee | Mechanism |
|---|---|---|
| `contextFactory` | First to run. If it throws, nothing executes. | Pipeline order |
| Middleware | Sequential. Any throw skips handler. | Ordered `Object.assign` merging |
| Context types | TypeScript tracks accumulated shape. | Generic inference |
| Tag filtering | Excluded tools are invisible and uncallable. | Set-based filtering on `tools/list` and `tools/call` |
| Presenter schema | `parse()` strips undeclared fields. Handler cannot override. | Zod validation |
| Registry freeze | `Object.freeze` after `attachToServer()` prevents runtime mutation. | JS immutability |
| `toolError()` | Structured recovery instead of opaque errors. | XML response with typed fields |

Each layer is independent. Use only middleware — authentication still enforces. Use only Presenters — field stripping still protects. But the full stack creates defense-in-depth where each layer covers the others' gaps.

The registry freeze occurs at `attachToServer()`. After that, no tools can be registered or modified for the server's lifetime — preventing runtime injection attacks.
