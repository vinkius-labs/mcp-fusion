---
title: "Self-Healing Context"
description: "Automatic contract delta injection into validation errors, enabling LLMs to self-correct when behavioral contracts change."
---

# Self-Healing Context

::: tip One-Liner
When the LLM sends wrong arguments because the contract changed, tell it *why* and *what changed* — in the same error response.
:::

---

## Overview

When a Zod validation error occurs (the LLM sent malformed arguments), the default MCP error response tells the model *what* went wrong but not *why*. If the tool's behavioral contract changed since the LLM was last calibrated — a new required field, a renamed action, a schema constraint — the LLM will repeat the same mistake on retry because it has no context about the change.

**Contract-Aware Self-Healing** enriches validation error responses with contract delta context from the [Contract Diffing](/governance/contract-diffing) engine. When activated, the error XML includes:

1. Which contract fields changed
2. What the previous contract looked like
3. What the current contract requires

This gives the LLM enough context to self-correct on the next invocation instead of entering a retry loop.

---

## How It Works

```
Validation Error (Zod)
    │
    ▼
formatValidationError()
    │
    ▼
enrichValidationError()
    │
    ├── No contract deltas for this tool → pass through (zero cost)
    │
    └── Relevant deltas found →
            filterRelevantDeltas()     ← BREAKING + RISKY only (by default)
            buildContractContext()     ← XML block
            injectIntoXml()            ← Insert before </validation_error>
    │
    ▼
Enriched error XML with <contract_awareness> block
```

### Zero-Overhead Design

Self-healing adds **zero overhead** when no contract changes exist:

- `createToolEnhancer()` checks for deltas at initialization and returns an **identity function** if none exist — no per-call filtering, no delta lookup, no XML generation.
- `enrichValidationError()` performs a single `Map.get()` and returns immediately if the tool has no active deltas.

Contract deltas are computed once at server startup by diffing current contracts against the last known-good lockfile. The delta map is then frozen and shared across all request handlers.

---

## Usage

### Direct Enrichment

```typescript
import {
    enrichValidationError,
    type SelfHealingConfig,
} from '@vinkius-core/mcp-fusion/introspection';
import { diffContracts } from '@vinkius-core/mcp-fusion/introspection';

// Compute deltas at startup (once)
const deltas = new Map<string, ContractDiffResult>();
for (const [toolName, current] of Object.entries(currentContracts)) {
    const previous = previousContracts[toolName];
    if (previous) {
        deltas.set(toolName, diffContracts(previous, current));
    }
}

const config: SelfHealingConfig = {
    activeDeltas: deltas,
};

// In the validation error handler:
const result = enrichValidationError(
    originalErrorXml,
    'invoices',       // tool that failed
    'create',         // action that failed
    config,
);

if (result.injected) {
    console.log(`Injected ${result.deltaCount} contract deltas`);
}
// result.enrichedError contains the XML with contract context
```

### Tool-Scoped Enhancer

`createToolEnhancer()` is the primary integration point — it returns a pre-scoped function optimized for a specific tool:

```typescript
import { createToolEnhancer } from '@vinkius-core/mcp-fusion/introspection';

const enhance = createToolEnhancer('invoices', config);

// Returns identity function if no deltas exist (zero overhead)
// Otherwise enriches the error with relevant contract context
const enrichedXml = enhance(originalErrorXml, 'create');
```

This avoids per-call delta lookup and severity filtering — the deltas are pre-computed when the enhancer is created.

---

## The `<contract_awareness>` Block

When deltas are injected, the enriched error XML includes a `<contract_awareness>` block before the closing `</validation_error>` tag:

```xml
<validation_error>
  <tool>invoices</tool>
  <action>create</action>
  <error>Required field "currency" is missing</error>

  <contract_awareness>
    <system_note>
      IMPORTANT: The behavioral contract for tool "invoices" has
      changed since your last calibration.
    </system_note>
    <action>create</action>
    <change_count>2</change_count>
    <max_severity>BREAKING</max_severity>

    <instructions>
      Review the contract changes below and adjust your next
      invocation accordingly. These changes may explain why
      your previous arguments were rejected.
    </instructions>

    <contract_deltas>
      <delta severity="BREAKING" field="actions.create.inputSchema">
        <previous>{ amount: number, status: string }</previous>
        <current>{ amount: number, status: string, currency: string }</current>
      </delta>
      <delta severity="RISKY" field="cognitiveGuardrails.agentLimitMax">
        <previous>100</previous>
        <current>50</current>
      </delta>
    </contract_deltas>
  </contract_awareness>
</validation_error>
```

The `<contract_deltas>` block is generated by `formatDeltasAsXml()` from the [Contract Diffing](/governance/contract-diffing) module.

---

## Delta Filtering

Not all contract changes are relevant to a specific validation error. The module applies two filters:

### Severity Filter

By default, only **BREAKING** and **RISKY** deltas are injected. SAFE and COSMETIC changes don't cause validation failures and would add noise to the error context.

```typescript
const config: SelfHealingConfig = {
    activeDeltas: deltas,
    includeAllSeverities: true,  // include SAFE + COSMETIC too
};
```

### Action Scope Filter

Deltas are filtered by action relevance:

- **Global deltas** (e.g., `description`, `tags`) — always included
- **Action-specific deltas** (e.g., `actions.create.inputSchema`) — included only if they match the failing action

A delta for `actions.list.egressSchema` is not injected into a `create` validation error.

### Max Deltas

To prevent context flooding from large diffs, the number of injected deltas is capped:

```typescript
const config: SelfHealingConfig = {
    activeDeltas: deltas,
    maxDeltasPerError: 3,  // default: 5
};
```

---

## `SelfHealingConfig` Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `activeDeltas` | `ReadonlyMap<string, ContractDiffResult>` | — | Contract diff results keyed by tool name. Populated at server startup. |
| `includeAllSeverities` | `boolean` | `false` | When `false`, only BREAKING and RISKY deltas are injected. |
| `maxDeltasPerError` | `number` | `5` | Maximum number of deltas to inject per error response. |

## `SelfHealingResult` Reference

| Field | Type | Description |
|---|---|---|
| `originalError` | `string` | The original XML error from `formatValidationError()` |
| `enrichedError` | `string` | The enriched XML with contract context (same as original if no deltas) |
| `injected` | `boolean` | Whether any contract context was injected |
| `deltaCount` | `number` | Number of deltas injected |
| `toolName` | `string` | The tool that failed validation |

---

## API Reference

### Functions

| Function | Signature | Description |
|---|---|---|
| `enrichValidationError` | `(originalError, toolName, actionKey, config) → SelfHealingResult` | Enrich a validation error with contract change context |
| `createToolEnhancer` | `(toolName, config) → (errorXml, actionKey) → string` | Create a pre-scoped enhancer for a specific tool. Returns identity function if no deltas exist. |

---

## Integration With Contract Diffing

Self-healing consumes the output of [Contract Diffing](/governance/contract-diffing). The typical setup flow:

```typescript
import { diffContracts, formatDeltasAsXml } from '@vinkius-core/mcp-fusion/introspection';
import { createToolEnhancer } from '@vinkius-core/mcp-fusion/introspection';

// 1. Read the lockfile (last known-good contracts)
const lockfile = await readLockfile(cwd);

// 2. Compile current contracts
const currentContracts = compileContracts(builders);

// 3. Diff each tool
const deltas = new Map();
for (const [toolName, current] of Object.entries(currentContracts)) {
    const previous = lockfile.capabilities.tools[toolName];
    if (previous) {
        deltas.set(toolName, diffContracts(previous, current));
    }
}

// 4. Create per-tool enhancers
const config = { activeDeltas: deltas };
const enhancers = new Map();
for (const toolName of Object.keys(currentContracts)) {
    enhancers.set(toolName, createToolEnhancer(toolName, config));
}
```

---

## Design Notes

| Aspect | Detail |
|---|---|
| **XML injection safety** | The `<contract_awareness>` block uses `formatDeltasAsXml()` from ContractDiff, which sanitizes field values to prevent XML injection. |
| **Deterministic output** | Given the same deltas and error, the enriched output is always identical — no timestamps, no randomness. |
| **No hidden side effects** | `enrichValidationError` is a pure function — it doesn't log, doesn't write, doesn't make network calls. |
| **Identity optimization** | `createToolEnhancer()` returns a literal identity function `(x) => x` when no deltas exist, ensuring the JIT can inline it completely. |
