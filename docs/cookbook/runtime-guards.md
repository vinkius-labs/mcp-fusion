# Runtime Guards

- [Introduction](#introduction)
- [Timeout](#timeout)
- [Rate Limiting](#rate-limit)
- [Manual Guards in Middleware](#manual)

## Introduction {#introduction}

Even with Presenter `.limit()` guardrails, handlers can still produce unbounded execution times or get called in aggressive loops. MCP Fusion provides built-in `.timeout()` and rate limiting to protect the server process.

## Timeout {#timeout}

Set a per-tool timeout with `.timeout()`. If the handler exceeds the duration, the `AbortSignal` fires and the handler is cancelled:

```typescript
const f = initFusion<AppContext>();

export const heavyQuery = f.query('analytics.heavy')
  .describe('Run a heavy analytics query')
  .timeout(60_000)   // 60 seconds
  .withString('range', 'Date range')
  .handle(async (input, ctx) => {
    return ctx.db.analytics.complexAggregation({
      range: input.range,
      signal: ctx.signal,   // pass the signal to the DB driver
    });
  });
```

When the timeout fires, the AI receives a structured error indicating the operation was cancelled due to timeout.

> [!TIP]
> Always forward `ctx.signal` to async I/O (`fetch`, database drivers) so timeouts propagate through the entire call chain, not just the handler.

## Rate Limiting {#rate-limit}

Configure rate limiting at the server level to protect backend services:

```typescript
registry.attachToServer(server, {
  contextFactory: createContext,
  rateLimit: {
    maxCallsPerMinute: 60,
    perTool: {
      'billing.charge': 5,     // max 5 charges per minute
      'data.export': 2,        // max 2 exports per minute
    },
  },
});
```

When the rate limit is exceeded, the tool returns a structured error that tells the AI to wait before retrying.

## Manual Guards in Middleware {#manual}

For custom protection logic, create guard middleware:

```typescript
const withConcurrencyLimit = f.middleware(async (ctx) => {
  const active = activeRequests.get(ctx.tenantId) ?? 0;
  if (active >= 10) {
    throw new Error('Too many concurrent requests. Wait for current operations to complete.');
  }
  activeRequests.set(ctx.tenantId, active + 1);
  return {
    _cleanup: () => {
      activeRequests.set(ctx.tenantId, (activeRequests.get(ctx.tenantId) ?? 1) - 1);
    },
  };
});

export const heavyExport = f.action('data.export')
  .describe('Export data in bulk')
  .use(withAuth)
  .use(withConcurrencyLimit)
  .withEnum('format', ['csv', 'json'] as const, 'Export format')
  .handle(async (input, ctx) => {
    try {
      const result = await ctx.db.export(input.format);
      return result;
    } finally {
      ctx._cleanup();
    }
  });
```

> [!WARNING]
> Guards protect the server from resource exhaustion but should not replace business logic validation. Use guards for infrastructure safety and `toolError()` for business rules.