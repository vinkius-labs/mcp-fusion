<div align="center">
  <h1>⚡️ MCP Fusion</h1>
  <p>MVA (Model-View-Agent) framework for the Model Context Protocol.</p>

  [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
  [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE)
</div>

<p align="center">
  <a href="https://mcp-fusion.vinkius.com/">Documentation</a> · 
  <a href="https://mcp-fusion.vinkius.com/quickstart">Quickstart</a> ·
  <a href="https://mcp-fusion.vinkius.com/api-reference">API Reference</a> ·
  <a href="https://mcp-fusion.vinkius.com/examples">Examples</a> ·
  <a href="https://mcp-fusion.vinkius.com/cost-and-hallucination">Why MCP Fusion</a>
</p>

---

# The MCP Fusion Manifesto

**From Spaghetti Code to Enterprise Agentic Infrastructure**

Every MCP server in the ecosystem today is built the exact same way: a monolithic `switch/case` handler, `JSON.stringify()` as the entire response strategy, zero validation, and zero separation of concerns. It is an architecture that would look outdated in 2005.

**The "Naked JSON" Anti-Pattern is catastrophic for production AI:**

* **Context Bloat:** 50 API operations become 50 individual tools, flooding the LLM's context window with 10,000 tokens of dead schema before a single prompt is even sent.
* **Data Leaks (SOC2 Violations):** Handlers blindly dump raw database rows. Internal IDs, password hashes, and tenant flags bypass security and flow completely unfiltered straight into the LLM.
* **OOM Crashes:** A single `list_all` returns 10,000 rows, blowing through the context window and crashing your Node.js server.
* **The "System Prompt" Tax:** You compensate by packing a 2,000-token global prompt with rules for *every* entity, paying Anthropic/OpenAI for it on *every single turn* regardless of relevance.
* **Hallucination Loops:** The agent hallucinates parameter names because boundaries are weak. It guesses the next step because nothing tells it what actions are valid.

Every wrong guess costs you a full retry—burning input tokens, output tokens, latency, and your API bill.

---

### The Paradigm Shift: Model-View-Agent (MVA)

**MCP Fusion** is a rigorous TypeScript framework that elevates Model Context Protocol (MCP) to an Enterprise Engineering discipline. It introduces the **Model-View-Agent (MVA)** paradigm, giving LLMs their first dedicated Presentation Layer.

You don't just wrap the MCP protocol; you govern the agent.

**Cognitive Routing & Token FinOps**
Stop flooding the context. Your server consolidates 50 flat operations into 5 discriminator-routed tools. Schema footprint drops from ~10,000 to ~1,670 tokens. **TOON encoding** compresses JSON payloads, reducing wire tokens by ~40%.

**The Egress Firewall (Presenter Layer)**
The **Presenter** is the strict membrane between your data and the LLM. It passes responses through Zod, physically stripping undeclared fields (PII, passwords) in RAM before they ever touch the network. It auto-truncates oversized collections via `.agentLimit()` and renders server-side UI blocks for the client.

**Just-In-Time (JIT) Prompting & Self-Healing**
Domain rules now travel *with* the data state, not in a bloated global prompt. The Presenter suggests valid next actions based on current data, eliminating LLM guesswork.

* `.strict()` automatically rejects hallucinated parameters with per-field correction prompts.
* `toolError()` returns structured recovery hints instead of dead ends.

**Enterprise Resilience & Traffic Control**
Concurrent destructive mutations are strictly serialized through an async mutex. Per-tool concurrency limits gate simultaneous executions with backpressure queuing and load shedding. Egress guards measure payload bytes and truncate before OOM. RFC 7234 cache-control and causal invalidation prevent the agent from acting on stale data. Tag-based RBAC gates tool visibility per session.

**Next-Gen DX & The Ingestion Ecosystem**
tRPC-style type-safe clients, OpenTelemetry tracing built-in, `Object.freeze()` immutability after build, and `PromptMessage.fromView()` to decompose any Presenter into prompt messages from the exact same source of truth.

Don't write boilerplate. Parasitize the infrastructure you already have:

* **Legacy APIs:** `openapi-gen` compiles an OpenAPI spec into a fully-typed MVA server in one command.
* **Databases:** `prisma-gen` reads your `schema.prisma` annotations to auto-generate LLM-safe CRUD tools with Tenant Isolation and OOM protection.
* **Visual Workflows:** `n8n` connector auto-discovers and live-syncs hundreds of webhooks into typed, AI-callable tools.

**You write the business logic. MCP Fusion builds the server.**

---


## Overview

**MCP Fusion** adds an MVA Presenter layer between your data and the AI agent. The Presenter validates data through a Zod schema, strips undeclared fields, attaches just-in-time domain rules, renders UI blocks server-side, and suggests next actions — all before the response reaches the network.

```text
Model (Zod Schema) → View (Presenter) → Agent (LLM)
   validates            perceives          acts
```

The Presenter is domain-level, not tool-level. Define `InvoicePresenter` once — every tool that returns invoices uses it. Same validation, same rules, same UI, same affordances.

## Installation

```bash
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk
```

**Zod is optional.** MCP Fusion has a built-in JSON param descriptor system — you can define every tool, prompt, and action without ever importing Zod. Add it only if you want runtime schema validation on Presenters:

```bash
npm install zod  # optional — only needed for Presenters
```

## Quick Start

### 1. Initialize Fusion (one file, one line)

```typescript
// src/fusion.ts
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
    db: PrismaClient;
    user: { id: string; role: string };
}

export const f = initFusion<AppContext>();
```

Every `f.tool()`, `f.prompt()`, `f.presenter()`, and `f.middleware()` call inherits `AppContext` — zero generic repetition anywhere in the codebase.

### 2. Define a Presenter — The Egress Firewall

**Before:** Every MCP server returns raw `JSON.stringify()` — the handler picks which fields to include, formats the response, writes system rules in a global prompt, and hopes nobody leaks `password_hash`. This is repeated in every handler, for every entity, on every endpoint.

**After:** The Presenter is a single, domain-level egress contract. It sits between your handler and the wire. Zod validates and strips undeclared fields in RAM, domain rules travel with the data (not in a global prompt), UI blocks render server-side, oversized collections truncate with guidance, and affordances tell the agent what to do next. **Define it once. Every tool and prompt that returns that entity uses the same Presenter — same validation, same rules, same UI, same security boundary.**

```typescript
// src/presenters/invoice.ts
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: z.object({
        id: z.string(),
        amount_cents: z.number().describe('CRITICAL: value is in CENTS. Divide by 100 for display.'),
        status: z.enum(['paid', 'pending', 'overdue']),
        client_name: z.string(),
        due_date: z.string(),
    }),
    // autoRules: true (default) — Zod .describe() annotations become system rules automatically
    ui: (inv) => [
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ],
    collectionUi: (items) => [
        ui.summary({ total: items.length, showing: Math.min(items.length, 50) }),
    ],
    agentLimit: { max: 50, onTruncate: (n) => ui.summary({ omitted: n, hint: 'Use date/status filters.' }) },
    suggestActions: (inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment', args: { id: inv.id } }]
        : [],
    embeds: [{ key: 'client', presenter: ClientPresenter }],
});
```

**What the Presenter does automatically — every time, on every tool response:**

```text
📄 DATA       → Zod-validated. password_hash, internal_flags — physically STRIPPED in RAM.
📋 RULES      → "CRITICAL: amount_cents is in CENTS. Divide by 100." (from .describe())
📊 UI         → ECharts gauge — server-rendered, deterministic, no hallucination.
⚠️ GUARDRAIL  → "50 shown, 200 hidden. Use date/status filters."
🔗 AFFORDANCE → "→ billing.pay: Process payment"
👶 EMBEDS     → Child Presenters (client, items) inherit the same pipeline.
```

> **The Egress Firewall.** Your handler returns raw database rows. The Presenter's Zod schema acts as a whitelist: only declared fields survive. PII, password hashes, internal IDs — gone before they touch the network. This is **SOC2-auditable in CI/CD**.

### 3. Define a Tool — No Zod Required

```typescript
// src/tools/billing.ts
import { f } from '../fusion';
import { InvoicePresenter } from '../presenters/invoice';

export const getInvoice = f.tool({
    name: 'billing.get_invoice',
    description: 'Retrieve an invoice by ID',
    input: { id: 'string' },           // ← JSON descriptor, no Zod import
    readOnly: true,
    returns: InvoicePresenter,          // ← Presenter does the rest
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique({ where: { id: input.id } });
    },
});

export const listInvoices = f.tool({
    name: 'billing.list_invoices',
    input: {
        status: { enum: ['paid', 'pending', 'overdue'] as const, optional: true },
        limit: { type: 'number', min: 1, max: 100, optional: true },
    },
    readOnly: true,
    returns: InvoicePresenter,          // ← same Presenter, collection mode
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findMany({ where: input });
    },
});
```

The handler returns **raw data**. The Presenter validates it, strips undeclared fields, attaches domain rules, renders UI, truncates at 50 items with guidance, and suggests next actions. **You never write response formatting code.**

**MCP Fusion auto-converts** JSON descriptors to Zod schemas internally — you get full `.strict()` validation, hallucination rejection, and actionable errors without ever writing `z.object()`.

> **Want Zod?** Just pass a `z.object()` to `input:` instead. Both work everywhere.

### 4. Define a Prompt — Powered by the Presenter

```typescript
// src/prompts/audit.ts
import { f } from '../fusion';
import { InvoicePresenter } from '../presenters/invoice';
import { PromptMessage } from '@vinkius-core/mcp-fusion';

export const AuditPrompt = f.prompt('financial_audit', {
    description: 'Deep financial audit on a specific invoice',
    args: {
        invoiceId: 'string',
        depth: { enum: ['quick', 'thorough'] as const },
        since: { type: 'string', optional: true, description: 'ISO 8601 date filter' },
    } as const,
    handler: async (ctx, { invoiceId, depth }) => {
        const invoice = await ctx.db.invoices.get(invoiceId);
        return {
            messages: [
                PromptMessage.system('You are a Senior Financial Auditor.'),
                // ↓ THE BRIDGE — Presenter data becomes prompt context
                ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
                PromptMessage.user(`Perform a ${depth} audit on this invoice.`),
            ],
        };
    },
});
```

`PromptMessage.fromView()` decomposes the Presenter into XML-tagged prompt messages — `<domain_rules>`, `<dataset>`, `<visual_context>`, `<system_guidance>`. **Same source of truth as tools.** The LLM gets the exact same validated data, the exact same rules, the exact same affordances — whether through a tool response or a prompt.

### 5. Bootstrap the Server

```typescript
// src/server.ts
import { ToolRegistry, PromptRegistry } from '@vinkius-core/mcp-fusion';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { f } from './fusion';
import { getInvoice, listInvoices } from './tools/billing';
import { AuditPrompt } from './prompts/audit';

// Tools
const tools = f.registry();
tools.register(getInvoice);
tools.register(listInvoices);

// Prompts
const prompts = new PromptRegistry<AppContext>();
prompts.register(AuditPrompt);

// Start
const server = new Server(
    { name: 'my-billing-server', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {} } },
);

tools.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
prompts.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### JSON Param Descriptor Reference

These descriptors work **everywhere** — `f.tool()`, `defineTool()`, `definePrompt()`, `f.prompt()`:

| Descriptor | Generates |
|---|---|
| `'string'` | `z.string()` |
| `'number'` | `z.number()` |
| `'boolean'` | `z.boolean()` |
| `{ type: 'string', min: 1, max: 100 }` | `z.string().min(1).max(100)` |
| `{ type: 'number', min: 0, max: 100 }` | `z.number().min(0).max(100)` |
| `{ type: 'string', optional: true }` | `z.string().optional()` |
| `{ type: 'string', regex: '^\\d+$' }` | `z.string().regex(/^\\d+$/)` |
| `{ enum: ['a', 'b', 'c'] as const }` | `z.enum(['a', 'b', 'c'])` |
| `{ type: 'string', description: '...' }` | `z.string().describe('...')` |

## Features

### 🎯 The Presenter — Egress Firewall & Perception Layer

**The architectural problem every MCP server shares:** the handler owns the response shape. It decides which fields to include, how to format them, what rules to attach, and when to truncate. This logic is duplicated across every handler, drifts between tools, and is invisible to security audits.

**The Presenter inverts this.** It is a domain-level egress contract — a typed, composable pipeline that sits between `handler return` and `wire serialization`. The handler returns raw data; the Presenter validates it through Zod (stripping undeclared fields in RAM), injects just-in-time domain rules, renders deterministic UI blocks, truncates oversized collections with actionable guidance, and suggests valid next actions. The same `InvoicePresenter` governs every tool and every prompt that touches invoices — one contract, one security boundary, one source of truth.

**Before and After:**

```text
BEFORE (every MCP server today)         AFTER (MCP Fusion Presenter)
─────────────────────────────────       ─────────────────────────────────
Handler formats its own response   →    Handler returns raw data
Fields chosen ad-hoc per handler   →    Zod schema is the field whitelist
password_hash leaks silently       →    Undeclared fields stripped in RAM
Rules live in global system prompt →    Rules travel with the data (JIT)
10,000 rows → OOM crash            →    .agentLimit(50) + filter guidance
Agent guesses next action          →    .suggestActions() → HATEOAS hints
Response format drifts per tool    →    One Presenter per entity, everywhere
```

**Two APIs. Same power. Your choice:**

<details>
<summary><b>definePresenter() — Declarative Object Config (Recommended)</b></summary>

```typescript
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: z.object({
        id: z.string(),
        amount_cents: z.number().describe('CRITICAL: in CENTS. Divide by 100 for display.'),
        status: z.enum(['paid', 'pending', 'overdue']),
        client_name: z.string(),
    }),
    // autoRules: true (default) — .describe() annotations become system rules
    ui: (inv) => [
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ],
    collectionUi: (items) => [
        ui.summary({ total: items.length, showing: Math.min(items.length, 50) }),
    ],
    agentLimit: { max: 50, onTruncate: (n) => ui.summary({ omitted: n, hint: 'Use filters.' }) },
    suggestActions: (inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment', args: { id: inv.id } }]
        : [],
    embeds: [{ key: 'client', presenter: ClientPresenter }],
});
```

</details>

<details>
<summary><b>createPresenter() — Fluent Builder Chain</b></summary>

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
        client_name: z.string(),
    }))
    .systemRules(['CRITICAL: amount_cents is in CENTS. Divide by 100.'])
    .systemRules((inv, ctx) => ctx?.user?.role !== 'admin' ? ['Mask exact totals.'] : [])
    .uiBlocks((inv) => [
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ])
    .agentLimit(50, (omitted) => ui.summary({ omitted, hint: 'Use filters.' }))
    .suggestActions((inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment' }]
        : []
    )
    .embed('client', ClientPresenter);
```

</details>

**What the Presenter gives you — on every single response, automatically:**

| Layer | What It Does | Why It Matters |
|---|---|---|
| **Egress Firewall** | Zod `.parse()` strips undeclared fields in RAM | `password_hash`, internal IDs — gone before they touch the wire. SOC2-auditable. |
| **JIT System Rules** | Domain rules travel with data, not in a bloated global prompt | "amount is in CENTS" only appears when invoices are returned. Zero wasted tokens. |
| **Server-Rendered UI** | ECharts, Mermaid, summaries — deterministic, no hallucination | The AI doesn't guess chart config. The server renders it. |
| **Cognitive Guardrails** | `.agentLimit()` truncates + injects filter guidance | 10,000 rows → 50 shown + "Use date/status filters." No OOM, no context explosion. |
| **Action Affordances** | `.suggestActions()` tells the AI what to do next | Status = "pending" → "→ billing.pay". Eliminates hallucinated guesswork. |
| **Relational Composition** | `.embed()` / `embeds:` — child Presenters inherit the full pipeline | InvoicePresenter embeds ClientPresenter. Rules, UI, affordances cascade. |
| **Prompt Bridge** | `PromptMessage.fromView()` decomposes Presenter into prompt messages | Same source of truth for tools AND prompts. Zero duplication. |

> **Domain-level, not tool-level.** Define `InvoicePresenter` once — every tool and prompt that returns invoices uses the same contract. Same validation, same egress boundary, same rules, same UI, same affordances. This is what makes the Presenter an architectural primitive, not a convenience wrapper.

→ [Presenter docs](https://mcp-fusion.vinkius.com/presenter) · [definePresenter()](https://mcp-fusion.vinkius.com/dx-guide#definepresenter-object-config-instead-of-builder) · [Anatomy](https://mcp-fusion.vinkius.com/mva/presenter-anatomy) · [Context Tree-Shaking](https://mcp-fusion.vinkius.com/mva/context-tree-shaking)

### Zero-Friction DX — `initFusion()` + `f.tool()` + `f.prompt()`

Define your context type **once**. Every factory method inherits it automatically — zero generic noise, tRPC-style `{ input, ctx }` handler. **No Zod required** — JSON descriptors work everywhere.

```typescript
// src/fusion.ts — ONE file for the entire project
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext { db: PrismaClient; user: { id: string; role: string } }
export const f = initFusion<AppContext>();

// src/tools/billing.ts — No Zod, No Generics
import { f } from '../fusion';

export const getInvoice = f.tool({
    name: 'billing.get_invoice',
    input: { id: 'string' },          // JSON descriptor → Zod internally
    readOnly: true,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique({ where: { id: input.id } });
    },
});

// src/prompts/summary.ts — Prompts are equally clean
import { f } from '../fusion';
import { PromptMessage } from '@vinkius-core/mcp-fusion';

export const SummaryPrompt = f.prompt('summarize_invoice', {
    args: {
        invoiceId: 'string',
        format: { enum: ['brief', 'detailed'] as const },
    } as const,
    handler: async (ctx, { invoiceId, format }) => ({
        messages: [
            PromptMessage.system('You are a Financial Analyst.'),
            PromptMessage.user(`Summarize invoice ${invoiceId} (${format}).`),
        ],
    }),
});
```

→ [DX Guide](https://mcp-fusion.vinkius.com/dx-guide)

### File-Based Routing — `autoDiscover()`

Drop a file → it's a tool. No central import file, no merge conflicts.

```typescript
import { autoDiscover } from '@vinkius-core/mcp-fusion';

// src/tools/billing/get_invoice.ts → billing.get_invoice
// src/tools/users/list.ts → users.list
await autoDiscover(registry, './src/tools');
```

→ [DX Guide — autoDiscover](https://mcp-fusion.vinkius.com/dx-guide#file-based-routing-autodiscover)

### HMR Dev Server

File changes reload tools **without** restarting the LLM client. The dev server sends `notifications/tools/list_changed` — the client picks up new definitions transparently.

```typescript
import { createDevServer, autoDiscover } from '@vinkius-core/mcp-fusion/dev';

const devServer = createDevServer({
    dir: './src/tools',
    setup: async (registry) => await autoDiscover(registry, './src/tools'),
    onReload: (file) => console.log(`♻️ Reloaded: ${file}`),
    server: mcpServer,
});
await devServer.start();
```

→ [DX Guide — DevServer](https://mcp-fusion.vinkius.com/dx-guide#hmr-dev-server-createdevserver)

### Standard Schema — Beyond Zod

Decouple from Zod. Use **any** Standard Schema v1 validator — Valibot (~1kb), ArkType (~5kb), TypeBox (~4kb).

```typescript
import * as v from 'valibot';
import { autoValidator } from '@vinkius-core/mcp-fusion/schema';

const validator = autoValidator(v.object({ name: v.string() }));
const result = validator.validate({ name: 'Alice' });
// { success: true, data: { name: 'Alice' } }
```

→ [DX Guide — Standard Schema](https://mcp-fusion.vinkius.com/dx-guide#standard-schema-decouple-from-zod)

### Subpath Exports — Tree-Shake to Zero

Import only what you use. The bundler ships only the modules you reference.

```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion/client';     // ~2kb
import { ui } from '@vinkius-core/mcp-fusion/ui';                          // ~1kb
import { definePresenter } from '@vinkius-core/mcp-fusion/presenter';      // ~4kb
import { autoValidator } from '@vinkius-core/mcp-fusion/schema';           // ~2kb
import { autoDiscover, createDevServer } from '@vinkius-core/mcp-fusion/dev';
```

### Action Consolidation & Hierarchical Groups

50 actions → 5 tools. A discriminator enum routes to the correct action. Groups nest arbitrarily with `.group()`.

```typescript
createTool<AppContext>('platform')
    .group('users', 'User management', g => {
        g.use(requireAdmin)
         .action({ name: 'list', readOnly: true, handler: listUsers })
         .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
    })
    .group('billing', 'Billing operations', g => {
        g.action({ name: 'refund', destructive: true, schema: refundSchema, handler: issueRefund });
    });
// Discriminator values: users.list | users.ban | billing.refund
```

→ [Building Tools](https://mcp-fusion.vinkius.com/building-tools) · [Routing](https://mcp-fusion.vinkius.com/routing) · [Tool Exposition](https://mcp-fusion.vinkius.com/tool-exposition)

### Prompt Engine — No Zod Required

Full MCP `prompts/list` + `prompts/get` with JSON descriptors, `PromptMessage.fromView()`, and `f.prompt()`. **Same No-Zod DX as tools.**

```typescript
// No Zod — JSON descriptors auto-convert to flat schemas
const ReviewPrompt = f.prompt('code_review', {
    description: 'Review a pull request',
    args: {
        prUrl: { type: 'string', description: 'GitHub PR URL' },
        depth: { enum: ['quick', 'thorough', 'security'] as const },
        language: { type: 'string', optional: true },
    } as const,
    middleware: [requireAuth],
    handler: async (ctx, { prUrl, depth }) => {
        const pr = await ctx.github.getPullRequest(prUrl);
        return {
            messages: [
                PromptMessage.system(`You are a Senior ${depth} Code Reviewer.`),
                PromptMessage.user(`Review this PR:\n\n${pr.diff}`),
            ],
        };
    },
});

// With Presenter integration — fromView() decomposes data into XML-tagged messages
const AuditPrompt = f.prompt('financial_audit', {
    args: { invoiceId: 'string', depth: { enum: ['quick', 'thorough'] as const } } as const,
    handler: async (ctx, { invoiceId, depth }) => {
        const invoice = await ctx.db.invoices.get(invoiceId);
        return {
            messages: [
                PromptMessage.system('You are a Senior Financial Auditor.'),
                ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
                PromptMessage.user(`Perform a ${depth} audit on this invoice.`),
            ],
        };
    },
});
```

→ [Prompt Engine docs](https://mcp-fusion.vinkius.com/prompts)

### Middleware

tRPC-style context derivation with pre-compiled chains:

```typescript
const requireAuth = defineMiddleware(async (ctx: { token: string }) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user };  // merged into ctx, TS infers { user: User }
});
```

→ [Middleware docs](https://mcp-fusion.vinkius.com/middleware)

### Self-Healing Errors

Structured errors with recovery instructions, severity levels, and action affordances:

```typescript
return toolError('NOT_FOUND', {
    message: `Invoice '${id}' does not exist.`,
    suggestion: 'Call billing.list first to get valid IDs.',
    availableActions: ['billing.list'],
    severity: 'error',           // 'warning' | 'error' | 'critical'
    details: { entity_type: 'invoice' },
    retryAfter: 5,               // seconds
});
```

15 canonical error codes (`NOT_FOUND`, `RATE_LIMITED`, `CONFLICT`, etc.) plus custom string codes. Zod `.strict()` on all input schemas — hallucinated parameters rejected with per-field correction prompts.

→ [Error Handling docs](https://mcp-fusion.vinkius.com/error-handling) · [Cognitive Guardrails](https://mcp-fusion.vinkius.com/mva/cognitive-guardrails)

### Type-Safe Client

End-to-end type inference from server to client, with middleware, structured error parsing, and batch execution:

```typescript
import { createFusionClient, FusionClientError } from '@vinkius-core/mcp-fusion/client';
import type { AppRouter } from './server';

const client = createFusionClient<AppRouter>(transport, {
    middleware: [authMiddleware, logMiddleware],
    throwOnError: true,
});

// Single call — full autocomplete + arg validation
const result = await client.execute('billing.get_invoice', { workspace_id: 'ws_1', id: 'inv_42' });

// Batch calls — parallel by default
const [projects, invoices] = await client.executeBatch([
    { action: 'projects.list', args: { status: 'active' } },
    { action: 'billing.list_invoices', args: { workspace_id: 'ws_1' } },
]);

// Structured error handling
try {
    await client.execute('billing.refund', { invoice_id: 'inv_999' });
} catch (err) {
    if (err instanceof FusionClientError) {
        console.log(err.code, err.recovery, err.availableActions);
    }
}
```

→ [FusionClient docs](https://mcp-fusion.vinkius.com/fusion-client)

### State Sync

RFC 7234-inspired cache-control signals. Causal invalidation after mutations, with observability hooks and protocol notifications:

```typescript
tools.attachToServer(server, {
    stateSync: {
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'sprints.update', invalidates: ['sprints.*'] },
            { match: 'countries.*',    cacheControl: 'immutable' },
        ],
        onInvalidation: (event) => {
            metrics.increment('cache.invalidations', { tool: event.causedBy });
        },
        notificationSink: (n) => server.notification(n),
    },
});
```

Static policy analysis with `detectOverlaps()` catches first-match-wins ordering bugs at startup.

→ [State Sync docs](https://mcp-fusion.vinkius.com/state-sync)

### Observability & Tracing

Zero-overhead typed event system. OpenTelemetry-compatible tracing with structural subtyping:

```typescript
billing.debug(createDebugObserver());
tools.enableDebug(createDebugObserver((event) => opentelemetry.addEvent(event.type, event)));
tools.enableTracing(tracer);
```

→ [Observability](https://mcp-fusion.vinkius.com/observability) · [Tracing](https://mcp-fusion.vinkius.com/tracing)

### Runtime Guards

Per-tool concurrency limits, egress payload guards, and mutation serialization:

→ [Runtime Guards docs](https://mcp-fusion.vinkius.com/runtime-guards)

### Streaming Progress

Generator handlers yield progress events — automatically forwarded as MCP `notifications/progress`:

```typescript
handler: async function* (ctx, args) {
    yield progress(10, 'Cloning repository...');
    yield progress(50, 'Building AST...');
    yield progress(90, 'Running analysis...');
    return success(analysisResult);
}
```

### Testing — Deterministic AI Governance

The only AI framework where PII protection is **code-assertable** and **SOC2-auditable in CI/CD**:

```typescript
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';

const tester = createFusionTester(registry, {
    contextFactory: () => ({ prisma: mockPrisma, tenantId: 't_42', role: 'ADMIN' }),
});

// SOC2 CC6.1 — PII physically absent (not masked, REMOVED)
const result = await tester.callAction('db_user', 'find_many', { take: 5 });
expect(result.data[0]).not.toHaveProperty('passwordHash');

// SOC2 CC6.3 — GUEST blocked by middleware
const denied = await tester.callAction('db_user', 'find_many', { take: 5 }, { role: 'GUEST' });
expect(denied.isError).toBe(true);
```

**2ms per test. $0.00 in tokens. Zero servers. Deterministic on every CI run, on every machine.**

→ [Testing docs](https://mcp-fusion.vinkius.com/testing) · [CI/CD Integration](https://mcp-fusion.vinkius.com/testing/ci-cd) · [SOC2 Audit Patterns](https://mcp-fusion.vinkius.com/testing/egress-firewall)

## All Capabilities

| Capability | Mechanism |
|---|---|
| **Presenter — Egress Firewall & Perception Layer** | Zod whitelist stripping, JIT system rules, server-rendered UI, `.agentLimit()`, `.suggestActions()`, `.embed()`, `PromptMessage.fromView()` |
| **`definePresenter()`** | Object config API — zero builder chains, auto-rules from Zod `.describe()` |
| **`createPresenter()`** | Fluent builder — `.schema()`, `.systemRules()`, `.uiBlocks()`, `.suggestActions()`, `.embed()` |
| **`initFusion()`** | Define context once — `f.tool()`, `f.presenter()`, `f.prompt()`, `f.middleware()`, `f.registry()` |
| **No-Zod JSON Descriptors** | `'string'`, `{ type: 'number', min: 0 }`, `{ enum: [...] as const }` — auto-converted to Zod internally |
| **Prompt Engine** | `f.prompt()` / `definePrompt()` with JSON descriptors, `PromptMessage.fromView()`, hydration timeout |
| **File-Based Routing** | `autoDiscover(registry, dir)` — drop a file, it's a tool |
| **HMR Dev Server** | `createDevServer()` — file changes reload tools without restarting the LLM client |
| **Standard Schema** | `autoValidator()` — Zod, Valibot, ArkType, TypeBox support |
| **Subpath Exports** | `mcp-fusion/client`, `/ui`, `/presenter`, `/schema`, `/dev`, `/prompt`, `/testing` |
| **`createGroup()`** | Functional tool groups — closure-based, pre-composed middleware, frozen by default |
| **Cognitive Guardrails** | `.agentLimit(max, onTruncate)` — truncation + filter guidance |
| **Action Consolidation** | Multiple actions → single MCP tool with discriminator enum |
| **Hierarchical Groups** | `.group()` — namespace 5,000+ actions as `module.action` |
| **Context Derivation** | `defineMiddleware()` — tRPC-style typed context merging |
| **Self-Healing Errors** | `toolError()` — severity, details, retryAfter, HATEOAS actions |
| **Strict Validation** | Zod `.merge().strict()` — unknown fields rejected with actionable errors |
| **Type-Safe Client** | `createFusionClient<T>()` — middleware, `throwOnError`, `executeBatch()` |
| **Streaming Progress** | `yield progress()` → MCP `notifications/progress` |
| **Testing** | `createFusionTester()` — in-memory MVA emulator, SOC2 audit in CI/CD |
| **State Sync** | RFC 7234 cache-control — `invalidates`, `no-store`, `immutable`, `onInvalidation`, `detectOverlaps` |
| **Tool Exposition** | `'flat'` or `'grouped'` wire format |
| **Tag Filtering** | RBAC context gating — `{ tags: ['core'] }` / `{ exclude: ['internal'] }` |
| **Observability** | Zero-overhead debug observers + OpenTelemetry-compatible tracing |
| **Runtime Guards** | Per-tool concurrency limits, egress payload guards, mutation serialization |
| **TOON Encoding** | Token-Optimized Object Notation — ~40% fewer tokens |
| **Introspection** | Runtime metadata via `fusion://manifest.json` MCP resource |
| **Immutability** | `Object.freeze()` after `buildToolDefinition()` |

## Packages

| Package | Description |
|---|---|
| [`mcp-fusion-openapi-gen`](https://mcp-fusion.vinkius.com/openapi-gen) | OpenAPI 3.x → complete MCP Server generator. Parses any spec and emits Presenters, Tools, Registry, and server bootstrap — all configurable via YAML. |
| [`mcp-fusion-prisma-gen`](https://mcp-fusion.vinkius.com/prisma-gen) | Prisma Generator that reads `schema.prisma` annotations and emits hardened Presenters and ToolBuilders with field-level security, tenant isolation, and OOM protection. |
| [`mcp-fusion-n8n`](https://mcp-fusion.vinkius.com/n8n-connector) | Bidirectional translation driver: n8n REST API ↔ MCP in-memory objects. Auto-discovers webhook workflows, infers semantics from workflow Notes, enables in-memory MVA interception, and live-syncs tool lists with zero downtime. |
| [`@vinkius-core/mcp-fusion-testing`](https://mcp-fusion.vinkius.com/testing) | In-memory MVA lifecycle emulator. Runs the full execution pipeline (Zod → Middleware → Handler → Egress Firewall) without network transport. Returns structured `MvaTestResult` objects for SOC2-grade auditing. |
| [`@vinkius-core/mcp-fusion-oauth`](https://mcp-fusion.vinkius.com/oauth) | OAuth 2.0 Device Authorization Grant (RFC 8628) for MCP servers. Drop-in `createAuthTool()` with Device Flow, secure token storage, and `requireAuth()` middleware — provider agnostic. |

## Documentation

Full documentation available at **[mcp-fusion.vinkius.com](https://mcp-fusion.vinkius.com/)**.

| Guide | |
|---|---|
| [MVA Architecture](https://mcp-fusion.vinkius.com/mva-pattern) | The MVA pattern and manifesto |
| [**Presenter — Egress Firewall**](https://mcp-fusion.vinkius.com/presenter) | **Schema whitelist, JIT rules, UI blocks, affordances, composition, before/after architecture** |
| [Quickstart](https://mcp-fusion.vinkius.com/quickstart) | Build a Fusion server from zero |
| [DX Guide](https://mcp-fusion.vinkius.com/dx-guide) | `initFusion()`, `definePresenter()`, `autoDiscover()`, `createDevServer()`, Standard Schema |
| [Prompt Engine](https://mcp-fusion.vinkius.com/prompts) | `definePrompt()`, `PromptMessage.fromView()`, registry |
| [Context Tree-Shaking](https://mcp-fusion.vinkius.com/mva/context-tree-shaking) | JIT rules vs global system prompts |
| [Cognitive Guardrails](https://mcp-fusion.vinkius.com/mva/cognitive-guardrails) | Truncation, strict validation, self-healing |
| [Cost & Hallucination](https://mcp-fusion.vinkius.com/cost-and-hallucination) | Token reduction analysis |
| [Middleware](https://mcp-fusion.vinkius.com/middleware) | Context derivation, authentication |
| [State Sync](https://mcp-fusion.vinkius.com/state-sync) | Cache-control signals, causal invalidation |
| [Runtime Guards](https://mcp-fusion.vinkius.com/runtime-guards) | Concurrency limits, egress guards, mutation serialization |
| [Observability](https://mcp-fusion.vinkius.com/observability) | Debug observers, tracing |
| [OpenAPI Generator](https://mcp-fusion.vinkius.com/openapi-gen) | Generate a full MCP Server from any OpenAPI 3.x spec |
| [Prisma Generator](https://mcp-fusion.vinkius.com/prisma-gen) | Generate Presenters and ToolBuilders from `schema.prisma` annotations |
| [n8n Connector](https://mcp-fusion.vinkius.com/n8n-connector) | Turn n8n workflows into AI-callable tools — 5 engineering primitives |
| [Testing Toolkit](https://mcp-fusion.vinkius.com/testing) | In-memory MVA emulator, SOC2 audit patterns, test conventions |
| [OAuth](https://mcp-fusion.vinkius.com/oauth) | Device Flow authentication for MCP servers |
| [Cookbook](https://mcp-fusion.vinkius.com/examples) | Real-world patterns |
| [API Reference](https://mcp-fusion.vinkius.com/api-reference) | Complete typings |

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@modelcontextprotocol/sdk ^1.12.1` (peer dependency)
- `zod ^3.25.1 || ^4.0.0` (optional peer — only needed for Presenters and explicit Zod schemas)
