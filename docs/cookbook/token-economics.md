# Token Economics

- [Introduction](#introduction)
- [Where Tokens Are Wasted](#waste)
- [Guardrails — .limit()](#limit)
- [TOON Encoding](#toon)
- [Tree-Shaking — JIT Rules](#tree-shaking)
- [Tool Exposition — Grouped](#grouped)
- [Combined Savings](#combined)

## Introduction {#introduction}

Every token your MCP server sends to the LLM costs money and consumes context window. A naive implementation can blow through $10/hr on a single agent workflow. MCP Fusion provides four orthogonal mechanisms to cut token usage by 60-80% without losing any functionality.

## Where Tokens Are Wasted {#waste}

| Source | Waste | Example |
|---|---|---|
| Oversized responses | Array of 10,000 rows | `~5,000,000 tokens` |
| JSON verbosity | Repeated field names | `~40% overhead on arrays` |
| Global system prompt | Rules on every turn | `~500 tokens/turn × 20 turns = 10,000` |
| Tool descriptions | 50 tools × verbose descriptions | `~25,000 tokens in tools/list` |

## Guardrails — .limit() {#limit}

The biggest win. A single `.limit(50)` on a Presenter prevents sending 10,000 rows:

```typescript
const UserPresenter = createPresenter('User')
  .schema({ id: t.string, name: t.string, email: t.string })
  .limit(50);
```

| Without | With `.limit(50)` | Savings |
|---|---|---|
| 10,000 rows × ~500 tok | 50 rows × ~500 tok | **99.5%** |
| ~5,000,000 tokens | ~25,000 tokens | ~4,975,000 tokens saved |

See [Cognitive Guardrails](/cookbook/cognitive-guardrails) for the full pattern.

## TOON Encoding {#toon}

Replace JSON with pipe-delimited TOON for uniform arrays:

```typescript
return toonSuccess(users);
```

| Format | Tokens (100 rows) | Savings |
|---|---|---|
| JSON | ~50,000 tokens | — |
| TOON | ~27,000 tokens | **~46%** |

See [TOON](/cookbook/toon) for the full pattern.

## Tree-Shaking — JIT Rules {#tree-shaking}

Move domain rules from the system prompt to Presenters:

```typescript
// Instead of 50 rules in the system prompt...
const InvoicePresenter = createPresenter('Invoice')
  .schema({ /* ... */ })
  .rules(['amount_cents is in CENTS. Divide by 100.']);
```

| Approach | Tokens/Turn | Over 20 Turns |
|---|---|---|
| System prompt (all rules) | ~500 | ~10,000 |
| Tree-Shaked (only relevant) | ~30 avg | ~600 |

See [Context Tree-Shaking](/cookbook/context-tree-shaking) for the full pattern.

## Tool Exposition — Grouped {#grouped}

For APIs with 50+ tools sharing common parameters, `grouped` exposition reduces `tools/list` tokens:

```typescript
registry.attachToServer(server, {
  toolExposition: 'grouped',
});
```

| Strategy | tools/list Tokens (50 actions) | Savings |
|---|---|---|
| Flat | ~25,000 | — |
| Grouped | ~8,000 | **~68%** |

See [Tool Exposition](/cookbook/tool-exposition) for the full pattern.

## Combined Savings {#combined}

Applying all four optimizations to a real-world SaaS API:

| Optimization | Token Reduction |
|---|---|
| `.limit(50)` on all list Presenters | ~4,975,000/call |
| TOON on array responses | ~46% per response |
| JIT rules (tree-shaking) | ~94% per turn |
| Grouped exposition | ~68% on tools/list |

A typical 20-turn agent session drops from ~6M tokens to ~200K tokens. That's a **97% reduction** in API cost.