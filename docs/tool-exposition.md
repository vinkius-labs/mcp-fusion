# Tool Exposition Strategies

You might define three actions — `list`, `create`, `delete` — inside one `projects` builder. Should the agent see one tool with a discriminator, or three independent tools? Tool Exposition decouples authoring from wire presentation.

## Flat — One Tool per Action {#flat}

The default. Every action becomes an independent MCP tool with its own name, schema, and annotations:

```typescript
const listProjects = f.query('projects.list')
  .input({ workspace_id: f.string() })
  .resolve(async ({ input, ctx }) => { /* ... */ });

const createProject = f.action('projects.create')
  .input({ workspace_id: f.string(), name: f.string() })
  .resolve(async ({ input, ctx }) => { /* ... */ });

const deleteProject = f.mutation('projects.delete')
  .input({ workspace_id: f.string(), id: f.string() })
  .resolve(async ({ input, ctx }) => { /* ... */ });
```

Produces three entries in `tools/list`:

```jsonc
// projects_list — only listing fields
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

Each action gets its own schema — `projects_list` doesn't include `id`. Fusion explicitly emits `destructiveHint: false` on non-destructive actions to prevent unnecessary confirmation dialogs (the MCP spec defaults it to `true`).

### O(1) Dispatch {#dispatch}

At build time, a hash map is constructed: `"projects_list" → { builder, actionKey: "list" }`. Routing is a single `Map.get(name)`. Handlers don't change.

## Grouped — One Tool, Many Actions {#grouped}

All actions behind a single MCP tool with a discriminator enum:

```typescript
registry.attachToServer(server, {
  toolExposition: 'grouped',
});
```

Same definition, one tool:

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

### When Grouped Shines {#grouped-example}

```typescript
const admin = createTool('admin')
  .description('SaaS administration panel')
  .group('users', 'User lifecycle management', (g) => g
    .query('list', listUsers)
    .action('invite', inviteUser)
    .mutation('deactivate', deactivateUser)
  )
  .group('billing', 'Billing and subscription management', (g) => g
    .query('current_plan', getCurrentPlan)
    .action('upgrade', upgradePlan)
    .query('invoices', listInvoices)
    .mutation('refund', issueRefund)
  )
  .group('audit', 'Compliance and audit trail', (g) => g
    .query('logs', getAuditLogs)
    .query('export', exportLogs)
  );
```

One tool, 10 actions, `workspace_id` and `admin_token` appear once.

## Configuration {#config}

```typescript
registry.attachToServer(server, {
  toolExposition: 'flat',     // 'flat' (default) or 'grouped'
  actionSeparator: '_',       // flat naming: 'projects_list'
});
```

Switching strategies never changes your handlers — only the wire format.

## Interaction with Other Features {#interactions}

**State Sync** — invalidation policies use dot-notation regardless of exposition strategy. The framework translates flat wire names back to canonical keys before policy resolution:

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

**Tag Filtering** — tags are resolved from the builder, not individual flat tools:

```typescript
const admin = f.query('admin.list')
  .tags('internal')
  .resolve(async ({ ctx }) => { /* ... */ });

const search = f.query('search.find')
  .tags('public')
  .resolve(async ({ ctx }) => { /* ... */ });

registry.attachToServer(server, {
  toolExposition: 'flat',
  filter: { exclude: ['internal'] },
});
```

## Decision Guide {#decision-guide}

| Scenario | Strategy | Why |
|---|---|---|
| Simple CRUD (3–5 actions) | `flat` | Clear single-purpose tools |
| Per-action RBAC | `flat` | Clients can toggle individual tools |
| Smaller models | `flat` | Avoids enum disambiguation |
| Large domain (20+ actions, shared params) | `grouped` | Token savings |
| Enterprise platform (100+ endpoints) | `grouped` | Domain cohesion |
| Frontier models (GPT-4, Claude, Gemini) | Either | Both work well |
