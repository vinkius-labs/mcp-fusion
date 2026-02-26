# Migration Guide

If you have an existing MCP server built on the raw SDK, this page walks you through converting it to MCP Fusion — step by step, without breaking your running server.

The typical migration takes 15-30 minutes per tool domain and can be done incrementally: convert one cluster at a time, verify it works, then move to the next.

---

## Migration Checklist {#checklist}

Use this as your tracking list. Each step is detailed below.

- [ ] Identify tool clusters by domain
- [ ] Initialize `const f = initFusion<AppContext>()`
- [ ] Convert individual `server.tool()` calls to `f.tool()` or grouped builders
- [ ] Register in `ToolRegistry` and attach to server
- [ ] Verify — confirm tools are visible and callable
- [ ] Move repeated auth logic to `f.middleware()` (optional)
- [ ] Add `destructive`, `readOnly`, `idempotent` annotations
- [ ] Set up `autoDiscover()` + `createDevServer()` (optional — see [DX Guide](/dx-guide))

---

## Step 1: Identify Tool Clusters {#step-1}

Look at your existing `server.tool()` calls. Most MCP servers end up with 10-30 individual tools that naturally group by domain:

```typescript
// ❌ Before: 6 separate MCP tools, each registered individually
server.tool('list_projects', { ... }, listProjects);
server.tool('create_project', { ... }, createProject);
server.tool('delete_project', { ... }, deleteProject);
server.tool('list_users', { ... }, listUsers);
server.tool('invite_user', { ... }, inviteUser);
server.tool('remove_user', { ... }, removeUser);
```

Group them by domain. Each group becomes either a set of `f.tool()` calls (with dotted names like `projects.list`) or a single grouped tool via `defineTool()` or `createTool()`:

```text
projects → list, create, delete
users    → list, invite, remove
```

---

## Step 2: Initialize Fusion {#step-2}

::: code-group
```typescript [initFusion — Recommended ✨]
import { initFusion } from '@vinkius-core/mcp-fusion';

// Define context ONCE — every f.tool(), f.middleware(), f.presenter() inherits it
interface AppContext {
  userId: string;
  db: PrismaClient;
  session: Session;
}

const f = initFusion<AppContext>();
```
```typescript [Manual Context]
// Classic approach: pass <AppContext> to every builder individually
interface AppContext {
  userId: string;
  db: PrismaClient;
  session: Session;
}
```
:::

---

## Step 3: Convert Tools {#step-3}

::: code-group
```typescript [f.tool() — Recommended ✨]
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
```typescript [defineTool]
import { defineTool, success } from '@vinkius-core/mcp-fusion';

const projects = defineTool<AppContext>('projects', {
  description: 'Manage workspace projects',
  actions: {
    list: {
      readOnly: true,
      handler: async (ctx, _args) => {
        const items = await ctx.db.project.findMany();
        return success(items);
      },
    },
    create: {
      params: { name: { type: 'string', min: 1, max: 100 } },
      handler: async (ctx, args) => {
        const project = await ctx.db.project.create({
          data: { name: args.name, ownerId: ctx.userId },
        });
        return success(project);
      },
    },
    delete: {
      destructive: true,
      params: { project_id: 'string' },
      handler: async (ctx, args) => {
        await ctx.db.project.delete({ where: { id: args.project_id } });
        return success('Deleted');
      },
    },
  },
});
```
```typescript [createTool]
import { createTool, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const projects = createTool<AppContext>('projects')
  .description('Manage workspace projects')
  .action({
    name: 'list',
    readOnly: true,
    handler: async (ctx, _args) => {
      const items = await ctx.db.project.findMany();
      return success(items);
    },
  })
  .action({
    name: 'create',
    schema: z.object({ name: z.string().min(1).max(100) }),
    handler: async (ctx, args) => {
      const project = await ctx.db.project.create({
        data: { name: args.name, ownerId: ctx.userId },
      });
      return success(project);
    },
  })
  .action({
    name: 'delete',
    destructive: true,
    schema: z.object({ project_id: z.string() }),
    handler: async (ctx, args) => {
      await ctx.db.project.delete({ where: { id: args.project_id } });
      return success('Deleted');
    },
  });
```
:::

---

## Step 4: Register and Attach {#step-4}

Register your tools in the `ToolRegistry` and attach to the MCP server. The `contextFactory` runs on every request — resolve auth tokens, create database sessions, or inject tenant info here:

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

---

## Step 5: Verify {#step-5}

The migration isn't done until you confirm the tools are visible and callable. Three ways to verify, from fastest to most thorough:

### Quick Check — Tool Count {#verify-count}

After `registerAll`, check that the registry has the expected number of tools:

```typescript
console.log(`Registered: ${registry.size} tools`);
// → Registered: 3 tools

for (const tool of registry.getAllTools()) {
  console.log(`  ${tool.name} — ${tool.description}`);
}
```

Run your server and confirm the output matches your expectations.

### Smoke Test — Direct `.execute()` {#verify-execute}

Every tool builder has an `.execute()` method that runs the full pipeline (validation → middleware → handler) without starting an MCP server. Use it for a quick smoke test:

```typescript
const result = await listProjects.execute(
  { userId: 'test', db: prisma, session: mockSession }, // context
  {},                                                    // args
);

console.log(result);
// → { content: [{ type: 'text', text: '[{"id":"...","name":"My Project"}]' }] }
```

If validation fails, you'll get a structured error with the field name and constraint. If the handler throws, you'll get the exception immediately — no MCP roundtrip to debug.

### Integration Test — `createFusionTester` {#verify-tester}

For a proper integration test that exercises the full pipeline including Presenters and middleware:

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
console.log(result.uiBlocks);   // UI blocks (if any)
console.log(result.isError);    // false if successful
```

::: tip
`createFusionTester` runs the full pipeline — Zod validation, middleware, handler, Presenter — without an MCP server or transport. If all three tests pass, the migration is complete.
:::

---

## Optional: File Routing, HMR, Middleware {#optional-extras}

These features are covered in detail in their own pages. Here's when to add them:

**File-Based Routing** — When you have more than 5-10 tool files and manual imports become overhead. `autoDiscover()` scans a directory and registers everything automatically. See [DX Guide → autoDiscover()](/dx-guide#file-based-routing-autodiscover).

**HMR Dev Server** — When you're tired of restarting the server on every change. `createDevServer()` watches files and hot-reloads without dropping the MCP connection. See [DX Guide → createDevServer()](/dx-guide#hmr-dev-server-createdevserver).

**Middleware** — When you have repeated auth checks like `if (!ctx.session) return error(...)` across handlers. `f.middleware()` centralizes that logic and derives additional context. See [Middleware Guide](/middleware).

---

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
