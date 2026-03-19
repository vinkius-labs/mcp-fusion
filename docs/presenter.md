# Presenter

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add a Presenter to my invoice tool — schema allowlist, PII redaction on customer SSN, business rules for overdue status, and affordances for payment actions."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add a Presenter to my invoice tool — schema allowlist, PII redaction on customer SSN, business rules for overdue status, and affordances for payment actions.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+a+Presenter+to+my+invoice+tool+%E2%80%94+schema+allowlist%2C+PII+redaction+on+customer+SSN%2C+business+rules+for+overdue+status%2C+and+affordances+for+payment+actions." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+a+Presenter+to+my+invoice+tool+%E2%80%94+schema+allowlist%2C+PII+redaction+on+customer+SSN%2C+business+rules+for+overdue+status%2C+and+affordances+for+payment+actions." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break: What is the Presenter -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">THE VIEW LAYER</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Shape what the agent sees.<br><span style="color:rgba(255,255,255,0.25)">Nothing more.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Your handler returns raw data. The Presenter validates, strips, enriches, truncates, and governs the response — all in one place.</div>
</div>

The **V** in [MVA (Model-View-Agent)](/mva-pattern). Define `InvoicePresenter` once — every tool and prompt that touches invoices uses the same schema, rules, and affordances. Internal fields never leak. Token usage stays under control.

## Defining a Presenter {#minimal}

<!-- Code screen: Minimal Presenter -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">views/UserPresenter.ts</span>
</div>
<div style="padding:20px">

```typescript
import { createPresenter, t } from '@vurb/core';

export const UserPresenter = createPresenter('User')
  .schema({
    id:    t.string,
    name:  t.string,
    email: t.zod.string().email(),
    role:  t.enum('admin', 'member', 'guest'),
  });
```

</div>
</div>

That's it. Any field not in the schema is stripped from the response. The agent never sees `passwordHash`, `tenantId`, or anything else you didn't declare.

::: tip Declarative alternative
`definePresenter({ name: 'User', schema: UserModel })` — same result, config-object style.
:::

## Schema — The `t` Namespace {#schema}

The `t` namespace provides Zod-backed type helpers. Every `t.*` IS a real ZodType — `.describe()`, `.optional()`, `.nullable()` all work.

| Helper | Zod Equivalent | Example |
|---|---|---|
| `t.string` | `z.string()` | `t.string.describe('User ID')` |
| `t.number` | `z.number()` | `t.number` |
| `t.boolean` | `z.boolean()` | `t.boolean` |
| `t.date` | `z.date()` | `t.date` |
| `t.enum(...)` | `z.enum([...])` | `t.enum('active', 'archived')` |
| `t.array(T)` | `z.array(T)` | `t.array(t.string)` |
| `t.object({})` | `z.object({})` | `t.object({ lat: t.number })` |
| `t.record(T)` | `z.record(T)` | `t.record(t.string)` |
| `t.optional(T)` | `T.optional()` | `t.optional(t.string)` |
| `t.nullable(T)` | `T.nullable()` | `t.nullable(t.string)` |
| `t.zod` | `z` | `t.zod.string().email()` |

::: tip Escape Hatch
Need regex, transforms, or unions? Use `t.zod` for direct Zod access — full power, zero limits.
:::

---

<!-- Editorial break: What can the Presenter do -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">CAPABILITIES</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Schema. Rules. Charts.<br><span style="color:rgba(255,255,255,0.25)">All from one builder.</span></div>
</div>

<!-- Feature Grid -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(129,140,248,0.8);padding:3px 10px;border:1px solid rgba(129,140,248,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">RULES</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">System Rules</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Static or dynamic directives that travel with the data. Context-aware: adapt to user role, tenant, locale.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(34,211,238,0.8);padding:3px 10px;border:1px solid rgba(34,211,238,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">UI</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">UI Blocks</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Server-rendered charts, tables, markdown, diagrams. Displayed by MCP clients that support rich content.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(52,211,153,0.8);padding:3px 10px;border:1px solid rgba(52,211,153,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">LIMIT</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Agent Limit</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Truncates arrays before validation. Auto-injects guidance: "50 shown, N hidden. Use filters."</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(245,158,11,0.8);padding:3px 10px;border:1px solid rgba(245,158,11,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">HATEOAS</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Suggested Actions</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Data-driven hints: "Invoice overdue → suggest billing.escalate." The agent gets valid next actions, not a tools/list scan.</div>
</div>

</div>

## System Rules {#rules}

<!-- Code screen: Rules -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">views/InvoicePresenter.ts — dynamic rules</span>
</div>
<div style="padding:20px">

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id: t.string,
    amount_cents: t.number.describe('Value in CENTS. Divide by 100 for display.'),
    status: t.enum('paid', 'pending', 'overdue'),
  })
  .rules((invoice, ctx) => [
    'Use currency format: $XX,XXX.00',
    ctx?.user?.role !== 'admin'
      ? 'RESTRICTED: Do not reveal exact totals to non-admin users.'
      : null,
  ]);
```

</div>
</div>

Zod `.describe()` annotations auto-generate rules. `null` values are filtered. Static and dynamic rules merge.

## UI Blocks {#ui-blocks}

<!-- Code screen: UI Blocks -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">views/InvoicePresenter.ts — charts & tables</span>
</div>
<div style="padding:20px">

```typescript
import { createPresenter, t, ui } from '@vurb/core';

const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, amount_cents: t.number })
  .ui((invoice) => [
    ui.echarts({
      series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
    }),
  ]);
```

</div>
</div>

| Helper | What it renders |
|---|---|
| `ui.echarts({...})` | Interactive charts |
| `ui.mermaid('graph TD; A-->B')` | Diagrams |
| `ui.markdown('**Bold** text')` | Rich text |
| `ui.table(['ID', 'Amount'], rows)` | Markdown tables |
| `ui.summary('3 invoices found.')` | Collection summaries |
| `ui.json({ key: 'value' })` | Formatted JSON |

For arrays, use `.collectionUiBlocks()` to get aggregate visualizations instead of N individual charts.

## Agent Limit {#agent-limit}

<!-- Code screen: Agent Limit -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">cognitive guardrail</span>
</div>
<div style="padding:20px">

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, status: t.enum('paid', 'pending', 'overdue') })
  .limit(50);
// → "⚠️ Dataset truncated. 50 shown, {N} hidden. Use filters."
```

</div>
</div>

Slices arrays **before** validation. The agent receives kept items plus a UI block telling it how to narrow results.

## Suggested Actions {#affordances}

<!-- Code screen: HATEOAS -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">HATEOAS affordances</span>
</div>
<div style="padding:20px">

```typescript
import { createPresenter, t, suggest } from '@vurb/core';

const InvoicePresenter = createPresenter('Invoice')
  .schema({ id: t.string, status: t.enum('pending', 'overdue', 'paid') })
  .suggest((invoice) => [
    suggest('billing.pay', 'Process immediate payment'),
    invoice.status === 'overdue'
      ? suggest('billing.escalate', 'Escalate to collections')
      : null,
  ].filter(Boolean));
```

</div>
</div>

The agent receives valid next actions with reasons — no need to scan the full `tools/list`.

## Embeds — Nested Presenters {#embeds}

<!-- Code screen: Embeds -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">multi-level composition</span>
</div>
<div style="padding:20px">

```typescript
const ClientPresenter = createPresenter('Client')
  .schema(ClientModel)
  .rules(['Display company name prominently.']);

export const InvoicePresenter = createPresenter('Invoice')
  .schema(InvoiceModel)
  .embed('client', ClientPresenter)
  .embed('line_items', LineItemPresenter);
```

</div>
</div>

Rules, UI blocks, and affordances from children merge into the parent. Embeds nest to any depth.

## Tool Integration {#tool-integration}

<!-- Code screen: Tool Integration -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">agents/billing.tool.ts</span>
</div>
<div style="padding:20px">

```typescript
const getInvoice = f.query('billing.get_invoice')
  .describe('Retrieve an invoice by ID')
  .withString('id', 'Invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return ctx.db.invoices.findUnique({
      where: { id: input.id },
      include: { client: true },
    });
  });
```

</div>
</div>

The handler's only job is to query data. The framework calls `presenter.make(data, ctx).build()` automatically.

---

<!-- Editorial break: The Pipeline -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">EXECUTION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">The Presenter Pipeline.<br><span style="color:rgba(255,255,255,0.25)">Seven stages, all automatic.</span></div>
</div>

## Execution Pipeline {#pipeline}

Every stage is optional. A Presenter with only `name` and `schema` is a pure egress whitelist.

<!-- Numbered steps -->
<div style="margin:32px 0">

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(129,140,248,0.3);background:rgba(129,140,248,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(129,140,248,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">01</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Array Detection</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Determines if the handler returned a single item or a collection — routes to the correct processing path.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(34,211,238,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">02</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Agent Limit</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Slices arrays <strong style="color:rgba(255,255,255,0.55)">before</strong> validation. Injects truncation guidance so the agent knows what was hidden.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">03</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Zod Validation</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Strict <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">.parse()</code> — undeclared fields are stripped, types are validated. Internal data never leaks.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(245,158,11,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">04</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Embed Resolution</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Runs child Presenters on nested keys. Rules, UI blocks, and affordances from children merge into the parent response.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(192,132,252,0.3);background:rgba(192,132,252,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(192,132,252,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">05</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">System Rules</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Auto-rules from <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">.describe()</code> + static rules + dynamic context-aware rules — all merged, nulls filtered.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(34,197,94,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">06</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">UI Blocks</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Per-item <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">.ui()</code> or aggregate <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">.collectionUiBlocks()</code> — charts, tables, summaries.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;padding:20px 24px;border-left:2px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(239,68,68,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">07</span>
<div>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Suggested Actions</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">HATEOAS affordances per item — the agent receives what to do <strong style="color:rgba(255,255,255,0.55)">next</strong>, not the full tools/list.</div>
</div>
</div>

</div>

---

## Builder API {#builder-api}

Both shorthand aliases and full method names work:

| Shorthand | Full control | Purpose |
|---|---|---|
| `.schema({ id: t.string })` | `.schema(InvoiceModel)` | Validation schema |
| `.rules([...])` | `.systemRules([...])` | JIT system rules |
| `.ui((item) => [...])` | `.uiBlocks((item) => [...])` | Per-item UI blocks |
| `.limit(50)` | `.agentLimit(50, onTruncate)` | Cognitive guardrail |
| `.suggest((item) => [...])` | `.suggestActions((item) => {...})` | HATEOAS suggestions |

<!-- Code screen: Complete example -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">complete example</span>
</div>
<div style="padding:20px">

```typescript
import { createPresenter, t, suggest, ui } from '@vurb/core';

export const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('CENTS — divide by 100'),
    status:       t.enum('draft', 'paid', 'overdue'),
  })
  .rules(['CRITICAL: amount_cents is in CENTS. Divide by 100.'])
  .ui((inv) => [
    ui.table(['Field', 'Value'], [
      ['Amount', `$${(inv.amount_cents / 100).toFixed(2)}`],
      ['Status', inv.status],
    ]),
  ])
  .suggest((inv) => [
    suggest('invoices.get', 'View details'),
    inv.status === 'overdue'
      ? suggest('billing.remind', 'Send reminder')
      : null,
  ].filter(Boolean))
  .limit(50);
```

</div>
</div>

After the first `.make()` call, the Presenter is sealed — configuration methods throw if called.

## Prompt Integration {#prompt-integration}

`PromptMessage.fromView()` decomposes a Presenter's output into prompt messages — same schema, same rules, in both tools and prompts:

<!-- Code screen: Prompt Integration -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">prompts/audit.ts</span>
</div>
<div style="padding:20px">

```typescript
import { definePrompt, PromptMessage } from '@vurb/core';

const AuditPrompt = definePrompt<AppContext>('audit', {
  args: { invoiceId: 'string' } as const,
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.db.getInvoice(invoiceId);
    return {
      messages: [
        PromptMessage.system('You are a Senior Financial Auditor.'),
        ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
        PromptMessage.user('Begin the audit for this invoice.'),
      ],
    };
  },
});
```

</div>
</div>

## Error Handling {#errors}

When validation fails, a `PresenterValidationError` is thrown with per-field details:

```typescript
import { PresenterValidationError } from '@vurb/core';

try {
  InvoicePresenter.make(badData);
} catch (err) {
  if (err instanceof PresenterValidationError) {
    console.error(err.presenterName); // 'Invoice'
    console.error(err.cause);         // Original ZodError
  }
}
```

---

## Deep Dives {#deep-dives}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/mva/presenter-anatomy" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">LIFECYCLE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Anatomy & Lifecycle</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Parse → validate → enrich → seal. Internal pipeline in detail.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva/perception-package" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">OUTPUT</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Perception Package</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">What the agent actually receives — data + rules + UI + affordances.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva/affordances" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">HATEOAS</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Affordances</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">How data-driven hints guide the agent's next actions.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 0 32px">

<a href="/mva/context-tree-shaking" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">RULES</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Context Tree-Shaking</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Rules attach only to the data that needs them — zero wasted tokens.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva/cognitive-guardrails" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">LIMITS</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Cognitive Guardrails</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Truncation, limits, and token protection strategies.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/mva/select-reflection" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">DYNAMIC</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Select Reflection</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Dynamic field selection from query context.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

### Cookbook Recipes

- [Presenter Composition](/cookbook/presenter-composition) · [Custom Responses](/cookbook/custom-responses) · [Context-Aware Rules](/cookbook/context-aware-rules)
- [Context Tree-Shaking](/cookbook/context-tree-shaking) · [Select Reflection](/cookbook/select-reflection) · [Cognitive Guardrails](/cookbook/cognitive-guardrails)