<div align="center">
  <h1>⚡️ mcp-fusion</h1>
  <p><b>The first framework for building MCP servers that agents actually understand.</b></p>
  <p>Not another SDK wrapper. A fundamentally new architecture for the Model Context Protocol.</p>
  
  [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
  [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE)
</div>

<br/>

**[📖 Documentation & Guides](https://vinkius-labs.github.io/mcp-fusion/)** · **[💰 Cost & Hallucination](https://vinkius-labs.github.io/mcp-fusion/cost-and-hallucination)** · **[🍳 Cookbook & Examples](https://vinkius-labs.github.io/mcp-fusion/examples)**

<br/>

## The Problem: Every MCP Server Today Is Built Wrong

Look at any MCP server on GitHub. They all look like this:

```typescript
// ❌ What every MCP server looks like today
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
        case 'get_invoice':
            const invoice = await db.invoices.findUnique(args.id);
            return { content: [{ type: 'text', text: JSON.stringify(invoice) }] };
        //                                          ↑ Raw JSON. The AI has no idea
        //                                            that amount_cents is in cents,
        //                                            what actions are available next,
        //                                            or which fields are sensitive.
        case 'list_invoices':
            // ...50 more cases
    }
});
```

**This is the state of the art in 2025.** Raw JSON output. Manual switch/case routing. No validation. No domain context. No guardrails. The AI sees `{ amount_cents: 45000 }` and guesses — often wrong — whether it's dollars, cents, or yen.

The result:
- 🎯 **Parameter hallucination** — The AI invents field names that don't exist
- 💀 **Data misinterpretation** — `45000` cents displayed as $45,000 instead of $450
- 🔀 **Action blindness** — The AI doesn't know what to do next, so it hallucinates tool names
- 🔓 **No security** — Internal fields leak to the LLM context

---

<div align="center">

### 🧠 The Revolution: MVA (Model-View-Agent)

**MVC was designed for humans. Agents are not humans.**

The AI industry builds agents on MVC, REST, and patterns made for browsers.<br/>
None of them were designed for an autonomous consumer that **hallucinates when given ambiguous data.**

**mcp-fusion** introduces **MVA** — a foundational architecture where the<br/>**Presenter** replaces the human-centric View with an **agent-centric perception layer.**

</div>

```text
┌──────────────────────────────────────────────────────────┐
│              ⚡ Model-View-Agent (MVA)                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│    Model              →   View             →   Agent     │
│    Zod Schema             Presenter            LLM       │
│    (validates)            (perceives)          (acts)     │
│                                                          │
│    ┌────────────────────────────────────────────────┐     │
│    │  📄 Validated Data                            │     │
│    │  📋 Domain Rules — "CENTS. Divide by 100."    │     │
│    │  📊 UI Blocks — ECharts, Mermaid, Summaries   │     │
│    │  🔗 Action Hints — "→ billing.pay"            │     │
│    │  ⚠️  Guardrails — "50 shown, 250 hidden."     │     │
│    └────────────────────────────────────────────────┘     │
│              ▲ Structured Perception Package              │
└──────────────────────────────────────────────────────────┘
```

<div align="center">

> **Every response is a structured perception package — not raw JSON.**<br/>
> The AI doesn't guess. It *knows*.

📖 **[Read the full MVA Pattern Guide →](https://vinkius-labs.github.io/mcp-fusion/mva-pattern)**

</div>

### Without MVA vs With MVA

| | Without MVA | With MVA (mcp-fusion) |
|---|---|---|
| **Tool count** | 50 registered tools. LLM sees ALL. Token explosion. | **Action consolidation** — 5,000+ ops in ONE tool via `module.action` discriminator. 10x fewer tokens. |
| **Response** | `JSON.stringify(data)` — the AI guesses | **Structured perception package** — data + rules + UI + affordances |
| **Domain context** | None. `45000` — dollars? cents? yen? | **System rules**: *"amount_cents is in CENTS. Divide by 100."* |
| **Next actions** | AI hallucinates tool names | **Agentic HATEOAS** — `.suggestActions()` with explicit hints |
| **Large datasets** | 10,000 rows dump into context | **Cognitive guardrails** — `.agentLimit(50)` + filter guidance |
| **Security** | Internal fields leak to LLM | **Schema as boundary** — Zod `.strip()` strips undeclared fields |
| **Charts** | Not possible | **UI Blocks** — `.uiBlocks()` — ECharts, Mermaid, summaries |
| **Routing** | `switch/case` × 50 branches | **Hierarchical groups** — `platform.users.list` — infinite nesting |
| **Error recovery** | `throw Error` — AI gives up | **Self-healing** — `toolError()` with recovery + retry hints |
| **Token cost** | Full JSON payloads every time | **TOON encoding** — ~40% fewer tokens |
| **Type safety** | Manual casting, no client types | **tRPC-style client** — `createFusionClient()` with full inference |
| **Reusability** | Same entity rendered differently everywhere | **Presenter** — define once, reuse across all tools |

📖 **[See the full side-by-side comparison with code examples →](https://vinkius-labs.github.io/mcp-fusion/comparison)**

---

## What It Looks Like in Code

```typescript
// ✅ The mcp-fusion way — your handler returns raw data. That's it.
const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter,     // ← The AI will UNDERSTAND this data
            params: { id: 'string' },
            handler: async (ctx, args) => {
                return await ctx.db.invoices.findUnique({ where: { id: args.id } });
                // Raw data → Presenter validates, renders, guides — automatically
            },
        },
    },
});
```

The **Presenter** automatically:
- ✅ **Validates** data through Zod (strips sensitive fields, rejects invalid shapes)
- ✅ **Injects domain rules** — "amount_cents is in CENTS. Divide by 100."
- ✅ **Renders charts** — Server-side ECharts, Mermaid diagrams
- ✅ **Suggests next actions** — "→ billing.pay: Process payment"
- ✅ **Truncates intelligently** — "50 shown, 250 hidden. Use filters."

No switch/case. No manual JSON.stringify. No praying.

```bash
npm install @vinkius-core/mcp-fusion zod
```

---

## The Presenter: Your Agent's Perception Layer

The Presenter is domain-level, not tool-level. Define `InvoicePresenter` once — every tool that returns invoices uses it. Consistent perception. Zero hallucination.

```typescript
import { createPresenter, ui, defineTool } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// ── Define the Presenter (MVA View Layer) ──
export const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        amount_cents: z.number(),
        status: z.enum(['paid', 'pending', 'overdue']),
    }))
    .systemRules((invoice, ctx) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100 before display.',
        ctx?.user?.role !== 'admin'
            ? 'RESTRICTED: Mask totals for non-admin users.'
            : null,
    ])
    .uiBlocks((invoice) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
        }),
    ])
    .agentLimit(50, (omitted) =>
        ui.summary(`⚠️ 50 shown, ${omitted} hidden. Use filters.`)
    )
    .suggestActions((invoice) =>
        invoice.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : []
    );
```

The agent receives a complete perception package:

```text
📄 DATA       → Validated, sensitive fields stripped
📋 RULES      → "amount_cents is in CENTS. Divide by 100."
📊 UI BLOCKS  → ECharts gauge rendered server-side
⚠️ GUARDRAIL  → "50 shown, 250 hidden. Use filters."
🔗 HINTS      → "→ billing.pay: Process payment"
```

### Pipeline Integration — Zero Boilerplate

Attach the Presenter to any action. The handler returns raw data. The framework handles everything.

```typescript
const billing = defineTool<AppContext>('billing', {
    actions: {
        get_invoice: {
            returns: InvoicePresenter,  // ← MVA View Layer
            params: { id: 'string' },
            handler: async (ctx, args) => {
                return await ctx.db.invoices.findUnique({
                    where: { id: args.id },
                    include: { client: true },
                });
                // Raw data → Presenter validates, renders, suggests — automatically
            },
        },
    },
});
```

### Presenter Composition

Real data has relationships. `.embed()` composes child Presenters for nested data — rules and UI blocks merge automatically.

```typescript
const ClientPresenter = createPresenter('Client')
    .schema(clientSchema)
    .systemRules(['Display company name prominently.']);

const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .embed('client', ClientPresenter);  // ← nested composition
```

---

## Action Consolidation: One Tool, Not Fifty

Standard MCP servers expose individual tools per operation. 50 tools = 50 schemas burning tokens. mcp-fusion consolidates related operations behind a discriminator field.

```typescript
const projects = defineTool<AppContext>('projects', {
    description: 'Manage workspace projects',
    shared: { workspace_id: 'string' },
    actions: {
        list: {
            readOnly: true,
            returns: ProjectPresenter,
            handler: async (ctx, args) => await ctx.db.projects.findMany(),
        },
        create: {
            params: { name: { type: 'string', min: 1 } },
            handler: async (ctx, args) => await ctx.db.projects.create(args),
        },
        delete: {
            destructive: true,
            params: { project_id: 'string' },
            handler: async (ctx, args) => {
                await ctx.db.projects.delete(args.project_id);
                return 'Deleted';
            },
        },
    },
});
```

The LLM sees one perfectly structured tool:
```text
Action: list | create | delete
- 'list': Requires: workspace_id. For: list
- 'create': Requires: workspace_id, name. For: create
- 'delete': Requires: workspace_id, project_id ⚠️ DESTRUCTIVE
```

### Two APIs — One Framework

| Feature | `defineTool()` | `createTool()` |
|---|---|---|
| **Syntax** | Declarative config object | Fluent builder chain |
| **Zod needed?** | No (auto-converts) | Yes |
| **Best for** | Rapid prototyping | Complex validation |

Both produce identical MCP tools. Mix and match freely.

---

## Enterprise Engineering Core

### Hierarchical Groups — 5,000+ Actions
```typescript
new GroupedToolBuilder<AppContext>('platform')
    .tags('core')
    .group('users', 'User management', g => {
        g.use(requireAdmin)
         .action({ name: 'list', readOnly: true, handler: listUsers })
         .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
    })
    .group('billing', 'Billing operations', g => {
        g.action({ name: 'refund', destructive: true, schema: refundSchema, handler: issueRefund });
    });
// Discriminator: users.list | users.ban | billing.refund
```

### Context Derivation — `defineMiddleware()`
tRPC-style middleware that derives typed data into context:
```typescript
import { defineMiddleware } from '@vinkius-core/mcp-fusion';

const requireAuth = defineMiddleware(async (ctx: { token: string }) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user };  // ← TS infers: { user: User }
});
```

### Self-Healing Errors — `toolError()`
Structured recovery for autonomous agents:
```typescript
return toolError('ProjectNotFound', {
    message: `Project '${id}' does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs.',
    availableActions: ['projects.list'],
});
// Output: [ProjectNotFound] Project 'xyz' does not exist.
//         💡 Suggestion: Call projects.list first.
//         📋 Try: projects.list
```

### Streaming Progress — `progress()`
```typescript
handler: async function* (ctx, args) {
    yield progress(10, 'Cloning repository...');
    yield progress(50, 'Building AST...');
    yield progress(90, 'Almost done...');
    return success('Deployed successfully');
}
```

### Type-Safe Client — `createFusionClient()`
End-to-end type safety from server to client:
```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion/client';
import type { AppRouter } from './mcp-server';

const client = createFusionClient<AppRouter>(transport);
const result = await client.execute('projects.create', { name: 'Vinkius V2' });
//                                   ^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^
//                                   autocomplete!       typed args!
```

### State Sync — Temporal Awareness
RFC 7234-inspired cache-control signals prevent agents from using stale data:
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

### Zod Parameter Stripping
When the LLM sends arguments, Fusion merges schemas using `.merge().strip()`, then `safeParse()`. Unknown fields are silently removed. **The LLM cannot inject parameters your schema does not declare.**

### Tag-Based Context Gating
Control exactly what the LLM sees per session:
```typescript
registry.attachToServer(server, { filter: { tags: ['core'] } });      // Only core tools
registry.attachToServer(server, { filter: { exclude: ['internal'] } }); // No internal tools
```

### Freeze-After-Build Immutability
After `buildToolDefinition()`, the builder is permanently frozen. `Object.freeze()` prevents mutation. Mutation methods throw. This eliminates accidental post-registration bugs.

---

## Complete Capability Matrix

| Capability | What It Solves |
|---|---|
| **MVA Presenter** | Domain rules, UI blocks, affordances — consistent agent perception |
| **Presenter Composition** | `.embed()` nests child Presenters for relational data |
| **Cognitive Guardrails** | `.agentLimit()` prevents context DDoS from large datasets |
| **Agentic Affordances** | `.suggestActions()` HATEOAS-style next-action hints |
| **Context-Aware Rules** | RBAC/DLP through dynamic `systemRules()` with `ctx` |
| **Action Consolidation** | Grouped tools with discriminator enum reduce token burn |
| **Hierarchical Groups** | Namespace 5,000+ actions with `module.action` keys |
| **4-Tier Field Annotations** | LLM knows exactly which fields to send per action |
| **Zod `.merge().strip()`** | Security boundary — unknown fields silently stripped |
| **Two APIs** | `defineTool()` (zero Zod) and `createTool()` (full Zod) |
| **Context Derivation** | tRPC-style `defineMiddleware()` with type inference |
| **Self-Healing Errors** | `toolError()` with recovery hints for autonomous agents |
| **Streaming Progress** | Generator handlers yield `progress()` events |
| **Type-Safe Client** | `createFusionClient()` with autocomplete and typed args |
| **State Sync** | RFC 7234 cache-control prevents temporal blindness |
| **TOON Encoding** | Token-optimized descriptions and responses |
| **Tag Filtering** | Context gating — control what the LLM sees per session |
| **Observability** | Debug observers with zero-overhead typed event system |
| **Introspection API** | Runtime metadata for compliance audits |
| **Freeze-After-Build** | `Object.freeze()` — immutability after registration |
| **Duck-Typed Server** | Works with `Server` and `McpServer` — zero coupling |

---

## Learn by Doing

| Guide | Description |
|---|---|
| 🧠 **[The MVA Manifesto](docs/mva-pattern.md)** | Why every MCP server today is built wrong — and how MVA fixes it |
| 💰 **[Cost & Hallucination](docs/cost-and-hallucination.md)** | Fewer tokens + fewer requests = less hallucination + less cost |
| 🏁 **[5-Minute Quickstart](docs/quickstart.md)** | Build your first Fusion server from zero |
| 🍳 **[Cookbook & Examples](docs/examples.md)** | 14 copy-pasteable real-world patterns for every feature |
| 🎯 **[Presenter Deep Dive](docs/presenter.md)** | The agent-centric View layer — schema, rules, UI, suggestions |
| 📖 **[Introduction](docs/introduction.md)** | Core concepts and philosophy |
| 🏗️ **[Architecture](docs/architecture.md)** | Domain model, strategy engine, execution pipeline |
| 🛡️ **[Middleware](docs/middleware.md)** | Context derivation, authentication, pre-compiled chains |
| 📈 **[Scaling](docs/scaling.md)** | Tag filtering, TOON, hierarchical groups at scale |
| 🧠 **[State Sync](docs/state-sync.md)** | Prevent temporal blindness with cache signals |
| 🔭 **[Observability](docs/observability.md)** | Zero-overhead debug observers with typed event system |
| 📖 **[API Reference](docs/api-reference.md)** | Complete typings and method reference |

---

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@modelcontextprotocol/sdk ^1.12.1` (peer dependency)
- `zod ^3.25.1 || ^4.0.0` (peer dependency)
- `@toon-format/toon` (for TOON features)
