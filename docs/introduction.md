# Introduction

## The Problem with MCP Servers Today

Open any MCP server tutorial. The pattern is always the same:

```typescript
server.tool('get_user', { id: z.string() }, async (args) => {
  const user = await db.user.findUnique({ where: { id: args.id } });
  return { content: [{ type: 'text', text: JSON.stringify(user) }] };
});
```

This works. Until it doesn't.

The `user` object goes straight from the database to the agent's context window. Every column: `password_hash`, `ssn`, `internal_notes`, `billing_code`. The agent didn't ask for any of that. But now it's in the context — burning tokens, creating liability, and one prompt injection away from being exfiltrated.

Add 50 tools like this and the agent drowns in schema definitions. Add 3 more developers and each one returns user data in a different format. Add a staging environment and you have no way to prove the tool surface hasn't changed since last review.

This is not a bad developer problem. It's a missing architecture problem. The MCP protocol gives you a transport layer and says "build everything else yourself." MCP Fusion is the architecture.

---

## What MCP Fusion Does Differently {#what-fusion-does}

MCP Fusion separates three concerns that every raw MCP server conflates into a single handler function:

| Concern | Raw MCP | MCP Fusion |
|---|---|---|
| **Who can call what** | `if` statements in each handler | Middleware pipeline — `contextFactory` → `f.middleware()` chain. If any middleware throws, the handler never runs. |
| **What the agent sees** | `JSON.stringify(dbRow)` | Presenter — Zod schema declares allowed fields. Undeclared fields are stripped at parse time, before they reach the wire. |
| **Whether the surface is trustworthy** | Nothing — `tools/list` shows whatever is currently registered | Governance stack — `mcp-fusion.lock` captures the behavioral surface. Contract diffing detects drift. HMAC-SHA256 proves integrity. |

This separation is what the **MVA (Model-View-Agent)** pattern formalizes. The handler returns raw data (Model). The Presenter shapes what the agent perceives (View). The middleware governs the Agent's access and context. These three layers are separated at the type level and at the runtime level — not mixed into a single function where one missed check leaks data.

::: info
MVA is MCP Fusion's core architectural contribution. If you want to understand the theory — why MVC doesn't translate to agent interactions, why perception boundaries matter for LLMs, and why affordances reduce hallucination — see the [MVA Pattern](/mva-pattern) and [MVA Theory](/mva/theory) pages.
:::

---

## How It Looks in Practice {#in-practice}

A complete example: an invoice tool with authentication, field-level data protection, domain rules, and affordances.

### Context — the type that flows everywhere {#context}

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string; tenantId: string };
}
const f = initFusion<AppContext>();
```

`initFusion<T>()` takes a single generic parameter: the shape of your context object. This type propagates through every middleware, every handler, every tool — fully inferred. You define the shape once and never cast again. The `f` instance is your entry point for everything: `f.tool()`, `f.presenter()`, `f.middleware()`. All of them inherit `AppContext` at the type level.

### Middleware — identity before logic {#middleware-example}

```typescript
const auth = f.middleware(async (ctx) => {
  const payload = await verifyJWT((ctx as any).rawToken);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
  });
  return { db: prisma, user };
});
```

Middleware in MCP Fusion works like tRPC: you return an object, and that object is merged into `ctx` via `Object.assign`. After `auth` runs, `ctx.db` and `ctx.user` exist with full type inference — no manual wiring. If `verifyJWT` throws, the handler never executes. The agent receives a structured error, not a stack trace. This is the first security boundary: unauthenticated calls are rejected before any business logic runs.

### Presenter — the perception boundary {#presenter-example}

```typescript
const InvoicePresenter = f.presenter({
  name: 'Invoice',
  schema: z.object({
    id: z.string(),
    customer: z.string(),
    amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
    status: z.enum(['draft', 'sent', 'paid', 'overdue']),
  }),
  rules: (inv) => [
    inv.status === 'overdue'
      ? 'This invoice is overdue. Consider sending a reminder before any other action.'
      : null,
  ],
  suggestActions: (inv) => [
    inv.status === 'draft'
      ? { tool: 'billing.send', args: { id: inv.id } }
      : null,
    inv.status === 'overdue'
      ? { tool: 'billing.remind', args: { id: inv.id } }
      : null,
  ].filter(Boolean),
});
```

This is the concept that separates MCP Fusion from every other MCP framework. The `schema` declares exactly which fields the agent is allowed to see — four fields, not the 15+ columns in the database row. Fields like `internal_cost`, `profit_margin`, `customer_email`, `stripe_payment_intent_id` are never declared, so they are stripped by `Zod.parse()` before reaching the wire. The default is invisible, not visible.

But the Presenter does more than filter. `rules` injects domain knowledge that travels _with_ the data — the agent doesn't guess that an overdue invoice needs attention, the data tells it. `suggestActions` provides HATEOAS-style affordances: a draft invoice suggests `billing.send`, an overdue one suggests `billing.remind`. The agent doesn't hallucinate tool names — the valid next actions arrive with pre-populated arguments.

### Tool — the handler only queries data {#tool-example}

```typescript
const getInvoice = f.tool({
  name: 'billing.get',
  description: 'Retrieve an invoice by ID',
  input: z.object({ id: z.string() }),
  middleware: [auth],
  returns: InvoicePresenter,
  handler: async ({ input, ctx }) => {
    return ctx.db.invoice.findUniqueOrThrow({
      where: { id: input.id, tenantId: ctx.user.tenantId },
    });
  },
});
```

Notice what the handler _doesn't_ do: it doesn't check authentication (middleware already did), it doesn't filter fields (Presenter will), it doesn't format the response (Presenter will), it doesn't suggest next steps (Presenter will). The handler's only job is to query data. Everything else is separated into dedicated layers that execute in a deterministic order, every time, for every tool.

The handler returns the full database row — 10+ columns. The Presenter strips it to `{ id, customer, amount_cents, status }`, attaches a contextual rule about the overdue status, and suggests the next action based on state. The agent receives a structured perception package, not a raw database dump.

---

## Installation {#installation}

MCP Fusion requires Node.js 18+ and works with any MCP SDK-compatible transport (stdio, HTTP, WebSocket).

::: code-group
```bash [npm]
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [pnpm]
pnpm add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [yarn]
yarn add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
:::

These three packages are all you need to build a complete MCP server. `@vinkius-core/mcp-fusion` provides the framework (tools, Presenters, middleware, registry, observability). `@modelcontextprotocol/sdk` provides the MCP transport layer. `zod` provides schema validation used throughout the pipeline.

::: info
For OpenAPI code generation, Prisma integration, OAuth flows, n8n connectors, or the testing library, see the respective package pages: [OpenAPI Generator](/openapi-gen), [Prisma Generator](/prisma-gen), [OAuth](/oauth), [n8n Connector](/n8n-connector), [Testing](/testing).
:::

---

## The Pipeline {#pipeline}

Every tool call runs through the same deterministic pipeline. Understanding this pipeline is key to understanding MCP Fusion, because it explains _why_ each layer exists and _when_ each executes:

```text
MCP request arrives
    ↓
contextFactory(extra)          → seed context (raw token, request ID)
    ↓
middleware[0], [1], [2]...     → each merges derived properties into ctx
    ↓                            (if any throws, handler is skipped)
Zod input validation           → rejects invalid or undeclared input
    ↓
handler({ input, ctx })        → returns raw data (database rows, API responses)
    ↓
Presenter pipeline:
  1. Truncate (agentLimit)     → caps large collections, injects guidance
  2. Validate (Zod schema)     → strips undeclared output fields
  3. Embed (child Presenters)  → composes nested entities
  4. Render (UI blocks)        → ECharts, Mermaid, summaries
  5. Attach (domain rules)     → contextual instructions for the agent
  6. Suggest (next actions)    → HATEOAS-style affordances
    ↓
Agent receives structured perception package
```

No step is optional in terms of order. Every tool, every call, same pipeline. The developer controls _what_ each step does; the framework controls _that_ it happens. You can't accidentally skip validation, you can't bypass the Presenter, and you can't run middleware out of order.

::: tip
The Presenter pipeline has six stages, but you don't need to use all of them. A Presenter with only `name` and `schema` still enforces field stripping. `rules`, `suggestActions`, `ui`, `embeds`, and `agentLimit` are all optional. Start with a schema and add stages as your needs grow.
:::

---

## What This Gives You {#benefits}

### You Don't Leak Data by Default

The Presenter's Zod schema is an allowlist — undeclared fields are stripped at parse time. A database migration that adds a column doesn't change what the agent sees. The schema hasn't changed, so the new column is invisible. The default is secure, not permissive.

### Agents Get Context, Not Just Data

`rules` and Zod `.describe()` attach interpretation instructions to each response. The agent doesn't guess that `amount_cents` is in cents — the data tells it. Domain knowledge travels _with_ the data, not in a system prompt the developer hopes the agent reads.

### Agents Know What to Do Next

`suggestActions` provides HATEOAS-style affordances based on state. A draft invoice suggests `billing.send`. An overdue invoice suggests `billing.remind`. The agent doesn't hallucinate tool names — valid next actions arrive with pre-populated arguments.

### Large Results Don't Destroy Accuracy

`agentLimit` truncates collections before they reach the context window. 10,000 rows become 50, with guidance to filter. Without this, agent accuracy degrades as context length increases — a well-documented LLM limitation.

### The Tool Surface Is Auditable

`mcp-fusion.lock` is a git-diffable snapshot of every tool's behavioral contract — schemas, tags, middleware chain, destructive flags. PR diffs show exactly what changed in the capability surface. See the [Governance Stack](/governance/).

### The Server's Integrity Is Provable

HMAC-SHA256 attestation signs the behavioral surface. The server can prove at runtime it hasn't been tampered with since the last signed release — critical for regulated industries.

---

## Where to Go Next {#next-steps}

**If you want to write code now:**
- [Quickstart](/quickstart) — your first MCP tool in 5 minutes, zero configuration
- [Enterprise Quickstart](/enterprise-quickstart) — auth, Presenters, observability in 15 minutes

**If you want to understand the architecture:**
- [The MVA Pattern](/mva-pattern) — why Model-View-Agent replaces Model-View-Controller for agents
- [Architecture Internals](/architecture) — the two-layer domain model and build-time strategy engine

**If you need to evaluate this for production:**
- [Security & Authentication](/enterprise/security) — middleware pipelines, tag-based access control, Presenter as security boundary
- [Observability & Audit](/enterprise/observability) — structured debug events, OpenTelemetry tracing, SOC 2 alignment
- [Capability Governance](/governance/) — lockfile, contract diffing, zero-trust attestation
