# Enterprise Quickstart

A production-grade MCP server with JWT authentication, tenant isolation, field-level data protection, audit logging, and cognitive affordances. About 5 minutes of work.

By the end, unauthenticated requests are rejected before any handler runs. A `viewer`-role agent receives user records _without_ email addresses. An `admin`-role agent sees everything — same tool, same handler, different perception.

If you don't need authentication yet, start with the [Lightspeed Quickstart](/quickstart-lightspeed). Every layer below is additive.

## The Pipeline

Every tool call executes this pipeline in order:

```
contextFactory → authMiddleware → handler → Presenter → agent
```

Each stage has one job. If any stage throws, everything after it is skipped — the handler cannot run if middleware rejects the request.

## Step 1 — Scaffold with Lightspeed {#step-1-scaffold}

```bash
npx fusion create secure-api --vector oauth --transport sse --yes
cd secure-api
```

The CLI scaffolds a complete project with OAuth middleware, SSE transport, `autoDiscover()`, Vitest, and pre-configured IDE connections — all dependencies installed. You're ready to code in seconds.

::: tip Manual setup?
If you prefer manual setup: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — then follow the [Traditional Quickstart](/quickstart).
:::

## Step 2 — Define Your Context Type {#step-2-context-type}

```typescript
// src/fusion.ts
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: 'admin' | 'viewer'; tenantId: string };
}

export const f = initFusion<AppContext>();
```

The `f` object provides typed factory methods — `f.query()`, `f.mutation()`, `f.action()`, `f.presenter()`, `f.middleware()`, `f.registry()` — that all inherit `AppContext`. TypeScript knows `ctx.user.tenantId` is a `string` in every handler.

## Step 3 — Authentication Middleware {#step-3-auth-middleware}

Middleware follows tRPC's context derivation pattern. Your function receives the current `ctx`, returns an object, and that object is merged via `Object.assign`. TypeScript infers the resulting type.

If any middleware throws, the handler never executes — runtime guarantee, not convention.

```typescript
// src/middleware/auth.ts
export const authMiddleware = f.middleware(async (ctx) => {
  const token = (ctx as any).rawToken;
  if (!token) throw new Error('Missing authentication token');

  const payload = await verifyJWT(token);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
  });

  return { db: prisma, user: { id: user.id, role: user.role, tenantId: user.tenantId } };
});
```

For multiple sequential stages — authentication, then rate limiting, then feature flags — use an array: `middleware: [authMiddleware, rateLimiter, featureFlags]`.

### OAuth — Device Authorization Grant

For enterprise environments with an OAuth provider, use the [OAuth Device Flow](/oauth) module:

```bash
npm install @vinkius-core/mcp-fusion-oauth
```

```typescript
import { createAuthTool, requireAuth } from '@vinkius-core/mcp-fusion-oauth';

const auth = createAuthTool<AppContext>({
    clientId: process.env.OAUTH_CLIENT_ID!,
    authorizationEndpoint: 'https://auth.example.com/device/code',
    tokenEndpoint: 'https://auth.example.com/oauth/token',
    tokenManager: { configDir: '.secure-api', envVar: 'SECURE_API_TOKEN' },
    onAuthenticated: (token, ctx) => ctx.client.setToken(token),
});

registry.register(auth);
```

The agent receives 4 actions — `login`, `complete`, `status`, `logout`. When an unauthenticated agent calls a protected tool, `requireAuth()` returns a structured error with recovery hints, enabling the LLM to self-heal by calling `auth action=login` automatically. See [OAuth Guide](/oauth) for full configuration.

## Step 4 — The Presenter {#step-4-presenter}

Instead of excluding what shouldn't be in the response, declare what _should_. The Zod schema is an allowlist — anything not declared is stripped by `parse()`:

```typescript
// src/presenters/user.presenter.ts
import { createPresenter, t, suggest } from '@vinkius-core/mcp-fusion';

export const UserPresenter = createPresenter('User')
  .schema({
    id:        t.string,
    name:      t.string,
    email:     t.zod.string().email().describe('User email address'),
    role:      t.enum('admin', 'viewer'),
    createdAt: t.string,
  })
  .rules((user, ctx) => [
    'Dates are in ISO 8601 format.',
    (ctx as any).user?.role !== 'admin'
      ? 'Email addresses are included for display only.'
      : null,
  ])
  .suggest((user) => [
    suggest('users.get', 'View user details'),
    suggest('users.update', 'Update user profile'),
  ])
  .limit(50);
```

The database row has 10+ fields. The agent sees 5. When a developer adds a new column, it doesn't leak unless explicitly added to the schema.

`.suggest()` gives the agent concrete next-steps instead of hallucinating tool names. `.limit()` truncates large collections and teaches the agent to use filters.

## Step 5 — Tools {#step-5-tools}

```typescript
// src/tools/users/list.ts
import { f } from '../../fusion.js';
import { authMiddleware } from '../../middleware/auth.js';
import { UserPresenter } from '../../presenters/user.presenter.js';

export default f.query('users.list')
  .describe('List users in the current tenant')
  .withOptionalNumber('limit', 'Max results (default 20)')
  .withOptionalString('search', 'Search by name')
  .use(authMiddleware)
  .returns(UserPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.user.findMany({
      where: { tenantId: ctx.user.tenantId, ...(input.search ? { name: { contains: input.search } } : {}) },
      take: input.limit ?? 20,
    });
  });
```

Drop the file in `src/tools/users/` — `autoDiscover()` registers it automatically. No imports to update. Git diffs stay clean.

The handler has one job — query the database with tenant scope. Authentication is middleware. Column filtering is the Presenter. Collection capping is `.limit()`. Each concern is independently testable.

### Write Tool with Error Recovery

```typescript
// src/tools/users/delete.ts
import { f } from '../../fusion.js';
import { authMiddleware } from '../../middleware/auth.js';

export default f.mutation('users.delete')
  .describe('Permanently delete a user account')
  .withString('id', 'User ID to delete')
  .tags('admin')
  .use(authMiddleware)
  .handle(async (input, ctx) => {
    if (ctx.user.role !== 'admin') {
      return f.error('FORBIDDEN', 'Only admin users can delete accounts')
        .suggest('Contact an administrator')
        .actions('users.list', 'users.get')
        .build();
    }
    await ctx.db.user.delete({ where: { id: input.id, tenantId: ctx.user.tenantId } });
    return { deleted: true, id: input.id };
  });
```

`.tags('admin')` makes this tool invisible when the registry is filtered with `exclude: ['admin']`. The agent doesn't waste tokens discovering tools it can't use.

`f.error()` gives the agent a structured error code, recovery suggestion, and available fallback actions — no blind retries.

## Step 6 — Run {#step-6-run}

```bash
fusion dev
```

`fusion dev` starts with `autoDiscover()`, SSE transport, observability, and **HMR** — edit any tool, middleware, or Presenter and the server reloads instantly. No manual restarts during development. See [HMR Dev Server](/cookbook/hmr-dev-server) for configuration details.

Connect it to your MCP client:

### Cursor

Already configured — the CLI generates `.cursor/mcp.json`. Open the project in Cursor and the MCP connection is live.

### Claude Code

```bash
claude mcp add secure-api npx tsx src/server.ts
```

## Step 7 — Deploy to Production {#step-7-deploy}

MCP servers were designed for long-lived processes with stateful transports — SSE sessions stored in-memory, persistent WebSocket connections, streaming notifications. Serverless runtimes break every one of those assumptions: stateless isolates, no filesystem, cold starts that re-run Zod reflection on every invocation.

The adapters solve this by splitting work into two phases. Registry compilation — Zod reflection, Presenter compilation, schema generation, middleware resolution — happens **once** at cold start and is cached at module scope. Warm requests only instantiate an ephemeral `McpServer` + `WebStandardStreamableHTTPServerTransport`, route the JSON-RPC call, and return. No reflection, no re-compilation.

```text
┌──────────────────────────────────────────────────────┐
│  COLD START (once per isolate/function instance)      │
│  ✓ Zod reflection → cached                           │
│  ✓ Presenter compilation → cached                    │
│  ✓ Schema generation → cached                        │
│  ✓ Middleware resolution → cached                    │
└──────────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  WARM REQUEST (per invocation — near-zero overhead)   │
│  1. new McpServer()           → ephemeral             │
│  2. new Transport()           → stateless JSON-RPC    │
│  3. contextFactory(req, env)  → per-request context   │
│  4. attachToServer()          → trivial wiring        │
│  5. handleRequest()           → route + execute       │
│  6. server.close()            → cleanup               │
└──────────────────────────────────────────────────────┘
```

Both adapters use `enableJsonResponse: true` — pure JSON-RPC request/response over the MCP SDK's native `WebStandardStreamableHTTPServerTransport`. No SSE sessions to lose, no streaming state to manage, no session leaks across isolates.

### Vercel — Next.js App Router

The Vercel adapter turns your MCP server into a standard Next.js route handler. Edge Runtime for ~0ms cold starts and global distribution, or Node.js Runtime for full API access and heavier computation.

```bash
npm install @vinkius-core/mcp-fusion-vercel
```

```typescript
// app/api/mcp/route.ts
import { vercelAdapter } from '@vinkius-core/mcp-fusion-vercel';

export const POST = vercelAdapter<AppContext>({
  registry,
  serverName: 'secure-api',
  contextFactory: async (req) => ({
    rawToken: req.headers.get('authorization'),
    dbUrl: process.env.DATABASE_URL!,
  }),
});

// Optional: run on Vercel's global Edge Network (~0ms cold start)
export const runtime = 'edge';
```

`contextFactory` receives the Web Standard `Request` — full access to headers, cookies, and `process.env`. Use Vercel Postgres (`@vercel/postgres`), KV (`@vercel/kv`), or Blob (`@vercel/blob`) directly inside your tool handlers. Deploy with `git push` or `vercel deploy --prod`.

See [Vercel Adapter](/vercel-adapter) for Edge vs Node.js runtime comparison, Vercel services integration, and full configuration reference.

### Cloudflare Workers — Global Edge with D1 & KV

The Cloudflare adapter exposes the `env` parameter — your gateway to D1 (SQLite at the edge), KV (global key-value), R2 (object storage), Queues, and secrets. Your tools query D1 with sub-millisecond latency from 300+ edge locations.

```bash
npm install @vinkius-core/mcp-fusion-cloudflare
```

```typescript
// src/worker.ts
import { cloudflareWorkersAdapter } from '@vinkius-core/mcp-fusion-cloudflare';

export interface Env { DB: D1Database; CACHE: KVNamespace; API_SECRET: string }

export default cloudflareWorkersAdapter<Env, AppContext>({
  registry,
  serverName: 'secure-api',
  contextFactory: async (req, env) => ({
    db: env.DB,
    tenantId: req.headers.get('x-tenant-id') || 'default',
  }),
});
```

`contextFactory` receives `(req, env, executionCtx)` — the Cloudflare trifecta. Use `env.DB` for D1 queries that execute at the edge, `env.CACHE` for KV reads in ~1ms, and `executionCtx.waitUntil()` for background audit logging that doesn't block the response. Deploy with `npx wrangler deploy`.

See [Cloudflare Adapter](/cloudflare-adapter) for wrangler configuration, D1/KV integration examples, and full API reference.

## Next Steps {#next}

| What | Where |
|---|---|
| Understand tool definitions, annotations, Zod schemas | [Building Tools](/building-tools) |
| Shape what the LLM sees with Presenters | [Presenter Guide](/presenter) |
| Add auth, rate limiting, logging | [Middleware](/middleware) |
| Register prompts and dynamic manifests | [Prompt Engine](/prompts) |
| Run the full test harness | [Testing](/testing) |
| Lock your capability surface | [Capability Governance](/governance/) |
| Tracing and observability | [Observability](/observability) |
