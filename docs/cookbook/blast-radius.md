# Blast Radius Control

- [Introduction](#introduction)
- [Tag-Based Filtering](#tags)
- [The tags() Method](#method)
- [Runtime Tag Filtering](#runtime)
- [Use Cases](#use-cases)

## Introduction {#introduction}

In a large MCP server with 100+ tools, you don't always want the agent to see everything. A billing agent shouldn't see user management tools. A read-only dashboard agent shouldn't see mutations. **Blast Radius Control** uses tags to filter which tools are visible to each agent session.

## Tag-Based Filtering {#tags}

Tag your tools during definition:

```typescript
const f = initFusion<AppContext>();

export const listInvoices = f.query('billing.list')
  .describe('List invoices')
  .tags('billing', 'read')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    return ctx.db.invoices.findMany();
  });

export const chargeInvoice = f.mutation('billing.charge')
  .describe('Charge an invoice')
  .tags('billing', 'write', 'destructive')
  .withString('id', 'Invoice ID')
  .handle(async (input, ctx) => {
    await ctx.db.invoices.charge(input.id);
    return { charged: true };
  });

export const listUsers = f.query('users.list')
  .describe('List users')
  .tags('users', 'read', 'admin')
  .returns(UserPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.users.findMany();
  });
```

## The tags() Method {#method}

`.tags()` accepts any number of string arguments. Tags are metadata — they don't affect tool behavior, only visibility:

```typescript
f.query('projects.list')
  .tags('projects', 'read', 'v1')    // Multiple tags
```

## Runtime Tag Filtering {#runtime}

Filter tools at server attachment time based on session context:

```typescript
registry.attachToServer(server, {
  contextFactory: createContext,
  toolFilter: (tool, session) => {
    // Billing agent: only billing tools
    if (session.agentType === 'billing') {
      return tool.tags.includes('billing');
    }

    // Read-only agent: no write tools
    if (session.agentType === 'readonly') {
      return tool.tags.includes('read');
    }

    // Admin: everything
    return true;
  },
});
```

The `toolFilter` runs during `tools/list` — filtered tools are invisible to the agent. They don't appear in the tool list and can't be called.

## Use Cases {#use-cases}

| Agent Type | Tag Filter | Effect |
|---|---|---|
| Billing agent | `billing` | Sees only invoice/payment tools |
| Dashboard agent | `read` | Sees only query tools, no mutations |
| Admin agent | No filter | Sees everything |
| External agent | `public` | Sees only public-facing tools |
| Debug agent | `internal` | Sees monitoring and debug tools |

> [!IMPORTANT]
> Tag filtering is a **presentation-layer** control. It hides tools from the agent's view but doesn't prevent direct `tools/call` invocations if the agent guesses the tool name. For true authorization, combine tag filtering with [Authentication Middleware](/cookbook/auth-middleware).