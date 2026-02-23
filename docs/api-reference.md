# API Reference

A highly dense reference manual for every public class, function, type, and interface exported by the MCP Fusion framework.

---

## Response Helpers

Because MCP dictates strict return structures, rather than sending complex JSON array trees by hand, use the Fusion helper libraries for instant payload mappings.

### `success(data)`

Creates a success response payload. Auto-detects the input type. If a string is passed, it is used as is. If an object is passed, it is intelligently serialized via `JSON.stringify`.

```typescript
import { success } from '@vinkius-core/mcp-fusion';

return success('Task created');
return success({ id: '1', title: 'My task', status: 'open' });
```

### `error(message)`

Instantly yields an error response strictly flagged with `isError: true`. The language model recognizes this flag.

```typescript
import { error } from '@vinkius-core/mcp-fusion';

return error('Task not found');
return error('Forbidden: admin role required');
```

### `required(field)`

A fast shorthand for throwing a cleanly formatted missing required field text string back to the LLM context.

```typescript
import { required } from '@vinkius-core/mcp-fusion';

// Emits { content: [{ type: "text", text: "Error: project_id required" }], isError: true }
return required('project_id');  
```

### `toolError(code, options)`

Creates a structured error response with recovery instructions for LLM agents. Includes an error code, a detailed message, and optional suggestions and available actions.

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

return toolError('ProjectNotFound', {
    message: `Project '${id}' does not exist.`,
    suggestion: 'Call projects.list to see available IDs.',
    availableActions: ['projects.list'],
});

// Output:
// [ProjectNotFound] Project 'xyz' does not exist.
// 💡 Suggestion: Call projects.list to see available IDs.
// 📋 Try: projects.list
```

**Options:**

| Field | Type | Description |
|---|---|---|
| `message` | `string` | Required. Human-readable error message. |
| `suggestion` | `string?` | Optional. Recovery hint for the LLM. |
| `availableActions` | `string[]?` | Optional. List of valid actions to try. |

### `toonSuccess(data)`

Creates a standard success response with a TOON-encoded payload via the `@toon-format/toon` compression schema.

```typescript
import { toonSuccess } from '@vinkius-core/mcp-fusion';

return toonSuccess(users);                        // Pipe-delimited natively
return toonSuccess(users, { delimiter: ',' });    // Custom delimiter
```

---

## Tool Builders

### `createTool(name)` — Builder Pattern

The fluent builder for composing tools with Zod schemas.

```typescript
import { createTool } from '@vinkius-core/mcp-fusion';

const tool = createTool<AppContext>('projects');
```

| Method | Returns | Description |
|---|---|---|
| `.description(desc)` | `this` | The highest-level tool description summary sent to the LLM. |
| `.discriminator(field)` | `this` | Overrides the field key the LLM uses to select operations (default: `action`). |
| `.annotations(map)` | `this` | Sets explicit ToolAnnotations (e.g. `{ readOnlyHint: true }`). |
| `.tags(...tags)` | `this` | Embeds categorical tags for `ToolRegistry.getTools({ filter })` exclusions. |
| `.toonDescription()` | `this` | Injects TOON tabular compression instead of standard Markdown spacing. |

#### Structural Composition

| Method | Returns | Description |
|---|---|---|
| `.commonSchema(zod)` | `this` | Appends a base Zod schema applied identically across every tool branch. |
| `.use(middleware)` | `this` | Pushes a Global Middleware function to the very top of the execution graph. |
| `.action(config)` | `this` | Mounts a flat execution route. Incompatible with `.group()`. |
| `.group(name, ...)` | `this` | Mounts a hierarchical sub-route. Incompatible with `.action()`. |

#### Introspection & Execution

| Method | Returns | Description |
|---|---|---|
| `.buildToolDefinition()` | `McpTool` | Triggers framework compilation loop and freezes internal mappings. |
| `.execute(ctx, args)` | `Promise` | Safely evaluates discriminator chains and fires the middleware array. |
| `.debug(observer)` | `this` | Attaches a `DebugObserverFn` for pipeline observability. See [Observability](/observability). |
| `.getActionNames()` | `string[]` | Dumps native flat keys or dot-notated compound keys. |
| `.getActionMetadata()` | `Object[]` | Pulls deep context mapping arrays about execution boundaries natively. |

### `defineTool(name, config)` — Declarative Config

The JSON-first API for defining tools without Zod imports.

```typescript
import { defineTool } from '@vinkius-core/mcp-fusion';

const tool = defineTool<AppContext>('projects', {
    description: 'Manage projects',
    tags: ['core'],
    shared: { workspace_id: 'string' },
    middleware: [authMiddleware],
    actions: {
        list: { readOnly: true, handler: listProjects },
        create: {
            params: { name: { type: 'string', min: 1 } },
            handler: createProject,
        },
    },
    groups: {
        admin: {
            middleware: [requireAdmin],
            actions: { reset: { destructive: true, handler: resetProjects } },
        },
    },
});
```

**Config Fields:**

| Field | Type | Description |
|---|---|---|
| `description` | `string?` | Tool description for the LLM. |
| `tags` | `string[]?` | Tags for tag-based filtering. |
| `discriminator` | `string?` | Discriminator field name (default: `'action'`). |
| `toonDescription` | `boolean?` | Enable TOON token compression for descriptions. |
| `annotations` | `Record<string, unknown>?` | Explicit MCP tool annotations. |
| `shared` | `ParamsMap?` | Parameters injected into every action. |
| `middleware` | `MiddlewareFn[]?` | Global middleware chain. |
| `actions` | `Record<string, ActionDef>` | Action definitions (keyed by action name). |
| `groups` | `Record<string, GroupDef>?` | Nested group definitions. |

**ActionDef Fields:**

| Field | Type | Description |
|---|---|---|
| `description` | `string?` | Action-specific description. |
| `params` | `ParamsMap \| ZodObject?` | Parameters (JSON shorthand or Zod). |
| `readOnly` | `boolean?` | Marks as read-only for LLM. |
| `destructive` | `boolean?` | Marks as destructive (⚠️ warning). |
| `idempotent` | `boolean?` | Marks as safe to retry. |
| `returns` | `Presenter?` | MVA Presenter — handler returns raw data. |
| `handler` | `(ctx, args) => Promise<ToolResponse>` | Required. The action handler. |

**ParamsMap Shorthand Values:**

| Value | Equivalent |
|---|---|
| `'string'` | `{ type: 'string' }` |
| `'number'` | `{ type: 'number' }` |
| `'boolean'` | `{ type: 'boolean' }` |
| `{ type, min, max, regex, optional, array, enum }` | Full descriptor |

---

## Middleware

### `defineMiddleware(deriveFn)`

Creates a context-deriving middleware definition (tRPC-style):

```typescript
import { defineMiddleware } from '@vinkius-core/mcp-fusion';

const withUser = defineMiddleware(async (ctx: { token: string }) => {
    const user = await verifyToken(ctx.token);
    return { user };  // Merged into ctx
});

// Convert to MiddlewareFn:
tool.use(withUser.toMiddlewareFn());
```

| Method | Returns | Description |
|---|---|---|
| `.toMiddlewareFn()` | `MiddlewareFn` | Converts to a standard middleware function. |
| `.derive` | `Function` | The raw derive function. |

### `isMiddlewareDefinition(value)`

Type guard to check if a value is a `MiddlewareDefinition`.

### `resolveMiddleware(input)`

Converts either a `MiddlewareDefinition` or a plain `MiddlewareFn` to a `MiddlewareFn`.

---

## Streaming Progress

### `progress(percent, message)`

Creates a `ProgressEvent` for use in generator handlers:

```typescript
import { progress } from '@vinkius-core/mcp-fusion';

yield progress(50, 'Building project...');
```

| Field | Type | Description |
|---|---|---|
| `percent` | `number` | Progress percentage (0–100). |
| `message` | `string` | Human-readable status message. |

### `isProgressEvent(value)`

Type guard to check if a yielded value is a `ProgressEvent`.

### MCP Notification Wiring

When attached to an MCP server via `attachToServer()`, progress events are **automatically** forwarded to the MCP client as `notifications/progress` when the client includes a `progressToken` in its request `_meta`. Zero configuration required — the framework detects the token and wires the notifications transparently.

| Internal Event | MCP Wire Format |
|---|---|
| `yield progress(50, 'Building...')` | `{ method: 'notifications/progress', params: { progressToken, progress: 50, total: 100, message: 'Building...' } }` |

When no `progressToken` is present (the client didn't opt in), progress events are silently consumed — **zero overhead**.

### `ProgressSink`

For direct usage (testing, custom pipelines), `ProgressSink` is a callable type:

```typescript
type ProgressSink = (event: ProgressEvent) => void;
```

Pass a `ProgressSink` to `builder.execute()` or `registry.routeCall()` as the optional last parameter.

---

## Result Monad

Railway-Oriented Programming for composable error handling. See [Result Monad Guide](/result-monad) for full patterns.

### `succeed(value)`

Wraps a value into `Success<T>`:

```typescript
import { succeed } from '@vinkius-core/mcp-fusion';

const result = succeed({ id: '1', name: 'Alice' });
// { ok: true, value: { id: '1', name: 'Alice' } }
```

### `fail(response)`

Wraps a `ToolResponse` into `Failure`:

```typescript
import { fail, error } from '@vinkius-core/mcp-fusion';

const result = fail(error('User not found'));
// { ok: false, response: ToolResponse }
```

### Types

| Type | Fields | Description |
|---|---|---|
| `Success<T>` | `ok: true`, `value: T` | Successful result |
| `Failure` | `ok: false`, `response: ToolResponse` | Failed result |
| `Result<T>` | — | `Success<T> \| Failure` discriminated union |

---

## FusionClient

### `createFusionClient(transport)`

Creates a type-safe client for calling tools through a transport layer:

```typescript
import { createFusionClient } from '@vinkius-core/mcp-fusion';

type AppRouter = {
    'projects.list': { workspace_id: string };
    'projects.create': { workspace_id: string; name: string };
};

const client = createFusionClient<AppRouter>(transport);

const result = await client.execute('projects.list', { workspace_id: 'ws_1' });
```

**FusionTransport Interface:**

```typescript
interface FusionTransport {
    callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse>;
}
```

The client splits dotted action paths: `'projects.list'` → tool `'projects'` + arg `{ action: 'list' }`.

---

## ToolRegistry

The unified global router that manages attaching and filtering compiled Builders against the actual bare-metal MCP connection arrays.

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
```

| Method | Returns | Description |
|---|---|---|
| `.register(builder)` | `void` | Mounts a single builder and implicitly fires compilation natively. |
| `.registerAll(...)` | `void` | Maps variable array of builders seamlessly into memory. |
| `.getAllTools()` | `McpTool[]` | Returns all registered tool definitions. |
| `.getTools(filter)` | `McpTool[]` | Filters payload dumps based strictly on inclusion/exclusion tags. |
| `.routeCall(ctx, name, args, progressSink?)` | `Promise` | Proxies execution requests deeply into the assigned `Builder`. Optional `progressSink` forwards generator `ProgressEvent`s. |
| `.enableDebug(observer)` | `void` | Propagates a debug observer to ALL registered builders. See [Observability](/observability). |
| `.has(name)` | `boolean` | Check if a tool is registered. |
| `.clear()` | `void` | Remove all registered tools. |
| `.size` | `number` | Number of registered tools. |

### `.attachToServer(server, options?)`

Mounts the registry directly to the underlying MCP Server Protocol instances silently via generic duck-typing logic.

```typescript
const detach = registry.attachToServer(server, {
    // Limits the exposure of available Tools strictly to allowed tags:
    filter: { tags: ['public'] },
    
    // Injects highly specific Context variables per MCP execution context:
    contextFactory: (extra) => resolveSessionContext(extra),

    // Enable debug observability for ALL tools (optional):
    debug: createDebugObserver(),
});

// Progress events from generator handlers are automatically sent
// as MCP notifications/progress when the client provides a progressToken.
// No configuration needed — zero overhead when not used.

// Optionally strip handlers gracefully from the server memory on shutdown:
detach();
```

**AttachOptions Fields:**

| Field | Type | Description |
|---|---|---|
| `filter` | `ToolFilter?` | Tag-based inclusion/exclusion filter. |
| `contextFactory` | `Function?` | Per-request context factory. Supports async. |
| `toolExposition` | `ToolExposition?` | `'flat'` (default) or `'grouped'`. Controls how grouped tools appear on the wire. See [Tool Exposition](/tool-exposition). |
| `actionSeparator` | `string?` | Separator for flat tool names (default: `'_'`). E.g. `'_'` → `projects_list`, `'.'` → `projects.list`. |
| `debug` | `DebugObserverFn?` | Debug observer — propagated to all builders. See [Observability](/observability). |
| `stateSync` | `StateSyncConfig?` | Cache-control and causal invalidation. See [State Sync](/state-sync). |

### `ToolExposition`

```typescript
type ToolExposition = 'flat' | 'grouped';
```

| Value | Behavior |
|---|---|
| `'flat'` | Each action becomes an independent MCP tool with isolated schema and annotations. |
| `'grouped'` | One MCP tool per builder with discriminator enum — optimized for token efficiency and domain cohesion. |

### `ExpositionConfig`

```typescript
interface ExpositionConfig {
    toolExposition?: ToolExposition;  // Default: 'flat'
    actionSeparator?: string;        // Default: '_'
}
```

See the full [Tool Exposition Guide](/tool-exposition) for details.

---

## Observability

### `createDebugObserver(handler?)`

Factory function that creates a typed debug event observer. See [Observability Guide](/observability) for comprehensive examples.

```typescript
import { createDebugObserver } from '@vinkius-core/mcp-fusion';

// Default: pretty console.debug output
const debug = createDebugObserver();

// Custom: forward to telemetry
const debug = createDebugObserver((event) => {
    opentelemetry.addEvent(event.type, event);
});
```

### `DebugEvent`

Discriminated union of all pipeline events. Use `event.type` for exhaustive handling.

| Event Type | Fields | When Emitted |
|---|---|---|
| `route` | `tool, action, timestamp` | First event — incoming call matched |
| `validate` | `tool, action, valid, error?, durationMs, timestamp` | After Zod validation |
| `middleware` | `tool, action, chainLength, timestamp` | Before middleware chain (only if middleware exists) |
| `execute` | `tool, action, durationMs, isError, timestamp` | After handler completes |
| `error` | `tool, action, error, step, timestamp` | On unrecoverable pipeline errors |

### Builder `.debug(observer)`

Attach a debug observer to a single tool:

```typescript
const tool = createTool<AppContext>('projects')
    .debug(createDebugObserver())
    .action({ name: 'list', handler: listProjects });
```

---

## State Sync

Prevents LLM Temporal Blindness by injecting cache-control signals into the MCP protocol. See [State Sync Guide](/state-sync) for comprehensive examples.

### `StateSyncConfig`

```typescript
interface StateSyncConfig {
    policies: SyncPolicy[];
    defaults?: { cacheControl?: CacheDirective };
}
```

| Field | Type | Description |
|---|---|---|
| `policies` | `SyncPolicy[]` | Policy rules, evaluated in declaration order (first match wins). |
| `defaults` | `object?` | Fallback cache directive for unmatched tools. |

### `SyncPolicy`

```typescript
interface SyncPolicy {
    match: string;
    cacheControl?: CacheDirective;
    invalidates?: string[];
}
```

| Field | Type | Description |
|---|---|---|
| `match` | `string` | Dot-separated glob pattern (e.g. `sprints.*`, `**.get`). |
| `cacheControl` | `CacheDirective?` | `'no-store'` or `'immutable'` — appended to tool descriptions. |
| `invalidates` | `string[]?` | Glob patterns of tools whose cache is invalidated on success. |

### `CacheDirective`

```typescript
type CacheDirective = 'no-store' | 'immutable';
```

### `ResolvedPolicy`

```typescript
interface ResolvedPolicy {
    cacheControl?: CacheDirective;
    invalidates?: readonly string[];
}
```

### `PolicyEngine`

For advanced use cases (custom pipelines, testing).

| Method | Returns | Description |
|---|---|---|
| `constructor(policies, defaults?)` | — | Validates and caches policies |
| `resolve(toolName)` | `ResolvedPolicy \| null` | Resolves the applicable policy (cached) |

### `matchGlob(pattern, name)`

Pure function for dot-separated glob matching.

```typescript
import { matchGlob } from '@vinkius-core/mcp-fusion';

matchGlob('sprints.*',  'sprints.get');       // true
matchGlob('sprints.*',  'sprints.tasks.get'); // false
matchGlob('sprints.**', 'sprints.tasks.get'); // true
matchGlob('**',         'anything.at.all');   // true
```

---

## Domain Model Classes

All underlying structural classes use public fields for highly dense, performant direct property access.

### `Group`

Base hierarchical tree node for plotting Tool paths natively.

| Field | Type | Description |
|---|---|---|
| `parent` | `Group \| null` | Upstream target nullated if root block. |
| `childGroups` | `Group[]` | Recursive sub-group tracking arrays. |
| `getFullyQualifiedName()`| `string` | Spits out recursive dot-separated identifiers (e.g. `root.parent.child`). |

### `Tool`

The strictly evaluated LLM parameter payload logic.

| Field | Type | Description |
|---|---|---|
| `inputSchema` | `string` | Fully expanded JSON Schema string definitions natively. |
| `toolAnnotations` | `Annotations` | Bound behavior hint blocks evaluated by language models. |
