# Scaling

Every tool definition in `tools/list` includes a name, description, and full JSON Schema. The LLM receives this entire payload as system context. As tool count grows, three failures cascade: context saturation (fewer tokens for reasoning), semantic collision (similar tool names confuse routing), and parameter confusion (overlapping field names like `id` or `status` cause cross-contamination).

## Grouping Reduces Tool Count

`GroupedToolBuilder` consolidates multiple operations behind a single discriminator enum. Instead of 5 entries in `tools/list`:

```json
[
  { "name": "projects_list", "inputSchema": { /* ... */ } },
  { "name": "projects_get", "inputSchema": { /* ... */ } },
  { "name": "projects_create", "inputSchema": { /* ... */ } }
]
```

One entry with all operations nested:

```json
[
  {
    "name": "projects",
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

The discriminator enum anchors the LLM to valid operations. If it sends an invalid action, Fusion returns a structured error with the valid options.

## Tag Filtering

`ToolRegistry` provides tag-based filtering at runtime. Tags declared via `.tags()` control which definitions appear in `tools/list`:

```typescript
const f = initFusion<AppContext>();
const usersTool = f.defineTool('users', {}).tags('core', 'user-management');
```

```typescript
registry.attachToServer(server, {
    filter: {
        tags: ['core'],
        exclude: ['internal'],
    },
});
```

Filtered tools consume zero tokens. If the LLM attempts to call a hidden tool, `routeCall()` returns `"Unknown tool"`.

## TOON Token Compression

`.toonDescription()` encodes action metadata using pipe-delimited formatting, reducing description tokens by 30-50%:

```text
Manage projects

action|desc|required|destructive
list|List all projects||
get|Get project details|id|
create|Create a new project|name|
update|Update project|id,data|
delete|Delete project permanently|id|true
```

Column names appear once as a header. No JSON key repetition per row.

## Strict Validation

Every action schema is compiled with `.strict()`. When the LLM sends undeclared fields, Zod rejects them with an actionable error naming the invalid fields:

```typescript
return this._commonSchema.merge(action.schema).strict();
```

The LLM sees exactly which fields are invalid and self-corrects on retry.

## Error Recovery

Structured error responses let the LLM self-correct without retry loops:

```text
Error: action is required. Available: list, get, create, update, delete

Validation failed: id: Required; email: Invalid email format

[projects/delete] Database connection refused
```

Every validation bounce includes valid options or the specific field that failed.
