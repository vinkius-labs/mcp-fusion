# The MVA Pattern

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Why MVC Fails for Agents](#why-mvc-fails)
- [The Solution: MVA](#solution)
- [The Presenter](#presenter-responsibilities)
- [Presenter Composition](#composition)
- [Pipeline Integration](#pipeline)

**Model-View-Agent (MVA)** replaces the human-centric View of MVC with a **Presenter** — a deterministic perception layer that tells the agent how to interpret, display, and act on domain data. For the full reference, see the [MVA Architecture Section](/mva/).

## Why MVC Fails for Agents {#why-mvc-fails}

MVC was designed for humans who interpret ambiguous data and apply domain knowledge the View never provided. An agent cannot.

When a tool returns `{ "amount_cents": 45000, "status": "pending" }`, the agent guesses: cents or dollars? Offer a payment action? What visualization? Every guess is a potential hallucination.

**Context Starvation** — data without rules means `45000` displays as dollars. **Action Blindness** — no affordances means hallucinated tool names. **Perception Inconsistency** — same entity presented differently by different tools means contradictory behavior.

## The Solution: MVA {#solution}

```text
Model              View              Agent
─────              ────              ─────
Domain Data   →   Presenter    →   LLM/AI
(Zod Schema)      (Rules +          (Claude,
                   UI Blocks +       GPT, etc.)
                   Affordances)
```

The Presenter is **domain-level, not tool-level.** Define `InvoicePresenter` once — every tool that returns invoices uses the same Presenter. The agent always perceives invoices identically. Tools can be hand-written with the Fluent API, or auto-generated from an OpenAPI spec ([@vinkius-core/mcp-fusion-openapi-gen](/openapi-gen)) or a Prisma schema ([@vinkius-core/mcp-fusion-prisma-gen](/prisma-gen)) — the Presenter layer works identically regardless of how the Model layer is authored.

## The Presenter {#presenter-responsibilities}

Three APIs produce the same result: `createPresenter('Name').schema(s).rules(r)` (fluent), `definePresenter({})` (declarative), `f.presenter({})` (context-aware). Each method has a shorthand (`.rules()`, `.ui()`, `.limit()`, `.suggest()`) and a full-control alias (`.systemRules()`, `.uiBlocks()`, `.agentLimit()`, `.suggestActions()`).

### Schema Validation {#schema-validation}

The Zod schema is a security boundary. Only declared fields pass through:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('Amount in cents — divide by 100 for display'),
    status:       t.enum('paid', 'pending', 'overdue'),
  });
```

`.describe()` annotations auto-extract as system rules. Fields like `password_hash` or `tenant_id` are never in the schema, so they never reach the agent.

### System Rules {#system-rules}

Rules travel with the data, not in a global system prompt:

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

When the agent works with users or orders, invoice rules aren't loaded. This is Context Tree-Shaking.

### Context-Aware Rules {#context-aware-rules}

Rules receive data and request context. Return `null` to exclude conditionally:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .rules((invoice, ctx) => [
    'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Mask financial totals for non-admin users.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ]);
```

### UI Blocks {#ui-blocks}

Presenters generate charts and visualizations the agent renders directly:

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

`.ui()` fires for single items. `.collectionUi()` fires for arrays. Auto-detected.

### Cognitive Guardrails {#cognitive-guardrails}

`.limit()` is the shorthand; `.agentLimit()` gives full control with a custom message:

```typescript
// Shorthand — auto-generated truncation message
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .limit(50);

// Full control — custom truncation message
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .agentLimit(50, (omitted) =>
    ui.summary(
      `⚠️ Dataset truncated. Showing 50 of ${50 + omitted} invoices. ` +
      `Use filters (status, date_range) to narrow results.`
    )
  );
```

Without this, 10,000 rows dump into the context window. With it, the agent receives 50 rows plus an instruction to refine.

### Affordances {#affordances}

`.suggest()` with the `suggest()` helper tells the agent what it can do next based on state:

```typescript
import { createPresenter, suggest } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .suggest((invoice) => [
    suggest('billing.pay', 'Process immediate payment'),
    invoice.status === 'pending'
      ? suggest('billing.send_reminder', 'Send payment reminder')
      : null,
    invoice.status === 'overdue'
      ? suggest('billing.escalate', 'Escalate to collections')
      : null,
  ].filter(Boolean));
```

The agent receives `→ billing.pay: Process immediate payment` as a system hint. No hallucinated tool names, no skipped workflows.

## Presenter Composition {#composition}

`.embed()` composes Presenters across relationships:

```typescript
const ClientPresenter = createPresenter('Client')
  .schema(clientSchema)
  .rules(['Display company name prominently.']);

const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .rules(['amount_cents is in CENTS.'])
  .embed('client', ClientPresenter);
```

`ClientPresenter`'s rules and UI blocks merge into the invoice response automatically. Define once — reuse in `InvoicePresenter`, `OrderPresenter`, `ContractPresenter`.

## Pipeline Integration {#pipeline}

The `.returns()` method connects a Presenter to a tool. The handler returns raw data; the Presenter does everything else:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by ID')
  .withString('invoice_id', 'The exact invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
      include: { client: true },
    });
  });
```

The handler (Model) produces raw data. The Presenter (View) shapes perception. The LLM (Agent) acts on structured context.

> [!TIP]
> The handler can return raw data directly — `FluentToolBuilder.handle()` auto-wraps non-`ToolResponse` returns with `success()`. No need to manually call `success()` when using `.returns()`.

For one-off responses that don't map to a reusable entity, use `response(data).uiBlock(...).systemRules([...]).build()` — see the [Presenter Guide](/presenter) for the `ResponseBuilder` API.