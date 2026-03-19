---
title: "Contract Diffing"
description: "Semantic delta engine with BREAKING / RISKY / SAFE / COSMETIC severity classification for behavioral contract changes."
---

# Contract Diffing

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Diff the current tool contracts against the lockfile and block the PR if any BREAKING-severity deltas exist."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Diff the current tool contracts against the lockfile and block the PR if any BREAKING-severity deltas exist.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Diff+the+current+tool+contracts+against+the+lockfile+and+block+the+PR+if+any+BREAKING-severity+deltas+exist." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Diff+the+current+tool+contracts+against+the+lockfile+and+block+the+PR+if+any+BREAKING-severity+deltas+exist." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">SEMANTIC DELTA ENGINE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Not all diffs are equal.<br><span style="color:rgba(255,255,255,0.25)">BREAKING · RISKY · SAFE · COSMETIC</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Every contract change is classified by behavioral impact, not by how many bytes moved. A description rewording is cosmetic. A subprocess entitlement expansion is breaking.</div>
</div>


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
import { diffContracts, formatDiffReport } from 'Vurb.ts/introspection';

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

Gaining an I/O capability is always BREAKING. Losing one is always SAFE. There is no ambiguity — if the handler quietly gains a `subprocess` entitlement through an obscure dependency update, it mathematically guarantees a potential **Lateral Movement Attack**. Contract Diffing flags this instantly as `BREAKING`, preventing malicious capabilities from passing CI untouched.

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
import { formatDeltasAsXml } from 'Vurb.ts/introspection';

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
import { readLockfile, checkLockfile } from 'Vurb.ts/introspection';
import { diffContracts, formatDiffReport } from 'Vurb.ts/introspection';

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
