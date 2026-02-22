# Cost Reduction & Anti-Hallucination

## Before & After

### Before: How MCP Servers Are Built Today

**Step 1 — Every MCP server is a monolithic switch/case.**

Open any MCP server on GitHub. You'll find the same architecture: one handler function, one `switch` statement, and `JSON.stringify()` as the entire response strategy. No validation. No separation of concerns. No perception layer. As the number of operations grows, the handler becomes a monolith:

```typescript
// This is the reality of MCP servers today.
// Every server in the ecosystem follows this pattern.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
        case 'create_user':
            const user = await db.users.create(args);  // no validation
            return { content: [{ type: 'text', text: JSON.stringify(user) }] };
            // ↑ leaks tenant_id, password_hash, internal_flags to the LLM

        case 'get_user':
            const found = await db.users.findUnique({ where: { id: args.id } });
            return { content: [{ type: 'text', text: JSON.stringify(found) }] };

        case 'update_user':
            // copy-paste from create_user with minor changes
            const updated = await db.users.update({ where: { id: args.id }, data: args });
            return { content: [{ type: 'text', text: JSON.stringify(updated) }] };

        case 'list_invoices':
            const invoices = await db.invoices.findMany();  // no limit, returns 10,000 rows
            return { content: [{ type: 'text', text: JSON.stringify(invoices) }] };
            // ↑ 10,000 rows × ~500 tokens = 5,000,000 tokens in one response

        // ... 46 more cases, same pattern, growing into a 2,000-line file
    }
});
```

No input validation — the LLM can send anything. No output filtering — internal fields leak. No domain context — the agent gets raw data and guesses. No guardrails — a single `findMany()` can blow through the context window. And as the server grows from 5 tools to 50, the switch/case becomes an unmaintainable monolith.

**Step 2 — The company compensates with a system prompt.**

Since the tools can't teach the LLM anything, the company writes a **book of instructions** in the system prompt — rules for every domain entity, every edge case, every formatting convention:

```text
System Prompt (sent on EVERY LLM call, regardless of what tool is being used):

"When displaying invoices, amount_cents is in cents. Always divide by 100..."
"For users, mask email addresses for non-admin roles..."
"Task statuses use emojis: 🔄 In Progress, ✅ Done, ❌ Blocked..."
"Sprint velocity is calculated as completed story points / sprint days..."
"Project budgets are always in USD. Format as $XX,XXX.00..."
"When showing reports, always include the date range in the header..."
"Never display fields: tenant_id, password_hash, internal_flags..."
... (50+ rules for 15+ domain entities)

~2,000 tokens. Sent even when the agent is just calling tasks.list
and needs none of these invoice, sprint, or budget rules.
```

The company is sending a book to an endpoint that doesn't need it. Every single LLM call — even a simple `tasks.list` — pays the full price for invoice formatting rules, sprint velocity formulas, and budget conventions it will never use.

**Step 3 — Every operation is a separate tool.**

50 operations = 50 tool definitions, each with name, description, and JSON schema. All 50 are injected into the LLM's context on every conversation turn:

```text
Tool 1/50: create_user        — ~180 tokens (name + description + inputSchema)
Tool 2/50: get_user            — ~160 tokens
Tool 3/50: update_user         — ~210 tokens
...
Tool 50/50: export_report      — ~190 tokens

Total: ~10,000 tokens of tool schemas, on every turn.
```

The agent needs 1-2 tools for the current task. It pays for 50.

**The result:**

```text
~10,000 tokens (50 tool schemas)
+ ~2,000 tokens (system prompt book)
= ~12,000 tokens of prompt tax per turn — mostly irrelevant noise.

The agent picks the wrong tool → retry (re-pays 12,000 tokens).
The agent invents a parameter → retry (re-pays 12,000 tokens).
The agent guesses wrong about the data → user corrects → re-pays again.
```

### After: mcp-fusion with MVA

Same 50 operations. The LLM calls `tools/list`:

```text
Tool 1/5: users     — 350 tokens (6 actions: list, get, create, update, delete, invite)
Tool 2/5: projects  — 340 tokens (5 actions: list, get, create, update, archive)
Tool 3/5: billing   — 380 tokens (8 actions: list, get, create, pay, refund, ...)
Tool 4/5: tasks     — 320 tokens (6 actions: list, get, create, update, assign, close)
Tool 5/5: reports   — 280 tokens (3 actions: generate, export, schedule)

Total: ~1,670 tokens. Same 50 operations.
System prompt domain rules: 0 tokens. Rules travel with data (see below).
```

From ~12,000 tokens to ~1,670. No book of instructions in the system prompt — domain rules are injected **just-in-time** only when the agent receives data from that domain.

Then the tool responds — not with raw JSON, but with a **structured perception package**:

```text
Content Block 1 — DATA (Zod-validated, only declared fields):
{"id":"INV-001","amount_cents":45000,"status":"pending"}

Content Block 2 — SERVER-RENDERED UI:
[echarts gauge chart config]
[SYSTEM]: Pass this echarts block directly to the user interface.

Content Block 3 — DOMAIN RULES (JIT, scoped to this domain only):
[DOMAIN RULES]:
- CRITICAL: amount_cents is in CENTS. Divide by 100 before display.
- Use currency format: $XX,XXX.00
- Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue

Content Block 4 — NEXT ACTIONS (computed from data state):
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder
```

No guessing. Undeclared fields rejected. Domain rules scoped. Next actions data-driven. Charts server-rendered.

**The agent gets it right the first time.** Fewer tokens in the prompt. Fewer retries. Faster response. Lower cost.

---

## The Design Thesis

<div class="equation-header">

> **The equation behind every design decision in mcp-fusion:**

```text
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│    Fewer Tokens + Fewer Requests = Less Hallucination + Less Cost   │
│                                                                     │
│    ↓ Tokens per call             ↓ Retry loops                      │
│    ↓ Tools in context            ↓ Re-reads of stale data           │
│    ↓ Noise in responses          ↓ Correction calls                 │
│    ─────────────────────────────────────────────────────────         │
│    = Faster responses · Lower API bills · Deterministic behavior    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

</div>

We believe cost and hallucination are not separate problems — they are **two symptoms of the same root cause**: too many tokens flowing through the LLM context window, and too many requests being made because the agent didn't get what it needed the first time.

Every design decision in mcp-fusion is guided by this principle. This page documents the mechanisms we've implemented so far to attack both sides of the equation.

---

## The Problem We're Solving

Every interaction with an LLM has a direct cost:

```text
Cost per call = (input_tokens + output_tokens) × price_per_token
Total cost    = cost_per_call × number_of_calls
```

But the **hidden cost** — the one that multiplies everything — comes from retry loops:

| Problem | What Tends to Happen | Cost Impact |
|---|---|---|
| **Context Saturation** | Too many tool schemas flood the prompt | Agent picks wrong tool → retry |
| **Hallucinated Parameters** | Agent invents field names | Validation fails → retry |
| **Ambiguous Data** | No domain rules → agent guesses | Wrong output → user corrects → re-call |
| **Action Blindness** | Agent doesn't know next step | Hallucinates tool name → error → retry |
| **Stale Data** | Agent uses cached results after mutation | Wrong answer → user notices → re-call |
| **Context DDoS** | Thousands of rows returned unbounded | Massive token bill + context overflow |

Each retry is a full round-trip: input tokens + output tokens + latency + API cost. Our goal is to reduce these retries as close to zero as practical.

---

## Our Approach: 8 Mechanisms

We attack cost and hallucination through eight interconnected mechanisms. Each maps directly to code in the repository.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                      The Anti-Hallucination Stack                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ① Action Consolidation        → Fewer tools in context   → ↓ tokens    │
│  ② TOON Encoding               → Compact descriptions     → ↓ tokens    │
│  ③ Zod .strict()              → No hallucinated params   → ↓ retries   │
│  ④ Self-Healing Errors         → Fix on first retry       → ↓ retries   │
│  ⑤ Cognitive Guardrails        → Bounded response size    → ↓ tokens    │
│  ⑥ Agentic Affordances         → Correct next action      → ↓ retries   │
│  ⑦ JIT Context (System Rules)  → No guessing domain logic → ↓ retries   │
│  ⑧ State Sync                  → No stale-data re-reads   → ↓ requests  │
│                                                                          │
│  Design goal: significant cost reduction + deterministic agent behavior  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ① Action Consolidation — Reducing Tool Count

**The problem:** Standard MCP servers create one tool per operation. 50 tools = 50 JSON schemas injected into the LLM's system prompt. The context window fills with schema metadata before the agent even sees the user's question.

**Our approach:**

Operations are grouped behind a single tool with a discriminator enum. The schema surface area shrinks significantly:

```typescript
// Instead of 6 individual tools (~1,200 tokens in the prompt),
// one grouped tool covers the same operations (~350 tokens)
const projects = defineTool<AppContext>('projects', {
    actions: {
        list:    { readOnly: true, handler: ... },
        get:     { readOnly: true, params: { id: 'string' }, handler: ... },
        create:  { params: { name: 'string' }, handler: ... },
        update:  { params: { id: 'string', name: 'string' }, handler: ... },
        archive: { destructive: true, params: { id: 'string' }, handler: ... },
        delete:  { destructive: true, params: { id: 'string' }, handler: ... },
    },
});
```

Under the hood, `SchemaGenerator.ts` compiles all actions into **one** `inputSchema` with a discriminator enum, and `applyAnnotations()` adds per-field context — telling the LLM which fields are needed for which action:

```typescript
// From: src/framework/schema/SchemaGenerator.ts
// Per-field annotations reduce parameter-guessing by providing explicit context
annotateField(properties, key, `Required for: ${tracking.requiredIn.join(', ')}`);
```

**What we're aiming for:**

| Metric | Without Consolidation | With Consolidation |
|---|---|---|
| Tools in prompt | 50 | 1-5 |
| Approximate schema tokens | ~10,000 | ~1,500 |
| Tool-selection ambiguity | Higher | Reduced |

---

## ② TOON Encoding — Compact Token Representation

**The problem:** Tool descriptions and responses use verbose JSON, spending tokens on structural characters (`{`, `}`, `"`, `:`) that carry no semantic information.

**Our approach:**

TOON (Token-Oriented Object Notation) replaces JSON structure with compact pipe-delimited tabular data — both in tool descriptions and in response payloads:

```typescript
// From: src/framework/schema/ToonDescriptionGenerator.ts
function encodeFlatActions<TContext>(
    actions: readonly InternalAction<TContext>[],
): string {
    const rows = actions.map(a => buildActionRow(a.key, a));
    return encode(rows, { delimiter: '|' });
}
// Result: "action|desc|required\nlist|List projects|\nget|Get by ID|id"
```

For responses, `toonSuccess()` provides an opt-in encoding path:

```typescript
// From: src/framework/response.ts
export function toonSuccess(data: unknown, options?: EncodeOptions): ToolResponse {
    const defaults: EncodeOptions = { delimiter: '|' };
    const text = encode(data, { ...defaults, ...options });
    return { content: [{ type: "text", text }] };
}
```

Based on our testing, TOON achieves roughly **40-50% token reduction** over equivalent JSON for tabular data (source: `toonSuccess()` JSDoc). The savings compound across every call in a conversation.

---

## ③ Zod `.strict()` — Preventing Parameter Hallucination

**The problem:** LLMs frequently invent parameter names. Without strict validation, these ghost fields can leak into handlers, causing silent bugs or unexpected behavior.

**Our approach:**

Every action's Zod schema is compiled with `.strict()` at build time. Undeclared fields are **explicitly rejected** with an actionable error telling the LLM exactly which fields are invalid:

```typescript
// From: src/framework/builder/ToolDefinitionCompiler.ts
function buildValidationSchema(action, commonSchema) {
    const base = applyCommonSchemaOmit(commonSchema, action.omitCommonFields);
    const specific = action.schema;
    const merged = base && specific ? base.merge(specific) : (base ?? specific);
    if (!merged) return null;
    return merged.strict();  // ← rejects all undeclared fields with actionable error
}
```

This validation happens in `ExecutionPipeline.ts` before the handler runs — making it physically impossible for hallucinated parameters to reach application code:

```typescript
// From: src/framework/execution/ExecutionPipeline.ts
const result = validationSchema.safeParse(argsWithoutDiscriminator);
// Valid: validated args go to handler
// Invalid: self-healing error (see mechanism ④)
```

---

## ④ Self-Healing Errors — Reducing Retry Loops

**The problem:** When validation fails, a generic error like `"Validation failed: email: Invalid"` gives the LLM no guidance on what format is expected. The agent tries blind variations — each costing a full round-trip.

**Our approach:**

`ValidationErrorFormatter.ts` translates Zod errors into directive correction prompts that aim to help the agent self-correct on the first retry:

```typescript
// From: src/framework/execution/ValidationErrorFormatter.ts
// Instead of: "Validation failed: email: Invalid"
// Produces actionable correction:
// "❌ Validation failed for 'users.create':
//   • email — Invalid email format. You sent: 'admin@local'.
//     Expected: a valid email address (e.g. user@example.com).
//   • age — Number must be >= 18. You sent: 10.
//   💡 Fix the fields above and call the action again."
```

For business-logic errors, `toolError()` provides structured recovery guidance:

```typescript
// From: src/framework/response.ts
return toolError('ProjectNotFound', {
    message: `Project '${args.project_id}' does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs, then retry.',
    availableActions: ['projects.list'],
});
```

The design goal is to bring the average retries-per-error as close to 1 as possible.

---

## ⑤ Cognitive Guardrails — Bounding Response Size

**The problem:** A single `list_all` operation can return thousands of records. At ~500 tokens per record, that can mean millions of tokens in a single response — overwhelming the context window and generating significant API costs.

**Our approach:**

The Presenter's `.agentLimit()` truncates data **before** it reaches the LLM and injects a teaching block that guides the agent toward filters and pagination:

```typescript
// From: src/framework/presenter/Presenter.ts — make()
if (isArray && this._agentLimit && data.length > this._agentLimit.max) {
    const omitted = data.length - this._agentLimit.max;
    data = data.slice(0, this._agentLimit.max);
    truncationBlock = this._agentLimit.onTruncate(omitted);
}
```

Usage:

```typescript
const TaskPresenter = createPresenter('Task')
    .schema(taskSchema)
    .agentLimit(50, (omitted) =>
        ui.summary(`⚠️ Showing 50 of ${50 + omitted}. Use filters to narrow results.`)
    );
```

**Estimated cost impact (GPT-5.2, input @ $1.75/1M tokens):**

| Scenario | Rows | Tokens | Estimated Cost |
|---|---|---|---|
| No guardrail | 10,000 | ~5,000,000 | ~$8.75 |
| `.agentLimit(50)` | 50 | ~25,000 | ~$0.04 |

Beyond cost, the truncated response stays within the context window, which should help prevent the hallucination cascade that can occur when context overflows.

---

## ⑥ Agentic Affordances — Guiding the Next Action

**The problem:** After receiving data, the agent must decide what to do next. Without guidance, it may hallucinate tool names or skip valid actions — each wrong decision is an avoidable API call.

**Our approach:**

`.suggestActions()` provides HATEOAS-style next-action hints based on data state, which we hope reduces wrong-tool selection:

```typescript
// From: src/framework/presenter/Presenter.ts
.suggestActions((invoice, ctx) => {
    if (invoice.status === 'pending') {
        return [
            { tool: 'billing.pay', reason: 'Process immediate payment' },
            { tool: 'billing.send_reminder', reason: 'Send payment reminder' },
        ];
    }
    return [];
})
```

The agent receives explicit context in the response:

```text
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder
```

The principle is borrowed from REST's HATEOAS — the server tells the client what's possible, rather than leaving the client to guess.

---

## ⑦ JIT Context — Domain Rules That Travel with Data

**The problem:** Global system prompts tend to grow into bloated documents with rules for every domain entity. The agent receives invoice rules when working with tasks. Context space is wasted, and misapplied rules can cause errors.

**Our approach:**

Rules travel **with the data**, not in the system prompt. We call this **Context Tree-Shaking** — domain rules only appear in the LLM's context when that specific domain is active:

```typescript
// From: src/framework/presenter/Presenter.ts — _attachRules()
if (typeof this._rules === 'function') {
    const resolved = this._rules(singleData, ctx)
        .filter((r): r is string => r !== null && r !== undefined);
    if (resolved.length > 0) builder.systemRules(resolved);
}
```

The agent sees rules **only** when they're relevant:

```text
[DOMAIN RULES]:
- CRITICAL: amount_cents is in CENTS. Always divide by 100 before display.
- Use currency format: $XX,XXX.00
- Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue
```

This should reduce both wasted tokens (irrelevant rules in the system prompt) and misapplication errors (applying the wrong domain's rules).

---

## ⑧ State Sync — Preventing Stale-Data Re-reads

**The problem:** After the agent calls `sprints.update`, its cached view of `sprints.list` is stale. Without a signal, the agent may use old data — producing incorrect answers. The user notices, asks again, and triggers an avoidable re-read.

**Our approach:**

State Sync injects causal invalidation signals at the protocol layer, inspired by [RFC 7234](https://tools.ietf.org/html/rfc7234) cache-control semantics:

```typescript
// From: src/framework/state-sync/CausalEngine.ts
// Safety: only invalidate on SUCCESS (failed mutation = state unchanged)
export function resolveInvalidations(policy, isError) {
    if (isError) return [];
    return policy?.invalidates ?? [];
}
```

After a successful mutation, the response includes a system block:

```text
[System: Cache invalidated for sprints.* — caused by sprints.update]
```

And tool descriptions carry cache-control directives:

```text
"Manage sprints. [Cache-Control: no-store]"
"List countries. [Cache-Control: immutable]"
```

Configuration:

```typescript
registry.attachToServer(server, {
    stateSync: {
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'sprints.update', invalidates: ['sprints.*'] },
            { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },
            { match: 'countries.*',    cacheControl: 'immutable' },
        ],
    },
});
```

---

## The Structured Perception Package — Exact Context for the LLM

Reducing tokens is only half of the equation. The other half is about **signal quality** — making sure every token that *does* reach the LLM carries maximum information density. We believe this is what makes the agent smarter: not just fewer tokens, but the *right* tokens at the *right* time.

mcp-fusion structures context at two layers. Everything described below is implemented in real code.

### Layer 1: Tool Definition (what the LLM sees in `tools/list`)

When the LLM starts a conversation, it receives the list of available tools. Each tool definition carries three types of precise context:

**1. Workflow Annotations in the Description**

`DescriptionGenerator.ts` generates a `Workflow:` section that tells the LLM exactly which parameters are required for each action and which actions are destructive:

```text
Manage projects. Actions: list, get, create, update, archive, delete

Workflow:
- 'get': Get project details. Requires: id
- 'create': Create new project. Requires: name
- 'update': Requires: id, name
- 'archive': Requires: id [DESTRUCTIVE]
- 'delete': Requires: id [DESTRUCTIVE]
```

The `[DESTRUCTIVE]` tag comes directly from the action's `destructive: true` flag in the builder. The LLM sees this before making any call.

**2. Per-Field Schema Annotations**

`SchemaGenerator.ts` adds precise per-field annotations to the JSON Schema, telling the LLM exactly which fields belong to which action:

```json
{
  "properties": {
    "action": { "type": "string", "enum": ["list", "get", "create", "update", "delete"] },
    "id":     { "type": "string", "description": "Required for: get, update, delete" },
    "name":   { "type": "string", "description": "Required for: create. For: update" },
    "status": { "type": "string", "description": "For: list" }
  }
}
```

This per-field context is generated by `applyAnnotations()` in `SchemaGenerator.ts`. A field that is required for some actions but optional for others gets a precise annotation like `"Required for: create. For: update"` — not a generic `"(optional)"`.

**3. Tool-Level Annotations**

`AnnotationAggregator.ts` aggregates per-action metadata into MCP standard annotations:

```json
{
  "readOnlyHint": false,
  "destructiveHint": true,
  "idempotentHint": false
}
```

These are resolved automatically: `readOnlyHint` is `true` only if **all** actions are read-only. `destructiveHint` is `true` if **any** action is destructive. The LLM receives behavioral metadata about the tool without having to infer it from descriptions.

### Layer 2: Tool Response (what the LLM sees in `tools/call`)

When a tool responds, the `ResponseBuilder.build()` method composes a multi-block MCP response. Each block is a separate `content` entry with a specific semantic purpose:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                   Structured Perception Package                         │
│              (exact output of ResponseBuilder.build())                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Block 1 — DATA                                                         │
│  Zod-validated, .strict()-ed JSON. Only declared fields.                │
│  {"id":"INV-001","amount_cents":45000,"status":"pending"}               │
│                                                                         │
│  Block 2 — UI BLOCKS (one content entry per block)                      │
│  Server-rendered charts/diagrams with pass-through instruction.         │
│  (echarts config as fenced code block)                                  │
│  [SYSTEM]: Pass this echarts block directly to the user interface.      │
│                                                                         │
│  Block 3 — EMBEDDED PRESENTER BLOCKS                                    │
│  Rules and UI blocks from child Presenters (via .embed()).              │
│  Merged automatically from ClientPresenter, ProductPresenter, etc.      │
│                                                                         │
│  Block 4 — LLM HINTS                                                    │
│  💡 This client has an overdue balance. Mention it proactively.         │
│                                                                         │
│  Block 5 — DOMAIN RULES                                                 │
│  [DOMAIN RULES]:                                                        │
│  - CRITICAL: amount_cents is in CENTS. Divide by 100 before display.   │
│  - Use currency format: $XX,XXX.00                                     │
│  - Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue                   │
│                                                                         │
│  Block 6 — ACTION SUGGESTIONS                                          │
│  [SYSTEM HINT]: Based on the current state, recommended next tools:     │
│    → billing.pay: Process immediate payment                             │
│    → billing.send_reminder: Send payment reminder                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Every block above is generated from real code in `ResponseBuilder.ts` (lines 239-281). The block order, the prefix markers (`[DOMAIN RULES]`, `[SYSTEM HINT]`, `💡`, `[SYSTEM]`), and the formatting are all deterministic — they come directly from the builder, not from the LLM.

### Why This Matters for Intelligence

The key insight is that this context is **scoped and precise**:

- **Domain rules** appear only when their domain is active (Context Tree-Shaking)
- **Action suggestions** are computed from the actual data state, not from a static list
- **UI blocks** are server-rendered with a `[SYSTEM]` directive, so the LLM passes them through unchanged instead of trying to recreate them
- **Per-field annotations** tell the LLM exactly which parameters to send, eliminating parameter guessing
- **Embedded Presenter blocks** compose relational context (invoice rules + client rules) into a single response

None of this lives in the system prompt. It all travels **just-in-time** with the data, and only when relevant. The result is that the LLM operates with precise, task-specific context instead of reasoning over a generic, bloated instruction set.

---

## How These Mechanisms Compound

These mechanisms are designed to reinforce each other:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       The Compounding Effect                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Action Consolidation    → significantly fewer tokens in tool schemas   │
│  + TOON Encoding         → ~30-50% fewer tokens in descriptions        │
│  + Cognitive Guardrails  → bounded response tokens on large datasets    │
│  + JIT Context           → no wasted tokens on irrelevant rules         │
│  ─────────────────────────────────────────────────────────────────       │
│  = Fewer INPUT TOKENS per call                                          │
│                                                                         │
│  Zod .strict()            → fewer hallucinated-parameter retries         │
│  + Self-Healing Errors   → fewer correction attempts needed             │
│  + Agentic Affordances   → fewer wrong-tool selections                  │
│  + State Sync            → fewer stale-data re-reads                    │
│  ─────────────────────────────────────────────────────────────────       │
│  = Fewer TOTAL REQUESTS                                                 │
│                                                                         │
│                          ┌──────────────────────┐                       │
│  COMBINED GOAL       →   │  Lower total cost    │                       │
│                          │  Faster UX           │                       │
│                          │  Less hallucination  │                       │
│                          └──────────────────────┘                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### An Illustrative Scenario

Consider the AI agent from the Before & After section — 50 operations across users, projects, billing, tasks, and reports:

| Metric | Raw MCP Server | With mcp-fusion |
|---|---|---|
| Tools in `tools/list` | 50 | 5 (grouped) |
| Prompt schema tokens | ~10,000 | ~1,670 |
| System prompt domain rules | ~2,000 tokens (global) | 0 (JIT per response) |
| Total prompt tax per turn | ~12,000 | ~1,670 |
| Description format | Plain text | TOON (~40-50% fewer tokens) |
| Response to `tasks.list` (10K rows) | ~5,000,000 tokens | ~25,000 tokens (`.agentLimit()`) |
| Parameter hallucination handling | None — leaks to handler | `.strict()` rejects with actionable error |
| Error guidance | Generic message | Directed correction prompt |
| Stale-data awareness | None | `[Cache-Control]` directives |

The exact savings depend on the workload, model, and use case. Our design goal is to make the difference meaningful at scale.

---

## Token Budget Awareness

We believe developers should be able to measure their token footprint before deployment. mcp-fusion includes a preview tool for this:

```typescript
// From: src/framework/builder/GroupedToolBuilder.ts
const projects = defineTool<AppContext>('projects', { ... });
console.log(projects.previewPrompt());

// Output:
// ┌────────────────────────────────────────────────────────────┐
// │  MCP Tool Preview: projects                                │
// ├─── Description ───────────────────────────────────────────┤
// │  Manage workspace projects. Actions: list, create, ...     │
// ├─── Input Schema ──────────────────────────────────────────┤
// │  { "type": "object", ...  }                                │
// ├─── Token Estimate ────────────────────────────────────────┤
// │  ~342 tokens (1,368 chars)                                 │
// └────────────────────────────────────────────────────────────┘
```

This lets you see exactly what the LLM receives and estimate the token cost — before running a single request.

---

## Summary

Every mechanism in mcp-fusion is guided by one equation:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│      ↓ Tokens per call  ×  ↓ Calls per task  =  ↓↓ Total Cost          │
│                                                                         │
│      ↓ Noise in context  +  ↑ Signal quality  =  ↓↓ Hallucination      │
│                                                                         │
│      ↓ Retries  +  ↓ Latency per call  =  ↑↑ Response Speed            │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════     │
│                                                                         │
│      Fewer tokens. Fewer requests. Faster answers. Lower bills.         │
│      This is the goal we're building toward.                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

We're not claiming perfection — we're sharing the design principles and mechanisms that guide our work. The code is open, the results are measurable, and we welcome scrutiny.

---

## Next Steps

- [The MVA Manifesto →](/mva-pattern) — The architectural pattern behind these mechanisms
- [Performance →](/performance) — Runtime optimizations and benchmarks
- [Building Tools →](/building-tools) — Implement with `defineTool()` and `createTool()`
- [Presenter →](/presenter) — Configure guardrails, rules, and affordances
