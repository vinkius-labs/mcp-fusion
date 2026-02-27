# Introduction

<div class="ms-badges">
<a href="https://github.com/vinkius-labs/mcp-fusion/releases"><img src="https://img.shields.io/badge/First%20Release-Feb%2012%2C%202026-blue" alt="First Release"></a>
<a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion"><img src="https://img.shields.io/npm/dt/@vinkius-core/mcp-fusion" alt="Downloads"></a>
<a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion"><img src="https://img.shields.io/npm/dw/@vinkius-core/mcp-fusion" alt="Weekly Downloads"></a>
<a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
<a href="https://bundlephobia.com/package/@vinkius-core/mcp-fusion"><img src="https://img.shields.io/bundlephobia/minzip/@vinkius-core/mcp-fusion" alt="Package Size"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript" alt="TypeScript"></a>
<a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square" alt="MCP SDK"></a>
<a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square" alt="License"></a>
<a href="https://github.com/vinkius-labs/mcp-fusion/stargazers"><img src="https://img.shields.io/github/stars/vinkius-labs/mcp-fusion?style=flat-square&color=gold" alt="GitHub Stars"></a>
<img src="https://img.shields.io/badge/Built%20with-%F0%9F%9A%80%20by%20Vinkius-%23000000" alt="Built with 🚀 by Vinkius">
</div>

MCP Fusion is an architecture layer for the Model Context Protocol. It separates three concerns that every raw MCP server mixes into a single handler: **who can call what** (middleware pipeline), **what the agent sees** (Presenter with Zod schema), and **whether the surface is trustworthy** (governance lockfile + HMAC attestation).

This separation is the **MVA (Model-View-Agent)** pattern. The handler returns raw data (Model). The Presenter shapes perception (View). The middleware governs access (Agent).

## How It Looks {#in-practice}

A complete invoice tool with authentication, AI instructions, field-level protection, and action affordances.

### 1. Context Init

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string; tenantId: string };
}
const f = initFusion<AppContext>();
```

`initFusion<T>()` takes your context shape as a generic. This type propagates through every builder — fully inferred. The `f` instance is your entry point for semantic verbs: `f.query()`, `f.mutation()`, and `f.action()`.

### 2. Presenter (The View)

```typescript
const InvoicePresenter = f.presenter({
  name: 'Invoice',
  schema: z.object({
    id: z.string(),
    amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
    status: z.enum(['draft', 'sent', 'paid', 'overdue']),
  }),
  rules: (inv) => [
    inv.status === 'overdue' ? 'invoice is overdue. Mention it to the user.' : null,
  ],
  suggest: (inv) => [
    inv.status === 'draft' ? suggest('billing.send', 'Send invoice', { id: inv.id }) : null,
  ].filter(Boolean),
});
```

The `schema` is an allowlist. Only declared fields reach the agent. `rules` and `suggest` provide **Agentic HATEOAS** — the AI doesn't guess; it follows explicit affordances.

### 3. Tool (The Agentic API)

We use **Semantic Verbs** to define the behavior. `f.query()` is read-only, while `f.mutation()` signals destructive side-effects.

```typescript
export const getInvoice = f.query('billing.get')
  .describe('Retrieve an invoice by ID')
  .instructions('Use only when the user refers to a specific invoice ID.')
  .withString('id', 'The unique invoice identifier')
  .returns(InvoicePresenter)
  .use(async ({ ctx, next }) => {
     // middleware: auth, tenant injection, etc.
     const user = await auth.verify(ctx.token);
     return next({ ...ctx, user });
  })
  .handle(async (input, ctx) => {
    // Handler receives typed input and enriched ctx
    return ctx.db.invoice.findUnique({
      where: { id: input.id, tenantId: ctx.user.tenantId },
    });
  });
```

---

## Installation {#installation}

```bash
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```

Node.js 18+. Works with any MCP SDK-compatible transport (stdio, HTTP, WebSocket).

## Why This Matters {#benefits}

**Data stays private by default.** The Presenter's Zod schema is an allowlist. A database migration that adds a column doesn't change what the agent sees — the new column is invisible unless you declare it.

**AI-First DX.** `.instructions()` embeds prompt engineering directly into the tool definition. The agent gets context, not just data.

**Deterministic Recovery.** `suggest` sends valid next actions with pre-populated arguments. No hallucinated tool names.

**Audit & Governance.** `mcp-fusion.lock` captures every tool's behavioral contract. PR diffs show what changed. See [Governance](/governance/).
