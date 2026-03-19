---
title: "Self-Healing Context"
description: "Automatic contract delta injection into validation errors, enabling LLMs to self-correct when behavioral contracts change."
---

# Self-Healing Context

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Enable self-healing: diff current contracts against the lockfile and inject contract deltas into Zod validation errors so the LLM can self-correct."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Enable self-healing: diff current contracts against the lockfile and inject contract deltas into Zod validation errors so the LLM can self-correct.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Enable+self-healing%3A+diff+current+contracts+against+the+lockfile+and+inject+contract+deltas+into+Zod+validation+errors+so+the+LLM+can+self-correct." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Enable+self-healing%3A+diff+current+contracts+against+the+lockfile+and+inject+contract+deltas+into+Zod+validation+errors+so+the+LLM+can+self-correct." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">ZERO-RETRY RECOVERY</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Errors that teach.<br><span style="color:rgba(255,255,255,0.25)">The LLM self-corrects on first retry.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">When a contract changes and validation fails, the error response includes the exact deltas — what changed, what the previous contract looked like, and what the current one requires. One retry, zero loops.</div>
</div>


Contract-Aware Self-Healing enriches validation error responses with contract delta context from the [Contract Diffing](/governance/contract-diffing) engine. The error XML includes which fields changed, what the previous contract looked like, and what the current contract requires. This gives the LLM enough context to self-correct on the next invocation instead of entering a retry loop.

When no contract changes exist, self-healing adds zero overhead. `createToolEnhancer()` checks for deltas at initialization and returns an identity function if none exist — no per-call filtering, no delta lookup, no XML generation.


## Enriching Validation Errors {#enrich}

```typescript
import {
  enrichValidationError,
  type SelfHealingConfig,
} from 'Vurb.ts/introspection';
import { diffContracts } from 'Vurb.ts/introspection';

// Compute deltas at startup (once)
const deltas = new Map<string, ContractDiffResult>();
for (const [toolName, current] of Object.entries(currentContracts)) {
  const previous = previousContracts[toolName];
  if (previous) {
    deltas.set(toolName, diffContracts(previous, current));
  }
}

const config: SelfHealingConfig = {
  activeDeltas: deltas,
};

const result = enrichValidationError(
  originalErrorXml,
  'invoices',
  'create',
  config,
);

if (result.injected) {
  console.log(`Injected ${result.deltaCount} contract deltas`);
}
```

Contract deltas are computed once at server startup by diffing current contracts against the last known-good lockfile. The delta map is then frozen and shared across all request handlers.


## Tool-Scoped Enhancer {#enhancer}

`createToolEnhancer()` is the primary integration point. It returns a pre-scoped function optimized for a specific tool:

```typescript
import { createToolEnhancer } from 'Vurb.ts/introspection';

const enhance = createToolEnhancer('invoices', config);

const enrichedXml = enhance(originalErrorXml, 'create');
```

If no deltas exist for the tool, `createToolEnhancer()` returns a literal identity function `(x) => x`. The JIT can inline this completely — the validation error path has zero additional cost when contracts are stable.


## The `<contract_awareness>` Block {#block}

When deltas are injected, the enriched error XML includes a `<contract_awareness>` block before the closing `</validation_error>` tag:

```xml
<validation_error>
  <tool>invoices</tool>
  <action>create</action>
  <error>Required field "currency" is missing</error>

  <contract_awareness>
    <system_note>
      IMPORTANT: The behavioral contract for tool "invoices" has
      changed since your last calibration.
    </system_note>
    <action>create</action>
    <change_count>2</change_count>
    <max_severity>BREAKING</max_severity>

    <instructions>
      Review the contract changes below and adjust your next
      invocation accordingly. These changes may explain why
      your previous arguments were rejected.
    </instructions>

    <contract_deltas>
      <delta severity="BREAKING" field="actions.create.inputSchema">
        <previous>{ amount: number, status: string }</previous>
        <current>{ amount: number, status: string, currency: string }</current>
      </delta>
      <delta severity="RISKY" field="cognitiveGuardrails.agentLimitMax">
        <previous>100</previous>
        <current>50</current>
      </delta>
    </contract_deltas>
  </contract_awareness>
</validation_error>
```

The `<contract_deltas>` block is generated by `formatDeltasAsXml()` from the [Contract Diffing](/governance/contract-diffing) module. Field values are sanitized to prevent XML injection.


## Delta Filtering {#filtering}

Not all contract changes are relevant to a specific validation error. The module applies two filters:

**Severity filter** — By default, only `BREAKING` and `RISKY` deltas are injected. `SAFE` and `COSMETIC` changes don't cause validation failures and would add noise:

```typescript
const config: SelfHealingConfig = {
  activeDeltas: deltas,
  includeAllSeverities: true,  // include SAFE + COSMETIC too
};
```

**Action scope filter** — Deltas are filtered by action relevance. Global deltas (e.g., `description`, `tags`) are always included. Action-specific deltas (e.g., `actions.create.inputSchema`) are included only if they match the failing action. A delta for `actions.list.egressSchema` won't be injected into a `create` validation error.

To prevent context flooding from large diffs, the number of injected deltas is capped:

```typescript
const config: SelfHealingConfig = {
  activeDeltas: deltas,
  maxDeltasPerError: 3,  // default: 5
};
```


## Full Setup Flow {#setup}

The typical integration reads the lockfile (last known-good contracts), compiles current contracts, diffs each tool, and creates per-tool enhancers:

```typescript
import { diffContracts } from 'Vurb.ts/introspection';
import { createToolEnhancer } from 'Vurb.ts/introspection';
import { readLockfile, compileContracts } from 'Vurb.ts/introspection';

const lockfile = await readLockfile(cwd);
const currentContracts = compileContracts(builders);

const deltas = new Map();
for (const [toolName, current] of Object.entries(currentContracts)) {
  const previous = lockfile.capabilities.tools[toolName];
  if (previous) {
    deltas.set(toolName, diffContracts(previous, current));
  }
}

const config = { activeDeltas: deltas };
const enhancers = new Map();
for (const toolName of Object.keys(currentContracts)) {
  enhancers.set(toolName, createToolEnhancer(toolName, config));
}
```

Tools with no changes get identity enhancers. Tools with breaking changes get enhancers that inject contract context into every validation error. The cost is proportional to the number of changes — zero for stable tools.


## Configuration {#config}

`SelfHealingConfig`:

| Field | Type | Default | Description |
|---|---|---|---|
| `activeDeltas` | `ReadonlyMap<string, ContractDiffResult>` | — | Contract diff results keyed by tool name |
| `includeAllSeverities` | `boolean` | `false` | When `false`, only BREAKING and RISKY deltas are injected |
| `maxDeltasPerError` | `number` | `5` | Maximum deltas to inject per error response |

`SelfHealingResult`:

| Field | Type | Description |
|---|---|---|
| `originalError` | `string` | The original validation error XML |
| `enrichedError` | `string` | The enriched XML (same as original if no deltas) |
| `injected` | `boolean` | Whether any contract context was injected |
| `deltaCount` | `number` | Number of deltas injected |
| `toolName` | `string` | The tool that failed validation |


## API Reference {#api}

| Function | Description |
|---|---|
| `enrichValidationError(originalError, toolName, actionKey, config)` | Enrich a validation error with contract change context |
| `createToolEnhancer(toolName, config)` | Create a pre-scoped enhancer. Returns identity function if no deltas exist. |

Both functions are pure — no logging, no writes, no network calls. Given the same deltas and error, the enriched output is always identical.
