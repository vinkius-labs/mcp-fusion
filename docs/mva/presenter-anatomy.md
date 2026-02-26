# Anatomy of the Presenter

> The Presenter is the **View** in MVA. It is the structural contract between your domain data and the AI agent's perception. It is not a formatting utility — it is the architecture's central component.

In MVA, every other layer exists to serve the Presenter. The Model validates data *for* the Presenter. The Agent consumes data *through* the Presenter. The Presenter is the single component that structures raw data into a format an AI agent can parse, interpret, and act on consistently.

This page documents the Presenter's internal anatomy — its six responsibilities, its lifecycle, its composition model, and the patterns that emerge from its use at scale.

::: tip New in v2.7
The recommended API is `definePresenter({ ... })` — a declarative object-config alternative to the fluent `createPresenter()` builder. Both APIs produce identical `Presenter` instances. See [Presenter Guide](/presenter) for side-by-side comparison.
:::

---

## The Six Responsibilities

A Presenter encapsulates six distinct responsibilities. Each maps to a specific method in the `createPresenter()` API and a specific concern in the Structured Perception Package.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Presenter Anatomy                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────┐  ① Schema Validation                        │
│  │  .schema()           │  Zod schema + .strict() — security boundary │
│  └─────────────────────┘                                              │
│                                                                       │
│  ┌─────────────────────┐  ② System Rules                             │
│  │  .systemRules()      │  Domain interpretation directives           │
│  └─────────────────────┘  Static or dynamic (with ctx)               │
│                                                                       │
│  ┌─────────────────────┐  ③ UI Blocks                                │
│  │  .uiBlocks()         │  Server-rendered charts, diagrams, tables   │
│  │  .collectionUiBlocks()│  Aggregated blocks for arrays              │
│  └─────────────────────┘                                              │
│                                                                       │
│  ┌─────────────────────┐  ④ Cognitive Guardrails                     │
│  │  .agentLimit()       │  Smart truncation + teaching blocks         │
│  └─────────────────────┘                                              │
│                                                                       │
│  ┌─────────────────────┐  ⑤ Agentic Affordances                     │
│  │  .suggestActions()   │  HATEOAS-style next-action hints            │
│  └─────────────────────┘  Computed from data state                   │
│                                                                       │
│  ┌─────────────────────┐  ⑥ Presenter Composition                   │
│  │  .embed()            │  Nested child Presenters for relational     │
│  └─────────────────────┘  data. Rules/UI merge automatically.        │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

### ① Schema Validation — The Security Contract

The schema defines the shape of data the agent sees. When you use Zod's `.strict()` mode, it becomes a **Data Loss Prevention** (DLP) boundary — undeclared fields are rejected with actionable errors.

::: warning Developer Responsibility
The Presenter validates with whatever Zod schema you provide. If you want strict field filtering, you must call `.strict()` on your schema explicitly. The framework auto-applies `.strict()` on **input** validation (tool parameters), but the Presenter's output schema is yours to define.
:::

::: code-group

```typescript [Recommended (v2.7+)]
import { definePresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
    client_name: z.string(),
    // These fields exist in the database but are NOT declared:
    // internal_margin, customer_ssn, tenant_id, password_hash
    // → rejected IF using .strict()
}).strict(); // ← explicit .strict() for output security

const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
});
```

```typescript [Classic builder]
import { createPresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
    client_name: z.string(),
}).strict();

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema);
```

:::

When the handler returns data with undeclared fields:

```typescript
handler: async (ctx, args) => {
    return await ctx.db.invoices.findUnique({
        where: { id: args.id },
    });
    // Returns: { id, amount_cents, status, client_name,
    //            internal_margin, customer_ssn, tenant_id }
    // With .strict(): undeclared fields trigger PresenterValidationError.
    // Without .strict(): Zod silently strips unknown keys during parse.
}
```

With `.strict()`, the undeclared fields are **rejected** with an actionable `PresenterValidationError`. They never enter the agent's context window. The agent receives only `{ id, amount_cents, status, client_name }`.

::: warning Security Boundary
This is the single most important security mechanism in MVA. Use `.strict()` on your Presenter schemas to prevent internal data from leaking into the LLM's context. Without `.strict()`, Zod's default behavior silently strips unknown keys — but `.strict()` turns this into an explicit error, catching data shape mismatches early.
:::

---

### ② System Rules — JIT Context Injection

System rules are the interpretive layer. They tell the agent what the data **means** — not just what it **is**.

**Static rules** — when the interpretation is always the same:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules([
        'CRITICAL: amount_cents is in CENTS. Always divide by 100 before display.',
        'Use currency format: $XX,XXX.00 (USD).',
        'Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue.',
        'When displaying multiple invoices, sort by status: overdue first.',
    ]);
```

**Dynamic rules** — when interpretation depends on the data or the user context:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules((invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Mask exact totals for non-admin users. Show ranges only.'
            : null,
        invoice.status === 'overdue'
            ? 'WARNING: This invoice is overdue. Mention urgency proactively.'
            : null,
        `Format dates using ${ctx?.tenant?.locale ?? 'en-US'} locale.`,
    ]);
```

`null` values are automatically filtered. Rules only appear when relevant.

**Why this matters:** In traditional MCP servers, domain rules live in a global system prompt. The agent receives invoice formatting rules when it's working on tasks. Sprint velocity formulas when it's listing users. This is **Context Pollution** — irrelevant rules waste tokens and can cause misapplication errors. MVA's JIT approach sends rules only when the corresponding domain is active — a pattern called **Context Tree-Shaking**.

---

### ③ UI Blocks — Server-Rendered Visualizations

Presenters generate deterministic visual blocks that the agent renders directly. No guessing about chart types, no agent-side rendering logic.

**Single-item blocks** — `.uiBlocks()` fires for individual objects:

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .uiBlocks((invoice) => [
        ui.echarts({
            series: [{
                type: 'gauge',
                data: [{ value: invoice.amount_cents / 100 }],
            }],
        }),
    ]);
```

**Collection blocks** — `.collectionUiBlocks()` fires for arrays, providing aggregate visualizations:

```typescript
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
])
```

The Presenter auto-detects whether the data is a single object or an array. `.uiBlocks()` fires for single items. `.collectionUiBlocks()` fires for arrays. They are mutually exclusive per invocation — no `if/else` in your handlers.

**Available UI block types:**

| Helper | Produces | Use Case |
|---|---|---|
| `ui.echarts(config)` | ECharts JSON spec | Charts, gauges, graphs |
| `ui.mermaid(code)` | Mermaid diagram code | Flowcharts, sequences |
| `ui.markdown(text)` | Markdown text | Rich formatted text |
| `ui.codeBlock(lang, code)` | Fenced code block | Code snippets |
| `ui.table(headers, rows)` | Markdown table | Tabular data |
| `ui.list(items)` | Bullet list | Simple lists |
| `ui.json(data)` | Formatted JSON | Raw data inspection |
| `ui.summary(text)` | Summary text | Collection summaries, warnings |

---

### ④ Cognitive Guardrails — Smart Truncation

Large datasets can overwhelm the agent's context window. `.agentLimit()` automatically truncates and teaches the agent to use pagination.

```typescript
const TaskPresenter = createPresenter('Task')
    .schema(taskSchema)
    .agentLimit(50, (omitted) =>
        ui.summary(
            `⚠️ Dataset truncated. Showing 50 of ${50 + omitted} tasks. ` +
            `Use filters (status, assignee, sprint_id) to narrow results.`
        )
    );
```

**The mechanics:**

1. If the handler returns an array with more items than the limit, the Presenter slices it to the limit
2. The `onTruncate` callback receives the count of omitted items
3. The callback returns a UI block (typically `ui.summary`) that teaches the agent about available filters
4. Truncation happens **before** validation — only kept items are validated, saving CPU cycles

**Why "teaching block" instead of just truncation?**

Raw truncation still wastes the agent's next turn. It will call `list_all` again. The teaching block ensures the agent interprets *what happened* and *what to do differently*:

```text
⚠️ Dataset truncated. Showing 50 of 3,200 tasks.
Use filters (status, assignee, sprint_id) to narrow results.
```

The agent self-corrects: *"Let me filter by status: pending and assignee: john."*

---

### ⑤ Agentic Affordances — HATEOAS for AI

After receiving data, the agent must decide what to do next. Without guidance, it hallucinates tool names. `.suggestActions()` addresses this by providing explicit, state-driven next-action hints.

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .suggestActions((invoice) => {
        if (invoice.status === 'pending') {
            return [
                { tool: 'billing.pay', reason: 'Process immediate payment' },
                { tool: 'billing.send_reminder', reason: 'Send payment reminder to client' },
            ];
        }
        if (invoice.status === 'overdue') {
            return [
                { tool: 'billing.escalate', reason: 'Escalate to collections team' },
                { tool: 'billing.send_final_notice', reason: 'Send final payment notice' },
            ];
        }
        if (invoice.status === 'paid') {
            return [
                { tool: 'billing.archive', reason: 'Archive completed invoice' },
                { tool: 'reports.generate', reason: 'Generate payment receipt' },
            ];
        }
        return [];
    });
```

The agent receives:

```text
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder to client
```

This is the AI equivalent of REST's HATEOAS principle: the server tells the client what's possible, rather than leaving the client to guess. See the [Agentic Affordances →](/mva/affordances) deep dive.

---

### ⑥ Presenter Composition — The Context Tree

Real domain models have relationships. Invoices have clients. Orders have products. Projects have sprints. MVA handles this through **Presenter Composition** — the `.embed()` method.

```typescript
const ClientPresenter = createPresenter('Client')
    .schema(clientSchema)
    .systemRules(['Display company name prominently. Use formal address.']);

const PaymentMethodPresenter = createPresenter('PaymentMethod')
    .schema(paymentMethodSchema)
    .systemRules(['RESTRICTED: Show only last 4 digits of card numbers.']);

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules(['amount_cents is in CENTS. Divide by 100.'])
    .embed('client', ClientPresenter)                     // ← nested composition
    .embed('payment_method', PaymentMethodPresenter);     // ← multiple embeds
```

When the handler returns `{ ...invoice, client: { ... }, payment_method: { ... } }`, the Presenter:

1. Validates the invoice through `invoiceSchema`
2. Finds the `client` key and processes it through `ClientPresenter`
3. Finds the `payment_method` key and processes it through `PaymentMethodPresenter`
4. Merges all rules: invoice rules + client rules + payment method rules
5. Merges all UI blocks from all Presenters

The result is a single, cohesive Structured Perception Package that includes rules from all three Presenters.

**The composition is recursive.** `ClientPresenter` can embed `AddressPresenter`. `AddressPresenter` can embed `CountryPresenter`. The tree resolves automatically:

```text
InvoicePresenter
├── ClientPresenter
│   └── AddressPresenter
│       └── CountryPresenter
└── PaymentMethodPresenter
```

---

## The Presenter Lifecycle

A Presenter has three phases in its lifecycle:

```text
Phase 1: Configuration          Phase 2: Sealing          Phase 3: Rendering
─────────────────────           ─────────────────          ──────────────────
.schema()                       First .make() call         .make(data, ctx)
.systemRules()                  ↓                          ↓
.uiBlocks()                     Presenter is SEALED        Returns ResponseBuilder
.collectionUiBlocks()           ↓                          ↓
.agentLimit()                   Configuration methods      .build() → MCP response
.suggestActions()               now THROW if called
.embed()
```

### Phase 1: Configuration

All configuration methods return `this` for fluent chaining. The order of method calls does not matter.

```typescript
const P = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules([...])
    .uiBlocks(fn)
    .agentLimit(50, onTruncate)
    .suggestActions(fn)
    .embed('client', ClientPresenter);
```

### Phase 2: Sealing

After the first `.make()` call, the Presenter is permanently **sealed** via an internal flag. Any attempt to call configuration methods throws:

```text
Presenter "Invoice" is sealed after first .make() call.
Configuration must be done before .make() is called.
```

This prevents accidental mutation in shared modules. If `InvoicePresenter` is exported and imported by 10 tools, none of them can modify it after the first tool uses it.

### Phase 3: Rendering

`.make()` transforms raw data into a `ResponseBuilder` instance. The builder composes the Structured Perception Package:

```typescript
// Automatic (via `returns` field in tool definition):
const billing = defineTool<Ctx>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter,  // Framework calls .make() automatically
            handler: async (ctx, args) => ctx.db.invoices.findUnique(args.id),
        },
    },
});

// Manual (for advanced cases):
const builder = InvoicePresenter.make(invoiceData, { user: ctx.user });
builder.llmHint('This is a high-priority invoice.');
return builder.build();
```

---

## Patterns for Production

### Pattern 1: The Presenter Library

At scale, create a centralized Presenter module for your entire domain:

```typescript
// src/presenters/index.ts
export { InvoicePresenter } from './InvoicePresenter';
export { ClientPresenter } from './ClientPresenter';
export { ProjectPresenter } from './ProjectPresenter';
export { TaskPresenter } from './TaskPresenter';
export { SprintPresenter } from './SprintPresenter';
export { UserPresenter } from './UserPresenter';
```

Every tool imports from this module. Every developer sees the canonical perception definition for each entity. No one reinvents the rendering logic.

### Pattern 2: Context-Aware Multi-Tenant Rules

Dynamic rules adapt to the user's role, tenant, locale, and permissions:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules((invoice, ctx) => [
        'amount_cents is in CENTS. Divide by 100.',
        // Tenant-specific currency
        `Display currency as ${ctx?.tenant?.currency ?? 'USD'}.`,
        // RBAC: restrict financial data for non-admin users
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Do not display exact amounts. Show ranges instead.'
            : null,
        // DLP: flag PII access
        ctx?.user?.role === 'support'
            ? 'WARNING: This user has limited access. Do not expose client addresses.'
            : null,
        // Data-driven urgency
        invoice.status === 'overdue'
            ? `URGENT: This invoice is ${daysSinceOverdue(invoice)} days overdue.`
            : null,
    ]);
```

### Pattern 3: Minimal Presenter for Simple Entities

Not every entity needs all six responsibilities. Use only what you need:

```typescript
// A minimal Presenter — schema + rules only
const CountryPresenter = createPresenter('Country')
    .schema(z.object({ code: z.string(), name: z.string() }))
    .systemRules(['Country codes follow ISO 3166-1 alpha-2.']);
```

---

## Anti-Patterns

### ❌ Tool-Level Presenters

Do not create a Presenter per tool. This defeats the purpose of domain-level consistency:

```typescript
// ❌ WRONG: Different Presenters for the same entity
const GetInvoicePresenter = createPresenter('GetInvoice')...
const ListInvoicePresenter = createPresenter('ListInvoice')...

// ✅ RIGHT: One Presenter per domain entity
const InvoicePresenter = createPresenter('Invoice')...
// Used by: billing.get_invoice, billing.list_invoices, reports.financial
```

### ❌ Rules in System Prompts

Do not put domain rules in the global system prompt. They will be sent on every turn, waste tokens, and may be misapplied:

```text
// ❌ WRONG: Global system prompt
"When displaying invoices, amount_cents is in cents..."
"When displaying tasks, use status emojis..."
// Sent even when the agent is calling users.list

// ✅ RIGHT: Rules in the Presenter
InvoicePresenter.systemRules(['amount_cents is in CENTS...'])
// Sent only when the agent receives invoice data
```

### ❌ Formatting in Handlers

Do not format data in handlers. The Presenter is the formatting layer:

```typescript
// ❌ WRONG: Formatting in the handler
handler: async (ctx, args) => {
    const invoice = await ctx.db.invoices.findUnique(args.id);
    return success({
        ...invoice,
        amount_display: `$${(invoice.amount_cents / 100).toFixed(2)}`,
        status_emoji: invoice.status === 'paid' ? '✅' : '⏳',
    });
}

// ✅ RIGHT: Handler returns raw data, Presenter formats
handler: async (ctx, args) => {
    return await ctx.db.invoices.findUnique(args.id);
    // InvoicePresenter handles formatting via systemRules and uiBlocks
}
```

---

## Continue Reading

- [Perception Package](/mva/perception-package) — The 6-block response the agent receives
- [Agentic Affordances](/mva/affordances) — Deep dive into `.suggestActions()` and HATEOAS
- [Context Tree-Shaking](/mva/context-tree-shaking) — JIT rules vs global system prompts
- [Presenter API](/presenter) — Complete configuration reference
