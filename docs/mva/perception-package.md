# The Structured Perception Package

<div class="mva-manifesto-header">

> In traditional architectures, a response is data. In MVA, a response is a **perception event** — a multi-layered package that tells the agent what the data is, what it means, how to display it, what to do next, and what the limits are.

</div>

When a tool handler returns raw data and a Presenter is attached, mcp-fusion's execution pipeline transforms that data into a **Structured Perception Package** — a multi-block MCP response where each block carries a specific semantic purpose. This page documents the exact structure, the block ordering, and why each layer exists.

---

## The Six Blocks

Every Structured Perception Package consists of up to six distinct content blocks, composed by `ResponseBuilder.build()`:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                     Structured Perception Package                         │
│              (output of ResponseBuilder.build())                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Block 1 — DATA                                                           │
│  ─────────────                                                            │
│  Zod-validated JSON. Only declared fields (when using .strict()).        │
│  rejected undeclared fields. This is the canonical representation.        │
│                                                                           │
│  {"id":"INV-001","amount_cents":45000,"status":"pending"}                 │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Block 2 — UI BLOCKS                                                      │
│  ─────────────────                                                        │
│  Server-rendered visualizations. Each block is a separate content         │
│  entry with a [SYSTEM] directive instructing pass-through rendering.      │
│                                                                           │
│  ```echarts                                                               │
│  {"series":[{"type":"gauge","data":[{"value":450}]}]}                    │
│  ```                                                                      │
│  [SYSTEM]: Pass this echarts block directly to the user interface.        │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Block 3 — EMBEDDED PRESENTER BLOCKS                                      │
│  ────────────────────────────────────                                     │
│  Rules and UI blocks from child Presenters (via .embed()).                │
│  Merged automatically from ClientPresenter, PaymentMethodPresenter, etc.  │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Block 4 — LLM HINTS                                                      │
│  ────────────────                                                         │
│  Free-form directives for the agent. These provide situational            │
│  context that doesn't fit into formal rules.                              │
│                                                                           │
│  💡 This client has an overdue balance. Mention it proactively.           │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Block 5 — DOMAIN RULES                                                   │
│  ──────────────────────                                                   │
│  Interpretation directives from .systemRules(). These are the             │
│  domain-specific instructions that eliminate ambiguity.                    │
│                                                                           │
│  [DOMAIN RULES]:                                                          │
│  - CRITICAL: amount_cents is in CENTS. Divide by 100 before display.     │
│  - Use currency format: $XX,XXX.00                                       │
│  - Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue                    │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Block 6 — ACTION SUGGESTIONS                                             │
│  ────────────────────────────                                             │
│  HATEOAS-style affordances computed from the data state.                  │
│                                                                           │
│  [SYSTEM HINT]: Based on the current state, recommended next tools:       │
│    → billing.pay: Process immediate payment                               │
│    → billing.send_reminder: Send payment reminder                         │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Block Ordering and Why It Matters

The block order is intentional and deterministic. It is not arbitrary — it follows principles of LLM attention:

| Order | Block | Rationale |
|---|---|---|
| 1st | **Data** | The primary payload. The agent needs the factual data first to ground all subsequent interpretation. |
| 2nd | **UI Blocks** | Visual representations immediately follow the data they visualize, creating a natural data→visualization flow. |
| 3rd | **Embedded Blocks** | Child Presenter outputs are conceptually part of the data, so they sit near the data blocks. |
| 4th | **LLM Hints** | Contextual notes that influence interpretation but are lower priority than the data itself. |
| 5th | **Domain Rules** | Interpretation directives that the agent applies when formulating its response. Near the end so they're fresh in the context window when the agent starts generating. |
| 6th | **Action Suggestions** | What to do next — the final block, positioned so the agent's last context before acting is the available actions. |

::: tip Recency Bias in LLMs
LLMs exhibit recency bias — they weight information at the end of the context more heavily. By placing domain rules and action suggestions last, the Structured Perception Package ensures the agent applies interpretation rules and considers available actions when formulating its response.
:::

---

## Block Deep Dive

### Block 1: Data

The data block is the validated output of the handler. The Presenter's Zod schema controls what reaches the agent:

- **With `.strict()`**: Undeclared fields trigger a `PresenterValidationError` — they are **rejected**, not silently ignored. This is the DLP security boundary.
- **Without `.strict()`** (Zod default): Undeclared fields are silently stripped during parse. The data passes, but unknown keys are removed.

**What's included:**
- All fields declared in the schema
- Typed and validated (strings are strings, numbers are numbers)
- Enum values are within the declared set

**What's excluded (with `.strict()`):**
- Fields not declared in the schema (rejected with an actionable error)
- Fields that fail type/constraint validation (triggers error)

**For arrays:** If `.agentLimit()` is configured and the array exceeds the limit, the data block contains only the truncated subset. A truncation UI block (from the `onTruncate` callback) is appended to the UI Blocks section.

### Block 2: UI Blocks

UI blocks are server-rendered visualizations produced by `.uiBlocks()` (single items) or `.collectionUiBlocks()` (arrays). Each block is a separate MCP content entry.

**The pass-through directive:**

Each UI block includes a `[SYSTEM]` instruction telling the agent not to re-interpret the block — just pass it to the user interface:

```text
[SYSTEM]: Pass this echarts block directly to the user interface.
```

This prevents a common failure mode where the agent tries to "improve" a chart by recreating it from the data, producing an inferior or incorrect visualization.

**Supported block types:**

```typescript
// ECharts — interactive charts
ui.echarts({ series: [{ type: 'bar', data: [10, 20, 30] }] })

// Mermaid — diagrams
ui.mermaid('graph TD; A-->B; B-->C')

// Markdown — rich text
ui.markdown('**Total revenue:** $45,000.00')

// Tables — structured comparisons
ui.table(['Invoice', 'Amount', 'Status'], [
    ['INV-001', '$450.00', 'Paid'],
    ['INV-002', '$1,200.00', 'Pending'],
])

// Summaries — collection-level context
ui.summary('3 invoices found. Total: $1,650.00')
```

### Block 3: Embedded Presenter Blocks

When a Presenter uses `.embed()`, the child Presenter's rules and UI blocks are merged into the parent response. This block contains the aggregated output from all embedded Presenters.

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules(['amount_cents is in CENTS.'])
    .embed('client', ClientPresenter);  // ClientPresenter has its own rules
```

The resulting package includes:
```text
[DOMAIN RULES]:
- amount_cents is in CENTS. Divide by 100 before display.   ← from InvoicePresenter
- Display company name prominently. Use formal address.      ← from ClientPresenter
```

The composition is transparent to the agent — it receives a unified set of rules from all Presenters in the tree.

### Block 4: LLM Hints

LLM hints are free-form directives added via `.llmHint()` on the `ResponseBuilder`. They provide situational context that doesn't fit into the structured rule format:

```typescript
const builder = InvoicePresenter.make(invoiceData, ctx);
builder.llmHint('This client has been flagged for late payments. Be proactive about payment reminders.');
return builder.build();
```

Output:
```text
💡 This client has been flagged for late payments. Be proactive about payment reminders.
```

Hints are typically added in the handler or middleware — not in the Presenter itself — because they represent transient, context-specific guidance rather than permanent domain rules.

### Block 5: Domain Rules

Domain rules are the core of MVA's interpretation layer. They come from `.systemRules()` on the Presenter and follow a strict format:

```text
[DOMAIN RULES]:
- CRITICAL: amount_cents is in CENTS. Always divide by 100 before display.
- Use currency format: $XX,XXX.00
- Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue
```

**Why this format?**

- The `[DOMAIN RULES]:` prefix signals to the LLM that these are non-negotiable instructions (not suggestions)
- The `CRITICAL:` prefix on key rules triggers heightened attention in LLMs
- The `RESTRICTED:` prefix (used for RBAC rules) signals access control constraints
- Bullet list format is consistently parsed by all major LLMs

### Block 6: Action Suggestions

The final block contains HATEOAS-style affordances from `.suggestActions()`:

```text
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder
```

This block is the **decision-making context** for the agent. By appearing last in the response, it is the freshest information when the agent decides what to call next.

---

## Before and After

### Before MVA: Raw JSON Response

```text
The AI receives a single text block:

{"id":"INV-001","amount_cents":45000,"status":"pending",
 "internal_margin":0.12,"customer_ssn":"123-45-6789",
 "tenant_id":"t_abc123","created_at":"2025-01-15T10:30:00Z"}

No rules. No guidance. No boundary.
The AI must guess that amount_cents is in cents.
The AI leaks internal_margin and customer_ssn.
The AI doesn't know it can call billing.pay.
```

### After MVA: Structured Perception Package

```text
Block 1 — DATA:
{"id":"INV-001","amount_cents":45000,"status":"pending"}
(internal_margin, customer_ssn, tenant_id stripped by schema validation)

Block 2 — UI:
[ECharts gauge: $450.00]
[SYSTEM]: Pass this echarts block directly to the user interface.

Block 3 — EMBEDDED:
(ClientPresenter rules merged if client data present)

Block 4 — HINTS:
💡 This is a high-value invoice. The client has a 98% on-time payment rate.

Block 5 — DOMAIN RULES:
[DOMAIN RULES]:
- CRITICAL: amount_cents is in CENTS. Divide by 100 before display.
- Use currency format: $XX,XXX.00 (USD).
- Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue.

Block 6 — ACTIONS:
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder to client
```

The difference is architectural, not cosmetic. The AI operating on the second response **cannot hallucinate** the same way it would on the first. It has explicit rules, explicit actions, and explicit boundaries.

---

## Manual Composition

Not all responses need a Presenter. The `ResponseBuilder` allows manual composition for handlers that need full control:

```typescript
import { response, ui } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    const stats = await ctx.analytics.getMonthlyStats();

    return response(stats)
        .uiBlock(ui.echarts({
            title: { text: 'Monthly Revenue' },
            xAxis: { data: stats.months },
            series: [{ type: 'line', data: stats.revenue }],
        }))
        .uiBlock(ui.mermaid(
            `graph LR; Revenue-->Costs; Revenue-->Profit`
        ))
        .llmHint('Revenue figures are in USD, not cents.')
        .systemRules([
            'Always show percentage change compared to previous month.',
            'Flag any month with negative growth in RED.',
        ])
        .build();
}
```

This produces the same Structured Perception Package format — the Presenter just automates the composition.

---

## Continue Reading

<div class="next-steps">

- [**Agentic Affordances →**](/mva/affordances) — Deep dive into the action suggestion system
- [**Context Tree-Shaking →**](/mva/context-tree-shaking) — Why JIT rules beat global prompts
- [**Cognitive Guardrails →**](/mva/cognitive-guardrails) — Truncation, validation, self-healing
- [**Presenter API →**](/presenter) — Configuration reference for all Presenter methods

</div>
