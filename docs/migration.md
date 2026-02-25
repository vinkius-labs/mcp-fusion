# Migration Guide

Migrate from raw MCP SDK tool handlers to MCP Fusion's grouped, type-safe architecture.

## Why Migrate?

| Raw MCP SDK | **MCP Fusion** |
|---|---|
| One `server.tool()` call per action | One tool groups all related actions |
| Manual `inputSchema` JSON | Auto-generated from Zod or Standard Schema |
| Manual description writing | Auto-generated 3-layer descriptions |
| No type-safe context | `initFusion<T>()` — define once, flows everywhere |
| No middleware | Pre-compiled middleware chains |
| No validation | Automatic Zod validation + `.strict()` rejection |
| Manual annotation management | Automatic annotation aggregation |
| No hot-reload | HMR Dev Server with `createDevServer()` |
| No file-based routing | `autoDiscover()` scans directories |

## Step 1: Identify Tool Clusters

In the raw MCP SDK, you likely have many individual tools:

```typescript
// ❌ Before: 6 separate MCP tools
server.tool('list_projects', { ... }, listProjects);
server.tool('create_project', { ... }, createProject);
server.tool('delete_project', { ... }, deleteProject);
server.tool('list_users', { ... }, listUsers);
server.tool('invite_user', { ... }, inviteUser);
server.tool('remove_user', { ... }, removeUser);
```

Group them by domain:

```
projects → list, create, delete
users    → list, invite, remove
```

## Step 2: Initialize Fusion

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

## Step 3: Convert to **MCP Fusion**

::: code-group
```typescript [f.tool() — Recommended ✨]
import { z } from 'zod';

// ✅ After: concise, zero generics, auto success() wrapping
const listProjects = f.tool({
    name: 'projects.list',
    description: 'List workspace projects',
    input: z.object({}),
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
    handler: async ({ input, ctx }) => {
        await ctx.db.project.delete({ where: { id: input.project_id } });
        return 'Deleted';
    },
});
```
```typescript [defineTool]
import { defineTool, success, error } from '@vinkius-core/mcp-fusion';

// ✅ After: 1 grouped tool with 3 actions
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
                await ctx.db.project.delete({
                    where: { id: args.project_id },
                });
                return success('Deleted');
            },
        },
    },
});
```
```typescript [createTool]
import { createTool, success, error } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// ✅ After: 1 grouped tool with 3 actions
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
            await ctx.db.project.delete({
                where: { id: args.project_id },
            });
            return success('Deleted');
        },
    });
```
:::

## Step 4: Register and Attach

```typescript
const registry = f.registry(); // or new ToolRegistry<AppContext>()
registry.registerAll(listProjects, createProject, deleteProject);

registry.attachToServer(server, {
    contextFactory: async (extra) => ({
        userId: extra.session.userId,
        db: prisma,
        session: extra.session,
    }),
});
```

> **Note:** `contextFactory` supports async functions — perfect for token verification, database session creation, etc.

## Step 5 (Optional): File-Based Routing <Badge type="tip" text="NEW v2.7" />

Instead of manual registration, use `autoDiscover()` to scan a directory and auto-register tools:

```typescript
import { autoDiscover } from '@vinkius-core/mcp-fusion';

// Convention: src/tools/projects/list.ts → tool name "projects.list"
await autoDiscover(registry, './src/tools');
```

## Step 6: HMR Dev Server <Badge type="tip" text="NEW v2.7" />

Enable hot-reload development — change a tool file and see it reload instantly, no server restart needed:

```typescript
import { createDevServer } from '@vinkius-core/mcp-fusion/dev';

const devServer = createDevServer({
    dir: './src/tools',
    setup: async (reg) => await autoDiscover(reg, './src/tools'),
    server: mcpServer,
});
await devServer.start(); // Watches files, hot-reloads on change
```

## Step 7: Add Middleware (Optional)

Replace manual auth checks scattered across handlers with centralized middleware:

::: code-group
```typescript [f.middleware() — Recommended ✨]
const requireAuth = f.middleware(async (ctx) => {
    if (!ctx.session) throw new Error('Unauthorized');
    return { role: ctx.session.role }; // Derived context
});
```
```typescript [Classic]
const requireAuth: MiddlewareFn<AppContext> = async (ctx, _args, next) => {
    if (!ctx.session) return error('Unauthorized');
    return next();
};

const projects = createTool<AppContext>('projects')
    .use(requireAuth)  // Runs before ALL actions
    .action({ name: 'list', handler: listProjects })
    .action({ name: 'create', handler: createProject });
```
:::

## Migration Checklist

- [ ] Identify tool clusters by domain
- [ ] Initialize `const f = initFusion<AppContext>()` (or define `AppContext` interface)
- [ ] Convert individual tools to `f.tool()` or grouped builders
- [ ] Replace `server.tool()` with `ToolRegistry.attachToServer()`
- [ ] Move repeated auth/validation logic to `f.middleware()`
- [ ] Add `destructive`, `readOnly`, `idempotent` hints for annotation aggregation
- [ ] Set up `autoDiscover()` for file-based routing (optional)
- [ ] Add `createDevServer()` for HMR development (optional)
- [ ] Run tests via `.execute()` (no MCP server needed)
- [ ] Verify LLM sees the new discriminator-based tool format

## Key Differences Summary

| Concept | Raw MCP SDK | **MCP Fusion** |
|---|---|---|
| Tool count | 1 per action | 1 per domain |
| Context | Manual / global | `initFusion<T>()` — type once |
| Validation | Manual JSON Schema | Auto from Zod or Standard Schema |
| Description | Hand-written | Auto-generated 3-layer |
| Annotations | Manual per-tool | Aggregated from actions |
| Error handling | Ad-hoc | `error()`, `toolError()`, `Result<T>` |
| Middleware | None | `f.middleware()` + pre-compiled chains |
| Testing | Requires MCP server | Direct `.execute()` |
| Token optimization | Manual | TOON compression built-in |
| File routing | None | `autoDiscover()` |
| Hot-reload | Restart entire server | `createDevServer()` HMR |
