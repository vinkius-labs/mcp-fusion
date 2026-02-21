# Building Tools

In MCP Fusion, tools are not created as flat objects. They are created using the `createTool` factory function. This provides a unified interface for composing descriptions, Zod schemas, and execution handlers.

## The Builder Pattern

To define a set of operations, you start by invoking `createTool`. 

```typescript
import { createTool, success } from '@vinkius-core/mcp-fusion';

const tasks = createTool<void>('tasks')
    .description('Manage tasks across the system')
```

- `'tasks'` is the **target name** the LLM will see when exploring available tools.
- `<void>` specifies the **Context Type**. We use `void` here because we aren't injecting external state (like a database) yet. We will cover this in the [Context](/context) guide.

## Adding Actions

You add endpoints to your tool by chaining the `.action()` method. An action represents a specific capability the AI can execute.

```typescript
    .action({
        name: 'list',
        description: 'List all available tasks',
        readOnly: true, // Tells the LLM this is safe, it won't break anything
        handler: async (ctx, args) => {
            return success([ { id: 1, name: 'Setup repo' } ]);
        }
    })
```

An action requires at bare minimum a `name` and a `handler`. Here, we also defined `readOnly: true` which is a helpful hint to the AI that running this is natively safe.

## Using Zod for Inputs

When an AI wants to "create" a task, it needs to know *what fields* to provide. In standard MCP, you have to write native JSON Schema (which is bulky and hard for humans to type). 

In MCP Fusion, you just write [Zod](https://zod.dev/).

```typescript
import { z } from 'zod';

    .action({
        name: 'create',
        description: 'Creates a new task',
        schema: z.object({
            title: z.string().describe('The name of the task to create'),
            priority: z.enum(['low', 'high']).optional(),
        }),
        handler: async (ctx, args) => {
            // TypeScript automatically understands args!
            // args: { title: string, priority?: 'low' | 'high' }
            
            console.log(`Creating task: ${args.title}`);
            return success({ status: 'created', title: args.title });
        }
    })
```

### Why Zod is Powerful Here:
1. **Descriptions are auto-mapped:** Providing `.describe('...')` on your Zod string passes that exact description clearly to the AI model so it understands what the payload means.
2. **Infinite Runtime Safety:** If the Model guesses an incorrect input (e.g., trying to pass `priority: "ultra"`), Fusion's `.strip()` engine bounces the execution automatically and returns a helpful error directly back to the AI. Your handler code (`console.log`) **never fires** with bad data.
3. **TypeScript Inference:** You never have to manually cast outputs or write secondary TypeScript interfaces.

## Destructive Actions

When dealing with operations that permanently delete or mutate data, it is a great practice to inform the AI model clearly.

```typescript
    .action({
        name: 'delete',
        destructive: true, // <--- Add this!
        schema: z.object({
            taskId: z.number(),
        }),
        handler: async (ctx, args) => {
            return success(`Task ${args.taskId} deleted.`);
        }
    });
```

Setting `destructive: true` accomplishes two things:
1. In the backend, the framework marks the entire tool definition with flags warning connected systems that mutation is occurring.
2. The `DescriptionGenerator` literally appends a `[DESTRUCTIVE]` flat text flag to the workflow description sent to the AI. Prompt-engineering proves this organically triggers safety and confirmation behaviors in leading LLM models before they decide to invoke it.
