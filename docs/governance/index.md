---
title: "Capability Governance"
description: "Cryptographic surface integrity, behavioral lockfiles, and zero-trust attestation for MCP servers."
---

# Capability Governance

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [What the Protocol Cannot Answer](#the-gap)
- [Surface Drift Is Silent](#surface-drift)
- [The Governance Stack](#modules)
- [Try It in 60 Seconds](#quick-start)
- [How Contracts Materialize](#contracts)
- [Observability Integration](#observability)
- [Where to Go Next](#next-steps)

You review an MCP server. You trust its declared tools. You approve it for production.

A week later, a dependency update adds a `shell_exec` action to one of the tools. A Presenter loses its system rules. An input schema silently gains a new parameter. The MCP protocol has no mechanism to detect any of this — `tools/list` returns whatever is currently registered, and `notifications/tools/list_changed` says "something changed" without saying what, when, or how.

This is not an edge case. It is the default behavior of every MCP server in production today. For enterprise teams facing **SOC2 Audits** or strict **CISO Compliance** requirements, this invisible drift makes AI agent deployments fundamentally un-auditable.


## What the Protocol Cannot Answer {#the-gap}

The MCP lifecycle is simple: the client calls `tools/list`, the server responds with the current surface, and the client proceeds.

```text
Client                          Server
  │                               │
  │── tools/list ────────────────▶│
  │◀──────────── [tool1, tool2] ──│
  │                               │
  │     (time passes)             │
  │                               │
  │◀── notifications/tools/       │
  │    list_changed ──────────────│
  │                               │
  │── tools/list ────────────────▶│
  │◀──────── [tool1, tool2, ???] ──│
```

That lifecycle answers one question: "what tools exist right now?" It leaves six critical questions unanswered:

- Is this the same surface I trusted yesterday?
- What exactly changed since my last review?
- Did the behavioral contract change even though the schema didn't?
- Can I prove cryptographically that the surface hasn't been tampered with?
- Which tools can write to disk, even though they declare `readOnly`?
- Will this tool flood the context window and evict system rules?

These are not client UX bugs. They are missing inspection primitives at the protocol layer. Without them, you cannot build a secure **AI Agent Sandbox**. The governance stack fills every one of them, transforming MCP from a raw payload router into a cryptographically auditable boundary.


## Surface Drift Is Silent {#surface-drift}

A tool named `upload_file` initially accepts `{ path }`. After a deployment, it accepts `{ path, contents }`. The tool name didn't change. The tool ID didn't change. The description is the same. But the behavioral surface expanded — the tool can now receive arbitrary file contents from the agent.

A more subtle case: the declared surface — schema, name, description — stays structurally identical while the handler's behavior changes. A `read_config` tool starts calling `fs.writeFile`. The annotation still says `readOnlyHint: true`. The protocol provides no mechanism to detect the contradiction because it only inspects declarations, not behavior.

The governance stack detects both scenarios. Structural changes are caught by [Contract Diffing](/governance/contract-diffing). Behavioral contradictions are caught by [Blast Radius Analysis](/governance/blast-radius). Silent handler drift is caught by [Semantic Probing](/governance/semantic-probe).


## The Governance Stack {#modules}

Nine modules, each independently useful, each composable with the others:

```text
┌──────────────────────────────────────────────────────────┐
│                  Governance Stack                         │
│                                                          │
│  CapabilityLockfile ← BehaviorDigest ← ToolContract      │
│                                                          │
│  ContractDiff    CryptoAttestation    EntitlementScanner  │
│  TokenEconomics  SemanticProbe        SelfHealing         │
│                                                          │
│  CLI: fusion lock / fusion lock --check                  │
└──────────────────────────────────────────────────────────┘
```

Every module is a pure function. Side-effectful I/O (disk, network) is clearly separated. When governance is not configured, no cryptographic operations execute — the server startup path is identical to the default.


## Try It in 60 Seconds {#quick-start}

```bash
npx fusion lock --server ./src/server.ts
```

This generates `mcp-fusion.lock` — a deterministic, git-diffable artifact that captures every tool's behavioral surface. Schemas, system rules, middleware chains, entitlements, token economics — all of it, in a single committed file.

```bash
npx fusion lock --check --server ./src/server.ts
```

This gates your CI build. If anyone changes a tool's behavioral surface without updating the lockfile, the build fails. The pull request diff shows exactly what changed:

```diff
  "invoices": {
-   "integrityDigest": "sha256:f6e5d4c3b2a1...",
+   "integrityDigest": "sha256:9a8b7c6d5e4f...",
    "surface": {
      "actions": ["create", "list", "void"],
    },
    "behavior": {
-     "systemRulesFingerprint": "static:abc",
+     "systemRulesFingerprint": "dynamic",
      "destructiveActions": ["void"],
    }
  }
```

The reviewer sees that the system rules changed from static to dynamic — and can assess the AI-facing impact before merge. Without the lockfile, this change is invisible at the protocol level.


## How Contracts Materialize {#contracts}

You don't write contracts. They materialize from what you've already declared — tool builders, Presenters, middleware, system rules. The `compileContracts()` function reads all of that metadata and produces a `ToolContract` for each tool:

```typescript
import { compileContracts } from '@vinkius-core/mcp-fusion/introspection';

const contracts = compileContracts(registry.getBuilders());
```

Each `ToolContract` captures four sections:

```typescript
interface ToolContract {
  readonly surface: ToolSurface;          // name, description, actions, schema, tags
  readonly behavior: ToolBehavior;        // egress, rules, guardrails, middleware, affordances
  readonly tokenEconomics: TokenEconomicsProfile;  // field count, inflation risk
  readonly entitlements: HandlerEntitlements;       // filesystem, network, subprocess, crypto
}
```

This is the input to every governance module. The lockfile snapshots it. The digest fingerprints it. The diff engine compares it. The attestation module signs it. Zero ceremony — the developer never writes governance-specific code beyond one function call.


## Observability Integration {#observability}

All governance operations emit structured events through the same `DebugObserverFn` pipeline used by the tool execution layer:

```typescript
import { createGovernanceObserver } from '@vinkius-core/mcp-fusion/introspection';
import { createDebugObserver } from '@vinkius-core/mcp-fusion';

const observer = createGovernanceObserver({
    debug: createDebugObserver(),
    tracer: myOtelTracer,  // optional
});

const lockfile = observer.observe(
    'lockfile.generate',
    'Generate lockfile for payments-api',
    () => generateLockfile('payments-api', contracts, version),
);
```

```text
[mcp-fusion] gov  lockfile.generate ✓ Generate lockfile for payments-api  4.2ms
[mcp-fusion] gov  attestation.sign  ✓ Sign server digest                 1.1ms
```

When observability is not configured, `createNoopObserver()` provides a zero-overhead passthrough.


## Where to Go Next {#next-steps}

Each module has a dedicated page with full code examples:

- [Capability Lockfile](/governance/capability-lockfile) — `mcp-fusion.lock` generation, verification, CI gates
- [Surface Integrity](/governance/surface-integrity) — SHA-256 behavioral fingerprinting
- [Contract Diffing](/governance/contract-diffing) — semantic delta engine with severity classification
- [Zero-Trust Attestation](/governance/zero-trust-attestation) — HMAC-SHA256 signing, runtime verification
- [Blast Radius Analysis](/governance/blast-radius) — entitlement scanning with evasion detection
- [Token Economics](/governance/token-economics) — cognitive overload profiling
- [Semantic Probing](/governance/semantic-probe) — LLM-as-a-Judge for behavioral drift
- [Self-Healing Context](/governance/self-healing) — contract delta injection into validation errors
- [CLI Reference](/governance/cli) — `fusion lock` command-line interface
