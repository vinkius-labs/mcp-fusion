# Cancellation

MCP Fusion propagates `AbortSignal` through middleware, handlers, and generators. When the user clicks "Stop" or the connection drops, everything stops — no zombie handlers holding database connections.

## Extracting the Signal

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

The framework also checks `signal.aborted` internally before running the middleware chain. If the request was already cancelled, the handler never executes.

## Passing the Signal to I/O

```typescript
const heavyQuery = f.tool({
  name: 'analytics.heavy_query',
  input: z.object({ range: z.string() }),
  handler: async ({ input, ctx }) => {
    const data = await ctx.db.analytics.findMany({
      where: { range: input.range },
    });

    const enriched = await fetch('https://api.internal/enrich', {
      method: 'POST',
      body: JSON.stringify(data),
      signal: ctx.signal,
    });

    return await enriched.json();
  },
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

## Generator Handlers

Generators get cancellation for free. `drainGenerator()` checks `signal.aborted` before each `yield`. If fired mid-stream, the generator is aborted via `gen.return()` (triggering `finally {}` cleanup):

```typescript
const analyzeRepo = f.tool({
  name: 'repo.analyze',
  input: z.object({ url: z.string() }),
  handler: async function* ({ input, ctx }) {
    yield progress(10, 'Cloning repository...');
    const files = await cloneRepo(input.url, { signal: ctx.signal });

    yield progress(50, 'Building AST...');
    const ast = buildAST(files);

    yield progress(90, 'Analyzing patterns...');
    return analyzePatterns(ast);
  },
});
```

## Testing Cancellation

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
