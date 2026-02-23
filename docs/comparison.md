# Without MVA vs With MVA

Every MCP server today follows the same pattern: raw JSON output, manual routing, zero guardrails. The table below shows what changes when you adopt MVA.

## The Quick Comparison

| Aspect | Without MVA | With MVA (**MCP Fusion**) |
|---|---|---|
| **Tool count** | 50 individual tools registered. LLM sees ALL of them. Token explosion. | **Action consolidation** — 5,000+ operations behind ONE tool via `module.action` discriminator. 10x fewer tokens. |
| **Response format** | Raw `JSON.stringify()` — the AI parses and guesses | **Structured perception package** — validated data + rules + UI + affordances |
| **Domain context** | None. `amount_cents: 45000` — is it dollars? cents? yen? | **System rules** travel with the data: *"CRITICAL: amount_cents is in CENTS. Divide by 100."* |
| **Next actions** | The AI hallucinates tool names | **Agentic HATEOAS** — `.suggestActions()` provides explicit hints based on data state |
| **Large datasets** | 10,000 rows dump into context — token DDoS | **Cognitive guardrails** — `.agentLimit(50)` truncates and teaches the agent to use filters |
| **Security** | Internal fields (`password_hash`, `ssn`) leak to LLM | **Schema as boundary** — Zod `.strict()` rejects undeclared fields with actionable errors. Automatic. |
| **Reusability** | Same entity rendered differently by different tools | **Presenter** defined once, reused everywhere. Same rules, same UI, same affordances |
| **Charts & visuals** | Not possible — text only | **UI Blocks** — `.uiBlocks()` renders ECharts, Mermaid diagrams, summaries server-side |
| **Routing** | `switch/case` with hundreds of branches | **Hierarchical groups** — `platform.users.list`, `platform.billing.refund` — infinite nesting |
| **Validation** | Manual `if (!args.id)` checks | **Zod schema** at the framework level. Handlers receive only valid, typed data |
| **Error recovery** | `throw new Error('not found')` — the AI gives up | **Self-healing errors** — `toolError()` with recovery hints and suggested retry args |
| **Middleware** | Copy-paste auth checks in every handler | **tRPC-style** — `defineMiddleware()` with context derivation, pre-compiled chains |
| **Composition** | Flat responses, no nesting | **Presenter embedding** — `.embed()` nests child Presenters. Rules and UI merge automatically |
| **Cache signals** | None — the AI re-fetches stale data forever | **State sync** — `cacheSignal()` and `invalidates()` — RFC 7234-inspired temporal awareness |
| **Token efficiency** | Full JSON payloads every time | **TOON encoding** — `toonSuccess()` reduces token count by ~40% |
| **Type safety** | Manual type casting, no client types | **Type-safe client** — `createFusionClient()` with end-to-end inference, catches errors at build time |
| **Streaming** | No progress feedback during long operations | **Generator-based streaming** — `yield progress(0.5, 'Processing...')` |
| **Tool exposure** | All or nothing | **Tag filtering** — selective tool exposure per session with `.tags()` and `filter` |
| **Immutability** | Mutable state, runtime surprises | **Freeze-after-build** — `Object.freeze()` prevents mutations after build |
| **Observability** | `console.log()` | **Zero-overhead observer** — `createDebugObserver()` with typed event system |

---

## Side-by-Side Code

### Returning an invoice

::: code-group

```typescript [Without MVA]
// ❌ Raw MCP — the AI is on its own
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'get_invoice') {
        const invoice = await db.invoices.findUnique(args.id);
        // Raw JSON. No rules. No hints. No security boundary.
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(invoice)
            }]
        };
    }
    // ...50 more if/else branches
});

// What the AI receives:
// { "id": "inv_123", "amount_cents": 45000, "status": "pending",
//   "internal_margin": 0.12, "customer_ssn": "123-45-6789" }
//
// Problems:
// - AI doesn't know amount_cents is in cents → displays $45,000 instead of $450
// - Internal fields leak (margin, SSN)
// - AI doesn't know it can call "pay" next
// - No visual representation
```

```typescript [With MVA]
// ✅ mcp-fusion — the Presenter handles perception
const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
        // internal_margin and customer_ssn are NOT in the schema
        // → rejected with actionable error naming each invalid field.
    }))
    .systemRules([
        'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.',
        'Always show currency as USD.',
    ])
    .uiBlocks((inv) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }]
        }),
    ])
    .suggestActions((inv) =>
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Invoice is pending — process payment' }]
            : [{ tool: 'billing.archive', reason: 'Invoice is settled — archive it' }]
    );

const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter, // ← One line. That's it.
            params: { id: 'string' },
            handler: async (ctx, args) => ctx.db.invoices.findUnique(args.id),
        },
    },
});

// What the AI receives:
// ── System Rules ──
// CRITICAL: amount_cents is in CENTS. Divide by 100 for display.
// Always show currency as USD.
//
// ── Data ──
// { "id": "inv_123", "amount_cents": 45000, "status": "pending" }
// (internal_margin and customer_ssn were rejected by .strict())
//
// ── UI ──
// [ECharts gauge: $450.00]
//
// ── Suggested Actions ──
// → billing.pay — "Invoice is pending — process payment"
```

:::

---

### Listing users with guardrails

::: code-group

```typescript [Without MVA]
// ❌ Returns ALL 10,000 users into the context window
case 'list_users':
    const users = await db.users.findMany();
    return {
        content: [{
            type: 'text',
            text: JSON.stringify(users) // 10,000 users × 500 tokens each = context DDoS
        }]
    };

// Result: ~5,000,000 tokens per call. Context overflow. Degraded accuracy.
```

```typescript [With MVA]
// ✅ Cognitive guardrails protect the context window
const UserPresenter = createPresenter('User')
    .schema(z.object({ id: z.string(), name: z.string(), role: z.string() }))
    .agentLimit(50, {
        warningMessage: 'Showing {shown} of {total}. Use filters to narrow results.',
    })
    .suggestActions(() => [
        { tool: 'users.search', reason: 'Search by name or role for specific users' },
    ]);

// Result: 50 users shown. Agent guided to use filters.
// Cost: ~25,000 tokens per call (200x reduction). Context protected.
```

:::

---

### Error recovery

::: code-group

```typescript [Without MVA]
// ❌ The AI receives "Error" and gives up
if (!invoice) {
    return {
        content: [{ type: 'text', text: 'Invoice not found' }],
        isError: true
    };
}
// AI: "I encountered an error. Please try again."
// (It has no idea what to try differently)
```

```typescript [With MVA]
// ✅ Self-healing errors with recovery hints
if (!invoice) {
    return toolError('NOT_FOUND', {
        message: `Invoice ${args.id} not found`,
        recovery: {
            action: 'list',
            suggestion: 'List invoices to find the correct ID',
        },
        suggestedArgs: { status: 'pending' },
    });
}
// AI: "Invoice not found. Let me list pending invoices to find the right one."
// → Automatically calls billing.list with { status: 'pending' }
```

:::

---

## The Architecture Difference

```text
Without MVA:                          With MVA:
┌──────────┐                          ┌──────────┐
│  Handler  │→ JSON.stringify() →     │  Handler  │→ raw data →
│           │  raw data to LLM        │           │
└──────────┘                          └──────────┘
                                           ↓
                                      ┌──────────────────────┐
                                      │     Presenter        │
                                      │ ┌──────────────────┐ │
                                      │ │ Schema (strict)  │ │
                                      │ │ System Rules     │ │
                                      │ │ UI Blocks        │ │
                                      │ │ Agent Limit      │ │
                                      │ │ Suggest Actions  │ │
                                      │ │ Embeds           │ │
                                      │ └──────────────────┘ │
                                      └──────────────────────┘
                                           ↓
                                      Structured Perception
                                      Package → LLM
```

---

## Summary

| | Without MVA | With MVA |
|---|---|---|
| **Lines of code per tool** | 20-50 (routing + validation + formatting) | 3-5 (handler only — framework handles the rest) |
| **Security** | Hope you didn't forget to strip fields | Schema IS the boundary. `.strict()` rejects. Automatic. |
| **Agent accuracy** | ~60-70% on complex tasks | ~95%+ with deterministic rules and affordances |
| **Token cost per call** | High (raw dumps, large payloads) | Low (guardrails, TOON encoding, truncation) |
| **Maintenance** | Every tool re-implements rendering | Presenter defined once, reused across all tools |

---

<div class="next-steps">

- [**The MVA Manifesto →**](/mva-pattern) — The full architectural theory
- [**Presenter Deep Dive →**](/presenter) — Schema, rules, UI, affordances
- [**Cookbook & Examples →**](/examples) — 14 copy-pasteable patterns

</div>
