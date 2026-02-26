# Tool Exposition Strategies

How you author tools and how the agent discovers them are two separate concerns. You might define three actions — `list`, `create`, `delete` — inside one `projects` builder. But should the agent see one tool with a discriminator, or three independent tools? The answer depends on your API surface size, model capability, and privilege model.

Tool Exposition decouples authoring from presentation. You build tools once, and choose how they appear on the MCP wire at attachment time.

---

## Flat — One Tool per Action {#flat}

Flat exposition (the default) expands every action into an independent MCP tool. Each tool carries its own name, description, input schema, and [MCP annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations).

Given this tool definition:

```typescript
const projects = defineTool<void>('projects', {
  description: 'Manage workspace projects',
  shared: { workspace_id: 'string' },
  actions: {
    list:   { readOnly: true, handler: listProjects },
    create: { params: { name: 'string' }, handler: createProject },
    delete: { destructive: true, params: { id: 'string' }, handler: deleteProject },
  },
});
```

Flat mode produces three independent entries in `tools/list`:

```jsonc
// projects_list — only the fields relevant to listing
{
  "name": "projects_list",
  "description": "[READ-ONLY] List projects (projects → list)",
  "annotations": { "readOnlyHint": true, "destructiveHint": false },
  "inputSchema": {
    "properties": { "workspace_id": { "type": "string" } },
    "required": ["workspace_id"]
  }
}

// projects_delete — explicit destructive signal
{
  "name": "projects_delete",
  "description": "[DESTRUCTIVE] Delete project (projects → delete)",
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

Each action gets its own schema — the agent sees only the fields relevant to that operation. `projects_list` doesn't include the `id` field because listing doesn't need it. `projects_delete` carries `destructiveHint: true`, so MCP clients like Claude Desktop show a confirmation dialog. `projects_list` carries `readOnlyHint: true`, so agents know it's safe to call without asking.

::: info Why `destructiveHint: false`?
The MCP spec defaults `destructiveHint` to `true` — clients assume any tool is destructive unless told otherwise. MCP Fusion explicitly emits `destructiveHint: false` on non-destructive actions to prevent unnecessary confirmation dialogs.
:::

### Performance — O(1) Dispatch {#dispatch}

Flat mode doesn't sacrifice performance. At build time, MCP Fusion constructs a hash map:

```text
"projects_list"   → { builder, actionKey: "list" }
"projects_create" → { builder, actionKey: "create" }
"projects_delete" → { builder, actionKey: "delete" }
```

When `tools/call` arrives, a single `Map.get(name)` resolves the route and hydrates the discriminator automatically. Your handlers don't change — the framework translates between wire names and internal action keys.

---

## Grouped — One Tool, Many Actions {#grouped}

Grouped exposition presents all actions behind a single MCP tool with a discriminator enum. One schema, one description, one entry in `tools/list`:

```typescript
registry.attachToServer(server, {
  toolExposition: 'grouped',
});
```

The same `projects` definition now produces one tool:

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

Shared fields appear once instead of once per action. For large API surfaces — 20+ actions sharing `workspace_id`, `session_id`, and `admin_token` — this is significantly more token-efficient. The trade-off: the agent sees all fields from all actions in one schema, even when only some are relevant to the chosen action.

### When Grouped Shines {#grouped-example}

A SaaS admin panel with 10 hierarchical actions sharing common context:

```typescript
const admin = defineTool<AdminContext>('admin', {
  description: 'SaaS administration panel',
  shared: { workspace_id: 'string', admin_token: 'string' },
  groups: {
    users: {
      description: 'User lifecycle management',
      actions: {
        list:       { readOnly: true, handler: listUsers },
        invite:     { params: { email: 'string', role: 'string' }, handler: inviteUser },
        deactivate: { destructive: true, params: { user_id: 'string' }, handler: deactivateUser },
      },
    },
    billing: {
      description: 'Billing and subscription management',
      actions: {
        current_plan: { readOnly: true, handler: getCurrentPlan },
        upgrade:      { params: { plan: 'string' }, handler: upgradePlan },
        invoices:     { readOnly: true, handler: listInvoices },
        refund:       { destructive: true, params: { invoice_id: 'string' }, handler: issueRefund },
      },
    },
    audit: {
      description: 'Compliance and audit trail',
      actions: {
        logs:   { readOnly: true, handler: getAuditLogs },
        export: { readOnly: true, params: { range: 'string' }, handler: exportLogs },
      },
    },
  },
});
```

The agent sees one tool named `admin` with 10 hierarchical actions. `workspace_id` and `admin_token` appear once, not 10 times. The discriminator enum is `users.list | users.invite | ... | audit.export`.

---

## Configuration {#config}

```typescript
registry.attachToServer(server, {
  toolExposition: 'flat',     // 'flat' (default) or 'grouped'
  actionSeparator: '_',       // flat naming: 'projects_list'
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `toolExposition` | `'flat' \| 'grouped'` | `'flat'` | Strategy for presenting tools on the wire |
| `actionSeparator` | `string` | `'_'` | Separator for flat tool names: `'_'` → `projects_list`, `'.'` → `projects.list` |

Switching strategies never changes your handlers — only the wire format changes. When you switch from flat to grouped (or back), update any hardcoded tool names in client code.

---

## Interaction with Other Features {#interactions}

### State Sync {#state-sync}

Invalidation policies always use dot-notation, regardless of exposition strategy. The framework translates flat wire names (e.g., `projects_create`) back to canonical keys (`projects.create`) before policy resolution:

```typescript
registry.attachToServer(server, {
  toolExposition: 'flat',
  stateSync: {
    policies: [
      { match: 'projects.*', invalidates: ['projects.*'] },
      { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
    ],
  },
});
```

Write policies once — they work identically for both strategies.

### Tag Filtering {#tag-filtering}

Tags are resolved from the builder, not from individual flat tools:

```typescript
const admin = createTool<void>('admin').tags('internal');
const search = createTool<void>('search').tags('public');

registry.attachToServer(server, {
  toolExposition: 'flat',
  filter: { exclude: ['internal'] },
});
// Only "search_query" appears in tools/list. All "admin_*" tools are excluded.
```

---

## Decision Guide {#decision-guide}

| Scenario | Strategy | Why |
|---|---|---|
| Simple CRUD API (3–5 actions) | `flat` | Clear single-purpose tools, zero ambiguity |
| Per-action RBAC / privilege isolation | `flat` | MCP clients can toggle individual tools |
| Smaller or open-weight models | `flat` | Avoids enum disambiguation complexity |
| Large domain API (20+ actions, shared params) | `grouped` | One schema, significant token savings |
| Enterprise platform wrapper (100+ endpoints) | `grouped` | Domain cohesion, shared context |
| Token-constrained contexts | `grouped` | Minimal `tools/list` payload |
| Frontier models (GPT-4, Claude, Gemini) | Either | Both strategies work well |

---

## Where to Go Next {#next-steps}

- [Building Tools](/building-tools) — `f.tool()`, `defineTool()`, `createTool()`, `createGroup()`
- [Routing & Namespaces](/routing) — file-based routing, discriminators, hierarchical groups
- [State Sync](/state-sync) — cache invalidation policies that work with both strategies
