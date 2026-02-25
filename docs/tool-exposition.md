# Tool Exposition Strategies

How your tools are authored and how they appear on the MCP wire are two separate concerns. **Tool Exposition** decouples them — you build tools once and choose how they're presented to the LLM at attachment time.

---

## Two Strategies for Two Problems

**MCP Fusion** provides two exposition strategies, each optimized for a different class of problem.

### Flat — Precision at the Action Level

Flat exposition expands every action into an **independent MCP tool**. Each tool carries its own name, description, input schema, and [MCP annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations). The LLM sees exactly the fields needed for each operation — nothing more.

**Choose flat when:**
- You have a small-to-medium API surface (under ~15 actions per builder)
- You need per-action privilege isolation (MCP clients can disable individual tools)
- You're targeting weaker LLMs that struggle with enum-based discriminators
- You want fine-grained [State Sync](/state-sync) policies per action
- Your MCP client (Claude Desktop, Cursor) supports per-tool toggles

### Grouped — Density at Scale

Grouped exposition presents all actions behind a **single MCP tool** with a discriminator enum. One schema, one description, one tool in `tools/list`. Shared parameters appear once.

**Choose grouped when:**
- You're exposing a large, cohesive domain (50+ actions behind one tool)
- Token budget is tight — one schema instead of N schemas in the context window
- Shared parameters (`workspace_id`, `session_id`) dominate your API surface
- You're targeting frontier LLMs that handle discriminator enums natively
- Your actions are tightly related and benefit from domain cohesion

---

## Configuration

```typescript
registry.attachToServer(server, {
    toolExposition: 'flat',     // 'flat' (default) or 'grouped'
    actionSeparator: '_',       // flat naming: 'projects_list'
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `toolExposition` | `'flat' \| 'grouped'` | `'flat'` | Strategy for presenting tools on the wire. |
| `actionSeparator` | `string` | `'_'` | Separator for flat tool names: `'_'` → `projects_list`, `'.'` → `projects.list`. |

---

## Flat in Practice

Given this tool definition:

::: code-group
```typescript [f.tool() — Recommended ✨]
const f = initFusion<void>();

const listProjects = f.tool({
    name: 'projects.list',
    input: z.object({ workspace_id: z.string() }),
    handler: async ({ input, ctx }) => listProjects(input),
});
const createProject = f.tool({
    name: 'projects.create',
    input: z.object({ workspace_id: z.string(), name: z.string() }),
    handler: async ({ input, ctx }) => createProj(input),
});
const deleteProject = f.tool({
    name: 'projects.delete',
    input: z.object({ workspace_id: z.string(), id: z.string() }),
    handler: async ({ input, ctx }) => deleteProj(input),
});
```
```typescript [defineTool]
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
```typescript [createTool]
const projects = createTool<void>('projects')
    .description('Manage workspace projects')
    .commonSchema(z.object({ workspace_id: z.string() }))
    .action({ name: 'list', readOnly: true, handler: listProjects })
    .action({ name: 'create', schema: z.object({ name: z.string() }), handler: createProject })
    .action({ name: 'delete', destructive: true, schema: z.object({ id: z.string() }), handler: deleteProject });
```
:::

Flat mode produces **three independent tools** in `tools/list`:

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

// projects_create — workspace_id + name, no 'id' field leaking in
{
  "name": "projects_create",
  "annotations": { "destructiveHint": false },
  "inputSchema": {
    "properties": {
      "workspace_id": { "type": "string" },
      "name": { "type": "string" }
    },
    "required": ["workspace_id", "name"]
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

::: info Why `destructiveHint: false`?
The [MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations) defaults `destructiveHint` to `true` — clients assume any tool is destructive unless told otherwise. Fusion explicitly emits `destructiveHint: false` on non-destructive actions to prevent unnecessary confirmation dialogs in clients like Claude Desktop and Cursor.
:::

**What flat gives you:**
- **Isolated schemas** — the LLM only sees relevant fields per action
- **Per-action annotations** — precise `readOnlyHint` / `destructiveHint` per tool
- **Per-action descriptions** — tagged with `[READ-ONLY]` or `[DESTRUCTIVE]`
- **No discriminator** — the LLM doesn't need to pick an enum value

### O(1) Dispatch

Flat mode doesn't sacrifice performance. At compilation time, Fusion builds a hash map:

```text
"projects_list"   → { builder, actionKey: "list",   discriminator: "action" }
"projects_create" → { builder, actionKey: "create", discriminator: "action" }
"projects_delete" → { builder, actionKey: "delete", discriminator: "action" }
```

When `tools/call` arrives, a single `Map.get(name)` resolves the route. The framework hydrates the discriminator automatically — your handlers don't change.

---

## Grouped in Practice

The same tool definition with `toolExposition: 'grouped'` produces **one tool**:

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

One schema. One description. All shared fields appear once. The LLM selects the action via the discriminator enum.

### Real-World Example: Enterprise SaaS Admin

Where grouped truly shines — a large, cohesive domain with 10+ actions sharing common context:

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
                reset_mfa:  { params: { user_id: 'string' }, handler: resetMfa },
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

registry.attachToServer(server, {
    toolExposition: 'grouped',
});
```

The LLM sees **one tool** with 10 hierarchical actions:

```text
admin
  └── action: users.list | users.invite | users.deactivate | users.reset_mfa
             | billing.current_plan | billing.upgrade | billing.invoices | billing.refund
             | audit.logs | audit.export
```

**~600 tokens.** The same API surface in flat mode would produce 10 independent tools consuming **~2,500+ tokens** in `tools/list`.

The LLM interacts naturally:

```json
{
  "name": "admin",
  "arguments": {
    "workspace_id": "ws_123",
    "admin_token": "tok_abc",
    "action": "users.invite",
    "email": "alice@corp.com",
    "role": "editor"
  }
}
```

---

## How They Interact with Other Features

### State Sync

Policies always use **dot-notation** regardless of exposition strategy. The framework translates automatically:

```typescript
registry.attachToServer(server, {
    toolExposition: 'flat',  // or 'grouped' — policies work the same
    stateSync: {
        policies: [
            { match: 'projects.*', invalidates: ['projects.*'] },
            { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
        ],
    },
});
```

::: tip Canonical Keys
The framework converts flat wire names (e.g. `projects_create`) back to canonical keys (`projects.create`) before policy resolution. Write policies the same way for both strategies.
:::

### Tag Filtering

Tags are resolved from the builder, not individual flat tools:

```typescript
const admin = createTool<void>('admin').tags('internal');
const search = createTool<void>('search').tags('public');

registry.attachToServer(server, {
    toolExposition: 'flat',
    filter: { exclude: ['internal'] },
});
// Only "search_query" appears. All "admin_*" tools are excluded.
```

### Hierarchical Groups

With `.group()` namespaces, flat expansion produces compound keys:

```typescript
const platform = createTool<void>('platform')
    .group('users', g => g.action({ name: 'list', handler: listUsers }))
    .group('billing', g => g.action({ name: 'invoices', handler: getInvoices }));
```

```text
Flat tools: platform_users.list, platform_billing.invoices
```

---

## Switching Strategies

Your handlers never change — only the wire format changes.

```typescript
// Flat (default)
registry.attachToServer(server);

// Grouped
registry.attachToServer(server, { toolExposition: 'grouped' });
```

::: warning Client Impact
When switching strategies, LLM clients see different tool names. In flat mode the client calls `projects_list`; in grouped mode it calls `projects` with `{ action: 'list' }`. Update any hardcoded tool references in client code accordingly.
:::

---

## Decision Guide

| Scenario | Strategy | Why |
|---|---|---|
| Simple CRUD API (3–5 actions) | `'flat'` | Clear single-purpose tools, zero ambiguity |
| Per-action RBAC / privilege isolation | `'flat'` | MCP clients can toggle individual tools |
| Smaller or open-weight models | `'flat'` | Avoids enum disambiguation complexity |
| Fine-grained State Sync invalidation | `'flat'` | Per-action cache policies |
| MCP clients with per-tool UI toggles | `'flat'` | Granular control in Claude Desktop, Cursor |
| Large domain API (20+ actions, shared params) | `'grouped'` | One schema, massive token savings |
| Enterprise platform wrapper (100+ endpoints) | `'grouped'` | Domain cohesion, shared context |
| Token-constrained contexts (small models) | `'grouped'` | Minimal `tools/list` payload |
| Frontier models (GPT, Claude, Gemini series) | Either | Both strategies work well |

---

## API Reference

See [`ToolExposition`](/api-reference#toolexposition) and [`ExpositionConfig`](/api-reference#expositionconfig) for full type reference.
