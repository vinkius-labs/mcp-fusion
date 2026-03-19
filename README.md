<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/86ae1b28-a938-4e12-af29-bfc60a55dbe8" >
  <img src="https://github.com/user-attachments/assets/86ae1b28-a938-4e12-af29-bfc60a55dbe8" style="border-radius:8px;background:#000000;padding:10px;border:1px solid #414141;"  alt="Vurb.ts">
</picture>

**The TypeScript Framework for MCP Servers.**<br>
Type-safe tools, structured AI perception, and built-in security. Deploy once — every AI assistant connects instantly.

[![npm version](https://img.shields.io/npm/v/@vurb/core.svg?color=0ea5e9)](https://www.npmjs.com/package/@vurb/core)
[![Downloads](https://img.shields.io/npm/dw/@vurb/core)](https://www.npmjs.com/package/@vurb/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP Standard](https://img.shields.io/badge/MCP-Standard-purple)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache_2.0-green)](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)

[Documentation](https://vurb.vinkius.com/) · [Quick Start](https://vurb.vinkius.com/quickstart-lightspeed) · [API Reference](https://vurb.vinkius.com/api/)

</div>

---

## Get Started in 5 Seconds

```bash
vurb create my-server
```

Open it in Cursor, Claude Code, or GitHub Copilot and prompt:

```
→  "Build an MCP server for patient records with Prisma.
    Redact SSN and diagnosis from LLM output. Add an FSM
    that gates discharge tools until attending physician signs off."
```

The agent reads the `SKILL.md` and writes the entire server. First pass — no corrections.

One command. Your MCP server is live on **Vinkius Edge**, **Vercel Functions**, or **Cloudflare Workers**. 

```bash
vurb deploy
```

A production-ready MCP server with file-based routing, Presenters, middleware, tests, and pre-configured connections for **Cursor**, **Claude Desktop**, **Claude Code**, **Windsurf**, **Cline**, and **VS Code + GitHub Copilot**.

---

## Table of Contents

- [Zero Learning Curve — Ship a SKILL.md, Not a Tutorial](#zero-learning-curve--ship-a-skillmd-not-a-tutorial)
- [Deploy Targets](#deploy-targets)
- [Why Vurb.ts Exists](#why-vurb-ts-exists)
- [The MVA Solution](#the-mva-solution)
- [Before vs. After](#before-vs-after)
- [Architecture](#architecture)
  - [Egress Firewall — Schema as Security Boundary](#egress-firewall--schema-as-security-boundary)
  - [DLP Compliance Engine — PII Redaction](#dlp-compliance-engine--pii-redaction)
  - [8 Anti-Hallucination Mechanisms](#8-anti-hallucination-mechanisms)
  - [FSM State Gate — Temporal Anti-Hallucination](#fsm-state-gate--temporal-anti-hallucination)
  - [Zero-Trust Sandbox — Computation Delegation](#zero-trust-sandbox--computation-delegation)
  - [State Sync — Temporal Awareness for Agents](#state-sync--temporal-awareness-for-agents)
  - [Prompt Engine — Server-Side Templates](#prompt-engine--server-side-templates)
  - [Agent Skills — Progressive Instruction Distribution](#agent-skills--progressive-instruction-distribution)
  - [Fluent API — Semantic Verbs & Chainable Builders](#fluent-api--semantic-verbs--chainable-builders)
  - [Middleware — Pre-Compiled, Zero-Allocation](#middleware--pre-compiled-zero-allocation)
  - [Fluent Router — Grouped Tooling](#fluent-router--grouped-tooling)
  - [tRPC-Style Client — Compile-Time Route Validation](#trpc-style-client--compile-time-route-validation)
  - [Self-Healing Errors](#self-healing-errors)
  - [Capability Governance — Cryptographic Surface Integrity](#capability-governance--cryptographic-surface-integrity)
- [Code Generators](#code-generators)
  - [OpenAPI → MCP in One Command](#openapi--mcp-in-one-command)
  - [Prisma → MCP with Field-Level Security](#prisma--mcp-with-field-level-security)
  - [n8n Workflows → MCP Tools](#n8n-workflows--mcp-tools)
- [Inspector — Real-Time Dashboard](#inspector--real-time-dashboard)
- [Testing — Full Pipeline in RAM](#testing--full-pipeline-in-ram)
- [Deploy Anywhere](#deploy-anywhere)
  - [Vinkius Edge](#vinkius-edge)
  - [Vercel Functions](#vercel-functions)
  - [Cloudflare Workers](#cloudflare-workers)
- [Ecosystem](#ecosystem)
  - [Adapters](#adapters)
  - [Generators & Connectors](#generators--connectors)
  - [Security & Auth](#security--auth)
  - [Developer Experience](#developer-experience)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Zero Learning Curve — Ship a SKILL.md, Not a Tutorial

Every framework you've adopted followed the same loop: read the docs, study the conventions, hit an edge case, search GitHub issues, re-read the docs. Weeks before your first production PR. Your AI coding agent does the same — it hallucinates Express patterns into your Hono project because it has no formal contract to work from.

Vurb.ts ships a **[SKILL.md](https://agentskills.io)** — a machine-readable architectural contract that your AI agent ingests before generating a single line. Not a tutorial. Not a "getting started guide" the LLM will paraphrase loosely. A **typed specification**: every Fluent API method, every builder chain, every Presenter composition rule, every middleware signature, every file-based routing convention. The agent doesn't approximate — it compiles against the spec.

The agent reads `SKILL.md` and produces:

```typescript
// src/tools/patients/discharge.ts — generated by your AI agent
const PatientPresenter = createPresenter('Patient')
    .schema({ id: t.string, name: t.string, ssn: t.string, diagnosis: t.string })
    .redactPII(['ssn', 'diagnosis'])
    .rules(['HIPAA: diagnosis visible in UI blocks but REDACTED in LLM output']);

const gate = f.fsm({
    id: 'discharge', initial: 'admitted',
    states: {
        admitted:   { on: { SIGN_OFF: 'cleared' } },
        cleared:    { on: { DISCHARGE: 'discharged' } },
        discharged: { type: 'final' },
    },
});

export default f.mutation('patients.discharge')
    .describe('Discharge a patient')
    .bindState('cleared', 'DISCHARGE')
    .returns(PatientPresenter)
    .handle(async (input, ctx) => ctx.db.patients.update({
        where: { id: input.id }, data: { status: 'discharged' },
    }));
```

Correct Presenter with `.redactPII()`. FSM gating that makes `patients.discharge` invisible until sign-off. File-based routing. Typed handler. **First pass — no corrections.**

This works on Cursor, Claude Code, GitHub Copilot, Windsurf, Cline — any agent that can read a file. The `SKILL.md` is the single source of truth: the agent doesn't need to have been trained on Vurb.ts, it just needs to read the spec.

> **You don't learn Vurb.ts. You don't teach your agent Vurb.ts.** You hand it a 400-line contract. It writes the server. You review the PR.

---

### Scaffold Options

```bash
vurb create my-server
```

```
  Project name?  › my-server
  Transport?     › http
  Vector?        › vanilla

  ● Scaffolding project — 14 files (6ms)
  ● Installing dependencies...
  ✔ Done — vurb dev to start
```

Choose a vector to scaffold exactly the project you need:

| Vector | What it scaffolds |
|---|---|
| `vanilla` | `autoDiscover()` file-based routing. Zero external deps |
| `prisma` | Prisma schema + CRUD tools with field-level security |
| `n8n` | n8n workflow bridge — auto-discover webhooks as tools |
| `openapi` | OpenAPI 3.x / Swagger 2.0 → full MVA tool generation |
| `oauth` | RFC 8628 Device Flow authentication |

### Deploy Targets

Choose where your server runs with `--target`:

| Target | Runtime | Deploy with |
|---|---|---|
| `node` (default) | Node.js — Streamable HTTP | [`vurb deploy`](#vinkius-edge) |
| `vercel` | Next.js App Router — Vercel Functions | [`vercel deploy`](#vercel-functions) |
| `cloudflare` | Cloudflare Workers — V8 isolates | [`wrangler deploy`](#cloudflare-workers) |

```bash
# Node.js (default) — Streamable HTTP, deploy to Vinkius Edge
vurb create my-server --yes

# Vercel Functions — Next.js App Router + @vurb/vercel adapter
vurb create my-server --target vercel --yes

# Cloudflare Workers — wrangler + @vurb/cloudflare adapter
vurb create my-server --target cloudflare --yes
```

Each target scaffolds the correct project structure, adapter imports, config files (`next.config.ts`, `wrangler.toml`), and deploy instructions. Same Fluent API, same Presenters, same middleware — only the transport layer changes.

```bash
# Database-driven server with Presenter egress firewall
vurb create my-api --vector prisma --transport http --yes

# Bridge your n8n workflows to any MCP client
vurb create ops-bridge --vector n8n --yes

# REST API → MCP in one command
vurb create petstore --vector openapi --yes
```

Drop a file in `src/tools/`, restart — it's a live MCP tool. No central import file, no merge conflicts:

```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
├── users/
│   ├── list.ts         → users.list
│   └── ban.ts          → users.ban
└── system/
    └── health.ts       → system.health
```

---

## Why Vurb.ts Exists

Every raw MCP server does the same thing: `JSON.stringify()` the database result and ship it to the LLM. Three catastrophic consequences:

```typescript
// What every MCP tutorial teaches
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === 'get_invoice') {
        const invoice = await db.invoices.findUnique(args.id);
        return { content: [{ type: 'text', text: JSON.stringify(invoice) }] };
        // AI receives: { password_hash, internal_margin, customer_ssn, ... }
    }
    // ...50 more if/else branches
});
```

**Data exfiltration.** `JSON.stringify(invoice)` sends `password_hash`, `internal_margin`, `customer_ssn` — every column — straight to the LLM provider. One field = one GDPR violation.

**Token explosion.** Every tool schema is sent on every turn, even when irrelevant. System prompt rules for every domain entity are sent globally, bloating context with wasted tokens.

**Context DDoS.** An unbounded `findMany()` can dump thousands of rows into the context window. The LLM hallucinates. Your API bill explodes.

---

## The MVA Solution

Vurb.ts replaces `JSON.stringify()` with a **Presenter** — a deterministic perception layer that controls exactly what the agent sees, knows, and can do next.

```
Handler (Model)          Presenter (View)              Agent (LLM)
───────────────          ────────────────              ───────────
Raw DB data        →     Zod-validated schema      →   Structured
{ amount_cents,          + System rules                perception
  password_hash,         + UI blocks (charts)          package
  internal_margin,       + Suggested next actions
  ssn, ... }             + PII redaction
                         + Cognitive guardrails
                         - password_hash  ← STRIPPED
                         - internal_margin ← STRIPPED
                         - ssn ← REDACTED
```

The result is not JSON — it's a **Perception Package**:

```
Block 1 — DATA:    {"id":"INV-001","amount_cents":45000,"status":"pending"}
Block 2 — UI:      [ECharts gauge chart config]
Block 3 — RULES:   "amount_cents is in CENTS. Divide by 100 for display."
Block 4 — ACTIONS: → billing.pay: "Invoice is pending — process payment"
Block 5 — EMBEDS:  [Client Presenter + LineItem Presenter composed]
```

No guessing. Undeclared fields rejected. Domain rules travel with data — not in the system prompt. Next actions computed from data state.

---

## Before vs. After

**Before** — raw MCP:

```typescript
case 'get_invoice':
    const invoice = await db.invoices.findUnique(args.id);
    return { content: [{ type: 'text', text: JSON.stringify(invoice) }] };
    // Leaks internal columns. No rules. No guidance.
```

**After** — Vurb.ts with MVA:

```typescript
import { createPresenter, suggest, ui, t } from '@vurb/core';

const InvoicePresenter = createPresenter('Invoice')
    .schema({
        id:           t.string,
        amount_cents: t.number.describe('Amount in cents — divide by 100'),
        status:       t.enum('paid', 'pending', 'overdue'),
    })
    .rules(['CRITICAL: amount_cents is in CENTS. Divide by 100 for display.'])
    .redactPII(['*.customer_ssn', '*.credit_card'])
    .ui((inv) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }],
        }),
    ])
    .suggest((inv) =>
        inv.status === 'pending'
            ? [suggest('billing.pay', 'Invoice pending — process payment')]
            : [suggest('billing.archive', 'Invoice settled — archive it')]
    )
    .embed('client', ClientPresenter)
    .embed('line_items', LineItemPresenter)
    .limit(50);

export default f.query('billing.get_invoice')
    .describe('Get an invoice by ID')
    .withString('id', 'Invoice ID')
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => ctx.db.invoices.findUnique({
        where: { id: input.id },
        include: { client: true, line_items: true },
    }));
```

The handler returns raw data. The Presenter shapes absolutely everything the agent perceives.

---

## Architecture

### Egress Firewall — Schema as Security Boundary

The Presenter's Zod schema acts as a whitelist. **Only declared fields pass through.** A database migration that adds `customer_ssn` doesn't change what the agent sees — the new column is invisible unless you explicitly declare it in the schema.

```typescript
const UserPresenter = createPresenter('User')
    .schema({ id: t.string, name: t.string, email: t.string });
// password_hash, tenant_id, internal_flags → STRIPPED at RAM level
// A developer CANNOT accidentally expose a new column
```

### DLP Compliance Engine — PII Redaction

GDPR / LGPD / HIPAA compliance built into the framework. `.redactPII()` compiles a V8-optimized redaction function via `fast-redact` that masks sensitive fields **after** UI blocks and rules have been computed (Late Guillotine Pattern) — the LLM receives `[REDACTED]` instead of real values.

```typescript
const PatientPresenter = createPresenter('Patient')
    .schema({ name: t.string, ssn: t.string, diagnosis: t.string })
    .redactPII(['ssn', 'diagnosis'])
    .ui((patient) => [
        ui.markdown(`**Patient:** ${patient.name}`),
        // patient.ssn available for UI logic — but LLM sees [REDACTED]
    ]);
```

Custom censors, wildcard paths (`'*.email'`, `'patients[*].diagnosis'`), and centralized PII field lists. **Zero-leak guarantee** — the developer cannot accidentally bypass redaction.

### 8 Anti-Hallucination Mechanisms

```
① Action Consolidation    → groups operations behind fewer tools    → ↓ tokens
② TOON Encoding           → pipe-delimited compact descriptions    → ↓ tokens
③ Zod .strict()           → rejects hallucinated params at build   → ↓ retries
④ Self-Healing Errors     → directed correction prompts            → ↓ retries
⑤ Cognitive Guardrails    → .limit() truncates before LLM sees it → ↓ tokens
⑥ Agentic Affordances     → HATEOAS next-action hints from data   → ↓ retries
⑦ JIT Context Rules       → rules travel with data, not globally  → ↓ tokens
⑧ State Sync              → RFC 7234 cache-control for agents     → ↓ requests
```

Each mechanism compounds. Fewer tokens in context, fewer requests per task, less hallucination, lower cost.

### FSM State Gate — Temporal Anti-Hallucination

**The first framework where it is physically impossible for an AI to execute tools out of order.**

LLMs are chaotic — even with HATEOAS suggestions, a model can ignore them and call `cart.pay` with an empty cart. The FSM State Gate makes temporal hallucination structurally impossible: if the workflow state is `empty`, the `cart.pay` tool **doesn't exist** in `tools/list`. The LLM literally cannot call it.

```typescript
const gate = f.fsm({
    id: 'checkout',
    initial: 'empty',
    states: {
        empty:     { on: { ADD_ITEM: 'has_items' } },
        has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
        payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
        confirmed: { type: 'final' },
    },
});

const pay = f.mutation('cart.pay')
    .describe('Process payment')
    .bindState('payment', 'PAY')  // Visible ONLY in 'payment' state
    .handle(async (input, ctx) => ctx.db.payments.process(input.method));
```

| State | Visible Tools |
|---|---|
| `empty` | `cart.add_item`, `cart.view` |
| `has_items` | `cart.add_item`, `cart.checkout`, `cart.view` |
| `payment` | `cart.pay`, `cart.view` |
| `confirmed` | `cart.view` |

Three complementary layers: **Format** (Zod validates shape), **Guidance** (HATEOAS suggests the next tool), **Gate** (FSM physically removes wrong tools). XState v5 powered, serverless-ready with `fsmStore`.

### Zero-Trust Sandbox — Computation Delegation

The LLM sends JavaScript logic to your data instead of shipping data to the LLM. Code runs inside a sealed V8 isolate — **zero access** to `process`, `require`, `fs`, `net`, `fetch`, `Buffer`. Timeout kill, memory cap, output limit, automatic isolate recovery, and AbortSignal kill-switch (Connection Watchdog).

```typescript
export default f.query('analytics.compute')
    .describe('Run a computation on server-side data')
    .sandboxed({ timeout: 3000, memoryLimit: 64 })
    .handle(async (input, ctx) => {
        const data = await ctx.db.records.findMany();
        const engine = f.sandbox({ timeout: 3000, memoryLimit: 64 });
        try {
            const result = await engine.execute(input.expression, data);
            if (!result.ok) return f.error('VALIDATION_ERROR', result.error)
                .suggest('Fix the JavaScript expression and retry.');
            return result.value;
        } finally { engine.dispose(); }
    });
```

`.sandboxed()` auto-injects HATEOAS instructions into the tool description — the LLM knows exactly how to format its code. Prototype pollution contained. `constructor.constructor` escape blocked. One isolate per engine, new pristine context per call.

### State Sync — Temporal Awareness for Agents

LLMs have no sense of time. After `sprints.list` then `sprints.create`, the agent still believes the list is unchanged. Vurb.ts injects RFC 7234-inspired cache-control signals:

```typescript
const listSprints = f.query('sprints.list')
    .stale()                              // no-store — always re-fetch
    .handle(async (input, ctx) => ctx.db.sprints.findMany());

const createSprint = f.action('sprints.create')
    .invalidates('sprints.*', 'tasks.*')  // causal cross-domain invalidation
    .withString('name', 'Sprint name')
    .handle(async (input, ctx) => ctx.db.sprints.create(input));
// After mutation: [System: Cache invalidated for sprints.*, tasks.* — caused by sprints.create]
// Failed mutations emit nothing — state didn't change.
```

Registry-level policies with `f.stateSync()`, glob patterns (`*`, `**`), policy overlap detection, observability hooks, and MCP `notifications/resources/updated` emission.

### Prompt Engine — Server-Side Templates

MCP Prompts as executable server-side templates with the same Fluent API as tools. Middleware, hydration timeout, schema-informed coercion, interceptors, multi-modal messages, and the Presenter bridge:

```typescript
const IncidentAnalysis = f.prompt('incident_analysis')
    .title('Incident Analysis')
    .describe('Structured analysis of a production incident')
    .tags('engineering', 'ops')
    .input({
        incident_id: { type: 'string', description: 'Incident ticket ID' },
        severity: { enum: ['sev1', 'sev2', 'sev3'] as const },
    })
    .use(requireAuth, requireRole('engineer'))
    .timeout(10_000)
    .handler(async (ctx, { incident_id, severity }) => {
        const incident = await ctx.db.incidents.findUnique({ where: { id: incident_id } });
        return {
            messages: [
                PromptMessage.system(`You are a Senior SRE. Severity: ${severity.toUpperCase()}.`),
                ...PromptMessage.fromView(IncidentPresenter.make(incident, ctx)),
                PromptMessage.user('Begin root cause analysis.'),
            ],
        };
    });
```

`PromptMessage.fromView()` decomposes any Presenter into prompt messages — same schema, same rules, same affordances in both tools and prompts. Multi-modal with `.image()`, `.audio()`, `.resource()`. Interceptors inject compliance footers after every handler. `PromptRegistry` with filtering, pagination, and lifecycle sync.

### Agent Skills — Progressive Instruction Distribution

**No other MCP framework has this.** Distribute domain expertise to AI agents on demand via MCP. Three-layer progressive disclosure — the agent searches a lightweight index, loads only the relevant SKILL.md, and reads auxiliary files on demand. Zero context window waste.

```typescript
import { SkillRegistry, autoDiscoverSkills, createSkillTools } from '@vurb/skills';

const skills = new SkillRegistry();
await autoDiscoverSkills(skills, './skills');
const [search, load, readFile] = createSkillTools(f, skills);
registry.registerAll(search, load, readFile);
```

Skills follow the [agentskills.io](https://agentskills.io) open standard — SKILL.md with YAML frontmatter. `skills.search` returns the lightweight index. `skills.load` returns full instructions. `skills.read_file` gives access to auxiliary files with **path traversal protection** (only files within the skill's directory). Custom search engines supported.

```
skills/
├── deployment/
│   ├── SKILL.md          # name, description, full instructions
│   └── scripts/
│       └── deploy.sh     # accessible via skills.read_file
└── database-migration/
    └── SKILL.md
```

### Fluent API — Semantic Verbs & Chainable Builders

```typescript
f.query('users.list')      // readOnly: true — no side effects
f.action('users.create')   // neutral — creates or updates
f.mutation('users.delete')  // destructive: true — triggers confirmation dialogs
```

Every builder method is chainable and fully typed. Types accumulate as you chain — the final `.handle()` has 100% accurate autocomplete with zero annotations:

```typescript
export const deploy = f.mutation('infra.deploy')
    .describe('Deploy infrastructure')
    .instructions('Use ONLY after the user explicitly requests deployment.')
    .withEnum('env', ['staging', 'production'] as const, 'Target environment')
    .concurrency({ max: 2, queueSize: 5 })
    .egress(1_000_000)
    .idempotent()
    .invalidates('infra.*')
    .returns(DeployPresenter)
    .handle(async function* (input, ctx) {
        yield progress(10, 'Cloning repository...');
        await cloneRepo(ctx.repoUrl);
        yield progress(90, 'Running tests...');
        const results = await runTests();
        yield progress(100, 'Done!');
        return results;
    });
```

`.instructions()` embeds prompt engineering. `.concurrency()` prevents backend overload. `.egress()` caps response size. `yield progress()` streams MCP progress notifications. `.cached()` / `.stale()` / `.invalidates()` control temporal awareness. `.sandboxed()` enables computation delegation. `.bindState()` enables FSM gating.

### Middleware — Pre-Compiled, Zero-Allocation

tRPC-style context derivation. Middleware chains compiled at registration time into a single nested function — O(1) dispatch, no array iteration, no per-request allocation:

```typescript
const requireAuth = f.middleware(async (ctx) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user, permissions: user.permissions };
});

// ctx.user and ctx.permissions — fully typed downstream. Zero annotations.
```

Stack `.use()` calls for layered derivations: auth → permissions → tenant resolution → audit logging. Same `MiddlewareFn` signature works for both tools and prompts.

### Fluent Router — Grouped Tooling

```typescript
const users = f.router('users')
    .describe('User management')
    .use(requireAuth)
    .tags('core');

export const listUsers = users.query('list').describe('List users').handle(/* ... */);
export const banUser = users.mutation('ban').describe('Ban a user').handle(/* ... */);
// Middleware, tags, prefix — all inherited automatically
```

Discriminator enum compilation. Per-field annotations tell the LLM which parameters belong to which action. Tool exposition: `flat` (independent MCP tools) or `grouped` (one tool with enum discriminator).

### tRPC-Style Client — Compile-Time Route Validation

```typescript
import { createVurbClient } from '@vurb/core';
import type { AppRouter } from './server.js';

const client = createVurbClient<AppRouter>(transport);

await client.execute('projects.create', { workspace_id: 'ws_1', name: 'V2' });
// TS error on typos ('projetcs.create'), missing fields, type mismatches.
// Zero runtime cost. Client middleware (auth, logging). Batch execution.
```

`createTypedRegistry()` is a curried double-generic — first call sets `TContext`, second infers all builder types. `InferRouter` is pure type-level.

### Self-Healing Errors

```typescript
// Validation errors → directed correction prompts
❌ Validation failed for 'users.create':
  • email — Invalid email format. You sent: 'admin@local'.
    Expected: a valid email address (e.g. user@example.com).
  💡 Fix the fields above and call the action again.

// Business-logic errors → structured recovery with fluent builder
return f.error('NOT_FOUND', `Project '${input.id}' not found`)
    .suggest('Call projects.list to find valid IDs')
    .actions('projects.list')
    .build();
```

### Capability Governance — Cryptographic Surface Integrity

Nine modules for SOC2-auditable AI deployments:

```bash
vurb lock --server ./src/server.ts       # Generate vurb.lock
vurb lock --check --server ./src/server.ts  # Gate CI builds
```

- **Capability Lockfile** — deterministic, git-diffable artifact capturing every tool's behavioral contract
- **Surface Integrity** — SHA-256 behavioral fingerprinting
- **Contract Diffing** — semantic delta engine with severity classification
- **Zero-Trust Attestation** — HMAC-SHA256 signing and runtime verification
- **Blast Radius Analysis** — entitlement scanning (filesystem, network, subprocess) with evasion detection
- **Token Economics** — cognitive overload profiling
- **Semantic Probing** — LLM-as-a-Judge for behavioral drift
- **Self-Healing Context** — contract delta injection into validation errors

PR diffs show exactly what changed in the AI-facing surface:

```diff
  "invoices": {
-   "integrityDigest": "sha256:f6e5d4c3b2a1...",
+   "integrityDigest": "sha256:9a8b7c6d5e4f...",
    "behavior": {
-     "systemRulesFingerprint": "static:abc",
+     "systemRulesFingerprint": "dynamic",
    }
  }
```

---

## Code Generators

### OpenAPI → MCP in One Command

Turn any **REST/OpenAPI 3.x or Swagger 2.0** spec into a working MCP server — code generation or runtime proxy:

```bash
npx openapi-gen generate -i ./petstore.yaml -o ./generated
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

Generates `models/` (Zod `.strict()` schemas), `views/` (Presenters), `agents/` (tool definitions with inferred annotations), `server.ts` (bootstrap). HTTP method → MCP annotation inference: `GET` → `readOnly`, `DELETE` → `destructive`, `PUT` → `idempotent`.

Runtime proxy mode with `loadOpenAPI()` for instant prototyping — no code generation step.

### Prisma → MCP with Field-Level Security

A Prisma Generator that produces Vurb.ts tools and Presenters with field-level security, tenant isolation, and OOM protection:

```prisma
generator mcp {
  provider = "vurb-prisma-gen"
  output   = "../src/tools/database"
}

model User {
  id           String @id @default(uuid())
  email        String @unique
  passwordHash String /// @vurb.hide        ← physically excluded from schema
  stripeToken  String /// @vurb.hide        ← physically excluded from schema
  creditScore  Int    /// @vurb.describe("Score 0-1000. Above 700 is PREMIUM.")
  tenantId     String /// @vurb.tenantKey   ← injected into every WHERE clause
}
```

`npx prisma generate` → typed CRUD tools with pagination capped at 50, tenant isolation at the generated code level. Cross-tenant access is structurally impossible.

### n8n Workflows → MCP Tools

Auto-discover n8n webhook workflows as MCP tools with tag filtering, live polling, and MVA interception:

```typescript
const n8n = await createN8nConnector({
    url: process.env.N8N_URL!,
    apiKey: process.env.N8N_API_KEY!,
    includeTags: ['ai-enabled'],
    pollInterval: 60_000,
    onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});
```

n8n handles the Stripe/Salesforce/webhook logic. Vurb.ts provides typing, Presenters, middleware, and access control.

---

## Inspector — Real-Time Dashboard

```bash
vurb inspect        # Auto-discover and connect
vurb inspect --demo  # Built-in simulator
```

```
┌──────────────────────────────────────────────────────────────┐
│  ● LIVE: PID 12345  │  RAM: [█████░░░] 28MB  │  UP: 01:23  │
├───────────────────────┬──────────────────────────────────────┤
│  TOOL LIST            │  X-RAY: billing.create_invoice       │
│  ✓ billing.create     │   LATE GUILLOTINE:                   │
│  ✓ billing.get        │    DB Raw  : 4.2KB                   │
│  ✗ users.delete       │    Wire    : 1.1KB                   │
│  ✓ system.health      │    SAVINGS : ████████░░ 73.8%        │
├───────────────────────┴──────────────────────────────────────┤
│  19:32:01  ROUTE  billing.create    │  19:32:01  EXEC  ✓ 45ms│
└──────────────────────────────────────────────────────────────┘
```

Connects via **Shadow Socket** (Named Pipe / Unix Domain Socket) — no stdio interference, no port conflicts. Real-time tool list, request stream, Late Guillotine visualization.

---

## Testing — Full Pipeline in RAM

`@vurb/testing` runs the actual execution pipeline — same code path as production — and returns `MvaTestResult` with each MVA layer decomposed:

```typescript
import { createVurbTester } from '@vurb/testing';

const tester = createVurbTester(registry, {
    contextFactory: () => ({ prisma: mockPrisma, tenantId: 't_42', role: 'ADMIN' }),
});

describe('SOC2 Data Governance', () => {
    it('strips PII before it reaches the LLM', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10 });
        for (const user of result.data) {
            expect(user).not.toHaveProperty('passwordHash');
            expect(user).not.toHaveProperty('tenantId');
        }
    });

    it('sends governance rules with data', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });
        expect(result.systemRules).toContain('Email addresses are PII.');
    });

    it('blocks guest access', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 }, { role: 'GUEST' });
        expect(result.isError).toBe(true);
    });
});
```

Assert every MVA layer: `result.data` (egress firewall), `result.systemRules` (JIT rules), `result.uiBlocks` (server-rendered charts), `result.data.length` (cognitive guardrail), `rawResponse` (HATEOAS hints). Works with Vitest, Jest, Mocha, or `node:test`.

---

## Deploy Anywhere

Same tools, same Presenters, same middleware — **zero code changes between platforms**:

```bash
# Vinkius Edge — zero-config managed deployment
vurb deploy

# Vercel Functions — Next.js App Router
cd my-server && vercel deploy

# Cloudflare Workers — V8 isolates, 300+ locations
cd my-server && wrangler deploy
```

Write once, deploy to any edge. Your business logic, schemas, PII redaction, FSM gates, and HATEOAS suggestions are identical across all three targets — only the transport layer changes.

### Vinkius Edge

**Zero-config managed deployment.** One command. No Dockerfile, no infra config, no CI pipeline. `vurb deploy` bundles your entire server into a **Fat Bundle** — a fully self-contained IIFE (esbuild, platform `browser`, target `es2022`, tree-shaking + minification) — compresses it with gzip, computes a SHA-256 integrity hash, and uploads to Vinkius Edge.

```bash
vurb deploy
```

```
  ● Bundle        172.3KB → 48.1KB gzip, 72% smaller
  ● Introspect    4 tools, 2 prompts, manifest signed
  ● Upload        Deploying to Edge

  Vinkius Edge  ·  my-server is ready in just 2.1s
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  MCP Server Stateful
  https://mcp.vinkius.com/s/my-server

  TOOLS  4 tools ready

    ● billing.get_invoice   Get an invoice by ID
    ● billing.pay           Process payment
    ● users.list            List all users
    ● system.health         Health check

  ↻ 48.1KB gzip  ·  ✓ manifest signed  ·  SHA-256: f6e5d4...
```

**What happens under the hood:**

1. **Edge Stub Plugin** — a custom esbuild plugin intercepts every Node.js built-in import (`fs`, `path`, `crypto`, `node:fs/promises`, etc.) and redirects them to `edge-stub.ts`. Two tiers: **Structural stubs** (`EventEmitter`, `Readable`, `Writable`, `Server`, `Socket`) satisfy the AST so the MCP SDK compiles — never called at runtime. **Crash stubs** (`readFileSync`, `exec`, `spawn`, `createHash`) fail-fast with `[Vinkius Edge] "<api>" is blocked in the Serverless Sandbox.`

2. **Bundle Sanitizer** — static analysis transforms dangerous patterns without changing JS semantics: `eval(` → `(0,eval)(`, `new Function(` → `new(0,Function)(`, `__proto__` → `["__proto__"]`, prototype pollution vectors neutralized.

3. **Introspection** — sets `VURB_INTROSPECT=1`, imports your entrypoint, runs `compileContracts()` + `generateLockfile()` to produce a **cryptographic capability manifest**. Tool names, descriptions, and behavioral fingerprints are extracted. The lockfile ships with the bundle for runtime attestation.

4. **Upload** — base64-encoded gzip payload with SHA-256 hash, 60s timeout, server ID validation (`^[a-zA-Z0-9_-]+$` — path traversal blocked). Status-specific error handling: 401 (token revoked), 403 (wrong server), 404 (server not found), 422 (invalid payload).

**Warnings:** The CLI detects and warns about edge-incompatible patterns before bundling — `autoDiscover()` (requires `fs.readdir`), `SandboxEngine` (requires `child_process`), `Inspector` (requires Node.js IPC), `fast-redact` (uses `Function` constructor).

### Vercel Functions

**Next.js App Router + `@vurb/vercel` adapter.** Deploy to Vercel with one command:

```bash
vercel deploy
```

Same MVA structure — `models/`, `presenters/`, `tools/`, `registry.ts` — under `src/mcp/`. The only Vercel-specific file is the route handler:

```typescript
// app/api/mcp/route.ts
import { vercelAdapter } from '@vurb/vercel';
import { registry, contextFactory } from '@/mcp/vurb';

export const POST = vercelAdapter({ registry, contextFactory });
```

**How the adapter works:**

- **Cold start (once):** `ToolRegistry` compiles at module top-level scope — Zod reflection, Presenter compilation, schema generation. Zero CPU on warm requests.
- **Warm request (per invocation):** Ephemeral `McpServer` + `WebStandardStreamableHTTPServerTransport` per request. Stateless JSON-RPC only (`enableJsonResponse: true`) — no SSE, no sessions, no streaming. Pure request/response.
- **Context factory** receives the raw `Request` object — extract headers, auth tokens, tenant ID. Errors return JSON-RPC `-32603`.
- **Cleanup:** `await server.close()` in `finally` block — no resource leaks.
- **Method enforcement:** Non-POST returns JSON-RPC `-32600` with `405 Allow: POST`.

Works with both **Edge Runtime** (V8 isolate, global distribution) and **Node.js Runtime** (full Node.js API access). Add `export const runtime = 'edge'` for Edge. Explicit imports in the registry — no `autoDiscover()` (Vercel needs static analysis for tree-shaking).

### Cloudflare Workers

**Workers + `@vurb/cloudflare` adapter.** Deploy to Cloudflare's 300+ edge locations with one command:

```bash
wrangler deploy
```

Same MVA structure — `models/`, `presenters/`, `tools/`, `registry.ts` — under `src/`. The only Cloudflare-specific file is the worker entry:

```typescript
// src/worker.ts
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
import { registry, contextFactory } from './mcp/vurb.js';

export default cloudflareWorkersAdapter({ registry, contextFactory });
// Returns { fetch(request, env, ctx) } — Workers ES Modules interface
```

**How the adapter works:**

- **Same cold-start/warm-request split** as Vercel — registry compiled once, ephemeral server per request, stateless JSON-RPC via `WebStandardStreamableHTTPServerTransport`.
- **`env` injection:** Cloudflare bindings (D1, KV, R2, secrets) are injected per-request through the Worker `fetch(request, env, ctx)` signature. The `contextFactory` receives all three — full access to edge-native storage:

```typescript
contextFactory: (req, env, ctx) => ({
    db: env.DB,           // D1 — edge-native SQL
    cache: env.CACHE,     // KV — sub-ms reads
    storage: env.BUCKET,  // R2 — S3-compatible object storage
    waitUntil: ctx.waitUntil.bind(ctx),
})
```

- **Non-blocking cleanup:** Server shutdown is deferred via `ctx.waitUntil(server.close())` — does not delay the response to the client. Both success and error paths use `waitUntil`.
- **Zero polyfills** — Cloudflare Workers natively support the WinterCG APIs (`Request`, `Response`, `ReadableStream`, `crypto`) that `@vurb/cloudflare` requires. No `@cloudflare/workers-types` runtime dependency — the adapter defines `ExecutionContext` inline.
- **Wrangler config:** `compatibility_date: '2024-12-01'`, `compatibility_flags: ['nodejs_compat']`. Commented D1/KV/R2 binding examples ready to uncomment.

---

## Ecosystem

### Adapters

| Package | Name | Target |
|---|---|---|
| [`@vurb/vercel`](https://vurb.vinkius.com/vercel-adapter) | Vercel Adapter | Vercel Functions (Edge / Node.js) |
| [`@vurb/cloudflare`](https://vurb.vinkius.com/cloudflare-adapter) | Cloudflare Adapter | Cloudflare Workers — zero polyfills |

### Generators & Connectors

| Package | Name | Purpose |
|---|---|---|
| [`@vurb/openapi-gen`](https://vurb.vinkius.com/openapi-gen) | OpenAPI Generator | Generate typed tools from OpenAPI 3.x / Swagger 2.0 specs |
| [`@vurb/prisma-gen`](https://vurb.vinkius.com/prisma-gen) | Prisma Generator | Generate CRUD tools with field-level security from Prisma |
| [`@vurb/n8n`](https://vurb.vinkius.com/n8n-connector) | n8n Connector | Auto-discover n8n workflows as MCP tools |
| [`@vurb/aws`](https://vurb.vinkius.com/aws-connector) | AWS Connector | Auto-discover AWS Lambda & Step Functions |
| [`@vurb/skills`](https://vurb.vinkius.com/skills) | Agent Skills | Progressive instruction distribution for agents |

### Security & Auth

| Package | Name | Purpose |
|---|---|---|
| [`@vurb/oauth`](https://vurb.vinkius.com/oauth) | OAuth Provider | RFC 8628 Device Flow authentication |
| [`@vurb/jwt`](https://vurb.vinkius.com/jwt) | JWT Verifier | JWT verification — HS256/RS256/ES256 + JWKS |
| [`@vurb/api-key`](https://vurb.vinkius.com/api-key) | API Key Guard | API key validation with timing-safe comparison |

### Developer Experience

| Package | Name | Purpose |
|---|---|---|
| [`@vurb/testing`](https://vurb.vinkius.com/testing) | Testing Kit | In-memory pipeline testing with MVA layer assertions |
| [`@vurb/inspector`](https://vurb.vinkius.com/inspector) | Inspector | Real-time terminal dashboard via Shadow Socket |

---

## Documentation

Full guides, API reference, and cookbook recipes:

**[Vurb.ts.vinkius.com](https://vurb.vinkius.com/)**

## Contributing

See [CONTRIBUTING.md](https://github.com/vinkius-labs/vurb.ts/blob/main/CONTRIBUTING.md) for development setup and PR guidelines.

## Security

See [SECURITY.md](https://github.com/vinkius-labs/vurb.ts/blob/main/SECURITY.md) for reporting vulnerabilities.

## License

[Apache 2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
