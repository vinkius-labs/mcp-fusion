# Cognitive Guardrails

- [Introduction](#introduction)
- [The Token Explosion Problem](#problem)
- [.limit() — Automatic Truncation](#limit)
- [.agentLimit() — Custom Guidance](#agent-limit)
- [Combining with Affordances](#affordances)
- [Collection UI Blocks](#collection-ui)

## Introduction {#introduction}

LLMs have finite context windows. When your database returns 10,000 rows and your handler blindly passes them through, the result is a **token DDoS** — 10,000 rows × ~500 tokens each = 5,000,000 tokens. The LLM chokes, the response is expensive, and the output quality degrades drastically.

MCP Fusion's Cognitive Guardrails solve this by truncating data *before* it reaches the LLM and injecting intelligent guidance about what was omitted. The agent learns to use filters instead of paginating through massive datasets.

## The Token Explosion Problem {#problem}

Without guardrails, a simple list query can cost more tokens than the entire conversation:

```text
User: "Show me all users"
Handler returns: 10,000 user objects
LLM receives: ~5,000,000 tokens of JSON
Result: Slow, expensive, and the LLM loses track of the conversation context
```

With a `.limit(50)` guardrail:

```text
User: "Show me all users"
Handler returns: 10,000 user objects
Presenter slices: 50 items kept, 9,950 hidden
LLM receives: ~25,000 tokens + truncation warning
Result: Fast, cheap, and the LLM knows to suggest filters
```

## .limit() — Automatic Truncation {#limit}

The simplest guardrail is `.limit()`. It slices the array before validation and appends an auto-generated truncation message:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

const UserPresenter = createPresenter('User')
  .schema({
    id:   t.string,
    name: t.string,
    role: t.enum('admin', 'member', 'guest'),
  })
  .limit(50);
```

When the handler returns 10,000 users, the AI receives exactly 50 items plus:

```text
⚠️ Dataset truncated. 50 shown, 9950 hidden. Use filters to narrow results.
```

This is enough to teach the AI to add filters on the next call. No configuration needed — the message is auto-generated from the truncation counts.

> [!TIP]
> The truncation happens **before** Zod validation. This means you never waste CPU parsing 10,000 objects when the AI will only see 50.

## .agentLimit() — Custom Guidance {#agent-limit}

When the auto-generated message isn't specific enough, `.agentLimit()` lets you craft a custom truncation message that guides the AI to the right filter:

```typescript
import { createPresenter, t, ui } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('Value in CENTS — divide by 100'),
    status:       t.enum('paid', 'pending', 'overdue'),
    client_name:  t.string,
  })
  .agentLimit(30, (omitted) =>
    ui.summary(
      `⚠️ Showing 30 of ${30 + omitted} invoices. ` +
      `Use the 'status' filter (paid/pending/overdue) or ` +
      `'client' filter to narrow results.`
    )
  );
```

The callback receives the number of `omitted` items, so you can build a dynamic message. The AI now knows *exactly* which filters are available instead of guessing.

## Combining with Affordances {#affordances}

The real power emerges when you combine guardrails with [Agentic Affordances](/cookbook/agentic-affordances). The truncation warning tells the AI *that* data is missing; the suggested actions tell it *how* to get what it needs:

```typescript
import { createPresenter, t, suggest, ui } from '@vinkius-core/mcp-fusion';

const TaskPresenter = createPresenter('Task')
  .schema({
    id:       t.string,
    title:    t.string,
    status:   t.enum('open', 'in_progress', 'done'),
    priority: t.enum('low', 'medium', 'high'),
    assignee: t.string,
  })
  .limit(50)
  .suggest(() => [
    suggest('tasks.search', 'Search tasks by title or keyword'),
    suggest('tasks.by_assignee', 'Filter tasks by team member'),
  ]);
```

When the AI receives a truncated dataset, it sees:

```text
⚠️ Dataset truncated. 50 shown, 1432 hidden. Use filters to narrow results.
[SYSTEM HINT]: → tasks.search: Search tasks by title or keyword
[SYSTEM HINT]: → tasks.by_assignee: Filter tasks by team member
```

Instead of requesting "page 2", the AI follows the hint and calls `tasks.search` with a targeted query — fewer tokens, better results.

## Collection UI Blocks {#collection-ui}

For array responses, use `.collectionUiBlocks()` to generate aggregate visualizations instead of N individual charts. This pairs naturally with guardrails — show a summary chart of the full dataset, even when individual items are truncated:

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number,
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .limit(50)
  .collectionUiBlocks((invoices) => [
    ui.echarts({
      xAxis: { data: invoices.map(i => i.id) },
      series: [{ type: 'bar', data: invoices.map(i => i.amount_cents / 100) }],
    }),
    ui.summary(`${invoices.length} invoices shown.`),
  ]);
```

The chart renders from the *kept* items, giving the AI visual context even when the full dataset is truncated. Combined with system rules and suggested actions, this creates a complete perception package that keeps the AI on the right track.