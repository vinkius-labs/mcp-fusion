<div align="center">
  <h1>⚡️ MCP Fusion</h1>
  <p>MVA (Model-View-Agent) framework for the Model Context Protocol.</p>

  [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
  [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE)
</div>

<p align="center">
  <a href="https://vinkius-labs.github.io/mcp-fusion/">Documentation</a> · 
  <a href="https://vinkius-labs.github.io/mcp-fusion/quickstart">Quickstart</a> ·
  <a href="https://vinkius-labs.github.io/mcp-fusion/api-reference">API Reference</a> ·
  <a href="https://vinkius-labs.github.io/mcp-fusion/examples">Examples</a> ·
  <a href="https://vinkius-labs.github.io/mcp-fusion/cost-and-hallucination">Why MCP Fusion</a>
</p>

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
npm install @vinkius-core/mcp-fusion zod
```

**MCP Fusion** has a required peer dependency on `@modelcontextprotocol/sdk` and `zod`:

```bash
npm install @modelcontextprotocol/sdk @vinkius-core/mcp-fusion zod
```

## Quick Start

### 1. Define a Presenter

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .systemRules(['CRITICAL: amount_cents is in CENTS. Divide by 100 before display.'])
    .uiBlocks((invoice) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
    ])
    .agentLimit(50, (omitted) =>
        ui.summary(`⚠️ 50 shown, ${omitted} hidden. Use status or date_range filters.`)
    )
    .suggestActions((invoice) =>
        invoice.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : []
    );
```

### 2. Define a Tool

```typescript
import { defineTool } from '@vinkius-core/mcp-fusion';

const billing = defineTool<AppContext>('billing', {
    description: 'Billing operations',
    shared: { workspace_id: 'string' },
    actions: {
        get_invoice: {
            readOnly: true,
            returns: InvoicePresenter,
            params: { id: 'string' },
            handler: async (ctx, args) =>
                await ctx.db.invoices.findUnique({ where: { id: args.id } }),
        },
        create_invoice: {
            params: {
                client_id: 'string',
                amount: { type: 'number', min: 0 },
                currency: { enum: ['USD', 'EUR', 'BRL'] as const },
            },
            handler: async (ctx, args) =>
                await ctx.db.invoices.create({ data: args }),
        },
        void_invoice: {
            destructive: true,
            params: { id: 'string', reason: { type: 'string', optional: true } },
            handler: async (ctx, args) => {
                await ctx.db.invoices.void(args.id);
                return 'Invoice voided';
            },
        },
    },
});
```

### 3. Attach to Server

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const tools = new ToolRegistry<AppContext>();
tools.register(billing);

tools.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
```

The handler returns raw data. The framework does the rest:

```text
📄 DATA       → Zod-validated. Undeclared fields stripped.
📋 RULES      → "amount_cents is in CENTS. Divide by 100."
📊 UI         → ECharts gauge config — server-rendered, deterministic.
⚠️ GUARDRAIL  → "50 shown, 250 hidden. Use filters."
🔗 AFFORDANCE → "→ billing.pay: Process payment"
```

## Features

### Presenter — MVA View Layer

Domain-level perception layer with schema validation, JIT system rules, server-rendered UI blocks, cognitive guardrails, action affordances, and relational composition via `.embed()`.

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules((invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS.',
        ctx?.user?.role !== 'admin' ? 'Mask exact totals.' : null,
    ])
    .uiBlocks((inv) => [ui.echarts(chartConfig)])
    .agentLimit(50, (omitted) => ui.summary(`50 shown, ${omitted} hidden.`))
    .suggestActions((inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment' }]
        : []
    )
    .embed('client', ClientPresenter);
```

→ [Presenter docs](https://vinkius-labs.github.io/mcp-fusion/presenter) · [Anatomy](https://vinkius-labs.github.io/mcp-fusion/mva/presenter-anatomy) · [Context Tree-Shaking](https://vinkius-labs.github.io/mcp-fusion/mva/context-tree-shaking)

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

→ [Building Tools](https://vinkius-labs.github.io/mcp-fusion/building-tools) · [Routing](https://vinkius-labs.github.io/mcp-fusion/routing) · [Tool Exposition](https://vinkius-labs.github.io/mcp-fusion/tool-exposition)

### Prompt Engine

Full MCP `prompts/list` + `prompts/get` with `PromptMessage.fromView()` — decomposes a Presenter view into XML-tagged prompt messages. Same source of truth as tool responses, zero duplication.

```typescript
const AuditPrompt = definePrompt<AppContext>('financial_audit', {
    args: { invoiceId: 'string', depth: { enum: ['quick', 'thorough'] as const } } as const,
    middleware: [requireAuth, requireRole('auditor')],
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

→ [Prompt Engine docs](https://vinkius-labs.github.io/mcp-fusion/prompts)

### Middleware

tRPC-style context derivation with pre-compiled chains:

```typescript
const requireAuth = defineMiddleware(async (ctx: { token: string }) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user };  // merged into ctx, TS infers { user: User }
});
```

→ [Middleware docs](https://vinkius-labs.github.io/mcp-fusion/middleware)

### Self-Healing Errors

Structured errors with recovery instructions and suggested actions:

```typescript
return toolError('ProjectNotFound', {
    message: `Project '${id}' does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs.',
    availableActions: ['projects.list'],
});
```

Zod `.strict()` on all input schemas — hallucinated parameters rejected with per-field correction prompts.

→ [Error Handling docs](https://vinkius-labs.github.io/mcp-fusion/error-handling) · [Cognitive Guardrails](https://vinkius-labs.github.io/mcp-fusion/mva/cognitive-guardrails)

### Type-Safe Client

End-to-end type inference from server to client:

```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion/client';
import type { AppRouter } from './server';

const client = createFusionClient<AppRouter>(transport);
const result = await client.execute('billing.get_invoice', { workspace_id: 'ws_1', id: 'inv_42' });
```

→ [FusionClient docs](https://vinkius-labs.github.io/mcp-fusion/fusion-client)

### State Sync

RFC 7234-inspired cache-control signals. Causal invalidation after mutations:

```typescript
tools.attachToServer(server, {
    stateSync: {
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'sprints.update', invalidates: ['sprints.*'] },
            { match: 'countries.*',    cacheControl: 'immutable' },
        ],
    },
});
```

→ [State Sync docs](https://vinkius-labs.github.io/mcp-fusion/state-sync)

### Observability & Tracing

Zero-overhead typed event system. OpenTelemetry-compatible tracing with structural subtyping:

```typescript
billing.debug(createDebugObserver());
tools.enableDebug(createDebugObserver((event) => opentelemetry.addEvent(event.type, event)));
tools.enableTracing(tracer);
```

→ [Observability](https://vinkius-labs.github.io/mcp-fusion/observability) · [Tracing](https://vinkius-labs.github.io/mcp-fusion/tracing)

### Runtime Guards

Concurrency bulkhead, timeout enforcement, and circuit breakers per-tool:

→ [Runtime Guards docs](https://vinkius-labs.github.io/mcp-fusion/runtime-guards)

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

## All Capabilities

| Capability | Mechanism |
|---|---|
| **Presenter** | `.schema()`, `.systemRules()`, `.uiBlocks()`, `.suggestActions()`, `.embed()` |
| **Cognitive Guardrails** | `.agentLimit(max, onTruncate)` — truncation + filter guidance |
| **Action Consolidation** | Multiple actions → single MCP tool with discriminator enum |
| **Hierarchical Groups** | `.group()` — namespace 5,000+ actions as `module.action` |
| **Prompt Engine** | `definePrompt()` with flat schema, middleware, `PromptMessage.fromView()` |
| **Context Derivation** | `defineMiddleware()` — tRPC-style typed context merging |
| **Self-Healing Errors** | `toolError()` — structured recovery with action suggestions |
| **Strict Validation** | Zod `.merge().strict()` — unknown fields rejected with actionable errors |
| **Type-Safe Client** | `createFusionClient<T>()` — full inference from server to client |
| **Streaming Progress** | `yield progress()` → MCP `notifications/progress` |
| **State Sync** | RFC 7234 cache-control — `invalidates`, `no-store`, `immutable` |
| **Tool Exposition** | `'flat'` or `'grouped'` wire format |
| **Tag Filtering** | RBAC context gating — `{ tags: ['core'] }` / `{ exclude: ['internal'] }` |
| **Observability** | Zero-overhead debug observers + OpenTelemetry-compatible tracing |
| **Runtime Guards** | Concurrency bulkhead, timeout enforcement, circuit breakers |
| **TOON Encoding** | Token-Optimized Object Notation — ~40% fewer tokens |
| **Introspection** | Runtime metadata via `fusion://manifest.json` MCP resource |
| **Immutability** | `Object.freeze()` after `buildToolDefinition()` |

## Documentation

Full documentation available at **[vinkius-labs.github.io/mcp-fusion](https://vinkius-labs.github.io/mcp-fusion/)**.

| Guide | |
|---|---|
| [MVA Architecture](https://vinkius-labs.github.io/mcp-fusion/mva-pattern) | The MVA pattern and manifesto |
| [Quickstart](https://vinkius-labs.github.io/mcp-fusion/quickstart) | Build a Fusion server from zero |
| [Presenter](https://vinkius-labs.github.io/mcp-fusion/presenter) | Schema, rules, UI blocks, affordances, composition |
| [Prompt Engine](https://vinkius-labs.github.io/mcp-fusion/prompts) | `definePrompt()`, `PromptMessage.fromView()`, registry |
| [Context Tree-Shaking](https://vinkius-labs.github.io/mcp-fusion/mva/context-tree-shaking) | JIT rules vs global system prompts |
| [Cognitive Guardrails](https://vinkius-labs.github.io/mcp-fusion/mva/cognitive-guardrails) | Truncation, strict validation, self-healing |
| [Cost & Hallucination](https://vinkius-labs.github.io/mcp-fusion/cost-and-hallucination) | Token reduction analysis |
| [Middleware](https://vinkius-labs.github.io/mcp-fusion/middleware) | Context derivation, authentication |
| [State Sync](https://vinkius-labs.github.io/mcp-fusion/state-sync) | Cache-control signals, causal invalidation |
| [Runtime Guards](https://vinkius-labs.github.io/mcp-fusion/runtime-guards) | Concurrency, timeouts, circuit breakers |
| [Observability](https://vinkius-labs.github.io/mcp-fusion/observability) | Debug observers, tracing |
| [Cookbook](https://vinkius-labs.github.io/mcp-fusion/examples) | Real-world patterns |
| [API Reference](https://vinkius-labs.github.io/mcp-fusion/api-reference) | Complete typings |

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@modelcontextprotocol/sdk ^1.12.1` (peer dependency)
- `zod ^3.25.1 || ^4.0.0` (peer dependency)
