# Observability

MCP Fusion provides a built-in debug observability system that emits structured events at each stage of the execution pipeline. When disabled (the default), there is **zero runtime overhead** — no conditionals, no performance impact.

---

## Design Principles

| Principle | How It's Implemented |
|---|---|
| **Zero overhead** | Separate code path — when debug is off, execution takes the fast path with no conditionals |
| **Opt-in** | Debug is only active when explicitly enabled via `.debug()` or `enableDebug()` |
| **Pure function** | The observer is a simple function (`DebugObserverFn`), not a class hierarchy |
| **Type-safe events** | Discriminated union (`DebugEvent`) enables exhaustive `switch` handling |
| **Immutable payloads** | All event properties are `readonly` |

---

## Quick Start

### Per-Tool Debug

Attach a debug observer to a single tool using `.debug()`:

```typescript
import { createTool, createDebugObserver, success } from '@vinkius-core/mcp-fusion';

const tool = createTool<AppContext>('projects')
    .debug(createDebugObserver())         // ← pretty console.debug output
    .action({
        name: 'list',
        handler: async (ctx) => success(await ctx.db.projects.findMany()),
    });
```

Output:
```
[mcp-fusion] route     projects/list
[mcp-fusion] validate  projects/list ✓ 0.2ms
[mcp-fusion] execute   projects/list ✓ 14.3ms
```

### Registry-Level Debug

Enable debug for **all registered tools** at once using `enableDebug()`:

```typescript
import { ToolRegistry, createDebugObserver } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projectsTool, usersTool, billingTool);

// One line — all 3 tools now emit debug events
registry.enableDebug(createDebugObserver());
```

### Server-Level Debug

Pass the observer in `attachToServer()` options for full pipeline visibility:

```typescript
const detach = registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    debug: createDebugObserver(),    // ← observes everything
});
```

This is the recommended approach for production debugging. A single entry point enables observability across the entire MCP server.

---

## The `createDebugObserver()` Factory

```typescript
import { createDebugObserver } from '@vinkius-core/mcp-fusion';
```

| Signature | Description |
|---|---|
| `createDebugObserver()` | Returns a `DebugObserverFn` that formats events to `console.debug` |
| `createDebugObserver(handler)` | Returns the custom handler directly — no wrapper |

### Default Console Output

When called without arguments, produces compact, aligned output:

```
[mcp-fusion] route     platform/users.list
[mcp-fusion] validate  platform/users.list ✓ 0.3ms
[mcp-fusion] mw-chain  platform/users.list (2 functions)
[mcp-fusion] execute   platform/users.list ✓ 8.7ms
```

### Custom Handler

Pass a function to receive structured `DebugEvent` objects:

```typescript
const debug = createDebugObserver((event) => {
    // event is a fully typed DebugEvent
    myTelemetry.record(event.type, {
        tool: event.tool,
        action: event.action,
        timestamp: event.timestamp,
    });
});
```

---

## Event Types

Every event has `type`, `tool`, `action`, and `timestamp`. The `type` field is a discriminator for exhaustive handling.

### `RouteEvent`

Emitted when an incoming MCP call is matched to a tool and action. This is the **first event** in the pipeline.

```typescript
{
    type: 'route',
    tool: 'projects',
    action: 'list',
    timestamp: 1740195418000
}
```

### `ValidateEvent`

Emitted after Zod schema validation (pass or fail). Includes timing for the validation step.

```typescript
// Successful validation
{
    type: 'validate',
    tool: 'projects',
    action: 'create',
    valid: true,
    durationMs: 0.3,
    timestamp: 1740195418001
}

// Failed validation
{
    type: 'validate',
    tool: 'projects',
    action: 'create',
    valid: false,
    error: 'Validation failed',
    durationMs: 0.1,
    timestamp: 1740195418001
}
```

### `MiddlewareEvent`

Emitted when the middleware chain starts executing. Only fires when there is at least one middleware in the chain (global or group-scoped).

```typescript
{
    type: 'middleware',
    tool: 'projects',
    action: 'create',
    chainLength: 3,             // total: global + group-scoped
    timestamp: 1740195418002
}
```

### `ExecuteEvent`

Emitted after the handler completes. Contains total pipeline duration and error flag.

```typescript
// Success
{
    type: 'execute',
    tool: 'projects',
    action: 'list',
    durationMs: 14.3,
    isError: false,
    timestamp: 1740195418015
}

// Error response from handler
{
    type: 'execute',
    tool: 'projects',
    action: 'create',
    durationMs: 2.1,
    isError: true,              // handler returned error()
    timestamp: 1740195418003
}
```

### `ErrorEvent`

Emitted when an unrecoverable error occurs during routing (unknown action, missing discriminator, unknown tool at registry level).

```typescript
{
    type: 'error',
    tool: 'unknown_tool',
    action: '?',
    error: 'Unknown tool: "unknown_tool"',
    step: 'route',
    timestamp: 1740195418000
}
```

---

## Event Pipeline Order

For a successful call with middleware, events are emitted in this exact order:

```
route → validate → middleware → execute
```

- **No schema?** → `validate` is still emitted with `valid: true`
- **No middleware?** → `middleware` is skipped
- **Validation fails?** → Only `route` + `validate` are emitted (pipeline short-circuits)
- **Unknown action?** → Only `error` is emitted

---

## Three Levels of Observability

### 1. Per-Tool `.debug()`

Attach an observer to a single tool. Useful during development of a specific tool.

```typescript
const tool = createTool<AppContext>('users')
    .debug(createDebugObserver())
    .action({ name: 'list', handler: listUsers })
    .action({ name: 'create', schema: createUserSchema, handler: createUser });
```

::: tip
`.debug()` can be called after `defineTool()` — it's safe to attach even after the builder is frozen.
:::

```typescript
const tool = defineTool<AppContext>('users', {
    actions: {
        list: { handler: listUsers },
    },
});

// Attach debug later — this is fine
tool.debug(createDebugObserver());
```

### 2. Registry `.enableDebug()`

Propagate an observer to **every registered builder** at once:

```typescript
const registry = new ToolRegistry<AppContext>();
registry.register(projectsTool);
registry.register(usersTool);
registry.register(billingTool);

// All 3 tools now emit events
registry.enableDebug(createDebugObserver());
```

The registry also emits its own error events for unknown tools:

```typescript
// Calling a non-existent tool
await registry.routeCall(ctx, 'nonexistent', { action: 'run' });
// → ErrorEvent with step: 'route' and tool: 'nonexistent'
```

### 3. Server `AttachOptions.debug`

The recommended approach — a single entry point for the entire MCP server:

```typescript
const detach = registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    debug: createDebugObserver(),
});
```

This calls `registry.enableDebug()` internally, propagating to all builders.

---

## Real-World Patterns

### Telemetry Integration

Forward events to OpenTelemetry, Datadog, or any observability platform:

```typescript
const debug = createDebugObserver((event) => {
    switch (event.type) {
        case 'execute':
            histogram.record(event.durationMs, {
                tool: event.tool,
                action: event.action,
                status: event.isError ? 'error' : 'success',
            });
            break;
        case 'error':
            errorCounter.add(1, {
                tool: event.tool,
                step: event.step,
            });
            break;
    }
});

registry.enableDebug(debug);
```

### Error-Only Monitoring

Filter events to only capture errors — useful for production alerting:

```typescript
const alertObserver = createDebugObserver((event) => {
    if (event.type === 'error') {
        logger.error(`MCP pipeline error`, {
            tool: event.tool,
            action: event.action,
            error: event.error,
            step: event.step,
        });
    }
    if (event.type === 'execute' && event.isError) {
        logger.warn(`MCP handler returned error`, {
            tool: event.tool,
            action: event.action,
            durationMs: event.durationMs,
        });
    }
});
```

### Latency Tracking

Track slow handlers and identify performance bottlenecks:

```typescript
const SLOW_THRESHOLD_MS = 100;

const latencyObserver = createDebugObserver((event) => {
    if (event.type === 'execute' && event.durationMs > SLOW_THRESHOLD_MS) {
        console.warn(
            `⚠️ Slow handler: ${event.tool}/${event.action} took ${event.durationMs.toFixed(1)}ms`
        );
    }
    if (event.type === 'validate' && event.durationMs > 10) {
        console.warn(
            `⚠️ Slow validation: ${event.tool}/${event.action} took ${event.durationMs.toFixed(1)}ms`
        );
    }
});
```

### Structured Event Collector

Collect all events into a structured log for batch processing:

```typescript
const eventLog: DebugEvent[] = [];
const collector = createDebugObserver((event) => eventLog.push(event));

registry.enableDebug(collector);

// After some calls...
const summary = {
    totalCalls: eventLog.filter(e => e.type === 'route').length,
    errors: eventLog.filter(e => e.type === 'error').length,
    avgDuration: eventLog
        .filter((e): e is ExecuteEvent => e.type === 'execute')
        .reduce((sum, e) => sum + e.durationMs, 0) / eventLog.filter(e => e.type === 'execute').length,
};
```

---

## API Reference

### Types

| Type | Description |
|---|---|
| `DebugEvent` | Discriminated union: `RouteEvent \| ValidateEvent \| MiddlewareEvent \| ExecuteEvent \| ErrorEvent` |
| `DebugObserverFn` | `(event: DebugEvent) => void` — the observer function signature |
| `RouteEvent` | `{ type: 'route', tool, action, timestamp }` |
| `ValidateEvent` | `{ type: 'validate', tool, action, valid, error?, durationMs, timestamp }` |
| `MiddlewareEvent` | `{ type: 'middleware', tool, action, chainLength, timestamp }` |
| `ExecuteEvent` | `{ type: 'execute', tool, action, durationMs, isError, timestamp }` |
| `ErrorEvent` | `{ type: 'error', tool, action, error, step, timestamp }` |

### Functions

| Function | Description |
|---|---|
| `createDebugObserver()` | Factory — returns a `DebugObserverFn` with default console output |
| `createDebugObserver(handler)` | Factory — returns the custom handler directly |

### Builder Methods

| Method | On | Description |
|---|---|---|
| `.debug(observer)` | `createTool` / `defineTool` | Attach observer to a single tool |
| `.enableDebug(observer)` | `ToolRegistry` | Propagate observer to all registered builders |

### AttachOptions

| Field | Type | Description |
|---|---|---|
| `debug` | `DebugObserverFn?` | Pass to `attachToServer()` for full server observability |
