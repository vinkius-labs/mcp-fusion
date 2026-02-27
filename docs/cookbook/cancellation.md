# Cancellation

- [Introduction](#introduction)
- [Extracting the Signal](#extracting)
- [Passing the Signal to I/O](#passing)
- [CPU-Bound Cancellation](#cpu)
- [Generator Handlers](#generators)
- [Testing Cancellation](#testing)

## Introduction {#introduction}

When the user clicks "Stop" or the connection drops, your handlers should stop immediately — not keep running a 30-second database query or holding a connection pool slot. MCP Fusion propagates `AbortSignal` through middleware, handlers, and generators. If the request is cancelled before the handler starts, it never executes.

## Extracting the Signal {#extracting}

The `AbortSignal` arrives in the context factory via `extra`. Pass it through as part of your `AppContext`:

```typescript
interface AppContext {
  db: PrismaClient;
  signal?: AbortSignal;
}

registry.attachToServer(server, {
  contextFactory: (extra) => {
    const { signal } = extra as { signal?: AbortSignal };
    return { db: prisma, signal };
  },
});
```

The framework also checks `signal.aborted` internally before running the middleware chain. If the request was already cancelled by the time it reaches your handler, the handler never executes — the AI receives a `cancelled` error.

## Passing the Signal to I/O {#passing}

Forward `ctx.signal` to any async I/O — `fetch`, database drivers, file operations:

```typescript
const f = initFusion<AppContext>();

export const heavyQuery = f.query('analytics.heavy_query')
  .describe('Run a heavy analytics query')
  .withString('range', 'Date range')
  .handle(async (input, ctx) => {
    const data = await ctx.db.analytics.findMany({
      where: { range: input.range },
    });

    const enriched = await fetch('https://api.internal/enrich', {
      method: 'POST',
      body: JSON.stringify(data),
      signal: ctx.signal,   // ← abort if cancelled
    });

    return await enriched.json();
  });
```

If the user cancels mid-request, `fetch` aborts, the promise rejects, and no zombie handlers hold database connections.

## CPU-Bound Cancellation {#cpu}

For CPU-bound loops, check `signal.aborted` between iterations:

```typescript
export const processFiles = f.action('files.process')
  .describe('Process uploaded files')
  .withString('batch_id', 'Batch ID')
  .handle(async (input, ctx) => {
    const files = await ctx.db.files.findMany({ where: { batchId: input.batch_id } });

    for (const file of files) {
      if (ctx.signal?.aborted) {
        return error('Operation cancelled by user.');
      }
      await processFile(file);
    }

    return { processed: files.length };
  });
```

## Generator Handlers {#generators}

Generators get cancellation for free. The framework checks `signal.aborted` before each `yield`. If the signal fires mid-stream, the generator is aborted via `gen.return()`, triggering `finally {}` cleanup:

```typescript
export const analyzeRepo = f.query('repo.analyze')
  .describe('Analyze a repository')
  .withString('url', 'Repository URL')
  .handle(async function* (input, ctx) {
    yield progress(10, 'Cloning repository...');
    const files = await cloneRepo(input.url, { signal: ctx.signal });

    yield progress(50, 'Building AST...');
    const ast = buildAST(files);

    yield progress(90, 'Analyzing patterns...');
    return analyzePatterns(ast);
  });
```

If the user clicks "Stop" between yields, the generator stops cleanly. Any `finally {}` blocks in the generator execute, ensuring cleanup happens.

## Testing Cancellation {#testing}

Test cancellation behavior with a pre-aborted `AbortController`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Cancellation', () => {
  it('aborts when signal is pre-cancelled', async () => {
    const controller = new AbortController();
    controller.abort();   // ← pre-cancel

    const result = await tool.execute(
      ctx,
      { action: 'work' },
      undefined,
      controller.signal,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cancelled');
  });
});
```

`builder.execute()` accepts `signal` as the 4th parameter — after `ctx`, `args`, and `progressSink`.