# Vercel Adapter

Deploy your MCP Fusion server as a Next.js App Router route handler or standalone Vercel Function. Edge Runtime or Node.js — one line, zero transport config.

```typescript
// app/api/mcp/route.ts — the entire file
import { initFusion } from '@vinkius-core/mcp-fusion';
import { vercelAdapter } from '@vinkius-core/mcp-fusion-vercel';
import { z } from 'zod';

interface AppContext { tenantId: string; dbUrl: string }
const f = initFusion<AppContext>();

const listUsers = f.tool({
  name: 'users.list',
  input: z.object({ limit: z.number().optional().default(20) }),
  readOnly: true,
  handler: async ({ input, ctx }) =>
    fetch(`${ctx.dbUrl}/users?limit=${input.limit}&tenant=${ctx.tenantId}`).then(r => r.json()),
});

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
npm install @vinkius-core/mcp-fusion-vercel
```

Peer dependencies: `@vinkius-core/mcp-fusion` (^2.0.0), `@modelcontextprotocol/sdk` (^1.12.0).

## Architecture {#architecture}

The adapter splits work between two phases to minimize per-request CPU cost:

```
┌──────────────────────────────────────────────────────────┐
│  COLD START (once per function instance)                  │
│                                                          │
│  const f = initFusion<AppContext>()                      │
│  const tool = f.tool({ ... })                            │
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
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface AppContext {
  tenantId: string;
  dbUrl: string;
}

export const f = initFusion<AppContext>();

export const listProjects = f.tool({
  name: 'projects.list',
  description: 'List projects in the current workspace',
  input: z.object({
    status: z.enum(['active', 'archived', 'all']).optional().default('active'),
    limit: z.number().min(1).max(100).optional().default(20),
  }),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    const res = await fetch(
      `${ctx.dbUrl}/api/projects?tenant=${ctx.tenantId}&status=${input.status}&limit=${input.limit}`
    );
    return res.json();
  },
});

export const createProject = f.tool({
  name: 'projects.create',
  description: 'Create a new project',
  input: z.object({
    name: z.string().min(1).max(128),
    description: z.string().optional(),
  }),
  handler: async ({ input, ctx }) => {
    const res = await fetch(`${ctx.dbUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, tenantId: ctx.tenantId }),
    });
    return res.json();
  },
});
```

### Step 2 — Create the Route Handler {#step-2}

```typescript
// app/api/mcp/route.ts
import { vercelAdapter } from '@vinkius-core/mcp-fusion-vercel';
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

const adminTool = f.tool({
  name: 'admin.reset',
  description: 'Reset tenant data — requires admin role',
  input: z.object({ confirm: z.literal(true) }),
  middleware: [authMiddleware],
  tags: ['admin'],
  handler: async ({ ctx }) => {
    if (ctx.user.role !== 'admin') throw new Error('Forbidden');
    // ...
  },
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
  suggestActions: (project) => [
    { tool: 'projects.get', args: { id: project.id } },
    project.status === 'active'
      ? { tool: 'projects.archive', args: { id: project.id } }
      : null,
  ].filter(Boolean),
  agentLimit: { max: 30 },
});

const listProjects = f.tool({
  name: 'projects.list',
  input: z.object({ limit: z.number().optional().default(20) }),
  readOnly: true,
  returns: ProjectPresenter,
  handler: async ({ input, ctx }) => {
    const res = await fetch(
      `${ctx.dbUrl}/api/projects?tenant=${ctx.tenantId}&limit=${input.limit}`
    );
    return res.json();
  },
});
```

## Configuration Reference {#config}

### `vercelAdapter(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `registry` | `RegistryLike` | _(required)_ | Pre-compiled `ToolRegistry` with all tools registered |
| `serverName` | `string` | `'mcp-fusion-vercel'` | MCP server name (visible in capabilities negotiation) |
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

const listUsers = f.tool({
  name: 'users.list',
  input: z.object({ limit: z.number().default(20) }),
  readOnly: true,
  handler: async ({ input }) => {
    const { rows } = await sql`SELECT id, name FROM users LIMIT ${input.limit}`;
    return rows;
  },
});

// With Vercel KV
import { kv } from '@vercel/kv';

const getCache = f.tool({
  name: 'cache.get',
  input: z.object({ key: z.string() }),
  readOnly: true,
  handler: async ({ input }) => {
    const value = await kv.get(input.key);
    return { key: input.key, value };
  },
});

// With Vercel Blob
import { put, list } from '@vercel/blob';

const uploadFile = f.tool({
  name: 'files.upload',
  input: z.object({ name: z.string(), content: z.string() }),
  handler: async ({ input }) => {
    const blob = await put(input.name, input.content, { access: 'public' });
    return { url: blob.url };
  },
});
```

## What Works on Vercel {#compatibility}

Everything in MCP Fusion that doesn't require a filesystem or long-lived process:

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
- **FusionClient** — the built-in tRPC-style client

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
