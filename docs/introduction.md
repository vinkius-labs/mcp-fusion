# Introduction

MCP Fusion is an architecture layer for the Model Context Protocol. It separates three concerns that every raw MCP server mixes into a single handler: **who can call what** (middleware pipeline), **what the agent sees** (Presenter with Zod schema), and **whether the surface is trustworthy** (governance lockfile + HMAC attestation).

This separation is the **MVA (Model-View-Agent)** pattern. The handler returns raw data (Model). The Presenter shapes perception (View). The middleware governs access (Agent). These layers are separated at the type level and at runtime — not mixed into one function where a missed check leaks data.

## How It Looks {#in-practice}

A complete invoice tool with authentication, field-level protection, domain rules, and affordances.

### Context

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string; tenantId: string };
}
const f = initFusion<AppContext>();
```

`initFusion<T>()` takes your context shape as a generic. This type propagates through every middleware, handler, and tool — fully inferred. Define it once, never cast again. The `f` instance is your entry point: `f.tool()`, `f.presenter()`, `f.middleware()`.

### Middleware

```typescript
const auth = f.middleware(async (ctx) => {
  const payload = await verifyJWT((ctx as any).rawToken);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
  });
  return { db: prisma, user };
});
```

Returns an object merged into `ctx` via `Object.assign`. After `auth` runs, `ctx.db` and `ctx.user` exist with full type inference. If `verifyJWT` throws, the handler never executes — the agent receives a structured error, not a stack trace.

### Presenter

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

The `schema` declares four allowed fields — not the 15+ in the database. Undeclared fields like `internal_cost`, `profit_margin`, `stripe_payment_intent_id` are stripped by `Zod.parse()` before reaching the wire. The default is invisible, not visible.

`rules` injects domain knowledge that travels with the data. `suggestActions` provides HATEOAS-style affordances — the agent doesn't hallucinate tool names because valid next actions arrive with pre-populated arguments.

### Tool

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

The handler only queries data. It doesn't check auth (middleware did), filter fields (Presenter will), format the response (Presenter will), or suggest next steps (Presenter will). The handler returns the full database row; the Presenter strips it to `{ id, customer, amount_cents, status }`, attaches a contextual rule, and suggests the next action.

## Installation {#installation}

```bash
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```

Node.js 18+. Works with any MCP SDK-compatible transport (stdio, HTTP, WebSocket). For OpenAPI codegen, Prisma integration, OAuth, n8n, or the testing library, install the respective packages: `@vinkius-core/openapi-gen`, `mcp-fusion-prisma-gen`, `@vinkius-core/mcp-fusion-oauth`, `@vinkius-core/mcp-fusion-n8n`, `@vinkius-core/mcp-fusion-testing`.

## The Pipeline {#pipeline}

Every tool call runs through the same pipeline:

```text
contextFactory(extra)          → seed context
    ↓
middleware[0], [1], [2]...     → merge derived state into ctx
    ↓                            (throw = handler skipped)
Zod input validation           → reject invalid input
    ↓
handler({ input, ctx })        → return raw data
    ↓
Presenter pipeline:
  1. Truncate (agentLimit)     → cap large collections
  2. Validate (Zod schema)     → strip undeclared fields
  3. Embed (child Presenters)  → compose nested entities
  4. Render (UI blocks)        → ECharts, Mermaid, summaries
  5. Attach (domain rules)     → contextual instructions
  6. Suggest (next actions)    → HATEOAS affordances
    ↓
Agent receives structured perception package
```

The developer controls what each step does; the framework controls that it happens. You can't skip validation, bypass the Presenter, or run middleware out of order.

A Presenter with only `name` and `schema` still enforces field stripping. `rules`, `suggestActions`, `ui`, `embeds`, and `agentLimit` are all optional — start with a schema and add stages as needed.

## Why This Matters {#benefits}

**Data stays private by default.** The Presenter's Zod schema is an allowlist. A database migration that adds a column doesn't change what the agent sees — the new column is invisible unless you declare it.

**Agents get context, not just data.** `rules` and `.describe()` attach interpretation instructions to each response. The agent doesn't guess that `amount_cents` is in cents — the data tells it.

**Agents know what to do next.** `suggestActions` sends valid next actions with pre-populated arguments. No hallucinated tool names.

**Large results don't destroy accuracy.** `agentLimit` truncates collections before they reach the context window.

**The tool surface is auditable.** `mcp-fusion.lock` captures every tool's behavioral contract. PR diffs show what changed. See [Governance](/governance/).

**Integrity is provable.** HMAC-SHA256 attestation signs the behavioral surface for runtime tamper detection.
