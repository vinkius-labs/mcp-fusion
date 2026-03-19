---
title: "Capability Governance"
description: "Cryptographic surface integrity, behavioral lockfiles, and zero-trust attestation for MCP servers."
---

# Capability Governance

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add governance to my MCP server: generate a vurb.lock, add lockfile check to CI, configure contract diffing, and enable zero-trust attestation."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add governance to my MCP server: generate a vurb.lock, add lockfile check to CI, configure contract diffing, and enable zero-trust attestation.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+governance+to+my+MCP+server%3A+generate+a+vurb.lock%2C+add+lockfile+check+to+CI%2C+configure+contract+diffing%2C+and+enable+zero-trust+attestation." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+governance+to+my+MCP+server%3A+generate+a+vurb.lock%2C+add+lockfile+check+to+CI%2C+configure+contract+diffing%2C+and+enable+zero-trust+attestation." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(99,102,241,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(99,102,241,0.6);letter-spacing:3px;font-weight:700">BEHAVIORAL GOVERNANCE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">You approved the server.<br><span style="color:rgba(255,255,255,0.25)">Then a dependency changed it.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Cryptographic surface integrity, behavioral lockfiles, contract diffing, and zero-trust attestation — a full governance stack that makes MCP server drift un-deployable.</div>
</div>

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
│  CLI: Vurb.ts lock / Vurb.ts lock --check                  │
└──────────────────────────────────────────────────────────┘
```

Every module is a pure function. Side-effectful I/O (disk, network) is clearly separated. When governance is not configured, no cryptographic operations execute — the server startup path is identical to the default.


## Try It in 60 Seconds {#quick-start}

```bash
vurb lock --server ./src/server.ts
```

This generates `vurb.lock` — a deterministic, git-diffable artifact that captures every tool's behavioral surface. Schemas, system rules, middleware chains, entitlements, token economics — all of it, in a single committed file.

```bash
vurb lock --check --server ./src/server.ts
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
import { compileContracts } from 'Vurb.ts/introspection';

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
import { createGovernanceObserver } from 'Vurb.ts/introspection';
import { createDebugObserver } from '@vurb/core';

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
[Vurb.ts] gov  lockfile.generate ✓ Generate lockfile for payments-api  4.2ms
[Vurb.ts] gov  attestation.sign  ✓ Sign server digest                 1.1ms
```

When observability is not configured, `createNoopObserver()` provides a zero-overhead passthrough.


## Where to Go Next {#next-steps}

Each module has a dedicated page with full code examples:

- [Capability Lockfile](/governance/capability-lockfile) — `vurb.lock` generation, verification, CI gates
- [Surface Integrity](/governance/surface-integrity) — SHA-256 behavioral fingerprinting
- [Contract Diffing](/governance/contract-diffing) — semantic delta engine with severity classification
- [Zero-Trust Attestation](/governance/zero-trust-attestation) — HMAC-SHA256 signing, runtime verification
- [Blast Radius Analysis](/governance/blast-radius) — entitlement scanning with evasion detection
- [Token Economics](/governance/token-economics) — cognitive overload profiling
- [Semantic Probing](/governance/semantic-probe) — LLM-as-a-Judge for behavioral drift
- [Self-Healing Context](/governance/self-healing) — contract delta injection into validation errors
- [CLI Reference](/governance/cli) — `Vurb.ts lock` command-line interface
