# Introduction

**Most MCP servers are built the same way: switch/case routing, JSON.stringify output, no validation, no response shaping.** The handler receives raw input and returns raw output — everything else is left to the developer.

**MCP Fusion** is a framework designed to treat AI agents as **first-class consumers**. It implements the **MVA (Model-View-Agent) pattern**, an architecture where every response is a structured perception package: validated data, domain rules, visual blocks, and explicit action affordances.

---

## The MVA Architecture

The AI industry is building agents on top of patterns designed for humans. MVC serves browsers. REST serves mobile apps. Neither was designed for an autonomous consumer that hallucinates when given ambiguous data.

**MVA (Model-View-Agent)** replaces the human-centric View with the **Presenter** — an agent-centric perception layer that tells the AI exactly how to interpret, display, and act on domain data.

```text
┌─────────────────────────────────────────────────┐
│             Model-View-Agent (MVA)               │
├─────────────────────────────────────────────────┤
│                                                  │
│   Model           →   View          →   Agent    │
│   Zod Schema           Presenter        LLM      │
│   (validates)          (perceives)      (acts)    │
│                                                  │
└─────────────────────────────────────────────────┘
```

→ [Read the MVA Pattern Guide](/mva-pattern)

---

## What **MCP Fusion** Solves

### 1. Context Window Saturation
Standard MCP servers expose individual tools for every operation. 50 tools = 50 JSON schemas burning precious tokens. The LLM's memory degrades and routing accuracy collapses.

**mcp-fusion** consolidates related operations into grouped tools behind a discriminator field. The LLM sees ONE tool, not fifty. Token usage drops by an order of magnitude.

### 2. Perception Inconsistency
Without a View layer, the same entity (invoice, user, task) is presented differently by different tools. The agent cannot build a coherent domain model.

**The Presenter** ensures consistent perception. `InvoicePresenter` is defined once and used across every tool that returns invoices. Same rules, same UI blocks, same affordances.

### 3. Hallucinated Parameters
Raw MCP gives the AI access to your entire input schema. If the AI guesses a parameter name, your handler may receive poisoned data.

**Zod `.strict()`** rejects undeclared fields with an actionable error at the framework level. Your handlers are physically incapable of receiving hallucinated parameters, and the LLM learns which fields are valid.

### 4. Action Blindness
After receiving data, agents guess what to do next. Without explicit guidance, they hallucinate tool names or skip valid actions entirely.

**Agentic Affordances** (`.suggestActions()`) provide HATEOAS-style next-action hints based on data state. The agent knows exactly what it can do.

### 5. Context DDoS
A single `list_all` query can return thousands of records, overwhelming the context window and racking up API costs.

**Cognitive Guardrails** (`.agentLimit()`) automatically truncate large collections and inject teaching blocks that guide the agent toward filters and pagination.

---

## The Architecture at a Glance

```text
LLM calls tool → ToolRegistry routes → GroupedToolBuilder validates
                                         ↓
                                    Middleware chain executes
                                         ↓
                                    Handler returns raw data
                                         ↓
                                    Presenter intercepts:
                                      1. Truncate (agentLimit)
                                      2. Validate (Zod schema)
                                      3. Embed (child Presenters)
                                      4. Render (UI blocks)
                                      5. Attach (domain rules)
                                      6. Suggest (next actions)
                                         ↓
                                    Agent receives structured
                                    perception package
```

### Four Tool APIs <Badge type="tip" text="v2.7" />

| API | Syntax | Zod Required? | Best For |
|---|---|---|---|
| `f.tool()` | tRPC-style `{ input, ctx }` handler | Any Standard Schema | **Recommended** — zero generics, type-safe |
| `defineTool()` | Declarative config object | No | Rapid prototyping, simple params |
| `createTool()` | Fluent builder chain | Yes (Zod) | Complex validation, transforms |
| `createGroup()` | Functional closure with pre-composed middleware | Any Standard Schema | Standalone tool modules |

All four produce identical MCP tool definitions and coexist freely in the same registry.

```typescript
// v2.7 Recommended — initFusion() + f.tool()
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const myTool = f.tool({
    name: 'billing.get_invoice',
    description: 'Gets an invoice by ID',
    input: z.object({ id: z.string() }),
    handler: async ({ input, ctx }) => await ctx.db.invoices.find(input.id),
});
```

---

## Core Capabilities

| Capability | Layer |
|---|---|
| **Context Init (`initFusion`)** | Define context type once; every f.tool/f.presenter/f.registry inherits it |
| **Grouped Tool Routing** | Action consolidation with discriminator enum |
| **File-Based Routing (`autoDiscover`)** | Scan directories, auto-register tools — filesystem as routing table |
| **HMR Dev Server (`createDevServer`)** | Hot-reload tools on file change without restarting LLM client |
| **Presenter (MVA View)** | Domain rules, UI blocks, affordances, composition |
| **Declarative Presenter (`definePresenter`)** | Object-config API with auto-extracted Zod descriptions |
| **Functional Groups (`createGroup`)** | Closure-based tool groups with pre-composed middleware |
| **Standard Schema** | Decouple from Zod — support Valibot, ArkType, TypeBox |
| **Zod Validation & `.strict()`** | Security boundary against hallucinated params |
| **Context Derivation** | tRPC-style `defineMiddleware()` / `f.middleware()` with type inference |
| **Hierarchical Groups** | Namespace 5,000+ actions with `module.action` keys |
| **Self-Healing Errors** | `toolError()` with recovery hints for autonomous agents |
| **Streaming Progress** | Generator handlers yield `progress()` events |
| **Type-Safe Client** | `createFusionClient()` with full autocomplete |
| **State Sync** | RFC 7234-inspired cache-control to prevent temporal blindness |
| **Observability** | Zero-overhead debug observers with typed event system |
| **TOON Compression** | Token-optimized descriptions and responses |
| **Freeze-After-Build** | Immutability guarantees for production safety |
| **Subpath Exports** | 10 granular entry points for minimal bundle size |

---

## Who Is This For?

**For engineers building AI-powered products.** If your backend serves data to LLM agents — through any MCP-compatible runtime (Claude, GPT, Gemini, or open-weight models) — **MCP Fusion** gives you the architecture to do it at scale without hallucination.

**For teams scaling beyond prototypes.** When your MCP server grows from 5 tools to 500 actions, mcp-fusion's routing, middleware, and Presenter system keep the codebase clean and the agent accurate.

**For enterprises with security requirements.** Zod `.strict()` validation, RBAC-aware Presenters, freeze-after-build immutability, and typed context derivation provide defense-in-depth for production MCP deployments.

---

## Installation

::: code-group
```bash [npm]
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [pnpm]
pnpm add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [yarn]
yarn add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
:::

---

## Next Steps

<div class="next-steps">

- [**DX Guide →**](/dx-guide) — `initFusion()`, `definePresenter()`, `autoDiscover()`, Standard Schema
- [**Quickstart →**](/quickstart) — Build your first tool in 5 minutes
- [**Presenter →**](/presenter) — The agent-centric View layer
- [**Building Tools →**](/building-tools) — `f.tool()`, `defineTool()`, and `createTool()` in depth

</div>
