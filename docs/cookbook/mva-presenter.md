# MVA Presenter

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [What is a Presenter?](#what)
- [Creating Your First Presenter](#first)
- [The `t` Namespace — No More `import { z }`](#t-namespace)
- [Attaching a Presenter to a Tool](#attach)
- [System Rules — JIT Context](#rules)
- [Auto-Extracted Rules](#auto-rules)
- [UI Blocks](#ui-blocks)
- [The Complete Presenter](#complete)

## Introduction {#introduction}

In a traditional MCP server, the handler fetches data and returns `JSON.stringify(rows)`. The AI receives raw database objects with internal fields, zero context about what the values mean, and no guidance about what to do next. The result: the AI displays `amount_cents: 45000` as "$45,000" instead of "$450.00", leaks `password_hash` fields, and hallucinates tool names.

The **Presenter** is MCP Fusion's answer. It's the **View** in the [MVA pattern](/mva-pattern) — it separates *what the AI sees* from *how data is fetched*. Define it once, reuse it across every tool and prompt that touches that entity.

## What is a Presenter? {#what}

A Presenter does five things:

1. **Validates** — strips undeclared fields via Zod `.strict()`. Internal columns like `password_hash` never reach the AI.
2. **Annotates** — attaches system rules that travel with the data ("amount_cents is in CENTS").
3. **Visualizes** — renders ECharts, Mermaid, or markdown UI blocks server-side.
4. **Guards** — truncates arrays with `.limit()` before they cause token explosions.
5. **Guides** — suggests next actions based on the data's current state.

The handler just queries the database. The Presenter does everything else.

## Creating Your First Presenter {#first}

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

export const UserPresenter = createPresenter('User')
  .schema({
    id:    t.string,
    name:  t.string,
    email: t.zod.string().email(),   // t.zod escape hatch for advanced Zod
    role:  t.enum('admin', 'member', 'guest'),
  });
```

That's a complete Presenter. It validates that every user object has exactly these four fields — nothing more, nothing less. Any additional fields from the database (like `password_hash`, `internal_flags`, `stripe_customer_id`) are automatically stripped.

## The `t` Namespace — No More `import { z }` {#t-namespace}

The `t` namespace provides Zod-backed type helpers that eliminate `import { z } from 'zod'` for 95% of use cases. Every `t.*` value IS a real ZodType — `.describe()`, `.optional()`, `.nullable()` all work.

```typescript
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
| `t.enum(...)` | `z.enum([...])` | `t.enum('active', 'archived')` |
| `t.array(T)` | `z.array(T)` | `t.array(t.string)` |
| `t.object({})` | `z.object({})` | `t.object({ lat: t.number })` |
| `t.optional(T)` | `T.optional()` | `t.optional(t.string)` |
| `t.nullable(T)` | `T.nullable()` | `t.nullable(t.string)` |
| `t.zod` | `z` | `t.zod.string().email()` |

> [!TIP]
> Need regex, transforms, or unions? Use `t.zod` for direct Zod access — full power, zero friction:
> ```typescript
> .schema({
>   id:    t.string,
>   email: t.zod.string().email().min(5),
> })
> ```

## Attaching a Presenter to a Tool {#attach}

Connect a Presenter with `.returns()`. The handler returns raw data, the Presenter handles everything else:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by its ID')
  .withString('id', 'Invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return ctx.db.invoices.findUnique({
      where: { id: input.id },
      include: { client: true },
    });
  });
```

The handler's only job is to fetch data. The framework calls `presenter.make(data, ctx).build()` automatically — validation, rules, UI blocks, and affordances are all applied.

> [!TIP]
> Presenters work identically on [Vercel Edge Functions](/vercel-adapter) and [Cloudflare Workers](/cloudflare-adapter) — Zod validation runs in any JavaScript runtime. Schema compilation is cached at cold start, so edge Presenters add near-zero latency per request.

## System Rules — JIT Context {#rules}

Rules travel with the data, not in the system prompt. This is **Context Tree-Shaking** — domain rules only appear when that entity is in the response.

### Static Rules

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({ /* ... */ })
  .rules([
    'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.',
    'Always show currency as USD.',
    'Use currency format: $XX,XXX.00',
  ]);
```

### Dynamic Rules (RBAC / Locale)

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({ /* ... */ })
  .rules((invoice, ctx) => [
    'amount_cents is in CENTS. Divide by 100 for display.',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Do not reveal exact totals to non-admin users.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ]);
```

`null` values are filtered automatically. The AI only sees rules relevant to the current user's role and locale.

## Auto-Extracted Rules {#auto-rules}

Zod `.describe()` annotations on schema fields automatically generate system rules:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id: t.string,
    amount_cents: t.number.describe('Value in CENTS. Divide by 100 for display.'),
    status: t.enum('paid', 'pending', 'overdue')
      .describe('Use emoji: ✅ paid, ⏳ pending, 🔴 overdue'),
  });
```

The AI automatically receives these rules when invoice data is in the response — zero extra configuration, zero wasted tokens when invoices aren't involved.

## UI Blocks {#ui-blocks}

Render charts, tables, and diagrams server-side. The AI passes them through unchanged:

```typescript
import { createPresenter, t, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, amount_cents: t.number, status: t.enum('paid', 'pending', 'overdue') })
  .ui((invoice) => [
    ui.echarts({
      series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
  ]);
```

Available UI helpers:

```typescript
ui.echarts({ /* ECharts config */ })    // Interactive charts
ui.mermaid('graph TD; A-->B')           // Diagrams
ui.markdown('**Bold** text')            // Rich text
ui.table(['ID', 'Amount'], rows)        // Markdown tables
ui.summary('3 invoices found.')         // Collection summaries
```

## The Complete Presenter {#complete}

Here's a production-ready Presenter that combines every feature:

```typescript
import { createPresenter, t, suggest, ui } from '@vinkius-core/mcp-fusion';

export const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    client_name:  t.string,
    amount_cents: t.number.describe('CENTS — divide by 100'),
    status:       t.enum('paid', 'pending', 'overdue'),
    due_date:     t.string.describe('Format: "Jan 15, 2025"'),
  })
  .rules(['Use currency format: $XX,XXX.00'])
  .ui((inv) => [
    ui.echarts({
      series: [{
        type: 'gauge',
        data: [{ value: inv.amount_cents / 100, name: inv.status }],
      }],
    }),
  ])
  .limit(50)
  .suggest((inv) => {
    if (inv.status === 'pending') {
      return [
        suggest('billing.pay', 'Process immediate payment'),
        suggest('billing.send_reminder', 'Send payment reminder'),
      ];
    }
    if (inv.status === 'overdue') {
      return [
        suggest('billing.escalate', 'Escalate to collections'),
      ];
    }
    return [];
  });
```

Define it once. Every tool and prompt that touches invoices uses the same schema, the same rules, the same affordances. Change it in one place — it updates everywhere.