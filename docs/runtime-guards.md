# Runtime Guards

<Badge type="tip" text="v1.8.0" />

**MCP Fusion** implements two built-in runtime guards that fulfill the MCP specification requirement: *"Servers MUST rate limit tool invocations"*. These guards prevent cascading failures in production without requiring external infrastructure.

## The Problem

AI agents create failure modes that don't exist in human-driven systems:

| Failure Mode | Root Cause | Impact |
|---|---|---|
| **Thundering Herd** | LLM fires 50 `process_invoice` calls simultaneously | Stripe rate-limits your account for 24h |
| **Context DDoS** | Handler returns `SELECT * FROM logs` (30MB) | Node.js OOM crash, $15 wasted per request |
| **Cascade Failure** | One slow downstream → all slots occupied → all tools blocked | Entire server becomes unresponsive |

## The Solution

Two complementary guards, each with **zero overhead** when not configured:

```
Tool Call arrives
    │
    ▼
┌──────────────────────────────────────────────┐
│  ① Concurrency Guard (Semaphore + Queue)       │
│     ├── slot free? → continue                │
│     ├── queue has space? → wait              │
│     └── both full? → SERVER_BUSY (shed)      │
│                                              │
│  ② Intent Mutex (Anti-Race Condition)        │
│     ├── destructive: true? → per-key mutex   │
│     └── otherwise? → pass-through            │
│                                              │
│  ③ Handler executes normally                 │
│                                              │
│  ④ Egress Guard (Payload Limiter)            │
│     ├── within limit? → pass-through         │
│     └── exceeded? → truncate + intervention  │
└──────────────────────────────────────────────┘
```

## Concurrency Guard (Semaphore + Queue)

Limits the number of simultaneous executions per tool. Implements a semaphore with a backpressure queue and load shedding.

### Quick Start

```typescript
import { createTool, success } from '@vinkius-core/mcp-fusion';

const billing = createTool<AppContext>('billing')
    .concurrency({ maxActive: 5, maxQueue: 20 })
    .action({
        name: 'process_invoice',
        handler: async (ctx, args) => {
            const result = await ctx.stripe.charges.create(args);
            return success(result);
        },
    });
```

### How It Works

| Parameter | Description | Default |
|---|---|---|
| `maxActive` | Maximum concurrent executions | Required |
| `maxQueue` | Maximum waiting calls in backpressure queue | `0` |

**When `maxActive` is reached:**
- If `maxQueue` has space → the call waits in a FIFO queue
- If queue is full → **load shedding**: the call is immediately rejected with a `SERVER_BUSY` error

**Load shedding response** (via `toolError()`):

```xml
<tool_error>
  <error_code>SERVER_BUSY</error_code>
  <message>Tool "billing" is at capacity (5 active, 20 queued). Retry after a short delay.</message>
  <suggestion>Reduce the number of concurrent calls to this tool. Send requests sequentially or in smaller batches.</suggestion>
</tool_error>
```

The LLM receives a structured recovery hint and automatically reduces its cadence — no API block, no cascade failure.

### AbortSignal Integration

Queued waiters are **cooperatively cancelled** when the AbortSignal fires:

```typescript
// If the user clicks "Stop" while a call is queued:
// 1. The AbortSignal fires
// 2. The queued waiter is rejected immediately
// 3. The queue slot is freed for the next request
// 4. No handler code was ever executed
```

This integrates seamlessly with the [Cancellation](./cancellation) feature.

### Slot Release Guarantee

The concurrency slot is **always released** after execution, even when:
- The handler throws an exception
- The abort signal fires mid-execution
- The egress guard truncates the response

This is implemented via `try/finally` — no slot leaks are possible.

## Egress Guard (Payload Limiter)

Prevents oversized responses from crashing the Node.js process or overflowing the LLM context window.

### Quick Start

```typescript
const logs = createTool<AppContext>('logs')
    .maxPayloadBytes(2 * 1024 * 1024) // 2MB safety net
    .action({
        name: 'search',
        handler: async (ctx, args) => {
            const results = await ctx.db.logs.findMany(args);
            return success(results);
        },
    });
```

### How It Works

When a response exceeds the byte limit:

1. **Measures** total UTF-8 byte length across all content blocks
2. **Truncates** at a safe character boundary (no broken multi-byte sequences)
3. **Injects** a system intervention message:

```
[SYSTEM INTERVENTION: Payload truncated at 2.0MB to prevent memory crash.
You MUST use pagination (limit/offset) or filters to retrieve smaller result sets.]
```

The intervention forces the LLM to self-correct by using pagination parameters on its next call.

### Comparison with Presenter `.agentLimit()`

| Feature | `.agentLimit()` | `.maxPayloadBytes()` |
|---|---|---|
| **Layer** | Domain (Presenter) | Infrastructure (Pipeline) |
| **Awareness** | Counts items, renders guidance | Counts bytes, truncates raw |
| **Best for** | Business logic ("show top 50") | Safety net ("never OOM") |
| **Message** | Custom domain guidance | Generic system intervention |

Use **both** for defense in depth:

```typescript
// Domain guard: intelligent truncation with guidance
const UserPresenter = createPresenter('User')
    .schema(UserSchema)
    .agentLimit(50, { warningMessage: 'Showing {shown} of {total}. Use filters.' });

// Infrastructure guard: brute-force byte limit
const users = createTool<AppContext>('users')
    .maxPayloadBytes(2 * 1024 * 1024)
    .action({
        name: 'list',
        returns: UserPresenter,
        handler: async (ctx) => ctx.db.users.findMany(),
    });
```

## Intent Mutex (Anti-Race Condition)

When an LLM hallucinates and fires identical destructive calls in the same millisecond (e.g., two `delete_user` calls for the same ID), it creates a race condition. The **Intent Mutex** automatically serializes these calls to provide transactional isolation.

### Zero-Configuration Setup

The Intent Mutex is completely automatic. It is activated whenever an action is marked with `destructive: true`.

```typescript
const billing = createTool<AppContext>('billing')
    .action({
        name: 'refund',
        destructive: true, // Enables Intent Mutex serialization
        schema: z.object({ invoiceId: z.string() }),
        handler: async (ctx, args) => {
            // Concurrent 'refund' calls are strictly queued (FIFO).
            // Safe from LLM double-firing hallucinations.
            await ctx.stripe.refunds.create({ charge: args.invoiceId });
            return success('Refund processed');
        },
    })
    .action({
        name: 'list_invoices',
        readOnly: true,
        handler: async (ctx) => {
            // Concurrent 'list_invoices' calls execute in parallel.
            // Zero overhead from the mutex.
            return success(await ctx.stripe.invoices.list());
        },
    });
```

### How It Works

1. **Per-Action Serialization**: The mutex uses the action key (e.g., `billing.refund`). Concurrent calls to `billing.refund` execute in strict FIFO order, while calls to `billing.delete` run independently.
2. **Zero Dependencies**: Implements the idiomatic async mutex promise-chain pattern. No external locks, no Redis, no OS primitives.
3. **Promise Chain GC**: Completed promise chains are automatically garbage collected to prevent memory leaks.
4. **Cooperative Cancellation**: Waiters queued in the mutex will instantly abort if the request `AbortSignal` fires before they acquire the lock.

## Combined Usage

Apply both guards for maximum protection:

```typescript
const protected = createTool<AppContext>('analytics')
    .concurrency({ maxActive: 3, maxQueue: 10 })
    .maxPayloadBytes(2 * 1024 * 1024)
    .action({
        name: 'query',
        schema: z.object({
            sql: z.string(),
            limit: z.number().max(1000).default(100),
        }),
        handler: async (ctx, args) => {
            const data = await ctx.db.$queryRaw(args.sql);
            return success(data);
        },
    });
// 3 concurrent queries max, 10 queued, 2MB response cap
```

## Testing

### Concurrency Guard

```typescript
import { describe, it, expect } from 'vitest';
import { createTool, success } from '@vinkius-core/mcp-fusion';

describe('Concurrency', () => {
    it('should load-shed when at capacity', async () => {
        const tool = createTool<void>('billing')
            .concurrency({ maxActive: 1, maxQueue: 0 })
            .action({
                name: 'charge',
                handler: async () => {
                    await new Promise(r => setTimeout(r, 100));
                    return success('charged');
                },
            });

        // First call occupies the slot
        const first = tool.execute(undefined, { action: 'charge' });

        // Second call → load shedding
        const second = await tool.execute(undefined, { action: 'charge' });
        expect(second.isError).toBe(true);
        expect(second.content[0].text).toContain('SERVER_BUSY');

        // First still completes
        const result = await first;
        expect(result.isError).toBeUndefined();
    });
});
```

### Egress Guard

```typescript
describe('Egress', () => {
    it('should truncate oversized responses', async () => {
        const tool = createTool<void>('logs')
            .maxPayloadBytes(2048)
            .action({
                name: 'search',
                handler: async () => success('x'.repeat(10_000)),
            });

        const result = await tool.execute(undefined, { action: 'search' });
        expect(result.content[0].text).toContain('[SYSTEM INTERVENTION');
        expect(result.content[0].text.length).toBeLessThan(10_000);
    });
});
```

## MCP Specification Compliance

The MCP specification (§ Security Considerations) **requires** servers to:

> **Servers MUST:** Rate limit tool invocations

The Concurrency Guard fulfills this requirement at the framework level. Without it, developers must implement rate limiting manually per tool — error-prone and inconsistent.

## Configuration Reference

### `.concurrency(config)`

```typescript
interface ConcurrencyConfig {
    maxActive: number;  // Required. Max concurrent executions (≥ 1)
    maxQueue?: number;  // Optional. Max queued waiters (≥ 0, default: 0)
}
```

### `.maxPayloadBytes(bytes)`

```typescript
maxPayloadBytes(bytes: number): this
// bytes: Maximum payload size in bytes
// Minimum enforced: 1024 (1KB)
```

## Compatibility

| Feature | Status |
|---|---|
| Per-tool concurrency limits | ✅ `.concurrency()` |
| Backpressure queue with FIFO drain | ✅ Built-in |
| Load shedding with self-healing error | ✅ `toolError('SERVER_BUSY')` |
| Automatic Intent Mutex for AI agents | ✅ `destructive: true` flag |
| Per-action serialization | ✅ FIFO guarantee per action key |
| AbortSignal integration for queued waiters | ✅ Cooperative cancellation (all guards) |
| Slot release on handler crash | ✅ `try/finally` guarantee |
| Per-tool payload byte limit | ✅ `.maxPayloadBytes()` |
| UTF-8 safe truncation | ✅ `TextEncoder`/`TextDecoder` |
| System intervention message | ✅ Forces LLM pagination |
| Zero overhead when not configured | ✅ No guard objects created |
| Combined with Cancellation | ✅ Full integration |
| Combined with Presenter `.agentLimit()` | ✅ Defense in depth |
