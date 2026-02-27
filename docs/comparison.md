# Without MVA vs With MVA

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Before & After: Invoice](#invoice)
- [Before & After: Users](#users)
- [Before & After: Error Recovery](#errors)
- [The Architecture Difference](#architecture)

Every tool response in a raw MCP server is `JSON.stringify()` — the AI receives a flat blob and guesses what it means. MCP Fusion's MVA pattern replaces guessing with a structured perception package: validated data + domain rules + UI blocks + suggested next actions. The resulting server works with every MCP client: Cursor, Claude Desktop, Claude Code, Windsurf, Cline, and VS Code with GitHub Copilot.

| Aspect | Without MVA | With MVA |
|---|---|---|
| **Tool count** | 50 individual tools. Token explosion. | Action consolidation — 5,000+ ops behind ONE tool via `module.action` discriminator |
| **Response format** | `JSON.stringify()` — AI parses and guesses | Structured perception package — validated data + rules + UI + affordances |
| **Domain context** | None. `amount_cents: 45000` — dollars? cents? | System rules travel with data: *"amount_cents is in CENTS. Divide by 100."* |
| **Next actions** | AI hallucinates tool names | Agentic HATEOAS — `.suggest()` / `.suggestActions()` based on data state |
| **Large datasets** | 10,000 rows dump — token DDoS | `.limit(50)` / `.agentLimit(50)` truncates and teaches filters |
| **Security** | Internal fields leak | Schema as boundary — `.strict()` rejects undeclared fields |
| **Reusability** | Same entity rendered differently per tool | Presenter defined once, reused everywhere |
| **Charts** | Text only | UI Blocks — ECharts, Mermaid, summaries server-side |
| **Routing** | `switch/case` with hundreds of branches | Hierarchical groups — `platform.users.list` |
| **Validation** | Manual `if (!args.id)` | Zod schema at framework level |
| **Error recovery** | `throw new Error('not found')` — AI gives up | `toolError()` with recovery hints and retry args |
| **Middleware** | Copy-paste auth checks | tRPC-style `defineMiddleware()` with context derivation |
| **Cache signals** | None — AI re-fetches stale data forever | State sync — RFC 7234-inspired temporal awareness |
| **Deployment** | Stdio only — manual HTTP bridging | One-line adapters for [Vercel Edge](/vercel-adapter), [Cloudflare Workers](/cloudflare-adapter), and [AWS Lambda](/generators/aws) |
| **Code generation** | Write every tool by hand | [OpenAPI Generator](/openapi-gen) turns any spec into a typed MCP server. [Prisma Generator](/prisma-gen) creates CRUD tools from schema. |
| **Integrations** | Build connectors from scratch | [n8n bridge](/generators/n8n) exposes workflows as tools. [OAuth Device Flow](/oauth) for enterprise auth. |
| **Type safety** | Manual casting | `createFusionClient()` with end-to-end inference |

## Before & After: Invoice {#invoice}

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
import { createPresenter, suggest, ui } from '@vinkius-core/mcp-fusion';
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const f = initFusion<AppContext>();

const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .rules([
        'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.',
        'Always show currency as USD.',
    ])
    .ui((inv) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }]
        }),
    ])
    .suggest((inv) =>
        inv.status === 'pending'
            ? [suggest('billing.pay', 'Invoice is pending — process payment')]
            : [suggest('billing.archive', 'Invoice is settled — archive it')]
    );

const getInvoice = f.query('billing.get_invoice')
    .describe('Get an invoice by ID')
    .withString('id', 'Invoice ID')
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => ctx.db.invoices.findUnique(input.id));
// AI receives: system rules + validated data (no internal fields) + ECharts gauge + suggested actions
```

## Before & After: Users {#users}

**Without MVA:**

```typescript
case 'list_users':
    const users = await db.users.findMany();
    return { content: [{ type: 'text', text: JSON.stringify(users) }] };
    // 10,000 users × ~500 tokens = context DDoS
```

**With MVA:**

```typescript
const UserPresenter = createPresenter('User')
    .schema(z.object({ id: z.string(), name: z.string(), role: z.string() }))
    .limit(50)
    .suggest(() => [
        suggest('users.search', 'Search by name or role for specific users'),
    ]);
// 50 users shown. Agent guided to filters. ~25,000 tokens instead of ~5,000,000.
```

## Before & After: Error Recovery {#errors}

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
| Deployment targets | Stdio + manual HTTP bridge | Stdio, SSE, [Vercel](/vercel-adapter), [Cloudflare Workers](/cloudflare-adapter) |
| Maintenance | Every tool re-implements rendering | Presenter defined once |
