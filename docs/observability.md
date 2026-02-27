# Observability

- [Introduction](#introduction)
- [Quick Start](#quickstart)
- [Attachment Levels](#levels)
- [createDebugObserver()](#factory)
- [Event Types](#events)
- [Practical Patterns](#patterns)
- [Governance Observability](#governance)

## Introduction {#introduction}

Debugging MCP tool calls is hard — the LLM sends a request, your server processes it through validation, middleware, and handlers, and the response goes back. Without observability, you're blind to what happened between request and response.

MCP Fusion emits structured events at each pipeline stage. When debug is off (default), the hot path has **zero runtime overhead** — no conditionals, no observer objects, no `Date.now()` calls. Events only flow when you opt in.

## Quick Start {#quickstart}

```typescript
import { ToolRegistry, createDebugObserver } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projectsTool, usersTool, billingTool);

registry.attachToServer(server, {
  contextFactory: (extra) => createAppContext(extra),
  debug: createDebugObserver(),
});
```

```
[mcp-fusion] route     projects/list
[mcp-fusion] validate  projects/list ✓ 0.2ms
[mcp-fusion] execute   projects/list ✓ 14.3ms
```

## Attachment Levels {#levels}

**Per-tool** — attach to a single tool during development:

```typescript
const tool = f.query('users.list')
  .describe('List users')
  .handle(async (input, ctx) => { /* ... */ });

// Attach debug after building (via GroupedToolBuilder)
tool.debug(createDebugObserver());
```

**Registry-wide** — propagate to every registered builder:

```typescript
registry.enableDebug(createDebugObserver());
```

**Server-wide** — pass as `AttachOptions.debug` (calls `enableDebug()` internally). One entry point, full pipeline visibility.

## createDebugObserver() {#factory}

```typescript
import { createDebugObserver } from '@vinkius-core/mcp-fusion';

// Default — pretty console.debug output
const observer = createDebugObserver();

// Custom — receive typed DebugEvent objects
const observer = createDebugObserver((event) => {
  myTelemetry.record(event.type, {
    tool: event.tool,
    action: event.action,
    timestamp: event.timestamp,
  });
});
```

No argument → formats events to `console.debug`. With a handler function → returns that function directly. Type signature: `DebugObserverFn = (event: DebugEvent) => void`.

## Event Types {#events}

Every event has `type`, `tool`, `action`, and `timestamp`. The `type` field is the discriminant for exhaustive `switch` handling.

**RouteEvent** — first event, call matched to a tool and action:
```typescript
{ type: 'route', tool: 'projects', action: 'list', timestamp: 1740195418000 }
```

**ValidateEvent** — after Zod validation, includes duration and pass/fail:
```typescript
{ type: 'validate', tool: 'projects', action: 'create', valid: true, durationMs: 0.3, timestamp: ... }
{ type: 'validate', tool: 'projects', action: 'create', valid: false, error: 'Validation failed', durationMs: 0.1, timestamp: ... }
```

**MiddlewareEvent** — when middleware chain starts (skipped when no middleware):
```typescript
{ type: 'middleware', tool: 'projects', action: 'create', chainLength: 3, timestamp: ... }
```

**ExecuteEvent** — handler completed, contains total pipeline duration:
```typescript
{ type: 'execute', tool: 'projects', action: 'list', durationMs: 14.3, isError: false, timestamp: ... }
```

**ErrorEvent** — unrecoverable routing errors. `step` indicates where: `'route'`, `'validate'`, `'middleware'`, or `'execute'`:
```typescript
{ type: 'error', tool: 'unknown_tool', action: '?', error: 'Unknown tool', step: 'route', timestamp: ... }
```

Pipeline order: `route → validate → middleware → execute`. Validation failure short-circuits after `validate`. No middleware → `middleware` event skipped. Unknown action → only `error`.

## Practical Patterns {#patterns}

### Telemetry Integration

```typescript
const observer = createDebugObserver((event) => {
  switch (event.type) {
    case 'execute':
      histogram.record(event.durationMs, {
        tool: event.tool,
        action: event.action,
        status: event.isError ? 'error' : 'success',
      });
      break;
    case 'error':
      errorCounter.add(1, { tool: event.tool, step: event.step });
      break;
  }
});
```

### Latency Alerting

```typescript
const observer = createDebugObserver((event) => {
  if (event.type === 'execute' && event.durationMs > 100) {
    console.warn(`Slow handler: ${event.tool}/${event.action} took ${event.durationMs.toFixed(1)}ms`);
  }
});
```

### Error-Only (Production)

```typescript
const observer = createDebugObserver((event) => {
  if (event.type === 'error') {
    logger.error('MCP pipeline error', { tool: event.tool, error: event.error, step: event.step });
  }
  if (event.type === 'execute' && event.isError) {
    logger.warn('Handler returned error', { tool: event.tool, action: event.action });
  }
});
```

## Governance Observability {#governance}

The [governance](/governance/) stack emits `GovernanceEvent` objects through the same `DebugObserverFn` pipeline.

```typescript
{
  type: 'governance',
  operation: 'lockfile.generate',
  label: 'Generate lockfile for payments-api',
  outcome: 'success',
  detail: '12 tools, 3 prompts',
  durationMs: 4.2,
  timestamp: 1740195418000
}
```

`operation` is one of: `'contract.compile'`, `'contract.diff'`, `'digest.compute'`, `'lockfile.generate'`, `'lockfile.check'`, `'lockfile.write'`, `'lockfile.read'`, `'attestation.sign'`, `'attestation.verify'`, `'entitlement.scan'`, `'token.profile'`. `outcome` is `'success'`, `'failure'`, or `'drift'`. `detail` is optional context.

**`createGovernanceObserver()`** wraps governance operations with debug events and optional tracing spans:

```typescript
import { createGovernanceObserver, createNoopObserver } from '@vinkius-core/mcp-fusion/introspection';

const observer = createGovernanceObserver({
  debug: createDebugObserver(),
  tracer: myOtelTracer,  // optional
});

// Zero-overhead passthrough
const noop = createNoopObserver();
```

Usage with `observe()` / `observeAsync()`:

```typescript
const lockfile = observer.observe(
  'lockfile.generate',
  'Generate lockfile for payments-api',
  () => generateLockfile('payments-api', contracts, version),
);

const attestation = await observer.observeAsync(
  'attestation.sign',
  'Sign server digest',
  () => attestServerDigest(digest, signer),
);
```

Each call emits a `GovernanceEvent` to the debug observer and (if configured) creates a tracing span. On failure, the span records the exception.
