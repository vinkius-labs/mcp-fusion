# State & Context

In realistic applications, your tool execution handlers need access to external states: database clients, active HTTP sessions, active user contexts, or logging architectures.

You should not rely on global variables for this. MCP Fusion handles this elegantly via a generic `TContext` typing injection constraint.

## 1. Type your Context Context

When constructing your tool, pass an Interface representing your required state into the generic bracket `<TContext>`.

::: code-group
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

// Define your application's state requirements
interface AppContext {
    userId: string;
    db: any; // e.g. PrismaClient, PostgresPool, etc.
}

// Inject it into the generic constraint
const tasks = createTool<AppContext>('tasks')
    .description('Manage tasks')
    .action({
        name: 'list',
        handler: async (ctx, args) => {
            // `ctx` is perfectly typed as `AppContext` natively.
            const myTasks = await ctx.db.tasks.findMany({ 
                where: { ownerId: ctx.userId } 
            });
            return success(myTasks);
        }
    })
```
:::

## 2. Supply the Factory Context

When you attach your `ToolRegistry` to the official MCP server, you provide a `contextFactory` callback function. 

This hydration function will be executed **per-request** whenever a tool is invoked by the LLM client, guaranteeing your context is always perfectly fresh.

```typescript
const registry = new ToolRegistry<AppContext>();
registry.register(tasks); // From step 1

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
