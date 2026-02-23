<div align="center">
  <h1>⚡️ **MCP Fusion**</h1>
  <p><b>The MVA (Model-View-Agent) framework for the Model Context Protocol.</b></p>
  <p>Structured perception for AI agents — validated data, domain rules, UI blocks, and action affordances in every response.</p>
  
  [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
  [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE)
</div>

<br/>

**[Documentation](https://vinkius-labs.github.io/mcp-fusion/)** · **[API Reference](https://vinkius-labs.github.io/mcp-fusion/api-reference)** · **[Examples](https://vinkius-labs.github.io/mcp-fusion/examples)**

```bash
npm install @vinkius-core/mcp-fusion zod
```

---

## Overview

**MCP Fusion** introduces the **MVA (Model-View-Agent)** pattern — a Presenter layer between your data and the AI agent. Instead of passing raw JSON through `JSON.stringify()`, every response is a **structured perception package**: validated data, domain rules, rendered charts, action affordances, and cognitive guardrails.

```text
Model (Zod Schema) → View (Presenter) → Agent (LLM)
   validates            perceives          acts
```

The Presenter is defined once per domain entity. Every tool that returns that entity uses the same Presenter. The agent receives consistent, validated, contextually-rich data across your entire API surface.

---

## Presenter

The View layer in MVA. Defines how an entity is perceived by the agent — schema validation, system rules, UI blocks, cognitive guardrails, and action affordances.

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .systemRules((invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100 before display.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Do not reveal exact totals to non-admin users.'
            : null,
    ])
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

The agent receives:

```text
📄 DATA       → Validated through Zod .strict() — undeclared fields rejected
📋 RULES      → "amount_cents is in CENTS. Divide by 100."
📊 UI BLOCKS  → ECharts gauge rendered server-side
⚠️ GUARDRAIL  → "50 shown, 250 hidden. Use filters."
🔗 AFFORDANCE → "→ billing.pay: Process payment"
```

Presenters compose via `.embed()` — child Presenter rules, UI blocks, and suggestions merge automatically:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .embed('client', ClientPresenter)
    .embed('payment_method', PaymentMethodPresenter);
```

---

## Tool Definition

Two APIs, identical output. `defineTool()` uses JSON shorthand (no Zod imports). `createTool()` uses full Zod schemas.

### `defineTool()` — JSON-First

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

### `createTool()` — Full Zod

```typescript
import { createTool } from '@vinkius-core/mcp-fusion';

const billing = createTool<AppContext>('billing')
    .description('Billing operations')
    .commonSchema(z.object({ workspace_id: z.string() }))
    .action({
        name: 'get_invoice',
        readOnly: true,
        returns: InvoicePresenter,
        schema: z.object({ id: z.string() }),
        handler: async (ctx, args) =>
            await ctx.db.invoices.findUnique({ where: { id: args.id } }),
    });
```

### Action Consolidation

Multiple actions register as a single MCP tool with a discriminator field. The agent sees one well-structured tool instead of 50 individual registrations:

```text
billing — Billing operations
  Action: get_invoice | create_invoice | void_invoice
  - 'get_invoice': Requires: workspace_id, id. READ-ONLY
  - 'create_invoice': Requires: workspace_id, client_id, amount, currency
  - 'void_invoice': Requires: workspace_id, id ⚠️ DESTRUCTIVE
```

### Hierarchical Groups

For large APIs (5,000+ operations), nest actions into groups:

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

---

## Prompt Engine

Full MCP `prompts/list` + `prompts/get` implementation. Prompt arguments are **flat primitives only** (string, number, boolean, enum) — MCP clients render them as forms.

```typescript
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';

const AuditPrompt = definePrompt<AppContext>('financial_audit', {
    title: 'Financial Audit',
    description: 'Run a compliance audit on an invoice.',
    args: {
        invoiceId: 'string',
        depth: { enum: ['quick', 'thorough'] as const },
    } as const,
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

### `PromptMessage.fromView()`

Decomposes a `ResponseBuilder` (from `Presenter.make()`) into XML-tagged prompt messages. Rules, data, UI blocks, and action suggestions from the Presenter are extracted into semantically separated blocks — same source of truth as the Tool response, zero duplication:

```text
Presenter.make(data, ctx) → ResponseBuilder
    │
    ├─ <domain_rules>    → system role  │ Presenter's systemRules()
    ├─ <dataset>         → user role    │ Validated JSON
    ├─ <visual_context>  → user role    │ UI blocks (ECharts, Mermaid, tables)
    └─ <system_guidance> → system role  │ Hints + HATEOAS action suggestions
```

---

## Middleware

tRPC-style context derivation with pre-compiled chains:

```typescript
import { defineMiddleware } from '@vinkius-core/mcp-fusion';

const requireAuth = defineMiddleware(async (ctx: { token: string }) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user };  // ← merged into ctx, TS infers { user: User }
});

// Apply globally or per-action
defineTool<AppContext>('projects', {
    middleware: [requireAuth, requireRole('editor')],
    actions: { ... },
});
```

---

## Error Handling

Structured errors with recovery instructions. The agent receives the error code, a suggestion, and a list of valid actions to try:

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

return toolError('ProjectNotFound', {
    message: `Project '${id}' does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs.',
    availableActions: ['projects.list'],
});
```

```xml
<tool_error code="ProjectNotFound">
<message>Project 'xyz' does not exist.</message>
<recovery>Call projects.list first to get valid IDs.</recovery>
<available_actions>projects.list</available_actions>
</tool_error>
```

---

## Type-Safe Client

End-to-end type inference from server to client — autocomplete for action names and typed arguments:

```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion/client';
import type { AppRouter } from './server';

const client = createFusionClient<AppRouter>(transport);
const result = await client.execute('billing.get_invoice', { workspace_id: 'ws_1', id: 'inv_42' });
//                                   ^^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                   autocomplete            typed args
```

---

## Registry & Server Integration

```typescript
import { ToolRegistry, PromptRegistry } from '@vinkius-core/mcp-fusion';

const tools = new ToolRegistry<AppContext>();
tools.register(billing);
tools.register(projects);

const prompts = new PromptRegistry<AppContext>();
prompts.register(AuditPrompt);
prompts.register(SummarizePrompt);

// Attach to MCP server (works with Server and McpServer — duck-typed)
tools.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    filter: { tags: ['public'] },              // Tag-based context gating
    toolExposition: 'flat',                     // 'flat' or 'grouped' wire format
    stateSync: {                                // RFC 7234-inspired cache signals
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'sprints.update', invalidates: ['sprints.*'] },
            { match: 'countries.*',    cacheControl: 'immutable' },
        ],
    },
});

prompts.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
```

---

## Streaming Progress

Generator handlers yield progress events — automatically forwarded as MCP `notifications/progress` when the client provides a `progressToken`:

```typescript
handler: async function* (ctx, args) {
    yield progress(10, 'Cloning repository...');
    yield progress(50, 'Building AST...');
    yield progress(90, 'Running analysis...');
    return success(analysisResult);
}
```

---

## Observability

Zero-overhead typed event system. Debug observers attach per-tool or globally:

```typescript
import { createDebugObserver } from '@vinkius-core/mcp-fusion';

// Per-tool
billing.debug(createDebugObserver());

// Global — propagates to all registered tools
tools.enableDebug(createDebugObserver((event) => {
    opentelemetry.addEvent(event.type, event);
}));
```

OpenTelemetry-compatible tracing with structural subtyping (no `@opentelemetry/api` dependency required):

```typescript
tools.enableTracing(tracer);
// Spans: mcp.tool, mcp.action, mcp.durationMs, mcp.isError, mcp.tags
```

---

## Capability Matrix

| Capability | Mechanism |
|---|---|
| **Presenter** | Domain-level View layer — `.schema()`, `.systemRules()`, `.uiBlocks()`, `.suggestActions()`, `.embed()` |
| **Cognitive Guardrails** | `.agentLimit(max, onTruncate)` — truncates arrays, injects filter guidance |
| **Action Consolidation** | Multiple actions → single MCP tool with discriminator enum |
| **Hierarchical Groups** | `.group()` — namespace 5,000+ actions as `module.action` |
| **Prompt Engine** | `definePrompt()` with flat schema constraint, middleware, lifecycle sync |
| **MVA-Driven Prompts** | `PromptMessage.fromView()` — Presenter → XML-tagged prompt messages |
| **Context Derivation** | `defineMiddleware()` — tRPC-style typed context merging |
| **Self-Healing Errors** | `toolError()` — structured recovery with action suggestions |
| **Type-Safe Client** | `createFusionClient<T>()` — full inference from server to client |
| **Streaming Progress** | `yield progress()` → MCP `notifications/progress` |
| **State Sync** | RFC 7234 cache-control signals — `invalidates`, `no-store`, `immutable` |
| **Tool Exposition** | `'flat'` or `'grouped'` wire format — same handlers, different topology |
| **Tag Filtering** | RBAC context gating — `{ tags: ['core'] }` / `{ exclude: ['internal'] }` |
| **Observability** | Zero-overhead debug observers + OpenTelemetry-compatible tracing |
| **TOON Encoding** | Token-Optimized Object Notation — ~40% fewer tokens |
| **Validation** | Zod `.merge().strict()` — unknown fields rejected with actionable errors |
| **Introspection** | Runtime metadata via `fusion://manifest.json` MCP resource |
| **Immutability** | `Object.freeze()` after `buildToolDefinition()` — no post-registration mutation |

---

## Documentation

| Guide | |
|---|---|
| **[MVA Architecture](https://vinkius-labs.github.io/mcp-fusion/mva-pattern)** | The MVA pattern — why and how |
| **[Quickstart](https://vinkius-labs.github.io/mcp-fusion/quickstart)** | Build a Fusion server from zero |
| **[Presenter](https://vinkius-labs.github.io/mcp-fusion/presenter)** | Schema, rules, UI blocks, affordances, composition |
| **[Prompt Engine](https://vinkius-labs.github.io/mcp-fusion/prompts)** | `definePrompt()`, `PromptMessage.fromView()`, registry |
| **[Middleware](https://vinkius-labs.github.io/mcp-fusion/middleware)** | Context derivation, authentication, chains |
| **[State Sync](https://vinkius-labs.github.io/mcp-fusion/state-sync)** | Cache-control signals, causal invalidation |
| **[Observability](https://vinkius-labs.github.io/mcp-fusion/observability)** | Debug observers, tracing |
| **[Tool Exposition](https://vinkius-labs.github.io/mcp-fusion/tool-exposition)** | Flat vs grouped wire strategies |
| **[Cookbook](https://vinkius-labs.github.io/mcp-fusion/examples)** | Real-world patterns |
| **[API Reference](https://vinkius-labs.github.io/mcp-fusion/api-reference)** | Complete typings |
| **[Cost & Hallucination](https://vinkius-labs.github.io/mcp-fusion/cost-and-hallucination)** | Token reduction analysis |

---

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@modelcontextprotocol/sdk ^1.12.1` (peer dependency)
- `zod ^3.25.1 || ^4.0.0` (peer dependency)
