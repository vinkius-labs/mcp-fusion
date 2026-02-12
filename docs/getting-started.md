# Getting Started

This guide takes you from zero to a production-ready MCP server with grouped tools. Every example is a complete, runnable snippet.

---

## Installation

```bash
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```

Optional, for TOON token optimization:

```bash
npm install @toon-format/toon
```

---

## Your First Grouped Tool

A grouped tool consolidates multiple operations — list, create, update, delete — behind a single tool name with a discriminator field (`action`).

```typescript
import { GroupedToolBuilder, ToolRegistry, success, error } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 1. Define a builder with actions
const tasks = new GroupedToolBuilder<void>('tasks')
    .description('Task management operations')
    .action({
        name: 'list',
        description: 'List all tasks',
        readOnly: true,
        handler: async (_ctx, _args) => {
            const tasks = [
                { id: '1', title: 'Review PR', status: 'open' },
                { id: '2', title: 'Deploy v2', status: 'done' },
            ];
            return success(tasks);
        },
    })
    .action({
        name: 'create',
        description: 'Create a new task',
        schema: z.object({
            title: z.string().describe('Task title'),
            assignee: z.string().optional().describe('Person responsible'),
        }),
        handler: async (_ctx, args) => {
            // args is typed: { title: string, assignee?: string }
            return success({ id: '3', title: args.title, assignee: args.assignee, status: 'open' });
        },
    })
    .action({
        name: 'delete',
        description: 'Delete a task permanently',
        destructive: true,
        schema: z.object({
            task_id: z.string().describe('Task ID to delete'),
        }),
        handler: async (_ctx, args) => {
            return success(`Task ${args.task_id} deleted`);
        },
    });

// 2. Register and attach
const registry = new ToolRegistry<void>();
registry.register(tasks);

const server = new Server({ name: 'task-server', version: '1.0.0' }, { capabilities: { tools: {} } });
registry.attachToServer(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**What the LLM sees in `tools/list`:**

The framework auto-generates a 3-layer description:

```
Task management operations. Actions: list, create, delete

Workflow:
- 'list': List all tasks
- 'create': Create a new task. Requires: title
- 'delete': Delete a task permanently. Requires: task_id ⚠️ DESTRUCTIVE
```

And a unified schema with per-field annotations:

```json
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "enum": ["list", "create", "delete"] },
    "title": { "type": "string", "description": "Task title. Required for: create" },
    "assignee": { "type": "string", "description": "Person responsible. For: create" },
    "task_id": { "type": "string", "description": "Task ID to delete. Required for: delete" }
  },
  "required": ["action"]
}
```

The LLM knows exactly which fields to send for each action — no guessing, no hallucinated parameters.

---

## Adding Context

Most real applications need per-request state: database connections, authenticated users, session info. The context type is declared as a generic parameter.

```typescript
interface AppContext {
    userId: string;
    db: DatabaseClient;
}

const tasks = new GroupedToolBuilder<AppContext>('tasks')
    .description('Task management')
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx, _args) => {
            const tasks = await ctx.db.tasks.findMany({
                where: { ownerId: ctx.userId },
            });
            return success(tasks);
        },
    })
    .action({
        name: 'create',
        schema: z.object({ title: z.string() }),
        handler: async (ctx, args) => {
            const task = await ctx.db.tasks.create({
                data: { title: args.title, ownerId: ctx.userId },
            });
            return success(task);
        },
    });

// The context is created per-request via contextFactory
const registry = new ToolRegistry<AppContext>();
registry.register(tasks);

registry.attachToServer(server, {
    contextFactory: (extra) => {
        // `extra` is the MCP session info passed by the SDK
        const session = extra as { sessionId: string };
        return {
            userId: resolveUserId(session),
            db: getDatabaseClient(),
        };
    },
});
```

---

## Common Schema — Shared Fields Across All Actions

When all actions in a tool share parameters (like `workspace_id` in a multi-tenant SaaS), use `commonSchema()`:

```typescript
const projects = new GroupedToolBuilder<AppContext>('projects')
    .description('Project management')
    .commonSchema(z.object({
        workspace_id: z.string().describe('Workspace identifier'),
    }))
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx, args) => {
            // args.workspace_id is typed — comes from commonSchema
            const projects = await ctx.db.projects.findMany({
                where: { workspaceId: args.workspace_id },
            });
            return success(projects);
        },
    })
    .action({
        name: 'create',
        schema: z.object({
            name: z.string(),
            template: z.enum(['blank', 'kanban', 'scrum']).optional(),
        }),
        handler: async (ctx, args) => {
            // args is typed: { workspace_id: string, name: string, template?: 'blank' | 'kanban' | 'scrum' }
            const project = await ctx.db.projects.create({
                data: {
                    workspaceId: args.workspace_id,
                    name: args.name,
                    template: args.template ?? 'blank',
                },
            });
            return success(project);
        },
    });
```

**How type propagation works under the hood:**

When you call `.commonSchema(schema)`, the return type narrows from `GroupedToolBuilder<TContext, Record<string, never>>` to `GroupedToolBuilder<TContext, TSchema["_output"]>`. Every subsequent handler's `args` parameter is typed as `TSchema["_output"] & TCommon` — fully inferred, no type assertions needed.

The generated schema annotates `workspace_id` as `(always required)` because it's in the common schema and required.

At validation time, the framework uses Zod's `.merge()` to compose `commonSchema` + `action.schema` into a single validation schema, then calls `.strip()` to remove unknown fields. The handler receives exactly the shape it declared — nothing more.

---

## Hierarchical Groups — Namespacing for Large APIs

When your API surface grows beyond flat actions, use `.group()` to organize actions into namespaces with `module.action` compound keys:

```typescript
const platform = new GroupedToolBuilder<AppContext>('platform')
    .description('Full platform management API')
    .commonSchema(z.object({
        workspace_id: z.string().describe('Target workspace'),
    }))
    .group('users', 'User management', g => {
        g.action({
            name: 'list',
            readOnly: true,
            schema: z.object({ role: z.enum(['admin', 'member', 'viewer']).optional() }),
            handler: async (ctx, args) => {
                const users = await ctx.db.users.findMany({
                    where: { workspaceId: args.workspace_id, role: args.role },
                });
                return success(users);
            },
        })
        .action({
            name: 'invite',
            schema: z.object({
                email: z.string().email(),
                role: z.enum(['admin', 'member', 'viewer']),
            }),
            handler: async (ctx, args) => {
                const invitation = await ctx.db.invitations.create({
                    data: { workspaceId: args.workspace_id, email: args.email, role: args.role },
                });
                return success(invitation);
            },
        })
        .action({
            name: 'remove',
            destructive: true,
            schema: z.object({ user_id: z.string() }),
            handler: async (ctx, args) => {
                await ctx.db.users.delete({ where: { id: args.user_id, workspaceId: args.workspace_id } });
                return success('User removed');
            },
        });
    })
    .group('projects', 'Project operations', g => {
        g.action({
            name: 'list',
            readOnly: true,
            handler: async (ctx, args) => {
                const projects = await ctx.db.projects.findMany({ where: { workspaceId: args.workspace_id } });
                return success(projects);
            },
        })
        .action({
            name: 'archive',
            schema: z.object({ project_id: z.string() }),
            handler: async (ctx, args) => {
                await ctx.db.projects.update({ where: { id: args.project_id }, data: { archived: true } });
                return success('Project archived');
            },
        });
    });
```

The discriminator enum becomes:

```
users.list | users.invite | users.remove | projects.list | projects.archive
```

And the description auto-generates module headers:

```
Full platform management API. Modules: users (list,invite,remove) | projects (list,archive)
```

**Important:** `.action()` and `.group()` are mutually exclusive on the same builder. Use flat actions for simple tools, groups for large API surfaces. The framework enforces this with clear error messages.

---

## Response Helpers

The framework provides four response builders:

```typescript
import { success, error, required, toonSuccess } from '@vinkius-core/mcp-fusion';

// success() — auto-detects string vs object
return success('Task created');                // Text response
return success({ id: '1', title: 'My task' }); // JSON.stringify(data, null, 2)

// error() — marks isError: true
return error('Task not found');

// required() — shorthand for missing field validation
return required('project_id');  // → "Error: project_id required"

// toonSuccess() — TOON-encoded for token optimization
const users = await db.users.findMany();
return toonSuccess(users);                         // Pipe-delimited TOON
return toonSuccess(users, { delimiter: ',' });     // Custom delimiter
```

---

## TOON Descriptions — Token-Optimized Tool Metadata

For LLM providers where every token in `tools/list` counts, enable TOON descriptions:

```typescript
const tasks = new GroupedToolBuilder<void>('tasks')
    .description('Task management')
    .toonDescription()   // ← Enable TOON mode
    .action({ name: 'list', readOnly: true, handler: listHandler })
    .action({ name: 'create', schema: createSchema, handler: createHandler })
    .action({ name: 'delete', destructive: true, schema: deleteSchema, handler: deleteHandler });
```

Instead of markdown, the description uses TOON pipe-delimited tabular format:

```
Task management

action|desc|required|destructive
list|List all tasks||
create|Create a new task|title|
delete|Delete a task|task_id|true
```

The `ToonDescriptionGenerator` uses `@toon-format/toon` `encode()` to serialize action metadata. Column names appear once as a header — no repetition per row.

---

## Tag Filtering — Selective Tool Exposure

Use tags to control which tools are visible to the LLM:

```typescript
const publicTool = new GroupedToolBuilder<void>('search')
    .tags('public', 'read-only')
    .action({ name: 'query', readOnly: true, handler: searchHandler });

const adminTool = new GroupedToolBuilder<void>('admin')
    .tags('admin', 'internal')
    .action({ name: 'reset', destructive: true, handler: resetHandler });

const registry = new ToolRegistry<void>();
registry.registerAll(publicTool, adminTool);

// Only expose public tools
registry.attachToServer(server, {
    filter: { tags: ['public'] },
});

// Expose everything except internal tools
registry.attachToServer(server, {
    filter: { exclude: ['internal'] },
});
```

Tag filtering supports both include (`tags`) and exclude filters. Include requires ALL specified tags. Exclude rejects ANY matching tag.

---

## Next Steps

- [Architecture](architecture.md) — How the domain model, strategy engine, and build-time compilation work together
- [Middleware](middleware.md) — Global, group-scoped, and per-action middleware with real patterns
- [API Reference](api-reference.md) — Every public class, method, and type
- [Introspection](introspection.md) — Runtime metadata for compliance, dashboards, and audit
