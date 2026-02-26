# Dynamic Manifest

A live `fusion://manifest.json` MCP Resource describing every tool, action, and presenter on the server. An optional RBAC filter strips capabilities per session — unauthorized agents never see hidden tools.

## Quick Start {#quickstart}

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projectsTool, invoicesTool, adminTool);

registry.attachToServer(server, {
  contextFactory: (extra) => createAppContext(extra),
  serverName: 'my-platform',
  introspection: {
    enabled: process.env.NODE_ENV !== 'production',
  },
});
```

Clients read the manifest through the standard MCP Resource protocol:

```typescript
const manifest = await client.readResource({ uri: 'fusion://manifest.json' });
```

## Manifest Payload {#payload}

```json
{
  "server": "my-platform",
  "mcp_fusion_version": "1.0.0",
  "architecture": "MVA (Model-View-Agent)",
  "capabilities": {
    "tools": {
      "projects": {
        "description": "Project management. Actions: list, create, archive",
        "tags": ["core", "projects"],
        "actions": {
          "list": {
            "description": "List all projects",
            "destructive": false,
            "idempotent": false,
            "readOnly": true,
            "required_fields": [],
            "returns_presenter": null
          },
          "create": {
            "description": "Create a new project",
            "destructive": false,
            "readOnly": false,
            "required_fields": ["name"],
            "returns_presenter": null
          }
        },
        "input_schema": { "type": "object", "properties": { "..." : "..." } }
      }
    },
    "presenters": {
      "Invoice": {
        "schema_keys": ["id", "total", "client", "status"],
        "ui_blocks_supported": ["item"],
        "has_contextual_rules": false
      }
    }
  }
}
```

**Tool entry** — `description` (auto-generated), `tags` (string[]), `actions` (Record), `input_schema` (Zod-derived JSON Schema).

**Action entry** — `destructive` (boolean), `idempotent` (boolean), `readOnly` (boolean), `required_fields` (string[]), `returns_presenter` (string | null).

**Presenter entry** — `schema_keys` (data fields exposed), `ui_blocks_supported` ('item'/'collection'), `has_contextual_rules` (dynamic vs static system rules).

## RBAC Filtering {#rbac}

The `filter` callback receives a deep clone of the manifest plus the session context. Mutate freely — each request gets a fresh copy.

**Hide entire tools:**

```typescript
introspection: {
  enabled: true,
  filter: (manifest, ctx) => {
    if (ctx.user.role !== 'admin') {
      delete manifest.capabilities.tools['admin'];
    }
    return manifest;
  },
},
```

**Strip destructive actions:**

```typescript
filter: (manifest, ctx) => {
  if (ctx.user.role === 'readonly') {
    for (const tool of Object.values(manifest.capabilities.tools)) {
      for (const [key, action] of Object.entries(tool.actions)) {
        if (action.destructive) delete tool.actions[key];
      }
    }
  }
  return manifest;
},
```

**Multi-tenant filtering:**

```typescript
filter: (manifest, ctx) => {
  const features = ctx.tenant.enabledFeatures;
  if (!features.includes('billing')) {
    delete manifest.capabilities.tools['invoices'];
    delete manifest.capabilities.presenters['Invoice'];
  }
  return manifest;
},
```

## Custom URI {#uri}

```typescript
introspection: {
  enabled: true,
  uri: 'fusion://v2/capabilities.json',
},
```

## Configuration {#config}

```typescript
interface IntrospectionConfig<TContext> {
  enabled: boolean;
  uri?: string;                        // default: 'fusion://manifest.json'
  filter?: (manifest: ManifestPayload, ctx: TContext) => ManifestPayload;
}
```

`introspection.enabled` registers the manifest resource. `introspection.uri` overrides the default `fusion://manifest.json`. `introspection.filter` applies RBAC per session. `serverName` appears as the `server` field in the payload (default: `'mcp-fusion-server'`).

## How It Works {#internals}

```text
resources/read (uri = fusion://manifest.json)
    │
    ▼
compileManifest(serverName, builders)
    │  Iterates registry builders
    │  Extracts action metadata, tags, schemas
    │  Extracts presenter info via getSchemaKeys(), getUiBlockTypes(), hasContextualRules()
    ▼
cloneManifest() → deep clone
    │
    ▼
filter(clone, ctx) → RBAC filtering
    │
    ▼
JSON response
```

Compiled per request so late-registered tools always appear. Deep clone before filter so concurrent sessions with different roles never interfere. Presenter metadata extracted via accessors (`getSchemaKeys()`, `getUiBlockTypes()`, `hasContextualRules()`) without executing `.make()`.

**Dynamic Manifest vs Builder Introspection** — Dynamic Manifest is runtime, server-scoped, RBAC-filtered, accessed via MCP Resource protocol. Builder Introspection is development-time, single-builder-scoped, accessed via direct method calls. See [Introspection](/introspection) for the builder-level API.
