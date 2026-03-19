# Cloudflare Workers Adapter

<a href="https://www.npmjs.com/package/@vurb/cloudflare"><img src="https://img.shields.io/npm/v/@vurb/cloudflare?color=blue" alt="npm" /></a>

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create a Cloudflare Worker that deploys my Vurb registry to 300+ edge locations using cloudflareWorkersAdapter with D1 and KV bindings."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create a Cloudflare Worker that deploys my Vurb registry to 300+ edge locations using cloudflareWorkersAdapter with D1 and KV bindings.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+Cloudflare+Worker+that+deploys+my+Vurb+registry+to+300%2B+edge+locations+using+cloudflareWorkersAdapter+with+D1+and+KV+bindings." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+Cloudflare+Worker+that+deploys+my+Vurb+registry+to+300%2B+edge+locations+using+cloudflareWorkersAdapter+with+D1+and+KV+bindings." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">GLOBAL EDGE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">300+ edge locations.<br><span style="color:rgba(255,255,255,0.25)">One line deployment.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Deploy your Vurb server to Cloudflare Workers. No transport hacks, no session workarounds. Your existing tools, middleware, Presenters, and governance lockfile run at the edge — unchanged.</div>
</div>

```typescript
// worker.ts — the entire file
import { initVurb } from '@vurb/core';
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
import { z } from 'zod';

interface AppContext { db: D1Database; tenantId: string }
const f = initVurb<AppContext>();

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
npm install @vurb/cloudflare
```

Peer dependencies: `Vurb.ts` (^2.0.0), `@modelcontextprotocol/sdk` (^1.12.0).

## Architecture {#architecture}

The adapter splits work between two phases to minimize per-request CPU cost:

```
┌──────────────────────────────────────────────────────────┐
│  COLD START (once per isolate)                           │
│                                                          │
│  const f = initVurb<AppContext>()                      │
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
import { initVurb } from '@vurb/core';
import { z } from 'zod';

interface AppContext {
  db: D1Database;
  cache: KVNamespace;
  tenantId: string;
}

export const f = initVurb<AppContext>();

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
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
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
  schema: ProjectModel,
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
| `serverName` | `string` | `'Vurb.ts-edge'` | MCP server name (visible in capabilities negotiation) |
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

Everything in Vurb.ts that doesn't require a filesystem or long-lived process works on Cloudflare Workers:

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
- **VurbClient** — the built-in tRPC-style client

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