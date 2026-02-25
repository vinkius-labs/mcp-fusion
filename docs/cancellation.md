# Cancellation Propagation

<Badge type="tip" text="v1.7.0" />

**MCP Fusion** intercepts the AbortSignal from the MCP SDK protocol layer and propagates it through the **entire execution pipeline** — middleware, handlers, and generators. When a user clicks "Stop" in the client, or the transport connection drops, all in-flight operations are terminated immediately.

## The Problem

When an LLM calls a tool, the handler may start a heavy database query, an HTTP request to an external API, or a CPU-intensive parse that takes 30 seconds. If the user cancels mid-flight:

1. The MCP client sends `notifications/cancelled`
2. The SDK fires an `AbortSignal` on the request
3. **Without framework support**, the handler continues running in background — a "zombie process" that wastes CPU, holds database connections, and delays the next request

## The Solution

**MCP Fusion** extracts the SDK's `AbortSignal` and propagates it through three layers:

| Layer | Mechanism |
|---|---|
| **contextFactory** | The `extra` argument already contains `signal` — extract it into `ctx.signal` |
| **Execution Pipeline** | `runChain()` checks `signal.aborted` before invoking the handler chain |
| **Generator Drain** | Each `yield` iteration checks the signal — zombie generators are aborted immediately |

**Zero overhead** when no signal is present — no conditionals in the hot path.

## Quick Start

### 1. Expose Signal via Context Factory

```typescript
interface AppContext {
    db: PrismaClient;
    signal?: AbortSignal;
}

registry.attachToServer(server, {
    contextFactory: (extra) => {
        const { signal } = extra as { signal?: AbortSignal };
        return {
            db: prisma,
            signal, // ← propagated to every handler
        };
    },
});
```

### 2. Use Signal in Handlers

::: code-group
```typescript [f.tool() — Recommended ✨]
const heavyQuery = f.tool({
    name: 'analytics.heavy_query',
    input: z.object({ range: z.string() }),
    handler: async ({ input, ctx }) => {
        // Pass signal to Prisma — query dies if cancelled
        const data = await ctx.db.analytics.findMany({
            where: { range: input.range },
        });

        // Pass signal to fetch — HTTP request dies if cancelled
        const enriched = await fetch('https://api.internal/enrich', {
            method: 'POST',
            body: JSON.stringify(data),
            signal: ctx.signal, // ← native AbortSignal
        });

        return await enriched.json();
    },
});
```
```typescript [createTool]
createTool<AppContext>('analytics')
    .action({
        name: 'heavy_query',
        schema: z.object({ range: z.string() }),
        handler: async (ctx, args) => {
            const data = await ctx.db.analytics.findMany({
                where: { range: args.range },
            });

            const enriched = await fetch('https://api.internal/enrich', {
                method: 'POST',
                body: JSON.stringify(data),
                signal: ctx.signal, // ← native AbortSignal
            });

            return success(await enriched.json());
        },
    });
```
:::

### 3. Generator Handlers (Automatic)

Generator handlers get **automatic cancellation** — the framework checks the signal before each `yield` iteration:

```typescript
createTool<AppContext>('repo')
    .action({
        name: 'analyze',
        handler: async function* (ctx, args) {
            yield progress(10, 'Cloning repository...');
            const files = await cloneRepo(args.url, { signal: ctx.signal });

            yield progress(50, 'Building AST...');
            // If cancelled here, generator is aborted — no further yields
            const ast = buildAST(files);

            yield progress(90, 'Analyzing patterns...');
            const patterns = analyzePatterns(ast);

            return success(patterns);
        },
    });
```

## Architecture

```
User clicks "Stop"
        │
        ▼
MCP Client sends `notifications/cancelled`
        │
        ▼
MCP SDK fires AbortSignal on RequestHandlerExtra
        │
        ▼
ServerAttachment.extractSignal(extra) ─── extracts signal
        │
        ├──► contextFactory(extra) ─── developer gets signal
        │
        ├──► builder.execute(ctx, args, sink, signal)
        │         │
        │         ▼
        │    runChain() ─── checks signal.aborted BEFORE handler
        │         │
        │         ▼
        │    drainGenerator() ─── checks signal.aborted per yield
        │
        └──► Loopback Dispatcher ─── prompts calling tools get signal too
```

## Testing

Test cancellation in your handlers using `AbortController`:

```typescript
import { describe, it, expect } from 'vitest';
import { createTool, success } from '@vinkius-core/mcp-fusion';

describe('Cancellation', () => {
    it('should abort when signal is already cancelled', async () => {
        const controller = new AbortController();
        controller.abort(); // Pre-cancel

        const tool = createTool<void>('test')
            .action({
                name: 'work',
                handler: async () => success('never reached'),
            });

        const result = await tool.execute(
            undefined,
            { action: 'work' },
            undefined,          // progressSink
            controller.signal,  // signal (4th parameter)
        );

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('cancelled');
    });
});
```

## Best Practices

### ✅ Always Pass `ctx.signal` to I/O Operations

```typescript
// Fetch
await fetch(url, { signal: ctx.signal });

// Node.js fs
await fs.readFile(path, { signal: ctx.signal });

// Prisma (via $transaction)
await prisma.$transaction(async (tx) => {
    return tx.user.findMany();
}, { timeout: 30000 });
```

### ✅ Check Signal in CPU-Intensive Loops

```typescript
for (const file of files) {
    if (ctx.signal?.aborted) {
        return error('Operation cancelled by user.');
    }
    await processFile(file);
}
```

### ❌ Don't Ignore the Signal

```typescript
// BAD: Signal is available but not used
handler: async (ctx, args) => {
    const data = await longRunningQuery(); // No signal → zombie!
    return success(data);
};

// GOOD: Signal kills the query
handler: async (ctx, args) => {
    const data = await longRunningQuery({ signal: ctx.signal });
    return success(data);
};
```

## Compatibility

| Feature | Status |
|---|---|
| MCP SDK `@modelcontextprotocol/sdk` ≥ 1.12.1 | ✅ Full support |
| `contextFactory` signal passthrough | ✅ Zero framework changes |
| Pre-execution abort check | ✅ Built into pipeline |
| Generator abort on each yield | ✅ Built into pipeline |
| Flat exposition mode | ✅ Signal propagated |
| Grouped exposition mode | ✅ Signal propagated |
| Prompt loopback dispatcher | ✅ Signal propagated |
| Direct `builder.execute()` | ✅ 4th parameter |
