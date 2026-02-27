# Tool Exposition Strategies

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Flat — One Tool per Action](#flat)
- [Grouped — One Tool, Many Actions](#grouped)
- [Configuration](#config)
- [Decision Guide](#decision)

## Introduction {#introduction}

You define three actions — `list`, `create`, `delete` — inside one `projects` builder. Should the agent see one tool with a discriminator, or three independent tools? **Tool Exposition** decouples authoring from wire presentation. You write tools once; the framework decides how they appear to the LLM.

## Flat — One Tool per Action {#flat}

The default. Every action becomes an independent MCP tool with its own name, schema, and annotations:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const listProjects = f.query('projects.list')
  .withString('workspace_id', 'Workspace ID')
  .handle(async (input, ctx) => { /* ... */ });

const createProject = f.action('projects.create')
  .withString('workspace_id', 'Workspace ID')
  .withString('name', 'Project name')
  .handle(async (input, ctx) => { /* ... */ });

const deleteProject = f.mutation('projects.delete')
  .withString('workspace_id', 'Workspace ID')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => { /* ... */ });
```

The agent sees three entries in `tools/list`:

```jsonc
// projects_list — only listing fields
{
  "name": "projects_list",
  "description": "[READ-ONLY] List projects",
  "annotations": { "readOnlyHint": true, "destructiveHint": false },
  "inputSchema": {
    "properties": { "workspace_id": { "type": "string" } },
    "required": ["workspace_id"]
  }
}

// projects_delete — explicit destructive signal
{
  "name": "projects_delete",
  "description": "[DESTRUCTIVE] Delete project",
  "annotations": { "destructiveHint": true },
  "inputSchema": {
    "properties": {
      "workspace_id": { "type": "string" },
      "id": { "type": "string" }
    },
    "required": ["workspace_id", "id"]
  }
}
```

Each action gets its own schema — `projects_list` doesn't include `id`. The annotations are per-action, so `readOnlyHint` and `destructiveHint` are precise.

## Grouped — One Tool, Many Actions {#grouped}

All actions behind a single MCP tool with a discriminator enum:

```typescript
registry.attachToServer(server, {
  toolExposition: 'grouped',
});
```

Same definitions, one tool:

```jsonc
{
  "name": "projects",
  "description": "Manage workspace projects\n\nActions:\n- list (read-only)\n- create\n- delete (⚠️ destructive)",
  "inputSchema": {
    "properties": {
      "action": { "enum": ["list", "create", "delete"] },
      "workspace_id": { "type": "string" },
      "name": { "type": "string" },
      "id": { "type": "string" }
    },
    "required": ["action", "workspace_id"]
  }
}
```

Shared fields appear once instead of once per action. For 20+ actions sharing `workspace_id`, `session_id`, and `admin_token`, this saves significant tokens. The trade-off: the agent sees all fields from all actions in one schema.

## Configuration {#config}

```typescript
registry.attachToServer(server, {
  toolExposition: 'flat',     // 'flat' (default) or 'grouped'
  actionSeparator: '_',       // flat naming: 'projects_list'
});
```

Switching strategies never changes your handlers — only the wire format. Your code stays the same regardless of which strategy you choose.

## Decision Guide {#decision}

| Scenario | Strategy | Why |
|---|---|---|
| Simple CRUD (3–5 actions) | `flat` | Clear single-purpose tools |
| Per-action RBAC | `flat` | Clients can toggle individual tools |
| Smaller models (GPT-3.5, local LLMs) | `flat` | Avoids enum disambiguation |
| Large domain (20+ actions, shared params) | `grouped` | Token savings |
| Enterprise platform (100+ endpoints) | `grouped` | Domain cohesion |
| Frontier models (GPT-4, Claude, Gemini) | Either | Both work well |