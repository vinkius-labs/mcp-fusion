# Presenter

The Presenter is the **View** in the MVA (Model-View-Agent) pattern — and the architectural primitive that separates MCP Fusion from every other MCP framework. It is a typed, composable egress pipeline that sits between your handler's return value and the wire. The handler returns raw data; the Presenter validates, strips, enriches, truncates, and governs everything the AI agent is allowed to perceive.

A Presenter is **domain-level**, not tool-level. You define `InvoicePresenter` once. Every tool and every prompt that touches invoices uses the same Presenter — same schema whitelist, same egress boundary, same rules, same UI, same affordances.

---

## The Problem — Before vs After

Every MCP server in the ecosystem today pushes response formatting into the handler. The handler decides which fields to include, how to format them, what rules to attach, and when to truncate. This creates five compounding problems:

```text
BEFORE (every MCP server today)              AFTER (MCP Fusion Presenter)
────────────────────────────────────         ────────────────────────────────────
Handler formats its own response        →    Handler returns raw data
Fields chosen ad-hoc per handler        →    Zod schema is the field whitelist
password_hash, internal IDs leak        →    Undeclared fields stripped in RAM
Rules live in a global system prompt    →    JIT rules travel with the data
10,000-row response → OOM crash         →    .agentLimit(50) + filter guidance
Agent guesses next action               →    .suggestActions() → HATEOAS hints
Response format drifts between tools    →    One Presenter per entity, everywhere
No audit trail for egress               →    Zod whitelist is SOC2-assertable in CI
```

**The handler returns raw database rows.** The Presenter's Zod schema acts as a whitelist: only declared fields survive `parse()`. Sensitive fields — `password_hash`, `internal_flags`, `tenant_secret` — are physically absent from the output object in RAM. They never touch the network. This is not masking; it is structural elimination.

**Rules are just-in-time, not global.** Instead of a 2,000-token system prompt that describes rules for *every* entity on *every* turn, the Presenter injects rules only when its entity type is returned. "amount_cents is in CENTS" appears only when invoices are in the response. Zero wasted tokens on irrelevant instructions.

**Truncation is governed, not catastrophic.** `.agentLimit(50)` slices the array *before* validation, injects a UI block explaining what was omitted, and suggests filters. The agent doesn't OOM, and it knows how to narrow the result set.

**Affordances eliminate hallucinated guesses.** `.suggestActions()` returns HATEOAS-style hints — the agent knows that when `status === 'pending'`, the next valid action is `billing.pay`, not a hallucinated `billing.process_payment`.

---

## Creating a Presenter

MCP Fusion offers **two APIs** for creating Presenters. Both produce identical runtime behavior.

::: code-group
```typescript [definePresenter — Recommended ✨]
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number().describe('CRITICAL: Value is in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending', 'overdue']),
});

export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    autoRules: true,  // ← auto-extracts .describe() annotations as system rules
    systemRules: [
        'Use currency format: $XX,XXX.00',
    ],
    uiBlocks: (invoice) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
    ],
    suggestActions: (inv) =>
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : [],
});
```
```typescript [createPresenter — Classic Builder]
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
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
    ])
    .uiBlocks((invoice) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
    ])
    .suggestActions((inv) =>
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : [],
    );
```
:::

::: tip definePresenter vs createPresenter
`definePresenter()` is the **recommended** API since v2.7. It uses a single config object with auto-rule extraction from Zod `.describe()` annotations — no need to manually repeat domain rules that are already in your schema. `createPresenter()` remains fully supported as the classic fluent builder.
:::

The name (`'Invoice'`) is used in error messages and debugging output.

---

## Auto-Extracted Rules <Badge type="tip" text="NEW v2.7" />

When `autoRules: true` (the default in `definePresenter()`), the framework walks your Zod schema and extracts every `.describe()` annotation as a system rule:

```typescript
const schema = z.object({
    amount_cents: z.number().describe('Value in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending']).describe('Use emoji: ✅ paid, ⏳ pending'),
});

const P = definePresenter({ name: 'Invoice', schema, autoRules: true });

// Extracted rules (automatic):
// → "amount_cents: Value in CENTS. Divide by 100."
// → "status: Use emoji: ✅ paid, ⏳ pending"
```

You can combine `autoRules` with explicit `systemRules` — they are merged.

---

## Configuration Reference

All methods below apply to the `createPresenter()` fluent builder. For `definePresenter()`, pass them as config keys instead:

| Builder method | `definePresenter()` config key |
|---|---|
| `.schema(zodSchema)` | `schema: zodSchema` |
| `.systemRules(rules)` | `systemRules: rules` |
| `.uiBlocks(fn)` | `uiBlocks: fn` |
| `.collectionUiBlocks(fn)` | `collectionUi: fn` |
| `.agentLimit(max, onTruncate)` | `agentLimit: { max, onTruncate }` |
| `.suggestActions(fn)` | `suggestActions: fn` |
| `.embed(key, childPresenter)` | `embeds: [{ key, presenter }]` |

All builder methods return `this` for fluent chaining. Configuration is frozen after the first `.make()` call.

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

Attach a Presenter to any tool via the `returns` field:

::: code-group
```typescript [f.tool() — Recommended ✨]
const f = initFusion<AppContext>();

const getInvoice = f.tool({
    name: 'billing.get_invoice',
    description: 'Gets an invoice by ID',
    input: z.object({ id: z.string() }),
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => {
        return await ctx.db.invoices.findUnique({
            where: { id: input.id },
            include: { client: true },
        });
        // Raw data → Presenter handles validation, rules, UI, suggestions
    },
});
```
```typescript [defineTool — Classic]
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
:::

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

## Execution Pipeline — What Happens Inside `.make().build()`

When a tool handler returns raw data and the `returns` field points to a Presenter, the framework calls `presenter.make(data, ctx).build()` automatically. Here is the exact sequence:

```text
handler return value
       │
       ▼
┌─────────────────────────────┐
│  1. Array Detection         │  Is the value an array? → collection path
│                             │  Single object? → single-item path
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  2. agentLimit (arrays)     │  Slice BEFORE validation.
│                             │  onTruncate → inject guidance UI block.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  3. Zod .parse() (strict)   │  Each item validated.
│                             │  Undeclared fields STRIPPED in RAM.
│                             │  Validation errors → PresenterValidationError
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  4. Embed Resolution        │  For each embed({ key, presenter }),
│                             │  run the child Presenter on data[key].
│                             │  Child rules, UI, affordances merge.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  5. JIT System Rules        │  Static rules + autoRules (.describe())
│                             │  + dynamic rules(data, ctx).
│                             │  Injected as [SYSTEM HINT] block.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  6. UI Blocks               │  Single → uiBlocks(item)
│                             │  Array  → collectionUiBlocks(items)
│                             │  Rendered server-side. Deterministic.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  7. Action Affordances      │  suggestActions(item) per item.
│                             │  → [SYSTEM HINT] with tool + reason.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  8. ResponseBuilder.build() │  Assembles final ToolResponse:
│                             │  { content, _meta, isError: false }
└─────────────────────────────┘
```

Every stage is optional and independently composable. A Presenter with only `.schema()` is a pure egress whitelist. Add `.systemRules()` and it becomes a JIT instruction channel. Add `.agentLimit()` and it becomes an OOM guard. Add all layers and you get the full perception package.

---

## The Presenter as Security Boundary

The Presenter's Zod schema is a **structural whitelist**, not a filter. This distinction is critical for compliance:

- **Filter-based systems** (e.g., `_.pick()`, `delete obj.field`) require the developer to enumerate every sensitive field to remove. If a new sensitive column is added to the database and the delete list isn't updated, it leaks.
- **Whitelist-based systems** (Zod `.parse()` with `.strict()`) only pass fields that are explicitly declared. A new column in the database is **invisible by default** — it never appears in the output unless the developer adds it to the schema.

This inversion makes the Presenter SOC2-auditable:

```typescript
// CI/CD test — assert that passwordHash is structurally absent
const result = await tester.callAction('users', 'list', { take: 5 });
expect(result.data[0]).not.toHaveProperty('passwordHash');
expect(result.data[0]).not.toHaveProperty('internal_flags');
// These assertions never break — fields are absent by design, not by omission
```

The audit trail is the schema itself. You can diff it in a PR. You can test it in CI. You can prove what the agent sees.

---

## Presenter Composition Patterns

### Shared Base Presenter

Extract common fields into a base schema and compose domain-specific Presenters:

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
    suggestActions: (inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment' }]
        : [],
});

const UserPresenter = definePresenter({
    name: 'User',
    schema: baseEntity.extend({
        name: z.string(),
        email: z.string().email().describe('Primary contact email.'),
        role: z.enum(['admin', 'member', 'guest']),
    }),
});
```

### Context-Aware Rules (RBAC)

Dynamic rules that adapt to the current user's role:

```typescript
const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    systemRules: (invoice, ctx) => [
        'amount_cents is in CENTS. Divide by 100.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Do not reveal exact totals to non-admin users. Show ranges only.'
            : null,
        `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
    ],
});
```

`null` values are filtered automatically. Rules are evaluated on every `.make()` call with fresh context.

### Multi-Level Embed Chains

Embeds nest arbitrarily. Each child Presenter contributes its own rules, UI, and affordances:

```typescript
const LineItemPresenter = definePresenter({
    name: 'LineItem',
    schema: lineItemSchema,
    agentLimit: { max: 20, onTruncate: (n) => ui.summary({ omitted: n }) },
});

const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    embeds: [
        { key: 'client', presenter: ClientPresenter },
        { key: 'line_items', presenter: LineItemPresenter },
    ],
});

// invoice.client   → processed by ClientPresenter
// invoice.line_items → processed by LineItemPresenter (truncated at 20)
// All rules, UI blocks, and affordances merge into one response
```

---

## Next Steps

- [DX Guide →](/dx-guide) — `definePresenter()`, `initFusion()`, and all v2.7 DX APIs
- [MVA Pattern →](/mva-pattern) — The architectural paradigm behind Presenters
- [Building Tools →](/building-tools) — Use `f.tool()` with the `returns` field
- [Prompt Engine →](/prompts) — Use Presenters inside Prompts with `fromView()`
- [Middleware →](/middleware) — Context derivation for RBAC in Presenters
- [Architecture →](/architecture) — How the execution pipeline processes Presenters
