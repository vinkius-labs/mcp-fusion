# Multi-Tenancy

MCP Fusion solves data, capability, and perception isolation using middleware (tenant resolution), tags (capability visibility), and Presenters (perception control) — no special module required.


## Data Isolation: Tenant Resolution {#tenant-resolution}

Middleware resolves the tenant from the JWT. The handler receives `ctx.user.tenantId` without the agent having any way to override it.

### Two-Stage Middleware

Split auth and tenant into separate stages. Each is independently testable. `authMiddleware` can be used on tools that don't need tenant metadata:

```typescript
const authMiddleware = f.middleware(async (ctx) => {
  const payload = await verifyJWT((ctx as any).rawToken);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  return { db: prisma, user };
});
```

Then resolve the tenant's plan and resource limits:

```typescript
const tenantMiddleware = f.middleware(async (ctx) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.user.tenantId } });
  return { tenant: { id: tenant.id, plan: tenant.plan, maxRowsPerQuery: tenant.maxRowsPerQuery } };
});
```

After both stages, the handler receives `ctx.user.tenantId`, `ctx.tenant.plan`, and `ctx.tenant.maxRowsPerQuery` with full TypeScript inference.

### The Isolation Guarantee

The key: `tenantId` comes from a verified JWT → middleware → `ctx.user.tenantId`. It's not part of the tool's `input` schema. The agent cannot override it:

```typescript
.handle(async (input, ctx) => {
  return ctx.db.order.findMany({
    where: { tenantId: ctx.user.tenantId },  // ← from middleware, not input
    take: Math.min(input.limit, ctx.tenant.maxRowsPerQuery),
  });
});
```

An enterprise tenant might allow 1,000 rows per query. A free tenant gets 50. Same handler, different behavior from middleware context.

Never accept a `tenantId` parameter in the tool's `input` schema. If you do, an agent could request any tenant's data. The tenant ID must always come from middleware.


## Capability Isolation: Tag-Based Visibility {#tag-based-visibility}

Tags control what tools _exist_ from the agent's perspective. Different plan tiers see different `tools/list` responses.

### Tagging by Tier

```typescript
const cohortAnalysis = f.query('analytics.cohort')
  .describe('Run cohort analysis')
  .tags('enterprise')
  .use(authMiddleware, tenantMiddleware)
  .handle(async (input, ctx) => { /* ... */ });

const basicReport = f.query('reports.summary')
  .describe('Generate a summary report')
  .tags('core')
  .use(authMiddleware, tenantMiddleware)
  .handle(async (input, ctx) => { /* ... */ });
```

### One Registry, Three Surfaces

Deploy separate server instances with different filters. Same codebase, same registry:

```typescript
attachToServer(freeServer, registry, { filter: { tags: ['core'] } });
attachToServer(proServer, registry, { filter: { anyTag: ['core', 'pro'] } });
attachToServer(enterpriseServer, registry, {}); // no filter = everything
```

On the free server, `analytics.cohort` is **invisible**. Not "forbidden" — the tool doesn't exist. The agent can't discover it, plan with it, or mention it to the user. No wasted tokens, no false promises.

This is fundamentally different from checking the plan inside the handler. With handler checks: the agent sees the tool → calls it → gets "forbidden" → wastes tokens → needs error recovery. With tag filtering: the tool doesn't exist → nothing to call → perfect plan.

Tag filtering uses `Set`-based O(1) lookups. See [Security & Authentication](/enterprise/security#tag-filtering) for the full filter reference.


## Perception Isolation: Tenant-Aware Presenters {#tenant-aware-presenters}

Different tenants should see different _representations_ of the same data. An enterprise tenant sees cost and margin. A free tenant sees only price. The handler stays identical — the Presenter adapts.

### Dynamic Rules

Presenter rules receive the runtime context, so they can adjust guidance per plan:

```typescript
rules: (order, ctx) => {
  const plan = (ctx as AppContext).tenant?.plan;
  return [
    'Monetary values are in cents. Divide by 100 for display.',
    plan === 'free' ? 'Cost and margin data available on Enterprise plan.' : null,
  ];
},
```

A free-plan agent sees `internalCost` and `profitMargin` as `undefined`, plus a rule explaining what's available on higher plans. An enterprise agent sees the values directly. Same tool, same handler, same Presenter — different perception.

### Separate Presenters Per Plan

When different plans need fundamentally different shapes (not just hidden fields), use different Presenters:

```typescript
const FreeOrderPresenter = f.presenter({
  name: 'Order',
  schema: z.object({ id: z.string(), total: z.number(), status: z.string() }),
  rules: () => ['Upgrade to Pro for shipping cost data.'],
});
```

```typescript
const EnterpriseOrderPresenter = f.presenter({
  name: 'Order',
  schema: z.object({
    id: z.string(), total: z.number(), status: z.string(),
    shippingCost: z.number(), internalCost: z.number(), profitMargin: z.number(),
  }),
  rules: () => ['All monetary values are in cents.'],
});
```

Select the Presenter dynamically in the handler:

```typescript
.handle(async (input, ctx) => {
  const data = await ctx.db.order.findMany({ where: { tenantId: ctx.user.tenantId } });
  const presenter = ctx.tenant.plan === 'enterprise' ? EnterpriseOrderPresenter : FreeOrderPresenter;
  return presenter.make(data, ctx).build();
});
```

Rules are perception guidance, not access control. If a field must _never_ reach a specific tenant, use a separate Presenter with a different schema. Rules explain; schemas enforce.


## Putting It Together {#complete-architecture}

A multi-tenant MCP Fusion server uses three layers, each addressing a different isolation concern. Here's how they compose across the full request lifecycle:

```text
Request arrives with JWT
    │
    ├─ contextFactory         → extracts raw token
    │
    ├─ authMiddleware         → resolves user + tenantId from JWT
    │
    ├─ tenantMiddleware       → resolves tenant plan + limits
    │
    ├─ tag filter             → tools/list returns only tools
    │                           matching the tenant's capability tier
    │
    ├─ Zod input validation   → validates tool input
    │
    ├─ handler                → queries scoped by ctx.user.tenantId
    │                           (tenant can't be overridden via input)
    │
    └─ Presenter              → rules adapt field visibility and
                                 context based on ctx.tenant.plan
```

### Isolation Summary

| Concern | Mechanism | What It Prevents | Failure Mode Without It |
|---|---|---|---|
| Data isolation | `ctx.user.tenantId` in queries | Cross-tenant data leakage | One forgotten WHERE clause leaks an entire table |
| Capability isolation | `tags` + `filter` on `attachToServer` | Agents discovering tools they can't use | Agent wastes tokens calling tools that return "forbidden" |
| Perception isolation | Presenter `rules` referencing `ctx.tenant` | Agents seeing data their plan doesn't include | Enterprise-only metrics shown to free-plan users |
| Resource isolation | `ctx.tenant.maxRowsPerQuery` in handlers | One tenant consuming disproportionate resources | A single tenant's query consumes all server memory |

No special multi-tenancy module. No row-level security plugin. No policy DSL. The same primitives that handle authentication, field stripping, and tool registration compose to solve tenant isolation. If you already understand middleware, Presenters, and tags, you already understand multi-tenancy.

For runtime resource isolation beyond query limits (concurrent request limiting, egress byte capping, payload size guards), see the [Runtime Guards](/runtime-guards) documentation.


## Common Patterns {#patterns}

### Tenant Context Caching

If tenant metadata doesn't change frequently, avoid querying it on every request:

```typescript
const tenantCache = new Map<string, { data: AppContext['tenant']; expiresAt: number }>();

const cachedTenantMiddleware = f.middleware(async (ctx) => {
  const cached = tenantCache.get(ctx.user.tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return { tenant: cached.data };
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.user.tenantId },
  });

  const data = {
    id: tenant.id,
    plan: tenant.plan as 'free' | 'pro' | 'enterprise',
    maxTools: tenant.maxTools,
    maxRowsPerQuery: tenant.maxRowsPerQuery,
  };

  tenantCache.set(ctx.user.tenantId, {
    data,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  return { tenant: data };
});
```

### Audit Events With Tenant Context

Combine the debug observer with tenant context for per-tenant audit trails:

```typescript
const observer = createDebugObserver((event) => {
  if (event.type === 'execute') {
    auditLog.write({
      timestamp: event.timestamp,
      tool: event.tool,
      durationMs: event.durationMs,
      // Tenant info is available if middleware has run
      // For middleware/validation errors, tenant may not be resolved yet
    });
  }
});
```

The debug observer fires at every pipeline stage. For `error` events with `step: 'middleware'`, the tenant may not be resolved yet (if the auth middleware is what failed). Design your audit schema to handle nullable tenant IDs for pre-auth failures.
