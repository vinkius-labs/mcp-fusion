# Vercel Adapter

<a href="https://www.npmjs.com/package/@vurb/vercel"><img src="https://img.shields.io/npm/v/@vurb/vercel?color=blue" alt="npm" /></a>

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create a Next.js App Router route handler at app/api/mcp/route.ts that deploys my Vurb registry to Vercel Edge using vercelAdapter."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create a Next.js App Router route handler at app/api/mcp/route.ts that deploys my Vurb registry to Vercel Edge using vercelAdapter.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+Next.js+App+Router+route+handler+at+app%2Fapi%2Fmcp%2Froute.ts+that+deploys+my+Vurb+registry+to+Vercel+Edge+using+vercelAdapter." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+Next.js+App+Router+route+handler+at+app%2Fapi%2Fmcp%2Froute.ts+that+deploys+my+Vurb+registry+to+Vercel+Edge+using+vercelAdapter." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">EDGE DEPLOYMENT</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">MCP on Vercel.<br><span style="color:rgba(255,255,255,0.25)">One line, zero transport config.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Deploy your Vurb server as a Next.js App Router route handler or standalone Vercel Function. Edge Runtime or Node.js — one line, zero transport config.</div>
</div>

```typescript
// app/api/mcp/route.ts — the entire file
import { initVurb } from '@vurb/core';
import { vercelAdapter } from '@vurb/vercel';

interface AppContext { tenantId: string; dbUrl: string }
const f = initVurb<AppContext>();

const listUsers = f.query('users.list')
  .describe('List users in tenant')
  .withOptionalNumber('limit', 'Max results (default 20)')
  .handle(async (input, ctx) =>
    fetch(`${ctx.dbUrl}/users?limit=${input.limit ?? 20}&tenant=${ctx.tenantId}`).then(r => r.json())
  );

const registry = f.registry();
registry.register(listUsers);

export const POST = vercelAdapter<AppContext>({
  registry,
  contextFactory: async (req) => ({
    tenantId: req.headers.get('x-tenant-id') || 'public',
    dbUrl: process.env.DATABASE_URL!,
  }),
});

// Edge Runtime for global low-latency (optional)
export const runtime = 'edge';
```

```bash
vercel deploy
```

That's it. Your MCP server is live on Vercel's global edge network.

## Why This Matters {#why-this-matters}

MCP servers were designed for long-lived processes with stateful transports. Vercel's serverless model — ephemeral functions, no persistent connections, no filesystem — breaks those assumptions.

### The Problem — MCP on Vercel is Hard {#the-problem}

| Serverless Reality | Why MCP Breaks |
|---|---|
| **Stateless functions** | MCP transports assume persistent connections. SSE sessions are stored in-memory — when the next request hits a different function instance, the session is gone. |
| **No filesystem** | `autoDiscover()` scans directories at boot. Vercel Functions have no persistent filesystem. |
| **Cold starts** | Every cold start re-runs Zod reflection, Presenter compilation, and schema generation. That's wasted CPU on every cold invocation. |
| **Transport bridging** | The official MCP `StreamableHTTPServerTransport` expects Node.js `http.IncomingMessage` / `http.ServerResponse`. The Edge Runtime uses `Request` / `Response`. Manual bridging is fragile. |
| **Environment access** | Vercel uses `process.env` (Node.js) or environment variables in the Edge Runtime. MCP's `contextFactory` doesn't know about Vercel's environment model. |

### The Solution — Plug and Play {#the-solution}

The Vercel adapter eliminates every problem with a single function call:

```
vercelAdapter({ registry, contextFactory })
```

| Problem | How the Adapter Solves It |
|---|---|
| **Stateless functions** | Uses `enableJsonResponse: true` — pure JSON-RPC request/response. No SSE, no streaming state, no session loss. |
| **No filesystem** | You build the registry at module scope (cold start). `autoDiscover()` isn't needed — register tools explicitly. |
| **Cold starts** | Registry compilation happens **once** at cold start and is cached. Warm requests only instantiate `McpServer` + `Transport`. |
| **Transport** | Uses the MCP SDK's native `WebStandardStreamableHTTPServerTransport` — designed for WinterCG runtimes. Works on both Edge and Node.js. |
| **Environment access** | `contextFactory` receives the `Request`, giving you access to headers, cookies, and full `process.env`. |

## Installation {#installation}

```bash
npm install @vurb/vercel
```

Peer dependencies: `Vurb.ts` (^2.0.0), `@modelcontextprotocol/sdk` (^1.12.0).

## Architecture {#architecture}

The adapter splits work between two phases to minimize per-request CPU cost:

```
┌──────────────────────────────────────────────────────────┐
│  COLD START (once per function instance)                  │
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
│  3. contextFactory(req)                → per-request ctx │
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

interface AppContext {
  tenantId: string;
  dbUrl: string;
}

export const f = initVurb<AppContext>();

export const listProjects = f.query('projects.list')
  .describe('List projects in the current workspace')
  .withOptionalEnum('status', ['active', 'archived', 'all'] as const, 'Project status filter')
  .withOptionalNumber('limit', 'Max results (1-100, default 20)')
  .handle(async (input, ctx) => {
    const res = await fetch(
      `${ctx.dbUrl}/api/projects?tenant=${ctx.tenantId}&status=${input.status ?? 'active'}&limit=${input.limit ?? 20}`
    );
    return res.json();
  });

export const createProject = f.action('projects.create')
  .describe('Create a new project')
  .withString('name', 'Project name')
  .withOptionalString('description', 'Project description')
  .handle(async (input, ctx) => {
    const res = await fetch(`${ctx.dbUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, tenantId: ctx.tenantId }),
    });
    return res.json();
  });
```

### Step 2 — Create the Route Handler {#step-2}

```typescript
// app/api/mcp/route.ts
import { vercelAdapter } from '@vurb/vercel';
import { f, listProjects, createProject } from '@/tools';

// ── Cold Start: compile once ──
const registry = f.registry();
registry.register(listProjects, createProject);

// ── Adapter: handles every POST request ──
export const POST = vercelAdapter<{ tenantId: string; dbUrl: string }>({
  registry,
  serverName: 'project-manager',
  serverVersion: '1.0.0',
  contextFactory: async (req) => ({
    tenantId: req.headers.get('x-tenant-id') || 'default',
    dbUrl: process.env.DATABASE_URL!,
  }),
});

// Edge Runtime for global low-latency (optional — remove for Node.js)
export const runtime = 'edge';
```

### Step 3 — Deploy {#step-3}

```bash
# Via Git push (recommended)
git push origin main

# Or via CLI
vercel deploy --prod
```

Your MCP server is now available at `https://your-project.vercel.app/api/mcp`.

## Edge vs Node.js Runtime {#runtimes}

The adapter works on both runtimes. Choose based on your needs:

| Aspect | Edge Runtime | Node.js Runtime |
|---|---|---|
| Latency | ~0ms cold start, global | ~250ms cold start, regional |
| API access | Web APIs only | Full Node.js APIs |
| Max duration | 5s (Free), 30s (Pro) | 10s (Free), 60s (Pro) |
| Use case | Simple tools, fast response | Database queries, heavy computation |

To use Edge Runtime, add to your route file:

```typescript
export const runtime = 'edge';
```

To use Node.js Runtime (default), simply omit the line.

## Adding Middleware {#middleware}

Middleware works identically to Node.js — the adapter doesn't change the execution model:

```typescript
const authMiddleware = f.middleware(async (ctx) => {
  const token = ((ctx as any)._request as Request).headers.get('authorization');
  if (!token) throw new Error('Missing authorization header');

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
import { ProjectModel } from './models/ProjectModel.js';

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
    const res = await fetch(
      `${ctx.dbUrl}/api/projects?tenant=${ctx.tenantId}&limit=${input.limit ?? 20}`
    );
    return res.json();
  });
```

## Configuration Reference {#config}

### `vercelAdapter(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `registry` | `RegistryLike` | _(required)_ | Pre-compiled `ToolRegistry` with all tools registered |
| `serverName` | `string` | `'Vurb.ts-vercel'` | MCP server name (visible in capabilities negotiation) |
| `serverVersion` | `string` | `'1.0.0'` | MCP server version string |
| `contextFactory` | `(req) => T` | — | Creates application context per request |
| `attachOptions` | `Record<string, unknown>` | `{}` | Additional options forwarded to `registry.attachToServer()` |

### `contextFactory` Parameters

| Parameter | Type | Description |
|---|---|---|
| `req` | `Request` | The incoming HTTP request (Web Standard API) |

Access environment variables via `process.env.YOUR_VAR` inside the factory.

## Vercel Services Integration {#services}

Use Vercel's managed services directly in your tools:

```typescript
// With Vercel Postgres
import { sql } from '@vercel/postgres';

const listUsers = f.query('users.list')
  .describe('List users')
  .withOptionalNumber('limit', 'Max results (default 20)')
  .handle(async (input) => {
    const { rows } = await sql`SELECT id, name FROM users LIMIT ${input.limit ?? 20}`;
    return rows;
  });

// With Vercel KV
import { kv } from '@vercel/kv';

const getCache = f.query('cache.get')
  .describe('Get a cached value')
  .withString('key', 'Cache key')
  .handle(async (input) => {
    const value = await kv.get(input.key);
    return { key: input.key, value };
  });

// With Vercel Blob
import { put, list } from '@vercel/blob';

const uploadFile = f.action('files.upload')
  .describe('Upload a file to blob storage')
  .withString('name', 'File name')
  .withString('content', 'File content')
  .handle(async (input) => {
    const blob = await put(input.name, input.content, { access: 'public' });
    return { url: blob.url };
  });
```

## What Works on Vercel {#compatibility}

Everything in Vurb.ts that doesn't require a filesystem or long-lived process:

| Feature | Support | Notes |
|---|---|---|
| Tools & Routing | ✅ | Full support — groups, tags, exposition |
| Middleware | ✅ | All middleware chains execute |
| Presenters | ✅ | Zod validation, rules, affordances, agentLimit |
| Governance Lockfile | ✅ | Pre-generated at build time |
| Observability | ✅ | Pass `debug` via `attachOptions` |
| Error Recovery | ✅ | `toolError()` structured errors |
| JSON Descriptors | ✅ | No Zod imports needed |
| `autoDiscover()` | ❌ | No filesystem — register tools explicitly |
| `createDevServer()` | ❌ | Use `next dev` or `vercel dev` instead |
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
const response = await fetch('https://your-project.vercel.app/api/mcp', {
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
