---
layout: home

hero:
  name: "Stop Writing MCP Servers Like It's 2024."
  text: ""
  tagline: "Most MCP servers today dump raw database JSON and pray the LLM figures it out. mcp-fusion introduces the MVA (Model-View-Agent) architecture — giving your tools a deterministic View layer so AI agents perceive, understand, and act on your data like trained engineers, not guessing machines."
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

<!-- ═══ Section 1: The Problem ═══ -->
<div class="ms-section">
<div class="ms-left">
<div class="ms-label">DOMAIN: MCP SERVERS</div>
<h2 class="ms-headline">Raw JSON.<br>Switch/case.<br><span class="ms-dim">Hope the AI doesn't hallucinate.</span></h2>
<p class="ms-sub">That's how every MCP server works today.</p>
</div>
<div class="ms-right">
<p class="ms-body">mcp-fusion introduces MVA (Model-View-Agent) — a completely new way to build MCP servers where every response is a structured perception package: validated data, domain rules, server-rendered charts, and explicit next-action hints. The AI doesn't guess. It knows.</p>
<div class="ms-metrics">
<div class="ms-metric">
<div class="ms-metric-label">CAPABILITIES</div>
<div class="ms-metric-value">20+</div>
</div>
<div class="ms-metric">
<div class="ms-metric-label">ARCHITECTURE</div>
<div class="ms-metric-value">MVA</div>
</div>
<div class="ms-metric">
<div class="ms-metric-label">HALLUCINATION</div>
<div class="ms-metric-value">Zero</div>
</div>
</div>
</div>
</div>

<!-- ═══ Section 2: Code ═══ -->
<div class="ms-code-section">
<div class="ms-code-header">
<div class="ms-dots"><span></span><span></span><span></span></div>
<p class="ms-code-title">Your handler returns raw data. The framework does the rest.</p>
</div>
<div class="ms-code-box">

```typescript
import { createPresenter, ui, defineTool } from '@vinkius-core/mcp-fusion';
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
<div class="ms-cli">
<span class="ms-cli-prompt">~</span>
<span class="ms-cli-text">npm install <span>@vinkius-core/mcp-fusion</span> zod</span>
</div>
</div>

<!-- ═══ Section 2.5: Comparison Table ═══ -->
<div class="ms-compare">
<div class="ms-compare-header">
<div class="ms-label">WHAT CHANGES</div>
<h2 class="ms-headline">Without MVA vs With MVA</h2>
<p class="ms-sub">Every line is a capability that exists in mcp-fusion today. Not a roadmap. Not a promise.</p>
</div>
<div class="ms-compare-table">
<div class="ms-compare-row ms-compare-head">
<div class="ms-compare-aspect"></div>
<div class="ms-compare-before">Without MVA</div>
<div class="ms-compare-after">With MVA (mcp-fusion)</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Tool count</div>
<div class="ms-compare-before">50 individual tools. LLM sees ALL. Token explosion.</div>
<div class="ms-compare-after"><strong>Action consolidation</strong> — 5,000+ ops behind ONE tool via discriminator. 10x fewer tokens.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Response</div>
<div class="ms-compare-before">JSON.stringify() — the AI parses and guesses.</div>
<div class="ms-compare-after"><strong>Structured perception package</strong> — validated data + rules + UI + affordances.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Domain context</div>
<div class="ms-compare-before">None. 45000 — dollars? cents? yen?</div>
<div class="ms-compare-after"><strong>System rules</strong> travel with the data. The AI knows it's cents.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Next actions</div>
<div class="ms-compare-before">AI hallucinates tool names.</div>
<div class="ms-compare-after"><strong>Agentic HATEOAS</strong> — .suggestActions() with explicit hints based on data state.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Large datasets</div>
<div class="ms-compare-before">10,000 rows dump into context window.</div>
<div class="ms-compare-after"><strong>Cognitive guardrails</strong> — .agentLimit(50) truncation + filter guidance.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Security</div>
<div class="ms-compare-before">Internal fields leak to LLM.</div>
<div class="ms-compare-after"><strong>Schema as boundary</strong> — Zod .strip() removes undeclared fields. Automatic.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Charts</div>
<div class="ms-compare-before">Not possible — text only.</div>
<div class="ms-compare-after"><strong>UI Blocks</strong> — ECharts, Mermaid diagrams, summaries — server-rendered.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Routing</div>
<div class="ms-compare-before">switch/case with 50 branches.</div>
<div class="ms-compare-after"><strong>Hierarchical groups</strong> — platform.users.list — infinite nesting.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Error recovery</div>
<div class="ms-compare-before">throw Error — AI gives up.</div>
<div class="ms-compare-after"><strong>Self-healing</strong> — toolError() with recovery hints + retry args.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Token cost</div>
<div class="ms-compare-before">Full JSON payloads every time.</div>
<div class="ms-compare-after"><strong>TOON encoding</strong> — toonSuccess() reduces tokens by ~40%.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Type safety</div>
<div class="ms-compare-before">Manual casting, no client types.</div>
<div class="ms-compare-after"><strong>tRPC-style client</strong> — createFusionClient() with full end-to-end inference.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Reusability</div>
<div class="ms-compare-before">Same entity rendered differently everywhere.</div>
<div class="ms-compare-after"><strong>Presenter</strong> — define once, reuse across all tools. Same rules, same UI.</div>
</div>
</div>
<a href="/mcp-fusion/comparison" class="ms-compare-link">SEE THE FULL COMPARISON WITH CODE EXAMPLES →</a>
</div>

<!-- ═══ Section 3: MVA Conviction ═══ -->
<div class="ms-section ms-conviction">
<div class="ms-left">
<div class="ms-label">THE PARADIGM SHIFT</div>
<h2 class="ms-headline">MVC was designed<br>for humans.<br><span class="ms-accent">Agents are not<br>humans.</span></h2>
</div>
<div class="ms-right">
<p class="ms-body">MVA replaces the human-centric View with the Presenter — an agent-centric perception layer that tells the AI exactly how to interpret, display, and act on domain data. This is not an iteration on MVC. It is a replacement.</p>
<div class="ms-columns">
<div class="ms-column">
<div class="ms-column-label">// MODEL</div>
<p class="ms-column-text">Zod schema validates input. Unknown fields stripped. The LLM cannot inject parameters your schema does not declare.</p>
</div>
<div class="ms-column">
<div class="ms-column-label">// PRESENTER</div>
<p class="ms-column-text"><em>The perception layer is alive — not a marketing artifact.</em></p>
</div>
</div>
</div>
</div>

<!-- ═══ Section 4: Technical Authority ═══ -->
<div class="ms-authority">
<div class="ms-authority-left">
<div class="ms-label">TECHNICAL AUTHORITY</div>
<h2 class="ms-headline">What we<br>built.</h2>
<p class="ms-sub">Every capability designed for autonomous AI agents operating over the Model Context Protocol.</p>
</div>
<div class="ms-grid">
<div class="ms-card">
<div class="ms-card-number">01 // MVA</div>
<h3 class="ms-card-title">Presenter Engine</h3>
<p class="ms-card-desc">Domain-level Presenters validate data, inject rules, render charts, and suggest actions. Define once, reuse everywhere.</p>
<a href="/presenter" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">02 // ROUTING</div>
<h3 class="ms-card-title">Action Consolidation</h3>
<p class="ms-card-desc">Nest 5,000+ operations into grouped namespaces. The LLM sees ONE tool, not fifty. Token usage drops by 10x.</p>
<a href="/routing" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">03 // SECURITY</div>
<h3 class="ms-card-title">Context Derivation</h3>
<p class="ms-card-desc">defineMiddleware() derives and injects typed data into context. Zod .strip() ensures handlers never receive hallucinated params.</p>
<a href="/middleware" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">04 // RESILIENCE</div>
<h3 class="ms-card-title">Self-Healing Errors</h3>
<p class="ms-card-desc">toolError() provides structured recovery hints with suggested actions. Agents self-correct without human intervention.</p>
<a href="/building-tools" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">05 // AFFORDANCE</div>
<h3 class="ms-card-title">Agentic HATEOAS</h3>
<p class="ms-card-desc">.suggestActions() tells agents what to do next based on data state. Eliminates action hallucination through explicit affordances.</p>
<a href="/mva-pattern" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">06 // GUARDRAILS</div>
<h3 class="ms-card-title">Cognitive Limits</h3>
<p class="ms-card-desc">.agentLimit() truncates large datasets and teaches agents to use filters. Prevents context DDoS and manages API costs.</p>
<a href="/presenter" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">07 // STATE</div>
<h3 class="ms-card-title">Temporal Awareness</h3>
<p class="ms-card-desc">RFC 7234-inspired cache-control signals prevent LLM Temporal Blindness. Cross-domain causal invalidation after mutations.</p>
<a href="/state-sync" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">08 // CLIENT</div>
<h3 class="ms-card-title">Type-Safe Client</h3>
<p class="ms-card-desc">createFusionClient() provides end-to-end type safety from server to client. Wrong action name? TypeScript catches it at build time.</p>
<a href="/fusion-client" class="ms-card-link">EXPLORE →</a>
</div>
</div>
</div>

<!-- ═══ Section 5: CTA ═══ -->
<div class="ms-cta">
<div class="ms-label">READ THE MANIFESTO</div>
<h2 class="ms-cta-headline">The AI doesn't guess.<br>It knows.</h2>
<p class="ms-cta-sub">MVA is a new architectural pattern. The Presenter replaces the View with a <strong>deterministic perception layer</strong> — domain rules, rendered charts, action affordances, and cognitive guardrails. Every response is structured. Every action is explicit.</p>
<a href="/mva-pattern" class="ms-cta-button">READ THE FULL MVA GUIDE →</a>
</div>
