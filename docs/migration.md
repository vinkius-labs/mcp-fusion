# Migration Guide

Convert an existing raw-SDK MCP server to MCP Fusion incrementally — one domain at a time, without breaking your running server. Typical migration: 15-30 minutes per tool domain.

## Checklist {#checklist}

- [ ] Identify tool clusters by domain
- [ ] Initialize `const f = initFusion<AppContext>()`
- [ ] Convert `server.tool()` calls to `f.tool()` or grouped builders
- [ ] Register in `ToolRegistry` and attach to server
- [ ] Verify tools are visible and callable
- [ ] Move repeated auth to `f.middleware()` (optional)
- [ ] Add `destructive`, `readOnly`, `idempotent` annotations
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

Group by domain — each group becomes `f.tool()` calls with dotted names (`projects.list`) or a single grouped tool via `defineTool()` / `createTool()`:

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

**Using `f.tool()` (recommended):**

```typescript
import { z } from 'zod';

const listProjects = f.tool({
  name: 'projects.list',
  description: 'List workspace projects',
  input: z.object({}),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return await ctx.db.project.findMany();
  },
});

const createProject = f.tool({
  name: 'projects.create',
  description: 'Create a project',
  input: z.object({ name: z.string().min(1).max(100) }),
  handler: async ({ input, ctx }) => {
    return await ctx.db.project.create({
      data: { name: input.name, ownerId: ctx.userId },
    });
  },
});

const deleteProject = f.tool({
  name: 'projects.delete',
  description: 'Delete a project',
  input: z.object({ project_id: z.string() }),
  destructive: true,
  handler: async ({ input, ctx }) => {
    await ctx.db.project.delete({ where: { id: input.project_id } });
    return 'Deleted';
  },
});
```

`defineTool()` and `createTool()` also work — see [Building Tools](/building-tools) for all three APIs.

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
| Tool count | 1 per action | 1 per domain, or individual `f.tool()` |
| Context | Manual / global | `initFusion<T>()` — type once |
| Validation | Manual JSON Schema | Auto from Zod, JSON descriptors, or Standard Schema |
| Description | Hand-written | Auto-generated 3-layer |
| Annotations | Manual per-tool | Aggregated from actions |
| Error handling | Ad-hoc | `toolError()`, `Result<T>` |
| Middleware | None | `f.middleware()` + pre-compiled chains |
| Testing | Requires MCP server | Direct `.execute()` or `createFusionTester` |
| File routing | None | `autoDiscover()` |
| Hot-reload | Restart entire server | `createDevServer()` HMR |
