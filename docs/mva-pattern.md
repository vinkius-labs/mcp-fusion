# The MVA Pattern

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Rewrite my raw MCP handler using the MVA pattern — Model for data, Presenter for agent perception, middleware for auth."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Rewrite my raw MCP handler using the MVA pattern — Model for data, Presenter for agent perception, middleware for auth.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Rewrite+my+raw+MCP+handler+using+the+MVA+pattern+%E2%80%94+Model+for+data%2C+Presenter+for+agent+perception%2C+middleware+for+auth." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Rewrite+my+raw+MCP+handler+using+the+MVA+pattern+%E2%80%94+Model+for+data%2C+Presenter+for+agent+perception%2C+middleware+for+auth." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break: The problem -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">THE PROBLEM</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">MVC wasn't built for agents.<br><span style="color:rgba(255,255,255,0.25)">Every guess is a hallucination.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">When a tool returns <code style="font-size:12px;color:rgba(239,68,68,0.6);background:rgba(239,68,68,0.06);padding:1px 5px;border-radius:3px">{ amount_cents: 45000 }</code>, the agent guesses: cents or dollars? Offer a payment action? What visualization?</div>
</div>

<!-- Problem cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(239,68,68,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Context Starvation</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Data without rules. <code style="font-size:10px">45000</code> displays as dollars instead of cents.</div>
</div>

<div style="border:1px solid rgba(245,158,11,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(245,158,11,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Action Blindness</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">No affordances → hallucinated tool names and skipped workflows.</div>
</div>

<div style="border:1px solid rgba(192,132,252,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(192,132,252,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Perception Drift</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Same entity, different tools, contradictory behavior.</div>
</div>

</div>

---

<!-- Editorial break: The solution -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">THE SOLUTION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Model → View → Agent.<br><span style="color:rgba(255,255,255,0.25)">Deterministic perception.</span></div>
</div>

## The MVA Flow {#solution}

<!-- Numbered steps -->
<div style="margin:32px 0">

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(129,140,248,0.3);background:rgba(129,140,248,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(129,140,248,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">01</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Model — Domain Data</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Defined with <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">defineModel()</code>. Declares field types, defaults, fillable profiles, hidden and guarded fields. One source of truth.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(34,211,238,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">02</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">View — Presenter</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Shapes perception with rules, UI blocks, affordances, and Zod validation. Domain-level, not tool-level. Define <code style="font-size:10px;color:rgba(34,211,238,0.6);background:rgba(34,211,238,0.06);padding:1px 5px;border-radius:3px">InvoicePresenter</code> once — every tool reuses it.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;padding:20px 24px;border-left:2px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">03</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Agent — LLM/AI</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Receives structured context — not raw data. The agent follows explicit affordances instead of guessing. Claude, GPT, Gemini, or any MCP client.</div>
</div>
</div>

</div>

## The Model {#schema-validation}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">models/InvoiceModel.ts</span>
</div>
<div style="padding:20px">

```typescript
import { defineModel } from '@vurb/core';

export const InvoiceModel = defineModel('Invoice', m => {
  m.casts({
    id:           m.string('Invoice identifier'),
    amount_cents: m.number('Amount in cents — divide by 100 for display'),
    status:       m.enum('Payment status', ['paid', 'pending', 'overdue']),
  });

  m.hidden(['tenant_id']);         // never reaches the agent
  m.guarded(['id']);               // never mass-assignable
  m.fillable({
    create: ['amount_cents', 'status'],
    update: ['status'],
  });
});
```

</div>
</div>

Fields not in `m.casts()` or excluded via `m.hidden()` never reach the agent. `.describe()` annotations auto-extract as system rules.

---

## The Presenter {#presenter-responsibilities}

<!-- Feature Grid: Presenter capabilities -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(129,140,248,0.8);padding:3px 10px;border:1px solid rgba(129,140,248,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">RULES</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">System Rules</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Travel with the data, not in a global prompt. Context-aware — adapt to user role, tenant, locale.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(34,211,238,0.8);padding:3px 10px;border:1px solid rgba(34,211,238,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">UI</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">UI Blocks</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Charts, tables, markdown, diagrams. Single items use <code style="font-size:10px">.ui()</code>, arrays use <code style="font-size:10px">.collectionUi()</code>.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(52,211,153,0.8);padding:3px 10px;border:1px solid rgba(52,211,153,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">LIMIT</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Cognitive Guardrails</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Truncate arrays before validation. Without this, 10,000 rows dump into the context window.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(245,158,11,0.8);padding:3px 10px;border:1px solid rgba(245,158,11,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">HATEOAS</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Affordances</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Data-driven next actions. No hallucinated tool names, no skipped workflows.</div>
</div>

</div>

### Context-Aware Rules {#context-aware-rules}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">dynamic rules — RBAC-aware</span>
</div>
<div style="padding:20px">

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema(InvoiceModel)
  .rules((invoice, ctx) => [
    'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Mask financial totals for non-admin users.'
      : null,
    `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}.`,
  ]);
```

</div>
</div>

When the agent works with users or orders, invoice rules aren't loaded. This is **Context Tree-Shaking**.

### Affordances {#affordances}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">HATEOAS — state-driven actions</span>
</div>
<div style="padding:20px">

```typescript
import { createPresenter, suggest } from '@vurb/core';

const InvoicePresenter = createPresenter('Invoice')
  .schema(InvoiceModel)
  .suggest((invoice) => [
    suggest('billing.pay', 'Process immediate payment'),
    invoice.status === 'overdue'
      ? suggest('billing.escalate', 'Escalate to collections')
      : null,
  ].filter(Boolean));
```

</div>
</div>

## Composition {#composition}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">nested Presenters</span>
</div>
<div style="padding:20px">

```typescript
const ClientPresenter = createPresenter('Client')
  .schema(clientSchema)
  .rules(['Display company name prominently.']);

const InvoicePresenter = createPresenter('Invoice')
  .schema(InvoiceModel)
  .rules(['amount_cents is in CENTS.'])
  .embed('client', ClientPresenter);
```

</div>
</div>

`ClientPresenter`'s rules and UI blocks merge automatically. Define once — reuse across `InvoicePresenter`, `OrderPresenter`, `ContractPresenter`.

## Pipeline Integration {#pipeline}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">tool + Presenter = MVA</span>
</div>
<div style="padding:20px">

```typescript
const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by ID')
  .withString('invoice_id', 'The exact invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
      include: { client: true },
    });
  });
```

</div>
</div>

The handler (Model) produces raw data. The Presenter (View) shapes perception. The LLM (Agent) acts on structured context.

> [!TIP]
> The handler can return raw data directly — `FluentToolBuilder.handle()` auto-wraps non-`ToolResponse` returns with `success()`.

---

## Deep Dives {#deep-dives}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/mva/" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">OVERVIEW</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">MVA At a Glance</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Visual overview of the MVA flow.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva/theory" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">THEORY</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Theory & Axioms</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Formal axioms behind the pattern.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva/mva-vs-mvc" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">COMPARISON</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">MVA vs MVC</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Why MVC doesn't work for agents.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 0 32px">

<a href="/comparison" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">CODE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Side-by-Side</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Code comparison with raw MCP SDK.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/architecture" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">INTERNALS</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Architecture</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Registry, pipeline, compilation details.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva-convention" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">CONVENTION</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">MVA Convention</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">File and folder conventions.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

### Cookbook Recipes

- [MVA Presenter](/cookbook/mva-presenter) · [Presenter Composition](/cookbook/presenter-composition) · [Custom Responses](/cookbook/custom-responses)
- [Context-Aware Rules](/cookbook/context-aware-rules) · [Context Tree-Shaking](/cookbook/context-tree-shaking) · [Agentic Affordances](/cookbook/agentic-affordances)