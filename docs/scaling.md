# Scaling — How mcp-fusion Handles Thousands of Endpoints

This document explains the technical mechanisms that allow `mcp-fusion` to support large API surfaces without causing LLM hallucination. Every claim here maps to actual framework behavior — no theoretical recommendations.

---

## The Root Cause of Hallucination at Scale

MCP exposes tools to the LLM via the `tools/list` response. Every tool definition includes:

- `name` — tool identifier
- `description` — multi-line string explaining what the tool does
- `inputSchema` — full JSON Schema with properties, enums, descriptions, and required arrays

The LLM receives the entire `tools/list` payload as part of its system context. This payload competes for space with the conversation history, system prompt, and reasoning capacity.

When the number of tools grows, three failures cascade:

1. **Context saturation.** The `tools/list` payload consumes tokens that would otherwise be used for reasoning. The LLM has less room to think about which tool to pick and what arguments to send.
2. **Semantic collision.** Tools with similar names or descriptions compete for selection. The LLM confuses `crm_contacts_create` with `crm_companies_create`, or picks `devops_deployments_list` when it should pick `devops_ci_pipelines_list`.
3. **Parameter confusion.** With many tools exposing overlapping field names (`id`, `name`, `status`), the LLM cross-contaminates arguments — sending fields that belong to one tool into another.

The framework addresses each of these failures with a specific mechanism.

---

## Mechanism 1 — Grouping Reduces Tool Count

`GroupedToolBuilder` consolidates multiple operations into a single MCP tool definition. Instead of registering separate tools for `list`, `get`, `create`, `update`, `delete`, you register one tool with a discriminator enum.

**What changes in `tools/list`:**

Without grouping — 5 entries in `tools/list`, each with its own `name`, `description`, and `inputSchema`:

```
tools/list → [
  { name: "projects_list", description: "...", inputSchema: { ... } },
  { name: "projects_get", description: "...", inputSchema: { ... } },
  { name: "projects_create", description: "...", inputSchema: { ... } },
  { name: "projects_update", description: "...", inputSchema: { ... } },
  { name: "projects_delete", description: "...", inputSchema: { ... } },
]
```

With grouping — 1 entry in `tools/list` with all operations behind a discriminator:

```
tools/list → [
  {
    name: "projects",
    description: "Manage projects. Actions: list, get, create, update, delete\n\nWorkflow:\n- 'list': ...\n- 'get': Requires: id\n...",
    inputSchema: {
      properties: {
        action: { type: "string", enum: ["list", "get", "create", "update", "delete"] },
        id: { description: "Project ID. Required for: get, update, delete" },
        name: { description: "Project name. Required for: create" },
        ...
      },
      required: ["action"]
    }
  }
]
```

The discriminator enum (`action`) anchors the LLM to a closed set of valid operations. The LLM cannot hallucinate an action like `"remove"` or `"fetch_all"` because the enum constraint is explicit in the schema. If it does, `execute()` returns a structured error listing the valid options — the LLM reads the error and self-corrects.

**How `SchemaGenerator` merges fields:**

When multiple actions use the same field name, `SchemaGenerator` tracks which actions use each field and generates per-field annotations:

```typescript
// SchemaGenerator internally tracks:
// fieldActions = Map<fieldName, { keys: string[], requiredIn: string[] }>
```

This produces annotations like `Required for: get, update, delete` or `For: list, search` — telling the LLM exactly when each field applies. The annotation is appended directly to the field's `description` string in the JSON Schema, so the LLM sees it inline without needing to cross-reference metadata.

**Reduction ratio:**

The consolidation ratio depends on how you structure your groups. A tool with 7 CRUD actions reduces 7 tool entries to 1. A hierarchical tool using `.group()` with 5 groups of 4 actions each reduces 20 entries to 1. The framework does not impose a maximum number of actions per tool.

---

## Mechanism 2 — Tag Filtering Controls What the LLM Sees

Even with grouping, exposing all tools at once may saturate the context. `ToolRegistry` provides tag-based filtering that controls which tool definitions appear in the `tools/list` response.

**How it works in code:**

Each `GroupedToolBuilder` declares tags via `.tags()`:

```typescript
const usersTool = new GroupedToolBuilder<AppContext>('users')
    .tags('core', 'user-management')
    // ... actions
```

`ToolRegistry.getTools()` filters by these tags:

```typescript
// Include: builder must have ALL specified tags
registry.getTools({ tags: ['core'] });

// Exclude: builder must not have ANY specified tag
registry.getTools({ exclude: ['internal'] });

// Combined: include AND exclude
registry.getTools({ tags: ['core'], exclude: ['admin'] });
```

`attachToServer()` accepts a `filter` option that passes directly to `getTools()`. The `tools/list` handler only returns matching tools:

```typescript
registry.attachToServer(server, {
    filter: { tags: ['core'] },
});
```

**What this means for the LLM:**

The LLM never sees tools that don't match the filter. They don't appear in `tools/list`. They consume zero tokens. The LLM cannot call them — `routeCall()` will return `"Unknown tool"` if a non-exposed tool is called.

**This is the primary scaling mechanism.** Grouping reduces tool count per domain. Tag filtering reduces how many domains the LLM sees at once. Together, they allow thousands of registered endpoints while keeping the `tools/list` payload small.

---

## Mechanism 3 — TOON Compresses Descriptions

For tools that ARE exposed, the description string is the largest token consumer. `DescriptionGenerator` produces multi-line markdown:

```
Manage projects. Actions: list, get, create, update, delete

Workflow:
- 'list': List all projects
- 'get': Get project details. Requires: id
- 'create': Create a new project. Requires: name
- 'update': Update project. Requires: id, data
- 'delete': Delete project permanently. Requires: id ⚠️ DESTRUCTIVE
```

Enabling `.toonDescription()` switches to `ToonDescriptionGenerator`, which encodes the same metadata using `@toon-format/toon` pipe-delimited format:

```
Manage projects

action|desc|required|destructive
list|List all projects||
get|Get project details|id|
create|Create a new project|name|
update|Update project|id,data|
delete|Delete project permanently|id|true
```

Column names appear once as a header. Values are pipe-delimited. No key repetition per row. The `encode()` function from `@toon-format/toon` handles serialization.

For grouped tools, `ToonDescriptionGenerator` organizes rows by `groupName`, encoding a `Record<string, ActionRow[]>` structure that TOON handles natively.

The token reduction depends on the number of actions and field complexity. More actions = more savings, because the header overhead is amortized across more rows.

---

## Mechanism 4 — Schema Unification Prevents Parameter Confusion

Without grouping, the LLM sees `id` fields across many tools — `projects_get.id`, `tasks_get.id`, `users_get.id`. These separate `id` fields can cross-contaminate when the LLM constructs arguments.

With grouping, `SchemaGenerator` produces a single unified schema per tool. The `id` field appears once with annotations explaining which actions it belongs to:

```json
{
  "id": {
    "type": "string",
    "description": "Record identifier. Required for: get, update, delete"
  }
}
```

The LLM sees one `id` field scoped to one tool. There is no ambiguity about which tool the `id` belongs to — it's the tool that's being called.

For hierarchical tools using `.group()`, the discriminator values are compound keys (`users.list`, `billing.refund`). The `SchemaGenerator` produces the description format `Module and operation (module.action format)` for the discriminator field, making the namespace explicit.

---

## Mechanism 5 — Zod `.strip()` as Safety Net

When the LLM does hallucinate parameters — sending fields that don't exist in the action's schema — the framework silently removes them.

`execute()` builds a validation schema by merging `commonSchema` + `action.schema` using Zod's `.merge()`, then calls `.strip()`:

```typescript
// Inside GroupedToolBuilder._buildValidationSchema():
return this._commonSchema.merge(action.schema).strip();
```

`.strip()` configures Zod to parse and discard unknown fields. The handler receives `result.data` — not the raw args. Fields the LLM invented are gone.

This means a call like:

```json
{
  "action": "list",
  "workspace_id": "ws-1",
  "hallucinated_filter": "open",
  "sort_by_priority": true
}
```

Results in the handler receiving only `{ workspace_id: "ws-1" }` (assuming `workspace_id` is in `commonSchema` and the action has no schema of its own). The hallucinated fields are stripped. The handler is unaffected.

---

## Mechanism 6 — Structured Error Recovery

When the LLM makes a mistake — wrong action name, missing required field, invalid type — the framework returns structured error messages that the LLM can parse and use to self-correct:

```
// Missing discriminator
Error: action is required. Available: list, get, create, update, delete

// Wrong action name
Error: Unknown action "remove". Available: list, get, create, update, delete

// Validation failure (from Zod safeParse)
Validation failed: id: Required; email: Invalid email format

// Handler error
[projects/delete] Database connection refused
```

Every error includes the list of valid options or the specific field that failed. The LLM reads the structured error, adjusts the arguments, and retries with the correct values.

---

## How These Mechanisms Compose

The six mechanisms work together in layers:

```
Layer 1 — Registration
  GroupedToolBuilder consolidates N actions → 1 tool definition
  ToolRegistry stores all builders

Layer 2 — Exposure (tools/list)
  Tag filtering selects which tools appear
  TOON compresses descriptions of exposed tools
  SchemaGenerator produces unified schemas with per-field annotations

Layer 3 — Execution (tools/call)
  Discriminator enum constrains valid actions
  Zod .strip() removes hallucinated parameters
  Structured errors enable self-correction
```

Layer 1 reduces the total number of tools. Layer 2 reduces what the LLM sees. Layer 3 handles mistakes at runtime. Each layer is independent — you can use grouping without TOON, or tag filtering without middleware.

---

## Practical Guidance

The framework does not impose limits on how many tools or actions you register. The constraint is the LLM's context window.

**Grouping alone** is sufficient for small-to-medium API surfaces. If your total registered tools (after consolidation) fit within the LLM's context alongside the conversation, no filtering is needed.

**Tag filtering** becomes essential when the consolidated tool count is large enough to compete with the conversation for context space. The threshold depends on the model:

- Tools with complex schemas (many fields, nested objects, long descriptions) consume more tokens per tool.
- Tools with simple schemas (few fields, short descriptions) consume fewer.
- TOON descriptions reduce per-tool token cost but do not eliminate it.

The recommendation: use `.tags()` on every builder from the start, even if you don't filter immediately. Tags are metadata — they cost nothing until used — and they give you the ability to filter later without refactoring.

```typescript
// Always tag, even if you expose everything today
const builder = new GroupedToolBuilder<AppContext>('users')
    .tags('core', 'user-management')
    // ...

// When you need to filter later, you just add the filter option
registry.attachToServer(server, {
    filter: { tags: ['core'] },
});
```

The `attachToServer()` filter is evaluated at `tools/list` time, not at registration time. You can change the filter per session, per user role, or per conversation topic — the registry holds all tools, and the filter controls the view.
