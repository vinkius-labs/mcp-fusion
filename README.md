# MCP Extensions for Primitive Grouping

**Stop registering hundreds of individual MCP tools. Ship one.**

A TypeScript framework that consolidates related MCP operations into a single tool behind a discriminator field — with a domain model layer for hierarchical entity management and a build-time strategy engine designed for 5,000+ endpoints. Fewer tools means less context pressure on the LLM, fewer routing errors, and cleaner server code.

```
npm install @vinkius-core/mcp-fusion
```

---

## The Problem

MCP servers that expose individual tools for every operation — `create_project`, `update_project`, `delete_project`, `list_projects`, `archive_project` — create two cascading failures:

1. **Context exhaustion.** Every tool definition burns tokens in the LLM context window. At 30+ tools, the model starts losing track.
2. **Routing confusion.** Semantically similar tools compete for selection. The LLM picks `update_project` when it should pick `create_project`.

The workaround is writing fewer, bloated tools — or rotating tool sets per conversation. Both are brittle.

## The Solution

Group related operations under a single tool. The LLM sees one `projects` tool and selects the operation through an `action` enum — a discriminator field. The framework handles description generation, schema composition, annotation aggregation, middleware compilation, validation, and error formatting — all at build time.

```typescript
import { GroupedToolBuilder, ToolRegistry, success, error } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const projects = new GroupedToolBuilder<AppContext>('projects')
    .description('Manage projects')
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
        destructive: true,
        schema: z.object({ project_id: z.string() }),
        handler: async (ctx, args) => {
            await ctx.db.projects.delete({ where: { id: args.project_id } });
            return success('Project deleted');
        },
    });

const registry = new ToolRegistry<AppContext>();
registry.register(projects);
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
```

Five individual tools become one registered tool. The LLM sees:

```
Action: list | create | delete
- 'list': Requires: workspace_id. For: list
- 'create': Requires: workspace_id, name. For: create
- 'delete': Requires: workspace_id, project_id ⚠️ DESTRUCTIVE
```

→ [Getting Started Guide](docs/getting-started.md)

---

## What Makes This Framework Extraordinary

### Two-Layer Architecture

This is not a simple utility wrapper. The framework has two distinct layers:

**Layer 1 — Domain Model.** A hierarchical entity model for MCP primitives (`Group`, `Tool`, `Prompt`, `Resource`, `PromptArgument`) with tree traversal, multi-parent leaves, fully-qualified names (dot-separated, configurable separator), metadata maps, icons, and bidirectional type converters (`AbstractToolConverter`, `AbstractGroupConverter`, etc.). This is the structural backbone — think of it as the AST for your MCP server.

**Layer 2 — Build-Time Strategy Engine.** `GroupedToolBuilder` orchestrates six pure-function strategy modules to generate a single MCP tool definition. All computation happens at build time. At runtime, `execute()` does a single `Map.get()` lookup and calls a pre-compiled function.

### Per-Field Annotation Intelligence (4-Tier System)

The `SchemaGenerator` analyzes every field across every action and produces one of four annotation tiers — automatically, from your Zod schemas:

| Tier | Condition | Generated Annotation | LLM Reads As |
|---|---|---|---|
| **Always Required** | Field is in `commonSchema` and required | `(always required)` | "I must always send this field" |
| **Required-For** | Required in every action that uses it | `Required for: create, update` | "I need this for these specific actions" |
| **Required + Optional** | Required in some, optional in others | `Required for: create. For: update` | "Required for create, optional for update" |
| **For** | Optional in all actions that use it | `For: list, search` | "Only relevant for these actions" |

The LLM knows *exactly* which fields to populate for each action. No guessing. No hallucinated parameters. No manual annotation writing. This is extracted directly from Zod `isOptional()` introspection and cross-referenced across all registered actions.

### Pre-Compiled Middleware Chains

Middleware follows the `next()` pattern:

```typescript
const authMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    if (!ctx.session) return error('Unauthorized');
    return next();
};
```

But unlike Express, chains are compiled at build time. The `MiddlewareCompiler` wraps handlers right-to-left into nested closures and stores the result in a `Map<string, ChainFn>`. At runtime, `execute()` does `this._compiledChain.get(action.key)` — one Map lookup, zero chain assembly, zero closure allocation per request.

Middleware is hierarchical:
- **Global** — `.use(mw)` on the builder. Runs for every action (outermost).
- **Group-scoped** — `.use(mw)` inside a group's `ActionGroupBuilder`. Runs only for actions in that group (inner).

### TOON Token Optimization

Descriptions and responses can be encoded in TOON (Token-Oriented Object Notation) via `@toon-format/toon` — a compact pipe-delimited format that eliminates repeated key names:

```typescript
// Enable TOON for tool descriptions (saves tokens on tools/list)
builder.toonDescription();

// Enable TOON for handler responses (saves tokens on tools/call)
return toonSuccess(users);  // Instead of success(users)
```

The `toonSuccess()` helper accepts any JSON-serializable value and encodes it with configurable delimiter (`|` by default). For arrays of uniform objects — the typical API response — TOON achieves significant token reduction because column names are written once as a header, not repeated per row.

### Conservative Annotation Aggregation

MCP tool annotations operate at the tool level, but your actions have individual behavioral properties. The `AnnotationAggregator` resolves this with conservative rules:

- `destructiveHint: true` if **any** action is destructive (worst case assumption)
- `readOnlyHint: true` only if **all** actions are read-only (one mutation breaks it)
- `idempotentHint: true` only if **all** actions are idempotent (one non-idempotent breaks it)

Explicit annotations via `.annotations()` override aggregated values. The `ToolAnnotations` class also supports `openWorldHint` and `returnDirect`.

### Hierarchical Grouping for Large API Surfaces

For large API surfaces, actions support `module.action` compound keys:

```typescript
new GroupedToolBuilder<AppContext>('platform')
    .description('Platform management API')
    .tags('core')  // ← Tag for selective exposure
    .group('users', 'User management', g => {
        g.use(requireAdmin)  // Group-scoped middleware
         .action({ name: 'list', readOnly: true, handler: listUsers })
         .action({ name: 'create', schema: createUserSchema, handler: createUser })
         .action({ name: 'ban', destructive: true, schema: banSchema, handler: banUser });
    })
    .group('billing', 'Billing operations', g => {
        g.action({ name: 'invoices', readOnly: true, handler: listInvoices })
         .action({ name: 'refund', destructive: true, schema: refundSchema, handler: issueRefund });
    })
    .group('analytics', g => {
        g.action({ name: 'report', readOnly: true, handler: generateReport })
         .action({ name: 'export', readOnly: true, schema: exportSchema, handler: exportData });
    });
```

The discriminator enum becomes: `users.list | users.create | users.ban | billing.invoices | billing.refund | analytics.report | analytics.export`. The description auto-generates group headers: `Modules: users (list,create,ban) | billing (invoices,refund) | analytics (report,export)`.

**Flat mode** (`.action()`) and **hierarchical mode** (`.group()`) are mutually exclusive on the same builder — enforced at registration time with clear error messages.

### Token Management at Scale — Tag-Based Selective Exposure

> **"5,000 endpoints — won't that blow up the token context?"**

No. The framework uses a 3-layer strategy to keep token usage under control, even with thousands of endpoints:

**Layer 1 — Grouping reduces tool count.** Instead of 5,000 individual tools, you register them as grouped tools. A `platform` tool with 50 actions is ONE tool definition in `tools/list`. The LLM sees 1 tool, not 50.

**Layer 2 — Tag filtering controls what the LLM sees.** You do NOT expose all tools at once. Each builder has `.tags()`, and `attachToServer()` accepts a `filter` with `tags` (include) and `exclude` options. Only matching tools appear in `tools/list`.

**Layer 3 — TOON compresses descriptions.** For tools that ARE exposed, `.toonDescription()` encodes metadata as compact pipe-delimited tables instead of verbose markdown, reducing token cost per tool.

Here's how this works in practice:

```typescript
// Register 5,000 endpoints across domain-specific grouped tools
const usersTool = new GroupedToolBuilder<AppContext>('users')
    .tags('core', 'user-management')
    .group('profiles', g => { /* 20 actions */ })
    .group('permissions', g => { /* 15 actions */ })
    .group('notifications', g => { /* 10 actions */ });

const billingTool = new GroupedToolBuilder<AppContext>('billing')
    .tags('core', 'billing')
    .toonDescription()  // Token-optimized descriptions
    .group('invoices', g => { /* 12 actions */ })
    .group('subscriptions', g => { /* 8 actions */ });

const analyticsTool = new GroupedToolBuilder<AppContext>('analytics')
    .tags('reporting')
    .toonDescription()
    .group('dashboards', g => { /* 25 actions */ })
    .group('exports', g => { /* 10 actions */ });

const adminTool = new GroupedToolBuilder<AppContext>('admin')
    .tags('admin', 'internal')
    .group('system', g => { /* 30 actions */ })
    .group('audit', g => { /* 15 actions */ });

const registry = new ToolRegistry<AppContext>();
registry.registerAll(usersTool, billingTool, analyticsTool, adminTool);

// Conversation about user management? Expose only core tools:
registry.attachToServer(server, {
    filter: { tags: ['core'] },  // LLM sees: users + billing (2 tools)
});

// Admin session? Expose admin tools, exclude reporting:
registry.attachToServer(server, {
    filter: { tags: ['admin'] },  // LLM sees: admin only (1 tool)
});

// Full access, but never internal tools:
registry.attachToServer(server, {
    filter: { exclude: ['internal'] },  // Everything except admin
});
```

**The result:** 5,000 endpoints registered, but the LLM context only contains the 2-3 tools relevant to the current conversation. Tag filtering acts as a context gate — you control exactly what the LLM sees, per session.

→ [Scaling Guide](docs/scaling.md) — Technical deep-dive into how each mechanism prevents LLM hallucination at scale

### Zod Parameter Stripping — Built-In Security Layer

When the LLM sends arguments, `execute()` merges `commonSchema` + `action.schema` using Zod's `.merge().strip()`, then runs `safeParse()`. The framework uses `result.data` — not the raw args — which means:

1. Unknown/injected fields are silently stripped.
2. Type coercion happens through Zod.
3. The handler receives exactly the shape it declared.

The LLM cannot inject parameters that your schema does not declare. This is a security boundary, not just validation.

### LLM-Friendly Error Messages

When things fail, the framework produces errors that LLMs can parse and self-correct:

```
// Missing discriminator:
Error: action is required. Available: list, create, delete

// Unknown action:
Error: Unknown action "remove". Available: list, create, delete

// Validation failure (from Zod):
Validation failed: name: Required; email: Invalid email format

// Runtime error (from handler):
[projects/delete] Database connection failed
```

Every error includes the `[toolName/action]` prefix for instant debugging. The LLM reads the structured error, fixes the arguments, and retries.

### ⚠️ DESTRUCTIVE Warnings in LLM Descriptions

When an action is marked `destructive: true`, the `DescriptionGenerator` appends a literal `⚠️ DESTRUCTIVE` warning to the description. LLMs trained on safety data recognize this signal and will often request user confirmation before executing.

### Type-Safe Common Schema Propagation

`commonSchema()` propagates types through generics. The return type narrows from `GroupedToolBuilder<TContext, Record<string, never>>` to `GroupedToolBuilder<TContext, TSchema["_output"]>`. Every subsequent handler receives `TSchema["_output"] & TCommon` — checked at compile time, not runtime. No `as any`, no type assertions needed.

### Duck-Typed Server Resolution

`attachToServer()` accepts `unknown` and performs runtime duck-type detection:

1. Has `.server.setRequestHandler`? → `McpServer` (high-level). Unwrap the inner `Server`.
2. Has `.setRequestHandler` directly? → `Server` (low-level). Use directly.
3. Neither? → Clear error message.

No imports from the MCP SDK server modules. No peer dependency coupling. If the SDK restructures its exports, this framework does not break. The method returns a `DetachFn` that resets handlers to no-ops — clean teardown for testing.

### Freeze-After-Build Immutability

Once `buildToolDefinition()` is called, the builder is permanently frozen. The `_actions` array is sealed with `Object.freeze()`. All mutation methods throw:

```
Builder "projects" is frozen after buildToolDefinition(). Cannot modify a built tool.
```

This eliminates an entire class of bugs where tools are accidentally mutated after registration — the same pattern Protocol Buffers uses.

### Introspection API

`getActionNames()` and `getActionMetadata()` provide runtime access to every action's properties:

```typescript
const meta = builder.getActionMetadata();
// Returns: [{ key, actionName, groupName, description, destructive, idempotent, readOnly, requiredFields, hasMiddleware }]
```

Use this for: compliance audits, admin dashboards, middleware coverage validation, programmatic documentation generation, test coverage reports.

---

## Domain Model Layer

Beyond the framework, the package provides a full domain model for MCP primitives:

| Class | Purpose |
|---|---|
| `Group` | Tree node with parent/child relationships, configurable name separator, recursive FQN resolution |
| `Tool` | Leaf node with input/output schemas and `ToolAnnotations` |
| `Prompt` | Leaf node with `PromptArgument` list |
| `Resource` | Leaf node with URI, size, mimeType, and `Annotations` (audience, priority, lastModified) |
| `AbstractBase` | Name, title, description, meta, icons, hashCode/equals |
| `AbstractLeaf` | Multi-parent group support, root traversal |

**Bidirectional converters** (`AbstractToolConverter`, `AbstractGroupConverter`, `AbstractPromptConverter`, `AbstractResourceConverter`, `AbstractToolAnnotationsConverter`) provide a clean pattern for converting between domain model types and external representations — both directions, single or batch, with null filtering.

→ [Architecture Guide](docs/architecture.md)

---

## Strategy Pattern Internals

| Module | Responsibility | Design |
|---|---|---|
| `SchemaGenerator` | 4-tier per-field annotations from Zod schemas | Pure function, no state |
| `DescriptionGenerator` | 3-layer descriptions with ⚠️ DESTRUCTIVE warnings | Pure function, no state |
| `ToonDescriptionGenerator` | TOON-encoded descriptions via `@toon-format/toon` | Pure function, no state |
| `AnnotationAggregator` | Conservative behavioral hint aggregation | Pure function, no state |
| `MiddlewareCompiler` | Right-to-left closure composition at build time | Pure function, no state |
| `SchemaUtils` | Zod field extraction shared by descriptions + introspection | Pure function, no state |

Every module is independently testable. Every module is replaceable. Zero shared state between any of them.

→ [API Reference](docs/api-reference.md)

---

## Key Capabilities

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
| **Flat ↔ Hierarchical** | Mutual exclusion enforced with clear error messages |
| **Auto-Build on Execute** | `execute()` triggers `buildToolDefinition()` if not called |
| **Response Helpers** | `success()`, `error()`, `required()`, `toonSuccess()` |

---

## Documentation

| Guide | What You Will Learn |
|---|---|
| [Getting Started](docs/getting-started.md) | First tool, context, common schema, groups, TOON — complete working examples |
| [Architecture](docs/architecture.md) | Domain model, strategy pattern, build-time engine, execution flow |
| [Scaling](docs/scaling.md) | How grouping, tag filtering, TOON, and schema unification prevent LLM hallucination at 5,000+ endpoints |
| [Middleware](docs/middleware.md) | Global, group-scoped, pre-compilation, real patterns (auth, rate-limit, audit) |
| [API Reference](docs/api-reference.md) | Every public class, method, type, and interface |
| [Introspection](docs/introspection.md) | Runtime metadata, compliance, dashboards, middleware validation |

---

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@modelcontextprotocol/sdk ^1.12.1`
- `zod ^3.25.1`
- `@toon-format/toon` (for TOON features)

## License

Apache-2.0
