# Architecture

This document explains *why* the framework is structured the way it is, *what* each component does, and *how* they work together.

---

## Two-Layer Design

The framework has two distinct layers, each solving a different problem.

### Layer 1 — Domain Model

A hierarchical object model for MCP primitives. This layer provides the structural vocabulary for representing tools, prompts, resources, and their organizational hierarchy.

```
BaseModel                     ← name, title, description, meta, icons, FQN
├── Group                     ← tree node: parent, childGroups[], childTools[], childPrompts[], childResources[]
├── GroupItem                 ← multi-parent: parentGroups[], root traversal
│   ├── Tool                  ← inputSchema, outputSchema, ToolAnnotations
│   ├── Prompt                ← PromptArgument[]
│   └── Resource              ← uri, size, mimeType, Annotations (audience, priority, lastModified)
└── PromptArgument            ← required flag
```

**Key design decisions:**

- **Multi-parent leaves.** A `Tool` (or `Prompt`, `Resource`) can belong to multiple `Group` nodes simultaneously via `parentGroups[]`. This supports real scenarios where the same tool appears in different organizational hierarchies — e.g., a `search` tool that belongs to both the `user-facing` group and the `admin` group.

- **Recursive fully-qualified names.** `Group.getFullyQualifiedName()` walks up the tree recursively, joining names with a configurable separator (default: `.`). This produces paths like `platform.users.management` for deeply nested group hierarchies.

- **Bidirectional converters.** A generic `ConverterBase<TSource, TTarget>` base class implements batch conversion with null filtering in both directions. Each MCP primitive has a domain-specific converter (`ToolConverterBase`, `GroupConverterBase`, `PromptConverterBase`, `ResourceConverterBase`, `ToolAnnotationsConverterBase`) that extends the base and adds typed method aliases — eliminating all batch-logic duplication. This is the adapter pattern applied consistently across all primitives.

- **`ToolAnnotations` class.** Holds all MCP tool annotation hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `returnDirect`, and `title`. This is a structured representation of the MCP spec's annotation object that maps directly to the framework's `AnnotationAggregator`.

### Layer 2 — Build-Time Strategy Engine

`GroupedToolBuilder` consolidates multiple operations into a single MCP tool definition. All expensive computation — description generation, schema merging, annotation aggregation, middleware compilation — happens once at build time. At runtime, `execute()` does a constant-time lookup and calls a pre-compiled function.

```
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

## Strategy Pattern — Why Pure Functions

Every build-time computation is delegated to a stateless, pure-function module. This is intentional:

1. **Independent testability.** Each strategy can be unit-tested in isolation by passing mock action arrays.
2. **Replaceability.** If you need a different description format, you replace one function — not a class hierarchy.
3. **No shared state.** Strategies cannot accidentally affect each other. Each receives its inputs and returns its output.
4. **Predictable behavior.** Pure functions with the same inputs always produce the same output.

### SchemaGenerator

**Input:** Actions array + discriminator name + hasGroup flag + commonSchema.  
**Output:** A JSON Schema-compatible `inputSchema` for the MCP tool.

**How it works:**

1. Creates a discriminator enum field with all action keys.
2. Processes `commonSchema` fields — marks them in a `fieldActions` tracking map with all action keys.
3. Processes each action's schema — tracks which actions use each field, using first-declaration-wins for field definitions.
4. Applies the 4-tier annotation system:
   - `(always required)` — field is in commonSchema and required.
   - `Required for: create, update` — required in every action that uses it.
   - `Required for: create. For: update` — required in some, optional in others.
   - `For: list, search` — optional in all actions that use it.

**Annotations are appended to the field's `description` string.** This means the LLM sees them directly in the schema definition — no separate metadata lookup needed.

### DescriptionGenerator

**Input:** Actions array + tool name + description + hasGroup flag.  
**Output:** A multi-line string description.

**3-layer structure:**

- **Layer 1 — Summary.** Tool description + action listing. For grouped tools: `"Modules: users (list,create,ban) | billing (invoices,refund)"`. For flat tools: `"Actions: list, create, delete"`.
- **Layer 2 — Workflow.** Per-action details with required fields and destructive warnings. Only actions with descriptions, required fields, or destructive flags are included.

The `getGroupSummaries()` helper aggregates actions by their `groupName`, producing a compact module list. The `⚠️ DESTRUCTIVE` emoji is appended to destructive actions — a prompt engineering technique that triggers safety behavior in LLMs.

### ToonDescriptionGenerator

**Input:** Same as DescriptionGenerator.  
**Output:** Human-readable summary line + TOON-encoded metadata table.

For flat tools, it encodes an array of `ActionRow` objects (action, desc, required, destructive). For grouped tools, it encodes a `Record<string, ActionRow[]>` grouped by namespace — TOON handles the nesting.

### AnnotationAggregator

**Input:** Actions array + explicit annotations (if any).  
**Output:** An aggregated annotation record.

**Conservative rules:**

- `destructiveHint` — `true` if ANY action is destructive. Reason: the tool *might* destroy data; clients must assume the worst.
- `readOnlyHint` — `true` only if ALL actions are read-only. Reason: one mutation disqualifies the tool.
- `idempotentHint` — `true` only if ALL actions are idempotent. Reason: one non-idempotent action makes the tool unsafe to retry.

Explicit annotations are copied first, and aggregation only fills in fields that weren't explicitly set. This allows overrides when you know better.

### MiddlewareCompiler

**Input:** Actions array + global middleware array.  
**Output:** A `Map<string, ChainFn>` mapping action keys to pre-compiled execution chains.

**Compilation process (for each action):**

1. Start with the action's handler function.
2. Wrap group/action middleware right-to-left (innermost, closest to handler).
3. Wrap global middleware right-to-left (outermost).
4. Store the composed function in the Map.

```
Global MW 1 → Global MW 2 → Group MW → handler
(outermost)                              (innermost)
```

Each middleware wrapping creates a closure that captures `nextFn`. The result is a single function that, when called, executes the entire chain — no array iteration, no chain construction at runtime.

### SchemaUtils

**Input:** An `InternalAction`.  
**Output:** Array of required field names.

Uses Zod's `isOptional()` introspection to walk the schema shape and identify required fields. This is shared by `DescriptionGenerator` (for workflow lines), `ToonDescriptionGenerator` (for the `required` column), and `getActionMetadata()` (for introspection).

---

## Execution Flow

When an LLM calls a grouped tool, here's exactly what happens:

```
LLM calls tools/call with { name: "platform", arguments: { action: "users.create", email: "a@b.com", role: "admin" } }
                            │
                            ▼
                    ToolRegistry.routeCall()
                        │ Looks up "platform" builder in Map
                        ▼
                GroupedToolBuilder.execute()
                    │
                    ├── 1. Auto-build if needed (triggers buildToolDefinition() on first call)
                    │
                    ├── 2. Parse discriminator field ("action" → "users.create")
                    │       └── Missing? → error("action is required. Available: ...")
                    │
                    ├── 3. Find action by key
                    │       └── Not found? → error("Unknown action. Available: ...")
                    │
                    ├── 4. Build validation schema: commonSchema.merge(action.schema).strip()
                    │       └── safeParse(argsWithoutDiscriminator)
                    │       └── Failed? → error("Validation failed: path: message; ...")
                    │       └── Passed? → Use result.data (stripped of unknown fields)
                    │
                    ├── 5. Look up pre-compiled middleware chain: Map.get("users.create")
                    │
                    └── 6. Execute chain (global MW → group MW → handler)
                            └── Error? → error("[platform/users.create] message")
```

**Key observations:**

- Step 1: Auto-build means you don't need to call `buildToolDefinition()` explicitly. The first `execute()` triggers it.
- Step 4: The discriminator is removed before validation and re-added after — the handler doesn't see it.
- Step 4: `.strip()` removes unknown fields — the LLM cannot inject parameters.
- Step 5: One `Map.get()` lookup. No chain assembly at runtime.
- Step 6: Errors are wrapped with `[toolName/actionName]` prefix for instant debugging.

---

## Immutability Model

After `buildToolDefinition()` is called:

1. `_frozen` flag is set to `true`.
2. `_actions` array is sealed with `Object.freeze()`.
3. The built tool definition is cached in `_cachedTool`.
4. All mutation methods (`.action()`, `.group()`, `.use()`, `.description()`, `.commonSchema()`, `.tags()`, `.annotations()`, `.discriminator()`, `.toonDescription()`) check `_assertNotFrozen()` and throw:

```
Builder "platform" is frozen after buildToolDefinition(). Cannot modify a built tool.
```

**Why this matters:** In complex servers, builders may be shared across modules. Without immutability, one module could accidentally add an action or middleware after another module has already registered the tool. `Object.freeze()` on the actions array prevents even direct array manipulation from bypassing the guard.

---

## Flat vs Hierarchical — Mutual Exclusion

A builder operates in exactly one mode:

- **Flat mode** — activated by calling `.action()`. All action keys are simple strings: `list`, `create`, `delete`.
- **Hierarchical mode** — activated by calling `.group()`. All action keys are compound: `users.list`, `billing.refund`.

Mixing the two throws immediately:

```
Cannot use .action() and .group() on the same builder "platform".
Use .action() for flat tools OR .group() for hierarchical tools.
```

**Dot validation** is also enforced: action names and group names cannot contain dots, preventing key collisions with the compound `group.action` format.

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

The `McpServerLike` interface only requires `setRequestHandler()`. No imports from `@modelcontextprotocol/sdk/server/`. This means:

- The framework works with both `Server` and `McpServer` without conditional imports.
- If the SDK restructures its exports, the framework does not break.
- The `attachToServer()` method returns a `DetachFn` that resets both handlers to no-ops — clean teardown for tests.
