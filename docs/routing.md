# Namespaces & Routing (Scaling)

As your application grows, you will inevitably have dozens or hundreds of API routes you want to expose to your AI. 

If you expose 100 individual flat tools to an LLM, two negative things happen:
1. **Context Bloat:** You eat thousands of tokens of context space just sending instructions about the tools.
2. **Semantic Hallucination:** The AI gets confused between `user_preferences_update` and `system_preferences_update`.

**MCP Fusion** solves this through **Grouped Routing** and **Discriminators**.

---

## 1. What is a Discriminator?

If you followed the [Building Tools](/building-tools) guide, you might have noticed we added an `add` action and a `subtract` action to a single `calculator` tool.

When Fusion compiled that tool, it created **one single endpoint** using an `enum` discriminator field.

```jsonc
// How the LLM views your tool:
{
  "properties": {
    // The model must choose which sub-tool to use!
    "action": { "type": "string", "enum": ["add", "subtract"] }, 
    "a": { "type": "number" },
  }
}
```

By default, Fusion uses `action` as the discriminator key. This approach forces the LLM to select an explicit path, severely minimizing hallucinations.

---

## 2. Shared Common Schemas

Often, operations share common requirements. For example, if you are building a SaaS platform, practically every executed action requires a `workspaceId`.

Instead of repeating `workspaceId` in every specific Zod schema, Fusion provides shared parameters.

::: code-group
```typescript [defineTool]
const projects = defineTool<void>('projects', {
    description: 'Project management tool',
    shared: { workspaceId: 'string' },  // Injected into ALL actions
    actions: {
        create: {
            params: { projectName: 'string' },
            handler: async (ctx, args) => {
                // args: { workspaceId: string, projectName: string }
                return success('Created');
            },
        },
    },
});
```
```typescript [createTool]
const projects = createTool<void>('projects')
    .description('Project management tool')
    .commonSchema(z.object({
        workspaceId: z.string().describe('The active SaaS Workspace ID'),
    }))
    .action({
        name: 'create',
        schema: z.object({
            projectName: z.string(),
        }),
        handler: async (ctx, args) => {
            // args: { workspaceId: string, projectName: string }
            return success('Created');
        },
    });
```
:::
When this schema hydrates, Fusion intelligently handles telling the LLM which field belongs to which endpoint.

---

## 3. Hierarchical Routing (Namespaces)

When dealing with a massive "Platform" API, having 50 flat actions inside the builder becomes messy. Fusion allows you to create **Hierarchical Namespaces** using groups.

::: code-group
```typescript [defineTool]
import { defineTool, success } from '@vinkius-core/mcp-fusion';

const platform = defineTool<void>('platform', {
    description: 'Central API for the Platform',
    shared: { workspaceId: 'string' },
    groups: {
        users: {
            description: 'User management features',
            actions: {
                invite: {
                    params: { email: 'string' },
                    handler: async (ctx, args) => { /* ... */ },
                },
            },
        },
        billing: {
            description: 'Billing operations',
            actions: {
                refund: {
                    params: { invoiceId: 'string' },
                    handler: async (ctx, args) => { /* ... */ },
                },
            },
        },
    },
});
// Actions become: users.invite | billing.refund
```
```typescript [createTool]
import { createTool, success } from '@vinkius-core/mcp-fusion';

const platform = createTool<void>('platform')
    .description('Central API for the Platform')
    .commonSchema(z.object({ workspaceId: z.string() }))
    
    // Namespace A: Users
    .group('users', 'User management features', g => {
        g.action({
            name: 'invite', // Deeply evaluated as -> users.invite
            schema: z.object({ email: z.string() }),
            handler: async (ctx, args) => { /* ... */ }
        })
    })

    // Namespace B: Invoices
    .group('billing', 'Billing operations', g => {
        g.action({
            name: 'refund', // Deeply evaluated as -> billing.refund
            schema: z.object({ invoiceId: z.string() }),
            handler: async (ctx, args) => { /* ... */ }
        });
    });
```
:::

When you use groups, the discriminator value expected from the AI smoothly converts to a dot-notation payload (`users.invite` or `billing.refund`). 

The LLM still only sees **ONE MCP Tool** named `platform` containing all routes. 

::: warning Exclusive Mode
To ensure internal type safety, you cannot mix `.action()` and `.group()` flatly on the exact same root builder. If a builder triggers `.group()`, it expects exclusively nested namespaces.
:::

---

## 4. Tool Exposition — Wire Format Control

By default, Fusion now **expands** all grouped actions into independent, flat MCP tools (e.g. `projects_list`, `projects_create`). This gives each action its own schema, annotations, and descriptions — improving privilege isolation and LLM routing accuracy.

To keep grouped behavior, set `toolExposition: 'grouped'` in `attachToServer()`.

📖 **[Read the full Tool Exposition Guide →](/tool-exposition)**
