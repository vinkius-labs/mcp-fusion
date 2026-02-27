# MVA Architecture

Every software architecture in history assumes a human at the end of the pipeline. MVC renders HTML for browsers. MVVM binds state to visual components. REST exposes resources for mobile apps. All of them rely on a consumer that can **interpret ambiguity**, **navigate inconsistency**, and **apply domain knowledge** that the interface never provided.

AI agents can do none of this. When an agent receives `{ "amount_cents": 45000 }`, it does not *know* it's cents. It does not *know* to divide by 100. It does not *know* that the next action is `billing.pay`. It guesses — and when it guesses wrong, it hallucinates.

**MVA solves this by replacing the human-centric View with the Presenter** — a deterministic perception layer that tells the agent exactly what the data means, how to display it, and what to do next.

## The Three Layers

| Layer | Role | Implemented As |
|---|---|---|
| **Model** | Defines the shape and constraints of domain data. Acts as a security boundary when using `.strict()` — only declared fields pass through. | `z.object({ ... }).strict()` |
| **View (Presenter)** | Transforms raw data into a **Structured Perception Package** — data + rules + UI blocks + affordances + guardrails. Domain-level, not tool-level. | `definePresenter()` / `createPresenter()` |
| **Agent** | The autonomous consumer. Receives the perception package and acts deterministically based on the structured context it was given. | Any MCP-compatible LLM (Claude, GPT, Gemini series, or open-weight models) |

## The Core Thesis

**An AI agent should never have to guess.**

Every piece of data should arrive with:
1. **Validation** — a schema that rejects what doesn't belong
2. **Interpretation rules** — domain knowledge that removes ambiguity
3. **Visual representation** — server-rendered charts and diagrams
4. **Action guidance** — explicit next steps based on data state
5. **Cognitive limits** — bounded results with filter guidance

When all five are present, the agent perceives the domain consistently. Hallucination risk is reduced at the architecture level, not patched at the prompt level.

## Concept Map

| MVA Concept | What It Does | Guide |
|---|---|---|
| **The Theory** | Why MVC fails for agents, first-principles design of MVA | [Read →](/mva/theory) |
| **MVA vs MVC** | Formal layer-by-layer comparison of the two paradigms | [Read →](/mva/mva-vs-mvc) |
| **Presenter Anatomy** | The 6 responsibilities of the Presenter, lifecycle, composition | [Read →](/mva/presenter-anatomy) |
| **Perception Package** | The 6-block response structure the agent receives | [Read →](/mva/perception-package) |
| **Agentic Affordances** | HATEOAS for AI — data-driven next-action hints | [Read →](/mva/affordances) |
| **Context Tree-Shaking** | JIT domain rules that replace global system prompts | [Read →](/mva/context-tree-shaking) |
| **Cognitive Guardrails** | Truncation, strict validation, self-healing errors | [Read →](/mva/cognitive-guardrails) |

## Quick Reference: MVA in Code

```typescript
import { createPresenter, t, suggest, ui, defineTool } from '@vinkius-core/mcp-fusion';

// ── VIEW: The Presenter — agent-centric perception layer ──
const InvoicePresenter = createPresenter('Invoice')
    .schema({                                             // Model
        id:           t.string,
        amount_cents: t.number,
        status:       t.enum('paid', 'pending', 'overdue'),
    })
    .rules([                                              // Interpretation
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ])
    .ui((inv) => [                                        // Visualization
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ])
    .limit(50)                                            // Guardrail
    .suggest((inv) => [                                   // Affordance
        suggest('billing.pay', 'Process payment'),
        inv.status === 'overdue'
            ? suggest('billing.escalate', 'Escalate to collections')
            : null,
    ].filter(Boolean));

// ── AGENT: Receives a Structured Perception Package ──
const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter,  // ← One line. Zero boilerplate.
            params: { id: 'string' },
            handler: async (ctx, args) => ctx.db.invoices.findUnique(args.id),
        },
    },
});
```

The handler returns **raw data**. The Presenter intercepts it in the execution pipeline, validates through Zod, strips undeclared fields, attaches domain rules, renders charts, applies truncation, and suggests next actions — all automatically. The agent never sees raw JSON. It sees a **structured perception package**.
