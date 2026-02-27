# FusionClient

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Server — Export the Router Type](#server)
- [Client — Import and Call](#client)
- [How It Works](#how)
- [Transport](#transport)
- [Client Middleware](#middleware)
- [Error Handling](#errors)
- [Batch Execution](#batch)
- [API Reference](#api)

## Introduction {#introduction}

MCP tool calls are stringly-typed — you pass a tool name and an `arguments` object, and hope the shape is correct. There's no compile-time validation, no autocomplete, nothing stopping you from sending `"projetcs.create"` (typo) or missing a required field.

FusionClient brings **tRPC-style type inference** to MCP. Export a router type from the server, import it on the client — every `client.execute()` call gets full autocomplete and compile-time argument validation. Zero runtime cost.

## Server — Export the Router Type {#server}

```typescript
// server.ts
import { initFusion, createTypedRegistry } from '@vinkius-core/mcp-fusion';
import type { InferRouter } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const listProjects = f.query('projects.list')
  .describe('List projects')
  .withString('workspace_id', 'Workspace ID')
  .withOptionalEnum('status', ['active', 'archived'] as const, 'Project status')
  .handle(async (input, ctx) => ctx.db.projects.findMany());

const createProject = f.mutation('projects.create')
  .describe('Create a project')
  .withString('workspace_id', 'Workspace ID')
  .withString('name', 'Project name')
  .handle(async (input, ctx) => ctx.db.projects.create(input));

const refund = f.mutation('billing.refund')
  .describe('Refund an invoice')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Refund amount')
  .handle(async (input, ctx) => 'Refunded');

const registry = createTypedRegistry<AppContext>()(listProjects, createProject, refund);
export type AppRouter = InferRouter<typeof registry>;
```

`createTypedRegistry()` is curried — first call sets `TContext`, second infers builder types. `InferRouter` is pure type-level, zero runtime cost.

## Client — Import and Call {#client}

```typescript
// agent.ts
import { createFusionClient } from '@vinkius-core/mcp-fusion';
import type { AppRouter } from './server.js';

const client = createFusionClient<AppRouter>(transport);

const result = await client.execute('projects.create', {
  workspace_id: 'ws_1',
  name: 'Project V2',
});
```

Compile-time errors for typos, missing fields, and type mismatches:

```typescript
await client.execute('projects.nonexistent', {});   // TS error: invalid action
await client.execute('projects.create', { workspace_id: 'ws_1' }); // TS error: missing 'name'
await client.execute('projects.create', { workspace_id: 'ws_1', name: 42 }); // TS error: number ≠ string
```

## How It Works {#how}

`execute()` parses the dotted path and forwards as a discriminated call:

```
client.execute('projects.create', { workspace_id: 'ws_1', name: 'V2' })
  ↓
transport.callTool('projects', { action: 'create', workspace_id: 'ws_1', name: 'V2' })
```

## Transport {#transport}

Any object implementing `FusionTransport`:

```typescript
interface FusionTransport {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse>;
}
```

**MCP SDK Client:**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mcpClient = new Client(/* ... */);
const transport: FusionTransport = {
  callTool: (name, args) => mcpClient.callTool({ name, arguments: args }),
};
const client = createFusionClient<AppRouter>(transport);
```

**Direct Registry (testing):**

```typescript
const transport: FusionTransport = {
  callTool: (name, args) => registry.routeCall(testContext, name, args),
};
const client = createFusionClient<AppRouter>(transport);
```

## Client Middleware {#middleware}

Onion-pattern interceptors for every outgoing call:

```typescript
import type { ClientMiddleware } from '@vinkius-core/mcp-fusion';

const authMiddleware: ClientMiddleware = async (action, args, next) => {
  return next(action, { ...args, _token: await getToken() });
};

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

Compiled once at creation — O(1) per call.

## Error Handling {#errors}

Enable `throwOnError` to parse `<tool_error>` XML into `FusionClientError`:

```typescript
import { createFusionClient, FusionClientError } from '@vinkius-core/mcp-fusion';

const client = createFusionClient<AppRouter>(transport, { throwOnError: true });

try {
  await client.execute('billing.get_invoice', { id: 'inv_999' });
} catch (err) {
  if (err instanceof FusionClientError) {
    err.code;             // 'NOT_FOUND'
    err.message;          // 'Invoice inv_999 not found.'
    err.recovery;         // 'Call billing.list first.'
    err.availableActions; // ['billing.list']
    err.severity;         // 'error'
    err.raw;              // original ToolResponse
  }
}
```

`code`, `message`, `recovery`, `availableActions`, `severity`, and `raw` are all extracted from the XML envelope. XML entities are auto-unescaped.

## Batch Execution {#batch}

```typescript
const results = await client.executeBatch([
  { action: 'projects.list', args: { status: 'active' } },
  { action: 'billing.get_invoice', args: { id: 'inv_42' } },
  { action: 'users.me', args: {} },
]);
```

Parallel by default (`Promise.all`). Use `{ sequential: true }` for ordered execution. Middleware and `throwOnError` apply to every call.

## API Reference {#api}

**Runtime:** `createFusionClient(transport, options?)`, `createTypedRegistry<TContext>()`, `FusionClientError`.

**Types:** `FusionClient<TRouter>`, `FusionTransport`, `InferRouter<T>`, `TypedToolRegistry<TContext, TBuilders>`, `ClientMiddleware` (`(action, args, next) => Promise<ToolResponse>`), `FusionClientOptions` (`{ middleware?, throwOnError? }`), `RouterMap`.
