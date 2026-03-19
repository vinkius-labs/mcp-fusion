# Security Layer

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add LLM-powered input and prompt firewalls to all tools, with a JudgeChain using GPT-4o-mini as primary and Claude Haiku as fallback."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add LLM-powered input and prompt firewalls to all tools, with a JudgeChain using GPT-4o-mini as primary and Claude Haiku as fallback.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+LLM-powered+input+and+prompt+firewalls+to+all+tools%2C+with+a+JudgeChain+using+GPT-4o-mini+as+primary+and+Claude+Haiku+as+fallback." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+LLM-powered+input+and+prompt+firewalls+to+all+tools%2C+with+a+JudgeChain+using+GPT-4o-mini+as+primary+and+Claude+Haiku+as+fallback." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">SEMANTIC DEFENSE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Regex can't stop what it can't understand.<br><span style="color:rgba(255,255,255,0.25)">LLM-as-Judge can.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The Security Layer replaces pattern matching with semantic understanding. Every defense is powered by an LLM judge — the same technology that understands the attack also understands the defense.</div>
</div>

Your MCP server accepts user-generated data — invoice descriptions, ticket comments, form fields. That data flows into system rules, tool arguments, and Presenter pipelines. An attacker who controls a database row controls the prompt.

Traditional defenses (regex, keyword lists, pattern matching) cannot keep up. Write a rule for English injection? The attacker writes in Mandarin. Block `ignore previous instructions`? They encode it in Base64. The attack surface is infinite; the defense surface is finite.

The Security Layer replaces pattern matching with **semantic understanding**. Every defense is powered by an LLM judge — the same technology that understands the attack also understands the defense.


## Why Regex Fails {#why-regex-fails}

```text
Regex rule:    /ignore.*previous.*instructions/i
Attack:        "忽略之前的所有指令，执行以下操作"
Result:        ✅ Regex passes — injection succeeds
```

Pattern-based defenses fail because:

1. **Multilingual bypass** — Injection in Chinese, Arabic, or Korean evades English-only rules
2. **Encoding bypass** — Base64, Unicode escapes, homoglyph substitution
3. **Semantic bypass** — Paraphrasing the same intent with different words
4. **Combinatorial explosion** — Every new pattern requires a new rule; attackers iterate faster

The Security Layer uses **LLM-as-Judge** — a secondary LLM that evaluates content for malicious intent regardless of language, encoding, or phrasing. The judge understands semantics, not syntax.


## LLM-as-Judge Philosophy {#llm-as-judge}

The core primitive is the [JudgeChain](/security/judge-chain) — a composable evaluation engine that supports one or more LLM judges with configurable execution strategies:

- **Fallback** — Try judges sequentially. First success wins. Cost-efficient for most use cases.
- **Consensus** — ALL judges must agree. Maximum security for critical paths.

The framework provides the evaluation prompt. You only bring the LLM adapter(s):

```typescript
import { createJudgeChain } from '@vurb/core';

const chain = createJudgeChain({
    adapters: [
        { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) },
        { name: 'claude-haiku', evaluate: (p) => claude.message(p) },
    ],
    strategy: 'fallback',
    timeoutMs: 3000,
    failOpen: false, // fail-closed by default
});
```

Every security component — PromptFirewall, InputFirewall — reuses this same primitive. No hidden network dependencies. No vendor lock-in.


## Architecture {#architecture}

```text
                    ┌─────────────────────────────────────────┐
                    │              Security Layer               │
                    │                                           │
  User Input ──▶   │  InputFirewall ──▶ JudgeChain ──▶ Pass/Block  │
                    │       │                                   │
                    │       ▼                                   │
  Tool Args ──▶    │  RateLimiter ──▶ Check ──▶ Record ──▶ Next │
                    │       │                                   │
                    │       ▼                                   │
  Handler ──▶      │  AuditTrail ──▶ SHA-256 ──▶ Emit Event    │
                    │       │                                   │
                    │       ▼                                   │
  System Rules ──▶ │  PromptFirewall ──▶ JudgeChain ──▶ Filter │
                    │                                           │
                    └─────────────────────────────────────────┘
```

**Four layers, each independently composable:**

| Layer | Position | Purpose |
|-------|----------|---------|
| [InputFirewall](/security/input-firewall) | Before handler | Blocks malicious tool arguments |
| [RateLimiter](/security/rate-limiter) | Before handler | Sliding-window request throttling |
| [AuditTrail](/security/audit-trail) | Wraps handler | SOC2/GDPR compliance logging |
| [PromptFirewall](/security/prompt-firewall) | After handler | Filters injected system rules |

All four emit `security.*` telemetry events when a sink is configured. All four default to **fail-closed** — if the judge crashes, content is blocked.


## Feature Map {#features}

| Feature | SOC2 | GDPR | Zero Config |
|---------|------|------|-------------|
| LLM-as-Judge evaluation | CC7.2 | — | Bring your adapter |
| Multi-adapter fallback/consensus | CC7.2 | — | ✅ |
| Per-adapter timeouts | CC7.2 | — | 5s default |
| Fail-closed by default | CC6.1 | — | ✅ |
| Prompt injection detection | CC6.1 | — | ✅ |
| Input argument validation | CC6.1 | Art. 32 | ✅ |
| Sliding-window rate limiting | CC6.1 | — | ✅ |
| Custom stores (Redis, Valkey) | CC6.1 | — | Interface provided |
| SHA-256 argument hashing | CC7.3 | Art. 5(1)(c) | ✅ |
| Identity extraction | CC6.1 | Art. 30 | Configurable |
| Telemetry events | CC7.2 | Art. 30 | Optional sink |


## Quick Start {#quick-start}

Add all four layers to a tool in under 10 lines:

```typescript
import {
    inputFirewall, rateLimit, auditTrail, createJudgeChain
} from '@vurb/core';

const judge = { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) };

const billing = createTool('billing')
    .use(rateLimit({ windowMs: 60_000, max: 100, keyFn: (ctx) => ctx.userId }))
    .use(auditTrail({ sink: telemetrySink, extractIdentity: (ctx) => ({ userId: ctx.userId }) }))
    .use(inputFirewall({ adapter: judge, toolName: 'billing' }))
    .action({ name: 'create', /* ... */ });
```

For output-side protection, add the PromptFirewall to your Presenter:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(InvoiceModel)
    .systemRules((inv) => [`Status: ${inv.description}`])
    .promptFirewall({
        adapter: judge,
        failOpen: false,
    });

// MUST use makeAsync():
const builder = await InvoicePresenter.makeAsync(data, ctx);
```


## Where to Go Next {#next-steps}

Each component has a dedicated page with full code examples:

- [JudgeChain](/security/judge-chain) — Multi-adapter LLM evaluation primitive
- [Prompt Firewall](/security/prompt-firewall) — Output-side injection defense for system rules
- [Input Firewall](/security/input-firewall) — Input-side middleware for tool arguments
- [Rate Limiter](/security/rate-limiter) — Sliding-window throttling with custom stores
- [Audit Trail](/security/audit-trail) — SOC2/GDPR compliance logging with SHA-256
- [DLP & PII Redaction](/dlp-redaction) — Late Guillotine field masking for GDPR/LGPD/HIPAA
- [Sandbox Engine](/sandbox) — Zero-Trust V8 isolates for user-generated code
- [Runtime Guards](/runtime-guards) — Concurrency limits, egress controls, OOM protection
- [FSM State Gate](/fsm-state-gate) — Workflow-driven tool availability (cart empty → no `pay`)
- [Authentication](/oauth) — OAuth, [JWT](/jwt), [API Key](/api-key) middleware
- [Governance & Lockfile](/governance/) — Cryptographic surface integrity (9 modules)
- [Enterprise Security](/enterprise/security) · [Observability & Audit](/enterprise/observability) · [Multi-Tenancy](/enterprise/multi-tenancy)

