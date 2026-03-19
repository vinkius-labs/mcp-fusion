---
title: "Semantic Probing"
description: "LLM-as-a-Judge evaluation framework for detecting semantic drift in tool handler behavior."
---

# Semantic Probing

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create semantic probes for the invoices tool, compare expected vs actual outputs through a Claude judge, and fail CI if drift exceeds medium."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create semantic probes for the invoices tool, compare expected vs actual outputs through a Claude judge, and fail CI if drift exceeds medium.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+semantic+probes+for+the+invoices+tool%2C+compare+expected+vs+actual+outputs+through+a+Claude+judge%2C+and+fail+CI+if+drift+exceeds+medium." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+semantic+probes+for+the+invoices+tool%2C+compare+expected+vs+actual+outputs+through+a+Claude+judge%2C+and+fail+CI+if+drift+exceeds+medium." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">BEHAVIORAL REGRESSION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Same schema. Different meaning.<br><span style="color:rgba(255,255,255,0.25)">LLM-as-Judge detects it.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">A handler can change its meaning without changing its structure. Semantic Probing delegates behavioral evaluation to an LLM judge — expected vs actual, drift scored, contract violations flagged.</div>
</div>


Semantic Probing addresses this gap by delegating behavioral evaluation to an LLM judge. You provide input/output pairs (expected vs. actual), and the module constructs a structured evaluation prompt, sends it through a pluggable adapter, and parses the judge's verdict into a typed result with drift classification.

The module never makes LLM calls directly. You provide a `SemanticProbeAdapter` that wraps your preferred provider — Claude, GPT-4, Ollama, a local model, or a mock for testing. No hidden network dependencies.


## Creating Probes {#probes}

A `SemanticProbe` is a structured test case: "given this input, the expected output was X, but the actual output is Y — is this semantically equivalent?"

```typescript
import { createProbe } from 'Vurb.ts/introspection';

const probe = createProbe(
  'invoices',           // toolName
  'list',               // actionKey
  { status: 'paid' },   // input arguments
  // Expected output (known-good baseline)
  [{ id: 'inv_1', amount: 100, status: 'paid' }],
  // Actual output (current handler)
  [{ id: 'inv_1', amount: 100, status: 'paid', currency: 'USD' }],
  // Contract context for the judge
  {
    description: 'List invoices with optional filters',
    readOnly: true,
    destructive: false,
    rules: ['Return only invoices matching the filter'],
    schemaKeys: ['id', 'amount', 'status'],
  },
);
```

The `contractContext` gives the judge enough information to assess whether behavioral contracts were violated — not just whether outputs differ. Without it, the judge can only compare data shapes. With it, the judge can determine if extra fields violate a read-only contract or if missing fields break schema expectations.

`createProbe()` and `buildJudgePrompt()` are pure functions — fully unit-testable without network access.


## The LLM Adapter {#adapter}

The `SemanticProbeAdapter` interface requires a single method:

```typescript
import type { SemanticProbeAdapter } from 'Vurb.ts/introspection';

const claudeAdapter: SemanticProbeAdapter = {
  name: 'claude-sonnet',
  async evaluate(prompt: string): Promise<string> {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
  },
};
```

Any provider that accepts a text prompt and returns a text response works. For deterministic test environments, create a mock:

```typescript
const mockAdapter: SemanticProbeAdapter = {
  name: 'test-mock',
  async evaluate(): Promise<string> {
    return JSON.stringify({
      similarityScore: 0.98,
      contractViolated: false,
      violations: [],
      reasoning: 'Outputs are semantically identical.',
    });
  },
};
```


## Evaluating Probes {#evaluate}

Single probe:

```typescript
import { evaluateProbe } from 'Vurb.ts/introspection';

const result = await evaluateProbe(probe, {
  adapter: claudeAdapter,
  includeRawResponses: true,
});

console.log(result.similarityScore);   // 0.92
console.log(result.driftLevel);        // 'low'
console.log(result.contractViolated);  // false
console.log(result.reasoning);         // "Outputs are semantically equivalent..."
```

Batch evaluation with concurrency control:

```typescript
import { evaluateProbes } from 'Vurb.ts/introspection';

const report = await evaluateProbes(probes, {
  adapter: claudeAdapter,
  concurrency: 5,
  thresholds: {
    highDriftThreshold: 0.4,
    mediumDriftThreshold: 0.7,
  },
});

console.log(report.stable);          // true | false
console.log(report.overallDrift);    // 'none' | 'low' | 'medium' | 'high'
console.log(report.violationCount);  // number of contract violations
console.log(report.summary);
// "5 probes evaluated. Avg similarity: 87.3%. Drift: low. Violations: 0. Status: STABLE"
```

`evaluateProbes()` processes batches with configurable concurrency (default: 3), preventing rate-limit issues with LLM APIs.


## Drift Classification {#drift}

The similarity score from the LLM judge maps to four drift levels:

| Score | Drift Level | Interpretation |
|---|---|---|
| ≥ 0.95 | `none` | Semantically identical |
| ≥ 0.75 | `low` | Minor differences, unlikely to affect LLM behavior |
| ≥ 0.50 | `medium` | Meaningful changes, may affect downstream behavior |
| < 0.50 | `high` | Significant semantic drift, likely to cause failures |

The `none` threshold (0.95) is fixed. The `medium` and `high` thresholds are configurable:

```typescript
const config = {
  adapter: myAdapter,
  thresholds: {
    highDriftThreshold: 0.4,     // default: 0.5
    mediumDriftThreshold: 0.7,   // default: 0.75
  },
};
```

The `stable` flag on `SemanticProbeReport` is `true` when `overallDrift` is `none` or `low`. This is the flag CI gates should check.


## The Judge Prompt {#prompt}

`buildJudgePrompt()` constructs a structured evaluation prompt that includes the tool metadata, behavioral contract (system rules, schema fields), input arguments, and both expected and actual outputs serialized as JSON. The prompt requests a JSON response with `similarityScore`, `contractViolated`, `violations`, and `reasoning` fields.

```typescript
import { buildJudgePrompt } from 'Vurb.ts/introspection';

const prompt = buildJudgePrompt(probe);
```

If the LLM returns malformed JSON, the parser produces a conservative fallback — similarity 0.5, drift `medium` — instead of throwing. Similarity scores are clamped to [0.0, 1.0] regardless of what the LLM returns.


## Aggregation {#aggregate}

`aggregateResults()` produces a `SemanticProbeReport` from multiple individual results:

```typescript
import { aggregateResults } from 'Vurb.ts/introspection';

const report = aggregateResults('invoices', results);

report.overallDrift;    // weighted by average similarity
report.stable;          // true if overallDrift is 'none' or 'low'
report.violationCount;  // total contract violations across all probes
report.summary;         // human-readable summary string
```


## Testing Integration {#testing}

Semantic probing integrates with `VurbTester.callAction()` for automated regression testing:

```typescript
import { createTestClient } from 'Vurb.ts/testing';
import { createProbe, evaluateProbe } from 'Vurb.ts/introspection';

const tester = createTestClient(registry);

const result = await tester.callAction('invoices', 'list', { status: 'paid' });

const probe = createProbe(
  'invoices', 'list',
  { status: 'paid' },
  knownGoodBaseline,
  result,
  contractContext,
);

const evaluation = await evaluateProbe(probe, { adapter: testAdapter });
expect(evaluation.stable);
expect(evaluation.contractViolated).toBe(false);
```

Capture the known-good baseline from a snapshot or fixture. When the handler changes, the probe detects whether the change is cosmetic (score ≥ 0.95) or a meaningful semantic drift.


## API Reference {#api}

### Functions

| Function | Description |
|---|---|
| `createProbe(toolName, actionKey, input, expected, actual, context)` | Create a structured probe from input/output pairs |
| `buildJudgePrompt(probe)` | Generate the LLM evaluation prompt |
| `evaluateProbe(probe, config)` | End-to-end single probe evaluation |
| `evaluateProbes(probes, config)` | Batch evaluation with concurrency control |
| `aggregateResults(toolName, results)` | Aggregate individual results into a report |

### Types

| Type | Description |
|---|---|
| `SemanticProbeAdapter` | `{ name, evaluate(prompt) }` — wraps your LLM provider |
| `SemanticProbe` | Structured test case with tool, action, input, expected/actual, context |
| `SemanticProbeResult` | `{ similarityScore, driftLevel, contractViolated, violations, reasoning }` |
| `SemanticProbeReport` | `{ overallDrift, violationCount, stable, summary, results }` |
| `DriftLevel` | `'none' \| 'low' \| 'medium' \| 'high'` |
