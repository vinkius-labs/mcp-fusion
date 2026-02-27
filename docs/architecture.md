# Architecture

- [Two-Layer Design](#two-layers)
- [Schema Generation](#schema)
- [Middleware Compilation](#middleware)
- [Execution Pipeline](#pipeline)
- [Immutability](#immutability)
- [Server Resolution](#server)

## Introduction {#introduction}

Understanding the internal structure helps you make informed decisions about tool design, performance tuning, and debugging. MCP Fusion is built on a two-layer architecture: a domain model for MCP primitives and a build-time strategy engine that pre-compiles everything for O(1) runtime execution.

## Two-Layer Design {#two-layers}

### Layer 1 — Domain Model

A hierarchical object model for MCP primitives. Every entity extends `BaseModel` (carries `name`, `title`, `description`, `meta`, `icons`, `getFullyQualifiedName()`).

```text
BaseModel
├── Group                     ← childGroups[], childTools[], childPrompts[], childResources[]
├── GroupItem                 ← parentGroups[], root traversal
│   ├── Tool                  ← inputSchema, outputSchema, ToolAnnotations
│   ├── Prompt                ← PromptArgument[]
│   └── Resource              ← uri, size, mimeType, Annotations
└── PromptArgument            ← required flag
```

**Multi-parent leaves.** A `Tool` can belong to multiple `Group` nodes through `parentGroups[]` — many-to-many, not a tree.

**Bidirectional converters.** `ConverterBase<TSource, TTarget>` provides `convertFrom/To` (single) and `convertFromBatch/ToBatch` (array with null filtering). Every MCP primitive has a converter subclass, giving a consistent adapter layer between internal and wire representations.

### Layer 2 — Build-Time Strategy Engine

`GroupedToolBuilder` consolidates multiple actions into a single MCP tool definition. All expensive computation happens at build time. At runtime, `.execute()` does a constant-time map lookup and calls a pre-compiled function chain.

The builder delegates to `ToolDefinitionCompiler`, which orchestrates five strategy modules:

| Module | Output |
|---|---|
| `SchemaGenerator` | JSON Schema `inputSchema` with discriminator |
| `DescriptionGenerator` | Structured Markdown description |
| `ToonDescriptionGenerator` | TOON pipe-delimited description |
| `AnnotationAggregator` | Merged MCP `ToolAnnotations` |
| `MiddlewareCompiler` | `Map<string, ChainFn>` of pre-compiled closures |

Each module is a stateless pure function in its own file — unit-testable in isolation, replaceable independently.

## Schema Generation {#schema}

`SchemaGenerator` creates a single JSON Schema from all registered actions. It inserts a discriminator enum listing every action key, then merges per-action schemas with a 4-tier annotation system:

- `(always required)` — field in `commonSchema`, required globally
- `Required for: create, update` — required in every action that uses it
- `Required for: create. For: update` — required in some, optional in others
- `For: list, search` — optional everywhere

Annotations are appended to each field's `description` string so the LLM sees requirements inline.

## Middleware Compilation {#middleware}

`compileMiddlewareChains()` wraps middleware right-to-left into nested closures at build time:

```text
Global MW 1 → Global MW 2 → Group MW → handler
(outermost)                              (innermost)
```

Each wrapping captures `nextFn()` in a closure. The result per action key is a single function — no array iteration at call time.

> [!TIP]
> With 10 stacked middleware layers, calling an action is still a single function call — zero chain assembly per request.

## Execution Pipeline {#pipeline}

```text
LLM: tools/call { name: "platform", arguments: { action: "users.create", email: "a@b.com" } }
  ↓
ToolRegistry.routeCall()        → O(1) Map lookup for "platform"
  ↓
GroupedToolBuilder.execute()
  ├── Auto-build if not frozen (lazy init)
  ├── parseDiscriminator()      → extract "users.create" from args
  ├── resolveAction()           → O(1) Map lookup by action key
  ├── Validate: commonSchema.merge(action.schema).strict().safeParse()
  │   └── Failed → structured error with field names
  │   └── Passed → validated result.data
  └── runChain()                → pre-compiled middleware → handler
```

`.strict()` rejects unknown fields with actionable messages — the LLM sees which fields are invalid and self-corrects.

## Immutability {#immutability}

After `buildToolDefinition()`:

1. `_frozen = true`
2. `Object.freeze(this._actions)` seals the action array
3. The tool definition is cached in `_cachedTool`
4. Mutation methods hit `_assertNotFrozen()` and throw

This prevents adding actions or middleware after registration — the LLM always sees definitions that match runtime behavior.

## Server Resolution {#server}

`attachToServer()` accepts `unknown` and resolves the MCP server through `ServerResolver.ts`:

1. High-level `McpServer` → unwrap `.server`
2. Low-level `Server` → use directly
3. Neither → throw

Duck-typing only requires `setRequestHandler()`. If the SDK restructures exports, the framework keeps working as long as the interface hasn't changed.
