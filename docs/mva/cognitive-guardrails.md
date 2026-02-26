# Cognitive Guardrails

> A raw MCP server is a fire hose pointed at a context window. **Cognitive Guardrails** are the valves that control flow, filter noise, and protect the agent's reasoning capacity.

Cognitive Guardrails are the protective mechanisms in MVA that prevent the three most expensive failure modes in agent-based systems: **context overflow** (too much data), **parameter injection** (hallucinated fields), and **error spirals** (agents retrying blindly).

Each guardrail is designed to be **zero-configuration by default, explicit when needed, and educational for the agent** — not just protective, but instructive.

---

## The Three Guardrails

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       Cognitive Guardrails                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ① Smart Truncation            .agentLimit()                         │
│     Bounds response size. Teaches the agent to use filters.          │
│                                                                       │
│  ② Strict Validation           Zod .strict()                        │
│     Rejects hallucinated fields. Names each invalid field.           │
│                                                                       │
│  ③ Self-Healing Errors         toolError() + ValidationFormatter     │
│     Turns errors into coaching prompts. Agents self-correct.         │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## ① Smart Truncation — `.agentLimit()`

### The Problem: Context DDoS

A single `list_all` query can return thousands of records. At ~500 tokens per record, the math is brutal:

| Records | Tokens | Context Impact |
|---|---|---|
| 100 | ~50,000 | Manageable |
| 1,000 | ~500,000 | Degraded accuracy |
| 10,000 | ~5,000,000 | Context overflow |

Beyond cost, large responses degrade accuracy. LLMs lose coherence when the context window fills — they skip information, misinterpret patterns, and produce inconsistent outputs.

### The Solution: Truncate + Teach

`.agentLimit()` does two things: it truncates the dataset AND injects a teaching block that tells the agent how to get better results.

```typescript
const TaskPresenter = createPresenter('Task')
    .schema(taskSchema)
    .agentLimit(50, (omitted) =>
        ui.summary(
            `⚠️ Dataset truncated. Showing 50 of ${50 + omitted} tasks. ` +
            `Use filters to narrow results:\n` +
            `  • status: "in_progress", "done", "blocked"\n` +
            `  • assignee: user ID or name\n` +
            `  • sprint_id: filter by sprint\n` +
            `  • due_before: ISO date for deadline filtering`
        )
    );
```

The agent receives:

```text
[50 task records — validated, with rules and affordances]

⚠️ Dataset truncated. Showing 50 of 3,200 tasks.
Use filters to narrow results:
  • status: "in_progress", "done", "blocked"
  • assignee: user ID or name
  • sprint_id: filter by sprint
  • due_before: ISO date for deadline filtering
```

The agent self-corrects: *"There are 3,200 tasks. Let me filter by status: blocked and sprint_id: current."*

### The Mechanics

1. The handler returns an array (e.g., 3,200 tasks)
2. The Presenter checks: `data.length > agentLimit.max`?
3. If yes: slice to `data.slice(0, max)` → only 50 items
4. Call `onTruncate(omitted)` with the count of removed items (3,150)
5. The callback returns a UI block (typically `ui.summary`) that teaches the agent
6. Only the truncated subset is validated through Zod (saving CPU)
7. The teaching block is appended to the perception package

### Why "Teaching" Matters

Raw truncation alone doesn't help. Without guidance, the agent's next move is to call `list_all` again — getting the same truncated result. The teaching block ensures the agent interprets:

1. **What happened** — "Showing 50 of 3,200"
2. **Why it happened** — dataset too large for efficient processing
3. **What to do differently** — specific filter parameters with valid values

This is not a static error message. It's a **correction prompt** — a structured instruction that guides the agent toward valid parameters.

---

## ② Strict Validation — Zod `.strict()`

### The Problem: Parameter Injection

LLMs frequently hallucinate parameter names. They infer fields from context, training data, or naming conventions. Without strict validation, these ghost fields silently propagate:

```typescript
// The agent calls billing.create with:
{
    "action": "create",
    "name": "Q4 Invoice",
    "amount_cents": 45000,
    "customer_email": "john@example.com",  // ← hallucinated (not in schema)
    "priority": "high",                     // ← hallucinated (not in schema)
    "internal_notes": "Important client"    // ← hallucinated (not in schema)
}
```

Without `.strict()`, these extra fields:
- May silently reach the handler and be written to the database
- May conflict with actual fields in unpredictable ways
- May contain values that look valid but have no corresponding column

### The Solution: Reject with Actionable Errors

Every action's Zod input schema is built with `.strict()` at the framework level via the `ToolDefinitionCompiler`. When the agent sends hallucinated fields, the validation produces a detailed correction prompt:

```xml
<validation_error action="billing/create">
<field name="(root)">Unrecognized key(s) in object: 'customer_email', 'priority', 'internal_notes'. Remove or correct unrecognized fields: 'customer_email', 'priority', 'internal_notes'. Check for typos.</field>
<recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

The agent learns which fields are valid and self-corrects on the next attempt. This is qualitatively different from a generic "Validation failed" error that provides no guidance.

### The Compile-Time Flow

```text
Build Time (ToolDefinitionCompiler):
  buildValidationSchema() → merge(commonSchema, actionSchema).strict()
  Each action gets a pre-compiled input validation schema.

Runtime (ExecutionPipeline):
  LLM sends arguments
  → ExecutionPipeline.safeParse(schema, args)
  → Valid?  → args flow to handler (typed, guaranteed)
  → Invalid? → ValidationErrorFormatter produces coaching prompt
              → Agent receives: which fields are wrong + what's valid
              → No handler execution. No side effects.
```

The handler is physically incapable of receiving hallucinated parameters. The validation boundary is enforced at the framework level, not by individual handler code.

---

## ③ Self-Healing Errors — Turning Failures into Recovery

### The Problem: Error Spirals

When an error occurs, standard MCP servers return a generic message:

```text
Error: Invoice not found
```

The agent has no idea what went wrong or what to try differently. It either:
- Retries with the same arguments (identical failure)
- Tries a different tool entirely (gives up on the task)
- Hallucinates a solution (makes things worse)

Each failed retry is a full round-trip: input tokens + output tokens + latency + cost.

### The Solution: `toolError()` with Recovery Guidance

**MCP Fusion** provides `toolError()` — a structured error builder that includes recovery hints, suggested actions, and corrective arguments:

```typescript
import { toolError, success } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    const invoice = await ctx.db.invoices.findUnique(args.id);

    if (!invoice) {
        return toolError('NOT_FOUND', {
            message: `Invoice '${args.id}' does not exist.`,
            suggestion: 'Call billing.list first to get valid invoice IDs.',
            availableActions: ['billing.list'],
        });
    }

    return success(invoice);
}
```

The agent receives:

```xml
<tool_error code="NOT_FOUND">
<message>Invoice 'INV-999' does not exist.</message>
<recovery>Call billing.list first to get valid invoice IDs.</recovery>
<available_actions>billing.list</available_actions>
</tool_error>
```

The agent self-corrects: *"The invoice doesn't exist. Let me list all invoices to find the right ID."*

### The Agentic Error Presenter

For validation errors (from `.strict()` and Zod), the `ValidationErrorFormatter` automatically produces detailed coaching prompts:

```xml
<validation_error action="projects/create">
<field name="name">Required. You sent: (missing). Expected type: string.</field>
<field name="budget">Expected number, received string. You sent: 'fifty thousand'. Expected type: number.</field>
<recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

This is not just an error — it's an **instruction manual for self-repair**. The agent knows:
1. Which fields failed and why
2. What it sent vs. what was expected (the `You sent:` hint)
3. Actionable suggestions per field (expected type, valid options, or format)
4. A clear directive to fix and retry without explaining the error

### Error Recovery Patterns

**Pattern: Suggest alternative actions**

```typescript
if (!project) {
    return toolError('NOT_FOUND', {
        message: `Project '${args.id}' not found.`,
        suggestion: 'List projects to find valid IDs.',
        availableActions: ['projects.list'],
    });
}
```

**Pattern: Suggest corrective arguments**

```typescript
if (args.status && !validStatuses.includes(args.status)) {
    return toolError('INVALID_STATUS', {
        message: `Status '${args.status}' is not valid.`,
        suggestion: `Valid statuses: ${validStatuses.join(', ')}`,
        availableActions: ['tasks.update'],
    });
}
```

**Pattern: Permission-based errors**

```typescript
if (ctx.user.role !== 'admin') {
    return toolError('FORBIDDEN', {
        message: 'Only administrators can delete projects.',
        suggestion: 'Contact an admin to perform this action.',
        availableActions: [],  // No actions available to this user
    });
}
```

---

## The Compounding Protection

All three guardrails work together to create a multi-layered defense:

```text
                Agent sends request
                       │
                       ▼
           ┌───────────────────────┐
           │  ② Strict Validation   │  Rejects hallucinated fields
           │  Zod .strict()        │  with actionable error
           └──────────┬────────────┘
                       │ (valid args only)
                       ▼
           ┌───────────────────────┐
           │  Handler executes      │  Business logic runs
           │                        │  with guaranteed-typed args
           └──────────┬────────────┘
                       │
               ┌───────┴───────┐
               │               │
          (error)         (success)
               │               │
               ▼               ▼
    ┌─────────────────┐ ┌──────────────────┐
    │  ③ Self-Healing  │ │  ① Truncation     │  Bounds response
    │  toolError()     │ │  .agentLimit()    │  size + teaches
    │  with recovery   │ │  + teaching block │  agent to filter
    └─────────────────┘ └──────────────────┘
               │               │
               └───────┬───────┘
                       │
                       ▼
              Agent receives either:
              • Coaching prompt (learns from failure)
              • Bounded perception package (learns from truncation)
              • Clean data (acts correctly first time)
```

**The virtuous cycle:**

1. **First call:** Agent may send hallucinated params → `strict()` rejects → agent self-corrects
2. **Second call:** Valid params → handler runs → large dataset → `agentLimit()` truncates + teaches
3. **Third call:** Agent uses filters → smaller dataset → clean data → correct action

By the third call, the agent has learned: which fields are valid, how to filter data, and what actions are available. The guardrails have transformed three potential failure loops into a three-step learning sequence.

---

## Cost Impact Analysis

| Without Guardrails | With Guardrails |
|---|---|
| 10,000 rows → ~5M tokens per call | 50 rows → ~25K tokens per call (200× reduction) |
| Hallucinated params → 2-3 retries | Strict validation → 0-1 retries |
| Generic errors → blind retries | Coaching prompts → directed recovery |
| 5-step task → ~15 actual calls | 5-step task → ~6 actual calls |

The guardrails don't just protect — they **educate**. Each interaction makes the agent more effective, reducing the cost curve over the course of a conversation.

---

## Continue Reading

- [Context Tree-Shaking](/mva/context-tree-shaking) — JIT rules vs global system prompts
- [Perception Package](/mva/perception-package) — The full response structure
- [Agentic Affordances](/mva/affordances) — HATEOAS-style next-action hints
- [Cost & Hallucination](/cost-and-hallucination) — Deep dive into the token economics
