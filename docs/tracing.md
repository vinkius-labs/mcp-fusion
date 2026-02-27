# Tracing

Every tool call can produce an OpenTelemetry-compatible span with semantic error classification. Zero dependencies — Fusion uses structural subtyping, not `import @opentelemetry/api`. Zero overhead when disabled — a completely separate code path runs.

## Quick Start {#quickstart}

```typescript
import { trace } from '@opentelemetry/api';
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projectsTool, billingTool, usersTool);

registry.attachToServer(server, {
  contextFactory: createAppContext,
  tracing: trace.getTracer('mcp-fusion'),
});
```

All tools now emit spans. Also available per-tool (`.tracing(tracer)`) or registry-wide (`registry.enableTracing(tracer)`).

## Error Classification {#errors}

AI agents fail differently than humans. An LLM sends invalid parameters hundreds of times while self-correcting. If every validation failure set `SpanStatusCode.ERROR`, your on-call engineer would drown in false alerts.

| Scenario | `SpanStatusCode` | `mcp.error_type` | `recordException`? |
|---|---|---|---|
| Handler returns `success()` | `OK` (1) | — | No |
| Handler returns `error()` | `UNSET` (0) | `handler_returned_error` | No |
| Validation failure | `UNSET` (0) | `validation_failed` | No |
| Missing discriminator | `UNSET` (0) | `missing_discriminator` | No |
| Unknown action | `UNSET` (0) | `unknown_action` | No |
| Handler throws | `ERROR` (2) | `system_error` | **Yes** |

Only an unhandled exception sets `ERROR`. Everything else uses `UNSET` — the AI self-corrects, the server stays alive.

```
# PagerDuty: only infra failures
SpanStatusCode:ERROR service:mcp-fusion

# Datadog: AI error rate
count(mcp.error_type:validation_failed) / count(*) > 0.5

# Grafana: handler error rate for SLO
count(mcp.error_type:handler_returned_error) / count(*) > 0.3
```

## Span Attributes {#attributes}

Every span includes: `mcp.system` ("fusion"), `mcp.tool` (tool name), `mcp.durationMs` (total execution time), `mcp.isError` (boolean), `mcp.response_size` (response text length).

Routing attributes: `mcp.action` (resolved action), `mcp.error_type` (classification label).

Conditional attributes: `mcp.tags` (string[], when configured), `mcp.description` (when configured). Tags enable dashboard filtering:

```
# Datadog: PCI-scoped calls
mcp.tags:pci service:mcp-fusion

# Grafana: admin tools only
{mcp_tags=~".*admin.*"}
```

## Pipeline Events {#pipeline}

Each span contains structured events tracing internal execution:

| Event | Attributes | When |
|---|---|---|
| `mcp.route` | — | Discriminator resolved |
| `mcp.validate` | `mcp.valid`, `mcp.durationMs` | After Zod validation |
| `mcp.middleware` | `mcp.chainLength` | When middleware chain exists |

Events use optional chaining (`addEvent?.()`), so tracers that don't implement `addEvent` work fine.

## FusionTracer Interface {#interface}

Any object with the right shape works. The real `@opentelemetry/api` `Tracer` satisfies this automatically:

```typescript
interface FusionTracer {
  startSpan(name: string, options?: {
    attributes?: Record<string, string | number | boolean | ReadonlyArray<string>>;
  }): FusionSpan;
}

interface FusionSpan {
  setAttribute(key: string, value: string | number | boolean | ReadonlyArray<string>): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
  recordException(exception: Error | string): void;
  addEvent?(name: string, attributes?: Record<string, string | number | boolean>): void;
}
```

`SpanStatusCode` constants: `UNSET` (0), `OK` (1), `ERROR` (2) — exported from `@vinkius-core/mcp-fusion`.

## Coexistence with Debug {#coexistence}

Both tracing and debug can be configured, but tracing takes precedence. When both are set, debug events are not emitted to avoid duplicate overhead:

```typescript
registry.enableDebug(createDebugObserver());
registry.enableTracing(tracer);
// ⚠️ Warning: Tracing takes precedence; debug events will not be emitted.
```

## Span Lifecycle {#lifecycle}

```text
span = tracer.startSpan(...)
try {
    route → validate → middleware → execute
} catch {
    recordException + ERROR status
} finally {
    setAttribute('mcp.durationMs', ...)
    setAttribute('mcp.response_size', ...)
    setStatus(...)
    span.end()  // always called
}
```

The `finally` block guarantees no span leaks — duration and response size recorded even on exceptions.

## Context Propagation {#propagation}

Fusion doesn't depend on `@opentelemetry/api`, so it cannot inject span context automatically. Auto-instrumented downstream calls (Prisma, HTTP, Redis) appear as sibling spans, not children. For manual propagation:

```typescript
import { context, trace } from '@opentelemetry/api';

const dbQuery = f.query('db.query')
  .describe('Run a database query')
  .input({ sql: f.string() })
  .resolve(async ({ input, ctx }) => {
    const span = trace.getActiveSpan();
    return context.with(
      trace.setSpan(context.active(), span!),
      () => ctx.db.query(input.sql),
    );
  });
```

## Production Setup {#production}

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { trace } from '@opentelemetry/api';
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTLP_ENDPOINT ?? 'http://localhost:4317',
  }),
  serviceName: 'my-mcp-server',
});
sdk.start();

const tracer = trace.getTracer('mcp-fusion', '1.0.0');

const registry = new ToolRegistry<AppContext>();
registry.registerAll(projectsTool, billingTool, usersTool);

registry.attachToServer(server, {
  contextFactory: createAppContext,
  tracing: tracer,
});
```

Spans appear in Jaeger, Datadog, Grafana Tempo, or any OTLP-compatible backend.
