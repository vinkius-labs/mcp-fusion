# Custom Responses

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [The response() Builder](#builder)
- [Adding UI Blocks](#ui-blocks)
- [LLM Hints & Domain Rules](#hints)
- [One-Line Shortcuts](#shortcuts)

## Introduction {#introduction}

Most tools use a [Presenter](/cookbook/mva-presenter) for their responses — it handles validation, rules, UI blocks, and affordances automatically. But sometimes you need full control: raw dashboard data with multiple charts, custom compositions, or one-off responses that don't fit a reusable Presenter.

The `response()` builder gives you direct access to MCP Fusion's response pipeline. You compose blocks manually — data, charts, hints, rules — and call `.build()` to produce the final `ToolResponse`.

## The response() Builder {#builder}

`response(data)` starts a builder chain. Add blocks, then call `.build()` to produce the MCP response:

```typescript
import { initFusion, response, ui } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const getDashboard = f.query('analytics.dashboard')
  .describe('Get the workspace analytics dashboard')
  .withOptionalEnum('period', ['7d', '30d', '90d'] as const, 'Time period')
  .handle(async (input, ctx) => {
    const stats = await ctx.db.analytics.getDashboard(
      ctx.tenantId,
      input.period ?? '30d',
    );

    return response(stats)
      .uiBlock(ui.echarts({
        title: { text: 'Revenue Trend' },
        xAxis: { type: 'category', data: stats.dates },
        series: [{ type: 'line', smooth: true, data: stats.revenue }],
      }))
      .uiBlock(ui.echarts({
        title: { text: 'User Growth' },
        xAxis: { type: 'category', data: stats.dates },
        series: [{ type: 'bar', data: stats.signups }],
      }))
      .uiBlock(ui.mermaid(`
        graph LR
          A[Visitors: ${stats.visitors}] --> B[Signups: ${stats.signups_total}]
          B --> C[Active: ${stats.active}]
          C --> D[Paid: ${stats.paid}]
      `))
      .llmHint('Revenue figures are in USD cents. Divide by 100.')
      .llmHint(`Data covers the last ${input.period ?? '30d'}.`)
      .rules([
        'Always show percentage change vs. previous period.',
        'Highlight metrics that changed more than 20%.',
      ])
      .build();
  });
```

The AI receives a multi-block response: the raw data JSON, two ECharts configs, a Mermaid funnel diagram, two hints, and two domain rules — all in a single tool call.

## Adding UI Blocks {#ui-blocks}

Chain `.uiBlock()` calls to add server-rendered visualizations. The AI passes these through to the MCP client unchanged:

```typescript
return response(data)
  .uiBlock(ui.echarts({ /* chart config */ }))
  .uiBlock(ui.mermaid('graph TD; A-->B'))
  .uiBlock(ui.markdown('**Summary**: 42 items processed.'))
  .uiBlock(ui.table(['Name', 'Amount'], rows))
  .uiBlock(ui.codeBlock('json', JSON.stringify(config, null, 2)))
  .build();
```

Available UI helpers:

| Helper | Output | Use Case |
|---|---|---|
| `ui.echarts({})` | ECharts JSON config | Interactive charts |
| `ui.mermaid('...')` | Mermaid diagram source | Flowcharts, sequences |
| `ui.markdown('...')` | Rich text | Summaries, notes |
| `ui.table(headers, rows)` | Markdown table | Tabular data |
| `ui.codeBlock(lang, code)` | Fenced code block | Config, JSON |
| `ui.summary('...')` | Summary text | Collection overviews |
| `ui.json(obj)` | Formatted JSON | Debug output |

## LLM Hints & Domain Rules {#hints}

`.llmHint()` adds contextual hints that appear as `💡` blocks in the response. `.rules()` adds domain rules that appear as `[DOMAIN RULES]`:

```typescript
return response(invoice)
  .llmHint('This is a high-priority invoice.')
  .llmHint('The client has 3 overdue invoices.')
  .rules([
    'CRITICAL: amount_cents is in CENTS.',
    'Always show overdue invoices in red.',
  ])
  .build();
```

The difference: **hints** are one-off contextual notes specific to this response. **Rules** are domain-level formatting instructions that the AI should apply consistently.

## One-Line Shortcuts {#shortcuts}

For simple cases, `response` has static methods that skip the builder:

```typescript
// Simple success — equivalent to success()
return response.ok({ status: 'done', processed: 42 });

// Data + domain rules in one call
return response.withRules(invoiceData, [
  'CRITICAL: amounts are in CENTS — divide by 100.',
  'Use emojis: ✅ Paid, ⚠️ Pending.',
]);
```

Use `response.ok()` for quick responses. Use `response.withRules()` when you need domain rules without a full Presenter. Use the full `response().uiBlock().build()` chain for complex dashboard-style responses.