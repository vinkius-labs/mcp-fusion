# FusionClient

MCP Fusion provides a **tRPC-style type-safe client** for calling MCP tools with full autocomplete and compile-time argument validation. Define your router type once on the server, and every client call is fully typed — wrong action names or missing arguments are caught at build time.

---

## Why FusionClient?

The standard MCP SDK client uses `callTool(name, args)` with untyped `string` names and `Record<string, unknown>` arguments. This means:

- ❌ No autocomplete for tool names
- ❌ No compile-time validation for arguments
- ❌ Typos in action names only fail at runtime
- ❌ Missing required fields only fail at runtime

FusionClient solves all of these:

- ✅ Full autocomplete for every action path
- ✅ TypeScript errors for invalid action names
- ✅ TypeScript errors for missing/wrong arguments
- ✅ Zero runtime overhead — types are compile-time only

---

## Quick Setup

### 1. Define Your Router Type (Server Side)

Export a type that maps action paths to their argument shapes:

```typescript
// mcp-server.ts
import { defineTool, ToolRegistry, success } from '@vinkius-core/mcp-fusion';

const projects = defineTool<AppContext>('projects', {
    shared: { workspace_id: 'string' },
    actions: {
        list: {
            readOnly: true,
            params: { status: { enum: ['active', 'archived'] as const, optional: true } },
            handler: async (ctx, args) => success(await ctx.db.projects.findMany()),
        },
        create: {
            params: { name: { type: 'string', min: 1 } },
            handler: async (ctx, args) => success(await ctx.db.projects.create(args)),
        },
    },
});

const billing = defineTool<AppContext>('billing', {
    actions: {
        refund: {
            destructive: true,
            params: { invoice_id: 'string', amount: 'number' },
            handler: async (ctx, args) => success('Refunded'),
        },
    },
});

// Export the router type:
export type AppRouter = {
    'projects.list': { workspace_id: string; status?: 'active' | 'archived' };
    'projects.create': { workspace_id: string; name: string };
    'billing.refund': { invoice_id: string; amount: number };
};
```

### 2. Create the Client (Client Side)

```typescript
// agent.ts
import { createFusionClient } from '@vinkius-core/mcp-fusion';
import type { AppRouter } from './mcp-server';

const client = createFusionClient<AppRouter>(transport);
```

### 3. Call Tools with Full Type Safety

```typescript
// ✅ Full autocomplete — TypeScript knows every valid action
const result = await client.execute('projects.create', {
    workspace_id: 'ws_1',
    name: 'Vinkius V2',
});

// ❌ TS Error: 'projects.nonexistent' is not a valid action
await client.execute('projects.nonexistent', {});

// ❌ TS Error: Property 'name' is missing
await client.execute('projects.create', { workspace_id: 'ws_1' });

// ❌ TS Error: Type 'number' is not assignable to type 'string'
await client.execute('projects.create', { workspace_id: 'ws_1', name: 42 });
```

---

## How It Works

FusionClient automatically parses dotted action paths:

```
'projects.create'  →  callTool('projects', { action: 'create', ...args })
'billing.refund'   →  callTool('billing',  { action: 'refund', ...args })
```

This is exactly the format that `GroupedToolBuilder` expects — the discriminator-based routing handles the rest.

---

## Transport Layer

The client accepts any object that implements `FusionTransport`:

```typescript
interface FusionTransport {
    callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse>;
}
```

### Using with MCP SDK Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mcpClient = new Client(/* ... */);

// Wrap the MCP client as a transport:
const transport: FusionTransport = {
    callTool: (name, args) => mcpClient.callTool({ name, arguments: args }),
};

const client = createFusionClient<AppRouter>(transport);
```

### Using with Direct Registry (Testing)

```typescript
const transport: FusionTransport = {
    callTool: (name, args) => registry.routeCall(testContext, name, args),
};

const client = createFusionClient<AppRouter>(transport);
```

---

## Real-World: AI Agent Orchestrator

Build type-safe AI agent scripts that call MCP tools:

```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion';
import type { AppRouter } from './mcp-server';

async function onboardUser(client: FusionClient<AppRouter>, email: string) {
    // 1. Create workspace
    const wsResult = await client.execute('workspaces.create', {
        name: `${email}'s Workspace`,
        plan: 'free',
    });

    // 2. Create default project
    const projectResult = await client.execute('projects.create', {
        workspace_id: wsResult.content[0].text,
        name: 'Getting Started',
    });

    // 3. Send welcome email
    await client.execute('notifications.send', {
        to: email,
        template: 'welcome',
    });

    return projectResult;
}
```

Every call in this function is fully typed. If you rename an action on the server, the client instantly shows TypeScript errors everywhere that call needs updating.

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `createFusionClient(transport)` | `function` | Creates a typed `FusionClient<TRouter>` |
| `FusionClient<TRouter>` | `interface` | Type-safe client with `.execute()` method |
| `FusionTransport` | `interface` | Transport abstraction (`callTool`) |
| `RouterMap` | `type` | Base constraint for router types |
