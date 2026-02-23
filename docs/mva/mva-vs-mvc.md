# MVA vs MVC: Architectural Comparison

<div class="mva-manifesto-header">

> MVC was designed for a consumer that navigates by sight. MVA was designed for a consumer that navigates by structural perception.

</div>

This page provides a formal, layer-by-layer comparison between MVC and MVA. The goal is not to criticize MVC — it has served brilliantly for four decades. The goal is to demonstrate why a new architecture is required when the consumer changes from human to AI agent.

---

## The Architectural Comparison

```text
              MVC                                    MVA
┌─────────────────────────┐          ┌─────────────────────────┐
│                          │          │                          │
│  MODEL                   │          │  MODEL                   │
│  ORM / Database Schema   │          │  Zod Schema (.strict())  │
│  ─────────────────────   │          │  ─────────────────────   │
│  Defines data shape.     │          │  Defines data shape      │
│  No output filtering.    │          │  AND acts as security    │
│                          │          │  boundary. Rejects       │
│                          │          │  undeclared fields.      │
│                          │          │                          │
├──────────────────────────┤          ├──────────────────────────┤
│                          │          │                          │
│  VIEW                    │          │  VIEW (Presenter)        │
│  HTML / CSS / Templates  │          │  Perception Layer        │
│  ─────────────────────   │          │  ─────────────────────   │
│  Visual rendering for    │          │  Structured data with    │
│  human eyes. Layout,     │          │  domain rules, charts,   │
│  typography, colors.     │          │  affordances, guardrails │
│  Tool-level (per page).  │          │  Domain-level (per       │
│                          │          │  entity). Reused across  │
│                          │          │  all tools.              │
│                          │          │                          │
├──────────────────────────┤          ├──────────────────────────┤
│                          │          │                          │
│  CONTROLLER              │          │  AGENT                   │
│  HTTP Handler            │          │  LLM Runtime             │
│  ─────────────────────   │          │  ─────────────────────   │
│  Receives HTTP requests. │          │  Autonomous consumer.    │
│  Routes to business      │          │  Receives structured     │
│  logic. Returns a View.  │          │  perception package.     │
│  Human initiates.        │          │  Acts without human      │
│                          │          │  intervention.           │
│                          │          │                          │
└──────────────────────────┘          └──────────────────────────┘
```

---

## Layer-by-Layer Analysis

### The Model Layer

In MVC, the Model represents the data and business rules of the application. It is typically an ORM entity (ActiveRecord, Prisma, Eloquent) that maps directly to database tables. The Model validates **input** — ensuring the database receives well-formed data.

In MVA, the Model serves a dual purpose. It validates input (as in MVC), but it also acts as an **output security boundary**. The Zod schema with `.strict()` (applied by the developer) ensures that only declared fields reach the agent. The framework also auto-applies `.strict()` on input validation schemas. This is a fundamental inversion:

| Aspect | MVC Model | MVA Model |
|---|---|---|
| **Primary role** | Data persistence and input validation | Data validation **and** output filtering |
| **Security direction** | Inbound (protects the database) | Inbound **and** outbound (protects the agent) |
| **Unknown fields** | Passed through silently | Rejected with actionable errors |
| **Scope** | Application-wide (shared schema) | Application-wide (shared schema) |
| **Implementation** | ORM schema (Prisma, Eloquent) | Zod schema with `.strict()` |

```typescript
// MVC Model — protects the database
const User = prisma.defineModel({
    id: String,
    name: String,
    email: String,
    password_hash: String,  // Exists in the model, may leak to the view
    tenant_id: String,       // Internal field, may leak to the view
});

// MVA Model — protects the database AND the agent
const userSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    // password_hash → not declared → rejected by .strict()
    // tenant_id    → not declared → rejected by .strict()
}).strict();
```

### The View Layer

This is where the architectural difference is most visible. In MVC, the View is a **visual rendering layer** — it produces HTML, CSS, and JavaScript for human eyes. It is tool-level: each controller action has its own view template.

In MVA, the View is a **perception layer** — the Presenter. It does not produce visual output. It produces a **Structured Perception Package**: data + rules + UI blocks + affordances + guardrails. It is domain-level: each domain entity has one Presenter shared across all tools.

| Aspect | MVC View | MVA View (Presenter) |
|---|---|---|
| **Consumer** | Human eyes (browser) | AI agent (LLM context) |
| **Output format** | HTML/CSS/JavaScript | Structured Perception Package (text blocks) |
| **Scope** | Tool-level (one view per action) | Domain-level (one Presenter per entity) |
| **Reusability** | Low — views are coupled to specific pages | High — Presenter reused across all tools |
| **Domain context** | Implicit (humans infer meaning) | Explicit (rules travel with data) |
| **Next actions** | Links, buttons, forms | `.suggestActions()` — typed affordances |
| **Data limits** | Pagination UI (next/prev buttons) | `.agentLimit()` + teaching blocks |
| **Visualizations** | Client-side rendering (Chart.js, etc.) | Server-side rendering (`.uiBlocks()`) |
| **Security** | View templates selectively render fields | Schema `.strict()` rejects undeclared fields |
| **Composition** | Partials, includes, slots | `.embed()` — nested Presenter composition |

```typescript
// MVC View — blade.php template (tool-level)
// resources/views/invoices/show.blade.php
// {{ $invoice->amount_cents / 100 }}  ← domain rule encoded in the template
// <a href="/billing/pay/{{ $invoice->id }}">Pay</a>  ← affordance as a link

// MVA View — Presenter (domain-level)
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .systemRules(['amount_cents is in CENTS. Divide by 100.'])      // domain rule travels with data
    .suggestActions((inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment' }]     // affordance as typed hint
        : []);
```

::: tip The Key Insight
In MVC, domain knowledge is scattered across view templates. In MVA, domain knowledge is **centralized in the Presenter** and automatically attached to every response. This is how MVA reduces perception inconsistency — the rules can't diverge because they live in one place.
:::

### The Controller / Agent Layer

In MVC, the Controller is a passive request handler. It receives HTTP requests from the human-initiated browser, orchestrates business logic, and returns a View. The Controller does not act autonomously — it responds to explicit user actions.

In MVA, the Agent replaces the Controller as the consumer. But the Agent is not a passive request handler. It is an **autonomous consumer** that:

1. Receives the Structured Perception Package
2. Interprets the data using the attached rules
3. Decides the next action using the affordances
4. Executes that action without human intervention
5. Repeats until the goal is achieved

| Aspect | MVC Controller | MVA Agent |
|---|---|---|
| **Nature** | Passive request handler | Autonomous decision-maker |
| **Initiation** | Human clicks a link or submits a form | Agent decides what to call next |
| **Routing** | URL-based (`/invoices/:id`) | Tool-based (`billing.get_invoice`) |
| **Decision making** | None — delegates to business logic | Plans and executes multi-step workflows |
| **Error handling** | Renders error page for human | Self-corrects using error recovery hints |
| **Feedback loop** | Human reads → thinks → acts | Agent perceives → reasons → acts |
| **State** | Session-based | Stateless (context window) |

---

## The Responsibility Shift

The deepest change in MVA is not the renaming of layers. It is the **shift of responsibility** from the consumer to the interface.

### In MVC: The Consumer Does the Work

The MVC View provides minimal context. The human consumer is expected to:

- **Infer meaning** from field names and layout (`amount_cents` → "probably cents")
- **Navigate** by clicking links and buttons
- **Remember** domain rules from training or documentation
- **Judge** what's sensitive and what's not
- **Decide** what to do next based on experience

This works because humans are extraordinary at inference and adaptation.

### In MVA: The Interface Does the Work

The MVA Presenter provides maximum context. The AI agent receives:

- **Explicit interpretation** via system rules — no inference needed
- **Explicit affordances** via action suggestions — no navigation needed
- **JIT domain rules** via Context Tree-Shaking — no memorization needed
- **Strict schema validation** — no judgment about sensitive fields needed
- **Data-driven next actions** — no experience-based decision making needed

This is necessary because AI agents are terrible at inference and have zero domain experience.

```text
MVC Responsibility Distribution:          MVA Responsibility Distribution:
┌────────────┐                            ┌────────────┐
│   Interface │  20% of the work          │   Interface │  90% of the work
│   (View)    │  Layout, colors, basic    │  (Presenter)│  Validation, rules,
│             │  HTML structure            │             │  affordances, guardrails,
│             │                            │             │  UI blocks, composition
└──────┬─────┘                            └──────┬─────┘
       │                                         │
       ▼                                         ▼
┌────────────┐                            ┌────────────┐
│  Consumer   │  80% of the work          │  Consumer   │  10% of the work
│  (Human)    │  Interpretation, domain   │  (Agent)    │  Follow rules,
│             │  knowledge, navigation,   │             │  execute affordances,
│             │  security judgment,        │             │  render UI blocks
│             │  next-action decisions     │             │
└────────────┘                            └────────────┘
```

---

## When MVC Still Makes Sense

MVA does not replace MVC universally. It replaces MVC for a specific consumer class.

| Scenario | Architecture |
|---|---|
| Web dashboard for human users | **MVC** — humans can interpret visual layouts |
| Mobile app with UI components | **MVC/MVVM** — visual components bind to state |
| AI agent accessing domain data via MCP | **MVA** — agents need structured perception |
| CLI tool for developers | **MVC** — developers interpret text output |
| API consumed by both humans and agents | **MVC + MVA** — dual-interface (see below) |

### The Dual-Interface Pattern

Modern products increasingly need both architectures simultaneously:

```typescript
// Shared domain model
const invoiceSchema = z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
});

// MVC: Human-facing API (returns raw data for React/Vue frontend)
app.get('/api/invoices/:id', async (req, res) => {
    const invoice = await db.invoices.findUnique(req.params.id);
    res.json(invoice);  // Frontend renders with React components
});

// MVA: Agent-facing API (returns structured perception package)
const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter,  // ← Perception layer
            params: { id: 'string' },
            handler: async (ctx, args) => ctx.db.invoices.findUnique(args.id),
        },
    },
});
```

Both serve the same business data. Both use the same database. But they serve fundamentally different consumers through fundamentally different architectural patterns.

---

## Historical Precedent

Architectural transitions follow a pattern: a new consumer class emerges, and the existing architecture cannot serve it well.

| Era | Consumer Change | Old Architecture | New Architecture |
|---|---|---|---|
| 1970s | Mainframe → Personal Computer | Monolithic batch processing | Event-driven UI |
| 1990s | Desktop → Web Browser | Desktop GUI | MVC (web) |
| 2010s | Browser → Mobile + SPA | Server-rendered MVC | MVVM, REST, GraphQL |
| **2025** | **Human → AI Agent** | **MVC, REST, RPC** | **MVA** |

Each shift was driven by the same principle: **the existing architecture assumed a consumer that no longer exists.** MVC assumed a human browser. MVA assumes an autonomous AI agent. The pattern repeats.

---

## Summary

| Dimension | MVC | MVA |
|---|---|---|
| **Designed for** | Human consumers | AI agent consumers |
| **View produces** | HTML/CSS for visual rendering | Structured Perception Package for LLM context |
| **View scope** | Tool-level (per page) | Domain-level (per entity) |
| **Domain context** | Implicit (humans infer) | Explicit (rules travel with data) |
| **Next actions** | Links and buttons | Typed affordances with semantic reasons |
| **Data limits** | Pagination UI | Cognitive guardrails with teaching blocks |
| **Security** | View selectively renders | Schema rejects undeclared fields |
| **Responsibility** | Consumer does 80% of interpretation | Interface provides 90% of context |

---

## Continue Reading

<div class="next-steps">

- [**Anatomy of the Presenter →**](/mva/presenter-anatomy) — The 6 responsibilities of the MVA View layer
- [**Perception Package →**](/mva/perception-package) — The exact structure the agent receives
- [**The Theory →**](/mva/theory) — First-principles derivation of MVA
- [**Without MVA vs With MVA →**](/comparison) — Code-level comparison with examples

</div>
