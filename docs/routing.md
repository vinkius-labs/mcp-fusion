# Namespaces & Routing (Scaling)

As your application grows, you will inevitably have dozens or hundreds of API routes you want to expose to your AI. 

If you expose 100 individual flat tools to an LLM, two negative things happen:
1. **Context Bloat:** You eat thousands of tokens of context space just sending instructions about the tools.
2. **Semantic Hallucination:** The AI gets confused between `user_preferences_update` and `system_preferences_update`.

MCP Fusion solves this through **Grouped Routing** and **Discriminators**.

---

## 1. What is a Discriminator?

If you followed the [Building Tools](/building-tools) guide, you might have noticed we added an `add` action and a `subtract` action to a single `calculator` tool.

When Fusion compiled that tool, it created **one single endpoint** using a magical `enum` called a discriminator.

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

Instead of repeating `workspaceId` in every specific Zod schema, Fusion provides `.commonSchema()`.

```typescript
const projects = createTool<void>('projects')
    .description('Project management tool')
    
    // 1. Declare properties that apply globally across this entire branch
    .commonSchema(z.object({
        workspaceId: z.string().describe('The active SaaS Workspace ID'),
    }))
    
    // 2. The downstream schema automatically inherits `workspaceId`
    .action({
        name: 'create',
        schema: z.object({
            projectName: z.string(),
        }),
        handler: async (ctx, args) => {
            // TypeScript intelligently merged the objects natively!
            // args: { workspaceId: string, projectName: string }
            return success('Created');
        },
    });
```
When this schema hydrates, Fusion intelligently handles telling the LLM which field belongs to which endpoint.

---

## 3. Hierarchical Routing (Namespaces)

When dealing with a massive "Platform" API, having 50 flat actions inside the builder becomes messy. Fusion allows you to create **Hierarchical Namespaces** using the `.group()` method.

```typescript
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

When you use `.group()`, the discriminator value expected from the AI smoothly converts to a dot-notation payload (`users.invite` or `billing.refund`). 

The LLM still only sees **ONE MCP Tool** named `platform` containing all routes. 

::: warning Exclusive Mode
To ensure internal type safety, you cannot mix `.action()` and `.group()` flatly on the exact same root builder. If a builder triggers `.group()`, it expects exclusively nested namespaces.
:::
