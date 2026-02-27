# Cloudflare Workers Adapter

- [Why This Matters](#why-this-matters)
- [Installation](#installation)
- [Architecture](#architecture)
- [Step-by-Step Setup](#setup)
- [Adding Middleware](#middleware)
- [Adding Presenters](#presenters)
- [Configuration Reference](#config)
- [What Works on the Edge](#edge-compatibility)
- [Compatible Clients](#clients)

Deploy your MCP Fusion server to Cloudflare Workers in one line. No transport hacks, no session workarounds, no infrastructure config. Your existing tools, middleware, Presenters, and governance lockfile run at the edge — unchanged.

```typescript
// worker.ts — the entire file
import { initFusion } from '@vinkius-core/mcp-fusion';
import { cloudflareWorkersAdapter } from '@vinkius-core/mcp-fusion-cloudflare';
import { z } from 'zod';

interface AppContext { db: D1Database; tenantId: string }
const f = initFusion<AppContext>();

const listUsers = f.query('users.list')
  .describe('List users in tenant')
  .withOptionalNumber('limit', 'Max results (default 20)')
  .handle(async (input, ctx) =>
    ctx.db.prepare('SELECT id, name FROM users LIMIT ?').bind(input.limit ?? 20).all()
  );

const registry = f.registry();
registry.register(listUsers);

export interface Env { DB: D1Database }

export default cloudflareWorkersAdapter<Env, AppContext>({
  registry,
  contextFactory: async (req, env) => ({
    db: env.DB,
    tenantId: req.headers.get('x-tenant-id') || 'public',
  }),
});
```

```bash
npx wrangler deploy
```

That's it. Your MCP server is live on 300+ Cloudflare edge locations.

## Why This Matters {#why-this-matters}

Deploying MCP servers beyond `stdio` and local Node.js is one of the most frustrating experiences in the current ecosystem. The MCP SDK was designed for long-lived processes with stateful transports — SSE sessions, WebSocket connections, streaming notifications. Edge runtimes like Cloudflare Workers break every one of those assumptions.

### The Problem — MCP on Serverless is Hard {#the-problem}

Developers building MCP servers today face a difficult choice: keep the server on a long-lived VM (expensive, slow to scale) or move to serverless (cheap, global — but nothing works).

| Serverless Reality | Why MCP Breaks |
|---|---|
| **Stateless isolates** | MCP transports assume persistent connections. SSE sessions are stored in-memory — when the next request hits a different isolate, the session is gone. |
| **No filesystem** | `autoDiscover()` scans directories at boot. Workers have no filesystem. |
| **Cold starts** | Every cold start re-runs Zod reflection, Presenter compilation, and schema generation. On a 10-tool server, that's 50–200ms of CPU wasted on every cold request. |
| **No WebSocket (standard)** | WebSocket on Workers requires Durable Objects — a completely different programming model with its own session management. |
| **Transport bridging** | The official MCP `StreamableHTTPServerTransport` expects Node.js `http.IncomingMessage` / `http.ServerResponse`. Workers use the Web Standard `Request` / `Response` API. Manual bridging is error-prone and fragile. |
| **Environment bindings** | Cloudflare D1, KV, R2, and secrets arrive via the `env` parameter in the `fetch()` handler. There's no `process.env`. MCP's `contextFactory` doesn't know about `env`. |

The result: most teams either give up on edge deployment entirely, or build fragile custom adapters that break on SDK upgrades.

### The Solution — Plug and Play {#the-solution}

The Cloudflare adapter eliminates every problem above with a single function call:

```
cloudflareWorkersAdapter({ registry, contextFactory })
```

| Problem | How the Adapter Solves It |
|---|---|
| **Stateless isolates** | Uses `enableJsonResponse: true` — pure JSON-RPC request/response. No SSE sessions, no streaming state, no session loss. |
| **No filesystem** | You build the registry at module scope (cold start). `autoDiscover()` isn't needed — register tools explicitly. |
| **Cold starts** | Registry compilation (Zod reflection, Presenter compilation, schema generation) happens **once** at cold start and is cached. Warm requests only instantiate `McpServer` + `Transport` — near-zero CPU overhead. |
| **Transport** | Uses the MCP SDK's native `WebStandardStreamableHTTPServerTransport` — designed for WinterCG runtimes. No bridging, no polyfills. |
| **Environment bindings** | `contextFactory` receives `(req, env, ctx)` — full access to D1, KV, R2, secrets, and the Cloudflare `ExecutionContext`. |

## Installation {#installation}

```bash
npm install @vinkius-core/mcp-fusion-cloudflare
```

Peer dependencies: `@vinkius-core/mcp-fusion` (^2.0.0), `@modelcontextprotocol/sdk` (^1.12.0).

## Architecture {#architecture}

The adapter splits work between two phases to minimize per-request CPU cost:

```
┌──────────────────────────────────────────────────────────┐
│  COLD START (once per isolate)                           │
│                                                          │
│  const f = initFusion<AppContext>()                      │
│  const tool = f.query('name').handle(...)                │
│  const registry = f.registry()                           │
│  registry.register(tool)                                 │
│                                                          │
│  ✓ Zod reflection        → cached                        │
│  ✓ Presenter compilation → cached                        │
│  ✓ Schema generation     → cached                        │
│  ✓ Middleware resolution → cached                        │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  WARM REQUEST (per invocation)                           │
│                                                          │
│  1. new McpServer()                    → ephemeral       │
│  2. new WebStandard...Transport()      → stateless       │
│  3. contextFactory(req, env, ctx)      → per-request ctx │
│  4. registry.attachToServer(server)    → trivial wiring  │
│  5. transport.handleRequest(request)   → JSON-RPC        │
│  6. server.close()                     → cleanup         │
└──────────────────────────────────────────────────────────┘
```

Cold start: compile everything once.
Warm request: route the call, run the handler, return JSON. No reflection, no compilation.

## Step-by-Step Setup {#setup}

### Step 1 — Define Your Tools {#step-1}

Build tools exactly as you would for a Node.js MCP server. Nothing changes:

```typescript
// src/tools.ts
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface AppContext {
  db: D1Database;
  cache: KVNamespace;
  tenantId: string;
}

export const f = initFusion<AppContext>();

export const listProjects = f.query('projects.list')
  .describe('List projects in the current workspace')
  .withOptionalEnum('status', ['active', 'archived', 'all'] as const, 'Project status filter')
  .withOptionalNumber('limit', 'Max results (1-100, default 20)')
  .handle(async (input, ctx) => {
    const status = input.status ?? 'active';
    const limit = input.limit ?? 20;
    const query = status === 'all'
      ? 'SELECT id, name, status FROM projects WHERE tenant_id = ? LIMIT ?'
      : 'SELECT id, name, status FROM projects WHERE tenant_id = ? AND status = ? LIMIT ?';

    const bindings = status === 'all'
      ? [ctx.tenantId, limit]
      : [ctx.tenantId, status, limit];

    return ctx.db.prepare(query).bind(...bindings).all();
  });

export const createProject = f.mutation('projects.create')
  .describe('Create a new project')
  .withString('name', 'Project name')
  .withOptionalString('description', 'Project description')
  .handle(async (input, ctx) => {
    const id = crypto.randomUUID();
    await ctx.db.prepare(
      'INSERT INTO projects (id, name, description, tenant_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, input.name, input.description ?? '', ctx.tenantId, 'active').run();
    return { id, name: input.name, status: 'active' };
  });
```

### Step 2 — Create the Worker {#step-2}

```typescript
// src/worker.ts
import { cloudflareWorkersAdapter } from '@vinkius-core/mcp-fusion-cloudflare';
import { f, listProjects, createProject } from './tools.js';

// ── Cold Start: compile once ──
const registry = f.registry();
registry.register(listProjects, createProject);

// ── Cloudflare Env bindings ──
export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  API_SECRET: string;
}

// ── Adapter: handles every request ──
export default cloudflareWorkersAdapter<Env, { db: D1Database; cache: KVNamespace; tenantId: string }>({
  registry,
  serverName: 'project-manager',
  serverVersion: '1.0.0',
  contextFactory: async (req, env) => ({
    db: env.DB,
    cache: env.CACHE,
    tenantId: req.headers.get('x-tenant-id') || 'default',
  }),
});
```

### Step 3 — Deploy {#step-3}

```toml
# wrangler.toml
name = "my-mcp-server"
main = "src/worker.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "projects-db"
database_id = "abc-123"

[[kv_namespaces]]
binding = "CACHE"
id = "def-456"
```

```bash
npx wrangler deploy
```

Your MCP server is now available at `https://my-mcp-server.<your-subdomain>.workers.dev`.

## Adding Middleware {#middleware}

Middleware works identically to Node.js — the adapter doesn't change the execution model:

```typescript
const authMiddleware = f.middleware(async (ctx) => {
  const token = ((ctx as any)._request as Request).headers.get('authorization');
  if (!token) throw new Error('Missing authorization header');

  // Validate against your Cloudflare D1 or external auth
  const user = await verifyToken(token);
  return { user };
});

const adminTool = f.mutation('admin.reset')
  .describe('Reset tenant data — requires admin role')
  .tags('admin')
  .use(authMiddleware)
  .withBoolean('confirm', 'Must be true to confirm')
  .handle(async (input, ctx) => {
    if (ctx.user.role !== 'admin') throw new Error('Forbidden');
    // ...
  });
```

## Adding Presenters {#presenters}

Presenters enforce field-level data protection, inject domain rules, and provide cognitive affordances — exactly as they do on Node.js:

```typescript
const ProjectPresenter = f.presenter({
  name: 'Project',
  schema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['active', 'archived']),
  }),
  rules: (project) => [
    project.status === 'archived'
      ? 'This project is archived. It cannot be modified unless reactivated.'
      : null,
  ],
  suggest: (project) => [
    suggest('projects.get', 'View details', { id: project.id }),
    project.status === 'active'
      ? suggest('projects.archive', 'Archive project', { id: project.id })
      : null,
  ].filter(Boolean),
  limit: 30,
});

const listProjects = f.query('projects.list')
  .describe('List projects')
  .withOptionalNumber('limit', 'Max results (default 20)')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.prepare('SELECT * FROM projects WHERE tenant_id = ? LIMIT ?')
      .bind(ctx.tenantId, input.limit ?? 20).all();
  });
```

The handler returns raw database rows. The Presenter strips columns to `{ id, name, status }`, attaches contextual rules, suggests next actions, and caps collections at 30 items. Internal columns like `stripe_subscription_id` or `internal_cost` never reach the agent.

## Configuration Reference {#config}

### `cloudflareWorkersAdapter(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `registry` | `RegistryLike` | _(required)_ | Pre-compiled `ToolRegistry` with all tools registered |
| `serverName` | `string` | `'mcp-fusion-edge'` | MCP server name (visible in capabilities negotiation) |
| `serverVersion` | `string` | `'1.0.0'` | MCP server version string |
| `contextFactory` | `(req, env, ctx) => T` | — | Creates application context per request from Cloudflare bindings |
| `attachOptions` | `Record<string, unknown>` | `{}` | Additional options forwarded to `registry.attachToServer()` |

### `contextFactory` Parameters

| Parameter | Type | Description |
|---|---|---|
| `req` | `Request` | The incoming HTTP request (Web Standard API) |
| `env` | `TEnv` | Cloudflare environment bindings: D1, KV, R2, Queues, secrets |
| `ctx` | `ExecutionContext` | Cloudflare execution context with `waitUntil()` for background work |

## What Works on the Edge {#edge-compatibility}

Everything in MCP Fusion that doesn't require a filesystem or long-lived process works on Cloudflare Workers:

| Feature | Edge Support | Notes |
|---|---|---|
| Tools & Routing | ✅ | Full support — groups, tags, exposition |
| Middleware | ✅ | All middleware chains execute |
| Presenters | ✅ | Zod validation, rules, affordances, agentLimit |
| Governance Lockfile | ✅ | Pre-generated at build time |
| Observability | ✅ | Pass `debug` via `attachOptions` |
| Error Recovery | ✅ | `toolError()` structured errors |
| JSON Descriptors | ✅ | No Zod imports needed |
| `autoDiscover()` | ❌ | No filesystem — register tools explicitly |
| `createDevServer()` | ❌ | Use `wrangler dev` instead |
| State Sync | ❌ | Stateless transport — no notifications |

## Compatible Clients {#clients}

The stateless JSON-RPC endpoint works with any HTTP-capable MCP client:

- **LangChain / LangGraph** — HTTP transport
- **Vercel AI SDK** — direct JSON-RPC calls
- **Custom agents** — standard `POST` with JSON-RPC payload
- **Claude Desktop** — via proxy or direct HTTP config
- **FusionClient** — the built-in tRPC-style client

```typescript
// Calling from any HTTP client
const response = await fetch('https://my-mcp-server.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'acme' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: 'projects.list', arguments: { limit: 10 } },
    id: 1,
  }),
});
```