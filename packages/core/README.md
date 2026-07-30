# MCP FUSION

**The TypeScript framework for secure, MCP 2.0-native servers.**

[![npm version](https://img.shields.io/npm/v/@mcpfusion/core.svg?color=0ea5e9)](https://www.npmjs.com/package/@mcpfusion/core)
[![Downloads](https://img.shields.io/npm/dw/@mcpfusion/core)](https://www.npmjs.com/package/@mcpfusion/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP 2.0](https://img.shields.io/badge/MCP-2.0_(2026--07--28)-purple)](https://modelcontextprotocol.io/specification/2026-07-28)
[![License](https://img.shields.io/badge/License-Apache_2.0-green)](https://github.com/vinkius-labs/mcpfusion/blob/main/LICENSE)
[![llms.txt](https://img.shields.io/badge/llms.txt-AI_Ready-8b5cf6)](https://mcpfusion.vinkius.com/llms.txt)

MCP Fusion is a TypeScript framework that enforces security at the architectural level of every MCP server. Raw data never reaches the LLM without passing through a typed egress firewall. Tools are physically removed from the agent's namespace when the workflow state forbids them. Every behavioral surface is hashed, locked, and auditable in version control.

The framework ships with a [SKILL.md](https://github.com/vinkius-labs/mcpfusion/blob/main/.claude/skills/mcpfusion-development/SKILL.md) — a machine-readable architectural contract. AI coding agents read the Skill and produce correct, governed servers on the first pass.

---

## MCP 2.0 (`2026-07-28`) — Full Compliance

MCP Fusion is **100% compatible with MCP 2.0** (protocol revision `2026-07-28`). Every feature the spec defines is implemented or handled via the MCP SDK v2. Every feature the spec deprecates is deprecated in MCP Fusion.

### Implemented MCP 2.0 Features

| Feature | Status | How |
|---|---|---|
| **Stateless protocol** | ✅ | `transport: 'stateless'` — per-request serving, no sessions, no `initialize` handshake, `Mcp-Method`/`Mcp-Name` header routing |
| **Multi Round-Trip Requests (MRTR)** | ✅ | `requireInput()` + `readInput()` — native `InputRequiredResult` / `resultType: "input_required"` model |
| **Request State Sealing** | ✅ | `requestStateKey` — HMAC-SHA256 sealed state for multi-round elicitation (SEP-2322) |
| **Structured Content** | ✅ | `successStructured()` + `structuredContent` field on `ToolResponse` |
| **Output Schema** | ✅ | `outputSchema` in `compileToolDefinition()` wire format |
| **List Caching** | ✅ | `ttlMs` / `cacheScope` directly on result root (SEP-2549) — `public` / `private` scope |
| **Pagination** | ✅ | `cursor` / `nextCursor` on `prompts/list` (extensible to all list ops) |
| **`server/discover`** | ✅ | Handled by MCP SDK v2 Server |
| **`resultType`** | ✅ | Handled by MCP SDK v2 Server (`"complete"` / `"input_required"`) |
| **Per-request `_meta`** | ✅ | `io.modelcontextprotocol/*` fields handled by MCP SDK v2 |
| **`resources/templates/list`** | ✅ | URI template resources with pagination |
| **`subscriptions/listen`** | ✅ | MCP 2.0 stream-based subscription pattern with filter + acknowledgment |
| **`x-mcp-header`** | ✅ | `.withHeaderParam()` on FluentToolBuilder — parameter mirroring to HTTP headers |
| **`title` & `icons`** | ✅ | `Tool.title`, `BaseModel.title`, `Icon` domain model, `createIcon()` |
| **`resource_link`** | ✅ | Content type in tool results and prompt messages |
| **JSON Schema 2020-12** | ✅ | Default dialect enforced by MCP SDK v2 |
| **Error codes** (`-32020`–`-32022`) | ✅ | `HeaderMismatch`, `MissingRequiredClientCapability`, `UnsupportedProtocolVersion` |
| **Protocol version** | ✅ | Defaults to `2026-07-28` in all server metadata (Server Card, introspection) |

### Deprecated Features (mirrored from MCP 2.0)

All features deprecated by MCP 2.0 (SEP-2577 / SEP-2596) are deprecated in MCP Fusion with `@deprecated` markers and migration guidance. They remain functional during the deprecation window (earliest removal: `2027-07-28`).

| Deprecated Feature | Migration Path |
|---|---|
| **Roots** | Pass directories/files via tool parameters, resource URIs, or server configuration |
| **Sampling** | Integrate directly with LLM provider APIs |
| **Logging** (`notifications/message`) | Log to `stderr` for stdio; use OpenTelemetry (`TelemetrySink` / `DebugObserver`) |
| **Dynamic Client Registration** | Client ID Metadata Documents |
| **HTTP+SSE transport** | Streamable HTTP (`transport: 'http'`) or stateless (`transport: 'stateless'`) |
| **`includeContext` values** | Omit the field or use `"none"` |

> 📄 **[Deprecation Registry](https://mcpfusion.vinkius.com/deprecation-registry)** — full compliance statement and migration guide.

---

## The Skill — AI Writes the Server

MCP Fusion includes a SKILL.md that encodes the entire MVA architecture, security patterns, and governance rules into a format AI coding agents consume directly.

Open your project in **Cursor**, **Claude Code**, **GitHub Copilot**, or **Windsurf** and describe what you need:

> *"Build an MCP server for patient records with Prisma. Redact SSN and diagnosis from LLM output. Gate discharge tools until attending physician signs off."*

The agent reads the Skill. It produces `defineModel()` declarations with `m.hidden()` for sensitive fields, `definePresenter()` with `.redactPII(['*.ssn', '*.diagnosis'])` for DLP compliance, FSM state gating via `.bindState()` for workflow enforcement, and file-based routing under `src/tools/`. You review the PR.

The Skill is not documentation. It is the security contract. Every server the AI produces inherits the governance stack because the Skill encodes Presenters, state machines, and lockfile generation as mandatory structural patterns.

> 📄 **[SKILL.md](https://github.com/vinkius-labs/mcpfusion/blob/main/.claude/skills/mcpfusion-development/SKILL.md)** · **[llms.txt](https://mcpfusion.vinkius.com/llms.txt)** *(complete API reference for LLM consumption)*

---

## Security Architecture

### Egress Firewall — Presenter

The Presenter validates every response through a Zod schema compiled from `defineModel()`. Undeclared fields are stripped in RAM before serialization. PII is redacted via V8-optimized `fast-redact` compiled functions. Rules travel with data, not in the system prompt. The Late Guillotine pattern applies redaction after UI blocks render — charts and suggestions always see full data, the wire never does.

```typescript
const PatientPresenter = createPresenter('Patient')
    .schema(PatientModel)
    .redactPII(['*.ssn', '*.diagnosis'])
    .rules((p) => [
        p.status === 'critical' ? 'PRIORITY: Patient is critical.' : null,
    ])
    .suggest((p) => p.status === 'admitted'
        ? [suggest('ward.discharge', 'Begin discharge protocol')]
        : []);
```

The Presenter also runs a **PromptFirewall** — an LLM-as-Judge that evaluates dynamically generated system rules for prompt injection before they reach the agent. Fail-closed by default.

### State Gate — FSM

Tools bound to FSM states are physically removed from `tools/list` when the current state does not match. The LLM cannot call what does not exist in its namespace. Powered by XState v5 with manual fallback when XState is not installed.

```typescript
const gate = f.fsm({
    id: 'discharge', initial: 'admitted',
    states: {
        admitted:    { on: { PHYSICIAN_SIGNOFF: 'approved' } },
        approved:    { on: { DISCHARGE: 'discharged' } },
        discharged:  { type: 'final' },
    },
});

export default f.mutation('ward.discharge')
    .bindState('approved', 'DISCHARGE')
    .handle(async (input, ctx) => ctx.db.patients.discharge(input.id));
```

| State | Visible tools |
|---|---|
| `admitted` | `ward.view`, `ward.update_vitals` |
| `approved` | `ward.discharge`, `ward.view` |
| `discharged` | `ward.view` |

Serverless-compatible: `FsmStateStore` persists state to Redis/KV across request boundaries. Each request gets an isolated `gate.clone()`.

### Governance Stack

Eight introspection modules that make behavioral changes visible and auditable:

| Module | What it does |
|---|---|
| **ToolContract** | Materializes the complete behavioral surface of each tool |
| **BehaviorDigest** | SHA-256 hash of the behavioral surface |
| **CapabilityLockfile** | `mcpfusion.lock` — git-diffable behavioral snapshot, CI gate via `fusion lock --check` |
| **CryptoAttestation** | HMAC-SHA256 runtime verification — fail-fast if behavioral digest drifts |
| **ContractDiff** | Per-field diff between lockfile versions |
| **EntitlementScanner** | Static analysis of handler source for I/O capabilities (fs, network, subprocess, eval) with evasion heuristics |
| **SemanticProbe** | LLM-as-Judge for detecting semantic drift in handler output |
| **TokenEconomics** | Context window inflation risk profiling |

### Sandbox

`SandboxEngine` executes LLM-provided JavaScript in a sealed V8 isolate. No `process`, `require`, `fs`, or network access. One isolate per engine, fresh empty context per execution. Memory-limited, timeout-enforced, output-capped, abort-signal-compatible.

---

## Three Pathways

### 1. YAML — Zero Code

```yaml
version: "1.0"
server:
  name: "github-tools"

connections:
  github:
    type: rest
    base_url: "https://api.github.com"
    auth:
      type: bearer
      token: "${SECRETS.GITHUB_TOKEN}"

tools:
  - name: search_repos
    description: "Search GitHub repositories"
    instruction: "Use for finding projects by topic or keyword."
    rules:
      - "Max 10 results per query"
    parameters:
      query: { type: string, required: true }
    execute:
      connection: github
      method: GET
      path: "/search/repositories"
      query: { q: "{{query}}", per_page: "10" }
    response:
      extract: ["items[].{full_name, description, stargazers_count, html_url}"]
```

```bash
mcpfusion yaml dev
```

### 2. Typed MVA — Full Control

```typescript
export const InvoiceModel = defineModel('Invoice', m => {
    m.casts({
        id:           m.string(),
        amount_cents: m.number('CRITICAL: in CENTS. Divide by 100 for display.'),
        status:       m.enum('Status', ['paid', 'pending', 'overdue']),
    });
    m.hidden(['password_hash', 'internal_margin']);
});

export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: InvoiceModel,
    suggestActions: (inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment', args: { id: inv.id } }]
        : [],
});

export default f.query('billing.get_invoice')
    .describe('Get an invoice by ID')
    .withString('id', 'Invoice ID')
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => ctx.db.invoices.findUnique({ where: { id: input.id } }));
```

### 3. FSM — Deterministic Workflow Enforcement

State-gated tool discovery. Tools appear and disappear based on the current state.

---

## Get Started

```bash
npx @mcpfusion/core create my-server
cd my-server && npm run dev
```

File-based routing — drop a file, restart, and it's a live MCP tool:

```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    └── list.ts         → users.list
```

### Deploy

```bash
mcpfusion deploy                  # Vinkius Edge (V8 Isolate)
vercel deploy                # Vercel Functions
wrangler deploy              # Cloudflare Workers
```

### Scaffold

```bash
mcpfusion create my-server                           # Vanilla
mcpfusion create my-api --vector prisma              # Prisma + field-level security
mcpfusion create ops-bridge --vector n8n             # n8n workflow bridge
mcpfusion create petstore --vector openapi           # OpenAPI → MCP
mcpfusion create my-server --target vercel --yes     # Vercel Functions
mcpfusion create my-server --target cloudflare --yes # Cloudflare Workers
```

---

## Ecosystem

### Core

| Package | Purpose |
|---|---|
| [`@mcpfusion/core`](https://www.npmjs.com/package/@mcpfusion/core) | Framework core — Presenters, Fluent API, middleware, routing, governance |
| [`@mcpfusion/yaml`](https://www.npmjs.com/package/@mcpfusion/yaml) | Declarative YAML engine |
| [`@mcpfusion/swarm`](https://github.com/vinkius-labs/mcpfusion/tree/main/packages/swarm) | Multi-agent orchestration — HMAC-SHA256 delegation, namespace isolation, W3C tracing |
| [`@mcpfusion/a2a`](https://github.com/vinkius-labs/mcpfusion/tree/main/packages/a2a) | A2A Protocol Bridge — Agent Cards, task delegation |
| [`@mcpfusion/skills`](https://mcpfusion.vinkius.com/skills) | Progressive SKILL.md disclosure for agents |
| [`@mcpfusion/testing`](https://mcpfusion.vinkius.com/testing) | In-memory MVA pipeline testing |
| [`@mcpfusion/inspector`](https://mcpfusion.vinkius.com/inspector) | Real-time TUI dashboard |

### Adapters

| Package | Target |
|---|---|
| [`@mcpfusion/vercel`](https://mcpfusion.vinkius.com/vercel-adapter) | Vercel Functions (Edge / Node.js) |
| [`@mcpfusion/cloudflare`](https://mcpfusion.vinkius.com/cloudflare-adapter) | Cloudflare Workers |

### Generators & Connectors

| Package | Purpose |
|---|---|
| [`@mcpfusion/openapi-gen`](https://mcpfusion.vinkius.com/openapi-gen) | OpenAPI 3.x / Swagger 2.0 → MCP tools |
| [`@mcpfusion/prisma-gen`](https://mcpfusion.vinkius.com/prisma-gen) | Prisma schema → CRUD tools with field-level security |
| [`@mcpfusion/n8n`](https://mcpfusion.vinkius.com/n8n-connector) | n8n workflows → MCP tools |
| [`@mcpfusion/aws`](https://mcpfusion.vinkius.com/aws-connector) | AWS Lambda & Step Functions → MCP tools |

### Security & Auth

| Package | Purpose |
|---|---|
| [`@mcpfusion/oauth`](https://mcpfusion.vinkius.com/oauth) | RFC 8628 Device Flow |
| [`@mcpfusion/jwt`](https://mcpfusion.vinkius.com/jwt) | JWT verification — HS256 / RS256 / ES256 + JWKS |
| [`@mcpfusion/api-key`](https://mcpfusion.vinkius.com/api-key) | API key validation with timing-safe comparison |

---


## Ship Your MCP Server to the Same Infrastructure — Free

Your server runs alongside Salesforce, Stripe, OpenAI, and 4,000+ others. V8 sandbox isolation, DLP, audit trails, and kill switch — all included. No credit card required.

1. **Sign up** at [vinkius.com](https://vinkius.com)
2. **Create an App Connector** in the dashboard
3. **Copy your deploy token** from the connector settings
4. **Build your MCP server** with MCP Fusion
5. **Deploy**

```bash
mcpfusion deploy
```

Your MCP server is live.


## Powering Vinkius — 4,000+ MCP Servers in Production

Every MCP server on **[vinkius.com](https://vinkius.com)** is built with MCP Fusion.

Salesforce (12 tools), Slack (8 tools), Stripe, OpenAI, Gmail, WhatsApp Business, Instagram, PayPal, CrowdStrike Falcon, SAP S/4HANA, Workday, DocuSign, Zendesk, Okta, Twilio, Tableau, HubSpot, Shopify, WooCommerce, Airbnb, Tesla Fleet API, NVIDIA AI, Mistral AI, Anthropic, Box, Meta Ads, X Ads, Reddit, Notion, Supabase, Pinecone, Datadog, Sentry — and thousands more.

Four verticals. 36+ subcategories. All governed.

**AI Stack** — Cognition & RAG, Code Execution, Databases, Observability, DevOps, AI Models, Agent Coordination, Security, Payments & Infra.

**Enterprise** — CRM, ERP, HR, Legal & Compliance, Customer Support, Marketing, BI & Analytics, Identity & IAM, Communications, E-Commerce, Accounting, Project Management.

**Industries** — Hospitality, Healthcare, Energy & Commodities, Construction, Real Estate, Agriculture, Wine & Spirits, Education, Logistics, Insurance, Fitness, Travel.

**World Data** — Economy & Finance, Central Banks, Securities & Markets, Weather & Climate, Demographics, Space & Astronomy, Health & Medicine, Environment, Energy, Food & Nutrition, Government, Trade & Labor.

Every server runs inside V8 isolate sandboxes on AWS. Ed25519 signed audit chains. Sub-40ms cold starts. DLP redaction on every response. Kill switch for instant shutdown. Every tool call logged and auditable.

**[vinkius.com/discover](https://vinkius.com/discover)** — Browse the catalog. **[vinkius.com/developers](https://vinkius.com/developers)** — Build your own with MCP Fusion.


## Documentation

**[mcpfusion.vinkius.com](https://mcpfusion.vinkius.com/)** · **[llms.txt](https://mcpfusion.vinkius.com/llms.txt)** · **[SKILL.md](https://github.com/vinkius-labs/mcpfusion/blob/main/.claude/skills/mcpfusion-development/SKILL.md)**

## Contributing

See [CONTRIBUTING.md](https://github.com/vinkius-labs/mcpfusion/blob/main/CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](https://github.com/vinkius-labs/mcpfusion/blob/main/SECURITY.md) for reporting vulnerabilities.

## License

[Apache 2.0](https://github.com/vinkius-labs/mcpfusion/blob/main/LICENSE)
