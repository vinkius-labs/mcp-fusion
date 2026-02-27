# Observability

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Logging Middleware](#logging-middleware)
- [Metrics via Middleware](#metrics)
- [Error Monitoring](#errors)

## Introduction {#introduction}

Production MCP servers need observability: how many tool calls per minute, which tools are slowest, which tenants are most active. MCP Fusion doesn't ship a built-in observability layer — instead, the middleware system gives you full control to integrate with any stack: structured logging, Prometheus, Datadog, StatsD, or Sentry.

The pattern is simple: create a shared middleware that captures timing and context, then apply it to all your tools via a [functional group](/cookbook/functional-groups). These patterns work identically on Stdio, [Vercel Edge Functions](/vercel-adapter) (pass `debug` via `attachOptions`), and [Cloudflare Workers](/cloudflare-adapter) (use `executionCtx.waitUntil()` to flush metrics without blocking the response).

## Logging Middleware {#logging-middleware}

A single middleware that logs every tool call:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const withLogging = f.middleware(async (ctx) => {
  const start = Date.now();
  return {
    _logStart: start,
    _log: (tool: string, extra?: Record<string, unknown>) => {
      console.log(JSON.stringify({
        tool,
        tenant: ctx.tenantId,
        duration_ms: Date.now() - start,
        timestamp: new Date().toISOString(),
        ...extra,
      }));
    },
  };
});
```

Apply it to all tools via a functional group:

```typescript
const logged = f.group().use(withAuth).use(withLogging);

export const listProjects = logged.query('projects.list')
  .describe('List all projects')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    const projects = await ctx.db.projects.findMany();
    ctx._log('projects.list', { count: projects.length });
    return projects;
  });
```

## Metrics via Middleware {#metrics}

Integrate with Prometheus, StatsD, or any counter/histogram library:

```typescript
import { Counter, Histogram } from 'prom-client';

const toolCalls = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total MCP tool calls',
  labelNames: ['tool', 'status', 'tenant'],
});

const toolDuration = new Histogram({
  name: 'mcp_tool_duration_seconds',
  help: 'MCP tool call duration',
  labelNames: ['tool'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

const withMetrics = f.middleware(async (ctx) => {
  return { _metricsStart: process.hrtime.bigint() };
});

// In your handlers, record metrics:
export const getInvoice = logged.query('billing.get_invoice')
  .describe('Get an invoice by ID')
  .use(withMetrics)
  .withString('id', 'Invoice ID')
  .returns(InvoicePresenter)
  .handle(async (input, ctx) => {
    try {
      const invoice = await ctx.db.invoices.findUnique({ where: { id: input.id } });
      const duration = Number(process.hrtime.bigint() - ctx._metricsStart) / 1e6;
      toolDuration.observe({ tool: 'billing.get_invoice' }, duration / 1000);
      toolCalls.inc({ tool: 'billing.get_invoice', status: 'ok', tenant: ctx.tenantId });
      return invoice;
    } catch (err) {
      toolCalls.inc({ tool: 'billing.get_invoice', status: 'error', tenant: ctx.tenantId });
      throw err;
    }
  });
```

## Error Monitoring {#errors}

Capture errors in your handlers and forward to Sentry, Bugsnag, or any tracker:

```typescript
export const chargeInvoice = logged.mutation('billing.charge')
  .describe('Process a payment')
  .withString('invoice_id', 'Invoice ID')
  .handle(async (input, ctx) => {
    try {
      const result = await ctx.paymentGateway.charge(input.invoice_id);
      ctx._log('billing.charge', { status: 'ok' });
      return success(result);
    } catch (err) {
      ctx._log('billing.charge', { status: 'error', error: err.message });
      Sentry.captureException(err, {
        tags: { tool: 'billing.charge', tenant: ctx.tenantId },
      });
      return toolError('PaymentFailed', {
        message: 'Payment processing failed.',
        suggestion: 'Verify the payment method and retry.',
      });
    }
  });
```

> [!TIP]
> Unhandled exceptions in handlers are caught by the framework and returned as `isError: true`. But explicit `try/catch` lets you log, report metrics, and return structured `toolError()` recovery instead of generic errors.