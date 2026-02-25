# State & Context

In realistic applications, your tool execution handlers need access to external states: database clients, active HTTP sessions, active user contexts, or logging architectures.

You should not rely on global variables for this. **MCP Fusion** handles this elegantly via typed context injection — define your context type once and it flows through every tool, middleware, and presenter.

## 1. Define Your Context

::: code-group
```typescript [initFusion — Recommended ✨]
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

// Define your context type ONCE — every f.tool(), f.middleware(), f.presenter() inherits it
interface AppContext {
    userId: string;
    db: any; // e.g. PrismaClient, PostgresPool, etc.
}

const f = initFusion<AppContext>();

// Context flows automatically — no generic annotations needed
const tasks = f.tool({
    name: 'tasks.list',
    description: 'List user tasks',
    input: z.object({}),
    handler: async ({ input, ctx }) => {
        // `ctx` is perfectly typed as `AppContext`
        const myTasks = await ctx.db.tasks.findMany({
            where: { ownerId: ctx.userId },
        });
        return myTasks; // auto-wrapped in success()
    },
});
```
```typescript [defineTool]
import { defineTool, success } from '@vinkius-core/mcp-fusion';

interface AppContext {
    userId: string;
    db: any; // e.g. PrismaClient, PostgresPool, etc.
}

const tasks = defineTool<AppContext>('tasks', {
    description: 'Manage tasks',
    actions: {
        list: {
            readOnly: true,
            handler: async (ctx, args) => {
                // `ctx` is perfectly typed as `AppContext`
                const myTasks = await ctx.db.tasks.findMany({ 
                    where: { ownerId: ctx.userId } 
                });
                return success(myTasks);
            },
        },
    },
});
```
```typescript [createTool]
import { createTool, success } from '@vinkius-core/mcp-fusion';

interface AppContext {
    userId: string;
    db: any; // e.g. PrismaClient, PostgresPool, etc.
}

const tasks = createTool<AppContext>('tasks')
    .description('Manage tasks')
    .action({
        name: 'list',
        handler: async (ctx, args) => {
            const myTasks = await ctx.db.tasks.findMany({ 
                where: { ownerId: ctx.userId } 
            });
            return success(myTasks);
        }
    })
```
:::

::: tip Why `initFusion`?
With `initFusion<AppContext>()`, you define the context type **once**. Every `f.tool()`, `f.middleware()`, `f.prompt()`, and `f.presenter()` call inherits the context type automatically — zero generic annotations, zero type drift.
:::

## 2. Supply the Factory Context

When you attach your `ToolRegistry` to the official MCP server, you provide a `contextFactory` callback function. 

This hydration function will be executed **per-request** whenever a tool is invoked by the LLM client, guaranteeing your context is always perfectly fresh.

```typescript
const registry = f.registry(); // or new ToolRegistry<AppContext>()
registry.register(tasks);

// Attach to MCP SDK and supply the resolver
registry.attachToServer(server, {
    contextFactory: (extra) => {
        // `extra` contains native MCP session metadata from the connection transport
        
        return {
            userId: 'usr_12345',         // Assume we calculated this from headers
            db: getDatabaseInstance(),   // Return active db connection
        };
    },
});
```

Because the Context is re-evaluated sequentially upon every invocation, it is perfectly safe to house dynamically renewing variables (such as refreshed oAuth API access tokens mapping to upstream services) safely.
