# Scaling

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Grouping Reduces Tool Count](#grouping)
- [Tag Filtering](#tag-filtering)
- [TOON Token Compression](#toon)
- [Strict Validation](#strict)
- [Error Recovery](#error-recovery)

## Introduction {#introduction}

Every tool definition in `tools/list` includes a name, description, and full JSON Schema. The LLM receives this entire payload as system context. As tool count grows, three failures cascade: context saturation (fewer tokens for reasoning), semantic collision (similar tool names confuse routing), and parameter confusion (overlapping field names like `id` or `status` cause cross-contamination).

MCP Fusion provides four mechanisms to keep tool payloads manageable as your server scales.

## Grouping Reduces Tool Count {#grouping}

Use the [grouped exposition strategy](/tool-exposition#grouped) to consolidate multiple operations behind a single discriminator enum. Instead of 5 entries in `tools/list`:

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

## Tag Filtering {#tag-filtering}

`.tags()` on the Fluent API lets you classify tools, then filter which ones appear in `tools/list`:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
const f = initFusion<AppContext>();

const usersTool = f.query('users.list')
  .describe('List users')
  .tags('core', 'user-management')
  .handle(async (input, ctx) => { /* ... */ });
```

```typescript
registry.attachToServer(server, {
  contextFactory: createAppContext,
  filter: {
    tags: ['core'],
    exclude: ['internal'],
  },
});
```

Filtered tools consume zero tokens. If the LLM attempts to call a hidden tool, `routeCall()` returns `"Unknown tool"`.

## TOON Token Compression {#toon}

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

> [!TIP]
> Use TOON for servers with 20+ actions sharing the same tool. Below that threshold, standard Markdown descriptions are more readable for humans.

## Strict Validation {#strict}

Every action schema is compiled with `.strict()`. When the LLM sends undeclared fields, Zod rejects them with an actionable error naming the invalid fields:

```xml
<validation_error action="users/create">
  <field name="(root)">Unrecognized key(s) in object: 'hallucinated_param'. Remove or correct unrecognized fields.</field>
  <recovery>Fix the fields above and call the tool again.</recovery>
</validation_error>
```

The LLM sees exactly which fields are invalid and self-corrects on retry.

## Error Recovery {#error-recovery}

Structured error responses let the LLM self-correct without retry loops. Every validation bounce includes valid options or the specific field that failed. See [Error Handling](/error-handling) for the full reference.
