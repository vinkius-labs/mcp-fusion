# Context-Aware Rules

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Static Rules](#static)
- [Dynamic Rules — RBAC](#rbac)
- [Locale & Tenant Awareness](#locale)
- [Data Loss Prevention (DLP)](#dlp)
- [Auto-Extracted Rules](#auto)

## Introduction {#introduction}

In a traditional MCP server, domain rules live in the system prompt — sent on every turn regardless of relevance. "amount_cents is in CENTS" appears even when the agent is just listing projects. This wastes context window space and dilutes attention.

MCP Fusion's system rules travel **with the data**. They appear only when the entity is in the response — a technique called **Context Tree-Shaking**. And because rules can be dynamic functions, they adapt to the user's role, tenant configuration, and locale in real-time.

## Static Rules {#static}

For rules that always apply to an entity, pass an array of strings to `.rules()`:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number,
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .rules([
    'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.',
    'Always show currency as USD.',
    'Use currency format: $XX,XXX.00',
  ]);
```

These rules appear every time an invoice is in the response, but **never** when the agent calls `projects.list` or `users.get`. Zero wasted tokens.

## Dynamic Rules — RBAC {#rbac}

Pass a function to `.rules()` for rules that change based on context. The function receives the data item and `ctx`:

```typescript
const EmployeePresenter = createPresenter('Employee')
  .schema({
    id:           t.string,
    name:         t.string,
    email:        t.string,
    salary_cents: t.number,
    department:   t.string,
  })
  .rules((employee, ctx) => [
    // Always visible
    `salary_cents is in CENTS for currency ${ctx?.tenant?.currency ?? 'USD'}.`,
    `Format dates using locale: ${ctx?.tenant?.locale ?? 'en-US'}.`,

    // Non-admins can't see salary details
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Do NOT display salary information. Show "••••••" instead.'
      : null,

    // Viewers see even less
    ctx?.user?.role === 'viewer'
      ? 'RESTRICTED: Mask email addresses. Show only first 3 characters.'
      : null,
  ]);
```

> [!NOTE]
> `null` values are automatically filtered. This lets you use conditional expressions without worrying about cleaning up the array.

When an admin calls the tool, they see two rules (currency format + date locale). When a viewer calls it, they see four rules (currency + locale + salary restriction + email masking). Same Presenter, different perception — driven by context.

## Locale & Tenant Awareness {#locale}

Multi-tenant SaaS applications often need locale-specific formatting rules:

```typescript
const OrderPresenter = createPresenter('Order')
  .schema({
    id:     t.string,
    total:  t.number,
    status: t.enum('processing', 'shipped', 'delivered'),
  })
  .rules((order, ctx) => [
    `Display currency in ${ctx?.tenant?.currency ?? 'USD'}.`,
    `Format dates as ${ctx?.tenant?.dateFormat ?? 'YYYY-MM-DD'}.`,
    ctx?.tenant?.region === 'EU'
      ? 'Include VAT breakdown in total. VAT rate: 21%.'
      : null,
    ctx?.tenant?.region === 'BR'
      ? 'Show ICMS tax separately. Use BRL currency format: R$ XX.XXX,00'
      : null,
  ]);
```

## Data Loss Prevention (DLP) {#dlp}

Use dynamic rules to enforce DLP policies at the perception layer. Even if the raw data contains sensitive fields, the Presenter instructions tell the AI not to display them:

```typescript
const CustomerPresenter = createPresenter('Customer')
  .schema({
    id:    t.string,
    name:  t.string,
    email: t.string,
    phone: t.string,
    tier:  t.enum('free', 'pro', 'enterprise'),
  })
  .rules((customer, ctx) => [
    // External-facing agents: mask PII
    ctx?.channel === 'external'
      ? 'CRITICAL: Mask email and phone. Show only first 3 chars of email and last 4 digits of phone.'
      : null,

    // Internal support agents: full access
    ctx?.channel === 'internal'
      ? 'Full PII access authorized for this session.'
      : null,
  ]);
```

> [!IMPORTANT]
> DLP rules are a **perception-layer defense**. They tell the AI not to display data, but the data is still in the response. For true field-level security, remove sensitive fields from the schema entirely or strip them in the handler.

## Auto-Extracted Rules {#auto}

Zod `.describe()` annotations on schema fields automatically become system rules. No extra configuration needed:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id: t.string,
    amount_cents: t.number.describe('Value in CENTS. Divide by 100 for display.'),
    status: t.enum('paid', 'pending', 'overdue')
      .describe('Use emoji: ✅ paid, ⏳ pending, 🔴 overdue'),
    due_date: t.string
      .describe('Display in human-readable format: "Jan 15, 2025"'),
  });
```

The AI receives these rules automatically when invoice data is in the response. When both `.describe()` annotations and `.rules()` are configured, they merge — auto-extracted rules first, then explicit rules.