# Runtime Guards

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add concurrency(max:5, queue:20) and egress(2MB) guards to the analytics tool, and use f.mutation() for all destructive actions to enable intent mutex."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add concurrency(max:5, queue:20) and egress(2MB) guards to the analytics tool, and use f.mutation() for all destructive actions to enable intent mutex.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+concurrency(max%3A5%2C+queue%3A20)+and+egress(2MB)+guards+to+the+analytics+tool%2C+and+use+f.mutation()+for+all+destructive+actions+to+enable+intent+mutex." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+concurrency(max%3A5%2C+queue%3A20)+and+egress(2MB)+guards+to+the+analytics+tool%2C+and+use+f.mutation()+for+all+destructive+actions+to+enable+intent+mutex." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">INFRASTRUCTURE SAFETY</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Agents burst. Systems crash.<br><span style="color:rgba(255,255,255,0.25)">Three guards prevent it.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Concurrency semaphore, egress byte limiter, and intent mutex — three built-in guards that protect your infra without touching the hot path when unconfigured.</div>
</div>

## Introduction {#introduction}

AI agents can fire tens of tool calls in rapid succession — burst invocations during chain-of-thought reasoning, oversized responses from unbounded queries, duplicate destructive calls when self-correcting. Without protection, a single LLM session can exhaust your database pool, crash Node.js with a 50MB response, or double-delete a user.

Vurb.ts provides three built-in runtime guards. Each has zero overhead when not configured — no conditionals in the hot path.

## Concurrency Guard {#concurrency}

Limits simultaneous executions per tool with a semaphore, backpressure queue, and load shedding:

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb<AppContext>();

const heavyReport = f.query('analytics.heavy_report')
  .describe('Generate a comprehensive analytics report')
  .concurrency({ max: 5, queueSize: 20 })
  .withString('range', 'Date range')
  .handle(async (input, ctx) => {
    return ctx.db.analytics.generateReport(input.range);
  });
```

When all 5 slots are occupied and the queue has space, the call waits in FIFO order. When the queue is also full, it's immediate rejection:

```xml
<tool_error>
  <error_code>SERVER_BUSY</error_code>
  <message>Tool "analytics" is at capacity (5 active, 20 queued).</message>
  <suggestion>Reduce concurrent calls. Send requests sequentially.</suggestion>
</tool_error>
```

Slots are freed in a `try/finally` — even if the handler throws or the abort signal fires. Queued waiters abort immediately on signal cancellation. The internal queue is deque-based for O(1) acquire/release.

## Egress Guard {#egress}

Prevents oversized responses from crashing Node.js or overflowing the LLM context window:

```typescript
const logSearch = f.query('logs.search')
  .describe('Search application logs')
  .egress(2 * 1024 * 1024)   // 2 MB max
  .withString('query', 'Search query')
  .handle(async (input, ctx) => {
    return ctx.db.logs.search(input.query);
  });
```

When exceeded, it truncates at a safe UTF-8 character boundary and injects:

```
[SYSTEM INTERVENTION: Payload truncated at 2.0MB to prevent memory crash.
You MUST use pagination (limit/offset) or filters to retrieve smaller result sets.]
```

### Egress Guard vs Presenter `.limit()` / `.agentLimit()`

Both truncate at different layers. Use both for defense in depth:

```typescript
import { createPresenter, t } from '@vurb/core';

// Domain guard — intelligent truncation with custom message
const UserPresenter = createPresenter('User')
  .schema({ id: t.string, name: t.string, email: t.string })
  .limit(50);

// Infrastructure guard — brute-force byte limit
const listUsers = f.query('users.list')
  .describe('List all users in the workspace')
  .egress(2 * 1024 * 1024)
  .returns(UserPresenter)
  .handle(async (input, ctx) => ctx.db.users.findMany());
```

`.limit()` / `.agentLimit()` operates on item count at the domain layer with custom guidance. `.egress()` operates on raw bytes at the infrastructure layer as a safety net.

> [!TIP]
> Presenter `.limit()` is the first line of defense — it truncates intelligently with domain context. Egress guard is the last-resort safety net for edge cases where the Presenter can't predict payload size (e.g. text blobs, nested data).

## Intent Mutex {#intent-mutex}

Serializes destructive actions automatically — no configuration needed. When an LLM fires two `delete_user` calls for the same ID in the same millisecond, both would normally execute before either returns. The intent mutex prevents this:

```typescript
const deleteUser = f.mutation('users.delete')
  .describe('Permanently delete a user and all their data')
  .withString('id', 'User ID to delete')
  .handle(async (input, ctx) => {
    await ctx.db.users.delete({ where: { id: input.id } });
    return { deleted: input.id };
  });

const listUsers = f.query('users.list')
  .describe('List all users')
  .handle(async (input, ctx) => ctx.db.users.findMany());
```

`users.delete` calls (from `f.mutation()`) execute in strict FIFO order. `users.list` (from `f.query()`) runs in parallel — zero overhead from the mutex. Serialization uses the action key as the lock key, so concurrent calls to different destructive actions run independently. The underlying async mutex uses promise chaining — no external locks, no Redis.

## Combined Configuration {#combined}

All three guards compose naturally:

```typescript
const analyticsQuery = f.query('analytics.query')
  .describe('Run a custom analytics query')
  .concurrency({ max: 3, queueSize: 10 })
  .egress(2 * 1024 * 1024)
  .withString('sql', 'SQL query')
  .withOptionalNumber('limit', 'Max rows (default 100)')
  .handle(async (input, ctx) => {
    return ctx.db.$queryRaw(input.sql);
  });
```

3 concurrent queries max, 10 queued, 2MB response cap. The intent mutex is automatic for any `f.mutation()` tool.

## Testing {#testing}

```typescript
import { describe, it, expect } from 'vitest';
import { initVurb, success } from '@vurb/core';

const f = initVurb<void>();

describe('Runtime Guards', () => {
  it('load-sheds when at capacity', async () => {
    const tool = f.query('billing.charge')
      .describe('Charge billing')
      .concurrency({ max: 1, queueSize: 0 })
      .handle(async () => {
        await new Promise(r => setTimeout(r, 100));
        return success('charged');
      });

    const first = tool.execute(undefined, { action: 'default' });
    const second = await tool.execute(undefined, { action: 'default' });

    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain('SERVER_BUSY');
    expect((await first).isError).toBeUndefined();
  });

  it('truncates oversized responses', async () => {
    const tool = f.query('logs.search')
      .describe('Search logs')
      .egress(2048)
      .handle(async () => success('x'.repeat(10_000)));

    const result = await tool.execute(undefined, { action: 'default' });
    expect(result.content[0].text).toContain('[SYSTEM INTERVENTION');
  });
});
```
