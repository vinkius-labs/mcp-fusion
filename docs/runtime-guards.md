# Runtime Guards

Three built-in guards protect against the failure modes unique to AI agents: burst invocations, oversized responses, and duplicate destructive calls. Each has zero overhead when not configured.

## Concurrency Guard

Limits simultaneous executions per tool with a semaphore, backpressure queue, and load shedding:

```typescript
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

When all 5 slots are occupied and the queue has space, the call waits in FIFO order. When the queue is also full, it's immediate rejection:

```xml
<tool_error>
  <error_code>SERVER_BUSY</error_code>
  <message>Tool "billing" is at capacity (5 active, 20 queued).</message>
  <suggestion>Reduce concurrent calls. Send requests sequentially.</suggestion>
</tool_error>
```

Slots are freed in a `try/finally` — even if the handler throws or the abort signal fires. Queued waiters abort immediately on signal cancellation. The internal queue is deque-based for O(1) acquire/release.

## Egress Guard

Prevents oversized responses from crashing Node.js or overflowing the LLM context window:

```typescript
const logs = createTool<AppContext>('logs')
  .maxPayloadBytes(2 * 1024 * 1024)
  .action({
    name: 'search',
    handler: async (ctx, args) => {
      return success(await ctx.db.logs.findMany(args));
    },
  });
```

When exceeded, it truncates at a safe UTF-8 character boundary and injects:

```
[SYSTEM INTERVENTION: Payload truncated at 2.0MB to prevent memory crash.
You MUST use pagination (limit/offset) or filters to retrieve smaller result sets.]
```

### Egress Guard vs Presenter `.agentLimit()`

Both truncate at different layers. Use both for defense in depth:

```typescript
// Domain guard — intelligent truncation with custom message
const UserPresenter = createPresenter('User')
  .schema(UserSchema)
  .agentLimit(50, { warningMessage: 'Showing {shown} of {total}. Use filters.' });

// Infrastructure guard — brute-force byte limit
const users = createTool<AppContext>('users')
  .maxPayloadBytes(2 * 1024 * 1024)
  .action({
    name: 'list',
    returns: UserPresenter,
    handler: async (ctx) => ctx.db.users.findMany(),
  });
```

`.agentLimit()` operates on item count at the domain layer with custom guidance. `.maxPayloadBytes()` operates on raw bytes at the infrastructure layer as a safety net.

## Intent Mutex

Serializes destructive actions automatically — no configuration needed. When an LLM fires two `delete_user` calls for the same ID in the same millisecond, both would normally execute before either returns. The mutex prevents this:

```typescript
const billing = createTool<AppContext>('billing')
  .action({
    name: 'refund',
    destructive: true,
    schema: z.object({ invoiceId: z.string() }),
    handler: async (ctx, args) => {
      await ctx.stripe.refunds.create({ charge: args.invoiceId });
      return success('Refund processed');
    },
  })
  .action({
    name: 'list_invoices',
    readOnly: true,
    handler: async (ctx) => success(await ctx.stripe.invoices.list()),
  });
```

`billing.refund` calls execute in strict FIFO order. `billing.list_invoices` runs in parallel — zero overhead from the mutex. Serialization uses the action key as the lock key, so concurrent calls to different destructive actions run independently. The underlying async mutex uses promise chaining — no external locks, no Redis.

## All Three Together

```typescript
const analytics = createTool<AppContext>('analytics')
  .concurrency({ maxActive: 3, maxQueue: 10 })
  .maxPayloadBytes(2 * 1024 * 1024)
  .action({
    name: 'query',
    schema: z.object({
      sql: z.string(),
      limit: z.number().max(1000).default(100),
    }),
    handler: async (ctx, args) => {
      return success(await ctx.db.$queryRaw(args.sql));
    },
  });
```

3 concurrent queries max, 10 queued, 2MB response cap.

## Testing

```typescript
it('load-sheds when at capacity', async () => {
  const tool = createTool<void>('billing')
    .concurrency({ maxActive: 1, maxQueue: 0 })
    .action({
      name: 'charge',
      handler: async () => {
        await new Promise(r => setTimeout(r, 100));
        return success('charged');
      },
    });

  const first = tool.execute(undefined, { action: 'charge' });
  const second = await tool.execute(undefined, { action: 'charge' });

  expect(second.isError).toBe(true);
  expect(second.content[0].text).toContain('SERVER_BUSY');
  expect((await first).isError).toBeUndefined();
});
```

```typescript
it('truncates oversized responses', async () => {
  const tool = createTool<void>('logs')
    .maxPayloadBytes(2048)
    .action({
      name: 'search',
      handler: async () => success('x'.repeat(10_000)),
    });

  const result = await tool.execute(undefined, { action: 'search' });
  expect(result.content[0].text).toContain('[SYSTEM INTERVENTION');
});
```
