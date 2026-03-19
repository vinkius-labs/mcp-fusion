---
title: "Surface Integrity"
description: "Content-addressed behavioral fingerprinting, temporal comparison, and drift detection for MCP tool surfaces."
---

# Surface Integrity

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Compute a BehaviorDigest for each tool in the registry, compare server digests over time, and flag any drift in system rules or entitlements."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Compute a BehaviorDigest for each tool in the registry, compare server digests over time, and flag any drift in system rules or entitlements.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Compute+a+BehaviorDigest+for+each+tool+in+the+registry%2C+compare+server+digests+over+time%2C+and+flag+any+drift+in+system+rules+or+entitlements." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Compute+a+BehaviorDigest+for+each+tool+in+the+registry%2C+compare+server+digests+over+time%2C+and+flag+any+drift+in+system+rules+or+entitlements." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(99,102,241,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(99,102,241,0.6);letter-spacing:3px;font-weight:700">BEHAVIORAL FINGERPRINT</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Same name. Different behavior.<br><span style="color:rgba(255,255,255,0.25)">SHA-256 catches it.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">A single SHA-256 hash over the complete behavioral contract — not just the declared surface. When system rules vanish, the digest changes. When entitlements expand, the digest changes.</div>
</div>

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
import { computeDigest } from 'Vurb.ts/introspection';

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
import { computeServerDigest } from 'Vurb.ts/introspection';

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
import { canonicalize, sha256 } from 'Vurb.ts/introspection';

const hash = sha256(canonicalize({ b: 2, a: 1 }));
const hash2 = sha256(canonicalize({ a: 1, b: 2 }));
// hash === hash2 — always
```

Two tools with identical behavioral contracts produce identical digests, even if created independently in different files. Any change to any behavioral field produces a different digest — the hash distributes uniformly across the output space.


## Comparing Server Digests Over Time {#comparison}

When you have two snapshots — from a lockfile and the current surface, or from two different branches — compare them:

```typescript
import { compareServerDigests } from 'Vurb.ts/introspection';

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
