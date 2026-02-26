# The Theory Behind MVA

## The Consumer Has Changed

For fifty years, software architecture has been shaped by one constant: the human consumer. Every paradigm — MVC, MVVM, REST, GraphQL — was designed around the assumption that a thinking, context-aware human would be the final consumer of the interface.

This assumption enabled powerful shortcuts:

- **Views** could render raw numbers because humans apply domain knowledge intuitively
- **Controllers** could return ambiguous data because humans ask clarifying questions
- **APIs** could expose flat resource lists because humans navigate with intention
- **Errors** could be vague because humans troubleshoot by reading stack traces

None of these shortcuts are safe when the consumer is an AI agent.

An AI agent is a fundamentally different kind of consumer. It is:

| Human Consumer | AI Agent Consumer |
|---|---|
| Tolerates ambiguity — infers from experience | **Hallucinates** when context is missing |
| Asks clarifying questions | **Guesses and acts** — autonomously, often wrong |
| Applies domain knowledge intuitively | Has **zero** domain knowledge unless explicitly told |
| Reads visual cues (bold, red, layout) | Receives **flat text** — no visual hierarchy |
| Recognizes sensitive data | **Cannot distinguish** internal vs. external fields |
| Remembers previous interactions | **Stateless** — each turn is a fresh context |
| Navigates interfaces by intent | **Blind** to available actions unless told |

This is not a marginal difference. It is a **categorical** difference. The consumer class has changed. The architecture must change with it.

## The Four Failure Modes of Raw Interfaces

When you send raw JSON to an AI agent — which is what every MCP server does today — you create four structural failure modes. These are not bugs. They are **architectural deficits** that no amount of prompt engineering can fix.

### Failure Mode 1: Context Starvation

The agent receives data without interpretation rules.

```json
{ "id": "INV-001", "amount_cents": 45000, "status": "pending" }
```

The field `amount_cents` is named with a hint — but LLMs don't reliably parse field-name conventions. In production, observed failure modes include:

- `45000` displayed as `$45,000` instead of `$450.00`
- Currency assumed to be EUR when it's USD
- `status: "pending"` interpreted as "processing" rather than "awaiting payment"

**Root cause:** The interface provides data without semantic context. The human consumer would apply domain knowledge. The AI agent has none.

**MVA solution:** System Rules travel with the data — `"CRITICAL: amount_cents is in CENTS. Divide by 100."` — ensuring the agent receives interpretation directives exactly when processing financial data, and never when working with unrelated domains.

### Failure Mode 2: Action Blindness

After receiving data, the agent must decide what to do next. Without guidance, it:

- Hallucinates tool names that don't exist (`billing.process_payment` when the tool is `billing.pay`)
- Skips valid actions because it doesn't know they're available
- Calls unrelated tools because the naming is ambiguous

**Root cause:** The interface provides data without affordances. The human consumer would navigate a UI with buttons, links, and menus. The AI agent sees only text.

**MVA solution:** Agentic Affordances (`.suggestActions()`) provide HATEOAS-style next-action hints computed from the current data state. The agent doesn't guess — it receives an explicit list of what it can do next.

### Failure Mode 3: Perception Inconsistency

The same domain entity (e.g., an invoice) is rendered differently by different tools:

```text
// Tool A returns:
{ "id": "INV-001", "amount": 450.00, "state": "open" }

// Tool B returns:
{ "invoice_id": "INV-001", "amount_cents": 45000, "status": "pending" }
```

The agent cannot reconcile these as the same entity. It treats them as different data types, producing contradictory behavior across workflows.

**Root cause:** The interface lacks a shared representation contract. In MVC, the View layer provides this consistency for humans. There is no equivalent for agents.

**MVA solution:** The Presenter is defined at the **domain level**, not the tool level. `InvoicePresenter` is created once and shared by every tool that returns invoices. The agent always perceives invoices identically — same schema, same rules, same affordances, same UI blocks.

### Failure Mode 4: Security Leakage

Raw JSON responses include every field from the database:

```json
{
    "id": "INV-001",
    "amount_cents": 45000,
    "internal_margin": 0.12,
    "customer_ssn": "123-45-6789",
    "tenant_id": "t_abc",
    "password_hash": "$2b$10$..."
}
```

The agent ingests all of this into its context window. Internal fields, PII, and sensitive data become part of the LLM's reasoning context and may surface in responses to the end user.

**Root cause:** No output boundary exists between the data layer and the consumer. The human consumer is typically protected by a View that selectively renders fields. The AI consumer receives everything.

**MVA solution:** The Zod schema acts as a **security contract**. Using `.strict()` mode on your Presenter schemas rejects every field not declared in the schema. Internal fields never reach the agent — they trigger an actionable error that names the rejected fields, teaching the LLM what's valid.

## First Principles: What Does an Agent-Native Interface Require?

Working from first principles, we can derive the requirements for an architecture that treats AI agents as first-class consumers.

### Requirement 1: Deterministic Interpretation

Every piece of data must arrive with explicit interpretation rules. The agent should never have to infer meaning from context, convention, or field names.

**In MVA:** `.systemRules()` attaches domain-specific directives to the data. The rules are not in a global system prompt — they travel **with the data**, appearing in the agent's context only when that domain is active.

### Requirement 2: Explicit Affordances

After receiving data, the agent must be told what actions are available. The available actions must be computed from the current data state, not from a static list.

**In MVA:** `.suggestActions()` is a function that receives the current data and returns a list of next actions. A pending invoice suggests `billing.pay`. A paid invoice suggests `billing.archive`. The affordances adapt to the data.

### Requirement 3: Bounded Output

The response must respect the agent's cognitive limits — its context window. Unbounded data dumps are not just expensive; they degrade accuracy.

**In MVA:** `.agentLimit()` truncates large datasets and injects a teaching block: *"⚠️ 50 shown, 250 hidden. Use `status` or `date_range` filters."* The agent learns to use pagination.

### Requirement 4: Security Boundary

The interface must enforce an output contract that prevents internal, sensitive, or irrelevant fields from reaching the agent.

**In MVA:** The Zod schema with `.strict()` (applied by the developer on Presenter schemas, and automatically by the framework on input validation) acts as a Data Loss Prevention layer. Fields not declared in the schema are rejected with explicit errors. There is no way for internal data to leak.

### Requirement 5: Consistent Perception

The same domain entity must be perceived identically regardless of which tool returns it. Consistency reduces the contradictions that cause downstream reasoning failures.

**In MVA:** The Presenter is a domain-level construct. You define `InvoicePresenter` once. Every tool that returns invoices uses the same Presenter with the same rules, the same UI blocks, and the same affordances.

### Requirement 6: Visual Representation

Agents increasingly operate in environments that support rich rendering (Claude Artifacts, Copilot, custom UIs). The server should provide deterministic visualizations rather than leaving chart generation to the agent.

**In MVA:** `.uiBlocks()` generates server-rendered ECharts, Mermaid diagrams, tables, and summaries. The agent passes these through to the user interface unchanged.

## The Formalization

With these requirements established, MVA formalizes three architectural layers:



### The Critical Insight: Domain-Level, Not Tool-Level

In traditional MVC, the View is **tool-level** — each controller action has its own view template. This works for humans because they can reconcile different representations of the same entity.

In MVA, the Presenter is **domain-level**. You don't create a Presenter per tool. You create a Presenter per **domain entity**:

```typescript
import { initFusion, definePresenter } from '@vinkius-core/mcp-fusion';

const f = initFusion<Ctx>();

// This Presenter is shared across EVERY tool that returns invoices
const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    systemRules: ['amount_cents is in CENTS. Divide by 100.'],
    suggestActions: (inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Pay' }]
        : [],
});

// Used in billing.get_invoice
f.tool({
    name: 'billing.get_invoice',
    input: z.object({ id: z.string() }),
    returns: InvoicePresenter,
    handler: async (ctx, { id }) => ctx.db.invoices.findUnique({ where: { id } }),
});

f.tool({
    name: 'billing.list_invoices',
    input: z.object({}),
    returns: InvoicePresenter,
    handler: async (ctx) => ctx.db.invoices.findMany(),
});

// Used in reports.financial_summary — same Presenter
f.tool({
    name: 'reports.financial_summary',
    input: z.object({}),
    returns: InvoicePresenter,
    handler: async (ctx) => ctx.db.invoices.findMany(),
});
```

The agent perceives invoices identically whether they come from `billing.get_invoice`, `billing.list_invoices`, or `reports.financial_summary`. This is **Perception Consistency** — the third requirement derived above.

## Why Existing Architectures Fail

### MVC (Model-View-Controller)

MVC assumes a human browser consumer. The View renders HTML/CSS that a human interprets visually. The Controller handles HTTP requests from forms and links.

**Why it fails for agents:** The View is meaningless to an agent. The agent doesn't process HTML. It processes text. And the Controller's routing model (URL-based) doesn't map to MCP's tool-based invocation model.

### REST / HATEOAS

REST provides stateless resource access with hypermedia links. In theory, HATEOAS tells the client what it can do next by embedding links in the response.

**Why it fails for agents:** REST returns raw JSON with no interpretation layer. HATEOAS links are URLs to HTTP endpoints — not tool names that an MCP agent can call. And REST cannot attach domain rules, UI blocks, or cognitive limits to the response. MVA's `.suggestActions()` is HATEOAS reinvented for the agent era: it returns tool names with semantic reasons, not URLs.

### GraphQL

GraphQL lets the client query exactly the fields it needs, reducing over-fetching.

**Why it fails for agents:** GraphQL solves the wrong problem. The bottleneck for agents is not which fields to fetch — it's how to **interpret** the fields after fetching. GraphQL provides no domain rules, no affordances, no guardrails, and no security boundary (the schema is query-level, not output-level).

### RPC / gRPC

RPC provides typed function calls with schema validation.

**Why it fails for agents:** RPC validates inputs but provides no output perception layer. The response is raw data. There are no rules, no affordances, no UI blocks. And RPC's schema is transport-level, not domain-level — it cannot express "divide by 100" or "suggest billing.pay when pending."

## The Convergence Hypothesis

The trajectory of software architecture points toward **dual-interface** systems: products will need both MVC (for human consumers) and MVA (for agent consumers), often serving the same domain model.



A SaaS product might render invoices as HTML tables for the dashboard (MVC) and as structured perception packages for Claude/GPT integration (MVA). Both consume the same `Invoice` model. Both serve the same business logic. But they serve fundamentally different consumer classes.

This is not speculative. Every company building "AI-native" features on top of existing products is already facing this architectural split — they just haven't named it yet.
