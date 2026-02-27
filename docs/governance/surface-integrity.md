---
title: "Surface Integrity"
description: "Content-addressed behavioral fingerprinting, temporal comparison, and drift detection for MCP tool surfaces."
---

# Surface Integrity

- [Computing a Digest](#compute)
- [The Four Digest Components](#components)
- [Determinism Guarantees](#guarantees)
- [Comparing Server Digests Over Time](#comparison)
- [System Rules Fingerprinting](#rules)
- [How Other Modules Use BehaviorDigest](#integration)
- [Performance](#performance)

Two snapshots of the same tool, taken a week apart:

| Field | Snapshot $T_0$ | Snapshot $T_1$ |
|---|---|---|
| Name | `config.read` | `config.read` |
| Description | "Read config" | "Read config" |
| Input Schema | `{ key: string }` | `{ key: string }` |
| System Rules | `["Never log secrets"]` | `[]` |

From the MCP protocol's perspective, these are the **same tool** — the name, description, and schema are identical. From a behavioral perspective, they are **different tools** — in $T_1$, the system rule protecting secrets was removed. The agent will now log secrets because nothing tells it not to.

`BehaviorDigest` catches this. It produces a single SHA-256 hash over the complete behavioral contract — not just the declared surface. The digest at $T_0$ differs from the digest at $T_1$ because `systemRulesFingerprint` is part of the computation.


## Computing a Digest {#compute}

For a single tool:

```typescript
import { computeDigest } from '@vinkius-core/mcp-fusion/introspection';

const result = computeDigest(contract);

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

The `components` object is the key insight. When the overall digest changes, comparing components reveals exactly *which section* changed — without running the full diff engine. If only `behavior` changed, you know the schema is stable but the rules, middleware, or guardrails shifted.

For the entire server:

```typescript
import { computeServerDigest } from '@vinkius-core/mcp-fusion/introspection';

const serverDigest = computeServerDigest(contracts);

console.log(serverDigest.digest);
// SHA-256 over all per-tool digests, sorted by name
```


## The Four Digest Components {#components}

The digest is a composite hash: `sha256(S:B:T:E)`. Each section is hashed independently, then the four hashes are combined into the final digest.

### Surface — What the agent sees

Input: tool name, description, tags (sorted), input schema digest, per-action contracts (sorted by key).

Changes when actions are added or removed, the schema changes, tags change, or descriptions change. This is the structural layer — the part the MCP protocol already exposes.

### Behavior — What the tool actually does

Input: egress schema digest, system rules fingerprint, cognitive guardrails, middleware chain, state-sync fingerprint, concurrency fingerprint, affordance topology, embedded Presenters.

Changes when system rules are modified, guardrails are loosened, middleware is added or removed, or affordance links change. This is the layer the MCP protocol cannot see — the behavioral contract beyond declarations.

### Token Economics — How much context it consumes

Input: schema field count, unbounded collection flag, base overhead tokens, inflation risk classification.

Changes when the response shape changes in ways that affect token density. A tool that goes from 5 fields to 25 fields will produce a different economics hash, even if the schema is technically valid.

### Entitlements — What I/O the handler uses

Input: filesystem, network, subprocess, crypto flags, raw entitlement identifiers (sorted).

Changes when static analysis detects new I/O capabilities in handler source code. A `readOnly` tool that starts importing `child_process` will produce a different entitlements hash.


## Determinism Guarantees {#guarantees}

Given the same `ToolContract`, `computeDigest()` always returns the same digest — regardless of object key insertion order, platform (Node.js, Bun, Deno), timestamp, or process ID. This is achieved through canonical JSON serialization: all objects are serialized with sorted keys before hashing.

```typescript
import { canonicalize, sha256 } from '@vinkius-core/mcp-fusion/introspection';

const hash = sha256(canonicalize({ b: 2, a: 1 }));
const hash2 = sha256(canonicalize({ a: 1, b: 2 }));
// hash === hash2 — always
```

Two tools with identical behavioral contracts produce identical digests, even if created independently in different files. Any change to any behavioral field produces a different digest — the hash distributes uniformly across the output space.


## Comparing Server Digests Over Time {#comparison}

When you have two snapshots — from a lockfile and the current surface, or from two different branches — compare them:

```typescript
import { compareServerDigests } from '@vinkius-core/mcp-fusion/introspection';

const comparison = compareServerDigests(beforeDigest, afterDigest);

if (comparison.serverDigestChanged) {
  console.log('Surface drift detected:');
  console.log('  Added:', comparison.added);
  console.log('  Removed:', comparison.removed);
  console.log('  Changed:', comparison.changed);
  console.log('  Unchanged:', comparison.unchanged);
}
```

This is the fast path for drift detection. `compareServerDigests()` runs in $O(k)$ where $k$ is the tool count — no per-field comparison, just digest matching. When you need the semantic details of *what* changed, pass the results to [Contract Diffing](/governance/contract-diffing).


## System Rules Fingerprinting {#rules}

System rules deserve special attention because they are the primary mechanism for controlling LLM behavior.

```typescript
// Static rules → deterministic fingerprint
const rules = ['Never expose PII', 'Always format as JSON'];
// fingerprint: "static:sha256(sorted-rules)"

// Dynamic rules → function-based fingerprint
const rules = (ctx) => [`User ${ctx.userId} rules`];
// fingerprint: "dynamic:sha256(function-source)"
```

Any change — adding a rule, removing a rule, or switching from static to dynamic — produces a different fingerprint and triggers a lockfile update. [Contract Diffing](/governance/contract-diffing) classifies a static-to-dynamic transition as `BREAKING` severity because the behavioral contract becomes non-deterministic.


## How Other Modules Use BehaviorDigest {#integration}

BehaviorDigest is the identity primitive. Everything else builds on it:

- The [Capability Lockfile](/governance/capability-lockfile) stores per-tool `integrityDigest` and the server-level digest
- [Contract Diffing](/governance/contract-diffing) checks `digestChanged` before running the expensive semantic diff — if the digest didn't change, the contract didn't change
- [Zero-Trust Attestation](/governance/zero-trust-attestation) signs the server digest at build time and verifies it at startup


## Performance {#performance}

| Operation | Complexity | Typical Latency |
|---|---|---|
| `computeDigest()` (single tool) | $O(n)$ — $n$ = contract field count | < 1ms |
| `computeServerDigest()` (all tools) | $O(k \cdot n)$ — $k$ = tool count | < 10ms for 100 tools |
| `compareServerDigests()` | $O(k)$ | < 1ms |

All hashing uses Node.js built-in `crypto.createHash('sha256')` — hardware-accelerated on modern CPUs.
