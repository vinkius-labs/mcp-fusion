---
title: "Token Economics"
description: "Cognitive overload detection, context window budget profiling, and token density guardrails for MCP tool responses."
---

# Token Economics

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Run computeStaticProfile() on all tools, identify unbounded collections, and add agentLimit() and egressMaxBytes() to any tool with high or critical risk."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Run computeStaticProfile() on all tools, identify unbounded collections, and add agentLimit() and egressMaxBytes() to any tool with high or critical risk.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Run+computeStaticProfile()+on+all+tools%2C+identify+unbounded+collections%2C+and+add+agentLimit()+and+egressMaxBytes()+to+any+tool+with+high+or+critical+risk." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Run+computeStaticProfile()+on+all+tools%2C+identify+unbounded+collections%2C+and+add+agentLimit()+and+egressMaxBytes()+to+any+tool+with+high+or+critical+risk." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">CONTEXT WINDOW BUDGET</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">200 users × 8 fields = 20KB.<br><span style="color:rgba(255,255,255,0.25)">Your system rules just evicted.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">When tool responses fill the context window, system rules are pushed out of the model's attention. Token Economics detects this before it happens — at build time and at runtime.</div>
</div>


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
import type { TokenThresholds } from 'Vurb.ts/introspection';

const customThresholds: TokenThresholds = {
  low: 500,
  medium: 2000,
  high: 5000,
};
```


## Static Analysis {#static}

`computeStaticProfile()` estimates worst-case token cost from schema metadata. It runs once at build time — no runtime overhead.

```typescript
import { computeStaticProfile } from 'Vurb.ts/introspection';

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
import { profileResponse } from 'Vurb.ts/introspection';

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
import { aggregateProfiles } from 'Vurb.ts/introspection';

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

When risk escalates, the lockfile becomes stale, `Vurb.ts lock --check` fails in CI, and the diff engine reports the severity. This creates a mandatory review step for any change that increases token cost.


## Full Profile Pipeline {#pipeline}

```typescript
import {
  computeStaticProfile,
  aggregateProfiles,
} from 'Vurb.ts/introspection';

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
