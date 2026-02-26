# Without MVA vs With MVA

| Aspect | Without MVA | With MVA |
|---|---|---|
| **Tool count** | 50 individual tools. Token explosion. | Action consolidation — 5,000+ ops behind ONE tool via `module.action` discriminator |
| **Response format** | `JSON.stringify()` — AI parses and guesses | Structured perception package — validated data + rules + UI + affordances |
| **Domain context** | None. `amount_cents: 45000` — dollars? cents? | System rules travel with data: *"amount_cents is in CENTS. Divide by 100."* |
| **Next actions** | AI hallucinates tool names | Agentic HATEOAS — `.suggestActions()` based on data state |
| **Large datasets** | 10,000 rows dump — token DDoS | `.agentLimit(50)` truncates and teaches filters |
| **Security** | Internal fields leak | Schema as boundary — `.strict()` rejects undeclared fields |
| **Reusability** | Same entity rendered differently per tool | Presenter defined once, reused everywhere |
| **Charts** | Text only | UI Blocks — ECharts, Mermaid, summaries server-side |
| **Routing** | `switch/case` with hundreds of branches | Hierarchical groups — `platform.users.list` |
| **Validation** | Manual `if (!args.id)` | Zod schema at framework level |
| **Error recovery** | `throw new Error('not found')` — AI gives up | `toolError()` with recovery hints and retry args |
| **Middleware** | Copy-paste auth checks | tRPC-style `defineMiddleware()` with context derivation |
| **Cache signals** | None — AI re-fetches stale data forever | State sync — RFC 7234-inspired temporal awareness |
| **Type safety** | Manual casting | `createFusionClient()` with end-to-end inference |

## Side-by-Side: Returning an Invoice {#invoice}

**Without MVA:**

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === 'get_invoice') {
        const invoice = await db.invoices.findUnique(args.id);
        return {
            content: [{ type: 'text', text: JSON.stringify(invoice) }]
        };
    }
    // ...50 more if/else branches
});
// AI receives: { "id": "inv_123", "amount_cents": 45000, "internal_margin": 0.12, "customer_ssn": "123-45-6789" }
// Displays $45,000 instead of $450. Internal fields leak. No next-action guidance.
```

**With MVA:**

```typescript
const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: z.object({
        id: z.string(),
        amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
        status: z.enum(['paid', 'pending', 'overdue']),
    }),
    autoRules: true,
    systemRules: [
        'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.',
        'Always show currency as USD.',
    ],
    uiBlocks: (inv) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }]
        }),
    ],
    suggestActions: (inv) =>
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Invoice is pending — process payment' }]
            : [{ tool: 'billing.archive', reason: 'Invoice is settled — archive it' }],
});

const getInvoice = f.tool({
    name: 'billing.get_invoice',
    input: z.object({ id: z.string() }),
    returns: InvoicePresenter,
    handler: async ({ input, ctx }) => ctx.db.invoices.findUnique(input.id),
});
// AI receives: system rules + validated data (no internal fields) + ECharts gauge + suggested actions
```

## Side-by-Side: Listing Users {#users}

**Without MVA:**

```typescript
case 'list_users':
    const users = await db.users.findMany();
    return { content: [{ type: 'text', text: JSON.stringify(users) }] };
    // 10,000 users × ~500 tokens = context DDoS
```

**With MVA:**

```typescript
const UserPresenter = definePresenter({
    name: 'User',
    schema: z.object({ id: z.string(), name: z.string(), role: z.string() }),
    agentLimit: {
        max: 50,
        onTruncate: (n) => ui.summary(`Showing 50 of ${n}. Use filters to narrow results.`),
    },
    suggestActions: () => [
        { tool: 'users.search', reason: 'Search by name or role for specific users' },
    ],
});
// 50 users shown. Agent guided to filters. ~25,000 tokens instead of ~5,000,000.
```

## Side-by-Side: Error Recovery {#errors}

**Without MVA:**

```typescript
if (!invoice) {
    return { content: [{ type: 'text', text: 'Invoice not found' }], isError: true };
}
// AI: "I encountered an error." (no idea what to try differently)
```

**With MVA:**

```typescript
if (!invoice) {
    return toolError('NOT_FOUND', {
        message: `Invoice ${args.id} not found`,
        recovery: { action: 'list', suggestion: 'List invoices to find the correct ID' },
        suggestedArgs: { status: 'pending' },
    });
}
// AI: "Invoice not found. Let me list pending invoices to find the right one."
```

## The Architecture Difference {#architecture}

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

| | Without MVA | With MVA |
|---|---|---|
| Lines of code per tool | 20-50 (routing + validation + formatting) | 3-5 (handler only) |
| Security | Hope you didn't forget to strip fields | Schema IS the boundary |
| Token cost per call | High (raw dumps, large payloads) | Low (guardrails, TOON, truncation) |
| Maintenance | Every tool re-implements rendering | Presenter defined once |
