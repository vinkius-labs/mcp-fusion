# Agentic Affordances

- [Introduction](#introduction)
- [The Problem — Blind Navigation](#problem)
- [suggest() — Next-Action Hints](#suggest)
- [Context-Aware Suggestions](#context-aware)
- [Wiring Presenters to Tools](#wiring)
- [Collection-Level Guidance](#collections)
- [How It Looks to the AI](#ai-perspective)

## Introduction {#introduction}

In a traditional MCP server, after receiving a response the AI must scan the entire `tools/list` to figure out what to do next. With 50+ tools, it often picks the wrong one or hallucinates a tool name that doesn't exist.

MCP Fusion introduces **Agentic Affordances** — a HATEOAS-style mechanism where each response carries suggested next actions based on the *current data state*. The AI no longer guesses. It follows the shortest path.

## The Problem — Blind Navigation {#problem}

Consider an invoice lookup. Without affordances:

```
AI receives: { id: "INV-001", status: "pending", amount_cents: 45000 }
AI thinks: "The invoice is pending... I should probably pay it? Or maybe send a reminder?
            What were those tool names again? billing.pay? billing.charge? billing.process?"
```

The AI wastes tokens scanning tool lists and may hallucinate non-existent tool names. With affordances, the response itself tells the AI exactly what to do.

## suggest() — Next-Action Hints {#suggest}

The `suggest()` helper creates HATEOAS-style hints inside a Presenter's `.suggest()` method. Each hint carries a tool name and a human-readable reason:

```typescript
import { createPresenter, t, suggest } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('CENTS — divide by 100 for display'),
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .suggest((invoice) => {
    if (invoice.status === 'pending') {
      return [
        suggest('billing.pay', 'Process immediate payment'),
        suggest('billing.send_reminder', 'Send payment reminder'),
      ];
    }
    if (invoice.status === 'overdue') {
      return [
        suggest('billing.escalate', 'Escalate to collections'),
        suggest('billing.pay', 'Attempt late payment'),
      ];
    }
    return [
      suggest('billing.archive', 'Invoice is settled — archive it'),
    ];
  });
```

The suggestions are **data-driven** — a pending invoice suggests "pay" and "remind", while an overdue invoice suggests "escalate". A paid invoice suggests "archive". The AI always receives the most relevant next steps for the current state.

## Context-Aware Suggestions {#context-aware}

The `.suggest()` callback receives `ctx` as the second argument, enabling suggestions based on user role, tenant config, or any context property:

```typescript
const UserPresenter = createPresenter('User')
  .schema({
    id:     t.string,
    name:   t.string,
    role:   t.enum('admin', 'member', 'guest'),
    status: t.enum('active', 'suspended', 'pending'),
  })
  .suggest((user, ctx) => {
    const hints = [];

    if (user.status === 'pending') {
      hints.push(suggest('users.approve', 'Approve pending user'));
      hints.push(suggest('users.reject', 'Reject and notify'));
    }

    if (user.status === 'active' && user.role !== 'admin') {
      hints.push(suggest('users.promote', 'Promote to admin'));
    }

    if (user.status === 'suspended') {
      hints.push(suggest('users.reactivate', 'Reactivate suspended account'));
    }

    // Only admins see the delete action
    if (ctx?.user?.role === 'admin') {
      hints.push(suggest('users.delete', 'Permanently remove user'));
    }

    return hints;
  });
```

> [!TIP]
> Use `null` filtering for conditional suggestions. Return `null` for suggestions that don't apply and `.filter(Boolean)` the array. The Presenter framework handles `null` values gracefully.

## Wiring Presenters to Tools {#wiring}

Connect your Presenter to a tool with `.returns()`. The handler just returns raw data — the Presenter handles validation, rules, UI blocks, and affordances automatically:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by ID')
  .withString('id', 'Invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return ctx.db.invoices.findUnique({ where: { id: input.id } });
  });
```

That's it. The handler is three lines. The Presenter does all the heavy lifting:

1. **Validates** the returned data against the schema (strips undeclared fields)
2. **Attaches system rules** (e.g. "amount_cents is in CENTS")
3. **Generates UI blocks** if configured
4. **Injects suggested actions** based on the data state

## Collection-Level Guidance {#collections}

For list endpoints, affordances guide the AI to use filters instead of scrolling through massive datasets:

```typescript
const ProjectPresenter = createPresenter('Project')
  .schema({
    id:     t.string,
    name:   t.string,
    status: t.enum('active', 'archived'),
  })
  .limit(50)
  .suggest(() => [
    suggest('projects.search', 'Search by name for specific projects'),
    suggest('projects.filter', 'Filter by status or date range'),
  ]);
```

When the dataset is truncated (showing 50 of 2,000), the agent receives both the truncation warning *and* the suggested actions. Instead of requesting "page 2", it follows the hint and calls `projects.search` with a targeted query.

## How It Looks to the AI {#ai-perspective}

The AI's response contains a structured perception package. The affordances appear as system hints at the end:

```text
[DATA]: { "id": "INV-001", "amount_cents": 45000, "status": "pending" }

[DOMAIN RULES]: amount_cents is in CENTS. Divide by 100 for display.

[SYSTEM HINT]: → billing.pay: Process immediate payment
[SYSTEM HINT]: → billing.send_reminder: Send payment reminder
```

The AI reads these hints and follows the shortest path to the next action. No scanning `tools/list`. No hallucinating tool names. Just structured guidance based on real data.