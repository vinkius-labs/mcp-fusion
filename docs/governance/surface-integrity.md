---
title: "Surface Integrity"
description: "Content-addressed behavioral fingerprinting, temporal comparison, and drift detection for MCP tool surfaces."
---

# Surface Integrity

::: tip One-Liner
A SHA-256 digest that changes when behavior changes — even if the tool name, schema, and description stay identical.
:::

---

## Overview

The MCP protocol surfaces tool identity through names, descriptions, and JSON Schema. But behaviorally identical tools should produce identical fingerprints, and behaviorally different tools should produce different fingerprints — regardless of how their declarations look.

**BehaviorDigest** is a content-addressed fingerprinting module that produces a single SHA-256 hash over the complete behavioral contract of a tool. This digest is the identity primitive that the [Capability Lockfile](/governance/capability-lockfile), [Contract Diffing](/governance/contract-diffing), and [Zero-Trust Attestation](/governance/zero-trust-attestation) modules depend on.

---

## The Problem

Consider a tool with two snapshots taken at different times:

| Field | Snapshot $T_0$ | Snapshot $T_1$ |
|---|---|---|
| Name | `config.read` | `config.read` |
| Description | "Read config" | "Read config" |
| Input Schema | `{ key: string }` | `{ key: string }` |
| System Rules | `["Never log secrets"]` | `[]` |

From the MCP protocol's perspective, these are the **same tool**. From a behavioral perspective, they are **different tools** — in $T_1$, the system rule protecting secrets was removed.

BehaviorDigest detects this. The digest at $T_0$ differs from the digest at $T_1$ because `systemRulesFingerprint` is a component of the hash computation.

---

## Computing a Digest

### Single Tool

```typescript
import { computeDigest } from 'mcp-fusion/introspection';
import type { BehaviorDigestResult } from 'mcp-fusion/introspection';

const result: BehaviorDigestResult = computeDigest(contract);

console.log(result.digest);
// "a1b2c3d4e5f67890..."

console.log(result.components);
// {
//   surface:        "abc...",   // input schema, actions, tags
//   behavior:       "def...",   // egress, rules, guardrails, middleware
//   tokenEconomics: "ghi...",   // inflation risk, field count
//   entitlements:   "jkl..."    // filesystem, network, subprocess, crypto
// }
```

### Server-Level Digest

```typescript
import { computeServerDigest } from 'mcp-fusion/introspection';

const serverDigest = computeServerDigest(contracts);

console.log(serverDigest.digest);
// SHA-256 over all per-tool digests, sorted by name

console.log(Object.keys(serverDigest.tools));
// ["invoices", "payments", "refunds"]
```

---

## Digest Components

The digest is a **composite hash** over four independently hashable sections. This enables granular change detection: when the overall digest changes, comparing components reveals exactly *which section* changed.

```
                    ┌───────────────────────────┐
                    │     Composite Digest       │
                    │  sha256(S:B:T:E)           │
                    └─────────┬─────────────────┘
                              │
            ┌────────┬────────┼────────┬─────────┐
            ▼        ▼        ▼        ▼         │
       ┌─────────┐ ┌──────┐ ┌──────┐ ┌───────┐  │
       │ Surface │ │Behav.│ │Token │ │Entitl.│  │
       │  (S)    │ │ (B)  │ │ (T)  │ │ (E)   │  │
       └─────────┘ └──────┘ └──────┘ └───────┘  │
```

### Surface Component

Inputs: tool name, description, tags (sorted), input schema digest, per-action contracts (sorted by key).

Changes when: actions are added/removed, schema changes, tags change, descriptions change.

### Behavior Component

Inputs: egress schema digest, system rules fingerprint, cognitive guardrails, middleware chain, state-sync fingerprint, concurrency fingerprint, affordance topology, embedded presenters.

Changes when: Presenter egress shape changes, system rules are modified, guardrails are loosened/tightened, middleware is added/removed, affordance links change.

### Token Economics Component

Inputs: schema field count, unbounded collection flag, base overhead tokens, inflation risk classification.

Changes when: the response shape changes in ways that affect token density.

### Entitlements Component

Inputs: filesystem, network, subprocess, crypto flags, raw entitlement identifiers (sorted).

Changes when: static analysis detects new I/O capabilities in handler source code.

---

## Content-Addressed Guarantees

The digest system provides three critical guarantees:

### 1. Determinism

Given the same `ToolContract`, `computeDigest()` always returns the same digest — regardless of:

- Object key insertion order
- Platform (Node.js, Bun, Deno)
- Timestamp
- Process ID

This is achieved through **canonical JSON serialization**: all objects are serialized with sorted keys before hashing.

```typescript
import { canonicalize, sha256 } from 'mcp-fusion/introspection';

const hash = sha256(canonicalize({ b: 2, a: 1 }));
// Always identical to:
const hash2 = sha256(canonicalize({ a: 1, b: 2 }));
// hash === hash2
```

### 2. Content Address

Two tools with identical behavioral contracts produce identical digests, even if they were created independently in different files, different packages, or different projects.

### 3. Sensitivity

Any change to any behavioral field produces a different digest. The hash function distributes uniformly — no two distinct inputs are expected to collide.

---

## Temporal Comparison

### Comparing Server Digests

```typescript
import { compareServerDigests } from 'mcp-fusion/introspection';

const comparison = compareServerDigests(beforeDigest, afterDigest);

if (comparison.serverDigestChanged) {
  console.log('Surface drift detected:');
  console.log('  Added:', comparison.added);
  console.log('  Removed:', comparison.removed);
  console.log('  Changed:', comparison.changed);
  console.log('  Unchanged:', comparison.unchanged);
}
```

### `DigestComparison` Result

| Field | Type | Description |
|---|---|---|
| `serverDigestChanged` | `boolean` | Whether the overall server digest changed |
| `added` | `string[]` | Tools present now but not in the baseline |
| `removed` | `string[]` | Tools in the baseline but not present now |
| `changed` | `string[]` | Tools whose behavioral digest changed |
| `unchanged` | `string[]` | Tools with identical digests |

---

## Integration With Other Modules

BehaviorDigest is the foundation layer. Other governance modules consume it:

| Consumer | How It Uses BehaviorDigest |
|---|---|
| [Capability Lockfile](/governance/capability-lockfile) | Stores per-tool `integrityDigest` and server-level digest |
| [Contract Diffing](/governance/contract-diffing) | Compares `digestChanged` before running semantic diff |
| [Zero-Trust Attestation](/governance/zero-trust-attestation) | Signs the server digest, verifies at startup |

---

## System Rules Fingerprinting

System rules deserve special attention because they are the primary mechanism for controlling LLM behavior in the MVA pattern.

```typescript
// Static rules → deterministic fingerprint
const rules = ['Never expose PII', 'Always format as JSON'];
// fingerprint: "static:sha256(sorted-rules)"

// Dynamic rules → function-based fingerprint
const rules = (ctx) => [`User ${ctx.userId} rules`];
// fingerprint: "dynamic:sha256(function-source)"
```

The lockfile captures the fingerprint, and any change — whether adding a rule, removing a rule, or switching from static to dynamic — produces a different digest and triggers a lockfile update.

::: danger Static → Dynamic is a BREAKING change
If system rules change from static (deterministic) to dynamic (context-dependent), the behavioral contract becomes non-deterministic. [ContractDiff](/governance/contract-diffing) classifies this as `BREAKING` severity.
:::

---

## Performance

| Operation | Complexity | Typical Latency |
|---|---|---|
| `computeDigest()` (single tool) | $O(n)$ where $n$ = contract field count | < 1ms |
| `computeServerDigest()` (all tools) | $O(k \cdot n)$ where $k$ = tool count | < 10ms for 100 tools |
| `compareServerDigests()` | $O(k)$ | < 1ms |

All hashing uses Node.js built-in `crypto.createHash('sha256')` — hardware-accelerated on modern CPUs.
