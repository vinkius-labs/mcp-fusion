# Presenter

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

The Presenter separates what the agent sees from how data is fetched. Your handler returns raw data. The Presenter validates, strips, enriches, truncates, and governs the response. Define `InvoicePresenter` once — every tool and prompt that touches invoices uses the same schema, rules, and affordances. Presenters can also be [auto-generated from OpenAPI response schemas](/openapi-gen) via `@vinkius-core/mcp-fusion-openapi-gen`.

This is the **View** in the [MVA (Model-View-Agent)](/mva-pattern) pattern.

## Defining a Presenter {#minimal}

::: code-group
```typescript [Fluent (recommended)]
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

export const UserPresenter = createPresenter('User')
  .schema({
    id:    t.string,
    name:  t.string,
    email: t.zod.string().email(),  // t.zod escape hatch for advanced Zod
    role:  t.enum('admin', 'member', 'guest'),
  });
```
```typescript [Declarative]
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
:::

## Schema — The `t` Namespace {#schema}

The `t` namespace provides Zod-backed type helpers that eliminate `import { z } from 'zod'` for 95% of use cases. Every `t.*` value IS a real ZodType — `.describe()`, `.optional()`, `.nullable()` all work.

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('Value in CENTS. Divide by 100 for display.'),
    status:       t.enum('paid', 'pending', 'overdue'),
    tags:         t.array(t.string),
    metadata:     t.optional(t.record(t.string)),
  });
```

| Helper | Equivalent Zod | Example |
|---|---|---|
| `t.string` | `z.string()` | `t.string.describe('User ID')` |
| `t.number` | `z.number()` | `t.number` |
| `t.boolean` | `z.boolean()` | `t.boolean` |
| `t.date` | `z.date()` | `t.date` |
| `t.enum(...)` | `z.enum([...])` | `t.enum('active', 'archived')` |
| `t.array(T)` | `z.array(T)` | `t.array(t.string)` |
| `t.object({})` | `z.object({})` | `t.object({ lat: t.number })` |
| `t.record(T)` | `z.record(T)` | `t.record(t.string)` |
| `t.optional(T)` | `T.optional()` | `t.optional(t.string)` |
| `t.nullable(T)` | `T.nullable()` | `t.nullable(t.string)` |
| `t.zod` | `z` | `t.zod.string().email()` |

::: tip Escape Hatch
Need regex, transforms, or unions? Use `t.zod` for direct Zod access:
```typescript
.schema({
  id:    t.string,
  email: t.zod.string().email().min(5),  // Full Zod power
})
```
:::

::: info Backward compatible
Raw Zod schemas still work — `.schema(z.object({...}))` is fully supported.
:::

## Auto-Extracted Rules {#auto-rules}

Zod `.describe()` annotations generate system rules that travel with the data:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id: t.string,
    amount_cents: t.number.describe('Value in CENTS. Divide by 100 for display.'),
    status: t.enum('paid', 'pending', 'overdue').describe('Use emoji: ✅ paid, ⏳ pending, 🔴 overdue'),
  });
```

The agent sees these rules only when invoice data is in the response — zero wasted tokens.

## System Rules {#rules}

::: code-group
```typescript [Shorthand — .rules()]
// Static
const InvoicePresenter = createPresenter('Invoice')
  .schema({ /* ... */ })
  .rules([
    'Use currency format: $XX,XXX.00',
    'Always show both the cents value and the formatted amount.',
  ]);

// Dynamic — adapts to context (RBAC, tenant, locale)
const InvoicePresenter = createPresenter('Invoice')
  .schema({ /* ... */ })
  .rules((invoice, ctx) => [
    'Use currency format: $XX,XXX.00',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Do not reveal exact totals to non-admin users.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ]);
```
```typescript [Full control — .systemRules()]
// Identical behavior, longer name
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .systemRules((invoice, ctx) => [
    'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Mask exact totals for non-admin users. Show ranges only.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ]);
```
:::

`null` values are filtered automatically. When both `autoRules` and rules are set, they merge.

## UI Blocks {#ui-blocks}

::: code-group
```typescript [Shorthand — .ui()]
import { createPresenter, t, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, amount_cents: t.number })
  .ui((invoice) => [
    ui.echarts({
      series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
  ]);
```
```typescript [Full control — .uiBlocks()]
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .uiBlocks((invoice) => [
    ui.echarts({
      series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
  ]);
```
:::

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

For arrays, use `.collectionUiBlocks()` to get aggregate visualizations instead of N individual charts:

```typescript
.collectionUiBlocks((invoices) => [
  ui.echarts({
    xAxis: { data: invoices.map(i => i.id) },
    series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
  }),
  ui.summary(`${invoices.length} invoices found.`),
])
```

## Agent Limit {#agent-limit}

Slices arrays before validation and injects guidance about what was omitted.

::: code-group
```typescript [Shorthand — .limit()]
const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, status: t.enum('paid', 'pending', 'overdue') })
  .limit(50);
// → Auto-generated: "⚠️ Dataset truncated. 50 shown, {N} hidden. Use filters."
```
```typescript [Full control — .agentLimit()]
const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .agentLimit(50, (omitted) =>
    ui.summary(
      `⚠️ Showing 50 of ${50 + omitted} results. ` +
      `Use status or date_range filters to narrow results.`
    )
  );
```
:::

The agent receives kept items plus a UI block that tells it how to get more specific results.

## Suggested Actions {#affordances}

HATEOAS-style hints based on the data's current state. Use the `suggest()` helper for maximum fluency.

::: code-group
```typescript [Shorthand — suggest()]
import { createPresenter, t, suggest } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, status: t.enum('pending', 'overdue', 'paid') })
  .suggest((invoice) => [
    suggest('billing.pay', 'Process immediate payment'),
    invoice.status === 'overdue'
      ? suggest('billing.escalate', 'Escalate to collections')
      : null,
  ].filter(Boolean));
```
```typescript [Full control — .suggestActions()]
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
:::

The agent receives valid next actions with reasons instead of scanning the full `tools/list`.

## Embeds — Nested Presenters {#embeds}

When data has nested objects, each entity gets its own Presenter. Rules, UI blocks, and affordances from children merge into the parent:

```typescript
const ClientPresenter = createPresenter('Client')
  .schema(z.object({
    id: z.string(),
    company: z.string(),
    contact_email: z.string().email(),
  }))
  .rules(['Display company name prominently.']);

export const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .embed('client', ClientPresenter)
  .embed('line_items', LineItemPresenter);
```

Embeds nest to any depth.

## Tool Integration {#tool-integration}

```typescript
const getInvoice = f.query('billing.get_invoice')
  .describe('Retrieve an invoice by ID')
  .withString('id', 'Invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return ctx.db.invoices.findUnique({
      where: { id: input.id },
      include: { client: true },
    });
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

The fluent `createPresenter()` is the recommended API. Both shorthand aliases and full method names are supported:

| Shorthand | Full control | Purpose |
|---|---|---|
| `.schema({ id: t.string })` | `.schema(z.object({ ... }))` | Define the validation schema |
| `.rules([...])` | `.systemRules([...])` | JIT system rules |
| `.ui((item) => [...])` | `.uiBlocks((item) => [...])` | Per-item UI blocks |
| `.limit(50)` | `.agentLimit(50, onTruncate)` | Cognitive guardrail |
| `.suggest((item) => [...])` | `.suggestActions((item) => {...})` | HATEOAS suggestions |

```typescript
import { createPresenter, t, suggest, ui } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('CENTS — divide by 100'),
    status:       t.enum('draft', 'paid', 'overdue'),
  })
  .rules(['CRITICAL: amount_cents is in CENTS. Divide by 100.'])
  .ui((inv) => [
    ui.table(['Field', 'Value'], [
      ['Amount', `$${(inv.amount_cents / 100).toFixed(2)}`],
      ['Status', inv.status],
    ]),
  ])
  .suggest((inv) => [
    suggest('invoices.get', 'View details'),
    inv.status === 'overdue'
      ? suggest('billing.remind', 'Send reminder')
      : null,
  ].filter(Boolean))
  .limit(50);
```

The declarative `definePresenter({ ... })` API is also supported for config-object style.

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

const InvoicePresenter = createPresenter('Invoice')
  .schema(baseEntity.extend({
    amount_cents: z.number().describe('Value in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending', 'overdue']),
  }));
```

### Multi-Level Embeds {#multi-embed}

```typescript
const LineItemPresenter = createPresenter('LineItem')
  .schema(lineItemSchema)
  .limit(20);

const InvoicePresenter = createPresenter('Invoice')
  .schema(invoiceSchema)
  .embed('client', ClientPresenter)
  .embed('line_items', LineItemPresenter);
```