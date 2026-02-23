# Scaling

This document perfectly explains the technical mechanisms that allow **MCP Fusion** to support thousands of internal API endpoints without causing LLM hallucination or exceeding model token limits. Every claim maps to actual native framework behavior.

---

## The Root Cause of Hallucination at Scale

Model Context Protocol exposes tools to the LLM via the `tools/list` RPC response. Every tool definition includes:
- `name` — the tool identifier
- `description` — a multi-line string explaining what the tool does
- `inputSchema` — the full JSON Schema with properties, enums, descriptions, and requirements

The Language Model receives this entire `tools/list` payload as part of its system context. **This payload directly competes for space with the conversation history and the model's reasoning capacity.**

When the number of exposed tools grows, three failures cascade:

1. **Context Saturation:** The payload consumes tokens that would otherwise be used for reasoning. The LLM has less room to think about which tool to pick.
2. **Semantic Collision:** Tools with similar names confuse the routing. The LLM confuses `crm_contacts_create` with `crm_companies_create`.
3. **Parameter Confusion:** With many tools exposing overlapping field names (like `id` or `status`), the LLM cross-contaminates arguments and hallucinates payloads.

**MCP Fusion** addresses each of these failures natively.

---

## Mechanism 1: Grouping Reduces Tool Count

`GroupedToolBuilder` consolidates multiple operations into a single MCP tool definition. Instead of registering separate tools for `list`, `get`, `create`, `update`, `delete`, you register **one** tool with a discriminator enum.

### Before Fusion
5 entries in `tools/list`, each consuming token blocks for its own `name`, `description`, and `inputSchema`:

```json
[
  { "name": "projects_list", "description": "...", "inputSchema": { /* ... */ } },
  { "name": "projects_get", "description": "...", "inputSchema": { /* ... */ } },
  { "name": "projects_create", "description": "...", "inputSchema": { /* ... */ } }
]
```

### After Fusion
1 entry in `tools/list` with all operations cleanly nested behind a single discriminator:

```json
[
  {
    "name": "projects",
    "description": "Manage projects. Actions: list, get, create\n\nWorkflow:\n- 'list': ...\n- 'get': Requires: id...",
    "inputSchema": {
      "properties": {
        "action": { "type": "string", "enum": ["list", "get", "create"] },
        "id": { "description": "Project ID. Required for: get" },
        "name": { "description": "Project name. Required for: create" }
      },
      "required": ["action"]
    }
  }
]
```

The discriminator enum (`action`) tightly anchors the LLM to a closed set of valid operations. It is physically incapable of hallucinating an action like `"remove"`. If it does, Fusion internally bounces the execution and returns a structured string error detailing valid options, letting the LLM self-correct.

---

## Mechanism 2: Tag Filtering

Even with grouping, exposing all tools at once may saturate the context. `ToolRegistry` provides tag-based filtering that controls which tool definitions appear in the payload at runtime.

You declare tags via `.tags()` on your builder:

```typescript
const usersTool = createTool<AppContext>('users')
    .tags('core', 'user-management')
```

When attaching to the server, you explicitly pass evaluation filters:

```typescript
// Includes tools matching 'core', excludes tools matching 'internal'
registry.attachToServer(server, {
    filter: { 
        tags: ['core'],
        exclude: ['internal']
    },
});
```

::: tip Dynamic Scoping
Filtered tools are excluded from the `tools/list` response \u2014 they consume **zero tokens**. Also, if the LLM attempts to call a hidden tool, `routeCall()` intercepts it and returns `"Unknown tool"`.
:::

---

## Mechanism 3: TOON Token Compression

For tools that *are* exposed, the description string is generally the largest token consumer. By default, `DescriptionGenerator` produces multi-line markdown workflow summaries.

Enabling `.toonDescription()` switches the build engine to encode the metadata using `@toon-format/toon` pipe-delimited formatting natively:

```text
Manage projects

action|desc|required|destructive
list|List all projects||
get|Get project details|id|
create|Create a new project|name|
update|Update project|id,data|
delete|Delete project permanently|id|true
```

Column names appear once as a header. Values are pipe-delimited. **There is no JSON key repetition per row.** This dramatically lowers the token density of complex API surfaces while retaining 100% of the semantic meaning for the LLM.

---

## Mechanism 4: Strict `.strict()` Validation

When the LLM does hallucinate parameters—sending fields that don't exist in the action's schema—the framework silently removes them before execution.

```typescript
// Inside ToolDefinitionCompiler:
return this._commonSchema.merge(action.schema).strict();
```

`.strict()` configures Zod to reject unknown fields with an actionable error. The LLM sees exactly which fields are invalid and self-corrects on retry — rather than having its data silently discarded.

```jsonc
// LLM sends this hallucinated payload:
{
  "action": "list",
  "workspace_id": "ws-1",
  "hallucinated_filter": "open" // Attempted hallucination
}
```

The handler receives exactly `{ workspace_id: "ws-1" }`. The handler is completely unaffected.

---

## Mechanism 5: Error Recovery

When the LLM makes a mistake—wrong action name, missing required field, invalid type—the framework returns structured error strings that the LLM parses to natively self-correct:

```text
// Missing discriminator
Error: action is required. Available: list, get, create, update, delete

// Validation failure (from Zod safeParse)
Validation failed: id: Required; email: Invalid email format

// Handler custom thrown error
[projects/delete] Database connection refused
```

Every validation bounce intrinsically includes the list of valid options or the specific field that failed. The LLM contextualizes the structured error, adjusts the internal arguments, and organically retries the MCP request.
