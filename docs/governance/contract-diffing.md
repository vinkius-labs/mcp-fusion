---
title: "Contract Diffing"
description: "Semantic delta engine with BREAKING / RISKY / SAFE / COSMETIC severity classification for behavioral contract changes."
---

# Contract Diffing

::: tip One-Liner
Not "what bytes changed" — but "what behavioral impact does this change have on the LLM?"
:::

---

## Overview

Traditional diffing tools compare bytes. `ContractDiff` compares **behavioral semantics**. It understands that removing an action is BREAKING, that loosening a cognitive guardrail is RISKY, and that rewording a description is COSMETIC. Every change is classified by severity, formatted for human review, and injectable into LLM correction prompts for automated self-healing.

---

## Severity Classification

Every contract change is classified into one of four severity levels:

| Severity | Meaning | Examples |
|---|---|---|
| **BREAKING** | LLM behavior will fail or hallucinate | Egress schema changed, system rules changed, action removed, `readOnly` flag flipped, input schema changed, handler gained `subprocess` entitlement |
| **RISKY** | LLM behavior *might* be affected | Cognitive guardrail loosened, middleware chain changed, affordance topology changed, idempotent flag changed, concurrency config changed |
| **SAFE** | Additive change, no regression risk | New action added, required field removed, entitlement removed, inflation risk decreased |
| **COSMETIC** | No behavioral impact | Description rewording, tag added (without removal) |

The classification is **not heuristic** — it is a deterministic function of the field that changed and the direction of the change.

---

## Basic Usage

```typescript
import { diffContracts, formatDiffReport } from 'mcp-fusion/introspection';

const result = diffContracts(previousContract, currentContract);

console.log(result.maxSeverity);
// "BREAKING" | "RISKY" | "SAFE" | "COSMETIC"

console.log(result.isBackwardsCompatible);
// false — if any delta is BREAKING

console.log(formatDiffReport(result));
// [invoices] Contract diff: 3 change(s), max severity: BREAKING
//
//   [BREAKING] systemRulesFingerprint: System rules changed — LLM behavioral calibration invalidated
//          static:abc123 → dynamic:def456
//   [RISKY] middlewareChain: Middleware chain changed — execution semantics may differ
//          auth:mw → auth:mw,rate-limit:mw
//   [SAFE] actions.refund: Action "refund" was added
//          (added) refund
```

---

## `ContractDiffResult`

```typescript
interface ContractDiffResult {
  /** Tool name */
  readonly toolName: string;
  /** All detected deltas, sorted by severity (BREAKING first) */
  readonly deltas: readonly ContractDelta[];
  /** Highest severity found */
  readonly maxSeverity: DeltaSeverity;
  /** Whether the overall behavior digest changed */
  readonly digestChanged: boolean;
  /** Whether the contract is backwards-compatible */
  readonly isBackwardsCompatible: boolean;
}
```

---

## Delta Categories

The diff engine inspects every section of the `ToolContract` and produces `ContractDelta` objects tagged with a category:

### Surface Deltas

| Field | Change | Severity |
|---|---|---|
| `name` | Tool renamed | BREAKING |
| `description` | Description changed | COSMETIC |
| `inputSchemaDigest` | Input schema changed | BREAKING |
| `tags` | Tag removed | SAFE |
| `tags` | Tag added (no removal) | COSMETIC |

### Action Deltas

| Field | Change | Severity |
|---|---|---|
| `actions.{key}` | Action removed | BREAKING |
| `actions.{key}` | Action added | SAFE |
| `actions.{key}.destructive` | Destructive flag changed | BREAKING |
| `actions.{key}.readOnly` | Read-only flag changed | BREAKING |
| `actions.{key}.idempotent` | Idempotent flag changed | RISKY |
| `actions.{key}.requiredFields` | New required field added | BREAKING |
| `actions.{key}.requiredFields` | Required field removed | SAFE |
| `actions.{key}.presenterName` | Presenter removed | BREAKING |
| `actions.{key}.presenterName` | Presenter changed | RISKY |
| `actions.{key}.inputSchemaDigest` | Action schema changed | RISKY |

### Behavior Deltas

| Field | Change | Severity |
|---|---|---|
| `egressSchemaDigest` | Presenter egress schema changed | BREAKING |
| `systemRulesFingerprint` | System rules changed | BREAKING |
| `agentLimitMax` | Limit removed | RISKY |
| `agentLimitMax` | Limit added/tightened | SAFE |
| `egressMaxBytes` | Egress cap removed | RISKY |
| `egressMaxBytes` | Egress cap added/tightened | SAFE |
| `middlewareChain` | Chain changed | RISKY |
| `stateSyncFingerprint` | State sync policy changed | RISKY |
| `concurrencyFingerprint` | Concurrency config changed | RISKY |
| `affordanceTopology` | Navigation graph changed | RISKY |
| `embeddedPresenters` | Presenter composition changed | RISKY |

### Token Economics Deltas

| Field | Change | Severity |
|---|---|---|
| `inflationRisk` | Risk **escalated** (e.g., low → high) | BREAKING |
| `inflationRisk` | Risk **de-escalated** (e.g., high → low) | SAFE |
| `unboundedCollection` | Became unbounded | RISKY |
| `unboundedCollection` | Became bounded | SAFE |

### Entitlement Deltas

| Field | Change | Severity |
|---|---|---|
| `filesystem` | Gained `true` | BREAKING |
| `network` | Gained `true` | BREAKING |
| `subprocess` | Gained `true` | BREAKING |
| `crypto` | Gained `true` | BREAKING |
| Any | Lost `true` → `false` | SAFE |

---

## Real-World Scenarios

### Scenario 1: Silent Schema Widening

A tool's input schema gains a new optional parameter. The tool name and description remain identical.

```typescript
const result = diffContracts(before, after);
// deltas:
//   [RISKY] actions.upload.inputSchemaDigest: Action "upload" input schema changed
//           sha256:aaa... → sha256:bbb...
```

The diff engine catches this as RISKY because the schema hash changed at the action level, even though the tool-level name/description didn't.

### Scenario 2: System Rules Removed

A tool loses its system rules (e.g., "Never expose PII").

```typescript
const result = diffContracts(before, after);
// deltas:
//   [BREAKING] systemRulesFingerprint: System rules changed — LLM behavioral calibration invalidated
//              static:abc123 → static:e3b0c4...
```

This is BREAKING because the LLM was calibrated to behave according to those rules. Removing them invalidates the behavioral contract.

### Scenario 3: Capability Expansion ("Rug Pull")

A tool gains `subprocess` entitlement — the handler now imports `child_process`.

```typescript
const result = diffContracts(before, after);
// deltas:
//   [BREAKING] subprocess: Handler gained "subprocess" entitlement — blast radius expanded
//              false → true
```

### Scenario 4: Guardrail Loosening

`agentLimitMax` is removed (set to `null`), allowing unlimited rows in response.

```typescript
const result = diffContracts(before, after);
// deltas:
//   [RISKY] agentLimitMax: Agent limit changed: 50 → unlimited
//           50 → null
```

---

## Formatting

### Human-Readable Report

```typescript
import { formatDiffReport } from 'mcp-fusion/introspection';

const report = formatDiffReport(result);
// [invoices] Contract diff: 2 change(s), max severity: BREAKING
//
//   [BREAKING] systemRulesFingerprint: System rules changed...
//          static:abc → dynamic:def
//   [SAFE] actions.list: Action "list" was added
//          (added) list
```

### XML for LLM Self-Healing

The diff engine can format deltas as XML for injection into LLM correction prompts. This enables the [Self-Healing Context](/governance/self-healing) flow:

```typescript
import { formatDeltasAsXml } from 'mcp-fusion/introspection';

const xml = formatDeltasAsXml(result.deltas);
// <contract_changes>
//   <change severity="BREAKING" field="systemRulesFingerprint">
//     <description>System rules changed — LLM behavioral calibration invalidated</description>
//     <before>static:abc</before>
//     <after>dynamic:def</after>
//   </change>
//   <change severity="SAFE" field="actions.list">
//     <description>Action "list" was added</description>
//     <after>list</after>
//   </change>
// </contract_changes>
```

This XML block is designed to be compatible with `ValidationErrorFormatter`'s format, so the LLM receives structured, actionable change descriptions.

---

## CI Integration

Combine diffing with the lockfile check for a complete governance gate:

```typescript
import { readLockfile, checkLockfile } from 'mcp-fusion/introspection';
import { diffContracts, formatDiffReport } from 'mcp-fusion/introspection';

const lockfile = await readLockfile(process.cwd());
const result = checkLockfile(lockfile!, contracts);

if (!result.ok) {
  // For each changed tool, show the semantic diff
  for (const toolName of result.changed) {
    const before = lockfileToContract(lockfile!, toolName);
    const after = contracts[toolName]!;
    const diff = diffContracts(before, after);
    console.error(formatDiffReport(diff));
  }
  process.exit(1);
}
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **Deltas sorted by severity** | BREAKING changes always appear first in reports and logs |
| **Direction-aware classification** | Gaining an entitlement is BREAKING; losing one is SAFE |
| **Composable with BehaviorDigest** | `digestChanged` is checked before running the expensive diff |
| **XML output for LLM injection** | Enables closed-loop self-healing when contracts drift |
| **Pure function** | No side effects, no state — safe to call in any context |
