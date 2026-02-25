# FusionClient

**MCP Fusion** provides a **tRPC-style type-safe client** for calling MCP tools with full autocomplete and compile-time argument validation. Define your router type once on the server, and every client call is fully typed — wrong action names or missing arguments are caught at build time.

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

Use `createTypedRegistry()` and `InferRouter` to **automatically** extract a fully typed router from your builders — no manual type definitions needed:

::: code-group
```typescript [initFusion — Recommended ✨]
// mcp-server.ts
import { initFusion, createTypedRegistry } from '@vinkius-core/mcp-fusion';
import type { InferRouter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const f = initFusion<AppContext>();

const listProjects = f.tool({
    name: 'projects.list',
    input: z.object({
        workspace_id: z.string(),
        status: z.enum(['active', 'archived']).optional(),
    }),
    handler: async ({ input, ctx }) => await ctx.db.projects.findMany(),
});

const createProject = f.tool({
    name: 'projects.create',
    input: z.object({ workspace_id: z.string(), name: z.string().min(1) }),
    handler: async ({ input, ctx }) => await ctx.db.projects.create(input),
});

const refund = f.tool({
    name: 'billing.refund',
    input: z.object({ invoice_id: z.string(), amount: z.number() }),
    handler: async ({ input, ctx }) => 'Refunded',
});

// Automatic router type extraction:
const registry = createTypedRegistry<AppContext>()(listProjects, createProject, refund);
export type AppRouter = InferRouter<typeof registry>;
```
```typescript [defineTool]
// mcp-server.ts
import { defineTool, createTypedRegistry, success } from '@vinkius-core/mcp-fusion';
import type { InferRouter } from '@vinkius-core/mcp-fusion';

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

// Automatic router type extraction:
const registry = createTypedRegistry<AppContext>()(projects, billing);
export type AppRouter = InferRouter<typeof registry>;
```
:::

::: info Manual Type Definition
If you prefer manual control, you can still define `AppRouter` by hand as a `Record<string, Record<string, unknown>>`.
:::


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
| `createFusionClient(transport, options?)` | `function` | Creates a typed `FusionClient<TRouter>` with optional middleware and error handling |
| `createTypedRegistry<TContext>()` | `function` | Creates a `TypedToolRegistry` preserving builder types for `InferRouter` |
| `InferRouter<T>` | `type` | Extracts a typed `RouterMap` from a `TypedToolRegistry` (zero runtime cost) |
| `TypedToolRegistry<TContext, TBuilders>` | `interface` | Type-preserving registry wrapper for compile-time inference |
| `FusionClient<TRouter>` | `interface` | Type-safe client with `.execute()` and `.executeBatch()` |
| `FusionClientError` | `class` | Structured error parsed from `<tool_error>` XML envelopes |
| `ClientMiddleware` | `type` | `(action, args, next) => Promise<ToolResponse>` — request interceptor |
| `FusionClientOptions` | `interface` | `{ middleware?, throwOnError? }` |
| `FusionTransport` | `interface` | Transport abstraction (`callTool`) |
| `RouterMap` | `type` | Base constraint for router types |

---

## Client Middleware

Intercept every outgoing call with typed middleware:

```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion';
import type { ClientMiddleware } from '@vinkius-core/mcp-fusion';

// Add auth token to every call
const authMiddleware: ClientMiddleware = async (action, args, next) => {
    return next(action, { ...args, _token: await getToken() });
};

// Log all calls
const logMiddleware: ClientMiddleware = async (action, args, next) => {
    console.log(`→ ${action}`, args);
    const result = await next(action, args);
    console.log(`← ${action}`, result.isError ? 'ERROR' : 'OK');
    return result;
};

const client = createFusionClient<AppRouter>(transport, {
    middleware: [authMiddleware, logMiddleware],
});
```

Middleware executes in registration order (onion model). The chain is compiled once at client creation — **O(1) overhead per call**.

---

## Structured Error Handling

### throwOnError

When `throwOnError: true`, error responses are automatically parsed into `FusionClientError` instances:

```typescript
import { createFusionClient, FusionClientError } from '@vinkius-core/mcp-fusion';

const client = createFusionClient<AppRouter>(transport, { throwOnError: true });

try {
    await client.execute('billing.get_invoice', { id: 'inv_999' });
} catch (err) {
    if (err instanceof FusionClientError) {
        console.log(err.code);              // 'NOT_FOUND'
        console.log(err.message);           // 'Invoice inv_999 not found.'
        console.log(err.recovery);          // 'Call billing.list first.'
        console.log(err.availableActions);  // ['billing.list']
        console.log(err.severity);          // 'error'
        console.log(err.raw);              // Original ToolResponse
    }
}
```

The parser automatically unescapes XML entities (`&amp;`, `&lt;`, etc.) so error messages are always human-readable.

### FusionClientError Fields

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Error code from `<tool_error code="...">` |
| `message` | `string` | Human-readable error message |
| `recovery` | `string \| undefined` | Recovery instruction from `<recovery>` |
| `availableActions` | `string[]` | Suggested actions from `<action>` elements |
| `severity` | `string` | Error severity (`warning`, `error`, `critical`) |
| `raw` | `ToolResponse` | The original unmodified MCP response |

---

## Batch Execution

Execute multiple calls in a single operation:

```typescript
const results = await client.executeBatch([
    { action: 'projects.list', args: { status: 'active' } },
    { action: 'billing.get_invoice', args: { id: 'inv_42' } },
    { action: 'users.me', args: {} },
]);
// results[0] — projects.list response
// results[1] — billing.get_invoice response
// results[2] — users.me response
```

By default, calls execute **in parallel** (`Promise.all`). Use `sequential: true` for ordered execution:

```typescript
const results = await client.executeBatch(
    [
        { action: 'projects.create', args: { name: 'New Project' } },
        { action: 'tasks.create', args: { project_id: '...' } },
    ],
    { sequential: true },
);
```

Middleware and `throwOnError` apply to every call in the batch.

