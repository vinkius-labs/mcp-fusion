# Introduction

<div class="ms-badges">
<a href="https://github.com/vinkius-labs/vurb.ts/releases"><img src="https://img.shields.io/badge/First%20Release-Feb%2012%2C%202026-blue" alt="First Release"></a>
<a href="https://www.npmjs.com/package/@vurb/core"><img src="https://img.shields.io/npm/dt/@vurb/core" alt="Downloads"></a>
<a href="https://www.npmjs.com/package/@vurb/core"><img src="https://img.shields.io/npm/dw/@vurb/core" alt="Weekly Downloads"></a>
<a href="https://www.npmjs.com/package/@vurb/core"><img src="https://img.shields.io/npm/v/@vurb/core.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript" alt="TypeScript"></a>
<a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square" alt="MCP SDK"></a>
<a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square" alt="License"></a>
<img src="https://img.shields.io/badge/Built%20with-%F0%9F%9A%80%20by%20Vinkius-%23000000" alt="Built with 🚀 by Vinkius">
</div>

---

<!-- Trojan Horse Hero -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">THE EXPRESS.JS FOR MCP SERVERS</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Stop writing raw, chaotic MCP servers.<br><span style="color:rgba(255,255,255,0.25)">Your AI agent already knows Vurb.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:560px;line-height:1.7;font-family:Inter,sans-serif">Routes, data shaping, and security in one framework. Zero new syntax — if you know Zod and TypeScript, you already know Vurb. Your AI agent implements it via <strong style="color:rgba(192,132,252,0.7)">SKILL.md</strong>.</div>
</div>

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create an MCP server for invoice management with Presenters, PII redaction on customer_ssn, tenant isolation middleware, and deploy to Vinkius Cloud."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create an MCP server for invoice management with Presenters, PII redaction on customer_ssn, tenant isolation middleware, and deploy to Vinkius Cloud.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+an+MCP+server+for+invoice+management+with+Presenters%2C+PII+redaction+on+customer_ssn%2C+tenant+isolation+middleware%2C+and+deploy+to+Vinkius+Cloud." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+an+MCP+server+for+invoice+management+with+Presenters%2C+PII+redaction+on+customer_ssn%2C+tenant+isolation+middleware%2C+and+deploy+to+Vinkius+Cloud." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Pain-as-Trust: Split-Screen -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">THE REAL PROBLEM</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Your LLM is reading your database.<br><span style="color:rgba(255,255,255,0.25)">What is it seeing?</span></div>
</div>

<!-- Split-screen: Without vs With Vurb -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin:32px 0;border-radius:12px;overflow:hidden">

<!-- LEFT: danger -->
<div style="border:1px solid rgba(239,68,68,0.2);border-right:none;background:rgba(239,68,68,0.03);padding:24px">
<span style="font-size:9px;color:rgba(239,68,68,0.7);letter-spacing:2px;font-weight:700">WITHOUT VURB — RAW MCP</span>
<div style="margin-top:16px;border:1px solid rgba(239,68,68,0.1);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(239,68,68,0.3)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(239,68,68,0.3)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(239,68,68,0.3)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">raw-handler.ts</span>
</div>
<div style="padding:12px">

```typescript
server.setRequestHandler(async (req) => {
  const user = await db.user.findUnique({
    where: { id: req.params.id },
  });
  // ⚠️ password_hash, ssn, tenant_id
  //    ALL sent directly to the LLM
  return { content: [{ type: 'text',
    text: JSON.stringify(user) }] };
});
```

</div>
</div>
<div style="font-size:11px;color:rgba(239,68,68,0.5);margin-top:12px;line-height:1.6;font-family:Inter,sans-serif">The LLM sees <code style="font-size:10px">password_hash</code>, <code style="font-size:10px">ssn</code>, <code style="font-size:10px">tenant_id</code> — everything. No validation. No redaction. One migration adds a column → instant data leak.</div>
</div>

<!-- RIGHT: safe -->
<div style="border:1px solid rgba(52,211,153,0.2);background:rgba(52,211,153,0.03);padding:24px">
<span style="font-size:9px;color:rgba(52,211,153,0.7);letter-spacing:2px;font-weight:700">WITH VURB</span>
<div style="margin-top:16px;border:1px solid rgba(52,211,153,0.1);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(52,211,153,0.3)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(52,211,153,0.3)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(52,211,153,0.3)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">tools/users/get.ts</span>
</div>
<div style="padding:12px">

```typescript
export default f.query('users.get')
  .withString('id', 'User ID')
  .returns(UserPresenter)
  .redactPII(['ssn', 'password_hash'])
  .handle(async (input, ctx) => {
    return ctx.db.user.findUnique({
      where: { id: input.id },
    });
  });
```

</div>
</div>
<div style="font-size:11px;color:rgba(52,211,153,0.5);margin-top:12px;line-height:1.6;font-family:Inter,sans-serif">The LLM sees <code style="font-size:10px">[REDACTED]</code>. Schema allowlists fields. New columns are invisible unless declared. GDPR/HIPAA/SOC2 — built in.</div>
</div>

</div>

::: warning Architect's Check
Verify that `.redactPII()` is chained BEFORE `.handle()`. If your AI agent forgot the Presenter, undeclared fields still leak. The schema is your security boundary — always audit it.
:::

---

## What You Tell the AI {#in-practice}

The code below is what your AI agent produces when you give it the prompt above. Vurb ships a **[SKILL.md](https://agentskills.io)** — your AI reads it and produces idiomatic architecture on the first pass.

<!-- Numbered steps flow -->
<div style="margin:32px 0">

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(129,140,248,0.3);background:rgba(129,140,248,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(129,140,248,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">01</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Context — standard TypeScript</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">This is a regular TypeScript interface. Nothing proprietary.</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">src/vurb.ts</span>
</div>
<div style="padding:12px">

```typescript
import { initVurb } from '@vurb/core';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string; tenantId: string };
}
const f = initVurb<AppContext>();
```

</div>
</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(34,211,238,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">02</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Presenter — shapes what the LLM perceives</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Schema is a Zod allowlist. Rules and affordances tell the agent exactly how to act.</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">views/InvoicePresenter.ts</span>
</div>
<div style="padding:12px">

```typescript
const InvoicePresenter = f.presenter({
  name: 'Invoice',
  schema: InvoiceModel,
  rules: (inv) => [
    inv.status === 'overdue' ? 'Invoice is overdue. Mention it.' : null,
  ],
  suggest: (inv) => [
    inv.status === 'draft'
      ? suggest('billing.send', 'Send invoice', { id: inv.id })
      : null,
  ].filter(Boolean),
});
```

</div>
</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;padding:20px 24px;border-left:2px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">03</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Tool — the agentic API</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Semantic verbs define intent. <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">f.query()</code> = read-only. <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">f.mutation()</code> = destructive.</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">tools/billing/get.ts</span>
</div>
<div style="padding:12px">

```typescript
export const getInvoice = f.query('billing.get')
  .describe('Retrieve an invoice by ID')
  .instructions('Use only when the user refers to a specific invoice ID.')
  .withString('id', 'The unique invoice identifier')
  .returns(InvoicePresenter)
  .use(async ({ ctx, next }) => {
     const user = await auth.verify(ctx.token);
     return next({ ...ctx, user });
  })
  .handle(async (input, ctx) => {
    return ctx.db.invoice.findUnique({
      where: { id: input.id, tenantId: ctx.user.tenantId },
    });
  });
```

</div>
</div>
</div>
</div>

</div>

---

## Installation {#installation}

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

Node.js 18+. Works with any MCP SDK-compatible transport (Stdio, HTTP/SSE, WebSocket).

### Built on Standards You Trust {#standards}

<!-- Standards grid -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px;text-align:center">
<div style="font-size:14px;color:rgba(129,140,248,0.8);font-weight:700;font-family:Inter,sans-serif">MCP</div>
<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;font-family:Inter,sans-serif">Anthropic standard</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px;text-align:center">
<div style="font-size:14px;color:rgba(34,211,238,0.8);font-weight:700;font-family:Inter,sans-serif">Zod</div>
<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;font-family:Inter,sans-serif">Validation</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px;text-align:center">
<div style="font-size:14px;color:rgba(52,211,153,0.8);font-weight:700;font-family:Inter,sans-serif">TypeScript</div>
<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;font-family:Inter,sans-serif">Full type inference</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px;text-align:center">
<div style="font-size:14px;color:rgba(245,158,11,0.8);font-weight:700;font-family:Inter,sans-serif">WinterCG</div>
<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px;font-family:Inter,sans-serif">Edge-native</div>
</div>

</div>

<div style="font-size:12px;color:rgba(255,255,255,0.35);text-align:center;margin-bottom:32px;font-family:Inter,sans-serif">Zero new syntax to learn. Write once, deploy to any cloud. Your AI already speaks Zod and TypeScript — SKILL.md teaches it the architecture.</div>

### Native Framework Integration {#frontend-integrations}

Vurb.ts is a natural backend for **Vercel AI SDK**, **LangChain**, and **LlamaIndex**. Connect via standard `stdio` or HTTP transports — your agents get typed tool names, validated inputs, and truncated payloads out of the box.

---

<!-- Why it matters -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">COMPLIANCE & ZERO RISK</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Security by design.<br><span style="color:rgba(255,255,255,0.25)">Not by afterthought.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The biggest CTO/CISO panic in 2026: LLMs leaking <code style="font-size:12px;color:rgba(239,68,68,0.6)">password_hash</code>, SSNs, and medical data. Vurb guarantees the LLM sees <code style="font-size:12px;color:rgba(52,211,153,0.6)">[REDACTED]</code>.</div>
</div>

<!-- Security-first feature grid -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(239,68,68,0.8);padding:3px 10px;border:1px solid rgba(239,68,68,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">EGRESS</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Egress Firewall</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Zod schema strips undeclared fields at RAM level. <code style="font-size:10px">password_hash</code> never reaches the wire. New columns are invisible unless declared.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(192,132,252,0.8);padding:3px 10px;border:1px solid rgba(192,132,252,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">DLP</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">PII Redaction</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">V8-optimized via <code style="font-size:10px">fast-redact</code>. GDPR, LGPD, HIPAA — impossible to bypass. The developer cannot accidentally skip it.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(245,158,11,0.8);padding:3px 10px;border:1px solid rgba(245,158,11,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">FSM</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">State Gate</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Removes tools from <code style="font-size:10px">tools/list</code> based on workflow state. Empty cart → <code style="font-size:10px">cart.pay</code> doesn't exist. Anti-hallucination.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(34,211,238,0.8);padding:3px 10px;border:1px solid rgba(34,211,238,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">SANDBOX</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Zero-Trust V8 Isolate</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">LLM sends JavaScript to your data. Sealed isolate — zero access to <code style="font-size:10px">process</code>, <code style="font-size:10px">fs</code>, <code style="font-size:10px">net</code>.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(52,211,153,0.8);padding:3px 10px;border:1px solid rgba(52,211,153,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">SKILLS</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Agent Skills</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Progressive three-layer disclosure — domain expertise on demand. Zero context window waste.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(129,140,248,0.8);padding:3px 10px;border:1px solid rgba(129,140,248,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">DEPLOY</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">One Command Deploy</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif"><code style="font-size:10px">vurb deploy</code> → <a href="https://docs.vinkius.com/getting-started" style="color:rgba(129,140,248,0.6);text-decoration:none">Vinkius Cloud</a> with tamper-proof audit logs. Or self-host on <a href="/vercel-adapter" style="color:rgba(129,140,248,0.6);text-decoration:none">Vercel</a> / <a href="/cloudflare-adapter" style="color:rgba(129,140,248,0.6);text-decoration:none">Cloudflare</a>.</div>
</div>

</div>

> [!TIP]
> Vurb blocks PII locally by default. Need to prove it in a compliance audit (SOC2/GDPR/HIPAA)? [Connect to Vinkius Cloud for tamper-proof Audit Logs →](https://docs.vinkius.com/getting-started)

### Ecosystem Packages

| Package | Purpose |
|---|---|
| [@vurb/vercel](/vercel-adapter) | Deploy to Vercel — App Router, Edge or Node.js |
| [@vurb/cloudflare](/cloudflare-adapter) | Deploy to Cloudflare Workers — D1, KV, R2 |
| [@vurb/oauth](/oauth) | OAuth Device Flow (RFC 8628) |
| [@vurb/prisma-gen](/prisma-gen) | Auto-generate tools from Prisma schema |
| [@vurb/openapi-gen](/openapi-gen) | Generate tools from OpenAPI/Swagger specs |
| [@vurb/skills](/skills) | Progressive instruction distribution |
| [@vurb/testing](/testing) | Test harness — blast radius, snapshots |
| [@vurb/inspector](/inspector) | Real-time TUI dashboard |

---

## Explore Further {#explore}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/quickstart-lightspeed" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">START</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Quickstart</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Zero to Vinkius Cloud in under 40 seconds.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/enterprise-quickstart" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">ENTERPRISE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Enterprise Quickstart</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">DLP, SSO, audit trails — production setup.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/comparison" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">COMPARISON</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Vurb vs Raw MCP</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Side-by-side — see the difference in 3 seconds.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 0 32px">

<a href="/architecture" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">INTERNALS</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Architecture</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Registry, pipeline, compilation details.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/migration" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">UPGRADE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Migration Guide</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Upgrading from a previous version.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva-convention" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">CONVENTION</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">MVA Convention</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">File and folder conventions.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>
