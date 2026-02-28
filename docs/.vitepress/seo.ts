import type { HeadConfig } from 'vitepress';

const BASE_URL = 'https://mcp-fusion.vinkius.com';

interface PageSEO {
  title: string;
  description: string;
  faqs: { q: string; a: string }[];
}

const pages: Record<string, PageSEO> = {

  // ═══════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════
  'index.md': {
    title: 'mcp-fusion — The MVA Framework for MCP Servers',
    description: 'A TypeScript framework with a Structured Perception Layer for AI agents. MVA (Model-View-Agent) architecture with Presenters, cognitive guardrails, and structured perception packages.',
    faqs: [
      { q: 'What is mcp-fusion?', a: 'mcp-fusion is a TypeScript framework for the Model Context Protocol (MCP) that introduces the MVA (Model-View-Agent) architectural pattern. It replaces raw JSON responses with structured perception packages — validated data, domain rules, server-rendered charts, and explicit action affordances — so AI agents perceive and act on data deterministically instead of guessing.' },
      { q: 'What is MVA (Model-View-Agent)?', a: 'MVA is a new architectural pattern created by Renato Marinho at Vinkius Labs. It replaces MVC\'s human-centric View with a Presenter — an agent-centric perception layer. The Model validates with Zod, the Presenter adds domain rules, UI blocks, affordances, and guardrails, and the Agent (LLM) consumes structured output to act deterministically.' },
      { q: 'How is mcp-fusion different from the official MCP SDK?', a: 'The official MCP SDK (@modelcontextprotocol/sdk) provides the protocol transport layer — stdin/stdio, HTTP. mcp-fusion builds on top and adds: MVA architecture with Presenters, action consolidation (5,000+ ops behind one tool), Zod validation with .strip(), tRPC-style middleware, self-healing errors, server-rendered UI blocks (ECharts, Mermaid), cognitive guardrails, state sync with cache signals, TOON encoding for 40% fewer tokens, and a type-safe tRPC-style client.' },
      { q: 'Is mcp-fusion free and open source?', a: 'Yes. mcp-fusion is open source under the Apache 2.0 license. It is free to use in personal and commercial projects. Built and maintained by Vinkius Labs.' },
      { q: 'What is action consolidation in mcp-fusion?', a: 'Action consolidation lets you group 5,000+ operations behind a single MCP tool using a discriminator enum. Instead of 50 separate tools flooding the LLM prompt, the agent sees ONE tool with actions like users.list, billing.refund. This reduces token usage by 10x and eliminates tool-selection hallucination.' },
      { q: 'What are cognitive guardrails in mcp-fusion?', a: 'Cognitive guardrails (.agentLimit()) prevent large datasets from overwhelming the AI context window. When a query returns 10,000 rows, the guardrail automatically truncates to a safe limit (e.g., 50 items) and injects guidance like "Showing 50 of 10,000. Use filters to narrow results." This prevents context DDoS and reduces costs by up to 100x.' },
      { q: 'Does mcp-fusion work with Claude, GPT, and other LLMs?', a: 'Yes. mcp-fusion is LLM-agnostic. It follows the Model Context Protocol standard, supported by Claude, GPT-5.2, Gemini, and any MCP-compatible client. Structured perception packages work with any LLM that processes text.' },
      { q: 'What languages and runtimes does mcp-fusion support?', a: 'mcp-fusion is written in TypeScript and runs on Node.js >= 18. It requires TypeScript >= 5.7 for full type inference. All APIs are fully typed with generics, providing autocomplete and compile-time safety.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // THE MVA MANIFESTO
  // ═══════════════════════════════════════════════════════
  'mva-pattern.md': {
    title: 'The MVA Manifesto — Model-View-Agent Architecture',
    description: 'MVA replaces MVC for the AI era. The Presenter is a deterministic perception layer for AI agents with domain rules, rendered charts, action affordances, and cognitive guardrails.',
    faqs: [
      { q: 'What is the MVA (Model-View-Agent) pattern?', a: 'MVA is an architectural pattern that replaces MVC for AI-native applications. Instead of a human-centric View, MVA uses a Presenter — a deterministic perception layer that structures responses for AI agents with validated data, domain rules, UI blocks, suggested actions, and cognitive guardrails. It was created by Renato Marinho at Vinkius Labs.' },
      { q: 'How does MVA differ from MVC?', a: 'MVC was designed for human users interacting via browsers. MVA replaces the View with the Presenter — designed for AI agents. While MVC Views render HTML/CSS, MVA Presenters render structured perception packages: Zod-validated data, system rules, ECharts/Mermaid visualizations, HATEOAS affordances, and context guardrails.' },
      { q: 'Who created MVA?', a: 'MVA (Model-View-Agent) was created by Renato Marinho at Vinkius Labs as a purpose-built architecture for AI agents operating over the Model Context Protocol (MCP). It is the core pattern behind the mcp-fusion framework.' },
      { q: 'Why is MVA needed for AI agents?', a: 'AI agents cannot interpret raw JSON the way humans read UI. They need explicit domain context ("amount_cents is in cents"), explicit next-action hints (what tools to call next), and cognitive guardrails (limits on data volume). MVA provides all of this through the Presenter layer, eliminating guesswork and hallucination.' },
      { q: 'What is a structured perception package?', a: 'A structured perception package is the output of an MVA Presenter. It contains: (1) Zod-validated and stripped data, (2) system rules with domain context, (3) server-rendered UI blocks (charts, diagrams), (4) suggested next actions with reasons, and (5) cognitive guardrails. This replaces raw JSON.stringify() output.' },
      { q: 'What is the role of the Presenter in MVA?', a: 'The Presenter is the View layer in MVA. It sits between the Model (raw data) and the Agent (LLM). It transforms raw data into a structured perception package by: validating with a schema, injecting system rules, rendering UI blocks, suggesting next actions based on data state, and enforcing agent limits. It is defined once and reused across all tools that return that entity.' },
      { q: 'How does MVA prevent AI hallucination?', a: 'MVA prevents hallucination through four deterministic mechanisms: (1) Zod .strip() silently removes parameters the AI invents. (2) System rules provide domain context so the AI interprets data correctly. (3) .suggestActions() tells the AI exactly what tools to call next. (4) .agentLimit() prevents context overflow that degrades accuracy.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COMPARISON
  // ═══════════════════════════════════════════════════════
  'comparison.md': {
    title: 'Without MVA vs With MVA — Feature Comparison',
    description: 'Side-by-side comparison of traditional MCP servers vs mcp-fusion with MVA. Covers action consolidation, Presenters, cognitive guardrails, self-healing errors, and more.',
    faqs: [
      { q: 'What problems does MVA solve that raw MCP doesn\'t?', a: 'Raw MCP servers dump JSON.stringify() output, have no domain context, no action hints, leak internal fields, and force switch/case routing. MVA solves all of this with structured perception packages, system rules, Agentic HATEOAS, Zod .strip() security, and discriminator-based action consolidation. It is the definitive strategy for secure Legacy API Migration.' },
      { q: 'How does action consolidation reduce token usage?', a: 'Instead of registering 50 individual tools (each with name + description + schema in the prompt consuming ~100 tokens), mcp-fusion consolidates them behind ONE tool with a discriminator enum. The LLM sees a single tool definition instead of 50, reducing prompt token usage by up to 10x.' },
      { q: 'How do cognitive guardrails prevent context DDoS?', a: 'When a query returns 10,000 rows, .agentLimit(50) truncates to 50 items and injects guidance: "Showing 50 of 10,000. Use filters to narrow results." This prevents context overflow, reduces costs from ~$2.40 to ~$0.02 per call, and maintains AI accuracy.' },
      { q: 'What are self-healing errors in mcp-fusion?', a: 'toolError() returns structured recovery hints instead of plain error strings. Example: { code: "NOT_FOUND", recovery: { action: "list", suggestion: "List invoices to find the correct ID" }, suggestedArgs: { status: "pending" } }. The AI automatically retries with corrected parameters instead of giving up.' },
      { q: 'How does mcp-fusion improve security over raw MCP?', a: 'Raw MCP servers leak all database fields to the LLM, including internal data like password_hash and SSN. mcp-fusion uses Zod .strip() as a security boundary — only fields declared in the Presenter schema reach the AI. Undeclared fields are silently removed.' },
      { q: 'What is Agentic HATEOAS?', a: 'Agentic HATEOAS is the concept of providing explicit next-action hints to AI agents based on data state, inspired by REST HATEOAS. Using .suggestActions(), each response includes tools the agent can call next with reasons. Example: invoice status "pending" suggests { tool: "billing.pay", reason: "Process payment" }.' },
      { q: 'How does TOON encoding save tokens?', a: 'TOON (Token-Oriented Object Notation) is a compact serialization format in mcp-fusion that reduces token count by ~40% compared to standard JSON. Use toonSuccess(data) instead of success(data). It strips quotes, uses shorthand notation, and minimizes whitespace while remaining parseable by LLMs.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COST & HALLUCINATION
  // ═══════════════════════════════════════════════════════
  'cost-and-hallucination.md': {
    title: 'Cost Reduction & Anti-Hallucination — Design Principles',
    description: 'How mcp-fusion reduces LLM API costs and prevents hallucination through fewer tokens, fewer requests, action consolidation, TOON encoding, cognitive guardrails, and self-healing errors.',
    faqs: [
      { q: 'How does mcp-fusion reduce LLM API costs?', a: 'mcp-fusion targets cost reduction through eight mechanisms: action consolidation (fewer tools in the prompt), TOON encoding (~30-50% fewer tokens), cognitive guardrails (bounded response sizes), JIT context (no wasted tokens on irrelevant rules), Zod .strip() (fewer hallucinated-parameter retries), self-healing errors (fewer correction attempts), agentic affordances (fewer wrong-tool selections), and State Sync (fewer stale-data re-reads).' },
      { q: 'What is the relationship between tokens and hallucination?', a: 'Cost and hallucination share a root cause: too many tokens flowing through the context window and too many requests because the agent did not get what it needed the first time. Reducing prompt noise improves accuracy, and better accuracy reduces retries — creating a virtuous cycle of lower cost and better behavior.' },
      { q: 'What is action consolidation in mcp-fusion?', a: 'Action consolidation groups multiple operations behind a single MCP tool using a discriminator enum. Instead of 50 separate tools flooding the prompt with ~10,000 schema tokens, a grouped tool uses ~1,500 tokens. This reduces the token budget consumed by tool definitions and helps the agent select the correct action.' },
      { q: 'What is TOON encoding?', a: 'TOON (Token-Oriented Object Notation) is a compact serialization format that replaces verbose JSON with pipe-delimited tabular data. It achieves roughly 30-50% token reduction over equivalent JSON for tabular data, reducing both prompt and response token costs. Available via toonSuccess() for responses and toonMode for descriptions.' },
      { q: 'How do cognitive guardrails reduce costs?', a: 'The Presenter .agentLimit() method truncates large result sets before they reach the LLM. A query returning 10,000 rows (~5 million tokens, ~$8.75 at GPT-5.2 pricing) is truncated to 50 rows (~25,000 tokens, ~$0.04). The truncation includes guidance for the agent to use filters, teaching it to narrow results instead of requesting everything.' },
      { q: 'What are self-healing errors and how do they reduce retries?', a: 'Self-healing errors translate raw validation failures into directive correction prompts. Instead of "Validation failed: email: Invalid", the agent receives: "Expected: a valid email address (e.g. user@example.com). You sent: admin@local." This aims to help the agent self-correct on the first retry rather than guessing blindly across multiple attempts.' },
      { q: 'How does State Sync prevent unnecessary LLM requests?', a: 'State Sync injects causal invalidation signals after mutations (e.g., "[System: Cache invalidated for sprints.* — caused by sprints.update]") and cache-control directives in tool descriptions (e.g., "[Cache-Control: immutable]"). This helps the agent know when to re-read data and when cached results are still valid, avoiding unnecessary API calls.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // INTRODUCTION
  // ═══════════════════════════════════════════════════════
  'introduction.md': {
    title: 'Introduction to mcp-fusion',
    description: 'Get started with mcp-fusion — the MVA framework for building MCP servers that AI agents actually understand.',
    faqs: [
      { q: 'What do I need to get started with mcp-fusion?', a: 'You need Node.js >= 18 and TypeScript >= 5.7. Install with: npm install @vinkius-core/mcp-fusion zod. The framework builds on top of the official @modelcontextprotocol/sdk which is included as a peer dependency.' },
      { q: 'Can I use mcp-fusion with existing MCP servers?', a: 'Yes. mcp-fusion uses the standard MCP SDK under the hood. You can incrementally adopt it by converting tools one at a time. Existing raw handlers continue to work alongside mcp-fusion tools on the same server.' },
      { q: 'Does mcp-fusion work with Claude, GPT, and other LLMs?', a: 'Yes. mcp-fusion is LLM-agnostic. It follows the Model Context Protocol standard, which is supported by Claude, GPT-5.2, Gemini, and any MCP-compatible client. The structured responses work with any LLM that can process text.' },
      { q: 'What makes mcp-fusion better than writing raw MCP handlers?', a: 'Raw handlers require manual switch/case routing, manual JSON.stringify, no validation, no domain context, and no security boundary. mcp-fusion gives you: automatic Zod validation, discriminator routing, Presenters with system rules and UI blocks, self-healing errors, middleware chains, and cognitive guardrails — all type-safe and zero-boilerplate.' },
      { q: 'What is the learning curve for mcp-fusion?', a: 'If you know TypeScript and basic MCP concepts, you can be productive in under 30 minutes. defineTool() requires zero Zod knowledge. createTool() requires basic Zod. Presenters are optional and can be added incrementally after your tools work.' },
      { q: 'Does MCP Fusion work with Vercel AI SDK or LangChain?', a: 'Yes. MCP Fusion is the perfect backend Server. If you are using LangChain, LlamaIndex, or Vercel AI SDK in your client application, simply connect them to your mcp-fusion backend via standard stdio or HTTP transports. They will automatically consume and execute your consolidated MVA actions flawlessly.' },
      { q: 'What components does the mcp-fusion architecture include?', a: 'The architecture includes: GroupedToolBuilder (tool definition), ToolRegistry (registration and routing), ExecutionPipeline (middleware + handler execution), Presenter Engine (MVA View layer), ResponseBuilder (manual response composition), FusionClient (tRPC-style type-safe client), and State Sync (cache signals).' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // QUICKSTART — LIGHTSPEED (CLI)
  // ═══════════════════════════════════════════════════════
  'quickstart-lightspeed.md': {
    title: 'Quickstart Lightspeed — CLI Scaffold in 30 Seconds',
    description: 'From zero to a running MCP server in under 30 seconds. The CLI scaffolds a production-ready project with autoDiscover file-based routing, typed context, Presenters, middleware, testing, and pre-configured connections for Cursor, Claude Desktop, and Claude Code.',
    faqs: [
      { q: "How do I create an MCP Server for Cursor?", a: "Run `npx fusion create my-server`. It is currently the only MCP framework that automatically pre-configures a `.cursor/mcp.json` file in the scaffold. Literally open your new folder in Cursor, and the connection is instantly live. No manual clicking, no setup wizard config." },
      { q: "Does MCP Fusion work with Claude Code?", a: "Yes, flawlessly. Because Claude Code runs in your terminal, simply start your Fusion HMR dev server and run `claude mcp add my-server npx tsx src/server.ts`. Claude Code instantly perceives your Zod schemas and executes them via the command line with zero latency." },
      { q: "How do I configure Windsurf to use my MCP Server?", a: "Open your `~/.codeium/windsurf/mcp_config.json` and map your Fusion server using the standard STDIO transport (`npx tsx src/server.ts`). Windsurf natively understands MCP Fusion's Agentic Affordances and Context Tree-Shaking, executing complex domain tasks perfectly." },
      { q: "Does GitHub Copilot support MCP Fusion?", a: "Yes! Modern VS Code Copilot instances read the `.vscode/mcp.json` configuration. Just scaffold your project, map your start command, and GitHub Copilot immediately gains access to your database, local APIs, and background services with full type-safety." },
      { q: "What makes MCP Fusion the best framework for Cline?", a: "Cline is wildly popular for autonomous coding. MCP Fusion's 'Self-Healing Errors' are perfect for Cline. When Cline hallucinates a wrong parameter, Fusion's `.suggestedArgs` instantly tells Cline how to correct itself, preventing endless loops of broken terminal executions." },
      { q: "What is autoDiscover in the MCP Fusion CLI?", a: "It is file-based routing for MCP tools. You NEVER have to manually register tools. Drop a `listUsers.ts` file in your `/tools/users` folder, and `fusion dev` instantly hot-reloads the tool into Cursor, Claude Code, or Windsurf without you even restarting the chat." },
      { q: "How do I safely connect Clayton/Claude to my Postgres Database?", a: "Use `npx fusion create my-api --vector prisma`. This generates a secure Postgres SQL Agent MCP server. Unlike raw SQL access which destroys databases and burns millions of tokens, Fusion wraps your Prisma schema in Zod-stripped Presenters so the AI only accesses safe, confined Egress Firewalls." },
      { q: "Can I scaffold an MCP server hooked directly to my Prisma database?", a: "Yes! The command automatically installs the Fusion Prisma generator. It bridges your `schema.prisma` directly into live MCP tools. Cursor can suddenly read, write, and query your secure local database via Zod-stripped Presenters." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // QUICKSTART — TRADITIONAL (MANUAL)
  // ═══════════════════════════════════════════════════════
  'quickstart.md': {
    title: 'Quickstart Traditional — Manual MCP Server Setup',
    description: 'Build your first MVA-powered MCP server manually with full control over every file. Step-by-step guide: install, init, define a tool, register, and start.',
    faqs: [
      { q: 'How long does it take to build an MCP server with mcp-fusion?', a: 'You can have a production-ready MCP server running in under 5 minutes. Define a tool with f.tool(), register it with ToolRegistry, and attach to an MCP server. The framework handles validation, routing, and response formatting automatically. For an even faster path, use npx fusion create which scaffolds a complete project in 30 seconds.' },
      { q: 'Do I need to use Zod with mcp-fusion?', a: 'No. mcp-fusion offers two APIs: defineTool() for JSON-first definitions without Zod imports, and createTool() for full Zod power. With defineTool(), you can use simple strings like { id: "string" } instead of z.object({ id: z.string() }).' },
      { q: 'How do I add a Presenter to my tool?', a: 'Create a Presenter with createPresenter("Name").schema(...).systemRules([...]).suggestActions(...), then assign it to your action with the "returns" property: { returns: InvoicePresenter, handler: async (ctx, args) => rawData }. The framework wraps raw data in the Presenter automatically.' },
      { q: 'How do I register and attach tools to an MCP server?', a: 'Create a ToolRegistry, register your builders with registry.register(tool), then call registry.attachToServer(server, { contextFactory: (extra) => createContext(extra) }). The registry automatically configures the MCP server with list_tools and call_tool handlers.' },
      { q: 'What is the minimum code for a working mcp-fusion tool?', a: 'Three steps: (1) const tool = defineTool("hello", { actions: { greet: { handler: async () => success("Hello!") } } }); (2) const registry = new ToolRegistry(); registry.register(tool); (3) registry.attachToServer(server, {}). This creates a tool with one action "greet" that returns "Hello!".' },
      { q: 'How do I handle parameters in tool actions?', a: 'With defineTool(), use params: { name: "string", age: "number" }. With createTool(), use schema: z.object({ name: z.string(), age: z.number() }). In both cases, the handler receives typed, validated arguments. Invalid inputs are rejected before reaching your handler.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // ENTERPRISE QUICKSTART
  // ═══════════════════════════════════════════════════════
  'enterprise-quickstart.md': {
    title: 'Enterprise Quickstart — Production MCP Server in 15 Minutes',
    description: 'Build a production-grade MCP server with typed context, middleware authentication, Presenter-based field stripping, and structured observability.',
    faqs: [
      { q: 'How do I build a production MCP server with mcp-fusion?', a: 'Define typed context with initFusion<AppContext>(), add authentication middleware with f.middleware(), create Presenters with Zod schemas that strip sensitive fields, and attach to the MCP server with contextFactory and createDebugObserver for audit logging.' },
      { q: 'How does mcp-fusion handle authentication?', a: 'Authentication is implemented through middleware. f.middleware() accepts a derive function that receives the current context and returns user identity properties. These are merged into ctx via Object.assign. If middleware throws, the handler never executes.' },
      { q: 'How does field stripping work in mcp-fusion?', a: 'The Presenter declares a Zod schema with only the fields the agent should perceive. When .make(data) is called, Zod parse() validates and strips any fields not in the schema. Database columns like password_hash and ssn are automatically removed.' },
      { q: 'How does mcp-fusion implement tenant isolation?', a: 'Middleware resolves the caller tenant from their identity and adds tenantId to ctx. Every handler uses ctx.user.tenantId as a mandatory database filter. The agent cannot query another tenant data because tenantId comes from the resolved identity, not from agent input.' },
      { q: 'Is mcp-fusion suitable for large-scale enterprise deployments?', a: 'Yes. It was designed specifically for enterprise scale, providing zero-overhead middleware, strict Zod schemas, OOM guards, and built-in OpenTelemetry tracing to satisfy demanding compliance and performance requirements.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // CLIENT INTEGRATIONS
  // ═══════════════════════════════════════════════════════
  'client-integrations.md': {
    title: 'Client Integrations — Vercel AI SDK, LangChain, LlamaIndex',
    description: 'MCP Fusion is the perfect backend Server for Vercel AI SDK and LangChain. Expose your MCP server and they will consume Consolidated MVA Actions flawlessly.',
    faqs: [
      { q: 'Does MCP Fusion work with Vercel AI SDK and LangChain?', a: 'Yes. MCP Fusion is the perfect backend Server. If you are using LangChain or Vercel AI SDK in your client app, simply connect them to your mcp-fusion backend via stdio or HTTP. They will automatically consume and execute your Consolidated MVA Actions flawlessly.' },
      { q: 'Why use MCP Fusion instead of defining tools directly in Vercel AI SDK?', a: 'Defining tools directly in Vercel AI SDK mixes UI routing with backend logic and lacks protection against Context DDoS. MCP Fusion provides a dedicated Zero-Trust backend environment with middleware, tenant isolation, and cognitive guardrails, while Vercel AI SDK streams the rich UI.' },
      { q: 'How does MCP Fusion fix LangChain Tool Hell?', a: 'By providing Consolidated MVA Actions. Instead of overwhelming a LangChain agent with 50 raw tools, MCP Fusion exposes a single orchestrator tool with a deterministic discriminator. This drastically reduces agent hallucination and token costs.' },
      { q: 'Can LlamaIndex connect to an MCP Fusion server?', a: 'Yes. LlamaIndex agents, like the ReAct agent, can use an MCP Fusion server to execute external actions. This guarantees that every mutation passes through strictly typed middleware and Presenter logic, preventing LLM-driven data corruption while LlamaIndex handles RAG orchestration.' }
    ]
  },

  // ═══════════════════════════════════════════════════════
  // SECURITY & AUTH
  // ═══════════════════════════════════════════════════════
  'enterprise/security.md': {
    title: 'Security & Authentication — MCP Fusion Enterprise',
    description: 'Middleware pipelines, context derivation, tag-based access control, and Presenter-based field stripping for production MCP servers.',
    faqs: [
      { q: 'How does mcp-fusion enforce authentication?', a: 'contextFactory runs first on every request, creating seed context from the MCP SDK extra object. Middleware functions then resolve identity and merge user properties into ctx. If contextFactory or middleware throws, the handler is never executed.' },
      { q: 'How does tag-based access control work in mcp-fusion?', a: 'Tools declare tags via the tags property. attachToServer accepts a filter with AND/OR/Exclude logic. Filtered tools are invisible — they do not appear in the tool list and cannot be called by the agent.' },
      { q: 'How does mcp-fusion prevent sensitive data leaks to AI agents?', a: 'Raw MCP Servers leak password_hashes directly to the LLM. MCP Fusion strips them at RAM level. The Presenter Zod schema declares only the fields the agent should perceive. Zod parse() destroys undeclared sensitive parameters before serialization. This creates an impenetrable Egress Firewall protecting your Token Economics.' },
      { q: 'How does MCP Fusion provide Prompt Injection Defense?', a: 'By rigidly enforcing MVA patterns. Because the Presenter engine sits strictly between the handler and the LLM response window, it ensures malicious payloads hidden in your database cannot hijack the system rules or tool schemas. The data is parsed, sterilized, and structured deterministically.' },
      { q: 'How does MCP Fusion prevent LLM OOM (Out of Memory) and Context DDoS?', a: 'Using the Presenter `.agentLimit()` cognitive guardrail. If your database unexpectedly returns 100,000 records, raw MCP servers will flood the LLM, causing a fatal OOM or a $50 API bill. MCP Fusion catches this, truncates the payload to a safe bound (e.g., 50 items), and injects a warning array instructing the AI to paginate.' },
      { q: 'Can I apply different security policies to different handlers?', a: 'Yes. Middleware can be applied globally via the tool builder, or scoped to specific action groups using `.group()`. This ensures granular role-based access control (RBAC) down to the individual endpoint.' },
      { q: 'What happens when an unauthorized request is made?', a: 'The pipeline immediately short-circuits, returning a deterministic Failure monad. No downstream code runs, preventing execution side-effects and ensuring absolute security.' },    ],
  },

  // ═══════════════════════════════════════════════════════
  // GOVERNANCE & AUDIT & SOC2
  // ═══════════════════════════════════════════════════════
  'governance/index.md': {
    title: 'Capability Governance — AI Agent Sandbox & SOC2 Audit',
    description: 'Cryptographic surface integrity, behavioral lockfiles, and zero-trust attestation for secure AI Agent Sandbox and CISO Compliance.',
    faqs: [
      { q: 'How does MCP Fusion help with SOC2 compliance?', a: 'By providing Immutable Evidence via the Capability Lockfile. Every change to a tool\'s behavioral contract, schema, or system rules requires a git commit to `mcp-fusion.lock`. This guarantees full CISO Compliance by ensuring your AI Agent Sandbox has a deterministic, auditable capability surface that never drifts silently.' },
      { q: 'What is Phantom Capability prevention?', a: 'Raw MCP tools can silently gain destructive imports (like `child_process.exec`) without changing their schema. MCP Fusion\'s Blast Radius Analysis detects these Phantom Capabilities statically, preventing lateral movement attacks before they merge in CI.' },
      { q: 'Does MCP Fusion support Zero-Trust Attestation?', a: 'Yes. The server\'s behavioral surface is cryptographically digested and signed via HMAC-SHA256 at build time. During startup, the server verifies its signature. If the code was tampered with, the server refuses to boot.' },
      { q: 'How does mcp-fusion.lock work?', a: 'The lockfile captures every tool surface behavioral contract: action names, parameter schemas, Presenter fields, destructive flags, and middleware chains. CI diffs the lockfile on every PR — reviewers see exactly what changed in the capabilities.' },
    ]
  },

  // ═══════════════════════════════════════════════════════
  // OBSERVABILITY & TELEMETRY
  // ═══════════════════════════════════════════════════════

  'enterprise/observability.md': {
    title: 'Observability & Audit — MCP Fusion Enterprise',
    description: 'Structured debug events, OpenTelemetry tracing, and SOC 2-aligned audit logging for production MCP servers.',
    faqs: [
      { q: 'How do I add audit logging to mcp-fusion?', a: 'Use createDebugObserver() with a custom handler. It provides enterprise AI Agent Telemetry by emitting typed DebugEvent objects for route, validate, middleware, execute, error, and governance. This is the foundation for precise LLM Cost Attribution across autonomous operations.' },
      { q: 'Does mcp-fusion support OpenTelemetry?', a: 'Yes. Pass any FusionTracer-compatible object (including OpenTelemetry Tracer) to attachToServer via the tracing option. Each tool call creates a span with tool name, action, tags, duration, and semantic error classification.' },
      { q: 'How does mcp-fusion align with SOC 2?', a: 'Middleware pipelines provide logical access controls (CC6.1), contextFactory handles authentication (CC6.2), createDebugObserver provides access monitoring (CC6.3), Presenter schema enforces data boundaries (CC6.6), and enableTracing provides system monitoring (CC7.2).' },
      { q: 'Are observability events synchronous or asynchronous?', a: 'Debug events are synchronous and fully integrated into the pipeline to guarantee causality. However, you can freely implement asynchronous telemetry dispatchers in your observer implementation to avoid blocking the main thread.' },
      { q: 'Can I track which parameters the AI passed to a tool?', a: 'Yes. The `tool:start` and `execute` events capture the validated structured input arguments safely, enabling you to build precise analytics on AI intent and utilization over time.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // MULTI-TENANCY
  // ═══════════════════════════════════════════════════════
  'enterprise/multi-tenancy.md': {
    title: 'Multi-Tenancy — MCP Fusion Enterprise',
    description: 'Tenant isolation patterns using middleware, context derivation, Presenter rules, and tag-based tool filtering in MCP Fusion.',
    faqs: [
      { q: 'How does mcp-fusion implement multi-tenancy?', a: 'Through existing primitives: middleware resolves the tenant from caller identity, handlers filter queries by ctx.user.tenantId, dynamic Presenter rules adapt output per tenant plan, and tag-based filtering can expose different tool sets per deployment.' },
      { q: 'Can different tenants see different tools?', a: 'Yes. Tag tools by capability tier (e.g., core, enterprise) and use attachToServer filter to expose only the relevant tags per deployment. Filtered tools are invisible to the agent.' },
      { q: 'Is tenant isolation strictly enforced?', a: 'Yes. Because the context is strictly typed and built outside the LLM\'s control, relying on authentication/authorization tokens via `contextFactory`, the agent has zero ability to manipulate or circumvent tenant boundaries.' },
      { q: 'Can I use one MCP server process for multiple tenants concurrently?', a: 'Absolutely. MCP Fusion\'s execution pipeline is entirely stateless. Tenant identity flows exclusively through the immutable Context, making simultaneous requests from thousands of unique tenants perfectly safe in a single Node isolate.' },
      { q: 'How do I handle tenant-specific observability?', a: 'You can extract `ctx.user.tenantId` in your `createDebugObserver()` callback or OpenTelemetry spans, allowing you to partition logs, metrics, and API billing metrics programmatically per customer.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // PRESENTER
  // ═══════════════════════════════════════════════════════
  'presenter.md': {
    title: 'Presenter Engine — The MVA View Layer',
    description: 'Deep dive into mcp-fusion Presenters: schema validation, system rules, UI blocks (ECharts, Mermaid), cognitive guardrails, suggested actions, and composition via embed().',
    faqs: [
      { q: 'What are Presenters in mcp-fusion?', a: 'Presenters are the MVA View layer — domain-level objects created with createPresenter() that define how AI agents should perceive data. They include: Zod schema (validates and strips data), system rules (domain context for the AI), UI blocks (ECharts, Mermaid, summaries), cognitive guardrails (.agentLimit()), and suggested actions (HATEOAS affordances).' },
      { q: 'How do system rules work in Presenters?', a: 'System rules are domain-specific instructions that travel with the data. Example: "CRITICAL: amount_cents is in CENTS. Divide by 100 for display." Rules can be static strings or dynamic functions: .systemRules((data, ctx) => ctx.isAdmin ? ["Show all fields"] : ["Hide internal fields"]). They execute at response time and the result is embedded in the perception package.' },
      { q: 'What UI blocks can Presenters render?', a: 'Presenters support three UI block types: ui.echarts() for charts and gauges (Apache ECharts config), ui.mermaid() for diagrams and flowcharts (Mermaid syntax), and ui.summary() for collection statistics ({ total, showing, filtered }). These are server-rendered as structured data that MCP-compatible clients can display visually.' },
      { q: 'How does Presenter composition work with embed()?', a: 'Use .embed("fieldName", ChildPresenter) to nest Presenters. When an Order has a Customer, embed the CustomerPresenter: OrderPresenter.embed("customer", CustomerPresenter). Child Presenter rules, UI blocks, and suggested actions are automatically merged into the parent response. This enables DRY, composable perception architectures.' },
      { q: 'What is .agentLimit() and when should I use it?', a: '.agentLimit(n) truncates large datasets to n items and injects guidance for the AI to use filters. Use it on any Presenter that might return collections. Example: .agentLimit(50, { warningMessage: "Showing {shown} of {total}. Use filters." }). This prevents context DDoS, reduces token costs, and maintains accuracy.' },
      { q: 'How are Presenters different from serializers?', a: 'Serializers (like Rails ActiveModel::Serializer) only transform data shape. Presenters go far beyond serialization: they inject domain-specific system rules, render charts and diagrams, suggest next actions based on data state, enforce cognitive guardrails, and compose via embedding. The output is a structured perception package, not just transformed JSON.' },
      { q: 'Can I use Presenters with both defineTool() and createTool()?', a: 'Yes. Assign a Presenter to the "returns" property of any action config. With defineTool(): actions: { get: { returns: InvoicePresenter, handler: ... } }. With createTool(): .action({ name: "get", returns: InvoicePresenter, handler: ... }). Both work identically. The handler returns raw data and the Presenter wraps it.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // BUILDING TOOLS
  // ═══════════════════════════════════════════════════════
  'building-tools.md': {
    title: 'Building Tools — defineTool() and createTool()',
    description: 'Learn how to build MCP tools with mcp-fusion using defineTool() (JSON-first) or createTool() (full Zod). Action handlers, parameter validation, annotations, and more.',
    faqs: [
      { q: 'What is the difference between defineTool() and createTool()?', a: 'defineTool() is a JSON-first API — define parameters as plain strings like { id: "string" } without importing Zod. createTool() gives you full Zod power for complex schemas. Both produce identical GroupedToolBuilder instances that enforce Deterministic AI Tool Execution, helping you build Zero-Hallucination Agent Workflows.' },
      { q: 'How do I mark a tool action as destructive?', a: 'Set destructive: true on the action config: .action({ name: "delete", destructive: true, handler: ... }). This adds the MCP destructiveHint annotation, letting clients warn users before executing destructive operations. Similarly, use readOnly: true and idempotent: true for read and idempotent operations.' },
      { q: 'Can I share parameters across all actions in a tool?', a: 'Yes. Use commonSchema (createTool) or shared (defineTool) to define fields that are injected into every action\'s schema automatically. Example: shared: { workspace_id: "string" } makes workspace_id required for all actions in that tool. These are marked "(always required)" in auto-generated descriptions.' },
      { q: 'What tool annotations does mcp-fusion support?', a: 'mcp-fusion supports all standard MCP tool annotations: destructiveHint, readOnlyHint, idempotentHint, openWorldHint, and returnDirect. Set them per-action with destructive: true, readOnly: true, idempotent: true, or use .annotations() on the builder for tool-level annotations.' },
      { q: 'How do handlers return responses in mcp-fusion?', a: 'Handlers can return: success(data) for success, error(msg) for errors, toolError(code, opts) for self-healing errors, toonSuccess(data) for token-optimized responses, or raw data when using a Presenter (the Presenter wraps it automatically). Generator handlers can yield progress() events for streaming.' },
      { q: 'When should I use defineTool() vs createTool()?', a: 'Use defineTool() for simple CRUD tools, rapid prototyping, or when you want to avoid Zod imports. Use createTool() when you need complex Zod schemas with regex validation, transforms, refinements, discriminated unions, or custom error messages. Both have identical runtime behavior.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // ROUTING & GROUPS
  // ═══════════════════════════════════════════════════════
  'routing.md': {
    title: 'Routing & Groups — Action Consolidation',
    description: 'Consolidate thousands of operations behind a single MCP tool using hierarchical groups and discriminator-based routing. 10x fewer tokens.',
    faqs: [
      { q: 'How does action consolidation work in mcp-fusion?', a: 'Instead of registering 50 individual MCP tools, you register ONE tool with grouped actions. The LLM selects the operation via a discriminator field. This achieves ultimate Context Window Optimization because the LLM sees one tool definition instead of fifty, drastically reducing the cognitive load.' },
      { q: 'Can I nest groups within groups?', a: 'Yes. Groups support infinite nesting: defineTool("platform").group("users", g => { g.group("admin", g2 => { g2.action("reset", ...) }) }). The discriminator value becomes "users.admin.reset". This lets you organize 5,000+ operations into a clean hierarchy.' },
      { q: 'How does the discriminator field work?', a: 'The discriminator defaults to "action" and is an enum of all registered action keys. When the LLM calls the tool with { action: "users.list" }, mcp-fusion routes to the correct handler automatically. You can customize the discriminator name with .discriminator("command").' },
      { q: 'Why is action consolidation better for token usage?', a: 'Each registered MCP tool adds its full name, description, and parameter schema to the LLM system prompt. 50 tools can consume 5,000+ prompt tokens just for definitions. With consolidation, ONE tool with a discriminator enum uses ~500 tokens — a 10x reduction that saves money and improves LLM accuracy by reducing selection ambiguity.' },
      { q: 'Can I apply middleware to specific groups?', a: 'Yes. Group-scoped middleware only runs for that group\'s actions: .group("admin", g => { g.use(requireSuperAdmin).action("reset", handler) }). The requireSuperAdmin check only fires for admin.* actions, while other groups bypass it entirely.' },
      { q: 'Are actions() and groups() mutually exclusive?', a: 'Yes. A builder must use either flat actions (.action()) or hierarchical groups (.group()), never both on the same level. This is enforced at build time. Use flat actions for simple CRUD tools and groups for platform-level tools with multiple domains.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // MIDDLEWARE
  // ═══════════════════════════════════════════════════════
  'middleware.md': {
    title: 'Middleware — tRPC-style Context Derivation',
    description: 'Pre-compiled middleware chains with defineMiddleware() for authentication, authorization, database connections, and context injection.',
    faqs: [
      { q: 'How does middleware work in mcp-fusion?', a: 'Middleware establishes a Zero-Trust Architecture for AI Agents. It follows the next() pattern, allowing you to derive context, verify tokens, and sanitize inputs at the edge. By securing the perimeter before database handlers run, it guarantees Data Exfiltration Prevention. Middleware chains are pre-compiled at build time for zero runtime allocation.' },
      { q: 'What is defineMiddleware() and context derivation?', a: 'defineMiddleware() provides tRPC-style context derivation — it transforms the context by deriving new data. Example: defineMiddleware(async (ctx) => ({ ...ctx, db: await createDbConnection(ctx.tenantId) })). The derived context is automatically typed and available to all downstream handlers.' },
      { q: 'Can I apply middleware to specific groups only?', a: 'Yes. Group-scoped middleware only runs for that group\'s actions: .group("admin", g => { g.use(requireSuperAdmin).action("reset", ...) }). Other groups bypass it entirely.' },
      { q: 'What does pre-compiled middleware chains mean?', a: 'At build time (.buildToolDefinition()), mcp-fusion resolves and composes all middleware into a single function chain per action. At runtime, there is zero middleware resolution — the chain is already built. Even 10 stacked middleware layers add negligible latency.' },
      { q: 'Can middleware short-circuit a request?', a: 'Yes. Return an error response instead of calling next(): if (!ctx.user) return error("Unauthorized"). The handler never executes. This is how you implement authentication, authorization, rate limiting, and input validation as middleware.' },
      { q: 'How do I implement authentication middleware in mcp-fusion?', a: 'Create: const requireAuth = async (ctx, args, next) => { if (!ctx.user) return error("Unauthorized"); return next(); }. Apply globally with .use(requireAuth) or per-group for scoped auth. The middleware short-circuits before the handler if auth fails.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // ERROR HANDLING
  // ═══════════════════════════════════════════════════════
  'error-handling.md': {
    title: 'Error Handling — Self-Healing Errors',
    description: 'Structured error responses with toolError() that provide recovery hints, suggested retry arguments, and self-healing capabilities for AI agents.',
    faqs: [
      { q: 'What is toolError() in mcp-fusion?', a: 'toolError() creates structured error responses with machine-readable recovery hints. Instead of a plain "Not found" string, the AI receives: error code, message, recovery action ("list invoices to find the correct ID"), and suggested retry arguments. The AI self-corrects instead of giving up.' },
      { q: 'How do self-healing errors work in mcp-fusion?', a: 'When toolError() returns { recovery: { action: "list" }, suggestedArgs: { status: "pending" } }, the AI understands it should call the "list" action with those arguments to recover. This creates a self-healing loop where errors are automatically resolved without human intervention.' },
      { q: 'When should I use error() vs toolError()?', a: 'Use error("message") for simple, non-recoverable errors. Use toolError(code, options) when the AI can potentially recover — not found errors, validation failures, permission issues, or rate limits. toolError provides the structure the AI needs to self-correct.' },
      { q: 'What error codes should I use with toolError()?', a: 'Common codes: NOT_FOUND (entity missing), INVALID_INPUT (validation failure), UNAUTHORIZED (auth required), FORBIDDEN (permission denied), RATE_LIMITED (too many requests), CONFLICT (duplicate or stale data). The code is machine-readable and the message is human-readable.' },
      { q: 'Can toolError() include suggested retry arguments?', a: 'Yes. toolError supports suggestedArgs: { start_date: args.end_date, end_date: args.start_date }. The AI reads these and automatically retries with corrected values. For example, if dates are swapped, the error tells the AI exactly how to fix them without human intervention.' },
      { q: 'How does required() helper work for field validation?', a: 'required("field_name") is a shortcut for a missing field error. It returns error("Missing required field: field_name") with isError: true. Use it for quick validation: if (!args.id) return required("id").' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // FUSION CLIENT
  // ═══════════════════════════════════════════════════════
  'fusion-client.md': {
    title: 'FusionClient — Type-Safe tRPC-style Client',
    description: 'End-to-end type safety from server to client with createFusionClient(). Full autocomplete, compile-time error checking, and type inference.',
    faqs: [
      { q: 'What is FusionClient in mcp-fusion?', a: 'FusionClient provides tRPC-style end-to-end type safety for MCP tools. Created with createFusionClient<TRouter>(transport), it gives full autocomplete and compile-time checking. If you type a wrong action name or wrong argument type, TypeScript catches it before runtime.' },
      { q: 'How does FusionClient type inference work?', a: 'When you define a tool with defineTool() or createTool(), the action names and parameter schemas are captured as TypeScript types. createFusionClient infers these types, providing autocomplete for action names and type-checked arguments — all the way from server to client, zero code generation.' },
      { q: 'What is FusionTransport?', a: 'FusionTransport connects the client to the MCP server. It has one method: callTool(name, args) => Promise<ToolResponse>. Implement it with any transport: direct in-memory calls for testing, HTTP for remote servers, or stdio for local processes.' },
      { q: 'How does FusionClient compare to tRPC?', a: 'Like tRPC, FusionClient infers types end-to-end without code generation. Unlike tRPC, it works over the MCP protocol instead of HTTP. You get the same DX — autocomplete, type checking, refactoring safety — for AI tool calls instead of API routes.' },
      { q: 'Can FusionClient be used for testing?', a: 'Yes. Create a FusionTransport that calls builder.execute() directly in-memory. This gives type-safe, fast unit tests without starting an MCP server. TypeScript catches invalid action names and wrong argument types at compile time.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // STATE SYNC
  // ═══════════════════════════════════════════════════════
  'state-sync.md': {
    title: 'State Sync — Temporal Awareness for AI Agents',
    description: 'RFC 7234-inspired cache-control signals that prevent temporal blindness. cacheSignal() and invalidates() for cross-domain causal invalidation.',
    faqs: [
      { q: 'What is temporal blindness in AI agents?', a: 'Temporal blindness is when an AI agent uses stale data because it doesn\'t know when data was last fetched or when it became invalid. Without cache signals, an agent might display a 3-hour-old price as current. State sync in mcp-fusion solves this with RFC 7234-inspired cache-control metadata.' },
      { q: 'How does cacheSignal() work in mcp-fusion?', a: 'cacheSignal(data, { maxAge: 30, scope: "invoices" }) attaches cache-control metadata to responses. The AI knows data is fresh for 30 seconds. After maxAge, it should re-fetch. The scope identifies what domain the cache applies to.' },
      { q: 'What does invalidates() do in mcp-fusion?', a: 'invalidates(result, ["invoices", "billing"]) signals that a write operation has made those scopes stale. The AI discards cached data in those scopes and re-fetches on next access. This enables cross-domain causal invalidation.' },
      { q: 'What is cross-domain causal invalidation?', a: 'When creating an invoice also affects the customer balance, invalidates(result, ["invoices", "customers"]) signals both scopes as stale. The AI knows cached customer data is outdated because of the invoice creation — even though they are different domains.' },
      { q: 'Is state sync based on any standard?', a: 'Yes. Inspired by RFC 7234 (HTTP Caching). Uses familiar concepts: maxAge for freshness, scope for cache partitioning, and invalidation signals for write-through cache busting. Intuitive for backend engineers familiar with HTTP caching.' },
      { q: 'How does state sync reduce redundant API calls?', a: 'Without state sync, an AI agent re-fetches data every time, even seconds after the last fetch. With cacheSignal({ maxAge: 60 }), the agent knows data is fresh for 60 seconds and skips redundant calls, reducing API load and token costs.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // CONTEXT
  // ═══════════════════════════════════════════════════════
  'context.md': {
    title: 'State & Context — Context Management',
    description: 'Managing execution context in mcp-fusion with contextFactory, middleware-derived state, and tag-based session context.',
    faqs: [
      { q: 'How does context work in mcp-fusion?', a: 'Context is created by contextFactory when attaching to a server. Each tool call receives a fresh context. Middleware can derive additional state (database connections, auth info) using defineMiddleware(), and the enriched context flows to all handlers.' },
      { q: 'What is tag-based tool filtering?', a: 'Tags selectively expose tools per session. Tag tools with .tags("admin", "billing") and filter at attach time: filter: { tags: ["admin"] }. Only tools matching the filter are visible to the LLM. Enables role-based tool exposure without code changes.' },
      { q: 'What is contextFactory in mcp-fusion?', a: 'contextFactory is a function provided when calling registry.attachToServer(). It receives MCP request metadata and returns your application context: contextFactory: (extra) => ({ db: createDb(), user: decodeToken(extra) }).' },
      { q: 'Can I expose different tools to different users?', a: 'Yes, using tag filtering. Tag admin tools with .tags("admin"). At attach time, check the user\'s role: filter: { tags: [user.isAdmin ? "admin" : "user"] }. Each session only sees authorized tools.' },
      { q: 'How do I exclude specific tools from the LLM?', a: 'Use exclude filter: filter: { exclude: ["internal", "debug"] }. Tools tagged "internal" or "debug" are hidden from the LLM. Useful for development tools that shouldn\'t be exposed in production.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // EXAMPLES
  // ═══════════════════════════════════════════════════════
  'examples.md': {
    title: 'Cookbook & Examples — 14 Copy-Pasteable Patterns',
    description: 'Production-ready examples covering CRUD, nested groups, middleware chains, Presenter composition, streaming, error handling, and advanced patterns.',
    faqs: [
      { q: 'What examples are available in the mcp-fusion cookbook?', a: 'The cookbook includes 14 patterns: basic CRUD tools, nested group hierarchies, middleware chains, Presenter with system rules, UI blocks (ECharts, Mermaid), cognitive guardrails, self-healing errors, Presenter composition with embed(), streaming progress, FusionClient usage, tag filtering, state sync, TOON encoding, and observability setup.' },
      { q: 'Can I copy-paste mcp-fusion examples into my project?', a: 'Yes. Every example is designed to be copy-pasteable. They use real-world patterns (invoices, users, projects) with proper TypeScript types. Adjust the context type and database calls to match your application.' },
      { q: 'What real-world domains do the examples cover?', a: 'Examples use: invoice management (billing.get, billing.pay), user CRUD (users.list, users.create, users.ban), project management (projects.list, projects.archive), and platform administration (platform.users.admin.reset).' },
      { q: 'Are there streaming progress examples?', a: 'Yes. Generator handler: async function* handler() { yield progress(0.25, "Loading..."); const data = await db.query(); yield progress(0.75, "Processing..."); return success(data); }. The MCP client receives real-time progress updates.' },
      { q: 'Is there an example combining all features?', a: 'Yes. The complete platform example combines: hierarchical groups, middleware chains (auth + db), Presenters with system rules and UI blocks, cognitive guardrails, self-healing errors, tag filtering, and observability — all in one production-ready tool definition.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // RESULT MONAD
  // ═══════════════════════════════════════════════════════
  'result-monad.md': {
    title: 'Result Monad — Type-Safe Error Handling',
    description: 'Result<T> monad for composable, type-safe error handling with succeed() and fail(). Eliminate uncaught exceptions.',
    faqs: [
      { q: 'What is the Result monad in mcp-fusion?', a: 'Result<T> is a discriminated union type: Success<T> | Failure. Use succeed(value) for success and fail(response) for errors. Pattern match with if (!result.ok) return result.response; const value = result.value; Eliminates try/catch and makes errors explicit in the type system.' },
      { q: 'When should I use Result vs try/catch?', a: 'Use Result for expected errors (not found, validation failures, permission denied) — domain logic. Use try/catch for unexpected infrastructure errors (network, database). Result makes error paths explicit, composable, and visible in the type signature.' },
      { q: 'How does Result improve TypeScript type narrowing?', a: 'After checking if (!result.ok), TypeScript narrows to Failure. After the guard, result is narrowed to Success<T>, giving typed access to result.value without any type assertions or casts needed.' },
      { q: 'Can I chain multiple Result operations?', a: 'Yes. const idResult = parseId(args.id); if (!idResult.ok) return idResult.response; const user = await findUser(idResult.value); if (!user) return fail(error("User not found")); return success(user);. Each step is composable and type-safe.' },
      { q: 'How does fail() create a Failure?', a: 'fail(response) wraps a ToolResponse into a Failure: { ok: false, response }. The response is typically from error() or toolError(). When returned from a handler, the framework sends the error response to the MCP client.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // OBSERVABILITY
  // ═══════════════════════════════════════════════════════
  'observability.md': {
    title: 'Observability — Zero-Overhead Debug Observer',
    description: 'Runtime debugging with createDebugObserver(). Typed event system for tool:start, tool:end, tool:error, middleware events. Zero overhead when disabled.',
    faqs: [
      { q: 'How does observability work in mcp-fusion?', a: 'createDebugObserver() returns an observer that logs tool execution events: tool:start, tool:end, tool:error, middleware:start, middleware:end. Attach to the registry. When no observer is attached, zero runtime overhead — no logging calls, no event objects created.' },
      { q: 'Can I enable debugging per-tool?', a: 'Yes. Three levels: per-tool (on the builder), per-registry (on ToolRegistry), or per-server (on attachToServer). Per-tool debugging only traces that specific tool\'s execution, reducing noise.' },
      { q: 'What events does the debug observer emit?', a: 'Five events: tool:start (args + timestamp), tool:end (success + duration), tool:error (error details), middleware:start (chain began), middleware:end (chain completed). All include timestamps and metadata.' },
      { q: 'Is there performance overhead when observability is disabled?', a: 'Absolutely zero. No observer attached = no event objects, no logging calls, no timing measurements. The observer pattern ensures no production overhead unless explicitly enabled.' },
      { q: 'Can I build custom observers?', a: 'Yes. Implement handler functions for each event type. Send events to any destination: console, files, DataDog, Sentry, Prometheus, or custom dashboards. The interface is fully typed.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // TRACING
  // ═══════════════════════════════════════════════════════
  'tracing.md': {
    title: 'Tracing — OpenTelemetry-Compatible Spans for MCP Tools',
    description: 'Production-grade tracing for AI-native MCP servers. Enterprise error classification, zero dependencies, zero overhead when disabled. Structural subtyping — works with any OTel tracer.',
    faqs: [
      { q: 'How does tracing work in mcp-fusion?', a: 'mcp-fusion creates one OpenTelemetry-compatible span per tool call with rich semantic attributes: tool name, action, duration, error type, response size, and tags. Uses structural subtyping (FusionTracer/FusionSpan interfaces) — pass trace.getTracer() from @opentelemetry/api directly. Zero overhead when no tracer is set.' },
      { q: 'What is enterprise error classification in mcp-fusion tracing?', a: 'mcp-fusion distinguishes AI errors from system errors. AI mistakes (invalid args, wrong action) get SpanStatusCode.UNSET — no PagerDuty alert. System failures (database crash, uncaught exceptions) get SpanStatusCode.ERROR with recordException() — triggers ops alerts. This prevents alert fatigue from expected AI behavior.' },
      { q: 'Does mcp-fusion tracing require @opentelemetry/api as a dependency?', a: 'No. mcp-fusion uses structural subtyping — FusionTracer and FusionSpan are interfaces that match the real OpenTelemetry types. Any object with startSpan(), setAttribute(), setStatus(), and end() methods works. The real @opentelemetry/api tracer satisfies these interfaces automatically.' },
      { q: 'What span attributes does mcp-fusion create?', a: 'Core attributes: mcp.system, mcp.tool, mcp.action, mcp.durationMs, mcp.isError, mcp.error_type. Enterprise metadata: mcp.tags (tool tags for dashboard filtering), mcp.description (tool context), mcp.response_size (billing/quota tracking). Events: mcp.route, mcp.validate, mcp.middleware.' },
      { q: 'How do I enable tracing for all tools at once?', a: 'Three options: (1) Per-tool: tool.tracing(tracer). (2) Registry-level: registry.enableTracing(tracer). (3) Server attachment: registry.attachToServer(server, { tracing: tracer }). Option 3 is recommended for production — one line enables tracing for all registered tools.' },
      { q: 'Can mcp-fusion tracing and debug coexist?', a: 'Both can be enabled, but tracing takes precedence — debug events are not emitted when tracing is active. A symmetric console.warn is emitted regardless of which is enabled first. This prevents duplicate overhead while keeping users informed.' },
      { q: 'How does mcp-fusion handle handler exceptions with tracing?', a: 'When a handler throws, the span records SpanStatusCode.ERROR + recordException(), and the method returns a graceful error response instead of re-throwing. This ensures ops alerting via spans while preventing MCP server crashes. The exception is properly classified as system_error.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // API REFERENCE
  // ═══════════════════════════════════════════════════════
  'api-reference.md': {
    title: 'API Reference — Complete mcp-fusion API',
    description: 'Complete API reference for mcp-fusion: builders, registry, presenters, response helpers, middleware, FusionClient, result monad, streaming, and domain models.',
    faqs: [
      { q: 'What are the main exports of mcp-fusion?', a: 'Main exports: createTool(), defineTool(), createPresenter(), ToolRegistry, createFusionClient(), success(), error(), toolError(), toonSuccess(), defineMiddleware(), progress(), succeed(), fail(), ResponseBuilder, ui helpers (ui.echarts, ui.mermaid, ui.summary), cacheSignal(), invalidates(), and createDebugObserver().' },
      { q: 'What TypeScript version is required for mcp-fusion?', a: 'TypeScript >= 5.7 for full type inference support, especially FusionClient and builder APIs. Node.js >= 18 is required as the runtime.' },
      { q: 'What is the ToolResponse type?', a: 'Standard MCP response: { content: [{ type: "text", text: string }], isError?: boolean }. All response helpers (success, error, toolError, toonSuccess) return this type. Presenters also produce ToolResponse objects.' },
      { q: 'How many builder methods are available?', a: 'GroupedToolBuilder provides 15+ methods: .description(), .commonSchema(), .discriminator(), .tags(), .annotations(), .toonDescription(), .use(), .action(), .group(), .buildToolDefinition(), .execute(), .previewPrompt(), .getName(), .getTags(), .getActionNames(), .getActionMetadata().' },
      { q: 'What domain model classes exist in mcp-fusion?', a: 'Domain models: BaseModel (abstract base), GroupItem (leaf with parent), Group (tree node), Tool (schemas + annotations), Resource (uri + mime), Prompt (arguments), PromptArgument (required flag). Used internally and available for custom extensions.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // ARCHITECTURE
  // ═══════════════════════════════════════════════════════
  'architecture.md': {
    title: 'Architecture — How mcp-fusion Works Internally',
    description: 'Internal architecture of mcp-fusion: execution pipeline, pre-compiled middleware chains, Zod schema merging, discriminator routing, and Presenter composition.',
    faqs: [
      { q: 'How does the mcp-fusion execution pipeline work?', a: 'When a tool call arrives: (1) discriminator routes to correct action, (2) Zod validates and strips input, (3) pre-compiled middleware chain executes, (4) handler runs and returns raw data, (5) Presenter wraps data with rules/UI/affordances, (6) structured response is returned to the MCP client.' },
      { q: 'What does pre-compiled middleware chains mean?', a: 'At build time (.buildToolDefinition()), mcp-fusion resolves and composes all middleware into a single function chain per action. At runtime, zero middleware resolution is needed — the chain is already built, making even complex stacks add negligible latency.' },
      { q: 'How does Zod schema merging work?', a: 'Each action has its own schema. At build time, mcp-fusion merges the commonSchema with each action\'s schema using Zod .merge().strip(). The merged schema validates input AND strips unknown fields — providing both validation and security in a single pass.' },
      { q: 'What happens when an action has a Presenter?', a: 'After the handler returns raw data, the ExecutionPipeline passes it through the Presenter. The Presenter validates against its schema (stripping undeclared fields), executes system rule functions, generates UI blocks, evaluates suggested actions, and composes the final structured perception package.' },
      { q: 'How does freeze-after-build ensure immutability?', a: 'After .buildToolDefinition(), the entire builder state is frozen with Object.freeze(). Tool definitions, schemas, middleware chains, and action configs become immutable. Any attempt to modify them throws a TypeError. This guarantees deterministic behavior.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // SCALING
  // ═══════════════════════════════════════════════════════
  'scaling.md': {
    title: 'Scaling & Optimization — Performance at Scale',
    description: 'Performance optimization patterns for mcp-fusion: TOON encoding, agent limits, tag filtering, middleware pre-compilation, and freeze-after-build immutability.',
    faqs: [
      { q: 'What is TOON encoding in mcp-fusion?', a: 'TOON (Token-Oriented Object Notation) is a compact serialization that reduces token count by ~40% vs standard JSON. Use toonSuccess(data) instead of success(data). Strips quotes, uses shorthand, minimizes whitespace while remaining LLM-parseable.' },
      { q: 'How does freeze-after-build work?', a: 'After .buildToolDefinition(), the builder is frozen with Object.freeze(). No further modifications possible. Prevents accidental mutation of tool definitions at runtime, ensuring deterministic behavior.' },
      { q: 'How does .agentLimit() reduce costs?', a: 'Without limits, 10,000 rows at ~500 tokens each costs ~$2.40 per call. With .agentLimit(50), capped at 50 rows (~$0.02) plus filter guidance. 100x cost reduction per call.' },
      { q: 'When should I use tag filtering for performance?', a: 'When you have many tools but only a subset is relevant per session. Each tool definition consumes prompt tokens. Filtering to relevant tags reduces prompt size and improves LLM accuracy on tool selection.' },
      { q: 'How do pre-compiled middleware chains improve performance?', a: 'Traditional middleware resolves the chain at every request. mcp-fusion compiles once at build time. For 5 middleware functions, eliminates 5 function lookups per request — operations that add up at thousands of requests per second.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // PERFORMANCE
  // ═══════════════════════════════════════════════════════
  'performance.md': {
    title: 'Performance — Zero-Cost Abstractions for MCP Servers',
    description: 'Deep dive into mcp-fusion performance: pre-compiled middleware chains, O(1) action routing, zero-overhead observability, railway-oriented pipelines, TOON compression, and bounded caching.',
    faqs: [
      { q: 'How does mcp-fusion pre-compile middleware chains?', a: 'At build time, MiddlewareCompiler wraps all middleware right-to-left around each handler, producing a single ready-to-call function per action. At runtime, calling an action with 10 stacked middleware layers is a single function call — zero chain assembly, zero closure allocation per request.' },
      { q: 'What is zero-overhead observability in mcp-fusion?', a: 'When no debug observer is attached, the entire execution pipeline runs via a fast path with ZERO conditionals, no Date.now(), no performance.now(), and no object allocations. The debug path only activates when explicitly enabled via createDebugObserver().' },
      { q: 'How does mcp-fusion achieve O(1) action routing?', a: 'Action resolution uses a Map<string, InternalAction> built at compile time. When the LLM sends { action: "users.list" }, the pipeline resolves the handler with a single Map.get() call — O(1) regardless of how many actions are registered.' },
      { q: 'What is the railway-oriented execution pipeline?', a: 'The ExecutionPipeline uses a Result<T> monad (Success<T> | Failure) for zero-exception error handling. Each step returns Result<T>. On failure, the pipeline short-circuits immediately with a typed Failure — no exception throw, no stack unwinding, no try/catch overhead.' },
      { q: 'How does TOON encoding improve performance?', a: 'TOON (Token-Oriented Object Notation) reduces description token count by 30-50% and response payload by ~40% compared to JSON. Uses pipe-delimited tabular format where column headers appear once, eliminating JSON key repetition per row.' },
      { q: 'How does mcp-fusion handle large datasets efficiently?', a: 'Presenter agentLimit() truncates large collections BEFORE Zod validation and serialization. A 10,000-row dataset capped at 50 items reduces token costs from ~$150 to ~$0.75 per request — a 200x reduction. The truncation happens before any expensive processing.' },
      { q: 'What caching strategies does mcp-fusion use?', a: 'Multiple caching layers: validation schema cache (build-time), policy resolution cache (bounded to 2048 entries with full eviction), pre-frozen shared policy objects, tool description decoration cache, and cached buildToolDefinition() results. All caches use Map for O(1) access.' },
      { q: 'Why does mcp-fusion use pure-function modules?', a: 'Ten critical modules are pure functions with no state and no side effects: MiddlewareCompiler, ExecutionPipeline, ToolFilterEngine, GlobMatcher, and more. V8 can inline and optimize them aggressively, with no garbage collection pressure from instance allocation.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // MIGRATION
  // ═══════════════════════════════════════════════════════
  'migration.md': {
    title: 'Migration Guide — Moving to mcp-fusion',
    description: 'Step-by-step guide for migrating existing MCP servers to mcp-fusion. Incremental adoption, side-by-side running, and gradual Presenter introduction.',
    faqs: [
      { q: 'Can I migrate to mcp-fusion incrementally?', a: 'Yes. mcp-fusion works alongside existing MCP handlers. Start by wrapping one tool with defineTool(), register it alongside your existing switch/case handler. Migrate tools one at a time. No big-bang migration required.' },
      { q: 'Will mcp-fusion break my existing MCP clients?', a: 'No. mcp-fusion produces standard MCP responses. Existing clients see the same { content: [{ type: "text", text: "..." }] } format. The structured perception package is encoded within the text field.' },
      { q: 'What is the recommended migration order?', a: '(1) Install mcp-fusion. (2) Convert one simple tool to defineTool(). (3) Add Presenters to tools that return data. (4) Add middleware for auth/logging. (5) Consolidate related tools into groups. (6) Add state sync and observability. Each step is independent.' },
      { q: 'Do I need to rewrite my business logic?', a: 'No. Your handlers keep the same logic. They just move from switch/case blocks into action handlers. Inputs and outputs remain the same — mcp-fusion wraps them with validation, routing, and Presenters automatically.' },
      { q: 'Can mcp-fusion and raw handlers coexist?', a: 'Yes. Register mcp-fusion tools with registry.attachToServer() and keep existing setRequestHandler() for raw tools. Both run on the same MCP server. Migrate at your own pace.' },
    ],
  },

  'testing.md': {
    title: 'Testing — Deterministic AI Governance Auditing',
    description: 'The end of Vibes-Based Testing. FusionTester audits every MVA layer in CI/CD — zero tokens, zero servers, mathematically verifiable. SOC2 compliance for AI pipelines.',
    faqs: [
      { q: 'What is Vibes-Based Testing in AI?', a: 'Vibes-Based Testing is when a developer starts a Node.js server, opens Claude Desktop, types a prompt, waits for the AI to respond, and visually checks the output. This is subjective, non-repeatable, and impossible to put in a CI/CD pipeline. MCP Fusion eliminates this with the FusionTester — deterministic, in-memory pipeline auditing with zero tokens consumed.' },
      { q: 'What is the FusionTester in MCP Fusion?', a: 'FusionTester is the testing framework for MCP Fusion. It runs the real MVA execution pipeline (Zod Validation → Middleware → Handler → Presenter → Egress Firewall) entirely in memory. It returns structured MvaTestResult objects with decomposed data, systemRules, uiBlocks, isError, and rawResponse fields — each assertable independently.' },
      { q: 'How does FusionTester achieve zero token cost?', a: 'FusionTester calls ToolRegistry.routeCall() directly in RAM — the same code path as production but without any MCP transport, server, or LLM API call. Tests execute in ~2ms each with zero API tokens consumed. No OPENAI_API_KEY or ANTHROPIC_API_KEY required in CI.' },
      { q: 'How does FusionTester prove SOC2 compliance?', a: 'FusionTester provides mathematically verifiable assertions: result.data physically lacks passwordHash (SOC2 CC6.1), result.isError is true when role is GUEST (SOC2 CC6.3), result.systemRules contains expected governance directives. These are deterministic — same input produces same output in every CI run.' },
      { q: 'What is the Symbol Backdoor in FusionTester?', a: 'ResponseBuilder.build() attaches structured MVA metadata (data, systemRules, uiBlocks) to the ToolResponse via a global Symbol (MVA_META_SYMBOL). Symbols are ignored by JSON.stringify, so the MCP transport never sees them. FusionTester reads them in memory for structured assertions — no XML parsing, no string regex.' },
      { q: 'Can FusionTester run in GitHub Actions CI/CD?', a: 'Yes. FusionTester has zero external dependencies — no LLM API, no database, no server. Run npx vitest run in any CI/CD pipeline (GitHub Actions, GitLab CI, Azure Pipelines). Tests complete in milliseconds with zero flakiness from API outages or model variance.' },
    ],
  },

  'testing/quickstart.md': {
    title: 'Testing Quick Start — First Test in 5 Minutes',
    description: 'Build your first FusionTester in 5 minutes. Step-by-step from install to first passing SOC2 governance assertion with zero servers and zero tokens.',
    faqs: [
      { q: 'How do I install the MCP Fusion testing package?', a: 'npm install @vinkius-core/mcp-fusion-testing. Zero runtime dependencies. Only peer dependencies on @vinkius-core/mcp-fusion and zod. Works with any test runner: Vitest, Jest, Mocha, or Node\'s native node:test.' },
      { q: 'How do I create a FusionTester?', a: 'Use createFusionTester(registry, { contextFactory: () => ({ prisma: mockPrisma, tenantId: "t_42", role: "ADMIN" }) }). The contextFactory produces mock context for every test call. It supports async factories for JWT resolution or database lookups.' },
      { q: 'How do I call a tool action in tests?', a: 'await tester.callAction("db_user", "find_many", { take: 5 }). Returns an MvaTestResult with data, systemRules, uiBlocks, isError, and rawResponse. The FusionTester injects the action discriminator automatically.' },
      { q: 'How do I override context per test?', a: 'Pass a fourth argument: await tester.callAction("db_user", "find_many", { take: 5 }, { role: "GUEST" }). Shallow-merged with contextFactory output. Does not mutate the original context.' },
      { q: 'Is FusionTester officially supported by Vinkius Labs?', a: 'Yes, FusionTester is an official, first-party testing utility from Vinkius Labs designed specifically to audit the MVA architecture deterministically in CI/CD without relying on LLM vibes.' },
    ],
  },

  'testing/command-line.md': {
    title: 'Command-Line Runner — CLI Reference for FusionTester',
    description: 'Run, filter, watch, and report MCP Fusion governance tests. Complete CLI reference for Vitest, Jest, and Node\'s native test runner.',
    faqs: [
      { q: 'How do I run all FusionTester tests?', a: 'npx vitest run. For verbose output: npx vitest run --reporter=verbose. For specific directories: npx vitest run tests/firewall/ (Egress Firewall only) or npx vitest run tests/guards/ (Middleware Guards only).' },
      { q: 'How do I filter tests by name?', a: 'npx vitest run -t "passwordHash" runs only tests containing "passwordHash". Combine with directory: npx vitest run tests/firewall/ -t "strip" for precise targeting.' },
      { q: 'How do I generate coverage reports?', a: 'npx vitest run --coverage. For specific reporters: npx vitest run --coverage --coverage.reporter=text --coverage.reporter=html. Coverage maps directly to your MVA source files.' },
      { q: 'How do I use watch mode?', a: 'npx vitest watch re-runs affected tests when source files change. npx vitest watch tests/firewall/ watches only firewall tests. Essential during Presenter development.' },
      { q: 'Do I need special CLI flags to run FusionTester in CI?', a: 'No, FusionTester runs entirely in-memory and consumes zero tokens, so you merely run `npx vitest run` directly in your GitHub Actions or GitLab CI yaml without mocking network requests.' },
    ],
  },

  'testing/fixtures.md': {
    title: 'Fixtures — Test Setup & Context for FusionTester',
    description: 'Shared context via setup.ts, per-test overrides, async factories, context isolation, and multiple tester instances for MCP Fusion governance testing.',
    faqs: [
      { q: 'What is the setup.ts pattern in FusionTester?', a: 'Create tests/setup.ts with a shared FusionTester instance using createFusionTester(). All test files import { tester } from "../setup.js". Centralizes mock data and context configuration.' },
      { q: 'How does context isolation work in FusionTester?', a: 'Context overrides via callAction\'s 4th argument are shallow-merged per call and never persist. call({ role: "GUEST" }) does not affect the next call. The original context object is never mutated.' },
      { q: 'Can I have multiple FusionTester instances?', a: 'Yes. Create adminTester with role ADMIN and guestTester with role GUEST for fundamentally different configurations. Use overrideContext for per-test variations within the same instance.' },
      { q: 'Do fixtures slow down test execution?', a: 'No, because FusionTester skips network IO entirely. The setup and execution remain CPU-bound, consistently executing full MVA pipelines in ~2 milliseconds per test.' },
      { q: 'Should I mock the database in my fixtures?', a: 'Yes. MVA logic happens in the Presenter and Middleware. Mocking your data layer (like Prisma) in fixtures ensures your specs assert governance rules, not database connectivity.' },
    ],
  },

  'testing/assertions.md': {
    title: 'Assertions Reference — Every MvaTestResult Pattern',
    description: 'Complete assertion reference for FusionTester: data field absence/presence, systemRules content, uiBlocks verification, isError checks, rawResponse inspection, and composite SOC2 audit patterns.',
    faqs: [
      { q: 'How do I assert PII was stripped from data?', a: 'expect(result.data).not.toHaveProperty("passwordHash"). The field is physically absent from the result.data object — not hidden, not masked, but removed by the Presenter\'s Zod schema.' },
      { q: 'How do I assert correct system rules?', a: 'expect(result.systemRules).toContain("Email addresses are PII."). For rule absence: expect(result.systemRules).not.toContain("Order totals include tax."). For count: expect(result.systemRules).toHaveLength(3).' },
      { q: 'How do I write a composite SOC2 audit assertion?', a: 'Assert multiple layers in one test: check result.isError is false, verify PII fields are absent from result.data, confirm governance rules in result.systemRules, and verify JSON.stringify(result.rawResponse) contains no sensitive data.' },
      { q: 'How do I assert a UI block was rendered?', a: 'Use `expect(result.uiBlocks[0].type).toBe("echarts")` or assert the presence of specific ECharts configuration attributes to confidently verify the Presenter attached the correct visualization.' },
      { q: 'Does FusionTester validate raw string outputs?', a: 'No. The true power of FusionTester is that it bypasses string regex assertions. Ensure your tests assert the strictly typed MvaTestResult properties instead of raw standard output.' },
    ],
  },

  'testing/test-doubles.md': {
    title: 'Test Doubles — Mocking Context for FusionTester',
    description: 'Mock Prisma, HTTP clients, cache layers, and external services. Use Vitest spies to verify database interactions. Error-throwing and conditional mocks.',
    faqs: [
      { q: 'What gets mocked in FusionTester tests?', a: 'Only the context. FusionTester runs the real pipeline (Zod, middleware, handler, Presenter). You mock the dependencies your handlers call: prisma, HTTP clients, cache layers, and external services.' },
      { q: 'How do I use Vitest spies with FusionTester?', a: 'const findManyFn = vi.fn(async () => [...]). Pass in contextFactory. After calling tester.callAction(), assert: expect(findManyFn).toHaveBeenCalledOnce(). Verify that invalid inputs never reach the database: expect(findManyFn).not.toHaveBeenCalled().' },
      { q: 'How do I test database error handling?', a: 'Create a mock that throws: user: { findMany: async () => { throw new Error("Connection refused") } }. Create a separate FusionTester with this mock. Assert result.isError is true — proving graceful degradation.' },
      { q: 'Should I mock Presenters?', a: 'Never. The primary benefit of FusionTester is auditing what the Presenter does to the raw data returning from your handlers. Mocking the Presenter defeats the purpose of MVA governance testing.' },
      { q: 'Can I inject different mocks per test?', a: 'Yes, using the overrideContext parameter in `.callAction(group, action, args, contextOverride)`. It dynamically injects localized test doubles just for that specific pipeline execution.' },
    ],
  },

  'testing/egress-firewall.md': {
    title: 'Egress Firewall Testing — SOC2 CC6.1 PII Stripping',
    description: 'Prove mathematically that passwordHash, tenantId, and internal fields never reach the LLM. Deterministic Egress Firewall auditing for SOC2 compliance.',
    faqs: [
      { q: 'How does the Egress Firewall work in MCP Fusion?', a: 'The Presenter\'s Zod schema acts as a physical barrier. Fields not declared in the schema are stripped in RAM — they never exist in the response. JSON.stringify cannot leak what doesn\'t exist.' },
      { q: 'How do I test PII stripping?', a: 'const result = await tester.callAction("db_user", "find_many", { take: 5 }). For each user in result.data: expect(user).not.toHaveProperty("passwordHash"). The field is physically absent, not masked.' },
      { q: 'How does this map to SOC2 compliance?', a: 'SOC2 CC6.1 (Logical Access): passwordHash absent. CC6.7 (Output Controls): only declared schema fields exist. CC7.2 (Monitoring): deterministic, reproducible in CI/CD. All provable via FusionTester assertions.' },
      { q: 'Does the parser throw an error if an unknown field is returned?', a: 'No. By default, MCP Fusion utilizes the `.strip()` method of Zod object schemas. It silently ignores and drops the unknown fields, creating a bulletproof, non-disruptive egress firewall.' },
      { q: 'How can I ensure my egress firewall works for nested objects?', a: 'You can test it mathematically: `expect(result.data.profile).not.toHaveProperty("socialSecurityNumber")`. MVA parses the entire deep object structure during egress validation.' },
    ],
  },

  'testing/system-rules.md': {
    title: 'System Rules Testing — LLM Governance Directives',
    description: 'Verify that the LLM receives deterministic domain rules. Test static rules, contextual rules, manual builder rules, and Context Tree-Shaking.',
    faqs: [
      { q: 'What are System Rules in MCP Fusion?', a: 'System Rules are JIT (Just-In-Time) domain directives injected by the Presenter into the LLM context. They replace bloated global system prompts with per-response, per-entity governance. The LLM only receives rules relevant to the data it\'s currently looking at.' },
      { q: 'How do I test contextual (dynamic) rules?', a: 'Contextual rules are functions receiving data and context. Test with different context overrides: callAction("analytics", "list", { limit: 5 }, { role: "ADMIN" }) should include "User is ADMIN. Show full details." while { role: "VIEWER" } should exclude it.' },
      { q: 'What is Context Tree-Shaking?', a: 'The principle that User rules should NOT appear in Order responses and vice versa. Test by asserting: expect(orderResult.systemRules).not.toContain("Email addresses are PII."). Proves the LLM only sees relevant governance.' },
      { q: 'Can I write assertions for the absence of specific rules?', a: 'Yes. Use `expect(result.systemRules).not.toContain("Secret Admin Command")` to verify that unprivileged test calls successfully drop specialized governance rules from the MVA packet.' },
      { q: 'Do system rules survive the FusionTester extraction?', a: 'Yes! They are extracted perfectly via the MVA Symbol backdoor interceptor, allowing you to explicitly count, match, and verify every single string the LLM would have seen.' },
    ],
  },

  'testing/ui-blocks.md': {
    title: 'UI Blocks Testing — SSR Components & Truncation',
    description: 'Assert per-item blocks, collection blocks, agent limit truncation warnings, and empty blocks for raw tools.',
    faqs: [
      { q: 'What are UI Blocks in MCP Fusion?', a: 'UI Blocks are server-side rendered components generated by the Presenter for the client: charts, summaries, markdown tables, and truncation warnings. They govern the client experience — what the user sees.' },
      { q: 'How do I test agent limit truncation?', a: 'When the handler returns more items than agentLimit allows, assert: result.data.length should equal the limit, and result.uiBlocks should contain a truncation warning with "Truncated" or "hidden".' },
      { q: 'Can I test ECharts configuration specifically?', a: 'Yes. The `uiBlocks` array inside `MvaTestResult` preserves the full structured JSON of your ECharts block. You can `expect(block.config.series[0].type).toBe("bar")`.' },
      { q: 'How does FusionTester handle Mermaid blocks?', a: 'The `.mermaid` UI block exposes the raw render string. You can use standard string assertions: `expect(block.text).toContain("graph TD")`.' },
      { q: 'Do I need a real UI to test these blocks?', a: 'No. UI Blocks are rendered server-side as JSON configuration. FusionTester captures this JSON securely without mounting an external DOM or browser.' },
    ],
  },

  'testing/middleware-guards.md': {
    title: 'Middleware Guards Testing — RBAC & Access Control',
    description: 'Test role-based access control, multi-tenant isolation, context isolation between tests, and middleware coverage across all actions.',
    faqs: [
      { q: 'How do I test RBAC with FusionTester?', a: 'Use context overrides: callAction("db_user", "find_many", { take: 5 }, { role: "GUEST" }). Assert result.isError is true and result.data contains "Unauthorized". For ADMIN: result.isError should be false.' },
      { q: 'How do I test middleware coverage across all actions?', a: 'Loop through all actions: for (const action of ["find_many", "create", "update", "delete"]) { const result = await tester.callAction("db_user", action, {}, { role: "GUEST" }); expect(result.isError).toBe(true); }' },
      { q: 'Does FusionTester trigger middleware chains properly?', a: 'Yes. It invokes the exact same pre-compiled middleware functions as production, capturing errors injected by authentication logic instantly.' },
      { q: 'How do I assert a specific HTTP status code equivalent?', a: 'Middleware guards often return `toolError("UNAUTHORIZED")`. You can test this by asserting `expect(result.rawResponse._meta.code).toBe("UNAUTHORIZED")`.' },
      { q: 'Should I test successful auth passages too?', a: 'Absolutely. Test both the rejection case (`role: "GUEST"`) and the subsequent passage case (`role: "ADMIN"`) to ensure the guard behaves monotonically.' },
    ],
  },

  'testing/oom-guard.md': {
    title: 'OOM Guard Testing — Input Boundaries & Agent Limits',
    description: 'Validate Zod input boundaries (min, max, type safety), email validation, and agent limit truncation to prevent memory exhaustion and context overflow.',
    faqs: [
      { q: 'How do I test Zod input boundaries?', a: 'Assert rejection for out-of-bounds input: callAction("db_user", "find_many", { take: 10000 }) → isError true. For boundary acceptance: take: 1 and take: 50 should both return isError false.' },
      { q: 'How do I test type safety?', a: 'Assert rejection for wrong types: take: 3.14 (non-integer), take: "fifty" (string instead of number), and {} (missing required fields) should all return isError true — Zod rejects before the handler runs.' },
      { q: 'Does FusionTester validate inputs with Zod?', a: 'Yes. The `callAction()` method precisely mocks the MCP router passing exactly through the Zod `.parse()` pipeline before allocating any execution cycle to your business logic.' },
      { q: 'How do I test context window truncation boundaries?', a: 'Create a test mock that returns 1000 records. Execute the test and `expect(result.data.length).toBe(50)`. You just mathematically audited your LLM OOM boundaries.' },
      { q: 'How are validation errors represented in the test result?', a: 'Zod failures gracefully short-circuit the pipeline, returning an `isError: true` state alongside formatted field-level complaints in `rawResponse`, which you can explicitly assert.' },
    ],
  },

  'testing/error-handling.md': {
    title: 'Error Handling Testing — Pipeline Failures & Recovery',
    description: 'Assert isError for unknown tools/actions, handler errors, empty MVA layers on error, error message content, and error vs exception distinction.',
    faqs: [
      { q: 'What is the difference between error and exception in FusionTester?', a: 'isError: true means the pipeline handled the error gracefully and returned a structured MvaTestResult. An unhandled exception would throw — the FusionTester converts most exceptions into isError results.' },
      { q: 'How do I verify empty MVA layers on error?', a: 'When isError is true, assert: result.systemRules should equal [] and result.uiBlocks should equal []. This proves no partial data leaks on error paths.' },
      { q: 'Can I test self-healing resolution loops?', a: 'Yes. If your handler returns `toolError()`, you can `expect(result.rawResponse._meta.suggestedArgs)` to strictly equal your designated self-healing hints.' },
      { q: 'Does an isError true response trigger a NodeJS stack trace?', a: 'No. `isError: true` signifies a successfully handled semantic rejection (e.g. Unauthorized). The test passes successfully if you expect the rejection.' },
      { q: 'How do I test fatal pipeline panics?', a: 'Wrap the `tester.callAction()` in a `try/catch` or use `expect(tester.callAction(...)).rejects.toThrow()` if testing simulated internal infrastructure crashes.' },
    ],
  },

  'testing/raw-response.md': {
    title: 'Raw Response Testing — MCP Protocol Inspection',
    description: 'Protocol-level MCP transport inspection. Verify content block structure, Symbol invisibility, XML formatting, and concurrent response isolation.',
    faqs: [
      { q: 'How do I verify Symbol invisibility?', a: 'JSON.stringify(result.rawResponse) should NOT contain "mva-meta", "systemRules", or "passwordHash". But (result.rawResponse as any)[MVA_META_SYMBOL] should be defined. This proves the Symbol Backdoor works correctly.' },
      { q: 'How do I inspect MCP content blocks?', a: 'Cast rawResponse to { content: Array<{ type: string; text: string }> }. Assert content[0].type is "text". Check for "<data>" and "<system_rules>" blocks in content text.' },
      { q: 'Is the rawResponse identical to real MCP traffic?', a: 'Yes. The `rawResponse` strictly matches the output schema enforced by the `@modelcontextprotocol/sdk`, guaranteeing identical wire representation.' },
      { q: 'Can I test MCP tool metadata responses?', a: 'Because FusionTester bypasses the JSON-RPC lifecycle, tool list generation is implicitly defined. To test metadata formatting, utilize unit tests directed securely against your Builders.' },
      { q: 'When should I inspect the rawResponse?', a: 'Almost never! You should write 99% of your tests against `result.data` and `result.systemRules` and `result.isError` since they represent decoupled conceptual domains.' },
    ],
  },

  'testing/ci-cd.md': {
    title: 'CI/CD Integration — Governance in Every Pull Request',
    description: 'GitHub Actions, GitLab CI, Azure DevOps, and pre-commit hooks. Separate CI jobs per SOC2 control. Zero tokens, zero API keys, zero flakiness.',
    faqs: [
      { q: 'How do I add FusionTester to GitHub Actions?', a: 'Add a workflow with: actions/checkout, actions/setup-node (node 20), npm ci, npx vitest run --reporter=verbose. No API keys needed. No external services. Tests run in ~500ms total.' },
      { q: 'Can I have separate CI jobs per SOC2 control?', a: 'Yes. Create separate jobs for tests/firewall/ (CC6.1), tests/guards/ (CC6.3), tests/rules/ (Context Governance), and tests/blocks/ (Response Quality). Each shows as a separate check mark on the PR.' },
      { q: 'How do I block PRs that break governance?', a: 'In GitHub Settings → Branch protection, require the governance audit status checks to pass before merging. No PR can merge if PII leaks or auth gates are broken.' },
      { q: 'Are these tests fast enough for pre-commit hooks?', a: 'Absolutely. Because everything is synchronous and in-memory, you can securely enforce strict SOC2 validations directly in Husky pre-commit hooks executing under two seconds.' },
      { q: 'Do I need mock servers for FusionTester CI jobs?', a: 'No Docker, no mock APIs, and no local stack. The Action Handler receives fully verified inputs without opening ANY network ports.' },
    ],
  },

  'testing/convention.md': {
    title: 'Testing Convention — Folder Structure & File Naming',
    description: 'The tests/ layer in the MVA convention. Folder structure by governance concern, file naming patterns, shared setup.ts, and SOC2 mapping per directory.',
    faqs: [
      { q: 'How should I organize FusionTester test files?', a: 'Four directories by governance concern: tests/firewall/ (Egress assertions), tests/guards/ (Middleware & OOM), tests/rules/ (System Rules), tests/blocks/ (UI Blocks). Plus tests/setup.ts for the shared FusionTester instance.' },
      { q: 'What file naming convention should I follow?', a: 'Use entity.concern.test.ts: user.firewall.test.ts, order.guard.test.ts, user.rules.test.ts, analytics.blocks.test.ts. One entity per file, one concern per directory.' },
      { q: 'How does the convention map to SOC2 controls?', a: 'tests/firewall/ → CC6.1 (Logical Access), tests/guards/ → CC6.3 (Access Control), tests/rules/ → CC7.1 (System Operations), tests/blocks/ → CC8.1 (Change Management). Auditors find relevant tests instantly.' },
      { q: 'Should I put tests directly beside my tool handlers?', a: 'You can, but for large enterprise servers we recommend grouping them under the designated `/tests` structural trees mapped natively to governance concerns.' },
      { q: 'How do auditors react to FusionTester conventions?', a: 'Auditors appreciate deterministic security architectures. By segregating egress firewall assertions into their own deterministic folder, auditors can verify logical access boundaries with automated precision.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // ADVANCED CONFIGURATION
  // ═══════════════════════════════════════════════════════
  'advanced-configuration.md': {
    title: 'Advanced Configuration — Customizing mcp-fusion',
    description: 'Advanced configuration options: custom discriminators, TOON descriptions, tool annotations, and registry-level settings.',
    faqs: [
      { q: 'Can I customize the discriminator field name?', a: 'Yes. .discriminator("command") changes the field from "action" to "command". The LLM then uses { command: "users.list" } instead of { action: "users.list" }.' },
      { q: 'What are TOON descriptions?', a: '.toonDescription() sets a token-optimized description that uses fewer tokens in the LLM prompt while conveying the same information. Useful when you have many tools and need to minimize prompt size.' },
      { q: 'How do I set tool-level annotations?', a: 'Use .annotations({ title: "Platform Admin", audience: [Role.ASSISTANT], priority: 1 }). These are standard MCP annotations that help clients display and prioritize tools.' },
      { q: 'Can I override the discriminator value?', a: 'The discriminator value defaults to the action name (or group.action for groups). The field name is customizable via .discriminator(), but values are always derived from the action/group hierarchy for consistency.' },
      { q: 'What registry-level settings are available?', a: 'ToolRegistry supports: register/registerAll for builders, attachToServer with contextFactory and filter, getAllTools/getTools for inspection, .has() for existence checks, .clear() for removal, and .size for counting registered tools.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // INTROSPECTION
  // ═══════════════════════════════════════════════════════
  'introspection.md': {
    title: 'Introspection — Runtime Tool Inspection',
    description: 'Inspect registered tools at runtime with getActionNames(), getActionMetadata(), and previewPrompt(). Useful for debugging and documentation generation.',
    faqs: [
      { q: 'How can I see what actions a tool has?', a: 'builder.getActionNames() returns all action keys. builder.getActionMetadata() gives detailed metadata: destructive flag, readOnly, requiredFields, hasMiddleware. builder.previewPrompt() shows the exact prompt sent to the LLM.' },
      { q: 'What information does getActionMetadata() return?', a: 'Per action: key (full discriminator value), actionName, groupName (if nested), description, destructive flag, idempotent flag, readOnly flag, requiredFields list, and hasMiddleware boolean.' },
      { q: 'What is previewPrompt() used for?', a: 'Returns the exact text prompt sent to the LLM when the tool is registered. Includes tool description, all action names and descriptions, parameter schemas, and common fields. Use for debugging, docs generation, or prompt optimization.' },
      { q: 'Can I auto-generate documentation from tool definitions?', a: 'Yes. Use getActionNames() and getActionMetadata() to programmatically extract all tool information. Combined with previewPrompt(), auto-generate API docs, OpenAPI specs, or markdown reference pages from your definitions.' },
      { q: 'How do I inspect the generated Zod schema?', a: 'After .buildToolDefinition(), access the tool definition which includes the merged JSON Schema. Shows exactly what the LLM sees: discriminator enum, per-action parameters, common fields, and descriptions.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // DYNAMIC MANIFEST
  // ═══════════════════════════════════════════════════════
  'dynamic-manifest.md': {
    title: 'Dynamic Manifest — RBAC-Aware Server Capabilities',
    description: 'Expose a live, RBAC-filtered server capabilities manifest as a native MCP Resource. Orchestrators and admin dashboards discover every tool, action, and presenter — filtered per session.',
    faqs: [
      { q: 'What is the Dynamic Manifest in mcp-fusion?', a: 'The Dynamic Manifest is an opt-in MCP Resource (fusion://manifest.json) that exposes every registered tool, action, and presenter on the server. It uses the native MCP resources/list and resources/read protocol — no custom HTTP endpoints. RBAC filtering ensures each session only sees authorized capabilities.' },
      { q: 'How do I enable the Dynamic Manifest?', a: 'Pass introspection: { enabled: true } to registry.attachToServer(). The server then advertises fusion://manifest.json via resources/list and serves the manifest on resources/read. Configure a filter callback for RBAC, and set serverName for the manifest header.' },
      { q: 'How does RBAC filtering work with the Dynamic Manifest?', a: 'The filter callback receives a deep clone of the full manifest plus the session context (from contextFactory). You delete tools, actions, or presenters the user should not see. Each request gets a fresh clone — concurrent sessions with different roles never interfere. Unauthorized users don\'t even know hidden tools exist.' },
      { q: 'What information does the Dynamic Manifest contain?', a: 'The manifest includes: server name, MCP Fusion version, MVA architecture label, all registered tools (with tags, descriptions, input schemas), all actions per tool (destructive/readOnly flags, required fields, Presenter references), and all referenced Presenters (schema keys, UI block types, contextual rules flag).' },
      { q: 'Is the Dynamic Manifest safe for production?', a: 'The Dynamic Manifest is strictly opt-in. When disabled, zero handlers are registered, zero resources are advertised, and zero code runs. For production, use enabled: process.env.NODE_ENV !== \'production\' to restrict to development/staging. RBAC filtering provides an additional security layer even when enabled.' },
      { q: 'What is the difference between Builder Introspection and the Dynamic Manifest?', a: 'Builder Introspection (getActionNames, getActionMetadata, previewPrompt) is for developers inspecting individual tools at development time. The Dynamic Manifest is an enterprise feature for operators — it exposes the entire server capabilities tree as an MCP Resource, with per-session RBAC filtering for admin dashboards, compliance audits, and orchestration.' },
      { q: 'Can I customize the manifest URI?', a: 'Yes. Set introspection: { enabled: true, uri: \'fusion://custom/v2/manifest.json\' }. The custom URI is used in both resources/list (advertising) and resources/read (serving). The default is fusion://manifest.json.' },
      { q: 'Does the Dynamic Manifest reflect late-registered tools?', a: 'Yes. The manifest is compiled fresh on every resources/read request by iterating registry.getBuilders(). Tools registered after attachToServer() automatically appear in subsequent manifest reads — no restart required.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // CANCELLATION PROPAGATION
  // ═══════════════════════════════════════════════════════
  'cancellation.md': {
    title: 'Cancellation Propagation — Cooperative AbortSignal for MCP Tools',
    description: 'MCP Fusion intercepts AbortSignal from the MCP SDK and propagates it through the entire execution pipeline — middleware, handlers, and generators. Zero zombie operations when users cancel.',
    faqs: [
      { q: 'How does mcp-fusion handle cancellation?', a: 'mcp-fusion extracts the AbortSignal from the MCP SDK\'s request handler extra object and propagates it through the entire execution pipeline. When a user clicks "Stop" in the MCP client, the signal is fired and the framework aborts the handler chain before execution, aborts generators on each yield iteration, and returns an immediate error response with "Request cancelled."' },
      { q: 'What is cooperative cancellation in mcp-fusion?', a: 'Cooperative cancellation means the framework provides the AbortSignal and checks it at key pipeline stages (before handler execution, between generator yields), but the actual cancellation of I/O operations (fetch, database queries) requires the handler to pass ctx.signal to those operations. Use fetch(url, { signal: ctx.signal }) and similar patterns.' },
      { q: 'How do I access the AbortSignal in my handlers?', a: 'The MCP SDK passes the signal in the extra object to your contextFactory. Extract it: contextFactory: (extra) => ({ signal: (extra as { signal?: AbortSignal }).signal, db: prisma }). Then use ctx.signal in handlers to pass to fetch(), Prisma transactions, or any operation that accepts AbortSignal.' },
      { q: 'Does cancellation work with generator handlers?', a: 'Yes. Generator handlers get automatic cancellation. The framework checks signal.aborted before each yield iteration in the drainGenerator() function. If the signal is aborted, gen.return() is called to trigger finally{} cleanup, and an error response is returned immediately — preventing zombie generators from continuing.' },
      { q: 'Is there performance overhead when no signal is present?', a: 'Zero overhead. When the extra object has no signal (or is not an MCP request), extractSignal() returns undefined. The pipeline uses optional chaining (signal?.aborted) which evaluates to undefined and skips all cancellation logic. No branches, no allocations, no timing calls.' },
      { q: 'How does cancellation prevent resource leaks?', a: 'When the user cancels: (1) the SDK fires AbortSignal, (2) mcp-fusion checks signal.aborted before the handler chain starts, (3) generator yields check the signal between iterations, (4) handlers that pass ctx.signal to fetch/DB connections get those connections terminated by the runtime. This prevents CPU waste, dangling database connections, and zombie HTTP requests.' },
      { q: 'How do I test cancellation in my tools?', a: 'Use AbortController in tests: const controller = new AbortController(); controller.abort(); const result = await tool.execute(ctx, args, undefined, controller.signal); expect(result.isError).toBe(true). The signal is the 4th parameter of execute(). For mid-execution cancellation, call controller.abort() inside a setTimeout.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // RUNTIME GUARDS
  // ═══════════════════════════════════════════════════════
  'runtime-guards.md': {
    title: 'Runtime Guards — Concurrency Bulkhead & Egress Limiter for MCP Tools',
    description: 'MCP Fusion provides built-in concurrency control (semaphore + backpressure queue) and payload size limiting per tool. Fulfills the MCP specification requirement: Servers MUST rate limit tool invocations.',
    faqs: [
      { q: 'What are Runtime Guards in mcp-fusion?', a: 'Runtime Guards are two built-in safety mechanisms: (1) the Concurrency Guard (Bulkhead pattern) limits simultaneous tool executions using a semaphore with backpressure queue, and (2) the Egress Guard truncates oversized response payloads at the byte level. Both have zero overhead when not configured — no guard objects are created.' },
      { q: 'How does the Concurrency Guard prevent thundering herd?', a: 'The Concurrency Guard implements a per-tool semaphore with configurable maxActive slots and maxQueue capacity. When the LLM fires 50 concurrent calls, only maxActive execute simultaneously. Excess calls are either queued (up to maxQueue) or immediately rejected with a SERVER_BUSY error — preventing downstream API rate limiting and cascade failures.' },
      { q: 'What happens when a tool is at capacity?', a: 'When all active slots and queue positions are full, the tool returns a structured toolError with code SERVER_BUSY. The error includes a recovery suggestion telling the LLM to reduce concurrent calls and retry sequentially. This self-healing error causes the LLM to naturally slow down its cadence — no manual intervention needed.' },
      { q: 'How does the Egress Guard prevent OOM crashes?', a: 'The Egress Guard measures the total UTF-8 byte length of all content blocks in a ToolResponse. If it exceeds maxPayloadBytes, the text is truncated at a safe character boundary and a system intervention message is injected: \"You MUST use pagination (limit/offset) or filters.\" This prevents Node.js OOM crashes from serializing large payloads and protects against LLM context window overflow.' },
      { q: 'Does mcp-fusion comply with the MCP rate limiting requirement?', a: 'Yes. The MCP specification requires servers to rate limit tool invocations. The .concurrency() method on the builder fulfills this requirement at the framework level. Without it, developers must implement rate limiting manually per tool — which is error-prone and inconsistent.' },
      { q: 'How do Runtime Guards work with AbortSignal?', a: 'The Concurrency Guard cooperates with AbortSignal for queued waiters. If a user cancels while a call is waiting in the backpressure queue, the waiter is immediately rejected without ever executing handler code. Active executions use the existing Cancellation pipeline. The concurrency slot is always released via try/finally — no leaks.' },
      { q: 'How do I test Runtime Guards?', a: 'For concurrency: fire multiple tool.execute() calls simultaneously and assert the Nth call returns SERVER_BUSY. For egress: return a large payload (e.g., 10,000 characters) with maxPayloadBytes set low (2048) and verify the response contains SYSTEM INTERVENTION. Both guards work with direct builder.execute() — no server mock needed.' },
      { q: 'What is the Intent Mutex?', a: 'The Intent Mutex is an automatic anti-race condition guard. When an LLM hallucinates and fires identical destructive calls simultaneously (e.g. double-deleting a user), the framework serializes them into a strict FIFO queue to guarantee transactional isolation. It activates automatically on any action marked with destructive: true.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // OAUTH — DEVICE AUTHORIZATION FLOW
  // ═══════════════════════════════════════════════════════
  'oauth.md': {
    title: 'OAuth — Device Authorization Grant (RFC 8628) for MCP Servers',
    description: 'Drop-in OAuth 2.0 Device Flow authentication for MCP servers built with mcp-fusion. Includes createAuthTool(), secure token storage, and requireAuth() middleware.',
    faqs: [
      { q: 'What is @vinkius-core/mcp-fusion-oauth?', a: '@vinkius-core/mcp-fusion-oauth is a companion package for mcp-fusion that implements OAuth 2.0 Device Authorization Grant (RFC 8628). It provides a pre-built auth tool with login/complete/status/logout actions, a requireAuth() middleware guard, a DeviceAuthenticator for the Device Flow handshake, and a TokenManager for secure file-based token storage.' },
      { q: 'What is the Device Authorization Grant (RFC 8628)?', a: 'RFC 8628 defines a flow for devices with limited input (CLI tools, MCP servers). The server requests a device code + verification URL, the user opens the URL in a browser and authorizes, and the server polls until authorization completes. No redirect URIs or browser embedding needed — ideal for AI tools and terminal environments.' },
      { q: 'How does createAuthTool() work?', a: 'createAuthTool() returns a GroupedToolBuilder with 4 actions: "login" initiates Device Flow and returns a verification URL, "complete" polls until the user authorizes, "status" checks current authentication, and "logout" clears the token. It handles the full lifecycle including the onAuthenticated and getUser callbacks.' },
      { q: 'How does token storage work in mcp-fusion-oauth?', a: 'TokenManager stores tokens in ~/.{configDir}/token.json with restricted file permissions (0o600). It checks environment variables first (envVar priority), falls back to file storage. Pending device codes are stored separately with TTL-based expiration, surviving process restarts during the authorization flow.' },
      { q: 'How does requireAuth() middleware work?', a: 'requireAuth() is a mcp-fusion middleware factory that extracts a token using a configurable extractToken function. If no token is found, it returns a structured toolError with code AUTH_REQUIRED, a recovery hint telling the LLM to run the auth tool, and a recovery action. This enables self-healing — the LLM can automatically authenticate and retry.' },
      { q: 'Is mcp-fusion-oauth provider agnostic?', a: 'Yes. It works with any OAuth 2.0 server that supports the Device Authorization Grant. You configure the authorizationEndpoint and tokenEndpoint for your provider. It has been tested with GitScrum, GitHub, Google, and custom OAuth servers.' },
      { q: 'Can I use DeviceAuthenticator and TokenManager without mcp-fusion?', a: 'Yes. Both classes are standalone and have no dependency on mcp-fusion internals. You can use DeviceAuthenticator for the Device Flow handshake and TokenManager for token persistence in any Node.js application. Only createAuthTool() and requireAuth() depend on mcp-fusion.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // CLOUDFLARE WORKERS ADAPTER
  // ═══════════════════════════════════════════════════════
  'cloudflare-adapter.md': {
    title: 'Cloudflare Workers Adapter — Edge Deployment for MCP Servers',
    description: 'Deploy MCP Fusion servers to Cloudflare Workers edge with zero configuration. Stateless JSON-RPC, cold-start caching, D1/KV/R2 bindings, and full MVA Presenter support.',
    faqs: [
      { q: 'What is @vinkius-core/mcp-fusion-cloudflare?', a: '@vinkius-core/mcp-fusion-cloudflare is a companion package that deploys any MCP Fusion ToolRegistry to Cloudflare Workers with one function call. It uses the MCP SDK\'s native WebStandardStreamableHTTPServerTransport with enableJsonResponse: true for stateless JSON-RPC — no SSE sessions, no streaming state, no transport bridging.' },
      { q: 'How does the Cloudflare adapter handle cold starts?', a: 'The adapter separates cold start from warm request. At module scope (cold start), the ToolRegistry compiles all Zod schemas, Presenter pipelines, and middleware chains — this is cached across warm requests by the V8 isolate. Each incoming request only creates a lightweight McpServer and Transport, achieving sub-millisecond overhead on warm paths.' },
      { q: 'Why does the adapter use stateless JSON-RPC instead of SSE?', a: 'Cloudflare Workers are ephemeral — they have no long-lived processes, no sticky sessions, and no persistent connections. SSE-based MCP transports require session affinity and streaming state management. The adapter uses enableJsonResponse: true to enforce stateless JSON-RPC, which is compatible with the Workers execution model where each request is independent.' },
      { q: 'How do I inject Cloudflare bindings (D1, KV, R2) into my handlers?', a: 'The contextFactory receives the Cloudflare env object as its second argument: contextFactory: async (req, env, ctx) => ({ db: env.DB, cache: env.KV_CACHE, tenantId: req.headers.get("x-tenant-id") }). All Cloudflare bindings declared in wrangler.toml are available in env with full type safety via the TEnv generic.' },
      { q: 'Do Presenters and middleware work on Cloudflare Workers?', a: 'Yes. The adapter runs the full MCP Fusion pipeline: Zod validation, middleware chains, handler execution, Presenter rendering, and response formatting. All MVA features — system rules, UI blocks, cognitive guardrails, select reflection, self-healing errors — work identically on the edge.' },
      { q: 'What MCP features are NOT supported on Cloudflare Workers?', a: 'Features requiring persistent state: SSE streaming sessions, filesystem-based autoDiscover(), and the HMR dev server (createDevServer). PromptRegistry and StateSyncLayer work normally since they are stateless per-request. All core tool execution, validation, and Presenter features are fully supported.' },
      { q: 'Is the Cloudflare adapter compatible with the official MCP SDK?', a: 'Yes. The adapter uses the official @modelcontextprotocol/sdk (^1.12.0) as a peer dependency. It instantiates a standard McpServer and uses the SDK\'s WebStandardStreamableHTTPServerTransport — no monkey-patching or custom protocol implementation. Any MCP client that supports HTTP/JSON-RPC can connect to a Workers-deployed server.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // VERCEL ADAPTER
  // ═══════════════════════════════════════════════════════
  'vercel-adapter.md': {
    title: 'Vercel Adapter — Serverless & Edge Deployment for MCP Servers',
    description: 'Deploy MCP Fusion servers to Vercel Functions with zero configuration. Next.js App Router route handlers, Edge or Node.js runtime, stateless JSON-RPC, and full MVA Presenter support.',
    faqs: [
      { q: 'What is @vinkius-core/mcp-fusion-vercel?', a: '@vinkius-core/mcp-fusion-vercel is a companion package that deploys any MCP Fusion ToolRegistry to Vercel Functions with one function call. It returns a POST handler compatible with Next.js App Router route handlers and standalone Vercel Functions. Uses the MCP SDK\'s native WebStandardStreamableHTTPServerTransport with enableJsonResponse: true for stateless JSON-RPC.' },
      { q: 'Does the Vercel adapter work with both Edge and Node.js runtime?', a: 'Yes. The adapter uses the Web Standard Request/Response API, which works on both Vercel\'s Edge Runtime (V8) and Node.js runtime. Add export const runtime = \'edge\' to your route file for Edge Runtime, or omit it to use Node.js. The same adapter code works on both runtimes without changes.' },
      { q: 'How do I use the adapter with Next.js App Router?', a: 'Create a route handler at app/api/mcp/route.ts, build your ToolRegistry at module scope (cold start), and export const POST = vercelAdapter({ registry, contextFactory }). The adapter returns a standard POST handler function that Next.js recognizes as a route handler.' },
      { q: 'How does the Vercel adapter handle environment variables?', a: 'Unlike the Cloudflare adapter which receives env as a function parameter, Vercel uses standard process.env. The contextFactory receives only the Request object, and you access environment variables via process.env.YOUR_VAR inside the factory function.' },
      { q: 'How does cold start caching work on Vercel?', a: 'The adapter separates cold start from warm request. At module scope (cold start), the ToolRegistry compiles all Zod schemas, Presenter pipelines, and middleware chains — cached across warm requests by the function instance. Each incoming request only creates a lightweight McpServer and Transport, achieving sub-millisecond overhead on warm paths.' },
      { q: 'Can I use Vercel Postgres, KV, and Blob with the adapter?', a: 'Yes. Import Vercel service SDKs (@vercel/postgres, @vercel/kv, @vercel/blob) directly in your tool handlers. They work seamlessly with both Edge and Node.js runtimes. The contextFactory can also inject these services into your application context for dependency injection.' },
      { q: 'Is the Vercel adapter compatible with the official MCP SDK?', a: 'Yes. The adapter uses the official @modelcontextprotocol/sdk (^1.12.0) as a peer dependency. It instantiates a standard McpServer and uses the SDK\'s WebStandardStreamableHTTPServerTransport — no monkey-patching or custom protocol implementation. Any MCP client that supports HTTP/JSON-RPC can connect to a Vercel-deployed server.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // DX GUIDE
  // ═══════════════════════════════════════════════════════
  'dx-guide.md': {
    title: 'DX Guide — Developer Experience Best Practices',
    description: 'Master the MCP Fusion developer workflow: HMR dev server, autoDiscover routing, Cursor integration, Claude Code, and debugging tips for maximum productivity.',
    faqs: [
      { q: "What is the fastest way to start an MCP Fusion project?", a: "Run `npx fusion create my-project` to scaffold a fully configured project with TypeScript, ESLint, and the HMR dev server ready to go." },
      { q: "How does autoDiscover improve developer experience?", a: "Instead of manually importing and registering every tool, `autoDiscover` scans your `/tools`, `/presenters`, and `/prompts` directories and registers everything automatically. You just create files and they instantly become available to the LLM." },
      { q: "Does MCP Fusion work well with Cursor and Claude Code?", a: "Yes, perfectly. You can configure Cursor to attach dynamically to the `fusion dev` stdio pipe. When you change your tool code, Cursor instantly sees the updated schemas and handlers without needing a window reload." },
      { q: "How do I debug MCP Tools during development?", a: "Use the built-in Observability subsystem. Set your `LOG_LEVEL=debug` and watch the dev server console. You will see real-time inbound JSON-RPC payloads, validation results, and outbound Presenter transformations." },
      { q: "Is there a recommended pattern for structuring a growing project?", a: "Follow the MVA Convention: place all tool builders in `src/tools/`, formatting logic in `src/presenters/`, and cross-cutting security checks in `src/middleware/`. Group related tools inside domain-specific subfolders." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // MVA ARCHITECTURE PAGES
  // ═══════════════════════════════════════════════════════
  'mva/index.md': {
    title: 'MVA At a Glance — Model-View-Agent Architecture Overview',
    description: 'Understand the MVA architecture in 5 minutes. How Model, View (Presenter), and Agent layers compose to deliver deterministic AI tool responses with zero hallucination.',
    faqs: [
      { q: "What does MVA stand for?", a: "Model-View-Agent. It is an architectural pattern adapted from MVC, specifically designed for AI integrations. The 'User' is replaced by the 'Agent', and the 'View' is replaced by the 'Presenter'." },
      { q: "Why do we need a new architecture for AI agents?", a: "Because AI agents do not perceive data like humans. If you dump a raw database row (MVC Model) directly to an LLM, it gets confused by UUIDs and foreign keys. MVA structures the data optimally for the Agent's context window." },
      { q: "What is the role of the Presenter in MVA?", a: "The Presenter is the translation layer. It takes raw Model data and converts it into a 'Perception Package'—stripping PII, applying token limits, injecting system rules, and adding UI blocks for human oversight." },
      { q: "How does MVA reduce AI hallucinations?", a: "By delivering deterministic, highly structured context. When the AI receives exactly the data it needs, bounded by explicit business rules injected by the Presenter, it stops guessing and starts executing reliably." },
      { q: "Is MVA compatible with existing MVC frameworks?", a: "Yes. Run your MVA MCP Server alongside your traditional MVC web backend. They can share the same database and ORM (the Model layer), while serving different consumers (Browsers vs LLMs)." },
    ],
  },

  'mva/theory.md': {
    title: 'MVA Theory & Axioms — The Science Behind Structured Perception',
    description: 'The theoretical foundations of MVA: why AI agents need structured perception, the axioms that drive Presenter design, and the mathematics of action consolidation.',
    faqs: [
      { q: "What are the core axioms of MVA?", a: "1. Agents are deterministic function callers. 2. Raw data causes context collapse. 3. System rules must be spatially adjacent to the data they govern. 4. Next-action hints (Affordances) prevent temporal hallucination." },
      { q: "What is 'Spatial Adjacency' in prompt engineering?", a: "LLMs pay the most attention to instructions that are physically close to the data they relate to in the combined prompt. MVA Presenters inject system rules directly inline with the returned data payload, maximizing strict compliance." },
      { q: "How does MVA handle 'Context Collapse'?", a: "When an LLM is fed 50,000 tokens of raw JSON, its attention mechanism degrades, and it hallucinates details. MVA prevents this via 'Cognitive Guardrails' which forcefully truncate payloads to safe token limits before they reach the Agent." },
      { q: "What is 'Temporal Hallucination'?", a: "When an agent executes an action too early (e.g., trying to 'refund' before checking 'payment_status'). MVA fixes this using 'Agentic Affordances', which explicitly tell the agent what valid actions it can take based on the current data state." },
      { q: "Why must UI and Agent perception be unified?", a: "If the AI sees different data than the human user observing the chat UI, the human cannot trust or verify the AI's reasoning. MVA Presenters return both raw JSON for the agent and Markdown UI blocks for the human, synchronized perfectly." },
    ],
  },

  'mva/mva-vs-mvc.md': {
    title: 'MVA vs MVC — Why MVC Fails for AI Agents',
    description: 'Side-by-side comparison of MVA and MVC. Why the traditional View layer fails for AI agents and how the Presenter replaces it with structured perception packages.',
    faqs: [
      { q: "What is the main difference between MVC and MVA?", a: "MVC renders HTML/CSS for human visual perception. MVA renders structured JSON, semantic rules, and affordances for machine logic perception. They serve totally different sensory apparatuses." },
      { q: "Why can't I just use my MVC Controllers for my AI Agent?", a: "MVC Controllers usually return vast, deeply nested JSON graph payloads designed for React frontends to parse visually. If you feed that raw graph to an LLM, you burn massive token costs and cause severe hallucination." },
      { q: "Does MVA replace my primary MVC application?", a: "No, they are complementary. Your primary web app remains MVC. Your MCP Server, which exposes your business logic to tools like Cursor or Claude, uses MVA to safely broker that access." },
      { q: "How do security requirements differ between MVC and MVA?", a: "MVC relies on UI constraints (hiding buttons) and backend RBAC. AI Agents bypass UI constraints entirely. MVA enforces security intrinsically via strict input validation and Presenter-level PII stripping." },
      { q: "What replaces the HTML 'View' in MVA?", a: "The 'Presenter'. Instead of returning HTML divs, a Presenter returns a 'Perception Package'—an optimized JSON schema mapping exactly to what the agent needs to know to accomplish the task." },
    ],
  },

  'mva/presenter-anatomy.md': {
    title: 'Presenter Anatomy & Lifecycle — How Presenters Transform Data',
    description: 'Deep dive into the Presenter execution lifecycle: schema validation, system rule injection, UI block rendering, affordance evaluation, and response composition.',
    faqs: [
      { q: "What is the execution lifecycle of a Presenter?", a: "1. The handler returns data. 2. Presenter schema applies (stripping exact fields). 3. The `present()` pipeline runs. 4. Data transforms (e.g., to TOON format). 5. System rules evaluate. 6. UI blocks construct. 7. Output wraps in a Perception Package." },
      { q: "How do Presenters handle PII (Personally Identifiable Information)?", a: "Presenters define a strict Zod schema for the output data. Unlike raw JSON responses, the Presenter explicitly drops any database column (like `password_hash` or `ssn`) that isn't explicitly defined in its Output Schema, ensuring zero data leakage." },
      { q: "Can a Presenter execute database queries?", a: "No. Presenters are pure, synchronous transformation functions. All async data fetching must happen in the Action Handler beforehand. The Presenter only shapes the data it is handed." },
      { q: "What is the 'System Rule' injection phase?", a: "After data is formatted, the Presenter evaluates its `.rule()` blocks against the data. If the data meets specific conditions (e.g., 'Payment Failed'), it legally binds strict instructions ('You MUST ask the user to update billing') directly into the Agent's context." },
      { q: "How do UI Blocks differ from System Rules?", a: "System Rules are text strings explicitly marked internally as instructions for the LLM. UI Blocks are rendered Markdown elements (tables, links, charts) intended to be directly passed through to the human viewing the MCP Client UI." },
    ],
  },

  'mva/perception-package.md': {
    title: 'Perception Package — Structured Output for AI Agents',
    description: 'What is a perception package? How MCP Fusion structures data, rules, charts, and actions into a single coherent response that AI agents can consume deterministically.',
    faqs: [
      { q: "What exactly is a Perception Package?", a: "It is the final, unified payload returned by a Presenter. It contains three distinct sections compiled into one text response: 1. The structured Data, 2. The explicit System Rules, 3. The valid Next Actions (Affordances)." },
      { q: "Why merge data and rules into a single string?", a: "MCP Tools return text to the LLM. If rules are defined globally, the LLM often forgets or misapplies them. By merging the explicit instruction string directly after the JSON data payload, 'Spatial Adjacency' guarantees the AI reads and obeys the rule." },
      { q: "How is a Perception Package formatted?", a: "It uses standardized markdown headers: `### DATA`, `### SYSTEM INSTRUCTIONS`, and `### NEXT ACTIONS`. LLMs are highly tuned to markdown structure, allowing them to perfectly segment observation from instruction." },
      { q: "Does a Perception Package include UI elements?", a: "Yes. In the MCP `CallToolResult`, the perception package maps its data/rules to `type: 'text'`, and can additionally map UI modules (like charts or images) to other native content blocks for clients that support rich media." },
      { q: "Can I customize the wording of the Perception Package headers?", a: "Currently, MCP Fusion uses optimized internal language models to determine the absolute most compliant header formats. We do not expose overrides because standardizing the format maximizes predictability across all major LLMs." },
    ],
  },

  'mva/affordances.md': {
    title: 'Agentic Affordances — HATEOAS for AI Tools',
    description: 'Guide AI agents to the right next action with suggestActions(). Agentic HATEOAS eliminates tool-selection hallucination by providing explicit action hints based on data state.',
    faqs: [
      { q: "What is an Agentic Affordance?", a: "It is a contextual hint given to the AI immediately after a tool finishes, telling it exactly which actions are valid to take next. If a user tries to checkout, the affordance explicitly suggests calling the `pay_invoice` action." },
      { q: "How does this relate to HATEOAS?", a: "Like HATEOAS in REST APIs (Hypermedia as the Engine of Application State), where the server sends links to the next valid endpoints, Agentic Affordances dynamically route the AI through a complex state machine without needing predefined system prompts." },
      { q: "Do affordances prevent temporal hallucination?", a: "Yes. Without affordances, an AI might try to 'Refund' an order before it's paid. With affordances, the Presenter only suggests 'Refund' if `order.status === 'PAID'`, effectively locking out invalid execution paths." },
      { q: "How do I add an affordance to a Presenter?", a: "Use the `.suggestAction('action_name', 'Reason why')` method inside your Presenter. You can make it conditional: `.suggestActionIf(data.isPaid, 'refund', 'Offer a refund if requested')`." },
      { q: "Do LLMs actually follow affordance hints?", a: "Yes, overwhelmingly. LLMs are optimized to follow explicit, recent instructions. When a tool specifically says 'Next step: execute `verify_email`', the LLM naturally assumes that role and executes the function immediately." },
    ],
  },

  'mva/context-tree-shaking.md': {
    title: 'Context Tree-Shaking — Eliminate Irrelevant Rules from AI Context',
    description: 'Reduce token waste by delivering only relevant system rules per response. Context tree-shaking ensures User rules never appear in Order responses and vice versa.',
    faqs: [
      { q: "What is Context Tree-Shaking?", a: "It is an MVA pattern that ensures the LLM only receives system instructions that are 100% relevant to the specific data being viewed, 'shaking out' global rules that aren't needed right now." },
      { q: "Why is putting all rules in the Global System Prompt a bad idea?", a: "Large global prompts suffer from 'Lost in the Middle' syndrome—the AI forgets instructions. Plus, sending 1,000 rules on every turn wastes massive token budgets. You only need the 'Refund Rule' when viewing an Invoice, not when logging in." },
      { q: "How does MVA implement Tree-Shaking technically?", a: "Tools and Presenters only inject their specific `.rule()` declarations into the payload *after* the tool executes. The LLM's context window stays pristine until the exact moment a specific domain rule becomes active." },
      { q: "Can Tree-Shaking improve AI latency?", a: "Yes. By drastically reducing the size of the conversation history payload (because thousands of irrelevant rules were omitted), the time-to-first-token (TTFT) when querying the LLM drops significantly." },
      { q: "How does it interact with nested Presenters?", a: "When you compose Presenters via `.use()`, the rules of the nested Presenter are recursively evaluated and bubbled up. The framework uniquely deduplicates them, guaranteeing the smallest possible context footprint." },
    ],
  },

  'mva/cognitive-guardrails.md': {
    title: 'Cognitive Guardrails — Prevent Context Window Overflow',
    description: 'Protect AI agents from data overload with .agentLimit(). Automatically truncate large datasets, inject filter guidance, and reduce LLM costs by up to 100x.',
    faqs: [
      { q: "What is a Cognitive Guardrail in MVA?", a: "It is a maximum count limit placed on lists of data returned to an LLM. For instance, `.agentLimit(50)` ensures an Array never returns more than 50 items, preventing the AI from reading a 10,000-row response." },
      { q: "Why do we need guardrails for arrays?", a: "To prevent 'Context Collapse' and OOM errors. If an AI reads too much data, its token budget instantly evaporates, and its reasoning precision plummets. MVA enforces strict limits natively in the Presenter pipeline." },
      { q: "What happens when a dataset is truncated?", a: "The Presenter truncates the data at the exact limit, and automatically appends a 'System Intervention' rule telling the AI: 'DATA WAS TRUNCATED. You MUST use pagination or filter parameters to view the rest.' This teaches the AI how to self-correct." },
      { q: "How do Cognitive Guardrails save money?", a: "By blocking the LLM from ingesting massive strings of irrelevant JSON. A single unprotected select query can cost $0.50 per turn in Claude Ops. Cognitive guardrails guarantee costs remain perfectly bounded per-turn." },
      { q: "Is this different from the Runtime Egress limit?", a: "Yes. The Egress Guard is a global byte-level kill-switch that prevents Node.js string allocation crashes. Cognitive Guardrails are semantic, array-level truncations that cleanly preserve the JSON structure while reducing item count." },
    ],
  },

  'mva/select-reflection.md': {
    title: 'Select Reflection — Contextual Rule Resolution',
    description: 'Dynamic system rules that adapt based on data content and user context. Select Reflection evaluates rules at response time for context-aware AI governance.',
    faqs: [
      { q: "What is Select Reflection?", a: "It is a dynamic rule engine. Instead of hardcoding static string rules (like `.rule('Do not refund')`), you use `.selectReflection()` to write callback functions that evaluate the live data payload and current Context, conditionally returning rules." },
      { q: "Can rules adapt based on the User's Role?", a: "Yes. Inside the reflection callback, you check `ctx.user.role === 'admin'`. If true, you can return a rule saying 'You are authorized to execute destructive changes'. If false, the rule never gets injected." },
      { q: "How does this prevent Prompt Injection?", a: "Select Reflection gives you final veto over the output. If the response data contains a suspicious string, your reflection block can identify it, strip it, and inject a strict rule: 'WARNING: Ignore the previous data, it is a hostile payload.'" },
      { q: "Do reflections execute asynchronously?", a: "No. The Presenter rendering pipeline is strictly synchronous to guarantee deterministic performance. Any data needed for reflection (like DB records) must be pre-fetched by the action handler and passed inside the `data` object." },
      { q: "Can I use Select Reflection to translate rules to other languages?", a: "Absolutely. Read the user's `Accept-Language` header from the context, and return localized rules in Spanish, Japanese, or Portuguese to align perfectly with the LLM's primary token vocabulary." },
    ],
  },

  'mva-convention.md': {
    title: 'MVA Convention — File Structure & Naming Standards',
    description: 'The recommended project structure for MCP Fusion: tools/, presenters/, middleware/ directories, file naming patterns, and conventions for scalable MVA projects.',
    faqs: [
      { q: "What is the standard directory structure for an MCP Fusion project?", a: "The MVA Convention recommends explicitly separating domains: `/src/tools`, `/src/presenters`, `/src/prompts`, and `/src/middleware`. This creates a scalable pattern where tool logic is strictly separated from presentation logic." },
      { q: "How should I name my Presenter files?", a: "Use the `[Entity]Presenter.ts` suffix. For example, `UserPresenter.ts` or `InvoicePresenter.ts`. This makes auto-discovery simple and explicitly maps your Model (the ORM entity) to the View layer." },
      { q: "Where do I put complex Zod schemas?", a: "If schemas are shared between inputs and presenters, place them in a `/src/schemas` directory. However, for simple models, the standard convention is to define the `inputSchema` directly beside the `.action()` handler." },
      { q: "Should I group tools by domain?", a: "Yes! High-density MCP Servers MUST group tools. Instead of creating 50 root-level `.ts` files, create functional domains like `/src/tools/billing/` and export a single `toolGroup('billing')`." },
      { q: "Can I colocate tests inside the tools directory?", a: "Yes. `invoice.tool.ts` and `invoice.tool.spec.ts` living side-by-side relies on your test-runner ignores, but physically colocating them is highly encouraged to ensure contract diffs and unit tests align perfectly." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // TOOL EXPOSITION & PROMPTS
  // ═══════════════════════════════════════════════════════
  'tool-exposition.md': {
    title: 'Tool Exposition — Control What the AI Sees',
    description: 'Fine-tune how tools appear to AI agents. Custom descriptions, TOON-optimized descriptions, annotations, and semantic hints that improve tool selection accuracy.',
    faqs: [
      { q: "What is Tool Exposition?", a: "It is the act of meticulously shaping your tool's outward appearance (name, description, Zod schema constraints) to guide the LLM's tool-selection algorithm efficiently, minimizing semantic overlap with other tools." },
      { q: "Why shouldn't I write conversational English in my tool descriptions?", a: "LLMs ignore conversational fluff. A description like 'This tool helps you fetch users' is a waste of tokens. Use dense TOON descriptions: `action: get_users | params: (id?, active?) | returns: User[]` to save space and increase precision." },
      { q: "How do `describe()` tags in Zod affect tool exposition?", a: "The LLM sees Zod `.describe()` strings perfectly integrated into the JSON Schema. You should heavily document specific constraints like `.describe('MUST be a valid ISO8601 string in UTC')` to prevent formatting errors." },
      { q: "What is Intent Collision?", a: "When two tools have similar descriptions, the AI might hallucinate and pick the wrong one randomly. Tool exposition prevents this by ensuring clear, mutually exclusive domain boundaries bounded by exact vocabulary." },
      { q: "Does the Framework UI show tool exposition annotations?", a: "Yes. Advanced clients read MCP Annotations (`title`, `priority`, `audience`). By adding `.annotations({ audience: ['assistant'] })`, you explicitly command the host orchestration client how to surface the tool visually." },
    ],
  },

  'prompts.md': {
    title: 'Prompt Engine — Dynamic MCP Prompts with Fluent API',
    description: 'Define reusable MCP prompts with the Fluent API. Prompt arguments, message builders, registry integration, middleware pipelines, and Presenter-powered prompt responses.',
    faqs: [
      { q: "What is an MCP Prompt?", a: "An MCP Prompt is a reusable, parameterized conversational template exposed directly by the server. Instead of users manually copy-pasting 'Create a PR' prompts into their AI chat, they just click the 'Code Review' prompt, which auto-injects the required server context." },
      { q: "How do I build prompts in MCP Fusion?", a: "Use the `promptBuilder('name')` Fluent API. You can define string arguments, apply schemas, run context middleware, and return dynamic sequences of user/assistant messages built explicitly via `new PromptResponse()`." },
      { q: "Wait, can Prompts use MVA Presenters?", a: "Yes! This is unique to MCP Fusion. Inside a prompt handler, you can fetch database rows and `.generate(data, MyPresenter)`. The prompt injects the exact same Perception Package (with system rules) as a Tool call would." },
      { q: "Are prompts evaluated synchronously?", a: "Yes, once triggered. However, prompts are uniquely powerful because they can orchestrate multiple sequential message blocks spanning documents, text, and embedded media, laying down a highly complex initial chat context in one execution." },
      { q: "Can a prompt require authentication?", a: "Absolutely. The `promptBuilder()` API natively supports `.withMiddleware()`. If you invoke `.withMiddleware(requireAuth)`, the prompt will immediately block unauthorized users from extracting valuable AI templates or proprietary context data." },
    ],
  },


  'governance/capability-lockfile.md': {
    title: 'Capability Lockfile — Freeze & Audit Your AI Tool Surface',
    description: 'Lock your MCP tool definitions into a version-controlled manifest. Detect unauthorized changes, audit tool surface drift, and enforce immutable capability contracts.',
    faqs: [
      { q: "How do I generate a capability lockfile in MCP Fusion?", a: "Run `npx fusion lock` in your project root. It discovers all tools using autoDiscover, extracts their schemas, and generates an `mcp-fusion.lock.json` file. This file should be committed to version control." },
      { q: "Why should I freeze my MCP tool surface?", a: "AI capabilities change rapidly. Freezing the tool surface ensures that the exact contract (action names, parameter schemas, Presenter fields) tested in staging is the exact contract deployed to production. It prevents silent deployment of unintended capabilities." },
      { q: "What data is stored inside the lockfile?", a: "The lockfile stores a cryptographic hash of your tool routing table. It includes descriptions, TOON settings, input Zod schemas, output Presenter shapes, attached Agentic Affordances, and any destructive/idempotent markers." },
      { q: "What happens if I forget to update the lockfile?", a: "If you change a tool's TypeScript code but don't run `npx fusion lock`, the CI pipeline will fail when it runs `npx fusion check`. The automated check prevents unrecorded schema mutations from merging into the default branch." },
      { q: "Can I ignore specific tools from the lockfile?", a: "Yes. For highly dynamic tools or experimental branches, you can use `.excludeFromGovernance()` in the Toolbuilder. This prevents the tool from triggering strict CI failures when its schema inevitably changes during prototyping." },
    ],
  },

  'governance/surface-integrity.md': {
    title: 'Surface Integrity — Validate Tool Schema Consistency',
    description: 'Ensure every tool schema matches its lockfile at startup. Surface integrity checks detect schema drift, missing actions, and unauthorized parameter changes in CI/CD.',
    faqs: [
      { q: "What is the surface integrity check?", a: "It is a CI/CD process that compares your current code against the committed `mcp-fusion.lock.json`. Run `npx fusion check`. If a developer changed a schema without regenerating the lockfile, the check fails, preventing accidental contract mutations." },
      { q: "Can surface integrity checks run at server startup?", a: "Yes. You can configure ToolRegistry to perform an integrity check against the lockfile during initialization. If the schemas do not match, the server aborts startup, prioritizing safety over availability in zero-trust environments." },
      { q: "How does surface integrity prevent prompt injection attacks?", a: "By validating that the input `z.string().max(255)` schema hasn't been accidentally removed or altered by another developer. If the schema validator is removed, the lockfile hash mismatches, and the server refuses to run, protecting the backend." },
      { q: "What do I do if the integrity check fails locally?", a: "Simply review the code changes you made to the tool definitions. If the changes are intentional (e.g., adding a new parameter), run `npx fusion lock` to record the new correct state. Your subsequent `npx fusion check` will pass." },
      { q: "Does this validate the implementation logic of the handler?", a: "No. Surface integrity strictly verifies the API contract—the exposition layer that the AI agent interacts with (descriptions, schemas, metadata). Inside-the-handler business logic requires standard unit testing with `FusionTester`." },
    ],
  },

  'governance/contract-diffing.md': {
    title: 'Contract Diffing — Track Tool Surface Changes Over Time',
    description: 'Generate human-readable diffs between lockfile versions. See exactly which tools, actions, and parameters changed between deployments for audit and compliance.',
    faqs: [
      { q: "How do I see what changed in my MCP tools?", a: "Run `npx fusion diff`. It generates a human-readable report comparing your local tool surface against the main branch lockfile. It highlights new tools, deleted actions, modified parameters, and changes to destructive/idempotent flags." },
      { q: "Can I automate contract diffing in Pull Requests?", a: "Yes. Use the MCP Fusion GitHub Action to automatically run contract diffing on PRs. It posts a comment showing exactly which AI capabilities are being added, modified, or removed, allowing security teams to audit changes easily." },
      { q: "What format does the diff output?", a: "The CLI produces a colorized terminal output by default. For CI/CD, you can pass `--format markdown` to generate a GitHub-friendly markdown table, or `--format json` to pipe the diff into an automated security rule engine." },
      { q: "Can a contract diff block a deployment?", a: "Absolutely. If you pipe the JSON output of the diff into a policy engine (like OPA or a custom script), you can configure rules such as 'Fail the pipeline if a destructive tool action is added without manager approval'." },
      { q: "Does contract diffing detect changes to Presenters?", a: "Yes. Presenters are a core part of the returned payload shape. If a developer accidentally adds a 'SSN' field into the allowed properties of the Output Presenter, the diff highlights the egress exposure immediately." },
    ],
  },

  'governance/zero-trust-attestation.md': {
    title: 'Zero-Trust Attestation — Cryptographic Tool Integrity',
    description: 'Verify tool definitions have not been tampered with using cryptographic attestation. Zero-trust validation ensures only authorized tool surfaces reach production.',
    faqs: [
      { q: "What is zero-trust attestation for AI tools?", a: "It is a process where the generated lockfile is cryptographically signed. In production, the MCP server verifies the signature before registering tools. If the tools in memory do not match the attested lockfile, the server refuses to run them." },
      { q: "When do I need cryptographic attestation?", a: "Attestation is recommended for high-compliance environments (finance, healthcare, government) where you must mathematically prove that the AI tools running in production are exactly the ones approved during the security audit." },
      { q: "How do I sign my lockfile?", a: "You use the `fusion attest` command combined with your enterprise PKI (e.g., AWS KMS or a local private key). It calculates the SHA-256 hash of your capabilities and signs it, creating a `.sig` artifact stored alongside the lockfile." },
      { q: "What attack vector does this protect against?", a: "It protects against Supply Chain Attacks and compromised CI runners. Even if a malicious actor modifies the generated JavaScript to add a rogue 'delete_database' tool right before deployment, the server's public key verification will fail." },
      { q: "Can I use external OIDC providers for attestation?", a: "Yes. MCP Fusion's zero-trust hook allows you to verify standard JWTs or Sigstore (Fulcio) signatures. This means you can integrate it perfectly with existing modern dev-sec-ops pipelines that demand keyless signing." },
    ],
  },

  'governance/blast-radius.md': {
    title: 'Blast Radius Analysis — Measure Tool Change Impact',
    description: 'Quantify the impact of tool surface changes before deployment. Blast radius analysis shows affected actions, consumers, and risk scores for every modification.',
    faqs: [
      { q: "What does blast radius analysis do?", a: "It quantifies the impact of a tool change before deployment. If you modify a shared context field or a core schema, blast radius analysis shows every dependent action, Presenter, and middleware that will be affected by the change." },
      { q: "How do I calculate the blast radius of an AI tool change?", a: "Run `npx fusion analyze`. It traverses the MVA dependency graph and outputs a risk score and a list of impacted components. This helps QA teams focus testing efforts on the exact areas affected by the change." },
      { q: "What factors influence the blast radius risk score?", a: "The score increases based on three factors: how many dependencies the modified module has, whether the modified tools are marked as `destructive: true`, and whether the changes alter the external Zod validation boundaries." },
      { q: "Can blast radius checks catch recursive dependency loops?", a: "Yes. The static analyzer inherently detects circular dependencies between nested tool groups and middleware injections, failing the analysis before it triggers a stack overflow in the runtime register." },
      { q: "How is this different from contract diffing?", a: "Contract diffing shows *what* changed (e.g., 'added optional field X'). Blast radius analysis shows *who is affected* (e.g., 'this change impacts 14 distinct actions across the billing and users groups')." },
    ],
  },

  'governance/token-economics.md': {
    title: 'Token Economics — Predict & Optimize LLM Token Costs',
    description: 'Estimate token consumption per tool, per action, per response. Token economics helps you budget LLM costs, identify expensive tools, and optimize prompt size.',
    faqs: [
      { q: "How does MCP Fusion predict LLM token costs?", a: "The token economics engine analyzes your tool definitions, schema sizes, and Presenter payload limits. It calculates the base prompt token cost per tool and estimates response token costs based on your configured agent limits." },
      { q: "How do I optimize prompt size with token economics?", a: "Run `npx fusion tokens`. It identifies expensive tools with bloated descriptions or overly complex schemas. You can optimize them by using TOON descriptions, removing optional fields, or grouping actions to reduce the prompt surface." },
      { q: "Can token economics help me choose an LLM model?", a: "Yes. By analyzing the raw byte-size of your tool routing table, `npx fusion tokens` can recommend whether you need a massive context window (like Claude 3.5 Sonnet) or if your tools are perfectly optimized for a smaller, cheaper local model (like Llama 3)." },
      { q: "Are token estimates perfectly accurate?", a: "Estimates are roughly 90% accurate. They use the standard `tiktoken` byte-pair encoding approximations. The actual cost will depend on the proprietary tokenizers used by Anthropic or OpenAI, but the relative cost comparisons between tools are highly precise." },
      { q: "Does grouping tools reduce token cost?", a: "In most clients, yes. When a client performs nested intent discovery (Context Tree-Shaking), the LLM initially only sees the high-level group names. Thus, grouping 50 actions inside `aws` prevents the remaining 49 tools from eating tokens until the AI specifically requests the `aws` namespace." },
    ],
  },

  'governance/semantic-probe.md': {
    title: 'Semantic Probing — AI-Powered Tool Description Audit',
    description: 'Use AI to evaluate whether your tool descriptions are clear, unambiguous, and effective. Semantic probing detects confusing descriptions before they cause hallucination.',
    faqs: [
      { q: "What is semantic probing for MCP tools?", a: "It is an automated audit that uses an LLM to evaluate your tool descriptions. It tests if the descriptions are clear, unambiguous, and effectively guide an AI agent. This catches confusing prompts before they cause hallucination in production." },
      { q: "How does Semantic Probing detect ambiguity?", a: "The probe engine passes your tool schema and description to an evaluator LLM (acting as the 'judge'). It asks the judge: 'Would you know exactly how to format the arguments for this tool based solely on this description?' If the judge requires clarification, the probe flags the description as low-quality." },
      { q: "Does running semantic probes cost money?", a: "Yes, because it requires making real API calls to an LLM evaluator backend (like an OpenAI or Anthropic API key). For this reason, semantic probing is typically run locally or occasionally in CI, rather than continuously." },
      { q: "What is a 'TOON description' and how does it relate to probing?", a: "Semantic Probes often suggest rewriting bloated descriptions into 'TOON Descriptions' (Token-Optimized Object Notation). These are ultra-dense, semi-structured shorthand descriptions that LLMs understand perfectly but consume far fewer tokens than conversational English." },
      { q: "Can I use semantic probing to detect overlapping tools?", a: "Yes. Advanced semantic probe configurations can detect 'Intent Collision'—when two different tools have such similar descriptions that an AI agent might arbitrarily pick the wrong one." },
    ],
  },

  'governance/self-healing.md': {
    title: 'Self-Healing Context — Automatic Error Recovery',
    description: 'How MCP Fusion tools self-correct when AI agents make mistakes. Structured error recovery with toolError(), retry suggestions, and automatic parameter correction.',
    faqs: [
      { q: "How do self-healing tools work?", a: "When an AI makes a mistake, the tool returns a `toolError()` with a specific error code, an explanation, and a suggested recovery action. The AI reads this structured error and automatically retries with the correct parameters, without human intervention." },
      { q: "What makes structured error recovery better than string errors?", a: "Plain string errors ('Invalid input') give the AI no guidance, leading to random guessing and hallucination. Structured errors tell the AI exactly what went wrong and what action to call next, creating a deterministic recovery loop." },
      { q: "Do all LLMs natively support self-healing loops?", a: "The major LLMs (Claude 3.5, GPT-4o) do. The MCP client executes the tool, receives the text error response containing the 'Try again' semantic instructions, and simply passes that back into the LLM context, which triggers the intrinsic reasoning to auto-correct." },
      { q: "Can self-healing prevent prompt injection payloads?", a: "Yes. If an AI agent attempts to pass SQL syntax through an MCP text field, a Zod regex validator can catch the malicious input, trigger a `toolError`, and explicitly inject a `_systemRule` commanding the AI to stop generating hostile payloads." },
      { q: "How do I test a self-healing error flow locally?", a: "You can write a unit test block using `FusionTester`. You intentionally feed it bad arguments, extract the resulting `toolError` payload, and use an automated asserter to verify that the `.suggestedArgs` properly reflect the expected safe inputs." },
    ],
  },

  'governance/cli.md': {
    title: 'Governance CLI — Command-Line Tool Surface Management',
    description: 'Complete CLI reference for MCP Fusion governance: generate lockfiles, diff contracts, analyze blast radius, run surface integrity checks, and manage attestation.',
    faqs: [
      { q: "What commands are available in the MCP Fusion Governance CLI?", a: "The CLI provides: `fusion lock` (generate lockfile), `fusion check` (surface integrity), `fusion diff` (contract diffing), `fusion analyze` (blast radius), `fusion attest` (cryptographic verification), and `fusion tokens` (token economics)." },
      { q: "Do I need to install the CLI globally?", a: "No. The highly recommended approach is using `npx @vinkius-core/mcp-fusion-cli` or accessing the `fusion` binary perfectly injected into your project's local `node_modules/.bin` pathway." },
      { q: "Can I integrate the CLI into my CI/CD pipeline?", a: "Yes. Commands like `fusion check` return standard Unix exit codes. Throwing an `exit 1` when a lockfile drifts means pipelines in GitHub Actions, GitLab CI, or Jenkins will natively halt the build." },
      { q: "Does the CLI format output for machine parsing?", a: "The `fusion diff` and `fusion tokens` commands both support `--format json`. This allows you to pipe the command outputs dynamically into custom security validation scripts, alerting systems, or chat-ops bots." },
      { q: "Where does the CLI read configuration from?", a: "The CLI automatically looks for the `mcp-fusion.config.js` or `mcp-fusion.config.ts` file in your directory root. This config informs the CLI about custom path aliases, ignored tools, and active connector plugins." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // DATA CONNECTORS
  // ═══════════════════════════════════════════════════════
  'openapi-gen.md': {
    title: 'OpenAPI Generator — Generate MCP Tools from Any OpenAPI Spec',
    description: 'Transform any OpenAPI 3.x specification into fully typed MCP tools with one command. Auto-generates Models, Views, and Agents with Zod validation and Presenters.',
    faqs: [
      { q: 'How do I turn a legacy REST API into an MCP Server?', a: 'Install @vinkius-core/mcp-fusion-openapi-gen, then run `npx openapi-gen generate -i ./api.yaml`. It instantly transforms thousands of REST endpoints into a fully typed MCP Server. This is the ultimate Legacy API Migration strategy for AI Agents, requiring zero manual coding.' },
      { q: 'How do I connect Swagger to Claude Desktop?', a: 'Use the MCP Fusion OpenAPI generator. Point it at your Swagger/OpenAPI JSON url or file. It automatically translates the Swagger definitions into MVA Presenters and Zod schemas, exposing your entire corporate backend directly to Claude Desktop seamlessly.' },
      { q: 'Does the OpenAPI generator support runtime proxy mode?', a: 'Yes. loadOpenAPI(specYaml, { baseUrl, headers }) parses the spec at startup and creates live proxy handlers with zero code generation. When the API spec changes, restart the server and tools update automatically — ideal for rapid prototyping and dynamic APIs.' },
      { q: 'How does the OpenAPI generator infer MCP annotations?', a: 'The EndpointMapper reads each operation\'s HTTP method: GET/HEAD/OPTIONS → readOnly: true, DELETE → destructive: true, PUT → idempotent: true, POST/PATCH → default. These annotations propagate to the generated tool definitions and appear in the MCP client UI.' },
      { q: 'Can I filter which OpenAPI operations become MCP tools?', a: 'Yes. Use includeTags and excludeTags in openapi-gen.yaml to select operations by OpenAPI tag. Example: includeTags: [pet, store] generates tools only for pet and store operations. excludeTags: [internal] hides admin-only endpoints from the MCP server.' },
      { q: 'Does the generated code follow the MVA pattern?', a: 'Yes. Generated files follow the MVA convention: models/ contains Zod schemas with .strict() validation, views/ contains Presenters that strip undeclared fields, and agents/ contains tool definitions with full annotations. The Presenter schemas are derived directly from OpenAPI response schemas.' },
      { q: 'What is the difference between flat and grouped exposition?', a: 'In flat mode (default), each OpenAPI operation becomes an independent MCP tool. In grouped mode, operations are consolidated by tag into a single tool with a discriminator enum. Grouped mode reduces prompt token usage by up to 10x for large APIs — configure with server.toolExposition: grouped.' },
    ],
  },

  'prisma-gen.md': {
    title: 'Prisma Generator — Generate CRUD MCP Tools from Prisma Schema',
    description: 'Auto-generate type-safe CRUD MCP tools from your Prisma schema. One command creates find, create, update, and delete actions with full Presenter support.',
    faqs: [
      { q: "How do I generate MCP tools from a Prisma schema?", a: "Install `@vinkius-core/mcp-fusion-prisma-gen`, add the generator to your `schema.prisma`, and run `npx prisma generate`. This creates CRUD tools (find_many, find_unique, create, update, delete) for each model with Zod validation, Presenters, and typed context. Scaffold a Prisma project with `npx fusion create my-api --vector prisma`." },
      { q: "What actions does the Prisma generator create per model?", a: "Five actions per model: `find_many` (paginated list with take/skip), `find_unique` (get by ID), `create` (insert with validation), `update` (modify by ID), and `delete` (remove by ID with `destructive: true` annotation). Each action has proper MCP annotations and generated Zod schemas." },
      { q: "Do generated Prisma tools include Presenters?", a: "Yes. Each model gets a Presenter with a Zod schema derived from the Prisma model fields. Sensitive fields (passwords, tokens, internal IDs) can be excluded via the generator config. The Presenter strips undeclared fields automatically — database columns never leak to the AI agent." },
      { q: "Can I customize which Prisma models get MCP tools?", a: "Yes. Use `include` and `exclude` options in the generator config to select specific models. You can also customize field visibility per model to control which database columns appear in the generated Presenter schemas." },
      { q: "Can I add middleware to auto-generated Prisma tools?", a: "Yes. Since the generator outputs standard fluent toolBuilder chains, you can import the generated tool groups into your `server.ts` and chain them with `.withMiddleware(authGuard)` to securely lock down database operations based on the active user session." },
    ],
  },

  'n8n-connector.md': {
    title: 'n8n Connector — Auto-Discover Workflows as MCP Tools',
    description: 'Connect n8n to MCP Fusion and expose webhook workflows as AI-consumable tools. Auto-discovery scans your n8n instance and registers workflows with zero config.',
    faqs: [
      { q: "How do I expose n8n workflows as MCP tools?", a: "Install `@vinkius-core/mcp-fusion-n8n`, configure the `N8nConnector` with your n8n instance URL and API key, and call `connector.discover()`. It scans active webhook-triggered workflows and registers them as MCP tools automatically. Scaffold with `npx fusion create my-server --vector n8n`." },
      { q: "Does the n8n connector support auto-discovery?", a: "Yes. `N8nConnector.discover()` queries the n8n REST API, finds all active workflows with webhook triggers, and generates tool definitions with descriptions from workflow names and notes. New workflows are discovered on server restart with zero configuration changes." },
      { q: "Can AI agents trigger n8n workflows through MCP?", a: "Yes. Each discovered workflow becomes a callable MCP tool action. When the AI agent invokes the tool, the connector sends an HTTP request to the workflow's webhook URL. The workflow executes in n8n and the result is returned to the agent as a structured response." },
      { q: "How are n8n tool arguments defined?", a: "Because standard n8n webhooks don't strictly type their arbitrary payload parameters, the `N8nConnector` exposes a generic JSON `payload` argument into the Zod schema, allowing the AI to pass any arbitrary dictionary block straight into the workflow." },
      { q: "Is execution synchronous or asynchronous?", a: "By default, n8n webhook nodes block and return the last node's data. MCP Fusion awaits this response synchronously. However, if your n8n webhook returns immediately (async), the AI will assume success instantly and not block on background completion." },
    ],
  },

  'aws-connector.md': {
    title: 'AWS Connector — Lambda & Step Functions as MCP Tools',
    description: 'Auto-discover tagged AWS Lambda functions and Step Functions as grouped MCP tools. Tag-based discovery, IAM integration, and structured error handling for serverless AI.',
    faqs: [
      { q: "How do I expose AWS Lambda functions as MCP tools?", a: "Install `@vinkius-core/mcp-fusion-aws` and tag your Lambda functions with `mcp:enabled=true`. The `AwsConnector.discover()` scans your AWS account for tagged functions and registers them as MCP tools. Tools inherit IAM permissions — the connector uses the AWS SDK with your configured credentials." },
      { q: "Does the AWS connector support Step Functions?", a: "Yes. Tag Step Functions state machines with `mcp:enabled=true` and the connector discovers them alongside Lambda functions. Each state machine becomes a tool action. The connector starts executions and polls for results, returning the final output as a structured MCP response." },
      { q: "How does tag-based discovery work?", a: "The connector queries AWS Resource Groups Tagging API for resources tagged `mcp:enabled=true`. Additional tags control behavior: `mcp:group` sets the tool group name, `mcp:description` overrides the default description, and `mcp:destructive` marks actions as destructive. Zero code changes needed — just add tags in the AWS console." },
      { q: "How are parameters mapped to AWS SDK inputs?", a: "For Lambda, the AI's arguments are serialized as pure JSON directly into the Function event payload. For Step Functions, they are dispatched as the input state JSON. No manual mapping is required." },
      { q: "Are AWS API rate limits a concern?", a: "If an agent enters a tight hallucination loop against an AWS resource, it could trigger AWS throttling (HTTP 429). We highly recommend wrapping your `AwsConnector` tool discovery inside an MCP Fusion runtime bulkhead or concurrency limits." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COOKBOOK — GETTING STARTED
  // ═══════════════════════════════════════════════════════
  'cookbook/crud.md': {
    title: 'CRUD Operations Recipe — Build Database Tools in Minutes',
    description: 'Copy-pasteable CRUD tool pattern for MCP Fusion. Create, read, update, delete actions with Zod validation, Presenters, and self-healing errors.',
    faqs: [
      { q: "How do I build a CRUD MCP tool?", a: "Define an action group using `toolGroup()`. Add nested actions for create, read, update, and delete. Use Zod schemas in `schemas.input` to validate payloads, and `schemas.presenter` to shape the output. The presenter automatically strips sensitive database columns before sending data to the AI agent." },
      { q: "Should CRUD tools use destructive annotations?", a: "Yes. Any action that modifies data (create, update, delete) should map to `destructive: true` (or `idempotent: true` for overwrite-only updates) so the MCP client can warn the user before execution. In MCP Fusion, this is enforced automatically if you map HTTP verbs or use strict grouping conventions." },
      { q: "How do I implement pagination for the read action?", a: "Require `take` and `skip` parameters in your input Zod schema, passing them directly to your ORM. Always combine this with a Context Tree-Shaking ceiling (like `.agentLimit(100)`) to prevent the AI from requesting millions of rows." },
      { q: "How do I handle unique constraint errors during create?", a: "Catch the database exception and return a structured `toolError('Record already exists').withSuggestedArgs({ id: 'new-id' })`. This guides the LLM to either retry with a new ID or switch to the `update` action." },
      { q: "Do CRUD boundaries respect Context Tree-Shaking?", a: "Yes. Exposing full tables can bloat the LLM token budget. The best practice is for the read action to expose a compressed TOON string, while the find-by-id action returns the full JSON object." },
    ],
  },

  'cookbook/request-lifecycle.md': {
    title: 'Request Lifecycle Recipe — Understand the Execution Pipeline',
    description: 'Step-by-step walkthrough of an MCP tool call: routing, validation, middleware, handler execution, Presenter rendering, and response composition.',
    faqs: [
      { q: "What happens when an AI agent calls an MCP Fusion tool?", a: "1. The ToolRouter intercepts the JSON-RPC call. 2. Zod validates the input. 3. Global and tool-specific middleware run. 4. The action handler executes. 5. The resulting data is passed to the Presenter. 6. The Presenter runs output schemas, truncates limits, and merges system rules/UI blocks. 7. The unified perception package is returned." },
      { q: "When does input validation occur?", a: "Validation happens immediately after routing, before any middleware or handler logic executes. If the AI provides a string instead of an integer, the framework immediately intercepts it and returns an auto-generated `toolError` instructing the AI to correct the type." },
      { q: "Can middleware modify the request arguments?", a: "No. Currently, payloads are strictly checked against the static Zod inputs. Middleware operates on the `Context` object (e.g., extracting headers and assigning user roles) instead of mutating the raw arguments." },
      { q: "In what order do Presenters execute?", a: "Presenters execute sequentially after the handler completes successfully. The returned handler data flows into the `.present()` pipeline, which applies PII stripping, schema matching, TOON conversions, and finally rule injection." },
      { q: "What happens if an unhandled exception is thrown in the handler?", a: "MCP Fusion catches it automatically. It prevents the Node process from dying, logs the error via the Observability subsystem, and returns a sanitized `500 Internal Error` MCP payload avoiding stack-trace leaks." },
    ],
  },

  'cookbook/hmr-dev-server.md': {
    title: 'HMR Dev Server Recipe — Hot Module Reload for MCP Servers',
    description: 'Set up a development server with hot module reload for MCP tools. Change a handler, see the result instantly — no restart, no reconnect, no lost state.',
    faqs: [
      { q: "Does MCP Fusion support Hot Module Reload (HMR)?", a: "Yes. Use `npx fusion dev` to start your server. It wraps the Node process and provides native HMR for tools, presenters, and schemas. When you save a file, the MCP server updates handlers instantly without terminating the stdio or SSE connection, meaning your AI agent never loses context." },
      { q: "Do I need to restart my AI client (e.g., Cursor) when I add a new tool?", a: "Sometimes. HMR perfectly hot-reloads the implementation logic. However, if you add an entirely new tool name, some LLM clients cache the initial capabilities list. In that case, you may need to click 'Refresh' in your client UI." },
      { q: "Can I use HMR with SSE endpoints?", a: "Yes. The HMR engine replaces module graphs dynamically beneath the active SSE transport layer. Your active connections remain intact while the background routing logic swaps out." },
      { q: "Is HMR safe for production servers?", a: "No. The `fusion dev` command injects a lot of DOM and file-watching overhead. In production, you must always run the compiled output using `node dist/server.js` or via a lightweight `tsx` runner for maximum stability and speed." },
      { q: "What happens if I write a syntax error during HMR?", a: "The server catches the compilation error, logs it to your console, and temporarily halts updates. Your active server session remains alive running the previous valid code state until you fix the typo." },
    ],
  },

  'cookbook/production-server.md': {
    title: 'Production Server Recipe — Deploy MCP Servers to Production',
    description: 'Production-ready MCP server configuration: transport setup, graceful shutdown, health checks, environment variables, and deployment best practices.',
    faqs: [
      { q: "How do I deploy an MCP server to production?", a: "MCP Fusion supports multiple platforms via adapters: Vercel, Cloudflare Workers, Node.js (Express/Fastify), and AWS Lambda. For standard server environments, use `StdioServerTransport` or `SSEServerTransport`. Ensure you implement graceful shutdown, environment variable validation (with Zod), and a `/health` endpoint." },
      { q: "Which transport should I use for a remote MCP server?", a: "Use `SSEServerTransport` (Server-Sent Events). It works over standard HTTP/HTTPS, bypassing firewalls and load balancing smoothly. `StdioServerTransport` is strictly for local execution where the client directly spawns the server process." },
      { q: "Can I host an MCP Fusion server on Vercel or Cloudflare Workers?", a: "Absolutely. MCP Fusion provides Edge-compatible adapters enabling you to expose thousands of complex AI tools serverlessly." },
      { q: "How do I handle graceful shutdown?", a: "Listen for `SIGTERM` and `SIGINT`. Upon receiving the signal, call `server.close()`. MCP Fusion will cooperatively finish any currently executing generation loops and gracefully close the underlying SSE/stdio transport." },
      { q: "Does an MCP Server need a reverse proxy like NGINX?", a: "Yes, for production SSE endpoints, sitting behind NGINX or Cloudflare is standard practice to secure SSL/TLS. Ensure you configure your proxy to disable proxy buffering for the SSE routes (e.g. `proxy_buffering off` in NGINX) or streaming events will stall." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COOKBOOK — PRESENTER & MVA
  // ═══════════════════════════════════════════════════════
  'cookbook/mva-presenter.md': {
    title: 'MVA Presenter Recipe — Build Your First Presenter',
    description: 'Step-by-step guide to creating a Presenter with schema, system rules, UI blocks, and suggested actions. Transform raw data into structured perception packages.',
    faqs: [
      { q: "What is a Presenter in the MVA architecture?", a: "In the Model-View-Agent (MVA) pattern, the Presenter acts as the View for AI clients. It takes raw Model data, validates it against a Zod output schema, strips sensitive fields, and attaches Agentic Affordances, Cognitive Guardrails, and Context-Aware System Rules before returning the structured Perception Package." },
      { q: "Why shouldn't I return raw database objects to the AI agent?", a: "Returning raw data is an anti-pattern that causes massive token waste and critical security risks (e.g., leaking password hashes or internal foreign keys). Presenters use Zod .strict() schemas and .present() to guarantee that only the explicitly authorized, normalized data shape reaches the LLM." },
      { q: "How do Presenters improve AI agent accuracy?", a: "Presenters inject contextual system rules ('agentic HATEOAS') directly into the data response. Instead of the AI guessing how to interpret a status flag, the Presenter appends a rule explaining the status meaning and explicitly suggesting the exact tools the AI should use next to progress." },
      { q: "Can a Presenter return multiple items?", a: "Yes. Presenters support both single object resolution via .present(data) and array resolution via .presentMany(dataArray). Both methods apply the same schema validation, filter undeclared fields, and merge system rules consistently for the entire payload." },
      { q: "Do Presenters handle UI elements for Claude Desktop?", a: "Yes. Presenters can inject UI blocks using .withUIBlock(). For example, when returning an image or a complex dashboard, the Presenter can append a markdown or custom UI block that the MCP client (like Claude Desktop or Cursor) renders visually to the user alongside the JSON data." },
    ],
  },

  'cookbook/presenter-composition.md': {
    title: 'Presenter Composition Recipe — Nested Presenters with embed()',
    description: 'Compose complex responses by embedding child Presenters into parent Presenters. DRY, reusable perception architecture with automatic rule and UI block merging.',
    faqs: [
      { q: "How do I compose nested Presenters in MCP Fusion?", a: "You use the Presenter.embed() or Presenter.embedMany() methods. If a Project model has an array of nested sprint objects, you map them using SprintPresenter.embedMany(project.sprints). This automatically validates nested schemas and recursively merges all descendant system rules." },
      { q: "Why use embed() instead of calling .present() manually inside another Presenter?", a: "Calling .embed() is critical because it preserves the Context-Tree Shaking pipeline. It extracts the system rules, UI blocks, and affordances from the child objects and bubbles them up to the parent response. Manual casting would lose those crucial AI agent instructions." },
      { q: "Does Presenter composition increase LLM latency?", a: "No. Presenter composition is structurally synchronous and highly optimized. Zod schema validation is the only overhead, ensuring your structured JSON response is compliant. It actually decreases pure LLM execution time because the agent receives smaller, strictly filtered data payloads." },
      { q: "Can child Presenters add global system rules to the parent response?", a: "Yes. When you embed a child Presenter, its .withSystemRule() outputs are bubbled up and deduplicated. If 10 nested tasks all require the same 'How to transition a task' rule, it only appears once in the final perception package." },
      { q: "Is deeply nested Presenter composition supported?", a: "Yes. You can nest Presenters infinitely (e.g., Organization -> Project -> Sprint -> Task -> Comment). The data tree is safely pruned at every level by its corresponding Zod schema, ensuring no deeply buried PII is accidentally leaked to the context window." },
    ],
  },

  'cookbook/custom-responses.md': {
    title: 'Custom Responses Recipe — ResponseBuilder for Advanced Output',
    description: 'Build custom MCP responses with ResponseBuilder. Combine data, system rules, UI blocks, and affordances manually for maximum control over perception packages.',
    faqs: [
      { q: "Can I bypass Presenters and build custom MCP responses?", a: "Yes. While Presenters are the best practice for Domain Entities (like Users or Projects), you can use the fluent ResponseBuilder for ad-hoc tool results. Just use `return respond().withData(val).build();` from within your action handler." },
      { q: "How do I add system rules to a custom response?", a: "Chain the .withSystemRule() method onto your ResponseBuilder. Instead of binding to a static definition, you inject instructions dynamically: `respond().withData(stats).withSystemRule('The conversion rate dropped, check analytics').build()`." },
      { q: "How do I return raw text instead of JSON?", a: "If an agent explicitly needs a raw text dump to parse manually, use `respond().withText(string).build()`. Unlike .withData(obj) which formats as JSON, this returns the raw string content as an MCP Text Content block." },
      { q: "Can a custom response include UI blocks for Claude Desktop?", a: "Yes. Use `respond().withUIBlock(component)` to inject custom UI payload elements, like a charting payload or custom markdown block. Clients that support richer UI rendering will present it to the user without confusing the AI's data payload." },
      { q: "Is ResponseBuilder type-safe?", a: "Yes. The ResponseBuilder provides a fully strictly typed fluent API. However, unlike Presenters, it does not enforce an egress Zod schema on your raw arbitrary data, so you must be careful not to leak sensitive attributes." },
    ],
  },

  'cookbook/context-aware-rules.md': {
    title: 'Context-Aware Rules Recipe — Dynamic Presenter System Rules',
    description: 'Create system rules that adapt to data and user context. Show admin-only rules for admins, filter sensitive guidance for guests, and inject role-aware directives.',
    faqs: [
      { q: "How do I inject dynamic system rules based on context?", a: "Presenters allow rules that evaluate the current row data natively. Pass a callback to `.withSystemRule(ctx => ctx.status === 'error' ? 'Analyze logs via system.logs tool' : null)`. The rule is only included if it returns a string." },
      { q: "Can system rules be aware of the user's role?", a: "Yes. The context object provides full access to the request's authentication state. You can conditionally append rules for admins only using `ctx.auth.role === 'admin'`. The AI agent will only learn about admin capabilities if the request was made by an administrative user." },
      { q: "Do context-aware rules affect token usage?", a: "They drastically reduce token usage. Because rules are evaluated lazily per-row, instructions are only injected when their exact failure condition or context trigger exists in the data. The prompt remains perfectly concise." },
      { q: "Can I use multiple context-aware rules in one Presenter?", a: "Absolutely. You can chain as many `.withSystemRule()` calls as necessary. Each rule can have independent trigger logic. MCP Fusion will evaluate all of them, strip out nulls, deduplicate exact matches, and concatenate the active rules for the agent." },
      { q: "How does context-aware rule resolution handle arrays?", a: "When calling .presentMany(), the Presenter will evaluate the conditional rules against EVERY item in the array. If 5 items trigger the same rule, the rule is injected only ONCE into the final `_systemRules` array to save LLM tokens." },
    ],
  },

  'cookbook/context-tree-shaking.md': {
    title: 'Context Tree-Shaking Recipe — Reduce Token Waste',
    description: 'Practical examples of context tree-shaking. Ensure each response only includes relevant system rules, eliminating cross-entity rule pollution and token waste.',
    faqs: [
      { q: "What is Context Tree-Shaking in MCP Fusion?", a: "Context Tree-Shaking is an AI optimization engine that automatically drops null, undefined, or duplicated system rules and affordances from the Presenter pipeline before sending the payload. It ensures zero LLM prompt pollution." },
      { q: "How does tree-shaking reduce hallucination?", a: "If an AI receives rules for error conditions when no errors exist, it may hallucinate context and try to fix a non-existent problem. Context Tree-Shaking removes irrelevant instructions based on current data state, maintaining absolute focus." },
      { q: "Does tree-shaking happen at compile time or run time?", a: "It happens purely at runtime. The rules are evaluated dynamically against the actual row data and runtime user context (like RBAC tokens). The tree-shaker then prunes the generated ruleset per-request." },
      { q: "Is context tree-shaking applied to nested Presenters automatically?", a: "Yes. Any rules bubbled up from child Presenters via .embed() or .embedMany() are subject to the same global deduplication and null-pruning passes on the parent Presenter level. There is absolute certainty the output is minified." },
      { q: "Do I need to enable tree-shaking manually?", a: "No. Context Tree-Shaking is a core architectural pillar of MCP Fusion and is enabled by default on all Presenters and ResponseBuilders. You literally just write declarative rules; the framework optimizes the token payload." },
    ],
  },

  'cookbook/select-reflection.md': {
    title: 'Select Reflection Recipe — Conditional Rule Resolution',
    description: 'Implement select reflection to resolve which system rules apply at response time. Data-driven, context-aware rule selection for fine-grained AI governance.',
    faqs: [
      { q: "How does Select Reflection work?", a: "Select Reflection is the design pattern of deriving AI instructions from the exact fields present in the response database record. If the `status` is 'failed', the Presenter reflects that by injecting a specific system rule on how to debug failures." },
      { q: "Why is Select Reflection better than global prompts?", a: "Global prompts apply equally to all entities, causing agents to execute irrelevant instructions. Select Reflection ensures the LLM only receives guidance that directly pertains to the specific entity it just acted upon." },
      { q: "Can Select Reflection trigger other tools?", a: "Yes. In the rule resolution, you can explicitly mention other MCP tools. For example, if a user's subscription record reflects an 'overdue' state, the Presenter rule can say 'To fix this, call billing.charge with the outstanding amount.'" },
      { q: "Does Select Reflection support complex business logic?", a: "Absolutely. Because Presenters run standard TypeScript, you can query external states, calculate derived fields, or check RBAC permissions to dynamically resolve whether a rule should be reflected into the AI agent's perception." },
      { q: "How does Select Reflection handle nested entities?", a: "When using Presenter.embed(), the child models also perform Select Reflection independently. Their resulting system rules are bubbled up intelligently without polluting the parent's data model." },
    ],
  },

  'cookbook/agentic-affordances.md': {
    title: 'Agentic Affordances Recipe — Guide AI to the Next Action',
    description: 'Implement suggestActions() to provide explicit next-step hints. Reduce tool-selection hallucination by telling the AI exactly what to do next based on data state.',
    faqs: [
      { q: "How do I suggest the next action to the AI agent?", a: "Use Agentic Affordances via `.suggestActions(['projects.update', 'projects.delete'])` on the Presenter or ResponseBuilder. This inserts an actionable hint into the response, drastically reducing hallucinations when the AI tries to figure out what to do next." },
      { q: "What is an Agentic Affordance?", a: "An affordance is a hint returned in the payload that tells the AI agent what capabilities are available relative to the data it just queried. It essentially creates HATEOAS (Hypermedia As The Engine Of Application State) but engineered specifically for autonomous LLMs." },
      { q: "Do Agentic Affordances prevent the AI from using other tools?", a: "No. Affordances act as strong suggestions, not hard restrictions. The AI agent fundamentally still controls its action loop, but suggesting the correct tool skips the 'search-and-discovery' phase, saving tokens and improving speed." },
      { q: "Can I provide dynamic affordances based on role?", a: "Yes. Using the Presenter context, you can conditionally serve `.suggestActions()`: give standard users `['read', 'comment']`, but give admins `['read', 'comment', 'delete', 'ban_user']`, preventing the AI from even attempting to call unauthorized actions." },
      { q: "Where do affordances appear in the MCP response?", a: "MCP Fusion automatically formats `.suggestActions()` into a strict array within the `_suggestedActions` key of the JSON payload. Most major models natively notice this key and prioritize it during iterative chain-of-thought routing." },
    ],
  },

  'cookbook/cognitive-guardrails.md': {
    title: 'Cognitive Guardrails Recipe — Cap Response Size for AI Safety',
    description: 'Implement .agentLimit() to prevent context overflow. Practical examples of truncation, filter guidance injection, and cost reduction with cognitive guardrails.',
    faqs: [
      { q: "How do I prevent context window overflow from large database queries?", a: "Use Cognitive Guardrails. Add `.agentLimit(50)` to your array Presenter. If the result exceeds 50 items, MCP Fusion returns the first 50 alongside an automated system rule instructing the AI to 'narrow the search using specific filters'." },
      { q: "Do cognitive guardrails save money?", a: "Yes. Returning 1,000 unpaginated rows could consume 300,000 tokens for a single read operation. Implementing limits truncates this to a safe token threshold, directly slashing API costs for LLM consumption." },
      { q: "What happens when a list is truncated by a guardrail?", a: "The framework intercepts the Array, truncates the extra items, and appends a `_cognitiveGuardrails` key to the payload. This key clearly informs the LLM that '150 items were omitted' so the agent knows its data view is partial." },
      { q: "Can the AI agent fix a truncated response?", a: "Yes, because Cognitive Guardrails proactively instruct the AI how to narrow its query. The guardrail typically suggests using the search or filter parameters on the tool, effectively teaching the AI how to paginate." },
      { q: "Should I handle pagination in the database or via guardrails?", a: "Both. Use Prisma's `take` and `skip` for efficient database querying, but ALSO use `.agentLimit()` as an emergency fail-safe against bad AI inputs (like an AI accidentally requesting 500 records and blowing up your Claude token limits)." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COOKBOOK — TOOL BUILDING
  // ═══════════════════════════════════════════════════════
  'cookbook/hierarchical-groups.md': {
    title: 'Hierarchical Groups Recipe — Organize Thousands of Actions',
    description: 'Use nested .group() to organize 5,000+ operations into a clean hierarchy. Practical pattern for platform-level tools with multi-domain action consolidation.',
    faqs: [
      { q: "How do I group tools hierarchically in MCP Fusion?", a: "Use nested `.group()` definitions within your `ToolBuilder`. You can create a high-level `platform.group('aws')` which itself parses sub-groups like `ec2` or `s3`, resulting in structured tool names like `aws.s3.createBucket`." },
      { q: "Do tool groups affect middleware execution?", a: "Yes. Middleware is scoped hierarchically. If you attach an auth middleware to the `aws` group, every single action within `aws.ec2` or `aws.s3` automatically inherits that middleware. It's the most secure way to enforce RBAC." },
      { q: "Is there a limit to how deeply I can nest groups?", a: "No hard limit, but practically, 2-3 levels deep (e.g., `provider.service.action`) is recommended. Extremely long tool names can consume unnecessary tokens in the AI's prompt when the tool definitions are exposed." },
      { q: "Does hierarchical grouping help with Context Tree-Shaking?", a: "Yes. By clustering related actions, the MCP client can be configured to selectively expose only specific groups to the LLM based on user intent, vastly reducing the initial tool listing overhead." },
      { q: "Can I apply rate limiting at the group level?", a: "Absolutely. When you attach a `.withMiddleware(rateLimiter)` guard to a parent group, the concurrency limits and rate thresholds apply collectively to all child tool executions within that namespace." },
    ],
  },

  'cookbook/functional-groups.md': {
    title: 'Functional Groups Recipe — Domain-Based Tool Organization',
    description: 'Organize related actions into functional groups by domain. Users, billing, projects — each group with its own middleware, descriptions, and action handlers.',
    faqs: [
      { q: "What is the Functional Grouping pattern?", a: "It's a structural pattern where you split your server code into domain-specific files (e.g., `billingTools.ts`, `userTools.ts`) and export a `.group()` from each. The main router then just registers these functional groups." },
      { q: "How does functional grouping improve code maintainability?", a: "It limits file sizes and ensures Domain-Driven Design (DDD). Instead of a monolithic router with 200 actions, you have isolated, testable modules where actions, schemas, and domain-specific middleware live together." },
      { q: "Can two functional groups share the same middleware?", a: "Yes. You can export a shared middleware function (like `requireAdmin`) and pass it to multiple distinct functional groups using their respective `.withMiddleware()` methods." },
      { q: "How do I share a database client across functional groups?", a: "Define your database client as a singleton or inject it via a global middleware context before the functional groups execute. This way, `ctx.db` is strictly typed and available to every handler." },
      { q: "Does functional grouping change how the AI sees the tools?", a: "It affects the tool name prefix. A functional group named `'billing'` containing an action `'charge'` will be exposed to the LLM as `'billing.charge'`. Clean naming helps the AI infer tool relationships." },
    ],
  },

  'cookbook/tool-exposition.md': {
    title: 'Tool Exposition Recipe — Optimize Tool Visibility to AI',
    description: 'Control how tools appear to AI agents. Set descriptions, TOON descriptions, annotations, and semantic hints for optimal tool selection and minimal token usage.',
    faqs: [
      { q: "Why is tool description important in MCP?", a: "The description is the ONLY way the AI understands what a tool does. A poor description leads to hallucination and incorrect arguments. A great description clearly states the intent, requirements, and strict formatting of the inputs." },
      { q: "How do I add a description to a tool in MCP Fusion?", a: "Use the `.describe('Your robust description')` method directly on the tool definition fluent chain. You can also use `.describeToon()` if you want to provide a specialized, highly compressed TOON description." },
      { q: "How can I hide a tool from the AI agent?", a: "You can temporarily disable exposition by not registering the tool, or you can implement dynamic tool gating where the server only exposes specific tools to the client during the initialization handshake based on user permissions." },
      { q: "Do Zod schemas affect tool exposition?", a: "Massively. The Zod input schemas are translated into standard JSON Schema format and passed alongside the description. Using `.describe()` on Zod properties is highly recommended as it adds inline hints to individual arguments." },
      { q: "Should I include examples in the tool description?", a: "Yes. Including a 1-line syntax example at the end of the tool description significantly increases the LLM's success rate, especially when dealing with complex formatting like CRON strings or precise date formats." },
    ],
  },

  'cookbook/error-handling.md': {
    title: 'Error Handling Recipe — Self-Healing Errors in Practice',
    description: 'Implement toolError() with recovery hints, suggested arguments, and error codes. Practical patterns for not-found, validation, auth, and rate-limit errors.',
    faqs: [
      { q: "How should I throw errors in an MCP action handler?", a: "Use `return toolError('Error message')` instead of native `throw new Error()`. Native exceptions often crash the process or return opaque 500s. `toolError` returns a strictly formatted failure object that the AI can elegantly parse." },
      { q: "How do self-healing errors work?", a: "When you return a `toolError`, use the `.withSuggestedArgs()` method to tell the AI exactly how to fix its mistake. If the AI sends an invalid ID format, the server responds: 'Failed. Try again using the UUID format: e.g. 123e4567...'." },
      { q: "Does the AI retry automatically after an error?", a: "Yes, modern clients like Claude Desktop implement inner-loop retries. If your MCP Fusion tool returns a well-structured `toolError` containing recovery instructions, the LLM will automatically fix its payload and trigger the tool again." },
      { q: "How do I return specific HTTP-style error codes?", a: "Use the chained `.withCode()` method, e.g., `toolError('Not Found').withCode('NOT_FOUND')`. This establishes deterministic error states instead of relying on string parsing, allowing programmatic error handling in Agentic workflows." },
      { q: "Can I attach system rules to an error response?", a: "Yes. Like a normal response, a `toolError` can be chained with `.withSystemRule()`. This allows you to aggressively inject a permanent behavioral correction into the AI's context window after a critical mistake." },
    ],
  },

  'cookbook/result-monad.md': {
    title: 'Result Monad Recipe — Composable Type-Safe Error Handling',
    description: 'Use succeed() and fail() to build composable, exception-free error pipelines. Chain validations, database lookups, and permission checks with full type narrowing.',
    faqs: [
      { q: "What is the Result Monad in MCP Fusion?", a: "It is an exception-free error handling pattern inspired by Rust. Instead of using `try/catch` which loses TypeScript type safety, you return `succeed(data)` or `fail(error)`. The caller then checks `.isSuccess()` to narrow the types." },
      { q: "Why is a Monad better than try/catch for AI tools?", a: "Because `throw` breaks control flow unpredictably. In autonomous AI systems, unhandled exceptions cause fatal workflow halts. A Result Monad forces the developer to explicitly handle failure states at compile time, guaranteeing graceful degradation and proper `toolError` generation." },
      { q: "How do I chain multiple operations using the Result Monad?", a: "You can execute sequential checks. If user lookup fails, return `fail('User not found')`. If balance is low, return `fail('Insufficient funds')`. At the end, return `succeed(result)`. The handler receives this and maps the failures directly to self-healing MCP `toolError`s." },
      { q: "Does the Result Monad affect Zod validation?", a: "It complements it. Zod handles the raw input validation boundary via the ToolBuilder. The Result Monad handles the complex *business logic* failures inside the handler, like transaction conflicts or database deadlocks." },
      { q: "Is the Result Monad mandatory in MCP Fusion?", a: "No, it is entirely optional. You can use standard `try/catch` or plain promise rejection if you prefer. However, the monad approach is highly recommended for mission-critical enterprise deployments where deterministic error flow is required." },
    ],
  },

  'cookbook/streaming.md': {
    title: 'Streaming Recipe — Real-Time Progress Updates for AI Tools',
    description: 'Use generator handlers with yield progress() for real-time streaming. Show completion percentage, status messages, and incremental results during long operations.',
    faqs: [
      { q: "Does MCP support streaming responses?", a: "Yes. MCP Fusion implements this via Generator Handlers (`function*`). By yielding partial progress objects during long operations, the AI client can display real-time updates to the end user without waiting for the final response." },
      { q: "How do I yield progress in an MCP Fusion tool?", a: "Instead of a standard async function, use `function* ()`. Inside the handler, call `yield progress({ status: 'Processing step 1', percent: 25 })`. Once complete, use `return respond().withData(finalResult).build()`." },
      { q: "Is streaming supported by all MCP clients?", a: "While the underlying MCP protocol supports progress streams natively, not every single chat interface renders the progress UI perfectly. However, providing progress chunks ensures the connection doesn't time out during massive backend operations." },
      { q: "Can I stream the actual final data payload incrementally?", a: "Currently, MCP progress events are meant for status updates (e.g., 'Downloaded 30%'), not necessarily appending to a unified JSON result dynamically. You yield status dicts and then return the final aggregated payload at the end." },
      { q: "Does yielding progress consume extra LLM tokens?", a: "No. The progress events are intercepted by the client GUI (like Cursor or Claude) to update the visual loading state. They are NOT appended to the LLM's context window, meaning there is zero token cost for highly granular streaming." },
    ],
  },

  'cookbook/cancellation.md': {
    title: 'Cancellation Recipe — Cooperative AbortSignal Patterns',
    description: 'Pass AbortSignal through handlers to cancel fetch, database queries, and generators. Prevent zombie operations when users click Stop in MCP clients.',
    faqs: [
      { q: "How do I handle cancellation in an MCP tool?", a: "MCP Fusion automatically passes a standard `AbortSignal` inside the handler's `ctx`. By passing `ctx.signal` downstream to `fetch` calls or database drivers, the task cancels immediately if the user stops the generation in their AI client." },
      { q: "What happens if I don't implement AbortSignal?", a: "You risk creating zombie processes. If a user asks Claude to run a heavy 3-minute database query but then immediately hits 'Stop', the server will continue wasting resources in the background because it doesn't know the client disconnected." },
      { q: "How do I throw an abort error safely?", a: "If you detect `ctx.signal.aborted` during a long loop, you should throw `new DOMException('Aborted', 'AbortError')` or use `.throwIfAborted()`. MCP Fusion detects this standard exception type and cleans up the transaction gracefully without returning a 500." },
      { q: "Do Prisma and other ORMs support AbortSignal?", a: "Many do natively, or they provide mechanisms for passing signals into the query execution context. For generic promises, you can use `Promise.race` against a cancellation promise linked to the `ctx.signal`." },
      { q: "Does cancellation work on server-sent events (SSEServerTransport)?", a: "Yes. When the client closes the HTTP connection during SSE execution, the adapter detects the socket closure and immediately fires the `AbortSignal` inside your active handler." },
    ],
  },

  'cookbook/auth-middleware.md': {
    title: 'Auth Middleware Recipe — Authentication & Authorization Guards',
    description: 'Implement authentication middleware with context derivation. Verify tokens, resolve user identity, enforce RBAC, and short-circuit unauthorized requests.',
    faqs: [
      { q: "How do I secure my MCP tools with Authentication?", a: "You define a global `.withGlobalMiddleware()` or group-specific `.withMiddleware()` that intercepts the request, reads custom headers or payload metadata, verifies the identity (e.g., JWT validation), and hydrates `ctx.user`." },
      { q: "Can middleware reject unauthorized requests?", a: "Yes. If the user lacks permissions, your middleware can return a `toolError('Unauthorized').withCode('FORBIDDEN')`. This immediately short-circuits the request pipeline, bypassing the action handler completely and returning the error to the LLM." },
      { q: "How do I type my custom authentication context?", a: "MCP Fusion uses a robust generic type system. When defining your toolbuilder, you pass a custom `Context` interface. The Auth middleware's job is mapping the base transport context into a strictly typed `Context` with the `user` property guaranteed." },
      { q: "Should the AI agent pass the auth token as an argument?", a: "No. Never expose tokens into the AI's prompt space. Authentication should happen transparently at the transport layer (e.g., HTTP headers via the connector) so the LLM remains completely oblivious to the secure lifecycle." },
      { q: "Does middleware affect Context Tree-Shaking?", a: "Indirectly. Middleware establishes the secure runtime `ctx` (like user roles). Presenters then evaluate that exact context to conditionally inject system rules. If RBAC middleware assigns a 'guest' role, the Presenter will automatically strip any 'admin' instructions." },
    ],
  },

  'cookbook/prompts.md': {
    title: 'Prompts Recipe — Define & Register MCP Prompts',
    description: 'Create reusable MCP prompts with arguments, message builders, and Presenter integration. Register prompts in PromptRegistry for discoverable AI instructions.',
    faqs: [
      { q: "What is an MCP Prompt?", a: "An MCP Prompt is a registered template that an AI client can query to bootstrap its context window. It usually contains system instructions, base rules, and foundational context data to kickstart a specialized generative workflow." },
      { q: "How do I define a prompt in MCP Fusion?", a: "Use the `PromptBuilder` fluent API (`prompt('name')`). You can chain `.describe()`, define structured arguments with `.withArgs()`, and construct the resulting payload inside the `.withHandler()` using standard MCP message blocks." },
      { q: "Can prompts take dynamic arguments?", a: "Yes. By using Zod schemas in `.withArgs()`, the prompt requires arguments (like `projectId`). The client UI can display form fields to the user, and the handler uses those strictly typed arguments to query the DB and build context." },
      { q: "Can I use Presenters inside a Prompt handler?", a: "Absolutely! The best practice is to load data from standard repositories and route it through a Presenter to strip PII and apply rules, then embed that structured Presenter output directly into the prompt's `respond().withText()` or resource blocks." },
      { q: "How do prompts differ from standard MCP tools?", a: "Tools are actions the AI chooses to execute dynamically during a conversation. Prompts are predefined contexts executed *before* or *at the start* of a conversation by the human user to initialize the agent's behavior." },
    ],
  },

  'cookbook/runtime-guards.md': {
    title: 'Runtime Guards Recipe — Concurrency & Payload Protection',
    description: 'Configure concurrency bulkhead and egress limiters per tool. Prevent thundering herd, OOM crashes, and context overflow with built-in runtime safety guards.',
    faqs: [
      { q: "What are Runtime Guards in MCP Fusion?", a: "Runtime Guards are built-in protection patterns (like the Bulkhead pattern) that prevent AI agents from destabilizing your server. They manage concurrency limits, timeout bounds, and maximum execution rates at the individual tool level." },
      { q: "How do I limit concurrency for an expensive tool?", a: "You can apply a concurrency guard via middleware. If an AI agent tries to execute 50 parallel instances of an expensive PDF scraping tool, the middleware will accept the first N requests and immediately fail the rest with a clear error instruction for the AI to 'slow down'." },
      { q: "What is an Egress payload limiter?", a: "Payload limits protect the memory of both the MCP server and the AI client. A runtime guard checks the response byte size before transmission. If the tool generates a 50MB log file, the guard intercepts it, aborts transmission, and sends an error commanding the AI to use pagination." },
      { q: "Can runtime guards protect against 'Thundering Herd' scenarios?", a: "Yes. In multi-agent environments where swarm agents might dogpile a single resource (like a specific database query), concurrency guards act as a bulkhead, shedding load predictably so the server stays healthy." },
      { q: "Are runtime guards configurable per environment?", a: "Absolutely. You can inject environment variables into your runtime guards. This allows you to set aggressive concurrency limits in production while relaxing them for local `fusion dev` testing." },
    ],
  },

  'cookbook/self-healing-context.md': {
    title: 'Self-Healing Context Recipe — Automatic Error Recovery Loops',
    description: 'Build self-healing tools where AI agents automatically retry with corrected parameters. Recovery actions, suggested args, and structured error flows.',
    faqs: [
      { q: "What is a Self-Healing Context?", a: "It is an engineering pattern where, instead of just failing, an MCP tool analyzes the error and returns a highly structured response instructing the AI exactly how to recover. The LLM reads this and silently retries with the correct parameters." },
      { q: "Why is self-healing better than regular error throwing?", a: "Standard errors break the agent's chain of thought, forcing it to guess the root cause. A self-healing context acts as a deterministic guide-rail, turning runtime failures into successful recovery loops without human intervention." },
      { q: "How do I implement suggested arguments for recovery?", a: "When returning a `toolError`, use `.withSuggestedArgs({ key: 'correctValue' })`. MCP Fusion formats this so the AI explicitly sees the parameter it must change. It drastically improves the speed at which models like Claude fix their own API calls." },
      { q: "Can I suggest different tools for error recovery?", a: "Yes. Combined with Agentic Affordances, your error response can use `.suggestActions(['auth.login'])`. If a tool fails due to missing credentials, the AI is immediately directed to execute the login tool before retrying the original action." },
      { q: "How do I prevent infinite loops in self-healing tools?", a: "MCP clients keep a token budget and context window limit. However, best practice is to attach a failure count to the session context or restrict the `toolError` loop to simply returning 'Final Failure: Do not retry' after a designated threshold." },
    ],
  },

  'cookbook/toon.md': {
    title: 'TOON Encoding Recipe — Save 40% on LLM Tokens',
    description: 'Use TOON (Token-Oriented Object Notation) for compact responses. Pipe-delimited tabular data that reduces token count by 30-50% while remaining LLM-parseable.',
    faqs: [
      { q: "What is TOON Encoding?", a: "TOON stands for Token-Oriented Object Notation. It's an MCP Fusion innovation that serializes flat JSON arrays into a heavily compressed, pipe-delimited scalar format. It's designed specifically to pack densely into the LLM context window." },
      { q: "How much token savings does TOON provide?", a: "Typically 30% to 50% compared to standard JSON arrays. By eliminating thousands of repetitive JSON keys, quotes, and brackets, the sheer number of tokens passed to the LLM is drastically reduced, shrinking latency and costs." },
      { q: "Can LLMs successfully parse TOON formats?", a: "Yes. State-of-the-art models like Claude 3.5 Sonnet and GPT-4o are native experts at parsing tabular, pipe-delimited data. MCP Fusion automatically injects a tiny decoder key into the system rules so the AI understands exactly which column is which." },
      { q: "How do I enable TOON encoding in a Presenter?", a: "You simply call `.useToonEncoding()` on your Presenter configuration. When returning arrays of data, MCP Fusion automatically intercepts the outbound JSON, converts it to TOON scalars, and seamlessly injects the map schema for the agent." },
      { q: "Is TOON suitable for heavily nested data?", a: "No. TOON is heavily optimized for flat arrays (like a vast list of server logs or users). For deeply nested models, standard JSON representation remains the best practice. You should apply Context Tree-Shaking to nested objects instead." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COOKBOOK — GOVERNANCE
  // ═══════════════════════════════════════════════════════
  'cookbook/capability-lockfile.md': {
    title: 'Capability Lockfile Recipe — Lock Your Tool Surface',
    description: 'Generate, commit, and validate capability lockfiles in CI/CD. Step-by-step guide to freezing your MCP tool surface for audit and compliance.',
    faqs: [
      { q: "How do I create a capability lockfile?", a: "Run `npx fusion lock` in the root of your project. This CLI command scans all your registered tools, presenters, and middleware, extracting their exact Zod schemas and structural definitions into an `mcp-fusion.lock.json` file." },
      { q: "What should I do with the generated lockfile?", a: "You must commit `mcp-fusion.lock.json` to your version control system (e.g., Git). This ensures that every member of the team and your CI/CD pipelines are validating against the exact same intended tool specifications." },
      { q: "Does the lockfile track Presenter schemas?", a: "Yes. The capability lockfile natively serializes the exact egress schemas declared in your MVA Presenters. If a developer accidentally exposes an internal database ID in a Presenter, the lockfile diff will expose it instantly." },
      { q: "Can a lockfile detect undocumented destructive tools?", a: "Absolutely. When `npx fusion lock` runs, it enforces that any action mutating state must be explicitly annotated. The lockfile freezes these `destructive: true` flags, preventing silent authorization escalation later." },
      { q: "How do I ignore specific experimental tools from the lockfile?", a: "Use the `.excludeFromGovernance()` modifier on your tool builder. This is highly useful for temporary or highly fluid prototype tools that you don't want triggering CI/CD schema alerts on every minor tweak." },
    ],
  },

  'cookbook/contract-diffing.md': {
    title: 'Contract Diffing Recipe — Track Tool Definition Changes',
    description: 'Generate diffs between lockfile versions to see exactly what changed. Integrate contract diffing into PR reviews for safe tool surface evolution.',
    faqs: [
      { q: "How do I compare two capability lockfiles?", a: "Use `npx fusion diff`. When executed locally or in CI, this command compares your current working tree's tool schemas against the main branch's committed `mcp-fusion.lock.json` to produce a detailed structural change report." },
      { q: "What formats can the contract diff output?", a: "By default, `npx fusion diff` provides a color-coded terminal output. However, you can use `--format markdown` to generate a GitHub PR comment, or `--format json` to programmatically pipe the diff into automated security evaluation tools." },
      { q: "Can contract diffing detect removed input parameters?", a: "Yes. The diffing engine runs a deep structural equality check on the Zod AST (Abstract Syntax Tree). If an optional parameter is made required, or a required parameter is deleted entirely, it is explicitly flagged as a breaking change." },
      { q: "How does contract diffing improve AI agent safety?", a: "It guarantees zero undocumented capability drift. A developer cannot silently add a `delete_user` tool to an existing billing namespace without the contract diff explicitly broadcasting the new `destructive` capability to the Pull Request reviewers." },
      { q: "Is contract diffing compatible with GitHub Actions?", a: "Yes. MCP Fusion provides native recipes for executing the diff command inside GitHub Actions, automatically appending the resulting markdown table as a persistent comment on the active PR so security teams have full oversight." },
    ],
  },

  'cookbook/blast-radius.md': {
    title: 'Blast Radius Recipe — Measure Change Impact Before Deploy',
    description: 'Quantify the blast radius of tool surface changes. Identify affected actions, consumers, and risk level before merging changes to production.',
    faqs: [
      { q: "How do I calculate the blast radius of my MCP tools?", a: "Run `npx fusion analyze`. This statically maps the dependency graph of your server's routing table, pinpointing exactly how many sub-actions, presenters, and rules are impacted when you modify a core shared schema." },
      { q: "What metrics are included in a blast radius report?", a: "The CLI outputs a Risk Score, the total count of impacted end-user actions, the list of affected Agentic Affordances, and flags any potential disruptions to interconnected Context-Aware System Rules." },
      { q: "Can the CLI block high-risk deployments?", a: "Yes. You can configure `npx fusion analyze --fail-threshold 80`. If a developer modifies a global auth middleware that impacts every single tool, the blast radius score will exceed 80 and exit with code 1, halting the CI pipeline." },
      { q: "Does blast radius analysis execute my code?", a: "No. It uses AST (Abstract Syntax Tree) static analysis and TypeScript introspection to evaluate the capability map safely. It requires zero active LLM tokens and does not execute any live database logic or action handlers." },
      { q: "How does this help QA teams test AI agents?", a: "Instead of running a full integration test suite for every minor schema change, QA and Security teams can use the blast radius output to perform targeted regression testing only on the specific endpoints mathematically proven to be affected." },
    ],
  },

  'cookbook/token-economics.md': {
    title: 'Token Economics Recipe — Budget & Optimize LLM Costs',
    description: 'Estimate per-tool token consumption, identify expensive patterns, and optimize prompt size. Practical patterns for reducing LLM API spend.',
    faqs: [
      { q: "How can I estimate the LLM token cost of my tools?", a: "Execute `npx fusion tokens`. This built-in governance utility parses your tools' Zod schemas, descriptions, and TOON annotations to provide an estimated prompt overhead in tokens using standard BPE (Byte-Pair Encoding) models." },
      { q: "Can I identify the most expensive tools in my server?", a: "Yes. The `npx fusion tokens` command automatically ranks your tools from most expensive to least expensive based on string density, nested schema depth, and Presenter configuration, letting you pinpoint token hogs immediately." },
      { q: "What is the fastest way to shrink my token footprint?", a: "Rewrite your conversational English tool descriptions into TOON (Token-Oriented Object Notation) shorthand via `.describeToon()`, and enforce Context Tree-Shaking to prevent global system rules from unnecessarily inflating individual AI contexts." },
      { q: "Does token economics account for runtime array sizes?", a: "Yes. The token command evaluates any `.agentLimit(N)` constraints on your Presenters. If you cap a users array at 50, the analyzer reliably calculates the absolute maximum token payload boundary for that specific tool." },
      { q: "Can I enforce a maximum token budget per tool?", a: "Yes. Using the CLI, you can set a global or per-tool ceiling (e.g., `--max-tokens 500`). If a developer attempts to merge a massive, unoptimized Zod schema that exceeds this limit, the CI pipeline will reject the change." },
    ],
  },

  'cookbook/semantic-probe.md': {
    title: 'Semantic Probe Recipe — Audit Tool Descriptions with AI',
    description: 'Use semantic probing to evaluate tool description quality. Detect ambiguous, confusing, or misleading descriptions before they cause AI hallucination.',
    faqs: [
      { q: "How do I run a semantic probe on my definitions?", a: "Use `npx fusion probe`. This command securely connects to a judge LLM (using your local API keys) and evaluates the human/AI readability, precision, and contextual clarity of every tool description and parameter schema in your repository." },
      { q: "What kind of errors does the semantic probe detect?", a: "It detects 'Intent Collision' (where two tools sound identical), vague phrasing (e.g., 'Does stuff with users'), missing parameter explanations, and conversational bloat that wastes tokens without adding functional clarity." },
      { q: "Do semantic probes rewrite descriptions for me?", a: "Yes. When the probe analyzer identifies a poorly optimized description, it automatically generates a suggested TOON representation and offers to structurally patch the source code, maximizing LLM deterministic accuracy." },
      { q: "Is the semantic probe required for production deployment?", a: "No, it is an optional developer experience tool. It is highly recommended to run it locally before committing a massive new group of tools to ensure the LLM routing layer will actually understand how to use your new capabilities." },
      { q: "Can I mock the semantic probe API connection?", a: "The true value of semantic probing relies on querying an actual state-of-the-art LLM. However, you can configure the CLI to use a smaller, faster local model via Ollama to perform continuous, free structural checks during local development." },
    ],
  },

  'cookbook/zero-trust-attestation.md': {
    title: 'Zero-Trust Attestation Recipe — Verify Tool Integrity',
    description: 'Implement cryptographic attestation for tool definitions. Verify tool surface integrity at startup and reject tampered definitions in production.',
    faqs: [
      { q: "How do I cryptographically sign an MCP lockfile?", a: "Use `npx fusion attest`. This command digests the current `mcp-fusion.lock.json` and uses your enterprise PKI (like AWS KMS) or a local private key to generate an immutable `.sig` attestation artifact." },
      { q: "Why is attestation necessary for high-security agents?", a: "It prevents supply chain attacks. If a malicious script running on your CI/CD server modifies the compiled JavaScript to silently expose a `delete_database` tool, the production server will reject the startup sequence because the cryptographic signature will not match the compiled AST." },
      { q: "How does the MCP Fusion server verify the signature at runtime?", a: "During the bootstrap phase, you initialize the `ToolRegistry` with `.requireAttestation(publicKey)`. The framework will verify the `.sig` file against the live memory capabilities graph before opening the SSE or stdio transports." },
      { q: "Does attestation work with keyless signing infrastructure like Sigstore?", a: "Yes. The attestation hooks in MCP Fusion are fully pluggable. You can configure the validation layer to require valid OIDC-backed Sigstore (Fulcio/Rekor) transparency logs, integrating seamlessly into modern zero-trust pipelines." },
      { q: "What happens if a developer creates a tool but forgets to sign it?", a: "If the server is configured with `.requireAttestation()`, it enforces a strict zero-trust posture. It will immediately throw a `FATAL: Attestation Mismatch` error and refuse to boot, ensuring that unverified tool surfaces cannot be exploited by an agent." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COOKBOOK — PRODUCTION
  // ═══════════════════════════════════════════════════════
  'cookbook/observability.md': {
    title: 'Observability Recipe — Debug Observer for MCP Tools',
    description: 'Set up createDebugObserver() for real-time tool execution logging. Typed events for tool:start, tool:end, tool:error, and middleware stages.',
    faqs: [
      { q: "How do I monitor MCP tool executions?", a: "MCP Fusion provides an integrated Observability API. You can attach a global `createDebugObserver()` or build a custom observer that listens to `tool:start`, `tool:end`, `tool:error`, and middleware events in real-time." },
      { q: "Can I log the exact JSON payload the AI sent?", a: "Yes. The `tool:start` event contains the raw unvalidated payload and the `tool:end` event contains the final Zod-validated arguments. This is invaluable for debugging hallucinated arguments generated by the LLM." },
      { q: "Is the observer synchronous or asynchronous?", a: "Observers execute synchronously within the handler execution pipeline to guarantee they capture the exact `Date.now()` timestamps. However, you should offload heavy logging (like hitting Datadog APIs) to asynchronous background promises." },
      { q: "How do I filter sensitive data from logs?", a: "You can implement a custom observer class that traverses the `args` payload and masks keys like `password`, `token`, or `credit_card` before passing the event object to your internal logging service." },
      { q: "Does the observer track middleware execution?", a: "Yes. MCP Fusion emits specific `middleware:start` and `middleware:end` events. This allows you to pinpoint exactly if an execution delay was caused by the database query in the handler, or the RBAC check in the middleware." },
    ],
  },

  'cookbook/tracing.md': {
    title: 'Tracing Recipe — OpenTelemetry Spans for MCP Tools',
    description: 'Add OpenTelemetry-compatible tracing to your MCP server. One line enables spans for all tools with enterprise error classification and zero-overhead when disabled.',
    faqs: [
      { q: "Does MCP Fusion support OpenTelemetry?", a: "Yes. The framework includes native support for OpenTelemetry (OTel) context propagation. When enabled, every MCP tool execution automatically generates a child Span under the active Trace context." },
      { q: "What metadata is attached to the OTel spans?", a: "By default, MCP Fusion attaches the `tool.name`, `tool.group`, execution duration, and if applicable, the `error.message` and `error.code` if the tool fails. The span status is automatically marked as ERROR for visibility in systems like Jaeger or New Relic." },
      { q: "How do I pass the active Trace ID from the AI client to the MCP server?", a: "The client must pass the `traceparent` header during the HTTP SSE handshake or as metadata in the JSON-RPC root request. MCP Fusion's router will automatically extract and hydrate this into the active context." },
      { q: "Can I create custom nested spans inside my tool handler?", a: "Absolutely. Since the base context is OpenTelemetry-compliant, you can grab the current span from the global OTel API and create child spans for specific heavy operations (like a massive database aggregation) within your action." },
      { q: "Is there any performance overhead if I disable tracing?", a: "No. The tracing interceptor is functionally a no-op when no OTel exporter or provider is configured in the underlying Node.js environment. It uses `Optional<Span>` patterns internally to ensure zero CPU waste." },
    ],
  },

  'cookbook/introspection.md': {
    title: 'Introspection Recipe — Runtime Tool Inspection',
    description: 'Use getActionNames(), getActionMetadata(), and previewPrompt() to inspect tools at runtime. Debug, document, and optimize your tool definitions.',
    faqs: [
      { q: "What is Tool Introspection?", a: "Introspection is the ability to programmatically query your MCP server's routing table at runtime. You can ask the server for a list of all registered tools, their descriptions, their Zod schemas, and their attached metadata." },
      { q: "How do I get a list of all registered tools?", a: "Call `server.getRouter().getActionNames()`. This returns an array of fully qualified strings like `['users.create', 'users.delete', 'billing.charge']`." },
      { q: "Can I extract the Zod schema of a tool dynamically?", a: "Yes. You can call `server.getRouter().getActionMetadata('users.create')`. This returns the internal definition object, including the raw `schemas.input` Zod object, allowing you to build dynamic UI forms or documentation on the fly." },
      { q: "How do I test my Agentic Affordances locally?", a: "You can use the introspection API in a test script to evaluate a Presenter with mock data and instantly console.log the generated `_systemRules` and `_suggestedActions` without needing to spawn Claude Desktop." },
      { q: "Is runtime introspection secure?", a: "Yes. The introspection API is typically used internally by the server initialization logic or local testing scripts. The external MCP client can only introspection via the official `tools/list` protocol command, which goes through standard exposition filtering." },
    ],
  },

  'cookbook/state-sync.md': {
    title: 'State Sync Recipe — Cache Signals for AI Agents',
    description: 'Implement cacheSignal() and invalidates() for temporal awareness. Prevent stale data reads and reduce redundant API calls with RFC 7234-inspired patterns.',
    faqs: [
      { q: "How do I implement caching for MCP tools?", a: "Use the `cacheSignal()` modifier on read operations. If you declare `.cacheSignal('max-age=60')`, the AI client (if it supports caching) knows it can reuse the previous tool response for 60 seconds without calling your server again." },
      { q: "What happens if local data changes while the AI's cache is valid?", a: "You must use the `.invalidates()` affordance on your destructive tools. If the AI calls `user.update`, that tool should declare it invalidates the `user.get` cache. The AI orchestrator will immediately purge the stale read." },
      { q: "Does cacheSignal reduce LLM costs?", a: "Dramatically. By preventing the AI from redundantly querying the same status endpoint in a frantic loop (e.g., 'Is the job done yet?'), you save both server database load and the massive LLM token cost associated with the response payload." },
      { q: "How do I handle ETag-based caching?", a: "You can return an `_etag` inside your custom ResponseBuilder payload. In the next request, the AI client passes the ETag back via arguments, and your handler can return a lightweight `304 Not Modified` equivalent if the data hasn't changed." },
      { q: "Is State Sync supported by all LLMs?", a: "State Sync relies on the client orchestrator (like Cursor or an automated Agent script) respecting cache directives. Direct conversational LLMs might ignore it, but modern autonomous agent frameworks treat cache signals as strict rules." },
    ],
  },

  'cookbook/testing.md': {
    title: 'Testing Recipe — FusionTester Quick Patterns',
    description: 'Common testing patterns with FusionTester: assert PII stripping, verify system rules, check RBAC guards, and validate UI blocks — all in-memory, zero tokens.',
    faqs: [
      { q: "How do I write unit tests for an MCP tool?", a: "Use `FusionTester`. It simulates an exact MCP JSON-RPC call entirely in-memory. You pass the tool name and payload, and it bypasses network transports, instantly returning the structured outcome object for assertions." },
      { q: "How do I test that a Presenter strips PII?", a: "Write a Jest/Vitest check: pass a raw database object containing a password field into the `FusionTester`. Then assert that `expect(result.data.password).toBeUndefined()`. This guarantees your Zod egress schema is correctly pruning dangerous fields." },
      { q: "Can I test Context-Aware System Rules?", a: "Yes. Execute a tool using `FusionTester` with mock context (e.g., role: 'guest'), then assert the resulting `result._systemRules` array. Run it again with `role: 'admin'` and verify the admin-specific instructions successfully injected." },
      { q: "Does FusionTester require an LLM API key?", a: "No! FusionTester strictly tests your server's logic, validation, grouping, and Presenter rendering. It uses zero tokens, costs zero dollars, and executes in milliseconds, making it perfect for CI/CD pipelines." },
      { q: "How do I mock external APIs during a tool test?", a: "Because MCP Fusion is standard Node.js/TypeScript, you can use standard mocking libraries like `msw` (Mock Service Worker), `nock`, or `jest.spyOn()` to mock external fetch calls independently from the MCP routing logic." },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COMMON ISSUES
  // ═══════════════════════════════════════════════════════
  'common-issues/index.md': {
    title: 'Common Issues in Agentic Systems — Failure Modes & Solutions',
    description: 'Catalog of the most common failure modes in AI agent systems: partial failures, parameter hallucination, thundering herd, context overflow, stale data, blind retries, data leaks, and race conditions. How MCP Fusion solves each one at the framework level.',
    faqs: [
      { q: 'What are the most common failure modes in AI agent systems?', a: 'The eight most common failure modes are: (1) Partial failure in multi-step operations — agent completes some steps but not all, leaving corrupted state. (2) Parameter hallucination — agent invents fields that don\'t exist. (3) Thundering herd — agent fires identical destructive calls simultaneously. (4) Context window overflow — unbounded response sizes crash the agent. (5) Stale data after mutations — agent acts on outdated cached data. (6) Blind retry loops — agent retries with the same bad parameters. (7) Data leaking to the LLM — sensitive fields like password hashes reach the context. (8) Race conditions on destructive operations — concurrent delete and update on the same record.' },
      { q: 'How does MCP Fusion prevent partial failures in multi-step workflows?', a: 'Instead of exposing each step as a separate tool (where the agent controls ordering and has no transaction boundary), MCP Fusion composes the entire workflow into a single f.mutation() tool. The handler orchestrates all steps internally with try/catch compensation logic. If step 3 fails, it rolls back steps 2 and 1 before returning a self-healing error. The agent sees one tool, one call, one result — atomicity is a property of the server, not the client.' },
      { q: 'How does MCP Fusion handle parameter hallucination by AI agents?', a: 'Every tool schema in MCP Fusion is compiled with Zod .strict() at build time. When an agent invents parameters that don\'t exist in the schema (like "isAdmin" or "priority"), the framework rejects them before they reach the handler with an actionable correction prompt listing valid fields. The agent self-corrects on the next attempt.' },
      { q: 'What is the thundering herd problem in AI agents?', a: 'When an LLM fires multiple identical destructive requests in the same millisecond — for example, 5 identical billing.charge calls — all 5 execute concurrently, potentially charging the customer 5 times. MCP Fusion solves this with two guards: the Concurrency Guard (per-tool semaphore with backpressure queue) and the MutationSerializer (automatic FIFO serialization for all destructive operations).' },
      { q: 'How does MCP Fusion prevent data leaks to AI agents?', a: 'The Presenter Egress Firewall uses Zod .strip() validation to remove undeclared fields in RAM before the response is serialized. The handler can return the full database object including password_hash, tenant_id, and internal_flags — the Presenter strips everything not declared in its schema. The LLM never sees sensitive data because it physically doesn\'t exist in the response.' },
      { q: 'What are self-healing errors in MCP Fusion?', a: 'Instead of returning plain "Error: not found" strings that cause blind retry loops, MCP Fusion returns structured errors via f.error() with recovery instructions. The error includes an error code, a human-readable message, a recovery suggestion telling the agent exactly what to do next (e.g., "Use billing.list_invoices to find valid IDs"), and available actions. The agent self-corrects on the first retry instead of guessing.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // COOKBOOK — TRANSACTIONAL WORKFLOWS
  // ═══════════════════════════════════════════════════════
  'cookbook/transactional-workflows.md': {
    title: 'Transactional Workflows Recipe — Saga Pattern for MCP Tools',
    description: 'Implement transactional multi-step workflows in MCP Fusion using the Saga Pattern. Compose create-charge-email workflows into a single tool with manual compensation, check-then-act validation, and idempotent retry-safe operations.',
    faqs: [
      { q: 'How do I implement the Saga Pattern in MCP Fusion?', a: 'MCP Fusion implements the Saga Pattern without any new abstraction. Compose multi-step operations into a single f.mutation() tool. Each step executes sequentially inside the handler. If a step fails, the catch block compensates all previous steps in reverse order and returns a self-healing f.error() with recovery instructions. The agent sees one atomic tool — not the individual steps.' },
      { q: 'Why should I compose multi-step workflows into a single MCP tool?', a: 'Because the MCP protocol has no concept of a transaction spanning multiple tool calls. If you expose 3 separate tools (users.create, billing.charge, email.send), the agent calls them independently. If step 3 fails, steps 1 and 2 have already executed — leaving corrupted state. A single tool with internal compensation ensures atomicity at the server level, where the developer controls ordering and rollback.' },
      { q: 'What is the check-then-act pattern for transactional MCP tools?', a: 'Check-then-act validates all preconditions before making any changes. Place all business rule checks (does the record exist? is the status correct? is it already processed?) before the first mutation. If every validation happens before the first database write, you never need compensation for validation errors — which are the most common failure mode with AI agents.' },
      { q: 'How do I make MCP tool operations idempotent?', a: 'Design the handler to detect previous execution and return success without re-executing. Before performing the operation, check the current status: if (order.status === "fulfilled") return { status: "fulfilled", note: "Already fulfilled" }. Mark the tool with .idempotent() to signal to the LLM that retries are safe. The handler enforces idempotency; the annotation informs the client.' },
      { q: 'How does MCP Fusion prevent concurrent execution of transactional workflows?', a: 'Three complementary mechanisms: (1) .destructive() activates the MutationSerializer, which serializes concurrent calls to the same tool in FIFO order. (2) .concurrency({ maxActive: 3, maxQueue: 10 }) limits simultaneous executions with a semaphore and backpressure queue. (3) .invalidates("users.*", "billing.*") signals stale data after success, preventing the agent from acting on outdated information.' },
      { q: 'How should I handle compensation logic when a workflow step fails?', a: 'Compensate in reverse order — undo the most recent step first, working backwards to the first step. Each catch block should: (1) call the compensation action for each successfully completed step (e.g., refund the charge, delete the user), (2) return f.error() with a specific error code for the failure point, (3) include .suggest() with actionable recovery instructions, and (4) optionally add .retryAfter(seconds) to tell the agent when to retry.' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // SANDBOX ENGINE
  // ═══════════════════════════════════════════════════════
  'sandbox.md': {
    title: 'Zero-Trust Sandbox Engine — Secure V8 Isolate for LLM Code Execution',
    description: 'Execute LLM-generated JavaScript in a sealed V8 isolate with zero access to Node.js APIs. Memory limits, timeouts, output caps, AbortSignal kill-switch (Connection Watchdog), and automatic C++ pointer cleanup via isolated-vm.',
    faqs: [
      { q: 'What is the Sandbox Engine in MCP Fusion?', a: 'The Sandbox Engine lets an LLM send JavaScript logic as a string to your MCP server. The framework executes that code inside a sealed V8 isolate (via isolated-vm) with zero access to process, require, fs, net, or eval. Data stays on the server — only the computed result crosses the boundary. This is Computation Delegation: serverless ultra-secure execution inside the client\'s own server.' },
      { q: 'How does the Sandbox Engine prevent security attacks?', a: 'The V8 Context is created completely empty — no globalThis properties, no setTimeout, no Proxy, no Function constructor. Even if the LLM sends malicious code attempting prototype pollution, constructor escapes, or import() calls, the V8 engine itself blocks execution because those APIs physically do not exist inside the isolate.' },
      { q: 'What resource limits does the Sandbox Engine enforce?', a: 'Three configurable limits: timeout (default 5000ms) kills scripts that run too long, memoryLimit (default 128MB) caps V8 heap allocation, and maxOutputBytes (default 1MB) prevents oversized results from flooding the response. All limits are enforced at the V8 engine level — not in JavaScript — making them impossible to bypass.' },
      { q: 'How does the Sandbox Engine prevent memory leaks?', a: 'Every ExternalCopy, Script, and Context created during execution is released in a mandatory try/finally block. The copyInto({ release: true }) pattern auto-releases the C++ pointer when data enters the isolate. If the isolate dies (OOM or abort), the engine automatically recreates it on the next call. This prevents the most dangerous class of Node.js memory leak: C++ pointers outside the GC.' },
      { q: 'What is the Connection Watchdog in MCP Fusion?', a: 'The Connection Watchdog is a kill-switch that prevents zombie sandbox computations. When a user closes their MCP client (e.g., Claude Desktop) mid-request, the TCP connection dies but Node.js doesn\'t know. The sandbox would keep running until timeout. The Connection Watchdog solves this: it wires the MCP SDK\'s AbortSignal to isolate.dispose(), killing V8 C++ threads instantly when client disconnect is detected. The engine auto-recovers on the next call.' },
      { q: 'How does the AbortSignal integration work in the Sandbox Engine?', a: 'The execute() method accepts an optional { signal: AbortSignal } parameter. Before V8 allocation, a pre-flight check skips execution if the signal is already aborted. During execution, an abort listener calls isolate.dispose() to kill the V8 threads immediately. The error is classified as ABORTED (not MEMORY), and the listener is cleaned up in a finally block to prevent memory leaks.' },
      { q: 'What is SandboxGuard in MCP Fusion?', a: 'SandboxGuard is a fail-fast syntax checker that runs BEFORE the V8 isolate. It rejects non-function expressions, flags suspicious patterns (require, import, process), and validates basic structure. This is a speed optimization — catching obvious errors before allocating V8 resources — not a security boundary. The empty V8 Context is the real security boundary.' },
      { q: 'How do I enable sandboxing in the Fluent API?', a: 'Call .sandboxed() on any FluentToolBuilder: f.query("analytics.compute").sandboxed({ timeout: 3000 }).handle(...). This stores the sandbox configuration and injects a SANDBOX_SYSTEM_INSTRUCTION into the tool description via HATEOAS auto-prompting, teaching the LLM how to format JavaScript code for the sandbox.' },
      { q: 'Is isolated-vm required to use MCP Fusion?', a: 'No. isolated-vm is an optional peer dependency. The SandboxEngine uses lazy loading — it only attempts to import isolated-vm when you actually create an engine instance. If isolated-vm is not installed, the import fails gracefully with a clear error message. All other MCP Fusion features work without it.' },
    ],
  },
};

// ═══════════════════════════════════════════════════════
// HEAD TAG GENERATOR
// ═══════════════════════════════════════════════════════
export function getPageHeadTags(pageData: { relativePath: string; title: string; description: string; frontmatter: Record<string, unknown> }): HeadConfig[] {
  const page = pages[pageData.relativePath];

  // Dynamic per-page: use curated SEO data or fall back to VitePress pageData
  const title = page?.title ?? pageData.title ?? 'MCP Fusion';
  const description = page?.description
    ?? pageData.description
    ?? 'AI-First DX for the Model Context Protocol.';

  const slug = pageData.relativePath.replace('.md', '').replace('index', '');
  const url = `${BASE_URL}/${slug}`;
  const ogImage = 'https://site-assets.vinkius.com/vk/logo-v-black.png';

  const heads: HeadConfig[] = [];

  // ── Open Graph (dynamic per page) ──
  heads.push(['meta', { property: 'og:type', content: 'website' }]);
  heads.push(['meta', { property: 'og:site_name', content: 'MCP Fusion' }]);
  heads.push(['meta', { property: 'og:title', content: title }]);
  heads.push(['meta', { property: 'og:description', content: description }]);
  heads.push(['meta', { property: 'og:url', content: url }]);
  heads.push(['meta', { property: 'og:image', content: ogImage }]);
  heads.push(['meta', { property: 'og:image:width', content: '1200' }]);
  heads.push(['meta', { property: 'og:image:height', content: '630' }]);

  // ── Twitter Card (dynamic per page) ──
  heads.push(['meta', { name: 'twitter:card', content: 'summary_large_image' }]);
  heads.push(['meta', { name: 'twitter:site', content: '@vinkiuslabs' }]);
  heads.push(['meta', { name: 'twitter:creator', content: '@vinkiuslabs' }]);
  heads.push(['meta', { name: 'twitter:title', content: title }]);
  heads.push(['meta', { name: 'twitter:description', content: description }]);
  heads.push(['meta', { name: 'twitter:image', content: ogImage }]);

  // ── FAQPage JSON-LD (only for pages with curated FAQs) ──
  if (page && page.faqs.length > 0) {
    heads.push(['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': page.faqs.map(faq => ({
        '@type': 'Question',
        'name': faq.q,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': faq.a,
        },
      })),
    })]);
  }

  // ── TechArticle JSON-LD per page ──
  heads.push(['script', { type: 'application/ld+json' }, JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    'headline': title,
    'description': description,
    'url': url,
    'author': { '@type': 'Person', 'name': 'Renato Marinho' },
    'publisher': { '@type': 'Organization', 'name': 'Vinkius Labs' },
    'mainEntityOfPage': url,
  })]);

  // ── SoftwareApplication JSON-LD (Only for Index) ──
  if (pageData.relativePath === 'index.md' || pageData.relativePath === '') {
    heads.push(['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      'name': 'MCP Fusion Framework',
      'operatingSystem': 'Any',
      'applicationCategory': 'DeveloperApplication',
      'programmingLanguage': 'TypeScript',
      'url': BASE_URL,
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD'
      }
    })]);
  }

  return heads;
}

/**
 * Get curated SEO data for a page.
 * Used by transformPageData to override the <title> tag with keyword-rich titles.
 */
export function getPageSEO(relativePath: string): { title: string; description: string } | undefined {
  return pages[relativePath];
}
