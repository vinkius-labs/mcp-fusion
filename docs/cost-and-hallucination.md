# Cost Reduction & Anti-Hallucination

## Before & After {#before-after}

**Before — raw MCP server:**

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    switch (name) {
        case 'create_user':
            const user = await db.users.create(args);  // no validation
            return { content: [{ type: 'text', text: JSON.stringify(user) }] };
            // leaks tenant_id, password_hash, internal_flags
        case 'list_invoices':
            const invoices = await db.invoices.findMany();  // no limit
            return { content: [{ type: 'text', text: JSON.stringify(invoices) }] };
            // 10,000 rows × ~500 tokens = 5,000,000 tokens
        // ...46 more cases
    }
});
```

50 tools × ~200 tokens each = ~10,000 tokens of schemas. Plus a ~2,000-token system prompt with rules for every domain entity — sent even when the agent just calls `tasks.list`. Total: ~12,000 tokens of prompt tax per turn, mostly irrelevant.

**After — MCP Fusion with MVA:**

```text
Tool 1/5: users     — 350 tokens (6 actions)
Tool 2/5: projects  — 340 tokens (5 actions)
Tool 3/5: billing   — 380 tokens (8 actions)
Tool 4/5: tasks     — 320 tokens (6 actions)
Tool 5/5: reports   — 280 tokens (3 actions)
Total: ~1,670 tokens. Same 50 operations. System prompt rules: 0 tokens.
```

Domain rules travel just-in-time with data — not in the system prompt. Response is a structured perception package:

```text
Block 1 — DATA: {"id":"INV-001","amount_cents":45000,"status":"pending"}
Block 2 — UI: [echarts gauge chart config]
Block 3 — DOMAIN RULES: "amount_cents is in CENTS. Divide by 100."
Block 4 — NEXT ACTIONS: → billing.pay: "Invoice is pending"
```

No guessing. Undeclared fields rejected. Next actions data-driven.

## Design Thesis {#thesis}

```text
Fewer Tokens + Fewer Requests = Less Hallucination + Less Cost
```

Cost and hallucination are two symptoms of the same root cause: too many tokens in the context window, too many requests because the agent didn't get adequate context on the first call.

## The 8 Mechanisms {#mechanisms}

```text
① Action Consolidation        → fewer tools in context     → ↓ tokens
② TOON Encoding               → compact descriptions       → ↓ tokens
③ Zod .strict()               → no hallucinated params     → ↓ retries
④ Self-Healing Errors          → fix on first retry         → ↓ retries
⑤ Cognitive Guardrails         → bounded response size      → ↓ tokens
⑥ Agentic Affordances          → correct next action        → ↓ retries
⑦ JIT Context (System Rules)   → no guessing domain logic   → ↓ retries
⑧ State Sync                   → no stale-data re-reads     → ↓ requests
```

## ① Action Consolidation {#consolidation}

Operations grouped behind a single tool with a discriminator enum. Schema surface shrinks significantly:

```typescript
const f = initFusion<AppContext>();

const list = f.tool({ name: 'projects.list', input: z.object({}), handler: async ({ ctx }) => ctx.db.projects.findMany() });
const get = f.tool({ name: 'projects.get', input: z.object({ id: z.string() }), handler: async ({ input, ctx }) => ctx.db.projects.findUnique(input.id) });
const create = f.tool({ name: 'projects.create', input: z.object({ name: z.string() }), handler: async ({ input, ctx }) => ctx.db.projects.create(input) });
```

`SchemaGenerator.ts` compiles all actions into one `inputSchema` with a discriminator enum. `applyAnnotations()` adds per-field context telling the LLM which fields are needed for which action.

| Metric | Without Consolidation | With Consolidation |
|---|---|---|
| Tools in prompt | 50 | 1-5 |
| Schema tokens | ~10,000 | ~1,500 |

## ② TOON Encoding {#toon}

TOON (Token-Oriented Object Notation) replaces JSON structure with pipe-delimited tabular data:

```typescript
// ToonDescriptionGenerator.ts
function encodeFlatActions<TContext>(actions: readonly InternalAction<TContext>[]): string {
    const rows = actions.map(a => buildActionRow(a.key, a));
    return encode(rows, { delimiter: '|' });
}
// → "action|desc|required\nlist|List projects|\nget|Get by ID|id"
```

`toonSuccess()` provides opt-in response encoding. ~40-50% token reduction over equivalent JSON for tabular data.

## ③ Zod `.strict()` {#strict}

Every action's Zod schema compiled with `.strict()` at build time. Undeclared fields rejected with actionable error naming each invalid field:

```typescript
// ToolDefinitionCompiler.ts
const merged = base && specific ? base.merge(specific) : (base ?? specific);
return merged.strict();  // rejects all undeclared fields
```

Validation happens in `ExecutionPipeline.ts` before the handler — hallucinated parameters never reach application code.

## ④ Self-Healing Errors {#self-healing}

`ValidationErrorFormatter.ts` translates Zod errors into directive correction prompts:

```text
❌ Validation failed for 'users.create':
  • email — Invalid email format. You sent: 'admin@local'.
    Expected: a valid email address (e.g. user@example.com).
  • age — Number must be >= 18. You sent: 10.
  💡 Fix the fields above and call the action again.
```

For business-logic errors, `toolError()` provides structured recovery:

```typescript
return toolError('ProjectNotFound', {
    message: `Project '${args.project_id}' does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs, then retry.',
    availableActions: ['projects.list'],
});
```

## ⑤ Cognitive Guardrails {#guardrails}

`.agentLimit()` truncates data before it reaches the LLM and injects a teaching block:

```typescript
const TaskPresenter = definePresenter({
    name: 'Task',
    schema: taskSchema,
    agentLimit: {
        max: 50,
        onTruncate: (omitted) =>
            ui.summary(`Showing 50 of ${50 + omitted}. Use filters to narrow results.`),
    },
});
```

10,000 rows without guardrail → ~5,000,000 tokens. With `.agentLimit(50)` → ~25,000 tokens.

## ⑥ Agentic Affordances {#affordances}

`.suggestActions()` provides HATEOAS-style next-action hints based on data state:

```typescript
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

The agent receives explicit context: `[SYSTEM HINT]: → billing.pay: Process immediate payment`

## ⑦ JIT Context — Domain Rules That Travel with Data {#jit}

Rules travel with the data, not in the system prompt. Context Tree-Shaking ensures domain rules only appear when that specific domain is active:

```typescript
// Presenter.ts — _attachRules()
if (typeof this._rules === 'function') {
    const resolved = this._rules(singleData, ctx)
        .filter((r): r is string => r !== null && r !== undefined);
    if (resolved.length > 0) builder.systemRules(resolved);
}
```

## ⑧ State Sync {#state-sync}

Causal invalidation signals at the protocol layer, inspired by RFC 7234:

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

After successful mutation: `[System: Cache invalidated for sprints.* — caused by sprints.update]`. Failed mutations emit nothing — state didn't change.

## The Structured Perception Package {#perception}

Two layers of precise context, all implemented in real code.

**Layer 1 — Tool Definition** (what the LLM sees in `tools/list`):

`DescriptionGenerator.ts` generates workflow annotations: `'get': Get project details. Requires: id` with `[DESTRUCTIVE]` tags from the action's `destructive: true` flag.

`SchemaGenerator.ts` adds per-field annotations: `"Required for: create. For: update"` — not a generic `"(optional)"`.

`AnnotationAggregator.ts` aggregates per-action metadata: `readOnlyHint` is `true` only if ALL actions are read-only, `destructiveHint` is `true` if ANY action is destructive.

**Layer 2 — Tool Response** (what the LLM sees in `tools/call`):

`ResponseBuilder.build()` composes a multi-block MCP response:

```text
Block 1 — DATA           Zod-validated, .strict()-ed JSON. Only declared fields.
Block 2 — UI BLOCKS       Server-rendered charts/diagrams with pass-through instruction.
Block 3 — EMBEDS          Rules and UI from child Presenters (via .embed()).
Block 4 — LLM HINTS       💡 Contextual hints based on data state.
Block 5 — DOMAIN RULES    [DOMAIN RULES]: scoped rules for this entity only.
Block 6 — ACTIONS         [SYSTEM HINT]: → billing.pay: Process immediate payment
```

Every block deterministic — from the builder, not the LLM. Domain rules appear only when active (Context Tree-Shaking). Action suggestions computed from actual data state. UI blocks passed through unchanged. Embedded Presenter blocks compose relational context into a single response.

## How They Compound {#compounding}

| Metric | Raw MCP Server | With MCP Fusion |
|---|---|---|
| Tools in `tools/list` | 50 | 5 (grouped) |
| Prompt schema tokens | ~10,000 | ~1,670 |
| System prompt domain rules | ~2,000 tokens (global) | 0 (JIT per response) |
| Total prompt tax per turn | ~12,000 | ~1,670 |
| Response to `tasks.list` (10K rows) | ~5,000,000 tokens | ~25,000 (`.agentLimit()`) |
| Parameter hallucination | Leaks to handler | `.strict()` rejects with actionable error |
| Error guidance | Generic message | Directed correction prompt |
| Stale-data awareness | None | `[Cache-Control]` directives |

## Token Budget Preview {#preview}

```typescript
const projects = defineTool<AppContext>('projects', { ... });
console.log(projects.previewPrompt());

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

See exactly what the LLM receives and estimate token cost before running a single request.
