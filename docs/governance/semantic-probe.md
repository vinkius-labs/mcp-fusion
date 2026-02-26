---
title: "Semantic Probing"
description: "LLM-as-a-Judge evaluation framework for detecting semantic drift in tool handler behavior."
---

# Semantic Probing

::: tip One-Liner
Not "did the schema change?" — but "does the handler still *mean* the same thing?"
:::

---

## Overview

Deterministic governance modules (Contract Diffing, Surface Integrity, Capability Lockfile) detect structural changes — schema mutations, system rule rewording, entitlement additions. But a handler can change its *meaning* without changing its structure. A `list` action that previously returned 10 items now returns 1000. A `summarize` action that used to produce two-sentence summaries now outputs full paragraphs. The egress schema is identical, the system rules are unchanged — yet the LLM's downstream behavior will be affected.

**Semantic Probing** addresses this gap by delegating behavioral evaluation to an LLM judge. You provide input/output pairs (expected vs. actual), and the module constructs a structured evaluation prompt, sends it through a pluggable adapter, and parses the judge's verdict into a typed result with drift classification.

---

## Architecture

```
                     ┌──────────────────────────┐
                     │    SemanticProbeConfig    │
                     │  adapter: YourLLMAdapter  │
                     │  thresholds, concurrency  │
                     └────────────┬─────────────┘
                                  │
  createProbe() ──► SemanticProbe ──► buildJudgePrompt() ──► adapter.evaluate()
                                                                     │
                                                            Raw LLM response
                                                                     │
                                                       parseJudgeResponse()
                                                                     │
                                                        SemanticProbeResult
                                                                     │
                                                        aggregateResults()
                                                                     │
                                                       SemanticProbeReport
```

Key architectural decisions:

| Decision | Rationale |
|---|---|
| **Adapter pattern** | The module never makes LLM calls directly. You provide a `SemanticProbeAdapter` that wraps your preferred provider (Claude, GPT-4, local model). No hidden network dependencies. |
| **Pure probe construction** | `createProbe()` and `buildJudgePrompt()` are pure functions — fully unit-testable without network access. |
| **Concurrency control** | `evaluateProbes()` processes batches with configurable concurrency (default: 3), preventing rate-limit issues with LLM APIs. |
| **Graceful fallback** | If the LLM judge returns unparseable output, the result falls back to `medium` drift with a parse-failure violation — never throws. |

---

## Creating Probes

A `SemanticProbe` is a structured test case: "given this input, the expected output was X, but the actual output is Y — is this semantically equivalent?"

```typescript
import { createProbe } from '@vinkius-core/mcp-fusion/introspection';

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
        systemRules: ['Return only invoices matching the filter'],
        schemaKeys: ['id', 'amount', 'status'],
    },
);
```

The `contractContext` gives the judge enough information to assess whether behavioral contracts were violated — not just whether outputs differ.

---

## The LLM Adapter

The `SemanticProbeAdapter` interface requires a single method:

```typescript
import type { SemanticProbeAdapter } from '@vinkius-core/mcp-fusion/introspection';

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

Any provider that accepts a text prompt and returns a text response works — OpenAI, Anthropic, Ollama, a local model, or a mock for testing.

---

## Evaluating Probes

### Single Probe

```typescript
import { evaluateProbe } from '@vinkius-core/mcp-fusion/introspection';

const result = await evaluateProbe(probe, {
    adapter: claudeAdapter,
    includeRawResponses: true,
});

console.log(result.similarityScore);   // 0.92
console.log(result.driftLevel);         // 'low'
console.log(result.contractViolated);   // false
console.log(result.violations);         // []
console.log(result.reasoning);          // "Outputs are semantically equivalent..."
```

### Batch Evaluation

```typescript
import { evaluateProbes } from '@vinkius-core/mcp-fusion/introspection';

const report = await evaluateProbes(probes, {
    adapter: claudeAdapter,
    concurrency: 5,       // parallel evaluations
    thresholds: {
        highDriftThreshold: 0.4,    // stricter than default
        mediumDriftThreshold: 0.7,
    },
});

console.log(report.stable);          // true | false
console.log(report.overallDrift);    // 'none' | 'low' | 'medium' | 'high'
console.log(report.violationCount);  // number of contract violations
console.log(report.summary);
// "5 probes evaluated. Avg similarity: 87.3%. Drift: low. Violations: 0. Status: STABLE"
```

---

## Drift Classification

The similarity score returned by the LLM judge is classified into four drift levels:

| Score Range | Drift Level | Interpretation |
|---|---|---|
| ≥ 0.95 | `none` | Semantically identical |
| ≥ 0.75 | `low` | Minor differences, unlikely to affect LLM behavior |
| ≥ 0.50 | `medium` | Meaningful changes, may affect downstream behavior |
| < 0.50 | `high` | Significant semantic drift, likely to cause failures |

Thresholds for `medium` and `high` are configurable via `SemanticThresholds`:

```typescript
const config: SemanticProbeConfig = {
    adapter: myAdapter,
    thresholds: {
        highDriftThreshold: 0.4,     // default: 0.5
        mediumDriftThreshold: 0.7,   // default: 0.75
    },
};
```

The `none` threshold (0.95) is fixed — outputs with ≥ 95% similarity are always classified as having no drift.

---

## The Judge Prompt

`buildJudgePrompt()` constructs a structured evaluation prompt that includes:

1. **Tool metadata** — name, action, description, readOnly/destructive flags
2. **Behavioral contract** — system rules and expected schema fields
3. **Input arguments** — the exact input that produced both outputs
4. **Expected vs. actual output** — serialized as JSON blocks
5. **Evaluation instructions** — specific criteria for the judge to assess

The prompt requests a JSON response with `similarityScore`, `contractViolated`, `violations`, and `reasoning` fields. The parser extracts JSON from markdown code blocks and handles malformed responses with conservative defaults.

```typescript
import { buildJudgePrompt } from '@vinkius-core/mcp-fusion/introspection';

const prompt = buildJudgePrompt(probe);
// Use directly if you need custom LLM interaction logic
```

---

## Aggregation

`aggregateResults()` produces a `SemanticProbeReport` from multiple individual results:

```typescript
import { aggregateResults } from '@vinkius-core/mcp-fusion/introspection';

const report = aggregateResults('invoices', results);

report.overallDrift;    // weighted by average similarity
report.stable;          // true if overallDrift is 'none' or 'low'
report.violationCount;  // total contract violations across all probes
report.summary;         // human-readable summary string
```

---

## Testing Integration

Semantic probing integrates with `FusionTester.callAction()` for automated regression testing:

```typescript
import { createTestClient } from '@vinkius-core/mcp-fusion/testing';
import { createProbe, evaluateProbe } from '@vinkius-core/mcp-fusion/introspection';

const tester = createTestClient(registry);

// Capture the actual output
const result = await tester.callAction('invoices', 'list', { status: 'paid' });

// Compare against a known-good baseline
const probe = createProbe(
    'invoices', 'list',
    { status: 'paid' },
    knownGoodBaseline,    // from snapshot or fixture
    result,
    contractContext,
);

const evaluation = await evaluateProbe(probe, { adapter: testAdapter });
expect(evaluation.stable);
expect(evaluation.contractViolated).toBe(false);
```

For deterministic test environments, create a mock adapter that returns fixed responses:

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

---

## API Reference

### Types

| Type | Description |
|---|---|
| `SemanticProbeConfig` | Configuration: adapter, thresholds, concurrency, includeRawResponses |
| `SemanticProbeAdapter` | Pluggable LLM interface: `name` + `evaluate(prompt)` |
| `SemanticThresholds` | Drift classification thresholds: `highDriftThreshold`, `mediumDriftThreshold` |
| `SemanticProbe` | Structured test case: tool, action, input, expected/actual output, contract context |
| `ProbeContractContext` | Contract metadata for the judge: description, readOnly, destructive, systemRules, schemaKeys |
| `SemanticProbeResult` | Evaluation result: score, driftLevel, contractViolated, violations, reasoning |
| `DriftLevel` | `'none' \| 'low' \| 'medium' \| 'high'` |
| `SemanticProbeReport` | Aggregated report: overallDrift, violationCount, stable, summary |

### Functions

| Function | Signature | Description |
|---|---|---|
| `createProbe` | `(toolName, actionKey, input, expected, actual, context) → SemanticProbe` | Create a structured probe from input/output pairs |
| `buildJudgePrompt` | `(probe) → string` | Generate the LLM evaluation prompt |
| `parseJudgeResponse` | `(probe, rawResponse, config) → SemanticProbeResult` | Parse LLM output into a typed result |
| `evaluateProbe` | `(probe, config) → Promise<SemanticProbeResult>` | End-to-end single probe evaluation |
| `evaluateProbes` | `(probes, config) → Promise<SemanticProbeReport>` | Batch evaluation with concurrency control |
| `aggregateResults` | `(toolName, results) → SemanticProbeReport` | Aggregate individual results into a report |

---

## Design Notes

| Aspect | Detail |
|---|---|
| **No hidden dependencies** | The module never imports an HTTP client or LLM SDK. All network interaction is delegated to the adapter. |
| **Parse resilience** | If the LLM returns malformed JSON, `parseJudgeResponse` produces a conservative fallback result (similarity 0.5, drift `medium`) instead of throwing. |
| **Score clamping** | Similarity scores are clamped to [0.0, 1.0] regardless of what the LLM returns. |
| **Deterministic IDs** | Probe IDs are `{toolName}::{actionKey}::{timestamp}` — unique but traceable. |
| **Zero overhead when unused** | If you don't call semantic probing functions, no LLM adapter is instantiated and no prompts are constructed. |
