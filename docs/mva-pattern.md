# The MVA Pattern

**Model-View-Agent (MVA)** is a software architecture for AI-native applications over the Model Context Protocol. It replaces the human-centric View of MVC with a **Presenter** — a deterministic perception layer that tells the agent exactly how to interpret, display, and act on domain data.

::: tip Deep Dive Available
This page is the overview. For the complete reference, visit the [MVA Architecture Section →](/mva/) with in-depth guides on theory, paradigm comparison, presenter anatomy, perception packages, affordances, context tree-shaking, and cognitive guardrails.
:::

---

## Why MVC Fails for Agents {#why-mvc-fails}

MVC was designed for humans. Humans can interpret ambiguous data, navigate inconsistent interfaces, and apply domain knowledge that the View never had to provide. An AI agent cannot do any of this.

When a tool returns raw JSON:

```json
{ "id": "INV-001", "amount_cents": 45000, "status": "pending" }
```

The agent must guess:
- Is `amount_cents` in cents or dollars?
- Should it offer a payment action?
- Can this user see financial data?
- What visualization makes sense?

Every guess is a potential hallucination. The three failure modes:

| Failure Mode | What Happens | Cost |
|---|---|---|
| **Context Starvation** | Data arrives without domain rules | Agent displays `45000` as dollars instead of cents |
| **Action Blindness** | Agent doesn't know what to do next | Hallucinates tool names or skips valid actions |
| **Perception Inconsistency** | Same entity presented differently by different tools | Contradictory behavior across workflows |

---

## The Solution: MVA {#solution}

MVA replaces the human-centric View with an agent-centric **Presenter**:

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
| View (HTML/CSS) | **View** (Presenter) | Structures data with rules, UI blocks, and action hints |
| Controller | **Agent** (LLM) | Autonomous consumer that acts on the structured response |

The key insight: **the Presenter is domain-level, not tool-level.** You define `InvoicePresenter` once. Every tool that returns invoices uses the same Presenter. The agent always perceives invoices identically — regardless of which tool produced them.

---

## The Presenter: Six Responsibilities {#presenter-responsibilities}

::: tip Three APIs, same result
MCP Fusion offers three equivalent ways to create a Presenter: `definePresenter({ ... })` (declarative config), `createPresenter('Name').schema(s).systemRules(r)` (fluent builder), and `f.presenter({ ... })` (context-aware via `initFusion`). All three produce the same internal builder. This page mixes them to show different styles — pick whichever matches your codebase.
:::

### 1. Schema Validation — The Security Contract {#schema-validation}

The Zod schema acts as a security boundary. Only declared fields pass through — internal fields like `tenant_id` or `password_hash` are rejected. The `autoRules` option auto-extracts `.describe()` annotations as system rules for the agent:

```typescript
import { definePresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
  id: z.string(),
  amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
  status: z.enum(['paid', 'pending', 'overdue']),
  // password_hash, tenant_id → not in schema, not in output
});

export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  autoRules: true, // extracts .describe() annotations as system rules
});
```

Why this matters: without schema filtering, every field on the database model reaches the LLM context — including sensitive data the handler author didn't intend to expose.

### 2. System Rules — JIT Context Injection {#system-rules}

Rules travel **with the data**, not in a global system prompt. The agent only receives rules relevant to the domain it's currently working with — this is Context Tree-Shaking:

```typescript
export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  rules: [
    'CRITICAL: amount_cents is in CENTS. Always divide by 100 before display.',
    'Use currency format: $XX,XXX.00',
    'Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue',
  ],
});
```

The agent receives these rules inline with the data. No global prompt bloat. When the agent works with a different domain (users, orders), those rules aren't loaded.

::: info
Rules are plain strings passed as system context to the agent. The `CRITICAL:` prefix and emoji conventions in these examples are stylistic choices — format them however your target LLM responds best.
:::

### 3. Context-Aware Rules — Dynamic RBAC {#context-aware-rules}

Rules can receive the data and the request context. Return `null` to conditionally exclude a rule:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .systemRules((invoice, ctx) => [
    'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Mask financial totals for non-admin users.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ]);
```

Non-admin users see the masking rule. Admins don't. The Presenter adapts its perception per-request without any `if/else` in the handler.

### 4. UI Blocks — Deterministic Visualizations {#ui-blocks}

Presenters generate UI blocks — charts, diagrams, tables — that the agent renders directly. No guessing about what visualization fits:

```typescript
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  ui: (invoice) => [
    ui.echarts({
      series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
  ],
  collectionUi: (invoices) => [
    ui.echarts({
      xAxis: { data: invoices.map(i => i.id) },
      series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
    }),
    ui.summary(
      `${invoices.length} invoices. Total: $${(invoices.reduce((s, i) => s + i.amount_cents, 0) / 100).toLocaleString()}`
    ),
  ],
});
```

`.ui()` fires for single items. `.collectionUi()` fires for arrays. The Presenter auto-detects which to apply.

### 5. Cognitive Guardrails — Smart Truncation {#cognitive-guardrails}

Large datasets overwhelm the agent's context window. `agentLimit` automatically truncates and teaches the agent to use pagination or filters:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .agentLimit(50, (omitted) =>
    ui.summary(
      `⚠️ Dataset truncated. Showing 50 of ${50 + omitted} invoices. ` +
      `Use filters (status, date_range) to narrow results.`
    )
  );
```

Without this, a query returning 10,000 rows dumps everything into the context window. With `agentLimit`, the agent receives 50 rows plus a clear instruction to filter — it learns to make specific queries instead of broad ones.

### 6. Agentic Affordances — HATEOAS for AI {#affordances}

Like REST's HATEOAS principle, `suggestActions` tells the agent what it **can do next** based on the current data state:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .suggestActions((invoice) => {
    if (invoice.status === 'pending') {
      return [
        { tool: 'billing.pay', reason: 'Process immediate payment' },
        { tool: 'billing.send_reminder', reason: 'Send payment reminder' },
      ];
    }
    if (invoice.status === 'overdue') {
      return [{ tool: 'billing.escalate', reason: 'Escalate to collections' }];
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

Without this, the agent guesses tool names. With affordances, it follows a deterministic path — no hallucinated actions, no skipped workflows.

---

## Presenter Composition {#composition}

Real domain models have relationships. Invoices have clients. Orders have products. The `.embed()` method composes Presenters:

```typescript
const ClientPresenter = createPresenter('Client')
  .schema(clientSchema)
  .systemRules(['Display company name prominently.']);

const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .systemRules(['amount_cents is in CENTS.'])
  .embed('client', ClientPresenter);
```

When an invoice includes `client` data, the `ClientPresenter`'s rules and UI blocks are automatically merged into the response. Define `ClientPresenter` once — reuse it in `InvoicePresenter`, `OrderPresenter`, `ContractPresenter`. Every tool that returns client data gets the same rules.

---

## Pipeline Integration {#pipeline}

The Presenter integrates into the tool definition through the `returns` field. The handler returns raw data; the Presenter handles everything else:

```typescript
const getInvoice = f.tool({
  name: 'billing.get_invoice',
  input: z.object({ invoice_id: z.string() }),
  returns: InvoicePresenter,
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
      include: { client: true },
    });
    // ← raw data. Presenter validates, attaches rules, generates UI blocks.
  },
});
```

This is the MVA separation: the handler (Model) produces raw data. The Presenter (View) shapes perception. The LLM (Agent) acts on structured context — not guesswork.

---

::: info ResponseBuilder — escape hatch for one-off responses
Not every response maps to a reusable domain entity. For dashboards, summaries, or ad-hoc outputs, use `response(data).uiBlock(...).systemRules([...]).build()` — see the [Presenter Guide](/presenter) for the full `ResponseBuilder` API.
:::

---

## What This Changes {#what-changes}

| Without MVA | With MVA |
|---|---|
| Agent guesses `45000` is dollars | Agent reads rule: "divide by 100" |
| Agent hallucinates tool names | Agent receives `suggestActions()` hints |
| Same entity displayed differently by different tools | One Presenter, consistent perception |
| Sensitive data leaks to LLM context | Zod schema rejects undeclared fields |
| 10,000 rows overwhelm context | `agentLimit()` truncates and teaches |
| Rules bloat global system prompt | Context Tree-Shaking: rules travel with data |
| UI blocks are afterthoughts | Presenter renders deterministic charts |

---

## Next Steps {#next-steps}

- [MVA At a Glance](/mva/) — The complete MVA architecture reference
- [Presenter Guide](/presenter) — Full Presenter configuration with `definePresenter()`
- [Perception Package](/mva/perception-package) — What the agent actually receives
- [Building Tools](/building-tools) — Define tools with `f.tool()`, `defineTool()`, or `createTool()`
