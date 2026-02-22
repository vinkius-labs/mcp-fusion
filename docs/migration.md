# Migration Guide

Migrate from raw MCP SDK tool handlers to MCP Fusion's grouped, type-safe architecture.

## Why Migrate?

| Raw MCP SDK | MCP Fusion |
|---|---|
| One `server.tool()` call per action | One tool groups all related actions |
| Manual `inputSchema` JSON | Auto-generated from Zod or JSON descriptors |
| Manual description writing | Auto-generated 3-layer descriptions |
| No type-safe context | Generic `TContext` flows through everything |
| No middleware | Pre-compiled middleware chains |
| No validation | Automatic Zod validation + stripping |
| Manual annotation management | Automatic annotation aggregation |

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

## Step 2: Define Your Context

```typescript
interface AppContext {
    userId: string;
    db: PrismaClient;
    session: Session;
}
```

## Step 3: Convert to MCP Fusion

::: code-group
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
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projects, users);

registry.attachToServer(server, {
    contextFactory: async (extra) => ({
        userId: extra.session.userId,
        db: prisma,
        session: extra.session,
    }),
});
```

> **Note:** `contextFactory` supports async functions — perfect for token verification, database session creation, etc.

## Step 5: Update Client Calls

The LLM now sends a single tool call with a discriminator:

```json
// ❌ Before: tool = "list_projects"
{ }

// ✅ After: tool = "projects", action = "list"
{ "action": "list" }

// ✅ After: tool = "projects", action = "delete"
{ "action": "delete", "project_id": "proj_123" }
```

## Step 6: Add Middleware (Optional)

Replace manual auth checks scattered across handlers with centralized middleware:

```typescript
// ❌ Before: repeated in every handler
async function createProject(ctx, args) {
    if (!ctx.session) return error('Unauthorized');
    if (!ctx.session.isAdmin) return error('Forbidden');
    // ...
}

// ✅ After: middleware runs once, before all handlers
const requireAuth: MiddlewareFn<AppContext> = async (ctx, _args, next) => {
    if (!ctx.session) return error('Unauthorized');
    return next();
};

const projects = createTool<AppContext>('projects')
    .use(requireAuth)  // Runs before ALL actions
    .action({ name: 'list', handler: listProjects })
    .action({ name: 'create', handler: createProject });
```

## Migration Checklist

- [ ] Identify tool clusters by domain
- [ ] Define `AppContext` interface
- [ ] Convert individual tools to grouped builders
- [ ] Replace `server.tool()` with `ToolRegistry.attachToServer()`
- [ ] Move repeated auth/validation logic to middleware
- [ ] Add `destructive`, `readOnly`, `idempotent` hints for annotation aggregation
- [ ] Run tests via `.execute()` (no MCP server needed)
- [ ] Verify LLM sees the new discriminator-based tool format

## Key Differences Summary

| Concept | Raw MCP SDK | MCP Fusion |
|---|---|---|
| Tool count | 1 per action | 1 per domain |
| Context | Manual / global | Type-safe `TContext` |
| Validation | Manual JSON Schema | Auto from Zod or `params:` |
| Description | Hand-written | Auto-generated 3-layer |
| Annotations | Manual per-tool | Aggregated from actions |
| Error handling | Ad-hoc | `error()`, `toolError()`, `Result<T>` |
| Middleware | None | Pre-compiled chains |
| Testing | Requires MCP server | Direct `.execute()` |
| Token optimization | Manual | TOON compression built-in |
