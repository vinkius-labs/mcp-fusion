<div align="center">

```
    __  __  ____ ____    _____ _   _ ____ ___ ___  _   _
   |  \/  |/ ___|  _ \  |  ___| | | / ___|_ _/ _ \| \ | |
   | |\/| | |   | |_) | | |_  | | | \___ \| | | | |  \| |
   | |  | | |___|  __/  |  _| | |_| |___) | | |_| | |\  |
   |_|  |_|\____|_|     |_|    \___/|____/___\___/|_| \_|
```

**The MVA framework for the Model Context Protocol.**
Build production-grade MCP servers with type safety, behavioral governance, and zero boilerplate.


![First Release](https://img.shields.io/badge/First%20Release-Feb%2012%2C%202026-blue)
![Downloads](https://img.shields.io/npm/dt/@vinkius-core/mcp-fusion) ![Weekly Downloads](https://img.shields.io/npm/dw/@vinkius-core/mcp-fusion) [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion) ![Package Size](https://img.shields.io/bundlephobia/minzip/@vinkius-core/mcp-fusion) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/) [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/) [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE) ![Built with 🚀 by Vinkius](https://img.shields.io/badge/Built%20with-%F0%9F%9A%80%20by%20Vinkius-%23000000)


[Quick Start](#quick-start) · [Architecture](#architecture) · [Documentation](https://mcp-fusion.vinkius.com/)

</div>

---

## Create your MCP server at lightspeed

```bash
npx fusion create
```

```
  ⚡ MCP Fusion — Create a new MCP server

  Project name?  (my-mcp-server) › my-server
  Transport?     [stdio, sse]    › stdio
  Vector?        [vanilla, prisma, n8n, openapi, aws, oauth] › vanilla
  Include testing?               › yes

  ● Scaffolding project — 14 files (6ms)
  ● Installing dependencies (4.2s)

  ✓ my-server is ready!

  Next steps:
    $ cd my-server
    $ npm run dev
    $ npm test

  Cursor: .cursor/mcp.json is pre-configured — open in Cursor and go.
  Docs:   https://mcp-fusion.vinkius.com/
```

That's it. A fully configured MCP server — with file-based routing, Presenters, Prompts, middleware, Cursor integration, and testing — in under 10 seconds. No config files to write. No boilerplate to copy. Drop a file in `src/tools/`, it's a tool.

Use `--yes` to skip the wizard with defaults:

```bash
npx fusion create my-server --yes
```

---

## Why MCP Fusion exists

Building an MCP server from scratch means solving the same problems every time:

| Problem | What raw MCP gives you | What MCP Fusion gives you |
|---|---|---|
| **Tool definition** | Manual JSON schema + handler wiring | `f.tool()` — one function, typed input, typed context |
| **Output control** | Raw JSON dumped into LLM context | **Presenters** — schema-validated egress with system rules |
| **Context window overflow** | No protection | **Agent Limits** + **TOON encoding** (~40% fewer tokens) |
| **Self-healing errors** | `isError: true` with a string | Structured XML with error codes, recovery, and available actions |
| **Tool governance** | Hope nothing changed | **Capability Lockfile** — `mcp-fusion.lock` diffs in every PR |
| **Type safety** | None (client ↔ server) | **tRPC-style client** with `InferRouter<typeof registry>` |
| **Multiple tools per file** | One tool = one handler | **Grouped actions** — `projects.list`, `projects.create` in one tool |
| **Cache control** | Not addressed | **Epistemic State Sync** — glob-based cache policies per tool |
| **Semantic regression** | Undetectable | **Semantic Probing** — LLM-as-a-Judge for behavioral drift |

---

## Quick Start

### From scratch (recommended)

```bash
npx fusion create my-server
```

The interactive wizard configures transport (stdio/SSE), ingestion vector (vanilla/prisma/n8n/openapi/aws/oauth), and testing. Use `--yes` for defaults.

### Manual installation

```bash
npm install @vinkius-core/mcp-fusion
```

```typescript
import { initFusion, ToolRegistry, autoDiscover, success } from '@vinkius-core/mcp-fusion';

type AppContext = { db: PrismaClient };

const f = initFusion<AppContext>();

// Define a tool — one function, fully typed
const listUsers = f.tool({
    name: 'users.list',
    description: 'List users from the database',
    readOnly: true,
    input: {
        limit: { type: 'number', min: 1, max: 100, optional: true, description: 'Max results' },
    },
    handler: async ({ input, ctx }) => {
        const users = await ctx.db.user.findMany({ take: input.limit ?? 10 });
        return success(users);
    },
});
```

> **Full setup guide**: [mcp-fusion.vinkius.com/quickstart](https://mcp-fusion.vinkius.com/quickstart)

---

## Architecture

MCP Fusion implements the **MVA pattern (Model → View → Agent)** — a structured alternative to dumping raw JSON into an LLM context window.

```
                                ┌─────────────────────────────────┐
                                │         MCP Client              │
                                │   (Claude, Cursor, custom)      │
                                └──────────────┬──────────────────┘
                                               │ MCP Protocol
                                ┌──────────────▼──────────────────┐
                                │     Execution Pipeline          │
                                │  Validation → Middleware →      │
                                │  Handler → Presenter → Egress   │
                                └──────────────┬──────────────────┘
                                               │
              ┌────────────────┬───────────────┼───────────────┬────────────────┐
              ▼                ▼               ▼               ▼                ▼
        ┌──────────┐   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────┐
        │  Schema  │   │ Middleware │  │  Handler   │  │ Presenter  │  │  Egress     │
        │Validation│   │  Chain     │  │ (Business  │  │ (View      │  │  Firewall   │
        │(Zod/Std) │   │  (RBAC,   │  │  Logic)    │  │  Layer)    │  │ (Schema +   │
        │          │   │  auth)    │  │            │  │            │  │  Rules)     │
        └──────────┘   └────────────┘  └────────────┘  └────────────┘  └─────────────┘
```

### Core modules

| Module | Purpose |
|---|---|
| `core/` | Tool builder, registry, execution pipeline, middleware, schema validation |
| `presenter/` | MVA View Layer — Zod-validated egress with system rules, UI blocks, agent limits |
| `prompt/` | Prompt Engine — `definePrompt()` with Zod-typed args and hydration pipeline |
| `server/` | `autoDiscover()` file-based routing + `createDevServer()` for hot reload |
| `client/` | tRPC-style `createFusionClient<AppRouter>()` with compile-time safety |
| `state-sync/` | Epistemic cache-control — glob-based `SyncPolicy` with `PolicyEngine` |
| `introspection/` | Governance suite — contracts, lockfile, crypto attestation, semantic probing |
| `observability/` | Debug observer + OpenTelemetry-compatible tracing |
| `cli/` | `fusion create` scaffolding + `fusion lock` capability lockfile |

---

## Core Capabilities

### `initFusion<T>()` — Define your context once

Inspired by tRPC. Call `initFusion<AppContext>()` once, and every `f.tool()`, `f.presenter()`, `f.prompt()`, `f.middleware()` inherits the context type. Zero generic repetition.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

type AppContext = { db: PrismaClient; user: User };
const f = initFusion<AppContext>();

// Every factory method is now typed to AppContext
const tool = f.tool({ ... });        // handler receives { ctx: AppContext }
const presenter = f.presenter({ ... });
const middleware = f.middleware(async (ctx) => ({ ... }));
const registry = f.registry();
```

> **Docs**: [mcp-fusion.vinkius.com/introduction#in-practice](https://mcp-fusion.vinkius.com/introduction#in-practice)

### `autoDiscover()` — File-based routing

Drop a file in `src/tools/`, it's a tool. No central import file. No merge conflicts.

```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    ├── list.ts         → users.list
    └── ban.ts          → users.ban
```

```typescript
await autoDiscover(registry, './src/tools');
```

> **Docs**: [mcp-fusion.vinkius.com/routing](https://mcp-fusion.vinkius.com/routing)

### Presenters — The View in MVA

A Presenter is a domain-level lens that controls what data reaches the LLM. It validates output through a Zod schema, attaches JIT system rules, injects UI blocks (charts, tables, diagrams), and enforces agent limits to prevent context window overflow.

```typescript
const InvoicePresenter = f.presenter({
    name: 'Invoice',
    schema: invoiceSchema,
    rules: ['CRITICAL: amount_cents is in CENTS. Divide by 100 for display.'],
    ui: (inv) => [
        ui.table(['Field', 'Value'], [
            ['Amount', `$${(inv.amount_cents / 100).toFixed(2)}`],
            ['Status', inv.paid ? '✅ Paid' : '⚠️ Pending'],
        ]),
    ],
});
```

Key capabilities:
- **Egress Firewall**: Zod schema strips undeclared fields before they reach the LLM
- **System Rules**: JIT directives that travel with the data (context-aware, not static)
- **Agent Limits**: Truncate collections with overflow messages (`agentLimit(50, ...)`)
- **UI Blocks**: `ui.echarts()`, `ui.mermaid()`, `ui.table()`, `ui.markdown()`
- **Embeds**: Relational Presenter composition for DRY nested data

> **Docs**: [mcp-fusion.vinkius.com/presenter](https://mcp-fusion.vinkius.com/presenter)

### Self-Healing Errors

Structured error responses with error codes, recovery instructions, and available actions — so the LLM self-corrects instead of hallucinating or giving up.

```typescript
return toolError('NOT_FOUND', {
    message: `Project "${id}" does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs.',
    availableActions: ['projects.list'],
});
```

The client-side `FusionClientError` parses these into typed objects with `.code`, `.recovery`, `.availableActions`.

> **Docs**: [mcp-fusion.vinkius.com/error-handling#tool-error](https://mcp-fusion.vinkius.com/error-handling#tool-error)

### TOON Encoding — Token reduction

`toonSuccess()` encodes array data using TOON (Token-Oriented Object Notation) for ~40-50% fewer tokens compared to `JSON.stringify()`. Critical for large dataset responses.

```typescript
// Instead of JSON (~200 tokens)
return success(users);

// TOON (~120 tokens) — same data, pipe-delimited tabular format
return toonSuccess(users);
// → "id|name|email\n1|Alice|alice@co.io\n2|Bob|bob@co.io"
```

> **Docs**: [mcp-fusion.vinkius.com/performance#toon-token-compression-30-50-fewer-tokens](https://mcp-fusion.vinkius.com/performance#toon-token-compression-30-50-fewer-tokens)

---

## Governance

### Capability Lockfile — `mcp-fusion.lock`

Like `package-lock.json` for your behavioral surface. Captures every tool's contract, egress schema digest, system rules fingerprint, entitlements, and token economics in a deterministic, git-diffable file.

```bash
# Generate or update
fusion lock

# CI gate — fail if lockfile is stale
fusion lock --check
```

Pull request diffs show exactly which behavioral surfaces changed:

```diff
  "billing": {
    "integrityDigest": "sha256:a1b2c3...",
    "behavior": {
-     "systemRulesFingerprint": "sha256:old...",
+     "systemRulesFingerprint": "sha256:new...",
    }
  }
```

> **Docs**: [mcp-fusion.vinkius.com/governance/capability-lockfile](https://mcp-fusion.vinkius.com/governance/capability-lockfile)

### Contract Diff Engine

Semantic diffing between two contract snapshots. Classifies changes as `BREAKING`, `RISKY`, `SAFE`, or `COSMETIC` based on their impact on LLM behavior.

```typescript
const diff = diffContracts(beforeContract, afterContract);
// diff.maxSeverity === 'BREAKING'
// diff.isBackwardsCompatible === false
// diff.deltas[0].description === 'System rules changed — LLM behavioral calibration invalidated'
```

> **Docs**: [mcp-fusion.vinkius.com/governance/contract-diffing](https://mcp-fusion.vinkius.com/governance/contract-diffing)

### Crypto Attestation

HMAC-SHA256 attestation for server digest verification. Useful for zero-trust deployments where clients need to verify the server's behavioral surface hasn't been tampered with.

```typescript
const signer = createHmacSigner(secretKey);
const attestation = attestServerDigest(serverDigest, signer);
const valid = verifyAttestation(attestation, secretKey);
```

> **Docs**: [mcp-fusion.vinkius.com/governance/zero-trust-attestation](https://mcp-fusion.vinkius.com/governance/zero-trust-attestation)

### Semantic Probing — LLM-as-a-Judge

Detects semantic drift — when handler output changes meaning even though schema and rules remain structurally identical. Uses a pluggable LLM adapter to evaluate baseline vs. current output.

```typescript
const probe = createProbe('billing', 'get_invoice', input, expectedOutput, actualOutput, contractContext);
const result = await evaluateProbe(probe, { adapter: myLlmAdapter });
// result.driftLevel === 'none' | 'low' | 'medium' | 'high'
// result.contractViolated === false
```

> **Docs**: [mcp-fusion.vinkius.com/governance/semantic-probe](https://mcp-fusion.vinkius.com/governance/semantic-probe)

### Entitlement Scanner

Static analysis of handler source code to detect I/O capabilities (filesystem, network, subprocess, crypto, code evaluation). Results are captured in the lockfile for blast-radius auditing.

```typescript
const report = scanSource(handlerSourceCode);
// report.matches → [{ category: 'network', pattern: 'fetch', ... }]
```

> **Docs**: [mcp-fusion.vinkius.com/governance/blast-radius](https://mcp-fusion.vinkius.com/governance/blast-radius)

---

## Execution Pipeline

Every tool call flows through a deterministic pipeline:

```
Request → Schema Validation → Middleware Chain → Handler → Presenter (Egress Firewall) → Response
```

### Middleware

Context-derivation middleware follows an onion model. Each layer can enrich the context, guard access, or short-circuit.

```typescript
const withUser = f.middleware(async (ctx) => ({
    user: await ctx.db.users.findUnique(ctx.userId),
}));
```

### Concurrency Guard

Per-tool concurrency limits with configurable queue behavior:

```typescript
{ concurrency: { maxConcurrent: 5, queueTimeout: 10_000 } }
```

### Egress Guard

Response size limits to prevent context window overflow:

```typescript
{ egress: { maxResponseBytes: 50_000 } }
```

### Mutation Serializer

Automatic serialization for destructive actions (non-`readOnly`). Prevents concurrent writes from corrupting state.

---

## State Sync — Epistemic Cache-Control

Glob-based cache policies for MCP's `tools/list_changed` notification. The `PolicyEngine` resolves the applicable policy per tool name with O(1) cached lookups.

```typescript
const layer = new StateSyncLayer({
    policies: [
        { match: 'billing.*', cacheControl: 'no-store' },
        { match: 'reports.*', cacheControl: 'max-age=300' },
    ],
    defaults: { cacheControl: 'no-store' },
});
```

> **Docs**: [mcp-fusion.vinkius.com/state-sync](https://mcp-fusion.vinkius.com/state-sync)

---

## Type-Safe Client

tRPC-inspired client with compile-time validation and autocomplete.

```typescript
// Server exports its router type
export type AppRouter = InferRouter<typeof registry>;

// Client consumes it — full autocomplete, zero runtime cost
import type { AppRouter } from './server';

const client = createFusionClient<AppRouter>(transport);
await client.execute('projects.create', { name: 'Vinkius V2' });
//                     ^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^
//                     autocomplete!       typed args!
```

Features: `executeBatch()` with parallel/sequential modes, client-side middleware, `throwOnError` with structured `FusionClientError`.

> **Docs**: [mcp-fusion.vinkius.com/client](https://mcp-fusion.vinkius.com/client)

---

## Prompt Engine

First-class MCP Prompts with Zod-typed arguments, hydration pipeline, and middleware.

```typescript
const greetPrompt = f.prompt('greet', {
    args: z.object({ name: z.string() }),
    handler: async (ctx, args) => ({
        messages: [PromptMessage.user(`Hello ${args.name}, welcome to the workspace.`)],
    }),
});
```

> **Docs**: [mcp-fusion.vinkius.com/prompts](https://mcp-fusion.vinkius.com/prompts)

---

## Ingestion Vectors

`fusion create` supports 5 ingestion vectors:

| Vector | What you get |
|---|---|
| `vanilla` | `autoDiscover()` file-based routing — drop a `.ts` in `src/tools/`, it's a tool. Zero config |
| `prisma` | Prisma schema + DB tool stubs + `mcp-fusion-prisma-gen` generator |
| `n8n` | n8n connector — `discoverWorkflows()` auto-registers webhook workflows as MCP tools |
| `openapi` | OpenAPI 3.x spec + `mcp-fusion-openapi-gen` code generator |
| `aws` | AWS connector — `createAwsConnector()` auto-discovers tagged Lambda & Step Functions as MCP tools |
| `oauth` | RFC 8628 Device Flow — `createAuthTool()` + `requireAuth()` middleware + secure token persistence |

```bash
npx fusion create my-api --vector prisma --transport sse
```

> **Docs**: [mcp-fusion.vinkius.com/introduction](https://mcp-fusion.vinkius.com/introduction)

---

## Adapters

Deploy your MCP server to serverless and edge environments with one function call:

| Package | What it does |
|---|---|
| [`@vinkius-core/mcp-fusion-vercel`](https://mcp-fusion.vinkius.com/vercel-adapter) | Deploy to Vercel Functions (Edge or Node.js) as an App Router route handler |
| [`@vinkius-core/mcp-fusion-cloudflare`](https://mcp-fusion.vinkius.com/cloudflare-adapter) | Deploy to Cloudflare Workers with zero polyfills and stateless JSON-RPC |

---
 
 ## Generators & Connectors
 
 First-party packages that generate MCP tools from external sources:
 
 | Package | What it does |
 |---|---|
 | [`mcp-fusion-openapi-gen`](https://mcp-fusion.vinkius.com/openapi-gen) | Generate typed MCP tools from any OpenAPI 3.x spec |
 | [`mcp-fusion-prisma-gen`](https://mcp-fusion.vinkius.com/prisma-gen) | Generate CRUD tools from your Prisma schema |
 | [`mcp-fusion-n8n`](https://mcp-fusion.vinkius.com/n8n-connector) | Auto-discover n8n webhook workflows and expose them as tools |
 | [`mcp-fusion-aws`](https://mcp-fusion.vinkius.com/aws-connector) | Auto-discover tagged AWS Lambda & Step Functions as grouped tools |
 | [`@vinkius-core/mcp-fusion-oauth`](https://mcp-fusion.vinkius.com/oauth) | RFC 8628 Device Flow authentication with `createAuthTool()` |
 
 ---
 
 ## Testing

The scaffolded project includes Vitest configuration with a system test:

```bash
npm test
```

The framework exposes `MVA_META_SYMBOL` for in-memory testing that bypasses the MCP transport layer — test your handlers directly without network overhead.

> **Docs**: [mcp-fusion.vinkius.com/testing](https://mcp-fusion.vinkius.com/testing)

---

## OAuth — Device Flow Authentication

`@vinkius-core/mcp-fusion-oauth` implements RFC 8628 (Device Authorization Grant) for MCP servers that need authenticated API access.

```bash
npm install @vinkius-core/mcp-fusion-oauth
```

```typescript
import { createAuthTool, requireAuth } from '@vinkius-core/mcp-fusion-oauth';

// Drop-in auth tool — login, complete, status, logout actions
const auth = createAuthTool({
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
    tokenManager: { configDir: '.myapp', envVar: 'MY_APP_TOKEN' },
});
registry.register(auth);

// Protect any tool with one line
const projects = f.tool('projects')
    .use(requireAuth({ extractToken: (ctx) => ctx.token }))
    .handler(async (ctx) => { /* authenticated */ });
```

| Component | What it does |
|---|---|
| `DeviceAuthenticator` | RFC 8628 device flow — `requestDeviceCode()` → `pollForToken()` with `slow_down` respect |
| `TokenManager` | Secure token persistence (0o600 perms), env-var priority, auto-expiry |
| `createAuthTool()` | Pre-built `GroupedToolBuilder` with login/complete/status/logout actions |
| `requireAuth()` | Middleware guard — rejects unauthenticated requests with structured `AUTH_REQUIRED` error |

> **Docs**: [mcp-fusion.vinkius.com/oauth](https://mcp-fusion.vinkius.com/oauth)

---

## Project Structure (scaffolded)

```
my-server/
├── src/
│   ├── fusion.ts          # initFusion<AppContext>()
│   ├── context.ts         # AppContext type + factory
│   ├── server.ts          # Bootstrap with autoDiscover
│   ├── tools/
│   │   └── system/
│   │       ├── health.ts  # Health check with Presenter
│   │       └── echo.ts    # Echo for connectivity testing
│   ├── presenters/
│   │   └── SystemPresenter.ts
│   ├── prompts/
│   │   └── greet.ts
│   └── middleware/
│       └── auth.ts
├── tests/
│   ├── setup.ts
│   └── system.test.ts
├── .cursor/mcp.json       # Pre-configured for Cursor
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Documentation

Full API reference, guides, and examples:

**[mcp-fusion.vinkius.com](https://mcp-fusion.vinkius.com/)**

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[Apache 2.0](LICENSE)
