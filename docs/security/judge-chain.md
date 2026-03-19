# JudgeChain

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create a JudgeChain with GPT-4o-mini as primary and Claude Haiku as fallback, with 3-second timeout and fail-closed behavior."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create a JudgeChain with GPT-4o-mini as primary and Claude Haiku as fallback, with 3-second timeout and fail-closed behavior.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+JudgeChain+with+GPT-4o-mini+as+primary+and+Claude+Haiku+as+fallback%2C+with+3-second+timeout+and+fail-closed+behavior." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+JudgeChain+with+GPT-4o-mini+as+primary+and+Claude+Haiku+as+fallback%2C+with+3-second+timeout+and+fail-closed+behavior." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">EVALUATION PRIMITIVE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Multi-model consensus.<br><span style="color:rgba(255,255,255,0.25)">Zero vendor lock-in.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The JudgeChain wraps one or more LLM adapters and orchestrates their evaluation — fallback for cost efficiency, consensus for maximum security. Bring your own model.</div>
</div>



## What Is a JudgeChain {#overview}

A JudgeChain wraps one or more `SemanticProbeAdapter` instances (the same adapter interface used by [Semantic Probing](/governance/semantic-probe)) and orchestrates their evaluation:

```typescript
import { createJudgeChain } from '@vurb/core';

const chain = createJudgeChain({
    adapters: [
        { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) },
        { name: 'claude-haiku', evaluate: (p) => claude.message(p) },
    ],
    strategy: 'fallback',
    timeoutMs: 3000,
});

const result = await chain.evaluate('Is this content safe?');
// result.passed — boolean
// result.results — per-adapter details
// result.fallbackTriggered — true if all adapters failed
```

**Zero hidden dependencies** — the adapter is a plain function you provide. No SDK, no API key in the framework, no vendor lock-in.


## Strategies {#strategies}

### Fallback (Default)

Try adapters sequentially. The first adapter that returns a parseable response wins — its verdict becomes the chain verdict. If it fails (timeout, error, unparseable), the next adapter is tried.

```typescript
const chain = createJudgeChain({
    adapters: [primaryJudge, fallbackJudge],
    strategy: 'fallback', // default
});
```

**Best for:** Cost efficiency. The primary model handles 99% of evaluations. The fallback only fires on rare failures.

### Consensus

ALL adapters are called in parallel. Every adapter must return `passed: true` for the chain to pass. Any explicit rejection blocks the content regardless of other verdicts.

```typescript
const chain = createJudgeChain({
    adapters: [gptJudge, claudeJudge, geminiJudge],
    strategy: 'consensus',
});
```

**Best for:** Maximum security. Critical paths where the cost of a false positive (allowing injection) far exceeds the cost of multiple LLM calls.

### Strategy Comparison

| Aspect | Fallback | Consensus |
|--------|----------|-----------|
| Execution | Sequential | Parallel |
| Latency | First success | Slowest adapter |
| Cost | 1 call (typical) | N calls (always) |
| Security | Good | Maximum |
| Failure mode | Next in line | Depends on `failOpen` |


## Configuration {#configuration}

```typescript
interface JudgeChainConfig {
    /** One or more LLM adapters */
    readonly adapters: readonly SemanticProbeAdapter[];

    /** 'fallback' (default) or 'consensus' */
    readonly strategy?: JudgeStrategy;

    /** Timeout per adapter in milliseconds (default: 5000) */
    readonly timeoutMs?: number;

    /** Behavior when ALL adapters fail (default: false = fail-closed) */
    readonly failOpen?: boolean;
}
```

### SemanticProbeAdapter Interface

```typescript
interface SemanticProbeAdapter {
    /** Human-readable name for logging/telemetry */
    readonly name: string;

    /** Send a prompt, return the raw text response */
    evaluate(prompt: string): Promise<string>;
}
```

Any function that takes a string and returns a string works. Wrap your LLM client in 3 lines:

```typescript
const gptMini: SemanticProbeAdapter = {
    name: 'gpt-4o-mini',
    evaluate: async (prompt) => {
        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return res.choices[0].message.content ?? '';
    },
};
```


## Timeouts {#timeouts}

Each adapter call is guarded by `Promise.race` with a per-adapter timeout. If the adapter doesn't respond within `timeoutMs`, the call is treated as an error:

```typescript
const chain = createJudgeChain({
    adapters: [slowJudge],
    timeoutMs: 2000,  // 2 seconds per adapter
});
```

- **Fallback strategy:** Timeout on adapter A → try adapter B
- **Consensus strategy:** Timeout on any adapter → treated as error → `failOpen` decides

Timeouts are properly cleaned up — no timer leaks, no `unhandledRejection` events.


## Fail-Open vs Fail-Closed {#fail-behavior}

When **all** adapters fail (timeout, error, unparseable response), the `failOpen` flag determines the verdict:

```typescript
// Fail-closed (default) — BLOCKS content when judges are unavailable
createJudgeChain({ adapters: [...], failOpen: false });

// Fail-open — PASSES content when judges are unavailable (use with caution)
createJudgeChain({ adapters: [...], failOpen: true });
```

::: warning
`failOpen: true` means an attacker who can take down your judge endpoint gets unrestricted access. Only use fail-open for non-critical, low-risk evaluations.
:::


## Response Parsing {#parsing}

The JudgeChain expects the adapter to return JSON with a `safe` boolean field:

```json
{ "safe": true }
```

Multiple field names are supported for flexibility:

| Field | Priority |
|-------|----------|
| `safe` | First |
| `passed` | Second |
| `allowed` | Third |

If the response is not valid JSON, the chain falls back to text matching (`"safe": true` / `"safe": false` in the lowercased string). If nothing matches, the response is treated as unparseable — equivalent to an adapter error.


## Telemetry {#telemetry}

The JudgeChain itself does not emit telemetry. Telemetry is emitted by the higher-level consumers:

- [PromptFirewall](/security/prompt-firewall) emits `security.firewall` events (type: `prompt`)
- [InputFirewall](/security/input-firewall) emits `security.firewall` events (type: `input`)

The `JudgeChainResult` object is available on every `FirewallVerdict` for custom telemetry:

```typescript
const verdict = await evaluateRules(rules, firewallConfig);
console.log(verdict.chainResult.results);     // per-adapter details
console.log(verdict.chainResult.totalDurationMs); // total evaluation time
```


## API Reference {#api}

### `createJudgeChain(config)`

Creates a compiled JudgeChain. Call `.evaluate(prompt)` to run.

### `JudgeChainResult`

```typescript
interface JudgeChainResult {
    readonly passed: boolean;
    readonly results: readonly JudgeResult[];
    readonly totalDurationMs: number;
    readonly fallbackTriggered: boolean;
}
```

### `JudgeResult`

```typescript
interface JudgeResult {
    readonly adapterName: string;
    readonly passed: boolean;
    readonly rawResponse: string;
    readonly durationMs: number;
}
```
