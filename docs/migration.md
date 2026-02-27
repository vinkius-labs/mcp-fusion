# Migration Guide

Convert an existing raw-SDK MCP server to MCP Fusion incrementally — one domain at a time, without breaking your running server. Typical migration: 15-30 minutes per tool domain.

- [Checklist](#checklist)
- [Step 1 — Identify Tool Clusters](#step-1)
- [Step 2 — Initialize Fusion](#step-2)
- [Step 3 — Convert Tools](#step-3)
- [Step 4 — Register and Attach](#step-4)
- [Step 5 — Verify](#step-5)
- [Key Differences](#key-differences)

## Checklist {#checklist}

- [ ] Identify tool clusters by domain
- [ ] Initialize `const f = initFusion<AppContext>()`
- [ ] Convert `server.tool()` calls to `f.query()`, `f.mutation()`, or `f.action()`
- [ ] Register in `ToolRegistry` and attach to server
- [ ] Verify tools are visible and callable
- [ ] Move repeated auth to `.use()` middleware (optional)
- [ ] Add semantic verbs (`query`, `mutation`, `action`) for MCP annotations
- [ ] Set up `autoDiscover()` + `createDevServer()` (optional — see [DX Guide](/dx-guide))

## Step 1: Identify Tool Clusters {#step-1}

```typescript
// Before: 6 separate MCP tools
server.tool('list_projects', { ... }, listProjects);
server.tool('create_project', { ... }, createProject);
server.tool('delete_project', { ... }, deleteProject);
server.tool('list_users', { ... }, listUsers);
server.tool('invite_user', { ... }, inviteUser);
server.tool('remove_user', { ... }, removeUser);
```

Group by domain — each group becomes individual Fluent API calls with dotted names (`projects.list`, `projects.create`):

```text
projects → list, create, delete
users    → list, invite, remove
```

## Step 2: Initialize Fusion {#step-2}

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  userId: string;
  db: PrismaClient;
  session: Session;
}

const f = initFusion<AppContext>();
```

## Step 3: Convert Tools {#step-3}

Each `server.tool()` maps to a semantic verb — `f.query()` (read-only), `f.mutation()` (destructive), or `f.action()` (neutral):

```typescript
// read-only → f.query()
const listProjects = f.query('projects.list')
  .describe('List workspace projects')
  .handle(async (input, ctx) => {
    return await ctx.db.project.findMany();
  });

// neutral → f.action()
const createProject = f.action('projects.create')
  .describe('Create a project')
  .withString('name', 'Project name (1-100 chars)')
  .handle(async (input, ctx) => {
    return await ctx.db.project.create({
      data: { name: input.name, ownerId: ctx.userId },
    });
  });

// destructive → f.mutation()
const deleteProject = f.mutation('projects.delete')
  .describe('Delete a project')
  .withString('project_id', 'Project ID')
  .handle(async (input, ctx) => {
    await ctx.db.project.delete({ where: { id: input.project_id } });
  });
```

> [!TIP]
> Semantic verbs set MCP annotations automatically — `f.query()` adds `readOnlyHint: true`, `f.mutation()` adds `destructiveHint: true`. No manual annotation required.

For more complex tools, see [Building Tools](/building-tools) which covers all three APIs (`f.query()`, `createTool()`, `defineTool()`).

## Step 4: Register and Attach {#step-4}

```typescript
const registry = f.registry();
registry.registerAll(listProjects, createProject, deleteProject);

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    userId: extra.session.userId,
    db: prisma,
    session: extra.session,
  }),
});
```

`contextFactory` runs on every request — resolve auth, create DB sessions, inject tenant info.

## Step 5: Verify {#step-5}

**Quick check — tool count:**

```typescript
console.log(`Registered: ${registry.size} tools`);
for (const tool of registry.getAllTools()) {
  console.log(`  ${tool.name} — ${tool.description}`);
}
```

**Smoke test — direct `.execute()`:**

```typescript
const result = await listProjects.execute(
  { userId: 'test', db: prisma, session: mockSession },
  {},
);
console.log(result);
```

Runs the full pipeline (validation → middleware → handler) without an MCP server.

**Integration test — `createFusionTester`:**

```typescript
import { createFusionTester } from '@vinkius-core/mcp-fusion/testing';

const tester = createFusionTester(registry, {
  contextFactory: () => ({
    userId: 'test-user',
    db: prisma,
    session: mockSession,
  }),
});

const result = await tester.callAction('projects', 'list');
console.log(result.data);        // parsed response data
console.log(result.systemRules); // Presenter rules (if any)
console.log(result.isError);     // false if successful
```

Runs the full pipeline — Zod validation, middleware, handler, Presenter — without an MCP server or transport.

## Key Differences {#key-differences}

| Concept | Raw MCP SDK | MCP Fusion |
|---|---|---|
| Tool count | 1 per action | 1 per domain, or individual `f.query()` / `f.mutation()` |
| Context | Manual / global | `initFusion<T>()` — type once |
| Validation | Manual JSON Schema | Auto from Zod, JSON descriptors, or Standard Schema |
| Description | Hand-written | Auto-generated 3-layer |
| Annotations | Manual per-tool | `f.query()` = readOnly, `f.mutation()` = destructive |
| Error handling | Ad-hoc | `f.error()`, `Result<T>` |
| Middleware | None | `.use()` + pre-compiled chains |
| Testing | Requires MCP server | Direct `.execute()` or `createFusionTester` |
| File routing | None | `autoDiscover()` |
| Hot-reload | Restart entire server | `createDevServer()` HMR |