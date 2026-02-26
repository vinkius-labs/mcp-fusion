# Observability & Audit

MCP Fusion provides structured observability through `createDebugObserver()` — a typed event stream that emits one event per pipeline stage, capturing the full request lifecycle.


## createDebugObserver {#debug-observer}

The observer is configured in `attachToServer()`. Without arguments, it prints all events to `console.debug` — sufficient for development:

```typescript
attachToServer(server, registry, {
  debug: createDebugObserver(),
});
```

For production, pass a handler function. The handler receives a `DebugEvent` — a discriminated union where `event.type` determines available fields. TypeScript narrows the type automatically:

```typescript
debug: createDebugObserver((event) => {
  if (event.type === 'execute') {
    // TypeScript knows: event.tool, event.durationMs, event.isError
  }
}),
```

The observer captures everything that happens _before_ your handler runs — authentication failures, validation errors, routing misses. Without it, failed requests are invisible.


## The Six Event Types

The pipeline emits events in order. Each captures a different stage:

| Type | When | Key Fields |
|---|---|---|
| `route` | Tool name resolved | `tool`, `action`, `timestamp` |
| `validate` | Zod parsed input | `tool`, `isError`, `durationMs` |
| `middleware` | Chain starts | `tool`, `chainLength` |
| `execute` | Handler completes | `tool`, `durationMs`, `isError` |
| `error` | Any stage throws | `tool`, `step`, `error` |
| `governance` | Governance ops run | `operation`, `outcome`, `durationMs` |

The `error` event includes `step` — which pipeline stage threw (`'route'`, `'validate'`, `'middleware'`, or `'execute'`). This is the difference between "the handler crashed" and "authentication failed." Without step attribution, all errors look the same.

### Routing Events

The `route` event fires _before_ any middleware or validation. If the tool doesn't exist, `route` fires followed by `error`. Your audit trail captures _attempted_ access to nonexistent tools:

```typescript
if (event.type === 'route') {
  console.log(`Routing: ${event.tool}/${event.action}`);
}
```

### Execution Events

The most commonly used for dashboards. Answers "who did what when, how long, did it succeed":

```typescript
if (event.type === 'execute') {
  auditLog.write(JSON.stringify({
    tool: event.tool, durationMs: event.durationMs,
    isError: event.isError, timestamp: event.timestamp,
  }));
}
```

### Error Events

The `step` field tells you _where_ the error occurred. Middleware failures are security-relevant — someone attempted access they don't have:

```typescript
if (event.type === 'error') {
  console.error(`[${event.step}] ${event.tool}: ${event.error}`);
}
```

`event.durationMs` is only available on `execute`, `validate`, and `governance` events. Every event includes `timestamp` (ISO 8601).


## Building an Audit Trail {#audit-trail}

A production audit trail answers four questions: _who_ (identity), _what_ (tool), _when_ (timestamp), and _outcome_ (success/failure). Capture successful executions and rejected requests in one observer:

```typescript
const auditObserver = createDebugObserver((event) => {
  if (event.type === 'execute') {
    auditLog.write({ tool: event.tool, durationMs: event.durationMs, success: !event.isError, timestamp: event.timestamp });
  }
  if (event.type === 'error' && event.step === 'middleware') {
    securityLog.write({ tool: event.tool, step: event.step, error: String(event.error), severity: 'WARN' });
  }
});
```

Middleware failures become `WARN` (expected security events). Handler errors become `ERROR` (unexpected, need investigation). This severity mapping gives your SOC team meaningful signal without alert fatigue.

### SOC 2 Control Mapping

| SOC 2 Control | MCP Fusion Mechanism | Event Type |
|---|---|---|
| CC6.1 — Logical access | Middleware + tag filtering | `middleware`, `route` |
| CC6.2 — Authentication | `contextFactory` + JWT | `middleware` (on failure) |
| CC6.3 — Authorization | Role checks | `middleware`, `execute` |
| CC7.2 — Anomaly detection | Duration tracking | `execute` (durationMs) |
| CC8.1 — Change management | Governance lockfile | `governance` |

The events don't _implement_ these controls — your middleware and Presenters do. The events _prove_ the controls are operating, which is what auditors need.


## SIEM Forwarding {#siem}

For security operations teams using Splunk, Elastic, or Datadog, the observer can forward events as structured JSON:

```typescript
debug: createDebugObserver(async (event) => {
  if (event.type === 'execute' || event.type === 'error') {
    await siem.send({
      source: 'mcp-fusion',
      severity: event.type === 'error' && event.step === 'middleware' ? 'WARN' : 'ERROR',
      tool: event.tool,
      timestamp: event.timestamp,
    });
  }
}),
```

The event shape is stable across MCP Fusion versions — it's part of the public API. Your SIEM integration won't break on upgrades.

For high-throughput servers, batch writes instead of one HTTP request per event. Buffer in memory, flush every N seconds or N events:

```typescript
const buffer: DebugEvent[] = [];
setInterval(() => {
  if (buffer.length) siem.sendBatch(buffer.splice(0));
}, 5000);
```


## OpenTelemetry Tracing {#otel}

`attachToServer` accepts a `tracing` option compatible with OpenTelemetry's `Tracer`. Each tool call becomes a span in your existing tracing infrastructure:

```typescript
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('mcp-fusion', '1.0.0');

attachToServer(server, registry, { tracing: tracer });
```

MCP tool calls become first-class nodes in distributed traces — visible in Jaeger, Datadog, Honeycomb, or any OTel-compatible backend. If the handler calls downstream services (databases, HTTP APIs), the span propagates automatically.

### Span Attributes

| Attribute | Description |
|---|---|
| `mcp.tool` | Tool name (e.g., `users.list`) |
| `mcp.tags` | Tags declared on the tool |
| `mcp.duration_ms` | Total execution time |

These enable queries like: "show all `admin.*` spans with duration > 500ms" or "all error spans in `orders` from the last hour."

### Observer + OTel Together

The two mechanisms are complementary. The observer gives completeness (every rejection, every validation failure). OTel gives correlation (tracing a call through middleware → database → notification service):

```typescript
attachToServer(server, registry, {
  debug: createDebugObserver((event) => { /* audit trail */ }),
  tracing: tracer,  // distributed traces
});
```

You can enable one without the other. The debug observer has no dependency on OpenTelemetry.


## Governance Events {#governance-events}

When the [governance stack](/governance/) is active, the observer also receives `governance` events — contract compilation, lockfile verification, attestation signing:

```typescript
if (event.type === 'governance') {
  console.log(`${event.operation}: ${event.outcome}`); // e.g., "lockfile.check: ok"
}
```

| Operation | When It Fires |
|---|---|
| `contract.compile` | Contract compiled from registry |
| `contract.diff` | Two contracts compared |
| `lockfile.check` | Lockfile validated against registry |
| `attestation.verify` | Digital signature verified |
| `entitlement.scan` | Tool entitlements scanned |
| `token.profile` | Token cost profiling computed |

These events prove compliance: the lockfile was verified before deployment, attestation was checked at startup, and contract diffing caught a breaking change before it reached production. No governance stack → no governance events.


## Introspection API {#introspection}

The `introspection` option exposes runtime metadata as an MCP Resource at `fusion://manifest.json`. Compliance dashboards and monitoring systems can query the server's capability surface programmatically:

```typescript
attachToServer(server, registry, {
  introspection: { enabled: true },
});
```

The manifest includes all tool names, tags, input/output schemas, and [MCP annotations](https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tools/#annotations). Since the registry is frozen after `attachToServer()`, the manifest is immutable — snapshot it in CI and diff against the previous version to detect capability drift.


## SOC 2 Alignment {#soc2}

MCP Fusion's observability primitives map directly to SOC 2 trust service criteria:

| SOC 2 Control | MCP Fusion Mechanism | Evidence |
|---|---|---|
| **CC6.1** — Logical access | Middleware + tag filtering | `middleware` and `route` events |
| **CC6.2** — Authentication | `contextFactory` + JWT | `middleware` failure events |
| **CC6.3** — Access monitoring | `createDebugObserver()` | Typed, timestamped events including rejections |
| **CC6.6** — Data protection | Presenter schema stripping | Sensitive fields never leave server boundary |
| **CC7.2** — System monitoring | OTel tracing | Tool calls as distributed trace spans |
| **CC8.1** — Change management | Capability lockfile | `governance` events |

Each row represents an auditor question you can answer with evidence generated automatically. The framework provides the mechanisms; your team configures and retains them.

MCP Fusion provides the _mechanisms_ for SOC 2 compliance, not the _certification_. You still need to configure correctly, retain logs, and demonstrate ongoing operational compliance.
