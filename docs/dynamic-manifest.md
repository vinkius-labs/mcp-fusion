# Dynamic Manifest

**MCP Fusion** can expose a **live capabilities manifest** as a native MCP Resource. Orchestrators, admin dashboards, and AI agents can read `fusion://manifest.json` to discover every tool, action, and presenter registered on the server — dynamically filtered by the requesting user's role and permissions.

::: tip Zero Overhead
The Dynamic Manifest is fully opt-in. When not configured, **no code runs** — no handlers registered, no resource advertised. The feature only activates when you set `introspection.enabled: true` in `attachToServer()`.
:::

---

## The Problem

### 1. Opaque Server Surface

An MCP client can call `tools/list` to discover tool names and schemas, but it cannot see:

- **Action-level metadata:** Which actions are destructive? Which are read-only?
- **Presenter architecture:** What data shapes does the server return? What UI blocks are supported?
- **Server identity:** What framework version is running? What architecture does it follow?

### 2. Static Exposure

In multi-tenant environments, different users should see different capabilities. An admin should see `admin.delete_user` in the manifest. A viewer should not — and should not even know it exists.

### The Insight

The MCP protocol already has a native Resource system (`resources/list`, `resources/read`). **MCP Fusion** uses this existing protocol layer to expose the manifest — no custom HTTP endpoints, no external dependencies.

> **Security model:** Unauthorized agents don't even know hidden tools exist — they're removed from the manifest tree entirely, not just disabled.

---

## Quick Start

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

That's it. The server now advertises a `fusion://manifest.json` resource. Any MCP client can read it:

```typescript
// Client-side (any MCP client)
const resources = await client.listResources();
// → [{ uri: 'fusion://manifest.json', name: 'MCP Fusion Manifest', mimeType: 'application/json' }]

const manifest = await client.readResource({ uri: 'fusion://manifest.json' });
// → Full server capabilities tree
```

---

## Manifest Payload

The manifest is a structured JSON document describing every capability registered on the server:

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
            "idempotent": false,
            "readOnly": false,
            "required_fields": ["name"],
            "returns_presenter": null
          }
        },
        "input_schema": { "type": "object", "properties": { "..." : "..." } }
      },
      "invoices": {
        "description": "Invoice management. Actions: get, pay",
        "tags": ["billing"],
        "actions": {
          "get": {
            "description": "Get invoice by ID",
            "destructive": false,
            "idempotent": false,
            "readOnly": true,
            "required_fields": ["id"],
            "returns_presenter": "Invoice"
          }
        },
        "input_schema": { "..." : "..." }
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

### Payload Structure

| Field | Type | Description |
|---|---|---|
| `server` | `string` | Server name from `AttachOptions.serverName` |
| `mcp_fusion_version` | `string` | Version of the **MCP Fusion** framework |
| `architecture` | `string` | Always `'MVA (Model-View-Agent)'` |
| `capabilities.tools` | `Record<string, ManifestTool>` | All registered tools, keyed by name |
| `capabilities.presenters` | `Record<string, ManifestPresenter>` | All referenced Presenters, keyed by name |

### Tool Entry

| Field | Type | Description |
|---|---|---|
| `description` | `string` | Auto-generated tool description |
| `tags` | `string[]` | Capability tags for selective exposure |
| `actions` | `Record<string, ManifestAction>` | Actions within this tool |
| `input_schema` | `object` | Full JSON Schema of the tool's input |

### Action Entry

| Field | Type | Description |
|---|---|---|
| `description` | `string` | Human-readable action description |
| `destructive` | `boolean` | Whether this action destroys data |
| `idempotent` | `boolean` | Whether this action is safe to retry |
| `readOnly` | `boolean` | Whether this action only reads data |
| `required_fields` | `string[]` | Required parameter names (parsed from Zod) |
| `returns_presenter` | `string \| null` | Presenter name if MVA pattern is used |

### Presenter Entry

| Field | Type | Description |
|---|---|---|
| `schema_keys` | `string[]` | Data field names exposed to the LLM |
| `ui_blocks_supported` | `string[]` | UI block types: `'item'`, `'collection'`, or both |
| `has_contextual_rules` | `boolean` | Whether system rules are dynamic (function) vs static (array) |

---

## RBAC Filtering

The `filter` callback receives a **deep clone** of the full manifest and the session context. Remove any tools, actions, or presenters that the requesting user should not see:

### Hiding Entire Tools

```typescript
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    introspection: {
        enabled: true,
        filter: (manifest, ctx) => {
            if (ctx.user.role !== 'admin') {
                delete manifest.capabilities.tools['admin'];
            }
            return manifest;
        },
    },
});
```

An admin reads `fusion://manifest.json` and sees all tools including `admin`. A viewer reads the same resource and sees everything except `admin` — they don't even know it exists.

### Hiding Specific Actions

```typescript
filter: (manifest, ctx) => {
    if (ctx.user.role === 'readonly') {
        for (const tool of Object.values(manifest.capabilities.tools)) {
            for (const [key, action] of Object.entries(tool.actions)) {
                if (action.destructive) {
                    delete tool.actions[key];
                }
            }
        }
    }
    return manifest;
},
```

Read-only users see all tools, but destructive actions like `delete_user` are stripped from every tool.

### Hiding Presenters

```typescript
filter: (manifest, ctx) => {
    if (!ctx.permissions.includes('billing:read')) {
        delete manifest.capabilities.presenters['Invoice'];
        delete manifest.capabilities.presenters['Receipt'];
    }
    return manifest;
},
```

::: warning Clone Safety
The `filter` callback always receives a **deep clone** of the compiled manifest. You can safely use `delete` without affecting other sessions or the original registry state. Each request gets a fresh copy.
:::

---

## Custom URI

By default, the manifest is served at `fusion://manifest.json`. Override it with the `uri` option:

```typescript
introspection: {
    enabled: true,
    uri: 'fusion://v2/capabilities.json',
},
```

The custom URI is used in both `resources/list` (advertising) and `resources/read` (serving).

---

## Configuration

### `IntrospectionConfig<TContext>`

```typescript
interface IntrospectionConfig<TContext> {
    /** Whether introspection is enabled. Strict opt-in. */
    readonly enabled: boolean;

    /** Custom URI for the MCP Resource. @default 'fusion://manifest.json' */
    readonly uri?: string;

    /** RBAC-aware manifest filter. Called on every resources/read. */
    readonly filter?: (manifest: ManifestPayload, ctx: TContext) => ManifestPayload;
}
```

### `AttachOptions` Integration

```typescript
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    serverName: 'my-platform',           // ← appears in manifest.server
    introspection: {                     // ← new option
        enabled: true,
        filter: (manifest, ctx) => { /* ... */ },
    },
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `introspection.enabled` | `boolean` | — | Whether to register the manifest resource |
| `introspection.uri` | `string?` | `'fusion://manifest.json'` | Custom resource URI |
| `introspection.filter` | `function?` | `undefined` | RBAC filter callback |
| `serverName` | `string?` | `'mcp-fusion-server'` | Server name in the manifest payload |

---

## How It Works

### Architecture

```
resources/list request
    │
    ▼
┌──────────────────────────┐
│  Advertise manifest URI  │  ← [{ uri, name, mimeType }]
└──────────────────────────┘

resources/read request (uri = fusion://manifest.json)
    │
    ▼
┌──────────────────────────┐
│  ManifestCompiler        │  ← Iterates registry.getBuilders()
│  • Extract tool metadata │     Reuses ToolBuilder.buildToolDefinition()
│  • Extract action flags  │     Reuses ToolBuilder.getActionMetadata()
│  • Extract presenter info│     Uses Presenter introspection accessors
│  • Build JSON Schema     │
└──────────────────────────┘
    │
    ▼
┌──────────────────────────┐
│  RBAC Filter (optional)  │  ← config.filter(clone, ctx)
│  • Deep clone manifest   │     Clone protects original
│  • Apply filter callback │     Context from contextFactory
│  • Return filtered tree  │
└──────────────────────────┘
    │
    ▼
┌──────────────────────────┐
│  JSON Response           │  ← { contents: [{ uri, mimeType, text }] }
└──────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **Native MCP Resource** | No custom HTTP endpoints. Uses the protocol the client already speaks. |
| **Compiled per request** | Manifest reflects late-registered tools. No stale cache. |
| **Deep clone before filter** | Concurrent sessions with different roles never interfere. |
| **Presenter metadata via accessors** | `getSchemaKeys()`, `getUiBlockTypes()`, `hasContextualRules()` extract metadata without executing `.make()` — no side effects. |
| **Reuses existing APIs** | `buildToolDefinition()`, `getActionMetadata()`, `getTags()` — zero duplication. |

---

## Real-World Patterns

### Secure by Default

Enable introspection only in development and staging:

```typescript
introspection: {
    enabled: process.env.NODE_ENV !== 'production',
},
```

In production, no handlers are registered, no resource is advertised. Zero attack surface.

### Admin Dashboard Endpoint

Use the manifest to power an admin capabilities dashboard:

```typescript
// Backend endpoint
app.get('/api/capabilities', async (req, res) => {
    const manifest = await mcpClient.readResource({
        uri: 'fusion://manifest.json',
    });
    res.json(JSON.parse(manifest.contents[0].text));
});
```

### Multi-Tenant RBAC

Filter by tenant-specific features:

```typescript
filter: (manifest, ctx) => {
    const features = ctx.tenant.enabledFeatures;

    if (!features.includes('billing')) {
        delete manifest.capabilities.tools['invoices'];
        delete manifest.capabilities.tools['billing'];
        delete manifest.capabilities.presenters['Invoice'];
    }

    if (!features.includes('analytics')) {
        delete manifest.capabilities.tools['analytics'];
        delete manifest.capabilities.presenters['DashboardReport'];
    }

    return manifest;
},
```

### Compliance Audit Report

Generate a compliance report from the live manifest:

```typescript
const manifest = JSON.parse(
    (await client.readResource({ uri: 'fusion://manifest.json' })).contents[0].text
);

const destructiveActions: string[] = [];
for (const [toolName, tool] of Object.entries(manifest.capabilities.tools)) {
    for (const [actionName, action] of Object.entries(tool.actions)) {
        if (action.destructive) {
            destructiveActions.push(`${toolName}.${actionName}`);
        }
    }
}

console.log('Destructive actions:', destructiveActions);
// ['admin.delete_user', 'projects.archive', 'billing.void']
```

---

## Combining with Other Features

The Dynamic Manifest works seamlessly with all Fusion features:

```typescript
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    serverName: 'platform-api',
    debug: createDebugObserver(),            // ← Observability
    filter: { tags: ['core'] },              // ← Tag filtering
    stateSync: {                             // ← State Sync
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
        ],
    },
    introspection: {                         // ← Dynamic Manifest
        enabled: process.env.NODE_ENV !== 'production',
        filter: (manifest, ctx) => {
            if (ctx.user.role !== 'admin') {
                delete manifest.capabilities.tools['admin'];
            }
            return manifest;
        },
    },
});
```

All features compose orthogonally — each operates at a different layer of the protocol pipeline.

---

## Difference from Builder Introspection

**MCP Fusion** provides two complementary introspection systems:

| Feature | Builder Introspection | Dynamic Manifest |
|---|---|---|
| **Purpose** | Development-time tool inspection | Runtime server capabilities map |
| **Access** | Direct method calls (`builder.getActionMetadata()`) | MCP Resource protocol (`resources/read`) |
| **Scope** | Single builder | Entire server (all builders + presenters) |
| **Security** | None (code-level) | RBAC-filtered per session |
| **Output** | `ActionMetadata[]` arrays | Structured `ManifestPayload` JSON |
| **Use cases** | Debugging, test coverage, prompt preview | Admin dashboards, compliance, orchestration |
| **Documentation** | [Introspection](/introspection) | This page |

Both are complementary. Builder introspection is for **developers building tools**. The Dynamic Manifest is for **operators running servers**.
