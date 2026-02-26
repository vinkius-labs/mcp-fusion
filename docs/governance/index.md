---
title: "Capability Governance"
description: "Cryptographic surface integrity, behavioral lockfiles, and zero-trust attestation for MCP servers. A governance primitive for AI tool infrastructure."
---

# Capability Governance

After you review and trust an MCP server's declared capabilities, nothing in the protocol can prove that those capabilities haven't changed. There is no snapshot, no diff, no continuity proof — the protocol provides the current state, and only the current state.

MCP Fusion's governance stack fills this gap: deterministic lockfiles, cryptographic attestation, behavioral diffing, blast radius analysis, and cognitive overload detection. All modules are zero-overhead when not configured.

---

## The Problem

The Model Context Protocol defines a simple lifecycle for capability discovery:

```
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

The protocol tells you **what exists right now**. It does not tell you:

| Question | Protocol Answer |
|---|---|
| Is this the same surface I trusted yesterday? | ❌ Not available |
| What exactly changed since my last review? | ❌ Not available |
| When did the capability surface change? | ❌ Not available |
| Can I prove cryptographically that it changed? | ❌ Not available |
| Did the behavioral contract change even if the schema didn't? | ❌ Not available |
| Which tools can write to disk, even though they're declared `readOnly`? | ❌ Not available |

This is not a client UX bug. It is not a runtime enforcement gap. **It is a missing inspection primitive at the protocol layer.**

---

## Why This Matters

### Surface Drift

A server can silently expand its declared capabilities while the session is running. A new tool appears. An existing tool's schema gains new parameters. An action enum expands to include destructive operations. The `notifications/tools/list_changed` signal tells the client *something* changed — but provides no snapshot, no diff, and no artifact that can be stored, compared, or audited.

### Rug Pulls

A server that was reviewed and approved at time $T_0$ can modify its tool descriptions at time $T_1$ to include hidden instructions. Since the protocol has no concept of "surface identity," the client has no mechanism to detect that the server it trusted is no longer the same server.

### Schema Mutation Under Stable Names

A tool named `upload_file` initially accepts `{ path }`. After a silent mutation, it accepts `{ path, contents }`. The tool name hasn't changed. The tool ID hasn't changed. The user who reviewed `upload_file` has no way to know its behavioral surface has expanded.

### Behavioral Drift Without Surface Change

The declared surface — schema, name, description — can remain structurally identical while the handler's behavior changes. A `read_config` tool starts writing files to disk. The protocol provides no mechanism to detect this because it only inspects declarations, not behavior.

---

## The Governance Stack

The governance stack consists of nine modules:

```
┌───────────────────────────────────────────────────────────────────┐
│                    Capability Governance Stack                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   CapabilityLockfile                        │  │
│  │  mcp-fusion.lock — git-diffable behavioral surface snapshot │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                    depends on │                                    │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │                    BehaviorDigest                           │  │
│  │  SHA-256 content-addressed fingerprint per tool             │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                    depends on │                                    │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │                    ToolContract                             │  │
│  │  Materialized behavioral contract from builder metadata     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  ContractDiff   │  │  CryptoAttest.  │  │  Entitlement     │  │
│  │  Semantic Delta │  │  Zero-Trust     │  │  Scanner         │  │
│  │  Engine         │  │  Runtime Pin    │  │  Blast Radius    │  │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘  │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐                        │
│  │ TokenEconomics  │  │ SemanticProbe   │                        │
│  │ Overload Guard  │  │ LLM-as-Judge    │                        │
│  └─────────────────┘  └─────────────────┘                        │
└───────────────────────────────────────────────────────────────────┘
```

| Module | Purpose | Protocol Gap Addressed |
|---|---|---|
| [Capability Lockfile](/governance/capability-lockfile) | `mcp-fusion.lock` — behavioral surface snapshot | "Is this the same surface?" |
| [Contract Diffing](/governance/contract-diffing) | Semantic delta engine with severity classification | "What exactly changed?" |
| [Surface Integrity](/governance/surface-integrity) | Content-addressed digest + temporal comparison | "When did it change?", "Can I prove it?" |
| [Zero-Trust Attestation](/governance/zero-trust-attestation) | Cryptographic signing + capability pinning | "Has the server been tampered with?" |
| [Blast Radius Analysis](/governance/blast-radius) | Multi-layer static analysis with evasion detection | "Which tools can write to disk?", "Is this code hiding its intent?" |
| [Token Economics](/governance/token-economics) | Cognitive overload profiling + guardrail verification | "Will this tool flood the context window?" |
| [Semantic Probing](/governance/semantic-probe) | LLM-as-a-Judge behavioral drift detection | "Does the handler still *mean* the same thing?" |
| [Self-Healing Context](/governance/self-healing) | Contract delta injection into validation errors | "Why is the LLM repeating the same mistake?" |
| [CLI Reference](/governance/cli) | `fusion lock` / `fusion lock --check` command-line interface | "How do I gate this in CI?" |

---

## The Lockfile In 60 Seconds

The fastest path to capability governance:

```bash
# Generate the lockfile
npx fusion lock --server ./src/server.ts

# CI gate — fail if the lockfile is stale
npx fusion lock --check --server ./src/server.ts
```

This produces `mcp-fusion.lock` — a deterministic, git-diffable artifact that captures every tool's behavioral surface:

```json
{
  "lockfileVersion": 1,
  "serverName": "payments-api",
  "fusionVersion": "1.1.0",
  "generatedAt": "2026-02-26T12:00:00.000Z",
  "integrityDigest": "sha256:a1b2c3d4e5f6...",
  "capabilities": {
    "tools": {
      "invoices": {
        "integrityDigest": "sha256:f6e5d4c3b2a1...",
        "surface": {
          "description": "Manage invoices",
          "actions": ["create", "list", "void"],
          "inputSchemaDigest": "sha256:...",
          "tags": ["billing"]
        },
        "behavior": {
          "egressSchemaDigest": "sha256:...",
          "systemRulesFingerprint": "static:abc",
          "destructiveActions": ["void"],
          "readOnlyActions": ["list"],
          "middlewareChain": ["auth:mw"],
          "affordanceTopology": ["payments.refund"],
          "cognitiveGuardrails": {
            "agentLimitMax": 50,
            "egressMaxBytes": null
          }
        },
        "tokenEconomics": {
          "inflationRisk": "low",
          "schemaFieldCount": 5,
          "unboundedCollection": false
        },
        "entitlements": {
          "filesystem": false,
          "network": true,
          "subprocess": false,
          "crypto": false,
          "codeEvaluation": false
        }
      }
    }
  }
}
```

Commit this file. Every pull request diff now shows exactly which behavioral surfaces changed:

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

**The reviewer can see, in the pull request, that the system rules changed from static to dynamic — and assess the AI-facing impact before merge.**

---

## Design Principles

| Principle | Implementation |
|---|---|
| **Zero overhead** | When governance is not configured, no cryptographic operations execute. The code path is identical to the default. |
| **Zero ceremony** | Contracts materialize from what the developer has already declared. No annotations, no config files, no DSLs. |
| **Pure functions** | Every module is a pure-function module. Side-effectful I/O (disk, network) is clearly separated and optional. |
| **Content-addressed** | Two servers with identical behavior produce identical digests, regardless of creation order, timestamps, or platform. |
| **VCS-native** | The lockfile is designed for `git diff`. Key ordering is deterministic. Timestamps are isolated. |
| **Composable** | Each module is independently useful. Use the lockfile without attestation. Use diffing without the scanner. |

---

## What the Protocol Provides vs. What Governance Adds

| Capability | MCP Protocol | Governance Stack |
|---|---|---|
| Current tool list | `tools/list` | `tools/list` + `fusion://manifest.json` |
| Change notification | `notifications/tools/list_changed` | Same |
| Durable snapshot | Not available | `mcp-fusion.lock` in VCS |
| Behavioral diff | Not available | Semantic deltas with severity |
| Schema mutation detection | Not available | Per-tool `inputSchemaDigest` |
| Behavioral drift detection | Not available | Egress schema + rules fingerprint |
| Cryptographic attestation | Not available | HMAC-SHA256 / pluggable KMS |
| Blast radius analysis | Not available | Multi-layer entitlement scanner |
| Token economics profiling | Not available | Cognitive overload classification |
| CI/CD gate | Not available | `fusion lock --check` |

---

## Observability Integration

All governance operations integrate with the [debug observer system](/observability). The `GovernanceObserver` bridge emits structured `GovernanceEvent` objects through the same `DebugObserverFn` pipeline used by the tool execution layer, and optionally creates OpenTelemetry-compatible tracing spans.

```typescript
import { createGovernanceObserver } from '@vinkius-core/mcp-fusion/introspection';
import { createDebugObserver } from '@vinkius-core/mcp-fusion/observability';

const observer = createGovernanceObserver({
    debug: createDebugObserver(),
    tracer: myOtelTracer,  // optional
});

// Every governance operation emits a typed event + tracing span
const lockfile = observer.observe(
    'lockfile.generate',
    'Generate lockfile for payments-api',
    () => generateLockfile('payments-api', contracts, version),
);
```

Console output:
```
[mcp-fusion] gov  lockfile.generate ✓ Generate lockfile for payments-api  4.2ms
[mcp-fusion] gov  attestation.sign  ✓ Sign server digest                 1.1ms
```

When observability is not configured, `createNoopObserver()` provides a zero-overhead passthrough. See [Observability → Governance Observability](/observability#governance-observability) for the full API reference.

---

## Next Steps

- [Capability Lockfile](/governance/capability-lockfile) — Generate, verify, and integrate `mcp-fusion.lock` into CI/CD
- [Surface Integrity](/governance/surface-integrity) — Content-addressed behavioral fingerprinting
- [Contract Diffing](/governance/contract-diffing) — Semantic delta engine with severity classification
- [Zero-Trust Attestation](/governance/zero-trust-attestation) — Cryptographic signing and runtime verification
- [Blast Radius Analysis](/governance/blast-radius) — Entitlement scanning with evasion heuristics
- [Token Economics](/governance/token-economics) — Cognitive overload detection and budget profiling
- [Semantic Probing](/governance/semantic-probe) — LLM-as-a-Judge for semantic drift detection
- [Self-Healing Context](/governance/self-healing) — Contract delta injection into validation errors
- [CLI Reference](/governance/cli) — `fusion lock` command-line interface
