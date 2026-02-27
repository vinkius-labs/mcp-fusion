<div align="center">

```
    __  __  ____ ____    _____ _   _ ____ ___ ___  _   _
   |  \/  |/ ___|  _ \  |  ___| | | / ___|_ _/ _ \| \ | |
   | |\/| | |   | |_) | | |_  | | | \___ \| | | | |  \| |
   | |  | | |___|  __/  |  _| | |_| |___) | | |_| | |\  |
   |_|  |_|\____|_|     |_|    \___/|____/___\___/|_| \_|
```

**AI-First DX for the Model Context Protocol.**
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
| **Tool definition** | Manual JSON schema + handler wiring | `f.query()` / `f.mutation()` — semantic verbs with typed input |
| **Output control** | Raw JSON dumped into LLM context | **Presenters** — schema-validated egress with system rules |
| **Context window overflow** | No protection | **Agent Limits** + **TOON encoding** (~40% fewer tokens) |
| **Self-healing errors** | `isError: true` with a string | Structured XML with error codes, recovery, and available actions |
| **Tool governance** | Hope nothing changed | **Capability Lockfile** — `mcp-fusion.lock` diffs in every PR |
| **Type safety** | None (client ↔ server) | **tRPC-style client** with `InferRouter<typeof registry>` |
| **MCP annotations** | Manual JSON | Auto-derived `readOnlyHint`, `destructiveHint` from semantic verbs |
| **Cache control** | Not addressed | `.invalidates('tasks.*')` / `.cached()` — fluent state sync |
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
import { initFusion, ToolRegistry, autoDiscover } from '@vinkius-core/mcp-fusion';

type AppContext = { db: PrismaClient };

const f = initFusion<AppContext>();

// Fluent API — semantic verbs with auto-derived MCP annotations
const listUsers = f.query('users.list')
    .describe('List users from the database')
    .input({ limit: f.number().min(1).max(100).optional().describe('Max results') })
    .resolve(async ({ input, ctx }) => {
        return ctx.db.user.findMany({ take: input.limit ?? 10 });
    });

// Mutations auto-generate destructiveHint + cache invalidation
const deleteUser = f.mutation('users.delete')
    .describe('Permanently remove a user')
    .destructive()
    .invalidates('users.*')
    .input({ id: f.string() })
    .resolve(async ({ input, ctx }) => {
        await ctx.db.user.delete({ where: { id: input.id } });
        return { deleted: input.id };
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

Inspired by tRPC. Call `initFusion<AppContext>()` once, and every `f.query()`, `f.mutation()`, `f.presenter()`, `f.prompt()`, `f.middleware()` inherits the context type. Zero generic repetition.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

type AppContext = { db: PrismaClient; user: User };
const f = initFusion<AppContext>();

// Every factory method is now typed to AppContext
const query    = f.query('users.list').resolve(...);
const mutation = f.mutation('users.delete').resolve(...);
const presenter = f.presenter({ ... });
const middleware = f.middleware(async (ctx) => ({ ... }));
const registry  = f.registry();
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
import { createPresenter, t, suggest, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
    .schema({
        id:           t.string,
        amount_cents: t.number.describe('CENTS — divide by 100'),
        status:       t.enum('draft', 'paid', 'overdue'),
    })
    .rules(['CRITICAL: amount_cents is in CENTS. Divide by 100 for display.'])
    .ui((inv) => [
        ui.table(['Field', 'Value'], [
            ['Amount', `$${(inv.amount_cents / 100).toFixed(2)}`],
            ['Status', inv.status === 'paid' ? '✅ Paid' : '⚠️ Pending'],
        ]),
    ])
    .suggest((inv) => [
        suggest('invoices.get', 'View invoice details'),
        inv.status === 'overdue'
            ? suggest('billing.remind', 'Send collection reminder')
            : null,
    ].filter(Boolean))
    .limit(50);
```

Key capabilities:
- **`t` Namespace**: Schema helpers (`t.string`, `t.enum(...)`, `t.array(...)`) — no Zod import needed
- **Egress Firewall**: Only declared fields reach the LLM, everything else is stripped
- **System Rules**: JIT directives that travel with the data (`.rules()` / `.systemRules()`)
- **Agent Limits**: `.limit(50)` shorthand or `.agentLimit(50, onTruncate)` for custom messages
- **UI Blocks**: `ui.echarts()`, `ui.mermaid()`, `ui.table()`, `ui.markdown()`
- **Action Suggestions**: `suggest(tool, reason)` helper for HATEOAS-style agent guidance
- **Embeds**: Relational Presenter composition for DRY nested data

> **Docs**: [mcp-fusion.vinkius.com/presenter](https://mcp-fusion.vinkius.com/presenter)

### Self-Healing Errors

Structured error responses with error codes, recovery instructions, and available actions — so the LLM self-corrects instead of hallucinating or giving up.

```typescript
return f.error('NOT_FOUND', `Project "${id}" does not exist.`)
    .suggest('Call projects.list first to get valid IDs.')
    .actions('projects.list');
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

Per-tool concurrency limits with configurable queue behavior. Prevents "thundering herd" scenarios.

```typescript
f.mutation('billing.process')
    .concurrency({ maxActive: 5, maxQueue: 20 })
    .resolve(...)
```

### Egress Guard

Response size limits to prevent context window overflow or OOM.

```typescript
f.query('logs.search')
    .egress(2 * 1024 * 1024) // 2MB limit
    .resolve(...)
```

### Mutation Serializer

Automatic serialization for destructive actions (non-`readOnly`). Prevents concurrent writes from corrupting state.

---

## State Sync — Epistemic Cache-Control

Two approaches — fluent (per-tool) or centralized (global policies). Both work together.

### Fluent (recommended)

```typescript
// Declare directly on the tool — auto-collected by the framework
f.mutation('tasks.update')
    .invalidates('tasks.*', 'sprints.*')     // cache invalidation on success
    .resolve(async ({ input, ctx }) => { ... });

f.query('countries.list')
    .cached()                                 // immutable — LLM sees [Cache-Control: immutable]
    .resolve(async ({ ctx }) => { ... });
```

### Centralized (for complex policies)

```typescript
const layer = f.stateSync()
    .defaults(p => p.stale())                    // volatile by default
    .policy('billing.*', p => p.stale())         // explicitly volatile
    .policy('countries.*', p => p.cached())      // explicitly immutable
    .policy('tasks.update', p => p.invalidates('tasks.*'))
    .build();

registry.attachToServer(server, { stateSync: layer });
```

> **Docs**: [mcp-fusion.vinkius.com/state-sync](https://mcp-fusion.vinkius.com/state-sync)

---

## Type-Safe Client

tRPC-inspired client with compile-time validation and autocomplete.

```typescript
export type AppRouter = InferRouter<typeof registry>;

const client = createFusionClient<AppRouter>(transport);

await client.projects.create({ name: 'Vinkius V2' });
await client.billing.refund({ invoice_id: 'inv_123', amount: 50 });
```

Features: batch execution, client-side middleware, `throwOnError` with structured `FusionClientError`.

> **Docs**: [mcp-fusion.vinkius.com/client](https://mcp-fusion.vinkius.com/client)

---

## Prompt Engine

First-class MCP Prompts with typed arguments, hydration pipeline, and middleware.

```typescript
const greetPrompt = f.prompt('greet')
    .describe('Greet a user by name')
    .input({ name: f.string() })
    .handler(async (ctx, { name }) => ({
        messages: [PromptMessage.user(`Hello ${name}, welcome to the workspace.`)],
    }));
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

const auth = createAuthTool({
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
    tokenManager: { configDir: '.myapp', envVar: 'MY_APP_TOKEN' },
});
registry.register(auth);

const listProjects = f.query('projects.list')
    .use(requireAuth({ extractToken: (ctx) => ctx.token }))
    .resolve(async ({ ctx }) => { /* ctx.token available */ });
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
