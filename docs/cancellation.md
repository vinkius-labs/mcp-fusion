# Cancellation

- [Introduction](#introduction)
- [Extracting the Signal](#signal)
- [Passing the Signal to I/O](#io)
- [Generator Handlers](#generators)
- [Testing Cancellation](#testing)

## Introduction {#introduction}

When the user clicks "Stop" or the connection drops mid-stream, the in-flight handler should stop immediately — not continue burning CPU, holding database locks, or sending HTTP requests into the void.

MCP Fusion propagates `AbortSignal` through middleware, handlers, and generators. The framework checks `signal.aborted` before each pipeline stage. If the request was already cancelled, the handler never executes.

## Extracting the Signal {#signal}

Capture the `AbortSignal` from the MCP SDK's `RequestHandlerExtra` via `contextFactory`:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: PrismaClient;
  signal?: AbortSignal;
}

const f = initFusion<AppContext>();

registry.attachToServer(server, {
  contextFactory: (extra) => {
    const { signal } = extra as { signal?: AbortSignal };
    return { db: prisma, signal };
  },
});
```

## Passing the Signal to I/O {#io}

Pass `ctx.signal` to any async operation that accepts `AbortSignal` — HTTP `fetch`, database queries, external APIs:

```typescript
const heavyQuery = f.query('analytics.heavy_query')
  .describe('Run a heavy analytics query')
  .withString('range', 'Date range')
  .handle(async (input, ctx) => {
    const data = await ctx.db.analytics.findMany({
      where: { range: input.range },
    });

    const enriched = await fetch('https://api.internal/enrich', {
      method: 'POST',
      body: JSON.stringify(data),
      signal: ctx.signal,  // ← cooperative cancellation
    });

    return await enriched.json();
  });
```

For CPU-bound loops, check between iterations:

```typescript
for (const file of files) {
  if (ctx.signal?.aborted) {
    return error('Operation cancelled by user.');
  }
  await processFile(file);
}
```

> [!TIP]
> If the signal fires during a `fetch`, the request aborts immediately — no zombie connections. For database queries, check your ORM's cancellation support (Prisma, Drizzle, and Knex all accept `AbortSignal`).

## Generator Handlers {#generators}

Generators get cancellation for free. `drainGenerator()` checks `signal.aborted` before each `yield`. If fired mid-stream, the generator is aborted via `gen.return()`, triggering `finally {}` cleanup:

```typescript
import { progress } from '@vinkius-core/mcp-fusion';

const analyzeRepo = f.query('repo.analyze')
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

## Testing Cancellation {#testing}

```typescript
import { describe, it, expect } from 'vitest';

describe('Cancellation', () => {
  it('aborts when signal is pre-cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

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