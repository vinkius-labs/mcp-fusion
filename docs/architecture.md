# Architecture

This document explains the internal philosophy of **MCP Fusion**: *why* the framework is structured the way it is, *what* each execution component does, and *how* they work together to eliminate payload bloat.

---

## Two-Layer Design

The framework operates on two distinct layers, each solving a fundamentally different problem in the Model Context Protocol lifecycle.

### Layer 1 — Domain Model

This is a hierarchical object model for MCP primitives. It provides the structural vocabulary for representing tools, prompts, resources, and their organizational tree.

```text
BaseModel                     ← name, title, description, meta, icons, FQN
├── Group                     ← tree node: parent, childGroups[], childTools[], childPrompts[], childResources[]
├── GroupItem                 ← multi-parent: parentGroups[], root traversal
│   ├── Tool                  ← inputSchema, outputSchema, ToolAnnotations
│   ├── Prompt                ← PromptArgument[]
│   └── Resource              ← uri, size, mimeType, Annotations
└── PromptArgument            ← required flag
```

#### Key Design Decisions

- **Multi-Parent Leaves:** A `Tool` (or `Prompt`, `Resource`) can belong to multiple `Group` nodes simultaneously via `parentGroups[]`. This supports real scenarios where the same tool appears in different organizational hierarchies — e.g., a search tool that belongs to both the `user-facing` group and the `admin` group.
- **Recursive Fully-Qualified Names:** `Group.getFullyQualifiedName()` walks up the tree recursively, joining names with a configurable separator (default: `.`). This produces intelligent paths like `platform.users.management` for deeply nested groups.
- **Bidirectional Converters:** A generic `ConverterBase<TSource, TTarget>` base class implements batch conversion with null filtering in both directions. This is the adapter pattern applied consistently across all primitives natively.


### Layer 2 — Build-Time Strategy Engine

`GroupedToolBuilder` consolidates multiple operations into a single MCP tool definition. All expensive computation — description generation, schema merging, annotation aggregation, middleware compilation — happens **exactly once** at build time. 

At runtime, `.execute()` performs a constant-time mapping lookup and calls a pre-compiled function chain.

```text
GroupedToolBuilder
├── Orchestrates 6 strategy modules
├── Manages action registration (flat or hierarchical)
├── Builds and caches tool definitions
├── Validates and routes calls at runtime
└── Provides introspection API

ToolRegistry
├── Registers multiple GroupedToolBuilder instances
├── Routes calls to the correct builder
├── Filters tools by tags (include/exclude)
└── Attaches to MCP SDK Server via duck-typed resolution
```

---

## Strategy Pattern — Why Pure Functions?

Every build-time computation is explicitly delegated to a stateless, pure-function module. This is intentional:

1. **Independent testability:** Each strategy can be unit-tested in isolation by passing mock action arrays.
2. **Replaceability:** If you need a different description format, you replace one pure function — not an entire class hierarchy.
3. **No shared state:** Strategies cannot accidentally affect each other. Each receives inputs and explicitly returns output.
4. **Predictable behavior:** Pure functions guarantee the exact same output for standard inputs.

### SchemaGenerator

**Input:** Actions array + discriminator name + hasGroup flag + commonSchema.  
**Output:** A JSON Schema-compatible `inputSchema` for the MCP tool.

The engine creates a discriminator enum field containing all action keys. It processes `commonSchema` fields, tracking which downstream actions consume them natively. It then applies a 4-tier annotation system:
- `(always required)` — field is in commonSchema and required globally.
- `Required for: create, update` — required in every action that uses it.
- `Required for: create. For: update` — required in some, optional in others.
- `For: list, search` — optional in all actions that use it.

::: info Schema Injection
Annotations are appended to the field's `description` string natively. This means the LLM sees the requirements directly injected into the raw schema definition — no separate complex metadata lookup needed.
:::

### DescriptionGenerator

**Input:** Actions array + tool name + description + hasGroup flag.  
**Output:** A structured multi-line string description.

The `getGroupSummaries()` helper natively aggregates actions by their `groupName`. The `[DESTRUCTIVE]` tag is automatically appended to destructive actions. This is a proven prompt engineering technique that naturally triggers safety behaviors in Language Models.

### ToonDescriptionGenerator

For flat tools, it encodes an array of `ActionRow` objects. For grouped tools, it natively encodes a Record dictionary grouped by namespace. The `@toon-format/toon` engine handles the dense pipe-delimited conversion.

### MiddlewareCompiler

**Input:** Actions array + global middleware array.  
**Output:** A `Map<string, ChainFn>` mapping action keys to pre-compiled execution closures.

```text
Global MW 1 → Global MW 2 → Group MW → handler
(outermost)                              (innermost)
```

Each middleware wrapping creates a Javascript closure capturing `nextFn()`. The result is a single function that executes the *entire* chain — no array iterations or chain parsing happens when the LLM actually connects.

---

## The Execution Flow

When an LLM attempts to call a natively grouped tool, the architecture executes the following deterministic path:

```text
LLM calls tools/call with { name: "platform", arguments: { action: "users.create", email: "a@b.com" } }
                            │
                            ▼
                    ToolRegistry.routeCall()
                        │ Looks up "platform" builder in Map
                        ▼
                GroupedToolBuilder.execute()
                    │
                    ├── 1. Auto-build if needed (triggers caching)
                    │
                    ├── 2. Parse discriminator field ("action" → "users.create")
                    │
                    ├── 3. Find action by key
                    │
                    ├── 4. Build validation schema: commonSchema.merge(action.schema).strict()
                    │       └── safeParse(argsWithoutDiscriminator)
                    │       └── Failed? → error("Validation failed...")
                    │       └── Passed? → Use validated result.data
                    │
                    ├── 5. Look up pre-compiled middleware chain
                    │
                    └── 6. Execute chain (global MW → group MW → handler)
```

::: tip Zero-Cost Validation
`.strict()` automatically rejects unknown fields with an actionable error — the LLM is told exactly which fields are invalid and can self-correct on retry.
:::

---

## Immutability Model

After `buildToolDefinition()` generates the schema artifacts natively:

1. `_frozen` flag is set to `true`.
2. `_actions` array is sealed with core `Object.freeze()`.
3. The built tool definition is cached in `_cachedTool`.
4. All mutation methods natively check `_assertNotFrozen()` and immediately throw an Error if an attempt to alter a built schema is enacted.

**Why this matters:** In complex servers, builders may be exported and shared across modules. Without immutability, one module could accidentally add an action or middleware *after* another module has already registered the tool, completely breaking LLM runtime awareness. 

---

## Duck-Typed Server Resolution

`ToolRegistry.attachToServer()` accepts `unknown` and resolves the low-level `Server` at runtime:

```typescript
private _resolveServer(server: unknown): McpServerLike {
    // 1. Check for McpServer (high-level) → unwrap .server
    // 2. Check for Server (low-level) → use directly
    // 3. Neither → throw clear error
}
```

The underlying TS interface only requires `setRequestHandler()`. This guarantees that if the experimental `@modelcontextprotocol/sdk` restructures its module exports, Fusion will not break.
