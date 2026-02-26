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
      { q: 'What problems does MVA solve that raw MCP doesn\'t?', a: 'Raw MCP servers dump JSON.stringify() output, have no domain context, no action hints, leak internal fields, and force switch/case routing. MVA solves all of this with structured perception packages, system rules, Agentic HATEOAS, Zod .strip() security, and discriminator-based action consolidation.' },
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
      { q: 'What components does the mcp-fusion architecture include?', a: 'The architecture includes: GroupedToolBuilder (tool definition), ToolRegistry (registration and routing), ExecutionPipeline (middleware + handler execution), Presenter Engine (MVA View layer), ResponseBuilder (manual response composition), FusionClient (tRPC-style type-safe client), and State Sync (cache signals).' },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // QUICKSTART
  // ═══════════════════════════════════════════════════════
  'quickstart.md': {
    title: 'Quickstart — mcp-fusion in 5 Minutes',
    description: 'Build your first MVA-powered MCP server in 5 minutes with mcp-fusion. Step-by-step guide with code examples.',
    faqs: [
      { q: 'How long does it take to build an MCP server with mcp-fusion?', a: 'You can have a production-ready MCP server running in under 5 minutes. Define a tool with defineTool(), register it with ToolRegistry, and attach to an MCP server. The framework handles validation, routing, and response formatting automatically.' },
      { q: 'Do I need to use Zod with mcp-fusion?', a: 'No. mcp-fusion offers two APIs: defineTool() for JSON-first definitions without Zod imports, and createTool() for full Zod power. With defineTool(), you can use simple strings like { id: "string" } instead of z.object({ id: z.string() }).' },
      { q: 'How do I add a Presenter to my tool?', a: 'Create a Presenter with createPresenter("Name").schema(...).systemRules([...]).suggestActions(...), then assign it to your action with the "returns" property: { returns: InvoicePresenter, handler: async (ctx, args) => rawData }. The framework wraps raw data in the Presenter automatically.' },
      { q: 'How do I register and attach tools to an MCP server?', a: 'Create a ToolRegistry, register your builders with registry.register(tool), then call registry.attachToServer(server, { contextFactory: (extra) => createContext(extra) }). The registry automatically configures the MCP server with list_tools and call_tool handlers.' },
      { q: 'What is the minimum code for a working mcp-fusion tool?', a: 'Three steps: (1) const tool = defineTool("hello", { actions: { greet: { handler: async () => success("Hello!") } } }); (2) const registry = new ToolRegistry(); registry.register(tool); (3) registry.attachToServer(server, {}). This creates a tool with one action "greet" that returns "Hello!".' },
      { q: 'How do I handle parameters in tool actions?', a: 'With defineTool(), use params: { name: "string", age: "number" }. With createTool(), use schema: z.object({ name: z.string(), age: z.number() }). In both cases, the handler receives typed, validated arguments. Invalid inputs are rejected before reaching your handler.' },
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
      { q: 'What is the difference between defineTool() and createTool()?', a: 'defineTool() is a JSON-first API — define parameters as plain strings like { id: "string" } without importing Zod. createTool() gives you full Zod power for complex schemas with regex, transforms, and refinements. Both produce identical GroupedToolBuilder instances with the same runtime behavior.' },
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
      { q: 'How does action consolidation work in mcp-fusion?', a: 'Instead of registering 50 individual MCP tools, you register ONE tool with grouped actions. The LLM selects the operation via a discriminator field: { action: "users.list" } or { action: "billing.refund" }. This reduces the prompt surface by 10x because the LLM sees one tool definition instead of fifty.' },
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
      { q: 'How does middleware work in mcp-fusion?', a: 'Middleware follows the next() pattern. Each middleware receives (ctx, args, next) and can modify context, validate, or short-circuit. Middleware chains are pre-compiled at build time for zero runtime allocation. Apply globally with .use() or per-group for scoped execution.' },
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
    ],
  },

  'testing/fixtures.md': {
    title: 'Fixtures — Test Setup & Context for FusionTester',
    description: 'Shared context via setup.ts, per-test overrides, async factories, context isolation, and multiple tester instances for MCP Fusion governance testing.',
    faqs: [
      { q: 'What is the setup.ts pattern in FusionTester?', a: 'Create tests/setup.ts with a shared FusionTester instance using createFusionTester(). All test files import { tester } from "../setup.js". Centralizes mock data and context configuration.' },
      { q: 'How does context isolation work in FusionTester?', a: 'Context overrides via callAction\'s 4th argument are shallow-merged per call and never persist. call({ role: "GUEST" }) does not affect the next call. The original context object is never mutated.' },
      { q: 'Can I have multiple FusionTester instances?', a: 'Yes. Create adminTester with role ADMIN and guestTester with role GUEST for fundamentally different configurations. Use overrideContext for per-test variations within the same instance.' },
    ],
  },

  'testing/assertions.md': {
    title: 'Assertions Reference — Every MvaTestResult Pattern',
    description: 'Complete assertion reference for FusionTester: data field absence/presence, systemRules content, uiBlocks verification, isError checks, rawResponse inspection, and composite SOC2 audit patterns.',
    faqs: [
      { q: 'How do I assert PII was stripped from data?', a: 'expect(result.data).not.toHaveProperty("passwordHash"). The field is physically absent from the result.data object — not hidden, not masked, but removed by the Presenter\'s Zod schema.' },
      { q: 'How do I assert correct system rules?', a: 'expect(result.systemRules).toContain("Email addresses are PII."). For rule absence: expect(result.systemRules).not.toContain("Order totals include tax."). For count: expect(result.systemRules).toHaveLength(3).' },
      { q: 'How do I write a composite SOC2 audit assertion?', a: 'Assert multiple layers in one test: check result.isError is false, verify PII fields are absent from result.data, confirm governance rules in result.systemRules, and verify JSON.stringify(result.rawResponse) contains no sensitive data.' },
    ],
  },

  'testing/test-doubles.md': {
    title: 'Test Doubles — Mocking Context for FusionTester',
    description: 'Mock Prisma, HTTP clients, cache layers, and external services. Use Vitest spies to verify database interactions. Error-throwing and conditional mocks.',
    faqs: [
      { q: 'What gets mocked in FusionTester tests?', a: 'Only the context. FusionTester runs the real pipeline (Zod, middleware, handler, Presenter). You mock the dependencies your handlers call: prisma, HTTP clients, cache layers, and external services.' },
      { q: 'How do I use Vitest spies with FusionTester?', a: 'const findManyFn = vi.fn(async () => [...]). Pass in contextFactory. After calling tester.callAction(), assert: expect(findManyFn).toHaveBeenCalledOnce(). Verify that invalid inputs never reach the database: expect(findManyFn).not.toHaveBeenCalled().' },
      { q: 'How do I test database error handling?', a: 'Create a mock that throws: user: { findMany: async () => { throw new Error("Connection refused") } }. Create a separate FusionTester with this mock. Assert result.isError is true — proving graceful degradation.' },
    ],
  },

  'testing/egress-firewall.md': {
    title: 'Egress Firewall Testing — SOC2 CC6.1 PII Stripping',
    description: 'Prove mathematically that passwordHash, tenantId, and internal fields never reach the LLM. Deterministic Egress Firewall auditing for SOC2 compliance.',
    faqs: [
      { q: 'How does the Egress Firewall work in MCP Fusion?', a: 'The Presenter\'s Zod schema acts as a physical barrier. Fields not declared in the schema are stripped in RAM — they never exist in the response. JSON.stringify cannot leak what doesn\'t exist.' },
      { q: 'How do I test PII stripping?', a: 'const result = await tester.callAction("db_user", "find_many", { take: 5 }). For each user in result.data: expect(user).not.toHaveProperty("passwordHash"). The field is physically absent, not masked.' },
      { q: 'How does this map to SOC2 compliance?', a: 'SOC2 CC6.1 (Logical Access): passwordHash absent. CC6.7 (Output Controls): only declared schema fields exist. CC7.2 (Monitoring): deterministic, reproducible in CI/CD. All provable via FusionTester assertions.' },
    ],
  },

  'testing/system-rules.md': {
    title: 'System Rules Testing — LLM Governance Directives',
    description: 'Verify that the LLM receives deterministic domain rules. Test static rules, contextual rules, manual builder rules, and Context Tree-Shaking.',
    faqs: [
      { q: 'What are System Rules in MCP Fusion?', a: 'System Rules are JIT (Just-In-Time) domain directives injected by the Presenter into the LLM context. They replace bloated global system prompts with per-response, per-entity governance. The LLM only receives rules relevant to the data it\'s currently looking at.' },
      { q: 'How do I test contextual (dynamic) rules?', a: 'Contextual rules are functions receiving data and context. Test with different context overrides: callAction("analytics", "list", { limit: 5 }, { role: "ADMIN" }) should include "User is ADMIN. Show full details." while { role: "VIEWER" } should exclude it.' },
      { q: 'What is Context Tree-Shaking?', a: 'The principle that User rules should NOT appear in Order responses and vice versa. Test by asserting: expect(orderResult.systemRules).not.toContain("Email addresses are PII."). Proves the LLM only sees relevant governance.' },
    ],
  },

  'testing/ui-blocks.md': {
    title: 'UI Blocks Testing — SSR Components & Truncation',
    description: 'Assert per-item blocks, collection blocks, agent limit truncation warnings, and empty blocks for raw tools.',
    faqs: [
      { q: 'What are UI Blocks in MCP Fusion?', a: 'UI Blocks are server-side rendered components generated by the Presenter for the client: charts, summaries, markdown tables, and truncation warnings. They govern the client experience — what the user sees.' },
      { q: 'How do I test agent limit truncation?', a: 'When the handler returns more items than agentLimit allows, assert: result.data.length should equal the limit, and result.uiBlocks should contain a truncation warning with "Truncated" or "hidden".' },
    ],
  },

  'testing/middleware-guards.md': {
    title: 'Middleware Guards Testing — RBAC & Access Control',
    description: 'Test role-based access control, multi-tenant isolation, context isolation between tests, and middleware coverage across all actions.',
    faqs: [
      { q: 'How do I test RBAC with FusionTester?', a: 'Use context overrides: callAction("db_user", "find_many", { take: 5 }, { role: "GUEST" }). Assert result.isError is true and result.data contains "Unauthorized". For ADMIN: result.isError should be false.' },
      { q: 'How do I test middleware coverage across all actions?', a: 'Loop through all actions: for (const action of ["find_many", "create", "update", "delete"]) { const result = await tester.callAction("db_user", action, {}, { role: "GUEST" }); expect(result.isError).toBe(true); }' },
    ],
  },

  'testing/oom-guard.md': {
    title: 'OOM Guard Testing — Input Boundaries & Agent Limits',
    description: 'Validate Zod input boundaries (min, max, type safety), email validation, and agent limit truncation to prevent memory exhaustion and context overflow.',
    faqs: [
      { q: 'How do I test Zod input boundaries?', a: 'Assert rejection for out-of-bounds input: callAction("db_user", "find_many", { take: 10000 }) → isError true. For boundary acceptance: take: 1 and take: 50 should both return isError false.' },
      { q: 'How do I test type safety?', a: 'Assert rejection for wrong types: take: 3.14 (non-integer), take: "fifty" (string instead of number), and {} (missing required fields) should all return isError true — Zod rejects before the handler runs.' },
    ],
  },

  'testing/error-handling.md': {
    title: 'Error Handling Testing — Pipeline Failures & Recovery',
    description: 'Assert isError for unknown tools/actions, handler errors, empty MVA layers on error, error message content, and error vs exception distinction.',
    faqs: [
      { q: 'What is the difference between error and exception in FusionTester?', a: 'isError: true means the pipeline handled the error gracefully and returned a structured MvaTestResult. An unhandled exception would throw — the FusionTester converts most exceptions into isError results.' },
      { q: 'How do I verify empty MVA layers on error?', a: 'When isError is true, assert: result.systemRules should equal [] and result.uiBlocks should equal []. This proves no partial data leaks on error paths.' },
    ],
  },

  'testing/raw-response.md': {
    title: 'Raw Response Testing — MCP Protocol Inspection',
    description: 'Protocol-level MCP transport inspection. Verify content block structure, Symbol invisibility, XML formatting, and concurrent response isolation.',
    faqs: [
      { q: 'How do I verify Symbol invisibility?', a: 'JSON.stringify(result.rawResponse) should NOT contain "mva-meta", "systemRules", or "passwordHash". But (result.rawResponse as any)[MVA_META_SYMBOL] should be defined. This proves the Symbol Backdoor works correctly.' },
      { q: 'How do I inspect MCP content blocks?', a: 'Cast rawResponse to { content: Array<{ type: string; text: string }> }. Assert content[0].type is "text". Check for "<data>" and "<system_rules>" blocks in content text.' },
    ],
  },

  'testing/ci-cd.md': {
    title: 'CI/CD Integration — Governance in Every Pull Request',
    description: 'GitHub Actions, GitLab CI, Azure DevOps, and pre-commit hooks. Separate CI jobs per SOC2 control. Zero tokens, zero API keys, zero flakiness.',
    faqs: [
      { q: 'How do I add FusionTester to GitHub Actions?', a: 'Add a workflow with: actions/checkout, actions/setup-node (node 20), npm ci, npx vitest run --reporter=verbose. No API keys needed. No external services. Tests run in ~500ms total.' },
      { q: 'Can I have separate CI jobs per SOC2 control?', a: 'Yes. Create separate jobs for tests/firewall/ (CC6.1), tests/guards/ (CC6.3), tests/rules/ (Context Governance), and tests/blocks/ (Response Quality). Each shows as a separate check mark on the PR.' },
      { q: 'How do I block PRs that break governance?', a: 'In GitHub Settings → Branch protection, require the governance audit status checks to pass before merging. No PR can merge if PII leaks or auth gates are broken.' },
    ],
  },

  'testing/convention.md': {
    title: 'Testing Convention — Folder Structure & File Naming',
    description: 'The tests/ layer in the MVA convention. Folder structure by governance concern, file naming patterns, shared setup.ts, and SOC2 mapping per directory.',
    faqs: [
      { q: 'How should I organize FusionTester test files?', a: 'Four directories by governance concern: tests/firewall/ (Egress assertions), tests/guards/ (Middleware & OOM), tests/rules/ (System Rules), tests/blocks/ (UI Blocks). Plus tests/setup.ts for the shared FusionTester instance.' },
      { q: 'What file naming convention should I follow?', a: 'Use entity.concern.test.ts: user.firewall.test.ts, order.guard.test.ts, user.rules.test.ts, analytics.blocks.test.ts. One entity per file, one concern per directory.' },
      { q: 'How does the convention map to SOC2 controls?', a: 'tests/firewall/ → CC6.1 (Logical Access), tests/guards/ → CC6.3 (Access Control), tests/rules/ → CC7.1 (System Operations), tests/blocks/ → CC8.1 (Change Management). Auditors find relevant tests instantly.' },
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
};

// ═══════════════════════════════════════════════════════
// HEAD TAG GENERATOR
// ═══════════════════════════════════════════════════════
export function getPageHeadTags(relativePath: string): HeadConfig[] {
  const page = pages[relativePath];
  if (!page) return [];

  const slug = relativePath.replace('.md', '').replace('index', '');
  const url = `${BASE_URL}/${slug}`;

  const heads: HeadConfig[] = [];

  // Page-specific Open Graph
  heads.push(['meta', { property: 'og:title', content: page.title }]);
  heads.push(['meta', { property: 'og:description', content: page.description }]);
  heads.push(['meta', { property: 'og:url', content: url }]);

  // FAQPage JSON-LD
  if (page.faqs.length > 0) {
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

  // TechArticle JSON-LD per page
  heads.push(['script', { type: 'application/ld+json' }, JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    'headline': page.title,
    'description': page.description,
    'url': url,
    'author': { '@type': 'Person', 'name': 'Renato Marinho' },
    'publisher': { '@type': 'Organization', 'name': 'Vinkius Labs' },
    'mainEntityOfPage': url,
  })]);

  return heads;
}
