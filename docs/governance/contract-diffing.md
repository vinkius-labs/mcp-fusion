---
title: "Contract Diffing"
description: "Semantic delta engine with BREAKING / RISKY / SAFE / COSMETIC severity classification for behavioral contract changes."
---

# Contract Diffing

- [Severity Classification](#severity)
- [Using the Diff Engine](#usage)
- [What Gets Compared](#delta-categories)
- [Real-World Scenarios](#scenarios)
- [Formatting for LLM Self-Healing](#xml)
- [CI Integration](#ci)

Traditional diffing tools compare bytes. A tool's description changed? That's a text diff. A tool gained a `subprocess` entitlement? Also a text diff — same severity, same visual treatment in the PR review.

But these are not the same change. The description rewording is cosmetic — the LLM won't behave differently. The subprocess entitlement is a capability expansion — the tool can now execute arbitrary commands. `ContractDiff` understands this difference. Every change is classified by behavioral impact, not by how many bytes moved.


## Severity Classification {#severity}

Every contract change falls into one of four severity levels. The classification is deterministic — it depends on which field changed and the direction of the change, not on heuristics:

| Severity | Meaning | When it fires |
|---|---|---|
| **BREAKING** | The LLM's behavior will fail or hallucinate | Egress schema changed, system rules changed, action removed, `readOnly` flipped, handler gained `subprocess` entitlement |
| **RISKY** | The LLM's behavior *might* be affected | Cognitive guardrail loosened, middleware chain changed, affordance topology changed, concurrency config changed |
| **SAFE** | Additive change, no regression risk | New action added, required field removed, entitlement dropped, inflation risk decreased |
| **COSMETIC** | No behavioral impact | Description rewording, tag added without removal |

This matters because your CI pipeline can make decisions based on severity. BREAKING changes block the merge. RISKY changes require a senior review. SAFE and COSMETIC changes pass automatically.


## Using the Diff Engine {#usage}

```typescript
import { diffContracts, formatDiffReport } from '@vinkius-core/mcp-fusion/introspection';

const result = diffContracts(previousContract, currentContract);

console.log(result.maxSeverity);
// "BREAKING" | "RISKY" | "SAFE" | "COSMETIC"

console.log(result.isBackwardsCompatible);
// false — any BREAKING delta makes this false

console.log(formatDiffReport(result));
```

The formatted report reads like a changelog:

```text
[invoices] Contract diff: 3 change(s), max severity: BREAKING

  [BREAKING] systemRulesFingerprint: System rules changed — LLM behavioral calibration invalidated
         static:abc123 → dynamic:def456
  [RISKY] middlewareChain: Middleware chain changed — execution semantics may differ
         auth:mw → auth:mw,rate-limit:mw
  [SAFE] actions.refund: Action "refund" was added
         (added) refund
```

Deltas are sorted by severity — BREAKING first, COSMETIC last. The `ContractDiffResult` gives you everything programmatically:

```typescript
interface ContractDiffResult {
  readonly toolName: string;
  readonly deltas: readonly ContractDelta[];
  readonly maxSeverity: DeltaSeverity;
  readonly digestChanged: boolean;
  readonly isBackwardsCompatible: boolean;
}
```


## What Gets Compared {#delta-categories}

The diff engine inspects every section of the `ToolContract`. Here's what fires at each severity level.

### Surface Changes

Removing an action is BREAKING — the LLM was trained to call it and now it's gone. Adding an action is SAFE — no existing behavior regresses. Changing the description is COSMETIC — the LLM might parse it slightly differently but the behavioral contract is intact.

| Field | Change | Severity |
|---|---|---|
| `inputSchemaDigest` | Schema changed | BREAKING |
| `actions.{key}` | Action removed | BREAKING |
| `actions.{key}` | Action added | SAFE |
| `description` | Description changed | COSMETIC |
| `tags` | Tag removed | SAFE |
| `tags` | Tag added (no removal) | COSMETIC |

### Action-Level Changes

Flipping `readOnly` or `destructive` is BREAKING — the LLM's behavioral calibration for that action is invalid. Adding a new required field is BREAKING — existing invocations will fail validation. Removing a required field is SAFE — existing invocations still work.

| Field | Change | Severity |
|---|---|---|
| `destructive` | Flag changed | BREAKING |
| `readOnly` | Flag changed | BREAKING |
| `requiredFields` | New required field | BREAKING |
| `requiredFields` | Required field removed | SAFE |
| `idempotent` | Flag changed | RISKY |
| `inputSchemaDigest` | Action schema changed | RISKY |
| `presenterName` | Presenter removed | BREAKING |
| `presenterName` | Presenter changed | RISKY |

### Behavior Changes

System rules changing is BREAKING — the LLM was calibrated to behave according to those rules. Removing a guardrail is RISKY — the response might flood the context. Adding a guardrail is SAFE — it only constrains.

| Field | Change | Severity |
|---|---|---|
| `egressSchemaDigest` | Egress schema changed | BREAKING |
| `systemRulesFingerprint` | System rules changed | BREAKING |
| `agentLimitMax` | Limit removed | RISKY |
| `agentLimitMax` | Limit added/tightened | SAFE |
| `egressMaxBytes` | Cap removed | RISKY |
| `egressMaxBytes` | Cap added/tightened | SAFE |
| `middlewareChain` | Chain changed | RISKY |
| `affordanceTopology` | Navigation graph changed | RISKY |

### Entitlement Changes

Gaining an I/O capability is always BREAKING. Losing one is always SAFE. There is no ambiguity — if the handler gains `subprocess`, the blast radius expanded.

| Field | Change | Severity |
|---|---|---|
| `filesystem` | Gained `true` | BREAKING |
| `network` | Gained `true` | BREAKING |
| `subprocess` | Gained `true` | BREAKING |
| `crypto` | Gained `true` | BREAKING |
| Any | Lost `true` → `false` | SAFE |

### Token Economics Changes

Inflation risk escalating is BREAKING — higher risk of system rule eviction from the context window. Risk de-escalating is SAFE.

| Field | Change | Severity |
|---|---|---|
| `inflationRisk` | Escalated (e.g., low → high) | BREAKING |
| `inflationRisk` | De-escalated (e.g., high → low) | SAFE |
| `unboundedCollection` | Became unbounded | RISKY |
| `unboundedCollection` | Became bounded | SAFE |


## Real-World Scenarios {#scenarios}

### Silent Schema Widening

A tool's input schema gains a new optional parameter. The tool name and description are identical. The diff engine catches the action-level schema digest change:

```typescript
const result = diffContracts(before, after);
// [RISKY] actions.upload.inputSchemaDigest: Action "upload" input schema changed
//         sha256:aaa... → sha256:bbb...
```

### System Rules Removed

A Presenter loses its system rules (e.g., "Never expose PII"). This is BREAKING because the LLM was calibrated to behave according to those rules — removing them invalidates the behavioral contract:

```typescript
const result = diffContracts(before, after);
// [BREAKING] systemRulesFingerprint: System rules changed
//            static:abc123 → static:e3b0c4...
```

### Capability Expansion

A tool gains `subprocess` entitlement — the handler now imports `child_process`. The tool's declared surface hasn't changed, but its blast radius expanded:

```typescript
const result = diffContracts(before, after);
// [BREAKING] subprocess: Handler gained "subprocess" entitlement
//            false → true
```


## Formatting for LLM Self-Healing {#xml}

The diff engine can format deltas as XML for injection into LLM correction prompts. This is how [Self-Healing Context](/governance/self-healing) works — when the LLM sends wrong arguments because the contract changed, the error response includes the specific changes:

```typescript
import { formatDeltasAsXml } from '@vinkius-core/mcp-fusion/introspection';

const xml = formatDeltasAsXml(result.deltas);
```

```xml
<contract_changes>
  <change severity="BREAKING" field="systemRulesFingerprint">
    <description>System rules changed</description>
    <before>static:abc</before>
    <after>dynamic:def</after>
  </change>
  <change severity="SAFE" field="actions.list">
    <description>Action "list" was added</description>
    <after>list</after>
  </change>
</contract_changes>
```


## CI Integration {#ci}

Combine diffing with the lockfile check for a complete governance gate:

```typescript
import { readLockfile, checkLockfile } from '@vinkius-core/mcp-fusion/introspection';
import { diffContracts, formatDiffReport } from '@vinkius-core/mcp-fusion/introspection';

const lockfile = await readLockfile(process.cwd());
const result = checkLockfile(lockfile!, contracts);

if (!result.ok) {
  for (const toolName of result.changed) {
    const before = lockfileToContract(lockfile!, toolName);
    const after = contracts[toolName]!;
    const diff = diffContracts(before, after);
    console.error(formatDiffReport(diff));
  }
  process.exit(1);
}
```

The lockfile check tells you *which* tools changed. The diff engine tells you *how* they changed and *what impact* that has on the LLM.
