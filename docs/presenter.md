# Presenter

The Presenter separates what the agent sees from how data is fetched. Your handler returns raw data. The Presenter validates, strips, enriches, truncates, and governs the response. Define `InvoicePresenter` once — every tool and prompt that touches invoices uses the same schema, rules, and affordances.

This is the **View** in the [MVA (Model-View-Agent)](/mva-pattern) pattern.

## Defining a Presenter {#minimal}

```typescript
import { definePresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const UserPresenter = definePresenter({
  name: 'User',
  schema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['admin', 'member', 'guest']),
  }),
});
```

The schema is a whitelist. The handler returns the full database row — `id`, `name`, `email`, `role`, `password_hash`, `internal_flags`, `stripe_customer_id`. The Presenter strips everything not declared via `Zod.parse()`. A new column added to the database is invisible by default — the developer must explicitly add it to the schema.

## Auto-Extracted Rules {#auto-rules}

Zod `.describe()` annotations generate system rules that travel with the data:

```typescript
const invoiceSchema = z.object({
  id: z.string(),
  amount_cents: z.number().describe('Value in CENTS. Divide by 100 for display.'),
  status: z.enum(['paid', 'pending', 'overdue']).describe('Use emoji: ✅ paid, ⏳ pending, 🔴 overdue'),
});

export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  autoRules: true,
});
```

The agent sees these rules only when invoice data is in the response — zero wasted tokens on irrelevant instructions.

## System Rules {#rules}

Static:

```typescript
export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  systemRules: [
    'Use currency format: $XX,XXX.00',
    'Always show both the cents value and the formatted amount.',
  ],
});
```

Dynamic — adapts to the current user's role or tenant:

```typescript
export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  systemRules: (invoice, ctx) => [
    'Use currency format: $XX,XXX.00',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Do not reveal exact totals to non-admin users. Show ranges only.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ],
});
```

`null` values are filtered automatically. When both `autoRules` and `systemRules` are set, they merge.

## UI Blocks {#ui-blocks}

```typescript
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  uiBlocks: (invoice) => [
    ui.echarts({
      series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
  ],
});
```

Available helpers:

```typescript
ui.echarts({ /* ECharts config */ })    // Interactive charts
ui.mermaid('graph TD; A-->B')           // Diagrams
ui.markdown('**Bold** text')            // Rich text
ui.codeBlock('json', '{"key": "val"}')  // Fenced code
ui.table(['ID', 'Amount'], rows)        // Markdown tables
ui.list(['Item 1', 'Item 2'])           // Bullet lists
ui.json({ key: 'value' })              // Formatted JSON
ui.summary('3 invoices found.')         // Collection summaries
```

For arrays, use `collectionUi` to get aggregate visualizations instead of N individual charts:

```typescript
export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  collectionUi: (invoices) => [
    ui.echarts({
      xAxis: { data: invoices.map(i => i.id) },
      series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
    }),
    ui.summary(`${invoices.length} invoices found.`),
  ],
});
```

## Agent Limit {#agent-limit}

Slices arrays before validation and injects guidance about what was omitted:

```typescript
export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  agentLimit: {
    max: 50,
    onTruncate: (omitted) =>
      ui.summary(
        `⚠️ Showing 50 of ${50 + omitted} results. ` +
        `Use status or date_range filters to narrow results.`
      ),
  },
});
```

The agent receives 50 items plus a UI block that tells it how to get more specific results.

## Suggested Actions {#affordances}

HATEOAS-style hints based on the data's current state:

```typescript
export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  suggestActions: (invoice) => {
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
  },
});
```

The agent receives valid next actions with reasons instead of scanning the full `tools/list`.

## Embeds — Nested Presenters {#embeds}

When data has nested objects, each entity gets its own Presenter. Rules, UI blocks, and affordances from children merge into the parent:

```typescript
const ClientPresenter = definePresenter({
  name: 'Client',
  schema: z.object({
    id: z.string(),
    company: z.string(),
    contact_email: z.string().email(),
  }),
  systemRules: ['Display company name prominently.'],
});

export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  embeds: [
    { key: 'client', presenter: ClientPresenter },
    { key: 'line_items', presenter: LineItemPresenter },
  ],
});
```

Embeds nest to any depth.

## Tool Integration {#tool-integration}

```typescript
const getInvoice = f.tool({
  name: 'billing.get_invoice',
  description: 'Retrieve an invoice by ID',
  input: z.object({ id: z.string() }),
  returns: InvoicePresenter,
  handler: async ({ input, ctx }) => {
    return ctx.db.invoices.findUnique({
      where: { id: input.id },
      include: { client: true },
    });
  },
});
```

The handler's only job is to query data. The framework calls `presenter.make(data, ctx).build()` automatically.

## Prompt Integration {#prompt-integration}

`PromptMessage.fromView()` decomposes a Presenter's output into prompt messages:

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

Same Presenter, same schema, same rules — in both tools and prompts.

## Execution Pipeline {#pipeline}

```text
handler return value
    ↓
1. Array Detection         → single-item or collection path
2. agentLimit (arrays)     → slice BEFORE validation, inject guidance
3. Zod .parse() (strict)   → strip undeclared fields, validate types
4. Embed Resolution        → run child Presenters on nested keys
5. System Rules            → autoRules + static + dynamic rules
6. UI Blocks               → uiBlocks (single) or collectionUi (array)
7. Suggested Actions       → HATEOAS affordances per item
8. ResponseBuilder.build() → final ToolResponse
```

Every stage is optional. A Presenter with only `name` and `schema` is a pure egress whitelist.

## Builder API {#builder-api}

`definePresenter()` is recommended. The fluent builder `createPresenter()` is also supported:

```typescript
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .systemRules(['amount_cents is in CENTS. Divide by 100.'])
  .uiBlocks((inv) => [ui.echarts({ /* ... */ })])
  .suggestActions((inv) =>
    inv.status === 'pending'
      ? [{ tool: 'billing.pay', reason: 'Process payment' }]
      : [],
  );
```

After the first `.make()` call, the Presenter is sealed — configuration methods throw if called.

## Manual Usage {#manual}

```typescript
const builder = InvoicePresenter.make(invoiceData, ctx);

builder
  .llmHint('This is a high-priority invoice.')
  .uiBlock(ui.mermaid('graph TD; A-->B'));

return builder.build();
```

## Error Handling {#errors}

When validation fails, a `PresenterValidationError` is thrown with per-field details:

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

## Composition Patterns {#patterns}

### Shared Base Schema {#base-schema}

```typescript
const baseEntity = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: baseEntity.extend({
    amount_cents: z.number().describe('Value in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending', 'overdue']),
  }),
});
```

### Multi-Level Embeds {#multi-embed}

```typescript
const LineItemPresenter = definePresenter({
  name: 'LineItem',
  schema: lineItemSchema,
  agentLimit: { max: 20, onTruncate: (n) => ui.summary(`${n} items omitted.`) },
});

const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: invoiceSchema,
  embeds: [
    { key: 'client', presenter: ClientPresenter },
    { key: 'line_items', presenter: LineItemPresenter },
  ],
});
```
