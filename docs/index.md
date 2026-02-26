---
layout: home

hero:
  name: "Stop Writing MCP Servers Like It's 2024."
  text: ""
  tagline: "Most MCP servers today dump raw database JSON and pray the LLM figures it out. **MCP Fusion** introduces the MVA (Model-View-Agent) architecture — giving your tools a deterministic View layer with a Structured Perception Layer on your data like trained engineers, not guessing machines."
  actions:
    - theme: brand
      text: The MVA Pattern →
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
<p class="ms-body">**MCP Fusion** introduces MVA (Model-View-Agent) — a completely new way to build MCP servers where every response is a structured perception package: validated data, domain rules, server-rendered charts, and explicit next-action hints. The AI doesn't guess. It knows.</p>
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
<div class="ms-metric-label">CONTEXT CONTROL</div>
<div class="ms-metric-value">Deterministic</div>
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
import { initFusion, definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// 1. Initialize Fusion — define context type ONCE
const f = initFusion<AppContext>();

// 2. Define the Presenter — the MVA View Layer
export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: z.object({
        id: z.string(),
        amount_cents: z.number().describe('CRITICAL: Value is in CENTS. Divide by 100.'),
        status: z.enum(['paid', 'pending', 'overdue']),
    }),
    autoRules: true, // ← auto-extracts .describe() as system rules
    uiBlocks: (inv) => [
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ],
    suggestActions: (inv) =>
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : [],
});

// 3. Attach to any tool — handler returns raw data
const getInvoice = f.tool({
    name: 'billing.get_invoice',
    description: 'Gets an invoice by ID',
    input: { id: 'string' },              // ← No Zod needed for input!
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => await ctx.db.invoices.findUnique(input.id),
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
<p class="ms-sub">Every line is a capability that exists in **MCP Fusion** today. Not a roadmap. Not a promise.</p>
</div>
<div class="ms-compare-table">
<div class="ms-compare-row ms-compare-head">
<div class="ms-compare-aspect"></div>
<div class="ms-compare-before">Without MVA</div>
<div class="ms-compare-after">With MVA (**MCP Fusion**)</div>
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
<div class="ms-compare-after"><strong>Schema as boundary</strong> — Zod .strict() rejects undeclared fields with actionable errors. Automatic.</div>
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

<!-- ═══ Section 2.7: Three Core Problems ═══ -->
<div class="ms-problems">
<div class="ms-problems-header">
<div class="ms-label">PROBLEM SPACE</div>
<h2 class="ms-headline">Three problems.<br>Framework-level solutions.</h2>
<p class="ms-sub">Every claim below maps to real code in the repository. Not a roadmap. Not a promise.</p>
</div>

<div class="ms-problem-grid">

<div class="ms-problem-card">
<div class="ms-problem-number">01</div>
<h3 class="ms-problem-title">Egress Firewall</h3>
<p class="ms-problem-pain"><strong>The problem:</strong> The developer does <code>SELECT *</code> and calls <code>JSON.stringify()</code>. Passwords, API keys, tenant IDs — all leaked to the LLM provider over the network. A compliance nightmare waiting to happen.</p>
<p class="ms-problem-solution"><strong>The mechanism:</strong> The Zod <code>.schema()</code> on every Presenter physically strips undeclared fields in server RAM via <code>Zod.parse()</code>. Sensitive data is destroyed before serialization — not by developer discipline, but by the framework itself. Combined with <code>.strict()</code> on inputs, this creates a bidirectional data boundary on every tool.</p>

```typescript
const UserPresenter = definePresenter({
    name: 'User',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        // password_hash, tenant_id, internal_flags
        // → physically absent from output. Not filtered. GONE.
    }),
});
```

<a href="/mcp-fusion/presenter" class="ms-card-link">SEE HOW IT WORKS →</a>
</div>

<div class="ms-problem-card">
<div class="ms-problem-number">02</div>
<h3 class="ms-problem-title">Context Tree-Shaking</h3>
<p class="ms-problem-pain"><strong>The problem:</strong> To teach the AI about invoices, tasks, sprints, and users, the company writes a 10,000-token system prompt — sent on every call. The LLM loses coherence in the middle of the text, misapplies rules across domains, and the company pays for irrelevant tokens on every request.</p>
<p class="ms-problem-solution"><strong>The mechanism:</strong> Just like webpack tree-shaking removes unused code from a bundle, <code>.systemRules()</code> removes unused rules from the agent's context window. Domain rules travel <strong>with the data</strong> — the invoice rule only exists in the prompt at the exact millisecond the agent processes an invoice. Token overhead drops from ~2,000/call to ~200/call.</p>

```typescript
// Invoice rules — sent ONLY when invoice data is returned
const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    systemRules: (invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Mask exact totals for non-admin users.'
            : null,
    ],
});

// Task rules — sent ONLY when task data is returned
const TaskPresenter = definePresenter({
    name: 'Task',
    schema: taskSchema,
    systemRules: ['Use emojis: 🔄 In Progress, ✅ Done, ❌ Blocked'],
});
```

<a href="/mcp-fusion/mva/context-tree-shaking" class="ms-card-link">SEE HOW IT WORKS →</a>
</div>

<div class="ms-problem-card">
<div class="ms-problem-number">03</div>
<h3 class="ms-problem-title">SSR for Agents</h3>
<p class="ms-problem-pain"><strong>The problem:</strong> The developer begs in the prompt: "Please generate valid ECharts JSON." The AI gets the syntax wrong 20% of the time. The UI breaks. Charts become a probabilistic coinflip instead of deterministic output.</p>
<p class="ms-problem-solution"><strong>The mechanism:</strong> The agent is demoted to its correct role — a messenger. Complex chart configs, Mermaid diagrams, and Markdown tables are compiled server-side in Node.js (100% deterministic) via <code>.uiBlocks()</code>. The AI receives a <code>[SYSTEM]</code> pass-through directive and forwards the block unchanged. Visual hallucination drops to zero.</p>

```typescript
const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    uiBlocks: (invoice) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
        ui.table(
            ['Field', 'Value'],
            [['Status', invoice.status], ['Amount', `$${invoice.amount_cents / 100}`]],
        ),
    ],
});
// The LLM passes the chart config through. It never generates it.
```

<a href="/mcp-fusion/mva/perception-package" class="ms-card-link">SEE HOW IT WORKS →</a>
</div>

</div>
</div>

<!-- ═══ Section 3: MVA Conviction ═══ -->
<div class="ms-section ms-conviction">
<div class="ms-left">
<div class="ms-label">THE MVA ARCHITECTURE</div>
<h2 class="ms-headline">MVC was designed<br>for humans.<br><span class="ms-accent">Agents are not<br>humans.</span></h2>
</div>
<div class="ms-right">
<p class="ms-body">MVA replaces the human-centric View with the Presenter — an agent-centric perception layer that tells the AI exactly how to interpret, display, and act on domain data. This is not an iteration on MVC. It is a replacement.</p>
<div class="ms-columns">
<div class="ms-column">
<div class="ms-column-label">// MODEL</div>
<p class="ms-column-text">Zod schema validates and filters data. Unknown fields rejected with actionable errors. The LLM cannot inject parameters your schema does not declare.</p>
</div>
<div class="ms-column">
<div class="ms-column-label">// PRESENTER</div>
<p class="ms-column-text">JIT rules, server-rendered UI, cognitive guardrails, action affordances — all deterministic, all framework-enforced.</p>
</div>
</div>
</div>
</div>

<!-- ═══ Section 4: Technical Authority ═══ -->
<div class="ms-authority">
<div class="ms-authority-left">
<div class="ms-label">TECHNICAL AUTHORITY</div>
<h2 class="ms-headline">Architecture<br>overview.</h2>
<p class="ms-sub">Every capability designed for autonomous AI agents operating over the Model Context Protocol.</p>
</div>
<div class="ms-grid">
<div class="ms-card">
<div class="ms-card-number">01 // MVA</div>
<h3 class="ms-card-title">Presenter Engine</h3>
<p class="ms-card-desc">Domain-level Presenters validate data, inject rules, render charts, and suggest actions. Use definePresenter() or createPresenter() — both freeze-after-build.</p>
<a href="/presenter" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">02 // DX</div>
<h3 class="ms-card-title">Context Init (initFusion)</h3>
<p class="ms-card-desc">tRPC-style f = initFusion&lt;AppContext&gt;(). Define your context type ONCE — every f.tool(), f.presenter(), f.registry() inherits it. Zero generics.</p>
<a href="/dx-guide" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">03 // ROUTING</div>
<h3 class="ms-card-title">Action Consolidation</h3>
<p class="ms-card-desc">Nest 5,000+ operations into grouped namespaces. File-based routing with autoDiscover() scans directories automatically.</p>
<a href="/routing" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">04 // SECURITY</div>
<h3 class="ms-card-title">Context Derivation</h3>
<p class="ms-card-desc">f.middleware() / defineMiddleware() derives and injects typed data into context. Zod .strict() protects handlers from hallucinated params.</p>
<a href="/middleware" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">05 // RESILIENCE</div>
<h3 class="ms-card-title">Self-Healing Errors</h3>
<p class="ms-card-desc">toolError() provides structured recovery hints with suggested actions. Agents self-correct without human intervention.</p>
<a href="/building-tools" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">06 // AFFORDANCE</div>
<h3 class="ms-card-title">Agentic HATEOAS</h3>
<p class="ms-card-desc">.suggestActions() tells agents what to do next based on data state. Reduces action hallucination through explicit affordances.</p>
<a href="/mva-pattern" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">07 // DEV</div>
<h3 class="ms-card-title">HMR Dev Server</h3>
<p class="ms-card-desc">createDevServer() watches tool files and hot-reloads on change without restarting the LLM client. Sends notifications/tools/list_changed automatically.</p>
<a href="/dx-guide#hmr-dev-server-createdevserver" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">08 // GUARDRAILS</div>
<h3 class="ms-card-title">Cognitive Limits</h3>
<p class="ms-card-desc">.agentLimit() truncates large datasets and teaches agents to use filters. Prevents context DDoS and manages API costs.</p>
<a href="/presenter" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">09 // STATE</div>
<h3 class="ms-card-title">Temporal Awareness</h3>
<p class="ms-card-desc">RFC 7234-inspired cache-control signals prevent LLM Temporal Blindness. Cross-domain causal invalidation after mutations.</p>
<a href="/state-sync" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">10 // CLIENT</div>
<h3 class="ms-card-title">Type-Safe Client</h3>
<p class="ms-card-desc">createFusionClient() provides end-to-end type safety from server to client. Wrong action name? TypeScript catches it at build time.</p>
<a href="/fusion-client" class="ms-card-link">EXPLORE →</a>
</div>
</div>
</div>

<!-- ═══ Section 5: CTA ═══ -->
<div class="ms-cta">
<div class="ms-label">READ THE MVA GUIDE</div>
<h2 class="ms-cta-headline">The AI doesn't guess.<br>It knows.</h2>
<p class="ms-cta-sub">MVA is a new architectural pattern. The Presenter replaces the View with a <strong>deterministic perception layer</strong> — domain rules, rendered charts, action affordances, and cognitive guardrails. Every response is structured. Every action is explicit.</p>
<a href="/mva-pattern" class="ms-cta-button">READ THE FULL MVA GUIDE →</a>
</div>
