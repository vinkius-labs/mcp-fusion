---
layout: home

hero:
  name: "The TypeScript Framework for MCP Servers."
  text: ""
  tagline: "Type-safe tools, structured AI perception, and built-in security — deploy once and every AI assistant connects instantly."
  actions:
    - theme: brand
      text: 30-Second Quickstart →
      link: /quickstart-lightspeed
    - theme: alt
      text: The MVA Pattern
      link: /mva-pattern

  textAfterActions: "Open Source · Apache 2.0 · Built by Vinkius Labs"
---

<!-- ═══ AI Clients Grid ═══ -->
<div class="ms-clients-wrapper">
<div class="ms-clients-header">
<span class="ms-ping"><span class="ms-ping-wave"></span><span class="ms-ping-dot"></span></span>
<p class="ms-clients-label">Build MCP Servers and use them securely with any compatible client:</p>
</div>
<div class="ms-clients-grid">
<div class="ms-client" data-brand="claude">
<span class="ms-client-name">Claude</span>
<span class="ms-client-sub">Desktop & Code</span>
</div>
<div class="ms-client" data-brand="cursor">
<span class="ms-client-name">Cursor</span>
<span class="ms-client-sub">IDE</span>
</div>
<div class="ms-client" data-brand="codex">
<span class="ms-client-name">Codex</span>
<span class="ms-client-sub">OpenAI</span>
</div>
<div class="ms-client" data-brand="vscode">
<span class="ms-client-name">VS Code</span>
<span class="ms-client-sub">+ Copilot</span>
</div>
<div class="ms-client" data-brand="windsurf">
<span class="ms-client-name">Windsurf</span>
<span class="ms-client-sub">IDE</span>
</div>
<div class="ms-client" data-brand="cline">
<span class="ms-client-name">Cline</span>
<span class="ms-client-sub">Terminal</span>
</div>
</div>
</div>

<!-- ═══ MCP + MVA Distinction — Protocol + Architecture ═══ -->
<div class="ms-equation-section">
<div class="ms-equation-header">
<span class="ms-label">UNDERSTAND THE DIFFERENCE</span>
<h2 class="ms-headline">MCP is the protocol. MVA is the architecture.<br/>Together, they are Vurb.ts.</h2>
</div>
<div class="ms-equation-grid">
<div class="ms-equation-block">
<span class="ms-equation-badge">PROTOCOL</span>
<h3 class="ms-equation-title">MCP</h3>
<p class="ms-equation-full">Model Context Protocol</p>
<p class="ms-equation-desc">The open standard that defines <strong>how AI agents communicate</strong> with external tools. It specifies the transport layer, message format, and tool discovery. MCP is the wire — it doesn't tell you how to build what's on the other end.</p>
</div>
<div class="ms-equation-operator">+</div>
<div class="ms-equation-block">
<span class="ms-equation-badge ms-equation-badge--arch">ARCHITECTURE</span>
<h3 class="ms-equation-title">MVA</h3>
<p class="ms-equation-full">Model — View — Agent</p>
<p class="ms-equation-desc">The architectural pattern that defines <strong>how to structure what agents receive</strong>. The Model owns your data. The View (Presenter) shapes structured perception with domain rules and affordances. The Agent declares safe, typed actions.</p>
</div>
</div>
<div class="ms-equation-result">
<span class="ms-equation-equals">=</span>
<span class="ms-equation-product">Vurb.ts</span>
<span class="ms-equation-tagline">The definitive TypeScript framework for production MCP servers.</span>
</div>
</div>

<!-- ═══ Section 1: WHY MVA — Card Grid (LandingLayers pattern) ═══ -->
<div class="ms-grid-section">
<div class="ms-grid-header">
<span class="ms-label">WHY MVA</span>
<h2 class="ms-headline">Agents write your MCP servers.<br/>MVA makes sure they get it right.</h2>
<p class="ms-sub">Most MCP frameworks demand deep protocol knowledge. Vurb.ts was designed so AI coding agents scaffold production servers in minutes — not hours.</p>
</div>
<div class="ms-grid-cards">
<div class="ms-grid-card">
<span class="ms-card-tag">LEARNING CURVE</span>
<h3 class="ms-card-title">Zero protocol knowledge required</h3>
<p class="ms-card-desc">Agents and developers follow the same pattern every time: Model defines the data, View shapes perception, Agent declares actions. No MCP internals to learn.</p>
</div>
<div class="ms-grid-card">
<span class="ms-card-tag">CONSISTENCY</span>
<h3 class="ms-card-title">One pattern, every server</h3>
<p class="ms-card-desc">Every Vurb.ts server follows the same architectural contract — typed schemas, domain rules, and explicit affordances. Review any MCP server in seconds.</p>
</div>
<div class="ms-grid-card">
<span class="ms-card-tag">AGENT-FIRST</span>
<h3 class="ms-card-title">Built for Cursor, Claude & Copilot</h3>
<p class="ms-card-desc">The MVA pattern is designed to be understood by AI coding agents instantly. They generate correct, production-ready MCP servers without hallucinating protocol details.</p>
</div>
</div>
</div>

<!-- ═══ Section 2: SECURITY — Vertical Label + Massive Headline (LandingMarketplaceBridge pattern) ═══ -->
<div class="ms-bridge-section">
<div class="ms-bridge-grid">
<div class="ms-bridge-vlabel"><span>SECURITY</span></div>
<div class="ms-bridge-content">
<div class="ms-bridge-left">
<span class="ms-bridge-eyebrow"><span class="ms-bridge-dot"></span>SECURE BY DEFAULT</span>
<h2 class="ms-bridge-headline">The MCP spec makes security optional.<br/>Vurb.ts makes it mandatory.</h2>
</div>
<div class="ms-bridge-right">
<p>Raw MCP servers ship with no authentication, no input validation, and no egress control. Every tool call is an attack surface.</p>
<p>Vurb.ts includes <strong>Zod schema validation</strong> on every input, a built-in <strong>egress firewall</strong> that blocks unauthorized outbound calls, and a <strong>middleware pipeline</strong> for auth, rate limiting, and tenant isolation — all enabled by default.</p>
<p>You don't configure security. You'd have to explicitly disable it.</p>
</div>
</div>
</div>
</div>

<!-- ═══ Section 3: OBSERVABILITY — Feature Grid with Numbers ═══ -->
<div class="ms-feature-section">
<div class="ms-feature-header">
<span class="ms-label">OBSERVABILITY</span>
<h2 class="ms-headline">MCP servers are black boxes. Not anymore.</h2>
</div>
<div class="ms-feature-grid">
<div class="ms-feature-item">
<span class="ms-feature-num">01</span>
<h3 class="ms-feature-title">Structured Logs</h3>
<p class="ms-feature-desc">Every tool invocation emits JSON-structured logs with input, output, duration, and error context. Pipe to any logging backend.</p>
</div>
<div class="ms-feature-item">
<span class="ms-feature-num">02</span>
<h3 class="ms-feature-title">Metrics Endpoint</h3>
<p class="ms-feature-desc">Prometheus-compatible /metrics out of the box. Track latency, throughput, error rates, and token usage per tool.</p>
</div>
<div class="ms-feature-item">
<span class="ms-feature-num">03</span>
<h3 class="ms-feature-title">Audit Traces</h3>
<p class="ms-feature-desc">Full audit trail showing which data was accessed, which rules were applied, and which actions were suggested. SOC 2 and GDPR without extra tooling.</p>
</div>
<div class="ms-feature-item">
<span class="ms-feature-num">04</span>
<h3 class="ms-feature-title">Error Recovery</h3>
<p class="ms-feature-desc">Deterministic error boundaries per tool. When something breaks, you know exactly where and why — debug in seconds, not hours.</p>
</div>
</div>
</div>

<!-- ═══ Section: What Changes ═══ -->
<div class="ms-compare">
<div class="ms-compare-header">
<div class="ms-label">WHAT CHANGES</div>
<h2 class="ms-headline">Without MVA vs With MVA</h2>
<p class="ms-sub">Every line is a capability that ships in <strong>Vurb.ts</strong> today. Not a roadmap.</p>
</div>
<div class="ms-compare-table">
<div class="ms-compare-row ms-compare-head">
<div class="ms-compare-aspect"></div>
<div class="ms-compare-before">Without MVA</div>
<div class="ms-compare-after">With MVA (<strong>Vurb.ts</strong>)</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Tool surface</div>
<div class="ms-compare-before">50 individual tools. LLM sees every one. Token explosion.</div>
<div class="ms-compare-after"><strong>Action consolidation</strong> — 5,000+ operations behind ONE tool via discriminator. 10× fewer tokens.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Response shape</div>
<div class="ms-compare-before">JSON.stringify() — the AI parses and guesses.</div>
<div class="ms-compare-after"><strong>Structured perception</strong> — validated data + domain rules + UI blocks + action affordances in every response.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Domain context</div>
<div class="ms-compare-before">None. 45000 — dollars? cents? yen?</div>
<div class="ms-compare-after"><strong>System rules</strong> travel with the data. The AI knows it's cents. Always.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Next actions</div>
<div class="ms-compare-before">AI hallucinates tool names and parameters.</div>
<div class="ms-compare-after"><strong>Agentic HATEOAS</strong> — .suggest() with explicit affordances grounded in data state.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Large datasets</div>
<div class="ms-compare-before">10,000 rows dumped into context. OOM crash.</div>
<div class="ms-compare-after"><strong>Cognitive guardrails</strong> — .agentLimit() truncation + filter guidance. Context DDoS eliminated.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Security</div>
<div class="ms-compare-before">Internal fields leak to LLM. password_hash exposed.</div>
<div class="ms-compare-after"><strong>Egress Firewall</strong> — Zod .strict() rejects undeclared fields at RAM level. Automatic.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Visualizations</div>
<div class="ms-compare-before">Not possible. Text-only responses.</div>
<div class="ms-compare-after"><strong>Server-Rendered UI</strong> — ECharts, Mermaid diagrams, tables — compiled server-side. Zero hallucination.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Routing</div>
<div class="ms-compare-before">switch/case with 50 branches.</div>
<div class="ms-compare-after"><strong>Hierarchical groups</strong> — platform.users.list — infinite nesting with file-based autoDiscover().</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Error recovery</div>
<div class="ms-compare-before">throw Error — AI gives up or hallucinates a fix.</div>
<div class="ms-compare-after"><strong>Self-healing</strong> — toolError() with recovery hints + suggested retry args.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Token cost</div>
<div class="ms-compare-before">Full JSON payloads every call. Bills compound.</div>
<div class="ms-compare-after"><strong>TOON encoding</strong> — toonSuccess() reduces response tokens by ~40%.</div>
</div>
<div class="ms-compare-row">
<div class="ms-compare-aspect">Type safety</div>
<div class="ms-compare-before">Manual casting. No client types. Runtime crashes.</div>
<div class="ms-compare-after"><strong>tRPC-style client</strong> — createVurbClient() with full end-to-end inference.</div>
</div>
</div>
<a href="/comparison" class="ms-compare-link">SEE THE FULL COMPARISON WITH CODE EXAMPLES →</a>
</div>

<!-- ═══ Section: Three Core Problems ═══ -->
<div class="ms-problems">
<div class="ms-problems-header">
<div class="ms-label">PROBLEM SPACE</div>
<h2 class="ms-headline">Three problems.<br>Framework-level solutions.</h2>
<p class="ms-sub">Every claim below maps to real code in the repository. Not a roadmap. Not a promise.</p>
</div>

<div class="ms-problem-grid">

<div class="ms-problem-card">
<div class="ms-problem-number">01</div>
<h3 class="ms-problem-title">Egress Firewall & Anti-DDoS</h3>
<p class="ms-problem-pain"><strong>The problem:</strong> Raw MCP servers leak <code>password_hashes</code> directly to the LLM when developers write <code>SELECT *</code>. Returning 100,000 records routinely triggers <strong>LLM OOM</strong> crashes or bankrupts teams with runaway API bills.</p>
<p class="ms-problem-solution"><strong>The mechanism:</strong> The Zod <code>.schema()</code> on every Presenter physically strips undeclared fields at RAM level — not filtered, gone. Simultaneously, <code>.agentLimit()</code> truncates massive arrays and teaches agents to use filters instead.</p>

```typescript
const UserPresenter = createPresenter('User')
    .schema(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        // password_hash, tenant_id, internal_flags
        // → physically absent. Not filtered. GONE.
    }));
```

<a href="/presenter" class="ms-card-link">EXPLORE THE PRESENTER →</a>
</div>

<div class="ms-problem-card">
<div class="ms-problem-number">02</div>
<h3 class="ms-problem-title">Context Tree-Shaking</h3>
<p class="ms-problem-pain"><strong>The problem:</strong> Teaching the AI about invoices, tasks, sprints, and users means a 10,000-token system prompt — sent on every call. The LLM loses coherence mid-text, misapplies rules across domains, and the company pays for irrelevant tokens on every request.</p>
<p class="ms-problem-solution"><strong>The mechanism:</strong> Like webpack tree-shaking removes unused code, <code>.rules()</code> removes unused rules from the context window. Domain rules travel <strong>with the data</strong> — the invoice rule only exists when the agent processes an invoice. Token overhead drops from ~2,000/call to ~200/call.</p>

```typescript
// Invoice rules — sent ONLY when invoice data is returned
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .rules((invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Mask exact totals for non-admin users.'
            : null,
    ]);
```

<a href="/mva/context-tree-shaking" class="ms-card-link">SEE HOW IT WORKS →</a>
</div>

<div class="ms-problem-card">
<div class="ms-problem-number">03</div>
<h3 class="ms-problem-title">SSR for Agents</h3>
<p class="ms-problem-pain"><strong>The problem:</strong> The developer begs in the prompt: "Please generate valid ECharts JSON." The AI gets the syntax wrong 20% of the time. Charts become a probabilistic coinflip instead of deterministic output.</p>
<p class="ms-problem-solution"><strong>The mechanism:</strong> Complex chart configs, Mermaid diagrams, and Markdown tables are compiled server-side in Node.js via <code>.ui()</code>. The AI receives a <code>[SYSTEM]</code> pass-through directive and forwards the block unchanged. Visual hallucination drops to zero.</p>

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .ui((invoice) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
        ui.table(
            ['Field', 'Value'],
            [['Status', invoice.status], ['Amount', `$${invoice.amount_cents / 100}`]],
        ),
    ]);
// The LLM passes the chart config through. It never generates it.
```

<a href="/mva/perception-package" class="ms-card-link">SEE HOW IT WORKS →</a>
</div>

</div>
</div>

<!-- ═══ Section: MVA Architecture ═══ -->
<div class="ms-section ms-conviction">
<div class="ms-left">
<div class="ms-label">THE MVA ARCHITECTURE</div>
<h2 class="ms-headline">MVC was designed<br>for humans.<br><span class="ms-accent">Agents are not<br>humans.</span></h2>
</div>
<div class="ms-right">
<p class="ms-body">MVA replaces the human-centric View with the Presenter — an agent-centric perception layer that tells the AI exactly how to interpret, display, and act on domain data. The handler returns raw data (Model). The Presenter shapes perception (View). The middleware governs access (Agent). This isn't an iteration on MVC. It's a replacement.</p>
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

<!-- ═══ Section: Technical Authority Grid ═══ -->
<div class="ms-authority">
<div class="ms-authority-left">
<div class="ms-label">ARCHITECTURE</div>
<h2 class="ms-headline">Everything<br>you need.</h2>
<p class="ms-sub">Every capability designed for autonomous AI agents operating over the Model Context Protocol.</p>
</div>
<div class="ms-grid">
<div class="ms-card">
<div class="ms-card-number">01 // MVA</div>
<h3 class="ms-card-title">Presenter Engine</h3>
<p class="ms-card-desc">Domain-level Presenters validate data, inject rules, render charts, and suggest actions. Use createPresenter() (fluent) or definePresenter() (declarative) — both freeze-after-build.</p>
<a href="/presenter" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">02 // DX</div>
<h3 class="ms-card-title">Context Init (initVurb)</h3>
<p class="ms-card-desc">tRPC-style f = initVurb&lt;AppContext&gt;(). Define your context type once — every f.query(), f.presenter(), f.registry() inherits it. Zero generics pollution.</p>
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
<p class="ms-card-desc">f.middleware() / defineMiddleware() derives and injects typed data into context. Zod .strict() protects handlers from hallucinated parameters.</p>
<a href="/middleware" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">05 // RESILIENCE</div>
<h3 class="ms-card-title">Self-Healing Errors</h3>
<p class="ms-card-desc">toolError() provides structured recovery hints with suggested actions and pre-populated arguments. Agents self-correct without human intervention.</p>
<a href="/building-tools" class="ms-card-link">EXPLORE →</a>
</div>
<div class="ms-card">
<div class="ms-card-number">06 // AFFORDANCE</div>
<h3 class="ms-card-title">Agentic HATEOAS</h3>
<p class="ms-card-desc">.suggest() / .suggestActions() tells agents what to do next based on data state. Eliminates action hallucination through explicit affordances.</p>
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
<p class="ms-card-desc">.limit() / .agentLimit() truncates large datasets and teaches agents to use filters. Prevents context DDoS and keeps API costs under control.</p>
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
<p class="ms-card-desc">createVurbClient() provides end-to-end type safety from server to client. Wrong action name? TypeScript catches it at build time.</p>
<a href="/fusion-client" class="ms-card-link">EXPLORE →</a>
</div>
</div>
</div>

<!-- ═══ Section: Ecosystem ═══ -->
<div class="ms-section ms-ecosystem">
<div class="ms-left">
<div class="ms-label">ECOSYSTEM</div>
<h2 class="ms-headline">Deploy<br>anywhere.<br><span class="ms-accent">Generate from<br>anything.</span></h2>
</div>
<div class="ms-right">
<p class="ms-body">The same ToolRegistry runs across Stdio, HTTP/SSE, and serverless runtimes without code changes. Auto-generate fully typed MCP tools from your existing infrastructure.</p>
<div class="ms-columns">
<div class="ms-column">
<div class="ms-column-label">// DEPLOY TARGETS</div>
<p class="ms-column-text"><strong>Vercel Edge Functions</strong> — fast cold starts in a Next.js route.<br><strong>Cloudflare Workers</strong> — D1, KV, R2 bindings from 300+ edge locations.<br><strong>AWS Lambda</strong> — Step Functions connector.</p>
</div>
<div class="ms-column">
<div class="ms-column-label">// DATA CONNECTORS</div>
<p class="ms-column-text"><strong>Prisma Generator</strong> — CRUD tools with field-level security from your schema.<br><strong>OpenAPI Generator</strong> — typed tools from any REST API.<br><strong>n8n Connector</strong> — n8n workflows as MCP tools.</p>
</div>
</div>
</div>
</div>

<!-- ═══ Section: CTA ═══ -->
<div class="ms-cta">
<div class="ms-label">GET STARTED</div>
<h2 class="ms-cta-headline">The AI doesn't guess.<br>It knows.</h2>
<p class="ms-cta-sub">MVA is a new architectural pattern. The Presenter replaces the View with a <strong>deterministic perception layer</strong> — domain rules, rendered charts, action affordances, and cognitive guardrails. Every response is structured. Every action is explicit.</p>
<a href="/quickstart-lightspeed" class="ms-cta-button">BUILD YOUR FIRST MCP SERVER →</a>
</div>
