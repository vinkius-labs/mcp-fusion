# Tracing

**MCP Fusion** provides native **OpenTelemetry-compatible tracing** for AI-native MCP servers. Every tool call produces one span with rich semantic attributes — zero dependencies, zero overhead when disabled.

::: tip One-line setup
```typescript
registry.attachToServer(server, { tracing: trace.getTracer('mcp-fusion') });
```
:::

---

## Why Tracing Matters for AI Agents

AI agents fail differently than humans. A human clicks the wrong button once. An AI sends invalid parameters **hundreds of times per day** — and that's expected behavior. It's exploring, retrying, self-correcting.

Traditional APM treats every error equally: `SpanStatusCode.ERROR` → PagerDuty → dev wakes up at 3 AM. In production AI systems, this creates **alert fatigue**. The team ignores alerts, and when the database actually crashes, nobody notices.

**MCP Fusion** solves this with **semantic error classification**: AI mistakes and infrastructure failures produce different span signals, so your monitoring can distinguish between "the AI sent wrong params" and "the database is down."

---

## Quick Start

### Per-Tool

::: code-group
```typescript [f.tool() — Recommended ✨]
import { trace } from '@opentelemetry/api';
import { initFusion } from '@vinkius-core/mcp-fusion';

const tracer = trace.getTracer('mcp-fusion');
const f = initFusion<AppContext>();

// With f.tool(), tracing is configured at registry/server level:
const registry = f.registry();
registry.enableTracing(tracer);
```
```typescript [createTool]
import { trace } from '@opentelemetry/api';
import { createTool, success } from '@vinkius-core/mcp-fusion';

const tracer = trace.getTracer('mcp-fusion');

const tool = createTool<AppContext>('projects')
    .tracing(tracer)
    .action({
        name: 'list',
        handler: async (ctx) => success(await ctx.db.projects.findMany()),
    });
```
:::

### Registry-Level

```typescript
const registry = new ToolRegistry<AppContext>();
registry.register(projectsTool);
registry.register(billingTool);

registry.enableTracing(trace.getTracer('mcp-fusion'));
// → all registered tools now emit spans
```

### Server Attachment <Badge type="tip" text="recommended" />

```typescript
registry.attachToServer(server, {
    contextFactory: createAppContext,
    tracing: trace.getTracer('mcp-fusion'),
});
```

---

## Error Classification

**MCP Fusion** classifies every span into one of **six outcomes**. This is the most important design decision in the tracing system.

### The Classification Matrix

| Scenario | `SpanStatusCode` | `mcp.error_type` | `mcp.isError` | PagerDuty? |
|---|---|---|---|---|
| Handler returns `success()` | **OK** (1) | — | `false` | ❌ |
| Handler returns `error()` | UNSET (0) | `handler_returned_error` | `true` | ❌ |
| Validation failure | UNSET (0) | `validation_failed` | `true` | ❌ |
| Missing discriminator | UNSET (0) | `missing_discriminator` | `true` | ❌ |
| Unknown action | UNSET (0) | `unknown_action` | `true` | ❌ |
| Handler throws (`throw new Error`) | **ERROR** (2) | `system_error` | `true` | ✅ |

### Why AI Errors Don't Trigger Alerts

Rows 2–5 use `SpanStatusCode.UNSET` instead of `ERROR`. This is intentional:

> **`SpanStatusCode.ERROR`** means *"something is broken in the infrastructure and ops needs to act."*
>
> **`SpanStatusCode.UNSET`** means *"the operation completed, but the outcome was not successful."*

When the AI sends `{ action: "users.listt" }` (typo), that's not a server problem — it's the AI exploring. The MCP protocol returns an error response, the AI self-corrects, and life goes on. If this triggered PagerDuty, your on-call engineer would see hundreds of false alerts per hour.

But when the handler throws because PostgreSQL is down, that's a **real infrastructure failure**. `SpanStatusCode.ERROR` + `recordException()` fires, and PagerDuty wakes up the right person.

### Monitoring AI Error Rates

Even though AI errors don't trigger `SpanStatusCode.ERROR`, you still have **full visibility**. The `mcp.isError` attribute and `mcp.error_type` attribute are set on every error path, enabling rate-based alerting:

::: code-group

```txt [PagerDuty — Infrastructure]
# Only fires when the server is actually broken
SpanStatusCode:ERROR service:mcp-fusion
```

```txt [Datadog Monitor — AI Error Rate]
# Alert if >50% of calls fail validation (broken prompt?)
count(mcp.error_type:validation_failed) / count(*) > 0.5
```

```txt [Datadog Monitor — Unknown Actions]
# Alert if AI keeps hitting non-existent actions (stale model?)
count(mcp.error_type:unknown_action) > 10 per 5m
```

```txt [Grafana Dashboard — Business Errors]
# Track handler error rate for SLO dashboards
count(mcp.error_type:handler_returned_error) / count(*) > 0.3
```

:::

This layered approach gives you:
- **Infra alerts** → PagerDuty via `SpanStatusCode.ERROR` (wake up the dev)
- **AI health monitors** → Datadog/Grafana via `mcp.error_type` rate thresholds (notification, not page)
- **Business dashboards** → filtered by `mcp.isError:true` for overall error visibility

---

## Span Attributes

Every span includes rich metadata for filtering, dashboards, and billing.

### Core <Badge type="info" text="always present" />

| Attribute | Type | Example | Description |
|---|---|---|---|
| `mcp.system` | `string` | `"fusion"` | Framework identifier |
| `mcp.tool` | `string` | `"projects"` | Tool name |
| `mcp.durationMs` | `number` | `14.3` | Total execution time |
| `mcp.isError` | `boolean` | `false` | Unified error flag across all paths |
| `mcp.response_size` | `number` | `2048` | Response text length (billing/quota) |

### Routing <Badge type="info" text="after routing" />

| Attribute | Type | Example | Description |
|---|---|---|---|
| `mcp.action` | `string` | `"list"` | Resolved action name |
| `mcp.error_type` | `string` | `"validation_failed"` | Error classification label |

### Enterprise Metadata <Badge type="tip" text="conditional" />

| Attribute | Type | Example | Description |
|---|---|---|---|
| `mcp.tags` | `string[]` | `["admin", "pci"]` | Tool tags — Datadog facet filtering |
| `mcp.description` | `string` | `"Manages billing"` | Tool description — trace context |

#### Using Tags for Dashboard Filtering

```typescript
const tool = createTool<void>('billing')
    .tags('admin', 'finance', 'pci')
    .description('Manages billing and invoicing')
    .tracing(tracer)
    .action({ name: 'charge', handler: ... });
```

```txt
# Datadog: find all PCI-scoped tool calls
mcp.tags:pci service:mcp-fusion

# Grafana: filter to admin tools only
{mcp_tags=~".*admin.*"}
```

---

## Pipeline Events

Each span contains structured **events** that trace the internal execution pipeline:

| Event | Attributes | When |
|---|---|---|
| `mcp.route` | — | Discriminator resolved successfully |
| `mcp.validate` | `mcp.valid`, `mcp.durationMs` | After Zod validation (pass or fail) |
| `mcp.middleware` | `mcp.chainLength` | When middleware chain exists |

Events use optional chaining (`addEvent?.()`), so tracers that don't implement `addEvent` work without errors.

---

## FusionTracer Interface

**MCP Fusion** uses **structural subtyping** — no `implements` keyword, no `import @opentelemetry/api` required. Any object that matches the shape works:

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

The real `@opentelemetry/api` `Tracer` satisfies `FusionTracer` automatically:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('mcp-fusion');
// ✅ tracer satisfies FusionTracer — no wrapper needed
```

---

## SpanStatusCode Constants

**MCP Fusion** exports OTel-compatible constants:

```typescript
import { SpanStatusCode } from '@vinkius-core/mcp-fusion';

SpanStatusCode.UNSET  // 0 — default, AI errors
SpanStatusCode.OK     // 1 — successful execution
SpanStatusCode.ERROR  // 2 — system failure → triggers alerts
```

---

## Coexistence with Debug

Both tracing and debug can be enabled. When both are set on a tool, **tracing takes precedence** — debug events are not emitted to avoid duplicate overhead.

```typescript
registry.enableDebug(createDebugObserver());
registry.enableTracing(tracer);
// ⚠️ Warning: Both tracing and debug are enabled.
//    Tracing takes precedence; debug events will not be emitted.
```

The warning is **symmetric** — it fires regardless of which is enabled first.

---

## Graceful Error Handling

When a handler throws, **MCP Fusion** **does not crash the server**. The exception is caught, the span is marked with `SpanStatusCode.ERROR` + `recordException()`, and a graceful error response is returned to the MCP client:

```
Handler throws → catch block:
  1. span.recordException(err)          ← ops alerting
  2. span.setAttribute('mcp.error_type', 'system_error')
  3. span.setStatus({ code: ERROR })    ← PagerDuty fires
  4. return error("[tool] message")      ← graceful MCP response
```

The span captures everything ops needs for diagnosis `while the server stays alive.

---

## Span Lifecycle Guarantees

```
span = tracer.startSpan(...)
try {
    // route → validate → middleware → execute
} catch {
    // recordException + ERROR status
} finally {
    span.setAttribute('mcp.durationMs', ...)
    span.setAttribute('mcp.response_size', ...)
    span.setStatus(...)
    span.end()  // ← ALWAYS called, even on throw
}
```

The `finally` block guarantees:
- **No span leaks** — `span.end()` is always called
- **Duration is always recorded** — even on exceptions
- **Response size is always recorded** — for billing accuracy

---

## Context Propagation

Since **MCP Fusion** doesn't depend on `@opentelemetry/api`, it cannot inject span context into the OpenTelemetry context. Auto-instrumented downstream calls (Prisma, HTTP, Redis) will appear as **sibling spans**, not children.

This is an intentional trade-off for zero runtime dependencies.

::: details Manual context propagation (workaround)
```typescript
import { context, trace } from '@opentelemetry/api';

const tool = createTool<AppCtx>('db')
    .tracing(trace.getTracer('mcp-fusion'))
    .action({
        name: 'query',
        handler: async (ctx, args) => {
            const span = trace.getActiveSpan();
            return context.with(
                trace.setSpan(context.active(), span!),
                async () => {
                    const result = await ctx.db.query(args.sql);
                    return success(result);
                }
            );
        },
    });
```
:::

---

## Production Setup

Complete OTLP setup with Jaeger, Datadog, or any OTel-compatible backend:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { trace } from '@opentelemetry/api';
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

// 1. Configure OpenTelemetry SDK
const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
        url: process.env.OTLP_ENDPOINT ?? 'http://localhost:4317',
    }),
    serviceName: 'my-mcp-server',
});
sdk.start();

// 2. Create tracer
const tracer = trace.getTracer('mcp-fusion', '1.0.0');

// 3. Attach to server — one line enables tracing for everything
const registry = new ToolRegistry<AppContext>();
registry.register(projectsTool);
registry.register(billingTool);
registry.register(usersTool);

registry.attachToServer(server, {
    contextFactory: createAppContext,
    tracing: tracer,
});
```

Spans appear in Jaeger, Datadog, New Relic, Grafana Tempo, or any OTLP-compatible backend — with full semantic attributes, error classification, and pipeline events.

---

## Zero Overhead Guarantee

When no tracer is set, **MCP Fusion** takes the **fast path** — a completely separate code path with zero tracing logic:

- No `startSpan()` calls
- No `setAttribute()` calls
- No `performance.now()` timing
- No object allocations for span data

The tracing path only activates when `.tracing(tracer)` or `enableTracing(tracer)` is explicitly called.
