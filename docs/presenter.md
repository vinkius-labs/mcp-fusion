# Presenter

The Presenter is the **View** in the MVA (Model-View-Agent) pattern. It encapsulates how a specific domain entity is perceived by the AI agent — data validation, system rules, visual blocks, cognitive guardrails, and action affordances.

A Presenter is **domain-level**, not tool-level. You define `InvoicePresenter` once. Every tool that returns invoices uses the same Presenter. This guarantees consistent agent perception across your entire API surface.

---

## Creating a Presenter

```typescript
import { createPresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
});

export const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules([
        'CRITICAL: amount_cents is in CENTS. Divide by 100 before display.',
        'Use currency format: $XX,XXX.00',
    ]);
```

The name (`'Invoice'`) is used in error messages and debugging output.

---

## Configuration Methods

All methods return `this` for fluent chaining. Configuration is frozen after the first `.make()` call.

### `.schema(zodSchema)`

Sets the Zod validation schema. Acts as a **security contract** — only declared fields reach the agent.

```typescript
const UserPresenter = createPresenter('User')
    .schema(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
        // internal_flags, password_hash → rejected by .strict() automatically
    }));
```

::: warning Security Boundary
Zod's `.strict()` rejects undeclared fields with an actionable error. Sensitive fields that exist in your database but not in the schema will never reach the LLM, and the LLM is told exactly which fields are valid.
:::

### `.systemRules(rules)`

Attaches domain rules that travel with the data. Supports static arrays and dynamic context-aware functions.

**Static rules:**
```typescript
.systemRules([
    'Amounts are in CENTS. Always divide by 100.',
    'Use emoji status: ✅ paid, ⏳ pending, 🔴 overdue',
])
```

**Dynamic rules with context (RBAC):**
```typescript
.systemRules((invoice, ctx) => [
    'Amounts are in CENTS.',
    ctx?.user?.role !== 'admin'
        ? 'RESTRICTED: Do not reveal exact totals to non-admin users.'
        : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
])
```

`null` values are filtered automatically.

### `.uiBlocks(fn)`

Generates UI blocks for a **single item**. Called when the handler returns a single object.

```typescript
import { ui } from '@vinkius-core/mcp-fusion';

.uiBlocks((invoice) => [
    ui.echarts({
        series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
])
```

### `.collectionUiBlocks(fn)`

Generates aggregated UI blocks for **arrays**. Called once with the entire validated array. Prevents N individual charts from flooding the context.

```typescript
.collectionUiBlocks((invoices) => [
    ui.echarts({
        xAxis: { data: invoices.map(i => i.id) },
        series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
    }),
    ui.summary(`${invoices.length} invoices found.`),
])
```

::: tip Auto-Detection
The Presenter detects arrays automatically. `.uiBlocks()` fires for single items, `.collectionUiBlocks()` fires for arrays. They are mutually exclusive per call.
:::

### `.agentLimit(max, onTruncate)`

Cognitive guardrail — truncates large arrays and injects a warning UI block.

```typescript
.agentLimit(50, (omitted) =>
    ui.summary(
        `⚠️ Showing 50 of ${50 + omitted} results. ` +
        `Use status or date_range filters to narrow results.`
    )
)
```

- Truncation happens **before** validation (only the kept items are validated)
- The `onTruncate` callback receives the count of omitted items
- Does not affect single items — only arrays

### `.suggestActions(fn)`

HATEOAS-style affordances — tells the agent what it can do next based on data state.

```typescript
.suggestActions((invoice) => {
    if (invoice.status === 'pending') {
        return [
            { tool: 'billing.pay', reason: 'Process immediate payment' },
            { tool: 'billing.send_reminder', reason: 'Send payment reminder' },
        ];
    }
    return [];
})
```

Generates a `[SYSTEM HINT]` block:
```text
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder
```

### `.embed(key, childPresenter)`

Composes a child Presenter for nested relational data. Rules and UI blocks from the child are merged into the parent response.

```typescript
const ClientPresenter = createPresenter('Client')
    .schema(clientSchema)
    .systemRules(['Display company name prominently.']);

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .embed('client', ClientPresenter);
```

When `invoice.client` exists, `ClientPresenter` processes it automatically. Multiple embeds are supported:

```typescript
.embed('client', ClientPresenter)
.embed('payment_method', PaymentMethodPresenter)
```

---

## Pipeline Integration

Attach a Presenter to any action via the `returns` field:

```typescript
const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            params: { id: 'string' },
            returns: InvoicePresenter,
            handler: async (ctx, args) => {
                return await ctx.db.invoices.findUnique({
                    where: { id: args.id },
                    include: { client: true },
                });
                // Raw data → Presenter handles validation, rules, UI, suggestions
            },
        },
    },
});
```

The execution pipeline calls `presenter.make(data, ctx).build()` automatically. The handler stays clean — no response formatting, no rule injection, no UI generation.

---

## Manual Usage

For advanced cases, call `.make()` directly:

```typescript
const builder = InvoicePresenter.make(invoiceData);

// Add extra layers manually
builder
    .llmHint('This is a high-priority invoice.')
    .uiBlock(ui.mermaid('graph TD; A-->B'));

return builder.build();
```

Or with context:

```typescript
const builder = InvoicePresenter.make(invoiceData, {
    user: { role: 'admin' },
    tenant: { locale: 'pt-BR' },
});
return builder.build();
```

---

## Using Presenters in Prompts <Badge type="tip" text="NEW" />

Presenters aren't just for Tools. Use `PromptMessage.fromView()` to inject a Presenter's full output — data, rules, UI blocks, and affordances — directly into a Prompt handler:

```typescript
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';

const AuditPrompt = definePrompt<AppContext>('audit', {
    args: { invoiceId: 'string' } as const,
    handler: async (ctx, { invoiceId }) => {
        const invoice = await ctx.db.getInvoice(invoiceId);

        return {
            messages: [
                PromptMessage.system('You are a Senior Financial Auditor.'),
                ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
                PromptMessage.user('Begin the audit for this invoice.'),
            ],
        };
    },
});
```

The Presenter's `systemRules()`, `uiBlocks()`, and `suggestActions()` are decomposed into XML-tagged prompt messages — **zero duplication** between your Tool and Prompt handlers.

::: tip Learn More
See [MVA-Driven Prompts — `fromView()`](/prompts#mva-driven-prompts-—-fromview) in the Prompt Engine docs for the full decomposition architecture and composability patterns.
:::

## UI Block Helpers

The `ui` namespace provides factory functions for all supported block types:

```typescript
import { ui } from '@vinkius-core/mcp-fusion';

ui.echarts({ /* ECharts config */ })    // Interactive charts
ui.mermaid('graph TD; A-->B')           // Diagrams
ui.markdown('**Bold** text')            // Rich text
ui.codeBlock('json', '{"key": "val"}')  // Fenced code
ui.table(['ID', 'Amount'], rows)        // Markdown tables
ui.list(['Item 1', 'Item 2'])           // Bullet lists
ui.json({ key: 'value' })              // Formatted JSON
ui.summary('3 invoices found.')         // Collection summaries
```

---

## Error Handling

When validation fails, the Presenter throws a `PresenterValidationError` with the Presenter name for instant debugging:

```text
[Invoice Presenter] Validation failed:
  - "id": Expected string, received number
  - "status": Invalid enum value
```

```typescript
import { PresenterValidationError } from '@vinkius-core/mcp-fusion';

try {
    InvoicePresenter.make(badData);
} catch (err) {
    if (err instanceof PresenterValidationError) {
        console.error(err.presenterName); // 'Invoice'
        console.error(err.cause);         // Original ZodError
    }
}
```

---

## Sealing Behavior

After the first `.make()` call, the Presenter is **sealed**. Any attempt to call configuration methods (`.schema()`, `.systemRules()`, `.uiBlocks()`, etc.) throws a clear error:

```text
Presenter "Invoice" is sealed after first .make() call.
Configuration must be done before .make() is called.
```

This prevents accidental mutation bugs in shared modules. `.make()` itself can be called multiple times — only configuration is frozen.

---

## Next Steps

- [MVA Pattern →](/mva-pattern) — The architectural paradigm behind Presenters
- [Building Tools →](/building-tools) — Define tools with the `returns` field
- [Prompt Engine →](/prompts) — Use Presenters inside Prompts with `fromView()`
- [Middleware →](/middleware) — Context derivation for RBAC in Presenters
- [Architecture →](/architecture) — How the execution pipeline processes Presenters
