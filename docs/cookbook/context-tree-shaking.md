# Context Tree-Shaking

- [Introduction](#introduction)
- [The System Prompt Problem](#problem)
- [JIT Rules Delivery](#jit)
- [How It Works](#how)
- [Combining with .describe()](#describe)

## Introduction {#introduction}

Traditional MCP servers put domain rules in the system prompt: "amounts are in cents", "use USD format", "mask emails for non-admins". These rules are sent on **every single turn**, regardless of whether the conversation involves invoices, emails, or users.

Context Tree-Shaking eliminates this waste. Rules are attached to Presenters and travel **with the data** — they appear only when the entity is in the response. No invoices in the response? No invoice rules in the context window.

## The System Prompt Problem {#problem}

A typical enterprise system prompt:

```text
System: You are a helpful assistant for Acme Corp.
- Invoice amounts are in CENTS. Divide by 100 for display.
- Use USD currency format: $XX,XXX.00
- Employee salaries are confidential. Never show to non-admins.
- Project budgets should be shown in monthly breakdown.
- Order timestamps use UTC. Convert to user's timezone.
- Customer emails must be masked for external agents.
... (50 more rules)
```

This costs ~500 tokens **per turn**, even when the user asks "What's the weather?" None of these rules are relevant.

## JIT Rules Delivery {#jit}

With Tree-Shaking, rules are declared on each Presenter and delivered Just-In-Time:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('Value in CENTS. Divide by 100.'),
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .rules(['Always show currency as USD. Format: $XX,XXX.00']);

const EmployeePresenter = createPresenter('Employee')
  .schema({
    id:     t.string,
    name:   t.string,
    salary: t.number,
  })
  .rules((emp, ctx) => [
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Do NOT display salary information.'
      : null,
  ]);
```

When the agent calls `billing.get_invoice`, it receives invoice rules. When it calls `employees.get`, it receives employee rules. When it calls `projects.list`, it receives neither — zero wasted tokens.

## How It Works {#how}

```text
Turn 1: "Show me invoice INV-001"
  → billing.get_invoice → InvoicePresenter →
    Rules: ["Value in CENTS. Divide by 100.", "Format: $XX,XXX.00"]
    Tokens used for rules: ~30

Turn 2: "List all projects"
  → projects.list → ProjectPresenter →
    Rules: ["Budget is monthly."]
    Tokens used for rules: ~5

Turn 3: "What's 2 + 2?"
  → No tool called →
    Rules: none
    Tokens used for rules: 0
```

Compare with the system prompt approach: ~500 tokens for rules on **every** turn, regardless of relevance.

## Combining with .describe() {#describe}

Zod `.describe()` annotations are auto-extracted as rules. Combined with explicit `.rules()`, you get layered context:

```typescript
const OrderPresenter = createPresenter('Order')
  .schema({
    id:        t.string,
    total:     t.number.describe('Total in CENTS (USD). Divide by 100.'),
    status:    t.enum('processing', 'shipped', 'delivered')
               .describe('Use emoji: 🔄 processing, 📦 shipped, ✅ delivered'),
    shipped_at: t.nullable(t.string)
               .describe('UTC timestamp. Convert to user timezone.'),
  })
  .rules(['Always show tracking link for shipped orders.']);
```

The AI receives all four rules (three auto-extracted from `.describe()`, one explicit) — but only when order data is in the response. On all other turns, these rules cost zero tokens.