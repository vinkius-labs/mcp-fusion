# Presenter

In a raw MCP server, the handler does everything: it queries data, picks which fields to include, formats the response, and decides what guidance to give the agent. Add 30 tools that all return user objects, and you get 30 different representations of a user — some leak `password_hash`, some forget to mention that `amount_cents` needs division, some return 10,000 rows when the agent asked for "recent orders."

The Presenter separates _what the agent sees_ from _how the data is fetched_. Your handler returns raw data. The Presenter validates, strips, enriches, truncates, and governs the response. You define `InvoicePresenter` once. Every tool and every prompt that touches invoices uses the same Presenter — same schema whitelist, same rules, same affordances.

This is the **View** in the [MVA (Model-View-Agent)](/mva-pattern) pattern.

---

## A Minimal Presenter {#minimal}

At its simplest, a Presenter is a Zod schema with a name:

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

The schema is a whitelist. The handler returns the full database row — `id`, `name`, `email`, `role`, `password_hash`, `internal_flags`, `stripe_customer_id`, `tenant_secret`. The Presenter strips everything not declared in the schema via `Zod.parse()`. Four fields go to the agent. The rest are physically absent from the output object — not masked, not hidden, not in RAM.

This inversion matters: a new column added to the database is invisible by default. The developer must explicitly add it to the schema for it to appear. The default is secure, not permissive.

---

## Auto-Extracted Rules {#auto-rules}

Zod `.describe()` annotations serve double duty. They document the schema _and_ generate system rules that the agent reads alongside the data:

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

With `autoRules: true` (the default in `definePresenter()`), the framework walks the schema and extracts every `.describe()` annotation as a system rule:

```text
[SYSTEM HINT]:
  • amount_cents: Value in CENTS. Divide by 100 for display.
  • status: Use emoji: ✅ paid, ⏳ pending, 🔴 overdue
```

These rules travel _with_ the data, not in a global system prompt. The agent sees "amount_cents: Value in CENTS" only when an invoice is in the response — zero wasted tokens on irrelevant instructions.

---

## System Rules {#rules}

For rules that don't map to a single field, use `systemRules`. Static rules are arrays of strings:

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

Dynamic rules receive the data and context, so they can adapt to the current user's role or tenant configuration:

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

`null` values are filtered automatically. Dynamic rules are evaluated on every `.make()` call with fresh context, so a user who changes roles mid-session gets the correct rules immediately.

When both `autoRules` and `systemRules` are set, they merge — auto-extracted rules first, then explicit rules.

---

## UI Blocks {#ui-blocks}

UI blocks embed charts, diagrams, tables, and formatted text into the response. The `ui` namespace provides factory functions for all supported types:

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

`uiBlocks` receives a single validated item and returns an array of UI blocks. Available helpers:

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

### Collection UI Blocks {#collection-ui}

When the handler returns an array, `uiBlocks` fires for each item — which creates N individual charts. For aggregate visualizations, use `collectionUi` instead:

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

`collectionUi` receives the entire validated array and fires once. It's mutually exclusive with `uiBlocks` per call — the Presenter detects whether the data is a single item or an array.

---

## Agent Limit {#agent-limit}

Without truncation, a handler that returns 10,000 rows sends all of them into the agent's context window. Agent accuracy degrades as context length increases — this is a well-documented LLM limitation.

`agentLimit` slices the array _before_ validation (only kept items are validated) and injects a guidance UI block explaining what was omitted:

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

The agent receives 50 items plus a UI block that says "there are more — filter to narrow." The agent doesn't OOM, and it knows how to get more specific results. This doesn't affect single items — only arrays.

---

## Suggested Actions {#affordances}

Without affordances, the agent guesses what to do next. It might hallucinate `billing.process_payment` when the actual tool is `billing.pay`. `suggestActions` provides HATEOAS-style hints based on the data's current state:

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

The agent receives:

```text
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder
```

The valid next actions arrive with pre-populated reasons. The agent doesn't need to scan the full `tools/list` to figure out what makes sense — the data tells it.

---

## Embeds — Nested Presenters {#embeds}

When your data has nested objects (e.g., an invoice with a client), each nested entity can have its own Presenter. Rules, UI blocks, and affordances from the child merge into the parent response:

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
  ],
});
```

When `invoice.client` exists, `ClientPresenter` processes it — validating fields, stripping undeclared ones, merging rules. Multiple embeds are supported:

```typescript
embeds: [
  { key: 'client', presenter: ClientPresenter },
  { key: 'line_items', presenter: LineItemPresenter },
],
```

Embeds nest to any depth. Each child Presenter at each level contributes its own rules, UI, and affordances to the final response.

---

## Tool Integration {#tool-integration}

Attach a Presenter to any tool via the `returns` field. The handler returns raw data; the framework calls `presenter.make(data, ctx).build()` automatically:

```typescript
const f = initFusion<AppContext>();

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

The handler's only job is to query data. Validation, field stripping, rule injection, UI rendering, affordance generation — all of it is separated into the Presenter.

---

## Prompt Integration {#prompt-integration}

Presenters work in prompts too. `PromptMessage.fromView()` decomposes a Presenter's output — data, rules, UI blocks, affordances — into prompt messages:

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

The same Presenter used in your `billing.get_invoice` tool now shapes the data in your audit prompt. Same schema, same rules, same affordances — zero duplication.

---

## The Execution Pipeline {#pipeline}

When `.make(data, ctx).build()` runs, the Presenter executes stages in this exact order:

```text
handler return value
    ↓
1. Array Detection         → single-item or collection path
    ↓
2. agentLimit (arrays)     → slice BEFORE validation, inject guidance
    ↓
3. Zod .parse() (strict)   → strip undeclared fields, validate types
    ↓
4. Embed Resolution        → run child Presenters on nested keys
    ↓
5. System Rules            → autoRules + static + dynamic rules
    ↓
6. UI Blocks               → uiBlocks (single) or collectionUi (array)
    ↓
7. Suggested Actions       → HATEOAS affordances per item
    ↓
8. ResponseBuilder.build() → final ToolResponse
```

Every stage is optional and independently composable. A Presenter with only `name` and `schema` is a pure egress whitelist. Add `systemRules` and it becomes a JIT instruction channel. Add `agentLimit` and it becomes a truncation guard. Add all layers and you get the full perception package.

---

## The Builder API {#builder-api}

`definePresenter()` is the recommended API — a single configuration object with `autoRules` support. The classic fluent builder `createPresenter()` is fully supported:

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

| `definePresenter()` config | `createPresenter()` builder |
|---|---|
| `schema: zodSchema` | `.schema(zodSchema)` |
| `systemRules: rules` | `.systemRules(rules)` |
| `autoRules: true` | Not available — use `definePresenter()` |
| `uiBlocks: fn` | `.uiBlocks(fn)` |
| `collectionUi: fn` | `.collectionUiBlocks(fn)` |
| `agentLimit: { max, onTruncate }` | `.agentLimit(max, onTruncate)` |
| `suggestActions: fn` | `.suggestActions(fn)` |
| `embeds: [{ key, presenter }]` | `.embed(key, presenter)` |

After the first `.make()` call, the Presenter is sealed — configuration methods throw if called. This prevents accidental mutation in shared modules.

---

## Manual Usage {#manual}

For advanced cases where you need to add extra layers beyond what the Presenter config provides, call `.make()` directly:

```typescript
const builder = InvoicePresenter.make(invoiceData, ctx);

builder
  .llmHint('This is a high-priority invoice.')
  .uiBlock(ui.mermaid('graph TD; A-->B'));

return builder.build();
```

---

## Error Handling {#errors}

When validation fails, the Presenter throws a `PresenterValidationError` with the Presenter name:

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

The error message includes per-field details:

```text
[Invoice Presenter] Validation failed:
  - "id": Expected string, received number
  - "status": Invalid enum value
```

---

## Composition Patterns {#patterns}

### Shared Base Schema {#base-schema}

Extract common fields into a base schema and extend for each entity:

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

const UserPresenter = definePresenter({
  name: 'User',
  schema: baseEntity.extend({
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['admin', 'member', 'guest']),
  }),
});
```

### Multi-Level Embeds {#multi-embed}

Embeds compose to arbitrary depth. Each child contributes rules, UI, and affordances:

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
// invoice.client     → validated by ClientPresenter
// invoice.line_items → truncated at 20, validated by LineItemPresenter
// All rules, UI, affordances merge into one response
```

---

## Where to Go Next {#next-steps}

- [MVA Pattern](/mva-pattern) — the architectural paradigm behind Presenters
- [Building Tools](/building-tools) — attaching Presenters via `returns`
- [Prompt Engine](/prompts) — using Presenters in prompts with `fromView()`
- [MVA Convention](/mva-convention) — file structure and naming conventions
