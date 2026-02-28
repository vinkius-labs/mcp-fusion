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


[![First Release](https://img.shields.io/badge/First%20Release-Feb%2012%2C%202026-blue)](https://github.com/vinkius-labs/mcp-fusion/releases)
[![Downloads](https://img.shields.io/npm/dt/@vinkius-core/mcp-fusion)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion) [![Weekly Downloads](https://img.shields.io/npm/dw/@vinkius-core/mcp-fusion)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion) [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion) [![Package Size](https://img.shields.io/bundlephobia/minzip/@vinkius-core/mcp-fusion)](https://bundlephobia.com/package/@vinkius-core/mcp-fusion) [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/) [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/) [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE) [![Built by Vinkius](https://img.shields.io/badge/Built%20by-Vinkius-%23000000)](https://vinkius.com)


[Quick Start](#quick-start) · [Architecture](#architecture) · [Documentation](https://mcp-fusion.vinkius.com/)

</div>

---

MCP Fusion is an architecture layer for the Model Context Protocol. It separates three concerns that every raw MCP server mixes into a single handler: who can call what (middleware pipeline), what the agent sees (Presenter with Zod schema), and whether the surface is trustworthy (governance lockfile + HMAC attestation).

This separation is the **MVA (Model-View-Agent)** pattern. The handler returns raw data (Model). The Presenter shapes perception (View). The middleware governs access (Agent). The resulting server works with any MCP client — Cursor, Claude Desktop, Claude Code, Windsurf, Cline, and VS Code with GitHub Copilot.

```
Model (Zod Schema) → View (Presenter) → Agent (LLM)
   validates            perceives          acts
```

### 🔒 Zero-Trust Sandbox Engine — Computation Delegation via `isolated-vm`

Every MCP server has the same unspoken liability: **the LLM wants to run logic on your data.** Without a sandbox, you have two options — both unacceptable. You either ship raw data to the model (egressing GBs over the wire, violating data residency, and paying per-token for noise), or you `eval()` LLM-generated strings on your production process and pray.

MCP Fusion eliminates both. The framework ships a **V8 Isolate sandbox** powered by [`isolated-vm`](https://github.com/laverdet/isolated-vm) — the same library used by Temporal for deterministic workflow replay. The LLM sends a JavaScript function as a string. The engine executes it in a **sealed V8 instance with zero access** to `process`, `require`, `fs`, `net`, `child_process`, `globalThis`, or any Node.js API. The data stays on the server. Only the computed result crosses the boundary.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LLM sends:  (data) => data.filter(d => d.risk > 90)              │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Guard    │──▸│ Compile  │──▸│ Execute  │──▸│ Result Only  │    │
│  │ (syntax) │   │ (V8)     │   │ (sealed) │   │ (JSON out)   │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────┘    │
│                                                                     │
│  ✘ No process  ✘ No require  ✘ No fs  ✘ No net  ✘ No eval escape  │
│  ✔ Timeout kill  ✔ Memory cap  ✔ Output limit  ✔ Isolate recovery  │
└─────────────────────────────────────────────────────────────────────┘
```

**V8 Engineering guarantees enforced at the framework level:**

- **One Isolate per engine, new Context per call** — no state leaks between executions. Each call gets a pristine, empty global scope.
- **Mandatory C++ pointer release** — `ExternalCopy`, `Script`, and `Context` are deallocated in `try/finally` blocks on every code path: success, runtime error, timeout, and OOM. No dangling native memory.
- **Async-only execution** — `script.run()`, never `runSync()`. The Node.js event loop is never blocked, even if the sandboxed code runs for the full timeout window.
- **Automatic Isolate recovery** — if a script triggers an Out-Of-Memory kill, the engine detects `isDisposed`, discards the dead Isolate, and creates a fresh one on the next call. Zero manual intervention.

```typescript
// One line turns any tool into a sandboxed computation endpoint
f.query('data.compute')
    .sandboxed({ timeout: 3000, memoryLimit: 64 })
    .handle(async (input, ctx) => { /* ... */ });
```

> **The inversion:** instead of sending your data to the model, the model sends its logic to your data. Your MCP server becomes a **serverless compute boundary** — air-gapped, resource-limited, and self-healing.

> **Docs**: [mcp-fusion.vinkius.com/sandbox](https://mcp-fusion.vinkius.com/sandbox)

---

## Quick Start

```bash
npx fusion create my-server
```

```
  Project name?  (my-mcp-server) > my-server
  Transport?     [stdio, sse]    > stdio
  Vector?        [vanilla, prisma, n8n, openapi, aws, oauth] > vanilla
  Include testing?               > yes

  Scaffolding project -- 14 files (6ms)
  Installing dependencies (4.2s)

  my-server is ready!

  Next steps:
    $ cd my-server
    $ npm run dev
    $ npm test

  Cursor: .cursor/mcp.json is pre-configured -- open in Cursor and go.
```

The wizard generates a fully configured MCP server: file-based routing, Presenters, Prompts, middleware, Cursor integration, testing — 14 files in 6ms. Use `--yes` to skip prompts with defaults.

### Manual installation

```bash
npm install @vinkius-core/mcp-fusion
```

> **Full setup guide**: [mcp-fusion.vinkius.com/quickstart](https://mcp-fusion.vinkius.com/quickstart)

---

## Fluent API — Semantic Verbs with Type-Chaining

The primary tool definition surface. Three semantic verbs set behavioral defaults at creation:

| Verb | Default Annotation | Use Case |
|---|---|---|
| `f.query(name)` | `readOnlyHint: true` | Read operations — no side effects |
| `f.mutation(name)` | `destructiveHint: true` | Write operations — irreversible |
| `f.action(name)` | *neutral* | Updates, syncs — no assumptions |

Every verb returns a `FluentToolBuilder`. Each `.with*()` call narrows the TypeScript generic `TInput` — the IDE provides full autocomplete inside `.handle()` without any manual interface declaration.

```typescript
import { f } from './fusion.js';
import { SystemPresenter } from './presenters/SystemPresenter.js';

// f.query() → readOnlyHint: true, auto-derived MCP annotations
export default f.query('system.health')
    .describe('Returns server operational status')
    .returns(SystemPresenter)
    .handle(async (_, ctx) => ({
        status: 'healthy',
        uptime: process.uptime(),
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    }));
    // ↑ Raw data returned. Presenter validates, strips undeclared fields, renders UI.
    //   .handle() auto-wraps with success() — no boilerplate.
```

```typescript
// f.mutation() → destructiveHint: true, enables cache invalidation
export default f.mutation('users.delete')
    .describe('Permanently remove a user account')
    .withString('userId', 'The user ID to delete')
    .destructive()
    .invalidates('users.*')
    .use(withAuth)
    .handle(async (input, ctx) => {
        // input.userId: string — fully typed, zero manual interfaces
        await ctx.db.user.delete({ where: { id: input.userId } });
        return { deleted: input.userId };
    });
```

### Parameter Methods

Each `with*()` call adds to the accumulated `TInput` type:

| Method | Adds to Input Type |
|---|---|
| `.withString(name, desc?)` | `Record<K, string>` |
| `.withOptionalString(name, desc?)` | `Partial<Record<K, string>>` |
| `.withNumber(name, desc?)` | `Record<K, number>` |
| `.withOptionalNumber(name, desc?)` | `Partial<Record<K, number>>` |
| `.withBoolean(name, desc?)` | `Record<K, boolean>` |
| `.withOptionalBoolean(name, desc?)` | `Partial<Record<K, boolean>>` |
| `.withEnum(name, values, desc?)` | `Record<K, V>` (literal union) |
| `.withOptionalEnum(name, values, desc?)` | `Partial<Record<K, V>>` |
| `.withArray(name, itemType, desc?)` | `Record<K, T[]>` |
| `.withOptionalArray(name, itemType, desc?)` | `Partial<Record<K, T[]>>` |

### Configuration Methods

| Method | Effect |
|---|---|
| `.describe(text)` | Tool description — shown to the LLM |
| `.instructions(text)` | Injected as `[INSTRUCTIONS]` in the tool description |
| `.use(mw)` | tRPC-style context derivation — enriches `TCtx` |
| `.returns(presenter)` | Binds MVA Presenter for egress validation |
| `.tags(...tags)` | Capability labels for selective tool exposure |
| `.readOnly()` / `.destructive()` / `.idempotent()` | Semantic annotation overrides |
| `.invalidates(...patterns)` | Cache invalidation globs on success |
| `.cached()` / `.stale()` | Immutable or volatile cache-control |
| `.concurrency({ maxActive, maxQueue })` | Semaphore + queue guard |
| `.egress(bytes)` | Maximum response payload size |
| `.handle(handler)` | **Terminal** — sets handler, builds tool |

> **Docs**: [mcp-fusion.vinkius.com/building-tools](https://mcp-fusion.vinkius.com/building-tools)

---

## `initFusion<T>()` — Context Initialization

Inspired by tRPC. Call `initFusion<AppContext>()` once, and every factory method inherits the context type. Zero generic repetition across the codebase.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

type AppContext = { db: PrismaClient; user: User };
const f = initFusion<AppContext>();

// Every factory is now typed to AppContext
const query      = f.query('users.list').handle(...);
const mutation   = f.mutation('users.delete').handle(...);
const middleware  = f.middleware(async (ctx) => ({ ... }));
const presenter  = f.presenter({ ... });
const prompt     = f.prompt('greet').handler(...);
const registry   = f.registry();
```

> **Docs**: [mcp-fusion.vinkius.com/introduction#in-practice](https://mcp-fusion.vinkius.com/introduction#in-practice)

---

## `f.middleware()` — Context Derivation

Each middleware layer returns derived context that is merged into the downstream `ctx`. No `next()` call — the framework chains automatically.

```typescript
export const withAuth = f.middleware(async (ctx) => {
    if (ctx.role === 'GUEST') {
        throw f.error('FORBIDDEN', 'Authentication required');
    }
    return { verified: true, checkedAt: Date.now() };
});

// Inline on any tool via .use()
export default f.query('billing.invoices')
    .use(withAuth)
    .handle(async (_, ctx) => {
        // ctx now has: db, user, role, verified, checkedAt
    });
```

The `.use()` method on `FluentToolBuilder` follows the tRPC-style `{ ctx, next }` signature for multi-layer composition:

```typescript
f.mutation('users.delete')
    .use(async ({ ctx, next }) => {
        const admin = await requireAdmin(ctx.headers);
        return next({ ...ctx, adminUser: admin });
    })
    .use(async ({ ctx, next }) => {
        return next({ ...ctx, auditLog: createAuditLog(ctx.adminUser) });
    })
    .withString('id', 'User ID to delete')
    .handle(async (input, ctx) => {
        // ctx.adminUser and ctx.auditLog are typed — zero casting
        ctx.auditLog.record(`${ctx.adminUser.name} deleting ${input.id}`);
        await ctx.db.users.delete({ where: { id: input.id } });
    });
```

---

## `f.error()` — Self-Healing Errors

Structured error responses encoded as XML with error codes, recovery instructions, and available actions. The LLM receives enough context to self-correct instead of hallucinating or retrying blindly.

```typescript
const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
if (!project) {
    return f.error('NOT_FOUND', `Project "${input.id}" not found`)
        .suggest('Check the ID. Use projects.list to see valid IDs.')
        .actions('projects.list', 'projects.search')
        .details({ searched_id: input.id })
        .retryAfter(0);
}
```

15 canonical error codes: `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `TIMEOUT`, `INTERNAL_ERROR`, `DEPRECATED`, `MISSING_REQUIRED_FIELD`, `UNKNOWN_ACTION`, `MISSING_DISCRIMINATOR`, `UNKNOWN_TOOL`, `SERVER_BUSY`, `AUTH_REQUIRED` — plus any custom string.

Three severity levels: `warning` (advisory, `isError: false`), `error` (recoverable, default), `critical` (system-level, requires escalation).

> **Docs**: [mcp-fusion.vinkius.com/error-handling](https://mcp-fusion.vinkius.com/error-handling)

---

## Presenters — Egress Firewall and Perception Layer

The Presenter is the domain-level egress contract between your handler and the wire. The handler returns raw data. The Presenter validates through a Zod schema (stripping undeclared fields in RAM), injects JIT domain rules, renders UI server-side, truncates with guidance, and suggests next actions.

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
            ['Status', inv.status],
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

| Layer | Mechanism | What it prevents |
|---|---|---|
| Egress Firewall | `.parse()` strips undeclared fields in RAM | PII, password hashes, internal IDs reaching the LLM |
| JIT System Rules | Rules travel with data, not in the global prompt | Wasted tokens on irrelevant instructions |
| Server-Rendered UI | `ui.echarts()`, `ui.mermaid()`, `ui.table()` | Hallucinated charts and diagrams |
| Cognitive Guardrails | `.agentLimit()` truncates + guidance message | Context window overflow, OOM kills |
| Action Affordances | `.suggestActions()` with HATEOAS-style links | Hallucinated tool names and arguments |
| Relational Composition | `.embed('client', ClientPresenter)` | Duplicated presenter logic across tools |

> **Docs**: [mcp-fusion.vinkius.com/presenter](https://mcp-fusion.vinkius.com/presenter)

---

## `autoDiscover()` — File-based Routing

Drop a file in `src/tools/`, it becomes a tool. Tool names are derived from the directory structure. No central import file. No merge conflicts in a multi-developer project.

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

---

## State Sync — Epistemic Cache-Control

RFC 7234-inspired cache-control signals for LLM agents. Prevents temporal blindness — the agent knows whether data it already has is still valid.

Two approaches — fluent (per-tool) or centralized (global policies). Both compose.

```typescript
// Fluent — declared on the tool
f.mutation('tasks.update')
    .invalidates('tasks.*', 'sprints.*')
    .handle(async (input, ctx) => { ... });

f.query('countries.list')
    .cached()    // immutable — agent sees [Cache-Control: immutable]
    .handle(async (ctx) => { ... });

// Centralized — for cross-cutting policies
const layer = f.stateSync()
    .defaults(p => p.stale())
    .policy('billing.*', p => p.stale())
    .policy('countries.*', p => p.cached())
    .policy('tasks.update', p => p.invalidates('tasks.*', 'sprints.*'))
    .onInvalidation(event => metrics.increment('cache.invalidations', { tool: event.causedBy }))
    .notificationSink(n => server.notification(n))
    .build();
```

> **Docs**: [mcp-fusion.vinkius.com/state-sync](https://mcp-fusion.vinkius.com/state-sync)

---

## TOON Encoding — Token Reduction

`toonSuccess()` encodes array data using TOON (Token-Oriented Object Notation) — a pipe-delimited tabular format. Benchmarks show 40-50% fewer tokens compared to `JSON.stringify()` on typical dataset responses.

```typescript
// JSON (~200 tokens)
return success(users);

// TOON (~120 tokens) — same data, different encoding
return toonSuccess(users);
// → "id|name|email\n1|Alice|alice@co.io\n2|Bob|bob@co.io"
```

> **Docs**: [mcp-fusion.vinkius.com/performance](https://mcp-fusion.vinkius.com/performance)

---

## Type-Safe Client

tRPC-inspired client with compile-time route validation. The `InferRouter` utility extracts the full tool topology from the registry type, producing autocomplete for tool names, input shapes, and response types.

```typescript
export type AppRouter = InferRouter<typeof registry>;

const client = createFusionClient<AppRouter>(transport);

await client.projects.create({ name: 'My Project' });
await client.billing.refund({ invoice_id: 'inv_123', amount: 50 });
```

Features: batch execution, client-side middleware, `throwOnError` with structured `FusionClientError`.

> **Docs**: [mcp-fusion.vinkius.com/client](https://mcp-fusion.vinkius.com/client)

---

## Prompt Engine

First-class MCP Prompts with Zod-typed arguments, hydration pipeline, and middleware. Prompts share the same `initFusion<T>()` context as tools — same type, same middleware chain.

```typescript
const greetPrompt = f.prompt('greet')
    .describe('Greet a user by name')
    .input({ name: f.string() })
    .handler(async (ctx, { name }) => ({
        messages: [PromptMessage.user(`Hello ${name}, welcome.`)],
    }));
```

Prompts can reference Presenters via `PromptMessage.fromView()` — the same entity representation used in tool responses feeds the prompt, eliminating divergence between what the agent observes and what it is instructed about.

> **Docs**: [mcp-fusion.vinkius.com/prompts](https://mcp-fusion.vinkius.com/prompts)

---

## Governance Suite

An 8-module introspection layer for behavioral accountability.

### Capability Lockfile — `mcp-fusion.lock`

Like `package-lock.json` for your behavioral surface. Captures every tool's contract, egress schema digest, system rules fingerprint, entitlements, and token economics in a deterministic, git-diffable file.

```bash
fusion lock         # Generate or update
fusion lock --check # CI gate — fail if lockfile is stale
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

### Contract Diff Engine

Semantic diffing between two contract snapshots. Classifies each change as `BREAKING`, `RISKY`, `SAFE`, or `COSMETIC` based on its impact on LLM behavior.

### Crypto Attestation

HMAC-SHA256 signing for server digest verification. At startup, the framework re-computes the behavioral digest and compares it against the expected (signed) digest. Mismatch → fail-fast with `AttestationError`. Uses Web Crypto API — works on Node.js 18+, Cloudflare Workers, Deno, Bun.

### Semantic Probing — LLM-as-a-Judge

Detects semantic drift — when handler output changes meaning even though schema and rules remain structurally identical. Uses a pluggable LLM adapter to evaluate baseline vs. current output. Drift levels: `none`, `low`, `medium`, `high`.

### Entitlement Scanner

Static analysis of handler source code to detect I/O capabilities (filesystem, network, subprocess, crypto, code evaluation). Results are captured in the lockfile for blast-radius auditing.

> **Docs**: [mcp-fusion.vinkius.com/governance](https://mcp-fusion.vinkius.com/governance/capability-lockfile)

---

## Execution Pipeline

Every tool call flows through a deterministic pipeline:

```
Request → Schema Validation → Middleware Chain → Handler → Presenter (Egress Firewall) → Response
```

Built-in runtime guards:

| Guard | Mechanism |
|---|---|
| Concurrency Limiter | Per-tool semaphore + bounded queue. Excess rejected with `SERVER_BUSY`. |
| Egress Guard | Response size cap. Truncation + system intervention on overflow. |
| Mutation Serializer | Automatic serialization for destructive actions (non-`readOnly`). |
| Intent Mutex | Anti-race condition guard for concurrent writes to the same entity. |

---

## Ingestion Vectors

`fusion create` supports 6 ingestion vectors:

| Vector | What it generates |
|---|---|
| `vanilla` | `autoDiscover()` file-based routing — zero config |
| `prisma` | Prisma schema + DB tool stubs + `@vinkius-core/mcp-fusion-prisma-gen` generator |
| `n8n` | n8n connector — `discoverWorkflows()` auto-registers webhook workflows as MCP tools |
| `openapi` | OpenAPI 3.x spec + code generator for typed tools |
| `aws` | AWS connector — auto-discovers tagged Lambda and Step Functions as MCP tools |
| `oauth` | RFC 8628 Device Flow — `createAuthTool()` + `requireAuth()` middleware + secure token persistence |

```bash
npx fusion create my-api --vector prisma --transport sse
```

---

## Adapters

| Package | Target |
|---|---|
| [`@vinkius-core/mcp-fusion-vercel`](https://mcp-fusion.vinkius.com/vercel-adapter) | Vercel Functions (Edge or Node.js) as an App Router route handler |
| [`@vinkius-core/mcp-fusion-cloudflare`](https://mcp-fusion.vinkius.com/cloudflare-adapter) | Cloudflare Workers with zero polyfills and stateless JSON-RPC |

---

## Generators and Connectors

| Package | Source |
|---|---|
| [`@vinkius-core/mcp-fusion-openapi-gen`](https://mcp-fusion.vinkius.com/openapi-gen) | Generate typed MCP tools from any OpenAPI 3.x spec |
| [`@vinkius-core/mcp-fusion-prisma-gen`](https://mcp-fusion.vinkius.com/prisma-gen) | Generate CRUD tools from your Prisma schema |
| [`@vinkius-core/mcp-fusion-n8n`](https://mcp-fusion.vinkius.com/n8n-connector) | Auto-discover n8n webhook workflows and expose them as tools |
| [`@vinkius-core/mcp-fusion-aws`](https://mcp-fusion.vinkius.com/aws-connector) | Auto-discover tagged AWS Lambda and Step Functions as grouped tools |
| [`@vinkius-core/mcp-fusion-oauth`](https://mcp-fusion.vinkius.com/oauth) | RFC 8628 Device Flow authentication with `createAuthTool()` |

---

## Testing

In-memory pipeline testing without MCP transport overhead. Tests hit the execution pipeline directly — schema validation, middleware, handler, presenter — without network roundtrips.

```bash
npm test
```

```typescript
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';

const tester = createFusionTester(registry, {
    contextFactory: () => ({ role: 'ADMIN', tenantId: 'test' }),
});

const result = await tester.callAction('system', 'health');
expect(result.isError).toBe(false);
expect(result.data).toHaveProperty('status');
```

The scaffolded project includes Vitest configuration with a system test. `npm test` works out of the box.

> **Docs**: [mcp-fusion.vinkius.com/testing](https://mcp-fusion.vinkius.com/testing)

---

## Architecture

### Core modules

| Module | Purpose |
|---|---|
| `core/` | Fluent API builders (`FluentToolBuilder`, `FluentRouter`, `ErrorBuilder`), registry, execution pipeline, middleware, schema validation |
| `presenter/` | MVA View Layer — Zod-validated egress, JIT system rules, UI blocks, agent limits, relational composition |
| `prompt/` | Prompt Engine — `FluentPromptBuilder`, typed args, hydration pipeline, `PromptMessage.fromView()` bridge |
| `server/` | `autoDiscover()` file-based routing + `createDevServer()` HMR with `tools/list_changed` notifications |
| `client/` | tRPC-style `createFusionClient<AppRouter>()` with compile-time route validation |
| `state-sync/` | Epistemic cache-control — `StateSyncBuilder`, glob-based `SyncPolicy`, `PolicyEngine` with overlap detection |
| `introspection/` | Governance — `ToolContract`, `ContractDiff`, `BehaviorDigest`, `CapabilityLockfile`, `CryptoAttestation`, `TokenEconomics`, `EntitlementScanner`, `SemanticProbe` |
| `observability/` | `GovernanceObserver` — DebugEvent emission + OpenTelemetry-compatible tracing spans |
| `cli/` | `fusion create` scaffolding + `fusion lock` / `fusion lock --check` capability lockfile |

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
│   │       ├── health.ts  # f.query() with Presenter
│   │       └── echo.ts    # f.query() with .withString()
│   ├── presenters/
│   │   └── SystemPresenter.ts
│   ├── prompts/
│   │   └── greet.ts
│   └── middleware/
│       └── auth.ts        # f.middleware() RBAC guard
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
