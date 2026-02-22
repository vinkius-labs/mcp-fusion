---
layout: home

hero:
  name: "Stop Writing MCP Servers Like It's 2024."
  text: ""
  tagline: "Every MCP server today dumps raw JSON and prays the AI figures it out. mcp-fusion changes everything — the MVA (Model-View-Agent) framework makes your AI agents perceive, understand, and act on data like a trained engineer, not a guessing machine."
  actions:
    - theme: brand
      text: The MVA Manifesto →
      link: /mva-pattern
    - theme: alt
      text: 5-Minute Quickstart
      link: /quickstart
    - theme: alt
      text: Cookbook & Examples
      link: /examples

  textAfterActions: "Open Source. Built by Vinkius Labs."
---

<!-- Vinkius Bento Custom Diagramming -->
<div class="vinkius-bento-grid">
<div class="bento-hero">
<h2 class="bento-title">Every MCP Server Today:<br><span class="text-dim">Raw JSON → switch/case → hope the AI doesn't hallucinate.</span></h2>
<p class="bento-desc">That's not engineering. That's a prayer. mcp-fusion introduces MVA (Model-View-Agent) — a completely new way to build MCP servers where every response is a structured perception package: validated data, domain rules, server-rendered charts, and explicit next-action hints. The AI doesn't guess. It knows.</p>
<div class="bento-tags">
<span class="bento-tag">NO MORE SWITCH/CASE</span>
<span class="bento-tag">NO MORE RAW JSON</span>
<span class="bento-tag active">A NEW PARADIGM</span>
<span class="bento-tag">ZERO HALLUCINATION</span>
</div>

<div class="bento-code-section">
<div class="bento-code-header">
<div class="bento-dots"><span></span><span></span><span></span></div>
<p class="bento-code-title">Your handler returns raw data. The framework does the rest.</p>
</div>
<div class="bento-code-box">

```typescript
import { createPresenter, ui, defineTool, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// 1. Define the Presenter — the MVA View Layer
export const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .systemRules(['CRITICAL: amount_cents is in CENTS. Divide by 100.'])
    .uiBlocks((inv) => [
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ])
    .suggestActions((inv) =>
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : []
    );

// 2. Attach to any tool — handler returns raw data
const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter,
            params: { id: 'string' },
            handler: async (ctx, args) => await ctx.db.invoices.findUnique(args.id),
        },
    },
});
```

</div>
<div class="bento-cli-box">
<span class="cli-prompt">~</span>
<span class="cli-text">npm install <span>@vinkius-core/mcp-fusion</span> zod</span>
</div>
</div>

<div class="bento-footer">
<span>PATTERN</span>
<span>MVA</span>
</div>
</div>

<div class="mva-callout">
<div class="mva-callout-eyebrow">🧠 THE ARCHITECTURAL REVOLUTION</div>
<h2 class="mva-callout-title">Model-View-Agent (MVA)</h2>
<p class="mva-callout-subtitle">MVC was designed for humans. Agents are not humans.<br/>MVA replaces the View with the <strong>Presenter</strong> — an agent-centric perception layer<br/>that tells the AI exactly how to interpret, display, and act on domain data.</p>
<div class="mva-callout-diagram">
<div class="mva-step">
<div class="mva-step-icon">🔷</div>
<div class="mva-step-label">Model</div>
<div class="mva-step-detail">Zod Schema<br/><em>validates</em></div>
</div>
<div class="mva-arrow">→</div>
<div class="mva-step active">
<div class="mva-step-icon">⚡</div>
<div class="mva-step-label">View (Presenter)</div>
<div class="mva-step-detail">Rules · Charts · Hints<br/><em>perceives</em></div>
</div>
<div class="mva-arrow">→</div>
<div class="mva-step">
<div class="mva-step-icon">🤖</div>
<div class="mva-step-label">Agent</div>
<div class="mva-step-detail">LLM<br/><em>acts</em></div>
</div>
</div>
<p class="mva-callout-tagline">Every response is a <strong>structured perception package</strong> — not raw JSON.<br/>The AI doesn't guess. It <em>knows</em>.</p>
<a href="/mva-pattern" class="mva-callout-cta">READ THE FULL MVA GUIDE →</a>
</div>

<div class="bento-features">
<div class="bento-cell">
<div class="cell-eyebrow">// MVA</div>
<h3 class="cell-title">Presenter Engine <span class="cell-badge">View</span></h3>
<p class="cell-desc">Domain-level Presenters validate data, inject rules, render charts, and suggest actions. Define once, reuse everywhere.</p>
<a href="/presenter" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// ROUTING</div>
<h3 class="cell-title">Action Consolidation <span class="cell-badge">Scale</span></h3>
<p class="cell-desc">Nest 5,000+ operations into grouped namespaces. The LLM sees ONE tool, not fifty. Token usage drops by 10x.</p>
<a href="/routing" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// SECURITY</div>
<h3 class="cell-title">Context Derivation <span class="cell-badge">tRPC-style</span></h3>
<p class="cell-desc">defineMiddleware() derives and injects typed data into context. Zod .strip() ensures handlers never receive hallucinated params.</p>
<a href="/middleware" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// RESILIENCE</div>
<h3 class="cell-title">Self-Healing Errors <span class="cell-badge">Agent</span></h3>
<p class="cell-desc">toolError() provides structured recovery hints with suggested actions. Agents self-correct without human intervention.</p>
<a href="/building-tools" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// AFFORDANCE</div>
<h3 class="cell-title">Agentic HATEOAS <span class="cell-badge">Hint</span></h3>
<p class="cell-desc">.suggestActions() tells agents what to do next based on data state. Eliminates action hallucination through explicit affordances.</p>
<a href="/mva-pattern" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// GUARDRAILS</div>
<h3 class="cell-title">Cognitive Limits <span class="cell-badge">Safety</span></h3>
<p class="cell-desc">.agentLimit() truncates large datasets and teaches agents to use filters. Prevents context DDoS and manages API costs.</p>
<a href="/presenter" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// STATE</div>
<h3 class="cell-title">Temporal Awareness <span class="cell-badge">Sync</span></h3>
<p class="cell-desc">RFC 7234-inspired cache-control signals prevent LLM Temporal Blindness. Cross-domain causal invalidation after mutations.</p>
<a href="/state-sync" class="cell-link">EXPLORE &rarr;</a>
</div>
<div class="bento-cell">
<div class="cell-eyebrow">// CLIENT</div>
<h3 class="cell-title">Type-Safe Client <span class="cell-badge">tRPC</span></h3>
<p class="cell-desc">createFusionClient() provides end-to-end type safety from server to client. Wrong action name? TypeScript catches it at build time.</p>
<a href="/fusion-client" class="cell-link">EXPLORE &rarr;</a>
</div>
</div>
</div>
