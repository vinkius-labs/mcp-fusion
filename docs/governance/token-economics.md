---
title: "Token Economics"
description: "Cognitive overload detection, context window budget profiling, and token density guardrails for MCP tool responses."
---

# Token Economics

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Risk Classification](#risk)
- [Static Analysis](#static)
- [Runtime Profiling](#runtime)
- [Server-Level Summary](#aggregate)
- [Integration With the Governance Stack](#integration)
- [Full Profile Pipeline](#pipeline)

An MCP tool that returns large, unbounded responses will rapidly exhaust the LLM's context window. When the window fills, the system rules injected by the Presenter's `addRules()` — the primary mechanism for controlling behavioral correctness — are pushed out of the model's attention window. The LLM's behavior silently degrades.

Consider a tool with a schema of 8 fields and no collection limit. A query that returns 200 users produces ~20KB+ of JSON. After Presenter rendering, the system rules that were injected earlier are now outside the model's effective attention. Nothing breaks. Nothing throws. The output just gets worse.

TokenEconomics detects this before it happens, at two levels:

- **Static analysis** — Estimate worst-case token cost from Presenter schema and guardrail config at build time. Zero runtime cost.
- **Runtime profiling** — Measure actual token counts of response blocks after Presenter rendering. Opt-in.

Both levels classify responses into risk tiers and generate actionable recommendations.


## Risk Classification {#risk}

| Risk | Token Range | Impact |
|---|---|---|
| `low` | ≤ 1,000 | Normal operation. System rules remain in attention. |
| `medium` | 1,001 – 4,000 | Elevated density. Monitor overhead ratio. |
| `high` | 4,001 – 8,000 | System rule eviction likely. Add `agentLimit()` or `egressMaxBytes()`. |
| `critical` | > 8,000 | Context window flooding imminent. Immediate action required. |

These thresholds are the defaults. Override them for stricter context windows:

```typescript
import type { TokenThresholds } from '@vinkius-core/mcp-fusion/introspection';

const customThresholds: TokenThresholds = {
  low: 500,
  medium: 2000,
  high: 5000,
};
```


## Static Analysis {#static}

`computeStaticProfile()` estimates worst-case token cost from schema metadata. It runs once at build time — no runtime overhead.

```typescript
import { computeStaticProfile } from '@vinkius-core/mcp-fusion/introspection';

const profile = computeStaticProfile(
  'users',                              // tool name
  ['id', 'name', 'email', 'address'],   // schema field names
  50,                                   // agentLimit max
  null,                                 // egressMaxBytes (not set)
);

console.log(profile.risk);       // "medium"
console.log(profile.bounded);    // true — agentLimit provides an upper bound
console.log(profile.maxTokens);  // 1450 — estimated worst-case with 50 items
```

The static analyzer resolves bounds in priority order:

| Guard | How It Bounds | Priority |
|---|---|---|
| `egressMaxBytes` | Hard ceiling: $\text{maxTokens} = \lceil \text{bytes} / 3.5 \rceil$ | 1 (highest) |
| `agentLimit` | Collection cap: $\text{maxTokens} = \text{baseTokens} \times \text{limit} + 50$ | 2 |
| (none) | Worst-case estimate: $\text{baseTokens} \times 100$ | 3 (unbounded) |

An unbounded tool — one with neither `agentLimit` nor `egressMaxBytes` — is assumed to potentially return 100× the base token cost. This deliberately pessimistic assumption ensures unbounded tools are flagged immediately.

The profile also generates actionable recommendations:

```typescript
console.log(profile.recommendations);
// ["Add .egressMaxBytes() to cap payload size"]
```

Conditions that trigger recommendations:

| Condition | Recommendation |
|---|---|
| Not bounded (no `agentLimit` or `egressMaxBytes`) | "Add `.agentLimit()` to bound collection size" |
| Risk is `critical` or `high` | "Add `.egressMaxBytes()` to cap payload size" |
| Collection fields without `agentLimit` | "Collection fields detected without agentLimit — risk of context flooding" |
| More than 15 schema fields | "Consider reducing schema field count (>15 fields adds cognitive load)" |


## Runtime Profiling {#runtime}

`profileResponse()` measures actual token usage of a completed tool response. Use this in staging or development to validate that production responses stay within budget:

```typescript
import { profileResponse } from '@vinkius-core/mcp-fusion/introspection';

const analysis = profileResponse(
  'users',
  'list',
  [
    { type: 'text', text: systemRulesXml },   // overhead block (rules)
    { type: 'text', text: affordancesXml },   // overhead block (UI)
    { type: 'text', text: dataJson },         // data block
  ],
  2,  // first 2 blocks are overhead
);

console.log(analysis.estimatedTokens);  // 3800
console.log(analysis.overheadRatio);    // 0.42 — 42% of tokens are overhead
console.log(analysis.risk);            // "medium"
```

The overhead ratio is the key metric. When it's high, it means the framework's own metadata — system rules, UI decorators, affordances — is consuming context that should be reserved for actual data. The advisory message calls this out:

```typescript
console.log(analysis.advisory);
// "OVERHEAD WARNING: Tool "users" has 42% overhead ratio. System rules
//  and UI decorators are consuming significant context."
```

Token estimation uses the ~3.5 characters/token heuristic:

$$
\text{estimatedTokens} = \left\lceil \frac{\text{text.length}}{3.5} \right\rceil
$$

This is a fast approximation optimized for profiling, not billing. For exact counts, integrate a tokenizer library like tiktoken.


## Server-Level Summary {#aggregate}

`aggregateProfiles()` rolls up all tool profiles into a server-level risk assessment:

```typescript
import { aggregateProfiles } from '@vinkius-core/mcp-fusion/introspection';

const summary = aggregateProfiles(allProfiles);

console.log(summary.overallRisk);         // "high"
console.log(summary.unboundedToolNames);  // ["reports", "analytics"]
console.log(summary.criticalToolNames);   // ["export-all"]
```

The `overallRisk` is the worst-case across all tools. If any single tool is `critical`, the server is `critical`. The `recommendations` array is prioritized — critical tools first, then high-risk, then the rest:

```typescript
for (const rec of summary.recommendations) {
  console.warn(`  ${rec}`);
}
// "[export-all] Add .agentLimit() to bound collection size"
// "[export-all] Add .egressMaxBytes() to cap payload size"
// "[reports] Add .agentLimit() to bound collection size"
```


## Integration With the Governance Stack {#integration}

Token economics data flows into the lockfile and diff engine. The `TokenEconomicsProfile` becomes the `tokenEconomics` section of the `ToolContract`, which means any change in token risk cascades through the entire pipeline:

| Change | ContractDiff Severity | Why |
|---|---|---|
| Risk escalated (low → high) | `BREAKING` | Higher risk of system rule eviction |
| Risk de-escalated (high → low) | `SAFE` | Reduced cognitive load |
| Became unbounded | `RISKY` | Potential for context flooding |
| Became bounded | `SAFE` | Guardrail added |

When risk escalates, the lockfile becomes stale, `fusion lock --check` fails in CI, and the diff engine reports the severity. This creates a mandatory review step for any change that increases token cost.


## Full Profile Pipeline {#pipeline}

```typescript
import {
  computeStaticProfile,
  aggregateProfiles,
} from '@vinkius-core/mcp-fusion/introspection';

const profiles = Object.entries(toolBuilders).map(([name, builder]) => {
  const schema = builder.presenter?.getSchemaKeys() ?? [];
  const limit = builder.presenter?.getAgentLimit() ?? null;
  const maxBytes = builder.presenter?.getEgressMaxBytes() ?? null;
  return computeStaticProfile(name, schema, limit, maxBytes);
});

const summary = aggregateProfiles(profiles);

if (summary.overallRisk === 'critical') {
  console.warn('CRITICAL: Token economics indicate context window flooding risk');
  for (const rec of summary.recommendations) {
    console.warn(`  ${rec}`);
  }
}
```
