# Rate Limiter

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add per-tenant rate limiting to the billing tools: 100 requests per minute with Redis-backed sliding window and telemetry."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add per-tenant rate limiting to the billing tools: 100 requests per minute with Redis-backed sliding window and telemetry.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+per-tenant+rate+limiting+to+the+billing+tools%3A+100+requests+per+minute+with+Redis-backed+sliding+window+and+telemetry." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+per-tenant+rate+limiting+to+the+billing+tools%3A+100+requests+per+minute+with+Redis-backed+sliding+window+and+telemetry." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">ABUSE PROTECTION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Agents loop. Budgets don't.<br><span style="color:rgba(255,255,255,0.25)">Sliding window, per-key throttling.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">A hallucinating agent can retry the same failing call indefinitely. The Rate Limiter applies per-key sliding-window throttling before your handler executes. Self-healing errors instruct the LLM to wait and retry.</div>
</div>



## Why Rate Limiting Matters {#why}

AI agents are non-deterministic. A single prompt can trigger 50 tool calls. A hallucinating agent can retry the same failing call indefinitely. Without rate limiting:

- **Cost explosion** — Each tool call may hit external APIs, databases, or paid LLMs
- **Resource exhaustion** — Connection pools drain, CPU spins, memory climbs
- **Cascading failure** — Downstream services receive unbounded traffic

The Rate Limiter middleware applies **per-key sliding-window** throttling before your handler executes:

```typescript
import { rateLimit } from '@vurb/core';

const billing = createTool('billing')
    .use(rateLimit({
        windowMs: 60_000,  // 1-minute window
        max: 100,          // 100 requests per window
        keyFn: (ctx) => ctx.userId,
    }))
    .action({ name: 'create', handler: async (ctx, args) => { /* ... */ } });
```


## How It Works {#how-it-works}

The sliding window tracks timestamps rather than counts. This prevents the "boundary burst" problem where a fixed window allows 2x requests at the boundary between two periods.

```text
Window: 60 seconds, Max: 5

Time:  0s           30s         60s          90s
       ├────┬───┬───┼───┬───────┼────────────┤
       R1   R2  R3  R4  R5      ← window slides
                         ↑ denied (5 in window)
```

The middleware follows a **two-phase** design:

1. **Increment** — Check current count in the window. If over limit → reject immediately
2. **Record** — Only after the request is confirmed under limit, record the timestamp

This separation means **rejected requests do not inflate the count**. An attacker who sends 1,000 requests sees the counter stay at `max`, not grow to 1,000.


## Configuration {#configuration}

```typescript
interface RateLimitConfig {
    /** Window duration in milliseconds */
    readonly windowMs: number;

    /** Maximum requests per window per key */
    readonly max: number;

    /** Extract a unique key per caller/tenant */
    readonly keyFn: (ctx: any) => string;

    /** Custom store (default: InMemoryStore) */
    readonly store?: RateLimitStore;

    /** Telemetry sink for rate-limit events */
    readonly telemetry?: TelemetrySink;
}
```

### Minimal Configuration

```typescript
rateLimit({
    windowMs: 60_000,
    max: 100,
    keyFn: (ctx) => ctx.userId,
})
```

### Full Configuration

```typescript
rateLimit({
    windowMs: 60_000,
    max: 100,
    keyFn: (ctx) => `${ctx.tenantId}:${ctx.userId}`,
    store: new RedisRateLimitStore(redis),
    telemetry: (event) => myCollector.push(event),
})
```


## Custom Stores {#custom-stores}

The default `InMemoryStore` works for single-process servers. For multi-instance deployments, implement the `RateLimitStore` interface:

```typescript
interface RateLimitStore {
    /** Check current count and get reset time. Does NOT record the request. */
    increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;

    /** Record a successful (non-rejected) request. */
    record(key: string): Promise<void> | void;
}
```

::: tip Two-Phase Design
The `increment` method only **checks** — it does not add the current request. Call `record()` only after confirming the request is under the limit. This prevents rejected requests from counting.
:::

### Redis Example

```typescript
class RedisRateLimitStore implements RateLimitStore {
    constructor(private redis: Redis) {}

    async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
        const now = Date.now();
        const windowStart = now - windowMs;

        // Remove expired entries
        await this.redis.zremrangebyscore(key, 0, windowStart);

        // Count remaining entries (do NOT add yet)
        const count = await this.redis.zcard(key);

        return {
            count,
            resetMs: windowStart + windowMs,
        };
    }

    async record(key: string): Promise<void> {
        const now = Date.now();
        await this.redis.zadd(key, now, `${now}`);
    }
}
```


## Key Functions {#key-functions}

The `keyFn` determines the rate limit scope. Different keys give different isolation levels:

```typescript
// Per user — each user has their own limit
keyFn: (ctx) => ctx.userId

// Per tenant — all users in a tenant share a limit
keyFn: (ctx) => ctx.tenantId

// Per tenant + action — separate limits per action per tenant
keyFn: (ctx) => `${ctx.tenantId}:${ctx.action}`

// Global — one limit for all callers
keyFn: () => 'global'
```


## Telemetry {#telemetry}

Add a `telemetry` sink to emit `security.rateLimit` events:

```typescript
rateLimit({
    windowMs: 60_000,
    max: 100,
    keyFn: (ctx) => ctx.userId,
    telemetry: (event) => myCollector.push(event),
})
```

Events are emitted for **both** allowed and rejected requests:

```typescript
// Allowed
{
    type: 'security.rateLimit',
    allowed: true,
    remaining: 87,
    limit: 100,
    resetMs: 1710278460000,
    key: 'user_42',
    timestamp: 1710278400000,
}

// Rejected
{
    type: 'security.rateLimit',
    allowed: false,
    remaining: 0,
    limit: 100,
    resetMs: 1710278460000,
    key: 'user_42',
    timestamp: 1710278400000,
}
```


## Headers {#headers}

When a request is rate-limited, the error response includes rate limit metadata:

```typescript
toolError('RATE_LIMITED', {
    message: `Rate limit exceeded. Try again in ${retryAfterMs}ms.`,
    data: {
        limit: 100,
        remaining: 0,
        resetMs: 1710278460000,
    },
    recovery: {
        action: 'retry',
        suggestion: `Wait ${retryAfterMs}ms before retrying.`,
    },
})
```

The LLM receives a self-healing error with enough information to wait and retry.


## API Reference {#api}

### `rateLimit(config)`

Returns a `MiddlewareFn` that can be applied with `.use()`:

```typescript
const middleware = rateLimit({ windowMs: 60_000, max: 100, keyFn: (ctx) => ctx.userId });
const tool = createTool('billing').use(middleware);
```

### `InMemoryStore`

Default store. Automatically prunes expired entries on each `increment()` call.

```typescript
class InMemoryStore implements RateLimitStore {
    constructor(windowMs: number);
    increment(key: string, windowMs: number): { count: number; resetMs: number };
    record(key: string): void;
}
```

### `RateLimitStore` Interface

Implement this for external stores (Redis, Valkey, DynamoDB):

```typescript
interface RateLimitStore {
    increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
    record(key: string): Promise<void> | void;
}
```
