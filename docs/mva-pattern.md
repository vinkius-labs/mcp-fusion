# The MVA Pattern

<div class="mva-manifesto-header">

> **Model-View-Agent (MVA)** is a new software architecture pattern created by **Vinkius Labs** for building AI-native applications over the Model Context Protocol.
>
> It is not an iteration on MVC. It is a replacement.

</div>

::: tip 📚 Deep Dive Available
This page is the MVA overview — a concise introduction to the pattern. For the complete architectural reference, visit the **[MVA Architecture Section →](/mva/)** with 7 in-depth guides covering theory, formal paradigm comparison, presenter anatomy, perception packages, agentic affordances, context tree-shaking, and cognitive guardrails.
:::

## Why MVA Exists

For four decades, **Model-View-Controller** has been the unquestioned standard for interactive software. It works — for humans. Humans can interpret ambiguous data, navigate inconsistent interfaces, and tolerate presentation errors. They bring domain knowledge that the View never had to provide.

**AI agents cannot do any of this.** They need deterministic structure, domain-scoped instructions, and explicit affordances — or they hallucinate. MVC was never designed for this consumer.

A survey of existing MCP servers reveals a common structural gap: **raw JSON is returned without domain rules, action guidance, security boundaries, or a perception layer.** The agent is left to infer context from field names alone.

**MVA replaces the human-centric View with the Presenter** — an agent-centric perception layer that tells the AI exactly how to interpret, display, and act on domain data. This is not a feature — it is a distinct architectural paradigm.

::: info Created by Renato Marinho · Vinkius Labs
**MVA (Model-View-Agent)** is an original architectural pattern designed by [Renato Marinho](https://github.com/renatomarinho) and implemented at [Vinkius Labs](https://github.com/vinkius-labs). First introduced in **mcp-fusion**, it represents the foundational architecture for building scalable Agentic APIs where the AI consumer is treated as a first-class citizen — not as a dumb HTTP client.
:::

## The Problem: Why MVC Fails for Agents

In traditional MVC, the **View** renders HTML/CSS for a human browser. The human applies domain knowledge intuitively — they know that `45000` in a `amount_cents` field means `$450.00`. They know not to display a "Delete" button for read-only users.

An AI agent has none of this context. When a tool returns raw data:

```json
{ "id": "INV-001", "amount_cents": 45000, "status": "pending" }
```

The agent must guess:
- Is `amount_cents` in cents or dollars?
- Should it offer a payment action?
- Can this user see financial data?
- Is there a visualization that helps?

Every guess is a potential hallucination.

### The Three Failure Modes

| Failure Mode | What Happens | Real-World Cost |
|---|---|---|
| **Context Starvation** | Agent receives data without domain rules | Displays `45000` as dollars instead of cents |
| **Action Blindness** | Agent doesn't know what to do next | Hallucinates tool names or skips valid actions |
| **Perception Inconsistency** | Same domain entity presented differently by different tools | Contradictory behavior across workflows |

---

## The Solution: MVA (Model-View-Agent)

MVA replaces the human-centric View with an **Agent-centric View** — the **Presenter**.

```text
┌─────────────────────────────────────────────────┐
│                 MVA Architecture                 │
├─────────────────────────────────────────────────┤
│                                                  │
│   Model              View              Agent     │
│   ─────              ────              ─────     │
│   Domain Data   →   Presenter    →   LLM/AI     │
│   (Zod Schema)      (Rules +          (Claude,   │
│                      UI Blocks +       GPT, etc.) │
│                      Affordances)                │
│                                                  │
└─────────────────────────────────────────────────┘
```

| MVC Layer | MVA Layer | Purpose |
|---|---|---|
| Model | **Model** (Zod Schema) | Validates and filters domain data |
| View (HTML/CSS) | **View** (Presenter) | Structures data with rules, UI blocks, and action hints for the agent |
| Controller | **Agent** (LLM) | Autonomous consumer that acts on the structured response |

The key insight: **the Presenter is domain-level, not tool-level.** You define `InvoicePresenter` once. Every tool that returns invoices uses the same Presenter. The agent always perceives invoices identically.

---

## The Presenter: Your Agent's Perception Layer

A Presenter encapsulates six responsibilities:

### 1. Schema Validation (Security Contract)

The Zod schema acts as a security boundary — only declared fields are accepted. Internal fields, tenant IDs, and sensitive data trigger explicit rejection with actionable error messages.

::: code-group
```typescript [definePresenter — Recommended ✨]
import { definePresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
    status: z.enum(['paid', 'pending', 'overdue']),
    // password_hash, tenant_id, internal_flags → rejected by .strict()
});

export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    autoRules: true, // ← auto-extracts .describe() annotations as system rules
});
```
```typescript [createPresenter — Classic]
import { createPresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
});

export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema);
```
:::

### 2. System Rules (JIT Context Injection)

Rules travel **with the data**, not in a global system prompt. This is **Context Tree-Shaking** — the agent only receives rules relevant to the domain it's currently working with.

```typescript
export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules([
        'CRITICAL: amount_cents is in CENTS. Always divide by 100 before display.',
        'Use currency format: $XX,XXX.00',
        'Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue',
    ]);
```

The agent receives:

```text
[DOMAIN RULES]:
- CRITICAL: amount_cents is in CENTS. Always divide by 100 before display.
- Use currency format: $XX,XXX.00
- Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue
```

### 3. Context-Aware Rules (RBAC / DLP)

Rules can be dynamic — receiving the data and the request context. Return `null` to conditionally exclude a rule.

```typescript
export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules((invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Mask financial totals for non-admin users.'
            : null,
        `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
    ]);
```

### 4. UI Blocks (Server-Side Rendered Visualizations)

Presenters generate deterministic UI blocks — charts, diagrams, tables — that the agent renders directly. No guessing about visualization.

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .uiBlocks((invoice) => [
        ui.echarts({
            series: [{
                type: 'gauge',
                data: [{ value: invoice.amount_cents / 100 }],
            }],
        }),
    ])
    .collectionUiBlocks((invoices) => [
        ui.echarts({
            xAxis: { data: invoices.map(i => i.id) },
            series: [{
                type: 'bar',
                data: invoices.map(i => i.amount_cents / 100),
            }],
        }),
        ui.summary(
            `${invoices.length} invoices. ` +
            `Total: $${(invoices.reduce((s, i) => s + i.amount_cents, 0) / 100).toLocaleString()}`
        ),
    ]);
```

::: tip Single vs Collection
`.uiBlocks()` fires for single items. `.collectionUiBlocks()` fires for arrays. The Presenter auto-detects. No `if/else` in your handlers.
:::

### 5. Cognitive Guardrails (Smart Truncation)

Large datasets can overwhelm the agent's context window. `.agentLimit()` automatically truncates and teaches the agent to use pagination or filters.

```typescript
export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .agentLimit(50, (omitted) =>
        ui.summary(
            `⚠️ Dataset truncated. Showing 50 of ${50 + omitted} invoices. ` +
            `Use filters (status, date_range) to narrow results.`
        )
    );
```

### 6. Agentic Affordances (HATEOAS for AI)

Like REST's HATEOAS principle, `.suggestActions()` tells the agent what it **can do next** based on the current data state. This reduces action hallucination.

```typescript
export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .suggestActions((invoice) => {
        if (invoice.status === 'pending') {
            return [
                { tool: 'billing.pay', reason: 'Process immediate payment' },
                { tool: 'billing.send_reminder', reason: 'Send payment reminder' },
            ];
        }
        if (invoice.status === 'overdue') {
            return [
                { tool: 'billing.escalate', reason: 'Escalate to collections' },
            ];
        }
        return [];
    });
```

The agent receives:

```text
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder
```

---

## Presenter Composition: The Context Tree

Real domain models have relationships. Invoices have clients. Orders have products. MVA handles this through **Presenter Composition** — the `.embed()` method.

```typescript
import { createPresenter } from '@vinkius-core/mcp-fusion';

// Define once, reuse everywhere
const ClientPresenter = createPresenter('Client')
    .schema(clientSchema)
    .systemRules(['Display company name prominently.']);

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules(['amount_cents is in CENTS.'])
    .embed('client', ClientPresenter);  // ← nested composition
```

When an invoice includes `client` data, the child Presenter's rules and UI blocks are automatically merged into the response. Define `ClientPresenter` once — reuse it in `InvoicePresenter`, `OrderPresenter`, `ContractPresenter`.

---

## Pipeline Integration: Zero Boilerplate

The Presenter integrates directly into the tool definition through the `returns` field. The framework handles everything automatically — validation, rules, UI blocks, context injection.

::: code-group
```typescript [f.tool() — Recommended ✨]
import { initFusion } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';
import { z } from 'zod';

const f = initFusion<AppContext>();

const getInvoice = f.tool({
    name: 'billing.get_invoice',
    input: z.object({ invoice_id: z.string() }),
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique({
            where: { id: input.invoice_id },
            include: { client: true },
        });
        // ← raw data. Presenter handles the rest.
    },
});

const listInvoices = f.tool({
    name: 'billing.list_invoices',
    input: z.object({}),
    returns: InvoicePresenter,
    handler: async ({ ctx }) => await ctx.db.invoices.findMany(),
});
```
```typescript [defineTool — Classic]
import { defineTool, success } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            readOnly: true,
            params: { invoice_id: 'string' },
            returns: InvoicePresenter,
            handler: async (ctx, args) => {
                const invoice = await ctx.db.invoices.findUnique({
                    where: { id: args.invoice_id },
                    include: { client: true },
                });
                return invoice;
            },
        },
        list_invoices: {
            readOnly: true,
            returns: InvoicePresenter,
            handler: async (ctx, args) => {
                return await ctx.db.invoices.findMany();
            },
        },
    },
});
```
:::

Notice: the handler returns **raw data**. The Presenter intercepts it in the execution pipeline, validates through Zod, rejects unknown fields, attaches domain rules, generates UI blocks, applies truncation limits, and suggests next actions — all automatically.

---

## ResponseBuilder: Manual Composition

Not all responses need a Presenter. The `ResponseBuilder` provides fine-grained control when handlers need custom responses.

```typescript
import { response, ui } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    const stats = await ctx.db.getStats();

    return response(stats)
        .uiBlock(ui.echarts({
            title: { text: 'Monthly Revenue' },
            series: [{ type: 'line', data: stats.revenue }],
        }))
        .llmHint('Revenue figures are in USD, not cents.')
        .systemRules(['Always show percentage change vs. last month.'])
        .build();
}
```

---

## The Full MVA Stack

When these layers work together, the agent receives a **complete perception package** — not just data:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent Response Package                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  📄 DATA          Validated, filtered JSON                              │
│  📊 UI BLOCKS     ECharts, Mermaid, Markdown tables                     │
│  💡 HINTS         LLM-specific interpretation directives                │
│  📋 RULES         Domain-specific behavior constraints                  │
│  🔗 SUGGESTIONS   HATEOAS-style next-action guidance                    │
│                                                                         │
│  All deterministic. All domain-scoped. Deterministic Context Control.   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

| Without MVA | With MVA |
|---|---|
| Agent guesses `45000` is dollars | Agent reads rule: "divide by 100" |
| Agent hallucinates tool names | Agent receives `suggestActions()` hints |
| Same entity displayed differently by different tools | One Presenter, consistent perception |
| Sensitive data leaks to LLM context | Zod `.strict()` rejects undeclared fields |
| 10,000 rows overwhelm context | `agentLimit()` truncates and teaches |
| Rules bloat global system prompt | Context Tree-Shaking: rules travel with data |
| UI blocks are afterthoughts | Presenter SSR-renders deterministic charts |

---

## Next Steps

- [Building Tools →](/building-tools) — Define tools with `f.tool()`, `defineTool()`, or `createTool()`
- [Presenter API →](/presenter) — Full Presenter configuration with `definePresenter()`
- [Middleware →](/middleware) — Context derivation and authentication
- [Architecture →](/architecture) — Internal execution pipeline
