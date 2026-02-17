<div align="center">
  <h1>⚡️ mcp-fusion</h1>
  <p><b>The Enterprise Multiplexer for MCP. Route 5,000+ endpoints through a single LLM tool.</b></p>
  
  [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
  [![MCP SDK](https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square)](https://modelcontextprotocol.io/)
  [![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](LICENSE)
</div>

<br/>

**Stop registering hundreds of individual Model Context Protocol (MCP) tools. Ship ONE.**

`mcp-fusion` is an advanced TypeScript framework that consolidates related MCP operations into a single tool behind a discriminator field. Built with a strict **domain model layer** for hierarchical entity management and a **build-time strategy engine** designed to scale to 5,000+ endpoints.

Fewer tools mean less context pressure on the LLM, zero routing hallucinations, and radically cleaner server code.

```bash
npm install @vinkius-core/mcp-fusion zod
```

---

## 🚨 The Architectural Bottleneck: Context Collapse

Standard MCP servers that expose individual tools for every CRUD operation (`create_project`, `update_project`, `delete_project`, `list_projects`) create two cascading system failures:

1. **Context Exhaustion:** Every tool definition burns expensive tokens in the LLM's context window. At 30+ tools, API costs explode and the model's memory degrades.
2. **Routing Confusion:** Semantically similar tools compete for selection. The LLM hallucinates parameters or picks `update_project` when it should pick `create_project`.

The workaround is writing fewer, bloated tools — or rotating tool sets per conversation. Both are brittle.

## ✅ The Solution: Build-Time Multiplexing & Context Gating

Group related operations under a single tool. The LLM sees ONE `platform` tool and selects the exact operation through an `action` enum. 

The framework handles description generation, schema composition, annotation aggregation, middleware compilation, strict validation, and error formatting — **all at build time**.

```mermaid
graph LR
    classDef llm fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef chaos fill:#fee2e2,stroke:#ef4444,stroke-width:2px,color:#991b1b;
    classDef gateway fill:#0ea5e9,stroke:#0369a1,stroke-width:3px,color:#fff,font-weight:bold;
    classDef gate fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef engine fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff;
    classDef secure fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef danger fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:#fff;

    subgraph "❌ Standard MCP (Context Collapse)"
        direction TB
        L1[🤖 LLM] -.->|Token Burn $$$| C1[50+ Raw Tools]:::chaos
        L1 -.->|Routing Errors| C2[Hallucinated Params]:::chaos
    end

    subgraph "✅ mcp-fusion (Enterprise Gateway)"
        direction LR
        L2[🤖 LLM] == "Sees ONE Tool" ==> GATEWAY[⚡️ Gateway]:::gateway
        
        GATEWAY ==>|"1. Context Gating"| TAGS{Tag Filter}:::gate
        TAGS ==>|"2. Build-Time Engine"| AST[🔍 Zod AST Hints<br/>+ TOON Compress]:::engine
        AST ==>|"3. Routing & Security"| ZOD[/Zod .merge().strip()/]:::secure
        
        ZOD -->|"action: 'users.create'"| H1(Type-Safe Handler):::secure
        ZOD -->|"action: 'billing.refund'"| H2(⚠️ Destructive):::danger
        ZOD -.->|"O(1) Map.get"| H3[[... 5,000+ Endpoints]]:::engine
    end
```

---

## 🤯 The "Aha!" Moment: What the LLM Actually Sees

Instead of flooding the LLM with 50 fragile JSON schemas, `mcp-fusion` uses **Zod AST introspection** to cross-reference every field across all actions. Five individual tools become one registered tool. 

The LLM simply sees this mathematically perfect, auto-generated prompt:

```text
Action: list | create | delete
- 'list': Requires: workspace_id. For: list
- 'create': Requires: workspace_id, name. For: create
- 'delete': Requires: workspace_id, project_id ⚠️ DESTRUCTIVE
```

*No guessing. No hallucinated parameters. Absolute routing precision.*

---

## 🚀 Quick Start (Frictionless Setup)

```typescript
import { GroupedToolBuilder, ToolRegistry, success, error } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const projects = new GroupedToolBuilder<AppContext>('projects')
    .description('Manage projects')
    // Shared parameters injected into every action safely
    .commonSchema(z.object({
        workspace_id: z.string().describe('Workspace identifier'),
    }))
    .action({
        name: 'list',
        readOnly: true,
        schema: z.object({ status: z.enum(['active', 'archived']).optional() }),
        handler: async (ctx, args) => {
            // args is fully typed: { workspace_id: string, status?: 'active' | 'archived' }
            const projects = await ctx.db.projects.findMany({ where: { workspaceId: args.workspace_id, status: args.status } });
            return success(projects);
        },
    })
    .action({
        name: 'create',
        schema: z.object({ name: z.string(), description: z.string().optional() }),
        handler: async (ctx, args) => {
            const project = await ctx.db.projects.create({ data: { workspaceId: args.workspace_id, name: args.name, description: args.description } });
            return success(project);
        },
    })
    .action({
        name: 'delete',
        destructive: true, // Auto-appends ⚠️ DESTRUCTIVE to LLM description
        schema: z.object({ project_id: z.string() }),
        handler: async (ctx, args) => {
            await ctx.db.projects.delete({ where: { id: args.project_id } });
            return success('Project deleted');
        },
    });

// Attach to ANY standard MCP Server (Duck-typed)
const registry = new ToolRegistry<AppContext>();
registry.register(projects);
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
```

→ [Read the full Getting Started Guide](docs/getting-started.md)

---

## 🏗️ Enterprise Engineering Core

This is not a simple utility wrapper. `mcp-fusion` is a high-performance routing engine built for massive scale, strict security boundaries, and zero-allocation runtime execution.

### Token Management at Scale — Tag-Based Selective Exposure
> **"5,000 endpoints — won't that blow up the token context?"** No. 

The framework uses a 3-layer Context Gating strategy to keep token usage strictly under control:
1. **Layer 1 — Grouping reduces tool count:** Instead of 5,000 individual tools, a `platform` tool with 50 actions is ONE tool definition in `tools/list`. The LLM sees 1 tool, not 50.
2. **Layer 2 — Tag filtering controls what the LLM sees:** You do NOT expose all tools at once. Each builder has `.tags()`, and `attachToServer()` accepts a `filter` with `tags` (include) and `exclude` options.
3. **Layer 3 — TOON compresses descriptions:** For tools that ARE exposed, metadata is compressed.

```typescript
// Register 5,000 endpoints across domain-specific grouped tools
const usersTool = new GroupedToolBuilder<AppContext>('users').tags('core').group(...);
const adminTool = new GroupedToolBuilder<AppContext>('admin').tags('admin', 'internal').group(...);

registry.registerAll(usersTool, adminTool);

// Conversation about user management? Expose only core tools:
registry.attachToServer(server, { filter: { tags: ['core'] } }); // LLM sees: 1 tool

// Full access, but never internal tools:
registry.attachToServer(server, { filter: { exclude: ['internal'] } });
```
*Tag filtering acts as a context gate — you control exactly what the LLM sees, per session.*

### Two-Layer Architecture
1. **Layer 1 — Domain Model:** A hierarchical entity model for MCP primitives (`Group`, `Tool`, `Prompt`, `Resource`, `PromptArgument`) with tree traversal, multi-parent leaves, fully-qualified names (dot-separated, configurable separator), metadata maps, icons, and bidirectional type converters. This is the structural backbone — think of it as the AST for your MCP server.
2. **Layer 2 — Build-Time Strategy Engine:** `GroupedToolBuilder` orchestrates six pure-function strategy modules to generate a single MCP tool definition. All heavy computation happens at build time. At runtime, `execute()` does a single `Map.get()` lookup and calls a pre-compiled function.

### Per-Field Annotation Intelligence (4-Tier System)
The `SchemaGenerator` analyzes every field across every action directly from Zod `isOptional()` introspection, cross-referencing them to produce 4 annotation tiers automatically:

| Tier | Condition | Generated Annotation | LLM Reads As |
|---|---|---|---|
| **Always Required** | Field is in `commonSchema` and required | `(always required)` | "I must always send this field" |
| **Required-For** | Required in every action that uses it | `Required for: create, update` | "I need this for specific actions" |
| **Required + Optional** | Required in some, optional in others | `Required for: create. For: update` | "Required for create, optional for update" |
| **For** | Optional in all actions that use it | `For: list, search` | "Only relevant for these actions" |

### Zod Parameter Stripping (Built-In Security Layer)
When the LLM sends arguments, `execute()` merges `commonSchema` + `action.schema` using Zod's `.merge().strip()`, then runs `safeParse()`. 
1. Unknown/injected fields are silently stripped.
2. Type coercion happens safely through Zod.
3. The handler receives exactly the shape it declared. 
**The LLM cannot inject parameters that your schema does not declare. This is a security boundary, not just validation.**

### Hierarchical Grouping for Large API Surfaces
For massive API surfaces, actions support `module.action` compound keys. **Flat mode** (`.action()`) and **hierarchical mode** (`.group()`) are mutually exclusive on the same builder.

```typescript
new GroupedToolBuilder<AppContext>('platform')
    .tags('core') 
    .group('users', 'User management', g => {
        g.use(requireAdmin)  // Group-scoped middleware
         .action({ name: 'list', readOnly: true, handler: listUsers })
         .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
    })
    .group('billing', 'Billing operations', g => {
        g.action({ name: 'refund', destructive: true, schema: refundSchema, handler: issueRefund });
    });
```
*The discriminator enum automatically becomes: `users.list | users.ban | billing.refund`.*

### Pre-Compiled Middleware Chains
Middleware follows the `next()` pattern. But unlike Express.js, chains are compiled at **build time**. The `MiddlewareCompiler` wraps handlers right-to-left into nested closures and stores the result. At runtime, `execute()` calls `this._compiledChain.get(action.key)`. 
**Zero chain assembly, zero closure allocation per request.** Supports both **Global** and **Group-scoped** execution.

### TOON Token Optimization (Slash API Costs)
Descriptions and responses can be encoded in TOON (Token-Oriented Object Notation) via `@toon-format/toon` — a compact pipe-delimited format that eliminates repeated JSON keys:
```typescript
builder.toonDescription(); // Token-optimized prompts (saves tokens on tools/list)
return toonSuccess(users); // Slashes token cost on array responses back to LLM
```

### Type-Safe Common Schema Propagation
`commonSchema()` propagates types through generics. The return type narrows from `GroupedToolBuilder<TContext, Record<string, never>>` to `GroupedToolBuilder<TContext, TSchema["_output"]>`. Every subsequent handler receives `TSchema["_output"] & TCommon` — checked at compile time, not runtime. No `as any`, no type assertions needed.

### Duck-Typed Server Resolution
`attachToServer()` accepts `unknown` and performs runtime duck-type detection:
1. Has `.server.setRequestHandler`? → `McpServer` (high-level SDK).
2. Has `.setRequestHandler` directly? → `Server` (low-level SDK).
**Zero peer dependency coupling to MCP server internals.** If the SDK restructures its exports, this framework does not break. Returns a `DetachFn` for clean teardown testing.

### Conservative Annotation Aggregation
MCP tool annotations operate at the tool level, but actions have individual behavioral properties. The framework resolves this safely:
- `destructiveHint: true` if **any** action is destructive (worst case assumption).
- `readOnlyHint: true` only if **all** actions are read-only.
- `idempotentHint: true` only if **all** actions are idempotent.
*(Also supports `openWorldHint` and `returnDirect` via manual overrides).*

### ⚠️ DESTRUCTIVE Warnings & Error Handling
* **Safety Signal:** When an action is marked `destructive: true`, the `DescriptionGenerator` appends a literal `⚠️ DESTRUCTIVE` warning. LLMs trained on safety data recognize this and request user confirmation.
* **Error Isolation:** Every error includes the `[toolName/action]` prefix for instant LLM self-correction (e.g., `Error: action is required. Available: list, create, delete`).

### Freeze-After-Build Immutability
Once `buildToolDefinition()` is called, the builder is permanently frozen. The `_actions` array is sealed with `Object.freeze()`. All mutation methods throw. This eliminates an entire class of bugs where tools are accidentally mutated after registration — adopting the same pattern Protocol Buffers uses.

### Introspection API
Need programmatic documentation, compliance audits, or dashboard generation?
```typescript
const meta = builder.getActionMetadata();
// Returns: [{ key, actionName, groupName, description, destructive, readOnly, requiredFields, hasMiddleware }]
```

---

## 🔬 Architecture & Internals

### Domain Model Layer
Beyond the framework, the package provides a full domain model for MCP primitives:

| Class | Purpose |
|---|---|
| `Group` | Tree node with parent/child relationships, configurable name separator, recursive FQN |
| `Tool` | Leaf node with input/output schemas and `ToolAnnotations` |
| `Prompt` | Leaf node with `PromptArgument` list |
| `Resource` | Leaf node with URI, size, mimeType, and `Annotations` (audience, priority) |
| `AbstractBase` | Name, title, description, meta, icons, hashCode/equals |
| `AbstractLeaf` | Multi-parent group support, root traversal |

*Features Bidirectional converters (`AbstractToolConverter`, `AbstractGroupConverter`, etc.) with null filtering for clean conversion to external representations.*

### Strategy Pattern Internals
Six pure-function modules orchestrated by `GroupedToolBuilder`. Every module is independently testable and replaceable. **Zero shared state.**

| Module | Responsibility |
|---|---|
| `SchemaGenerator` | 4-tier per-field annotations from Zod schemas |
| `DescriptionGenerator` | 3-layer descriptions with ⚠️ DESTRUCTIVE warnings |
| `ToonDescriptionGenerator` | TOON-encoded descriptions via `@toon-format/toon` |
| `AnnotationAggregator` | Conservative behavioral hint aggregation |
| `MiddlewareCompiler` | Right-to-left closure composition at build time |
| `SchemaUtils` | Zod field extraction shared by descriptions + introspection |

---

## 🛠️ Key Capabilities Matrix

| Capability | What It Solves |
|---|---|
| **Action Consolidation** | Reduces tool count, improves LLM routing accuracy |
| **Hierarchical Groups** | Namespace 5,000+ actions with `module.action` compound keys |
| **4-Tier Field Annotations** | LLM knows exactly which fields to send per action |
| **Zod `.merge().strip()`** | Type-safe schema composition + unknown field stripping |
| **Common Schema Propagation** | Shared fields with compile-time generic inference |
| **Pre-Compiled Middleware** | Auth, rate limiting, audit — zero runtime chain assembly |
| **Group-Scoped Middleware** | Different middleware per namespace (e.g., admin-only for users) |
| **TOON Encoding** | Token reduction on descriptions and responses |
| **Conservative Annotations** | Safe MCP behavioral hints from per-action properties |
| **⚠️ DESTRUCTIVE Warnings** | Safety signal in LLM tool descriptions |
| **Tag Filtering** | Include/exclude tags for selective tool exposure |
| **Introspection API** | Runtime metadata for compliance, dashboards, audit trails |
| **Freeze-After-Build** | `Object.freeze()` prevents mutation bugs after registration |
| **Error Isolation** | `[tool/action]` prefixed errors for instant debugging |
| **Duck-Typed Server** | Works with `Server` and `McpServer` — zero import coupling |
| **Detach Function** | Clean teardown for testing via `DetachFn` |
| **Domain Model** | Hierarchical tree with multi-parent, FQN, converters |
| **Auto-Build on Execute** | `execute()` triggers `buildToolDefinition()` if not called |

---

## 📚 Official Guides

Ready to build production agents? Dive into the documentation:

| Guide | What You Will Learn |
|---|---|
| 🏁 **[Getting Started](docs/getting-started.md)** | First tool, context, common schema, groups, TOON — complete examples. |
| 🏗️ **[Architecture](docs/architecture.md)** | Domain model mapping, Strategy pattern, build-time engine, execution flow. |
| 📈 **[Scaling Guide](docs/scaling.md)** | How tag filtering, TOON, and unification prevent hallucination at 5,000+ endpoints. |
| 🛡️ **[Middleware](docs/middleware.md)** | Global, group-scoped, pre-compilation, real patterns (auth, rate-limit, audit). |
| 🔍 **[Introspection](docs/introspection.md)** | Runtime metadata extraction for Enterprise compliance. |
| 📖 **[API Reference](docs/api-reference.md)** | Comprehensive typings, methods, and class structures. |

---

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@modelcontextprotocol/sdk ^1.12.1` (peer dependency)
- `zod ^3.25.1 || ^4.0.0` (peer dependency)
- `@toon-format/toon` (for TOON features)
