---
title: "Token Economics"
description: "Cognitive overload detection, context window budget profiling, and token density guardrails for MCP tool responses."
---

# Token Economics

::: tip One-Liner
If your tool returns 50KB of JSON, it will flood the context window and evict system rules. TokenEconomics detects this before it happens.
:::

---

## Overview

An MCP tool that returns large, unbounded responses will rapidly exhaust the LLM's context window. When the window fills, the system rules injected by the Presenter's `addRules()` — the primary mechanism for controlling behavioral correctness — are pushed out of the model's attention window. The LLM's behavior silently degrades.

**TokenEconomics** solves this with two levels of analysis:

1. **Static analysis** — Estimate worst-case token cost from Presenter schema and guardrail config at build time. Zero runtime cost.
2. **Runtime profiling** — Measure actual token counts of response blocks after Presenter rendering. Opt-in.

Both levels classify responses into risk tiers and generate actionable recommendations.

---

## The Problem

Consider a tool that queries a database and returns all matching rows:

```typescript
presenter
  .addSchema(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    address: z.string(),
    phone: z.string(),
    createdAt: z.string(),
    metadata: z.record(z.string()),
  }))
  // No .agentLimit() — unbounded collection
  // No .egressMaxBytes() — no payload cap
```

A query that returns 200 users will produce ~20KB+ of JSON. After Presenter rendering, this fills a significant portion of the context window. The system rules that were injected earlier are now outside the model's effective attention — behavioral correctness degrades silently.

---

## Risk Classification

| Risk Level | Token Range | Impact |
|---|---|---|
| **low** | ≤ 1,000 | Normal operation. System rules remain in attention. |
| **medium** | 1,001 – 4,000 | Elevated density. Monitor overhead ratio. |
| **high** | 4,001 – 8,000 | System rule eviction likely. Add `agentLimit()` or `egressMaxBytes()`. |
| **critical** | > 8,000 | Context window flooding imminent. Immediate action required. |

Thresholds are configurable:

```typescript
import type { TokenThresholds } from 'mcp-fusion/introspection';

const customThresholds: TokenThresholds = {
  low: 500,      // Stricter for small context windows
  medium: 2000,
  high: 5000,
};
```

---

## Static Analysis

### `computeStaticProfile()`

Computes worst-case token estimates from schema metadata. Runs once at build time.

```typescript
import { computeStaticProfile } from 'mcp-fusion/introspection';

const profile = computeStaticProfile(
  'users',                                // tool name
  ['id', 'name', 'email', 'address'],     // schema field names
  50,                                     // agentLimit max
  null,                                   // egressMaxBytes (not set)
);

console.log(profile.risk);
// "medium"

console.log(profile.bounded);
// true — agentLimit provides an upper bound

console.log(profile.maxTokens);
// 1450 — estimated worst-case with 50 items

console.log(profile.recommendations);
// ["Add .egressMaxBytes() to cap payload size"]
```

### `StaticTokenProfile`

| Field | Type | Description |
|---|---|---|
| `toolName` | `string` | Tool name |
| `minTokens` | `number` | Estimated minimum tokens (1 item) |
| `maxTokens` | `number` | Estimated maximum tokens (bounded or worst-case) |
| `bounded` | `boolean` | Whether output is bounded by `agentLimit` or `egressMaxBytes` |
| `fieldBreakdown` | `FieldTokenEstimate[]` | Per-field token cost breakdown |
| `risk` | `TokenRisk` | Risk classification based on max estimate |
| `recommendations` | `string[]` | Actionable recommendations for reducing cost |

### Bounding Strategy

The static analyzer resolves bounds in priority order:

| Guard | How It Bounds | Priority |
|---|---|---|
| `egressMaxBytes` | Hard ceiling: $\text{maxTokens} = \lceil \text{bytes} / 3.5 \rceil$ | 1 (highest) |
| `agentLimit` | Collection cap: $\text{maxTokens} = \text{baseTokens} \times \text{limit} + 50$ | 2 |
| (none) | Worst-case estimate: $\text{baseTokens} \times 100$ | 3 (unbounded) |

An unbounded tool — one with neither `agentLimit` nor `egressMaxBytes` — is assumed to potentially return 100× the base token cost.

---

## Runtime Profiling

### `profileResponse()`

Measures actual token usage of a completed tool response.

```typescript
import { profileResponse } from 'mcp-fusion/introspection';

const analysis = profileResponse(
  'users',                               // tool name
  'list',                                // action key
  [
    { type: 'text', text: systemRulesXml },   // overhead block (rules)
    { type: 'text', text: affordancesXml },   // overhead block (UI)
    { type: 'text', text: dataJson },         // data block
  ],
  2,  // first 2 blocks are overhead
);

console.log(analysis.estimatedTokens);
// 3800

console.log(analysis.overheadRatio);
// 0.42 — 42% of tokens are overhead, not data

console.log(analysis.risk);
// "medium"

console.log(analysis.advisory);
// "OVERHEAD WARNING: Tool "users" has 42% overhead ratio. System rules
//  and UI decorators are consuming significant context."
```

### `TokenAnalysis`

| Field | Type | Description |
|---|---|---|
| `toolName` | `string` | Tool name |
| `actionKey` | `string \| null` | Action key |
| `estimatedTokens` | `number` | Total estimated tokens |
| `blockCount` | `number` | Number of content blocks |
| `blocks` | `BlockTokenProfile[]` | Per-block breakdown |
| `overheadTokens` | `number` | Tokens spent on rules/UI |
| `dataTokens` | `number` | Tokens spent on actual data |
| `overheadRatio` | `number` | Overhead / Data (higher = worse) |
| `risk` | `TokenRisk` | Risk classification |
| `advisory` | `string \| null` | Human-readable advisory |

---

## Server-Level Summary

### `aggregateProfiles()`

Aggregates all tool profiles into a server-level risk assessment.

```typescript
import { aggregateProfiles } from 'mcp-fusion/introspection';

const summary = aggregateProfiles(allProfiles);

console.log(summary.overallRisk);
// "high" — at least one tool is high-risk

console.log(summary.unboundedToolNames);
// ["reports", "analytics"] — these tools need agentLimit

console.log(summary.criticalToolNames);
// ["export-all"] — this tool will flood the context window

console.log(summary.recommendations);
// [
//   "[export-all] Add .agentLimit() to bound collection size",
//   "[export-all] Add .egressMaxBytes() to cap payload size",
//   "[reports] Add .agentLimit() to bound collection size",
// ]
```

### `ServerTokenSummary`

| Field | Type | Description |
|---|---|---|
| `toolCount` | `number` | Total number of tools |
| `totalMinTokens` | `number` | Sum of all minimum estimates |
| `totalMaxTokens` | `number` | Sum of all maximum estimates |
| `unboundedToolCount` | `number` | Tools without `agentLimit`/`egressMaxBytes` |
| `unboundedToolNames` | `string[]` | Names of unbounded tools |
| `overallRisk` | `TokenRisk` | Worst-case risk across all tools |
| `criticalToolNames` | `string[]` | Tools classified as `critical` |
| `recommendations` | `string[]` | Prioritized recommendations |

---

## Token Estimation Method

Token estimation uses the ~3.5 characters/token heuristic for JSON/code content:

$$
\text{estimatedTokens} = \left\lceil \frac{\text{text.length}}{3.5} \right\rceil
$$

This is a fast approximation optimized for profiling rather than billing. For exact token counts, integrate a tokenizer library (tiktoken, etc.).

---

## Integration With Governance Stack

Token economics data flows into the lockfile and diff engine:

```
computeStaticProfile()
         │
         ▼
TokenEconomicsProfile ──────────────────────────────────┐
  (inflationRisk, schemaFieldCount, unboundedCollection) │
         │                                               │
         ▼                                               ▼
   BehaviorDigest                               CapabilityLockfile
   (tokenEconomics component hash)            (tokenEconomics section)
         │
         ▼
   ContractDiff
   (inflationRisk escalation → BREAKING)
   (unbounded → bounded → SAFE)
```

When token economics change:

| Change | ContractDiff Severity | Rationale |
|---|---|---|
| Risk escalated (low → high) | **BREAKING** | Higher risk of system rule eviction |
| Risk de-escalated (high → low) | **SAFE** | Reduced cognitive load |
| Became unbounded | **RISKY** | Potential for context flooding |
| Became bounded | **SAFE** | Guardrail added |

---

## Recommendations Engine

The profiler generates actionable recommendations based on a **declarative rule table**:

| Condition | Recommendation |
|---|---|
| Not bounded (no `agentLimit` or `egressMaxBytes`) | "Add `.agentLimit()` to bound collection size" |
| Risk is `critical` or `high` | "Add `.egressMaxBytes()` to cap payload size" |
| Collection fields detected without `agentLimit` | "Collection fields detected without agentLimit — risk of context flooding" |
| More than 15 schema fields | "Consider reducing schema field count (>15 fields adds cognitive load)" |

---

## Example: Full Profile Pipeline

```typescript
import {
  computeStaticProfile,
  aggregateProfiles,
} from 'mcp-fusion/introspection';

// Profile each tool at build time
const profiles = Object.entries(toolBuilders).map(([name, builder]) => {
  const schema = builder.presenter?.getSchemaKeys() ?? [];
  const limit = builder.presenter?.getAgentLimit() ?? null;
  const maxBytes = builder.presenter?.getEgressMaxBytes() ?? null;
  return computeStaticProfile(name, schema, limit, maxBytes);
});

// Server-level summary
const summary = aggregateProfiles(profiles);

if (summary.overallRisk === 'critical') {
  console.warn('⚠ CRITICAL: Token economics indicate context window flooding risk');
  for (const rec of summary.recommendations) {
    console.warn(`  • ${rec}`);
  }
}

// Embed in lockfile via TokenEconomicsProfile
// {
//   inflationRisk: "critical",
//   schemaFieldCount: 22,
//   unboundedCollection: true,
//   baseOverheadTokens: 150
// }
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **Heuristic token estimation** | O(1) per string, no tokenizer dependency. Accuracy within ~10% for profiling. |
| **Static + Runtime dual mode** | Static catches issues at build time; runtime catches issues with real data. |
| **Overhead ratio tracking** | Separates system rules / UI overhead from data — detects when framework metadata crowds out useful content. |
| **Declarative recommendation rules** | New recommendations require only a table entry, not imperative logic. |
| **Zero overhead when not configured** | No token counting occurs unless explicitly opted in. |
