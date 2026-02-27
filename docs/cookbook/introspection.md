# Introspection

- [Introduction](#introduction)
- [Enabling the Manifest](#enabling)
- [RBAC Filtering](#rbac)
- [Manifest Structure](#structure)
- [Registry Querying](#querying)

## Introduction {#introduction}

During development, debugging, and governance, you need to know what tools are registered, what their schemas look like, and what presenters are wired to them. MCP Fusion provides two introspection mechanisms:

1. **Dynamic Manifest** — An MCP Resource that exposes a structured JSON manifest of all tools, actions, and presenters. Clients can read it via `resources/read`.
2. **Registry API** — Direct programmatic access via `registry.getAllTools()`, `registry.getBuilders()`, and `registry.getTools(filter)`.

## Enabling the Manifest {#enabling}

Enable the dynamic manifest via the `introspection` option in `attachToServer()`:

```typescript
registry.attachToServer(server, {
  contextFactory: createContext,
  introspection: {
    enabled: process.env.NODE_ENV !== 'production',
    uri: 'fusion://manifest.json',
  },
});
```

When enabled, the framework registers `resources/list` and `resources/read` handlers on the MCP server. Clients discover the manifest via standard MCP resource discovery — no custom HTTP endpoints.

> [!IMPORTANT]
> Introspection is **opt-in only** and never enabled silently. In production, consider disabling it or using RBAC filtering to restrict what each session sees.

## RBAC Filtering {#rbac}

The `filter` callback allows per-session manifest filtering. Unauthorized agents never see hidden tools:

```typescript
registry.attachToServer(server, {
  contextFactory: createContext,
  introspection: {
    enabled: true,
    uri: 'fusion://manifest.json',
    filter: (manifest, ctx) => {
      if (ctx.user.role !== 'admin') {
        // Remove admin-only tools from the manifest
        delete manifest.capabilities.tools['admin.delete_user'];
        delete manifest.capabilities.tools['admin.reset_password'];
      }
      return manifest;
    },
  },
});
```

The `filter` receives a **cloned** manifest — mutations are safe and don't affect the compiled tree.

## Manifest Structure {#structure}

The manifest JSON contains:

```json
{
  "serverName": "my-mcp-server",
  "capabilities": {
    "tools": {
      "projects.list": {
        "description": "List all projects",
        "annotations": { "readOnlyHint": true },
        "inputSchema": { "properties": { "status": { "type": "string" } } },
        "actions": ["list"],
        "presenter": "Project"
      }
    }
  }
}
```

Each tool entry includes its description, annotations, input schema, action list, and attached Presenter name.

## Registry Querying {#querying}

For programmatic access (scripts, admin dashboards, test harnesses), use the `ToolRegistry` API directly:

```typescript
const registry = new ToolRegistry<AppContext>();
registry.registerAll(...tools);

// All compiled MCP tool definitions
const allTools = registry.getAllTools();
// [{ name: 'projects_list', description: '...', inputSchema: {...} }, ...]

// Filtered by tags
const publicTools = registry.getTools({ tags: ['public'] });
const nonAdminTools = registry.getTools({ exclude: ['admin'] });

// Check if a tool exists
registry.has('projects');  // true

// Count registered tools
registry.size;             // 42

// Iterate over raw builders (for custom introspection)
for (const builder of registry.getBuilders()) {
  console.log(builder.getName(), builder.getTags());
}
```

> [!TIP]
> Use `getBuilders()` to access the raw builder instances. Each builder exposes `getName()`, `getTags()`, `buildToolDefinition()`, and other metadata methods useful for building custom introspection tools.
