# Tracing & Observability

- [Introduction](#introduction)
- [Enabling Tracing](#enabling)
- [Debug Observer](#debug)
- [Production Metrics via Middleware](#metrics)
- [Error Monitoring](#errors)

## Introduction {#introduction}

When an agent chains five tool calls across three middleware layers, debugging failures requires knowing *where* time was spent and *where* errors occurred. MCP Fusion supports two observability modes: **OpenTelemetry tracing** and a lightweight **debug observer** — both configured via `attachToServer()`.

## Enabling Tracing {#enabling}

Pass an OpenTelemetry `Tracer` instance to `attachToServer()`. The framework automatically creates spans for every tool call and registry routing:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('mcp-fusion');

registry.attachToServer(server, {
  contextFactory: createContext,
  tracing: tracer,
});
```

Every tool call now emits an OTel span with `mcp.system: fusion` and `mcp.tool: <name>` attributes. Unknown tool routing errors get their own spans too.

You can also enable tracing directly on the registry:

```typescript
registry.enableTracing(tracer);
```

This propagates the tracer to every registered builder via duck-typed `.tracing()` method.

> [!NOTE]
> MCP Fusion intentionally has zero dependency on `@opentelemetry/api`. The `tracing` option accepts any object that implements the `FusionTracer` interface (same shape as OTel's `Tracer`). Auto-instrumented downstream calls (Prisma, HTTP, Redis) will appear as **siblings**, not children, of the MCP span.

## Debug Observer {#debug}

For development, use the lightweight debug observer instead of full OTel:

```typescript
import { createDebugObserver } from '@vinkius-core/mcp-fusion';

const debug = createDebugObserver();

registry.attachToServer(server, {
  contextFactory: createContext,
  debug,
});
```

Or apply directly to the registry:

```typescript
registry.enableDebug(debug);
```

The debug observer emits structured events for every step in the pipeline: routing, validation, handler execution, and errors. Each event includes `type`, `tool`, `action`, `step`, `timestamp`, and `error` fields.

> [!WARNING]
> When both `tracing` and `debug` are enabled, tracing takes precedence — debug events will not be emitted from tool builders.

## Production Metrics via Middleware {#metrics}

For custom metrics (Prometheus, StatsD, Datadog), use middleware to capture timing and counters:

```typescript
const withMetrics = f.middleware(async (ctx) => {
  return { _metricsStart: process.hrtime.bigint() };
});

export const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by ID')
  .use(withMetrics)
  .withString('id', 'Invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({ where: { id: input.id } });
    const duration = Number(process.hrtime.bigint() - ctx._metricsStart) / 1e6;
    metrics.histogram('mcp.tool.duration_ms', duration, { tool: 'billing.get_invoice' });
    return invoice;
  });
```

## Error Monitoring {#errors}

Integrate with Sentry, Bugsnag, or any error tracker via `try/catch` in handlers:

```typescript
export const chargeInvoice = f.mutation('billing.charge')
  .describe('Process a payment')
  .use(withAuth)
  .withString('invoice_id', 'Invoice ID')
  .handle(async (input, ctx) => {
    try {
      const result = await ctx.paymentGateway.charge(input.invoice_id);
      return success(result);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { tool: 'billing.charge', tenant: ctx.tenantId },
      });
      return toolError('PaymentFailed', {
        message: 'Payment processing failed.',
        suggestion: 'Check the payment method and retry.',
      });
    }
  });
```

> [!TIP]
> Unhandled exceptions in handlers are caught by the framework and returned as `isError: true` responses — your server never crashes. But explicit `try/catch` lets you log, report, and return structured `toolError()` recovery.