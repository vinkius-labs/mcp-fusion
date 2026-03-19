# State Sync

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Mark 'sprints.list' as stale (no-store), 'countries.list' as cached (immutable), and make 'sprints.create' invalidate all sprints.* data."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Mark \'sprints.list\' as stale (no-store), \'countries.list\' as cached (immutable), and make \'sprints.create\' invalidate all sprints.* data.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Mark+'sprints.list'+as+stale+(no-store)%2C+'countries.list'+as+cached+(immutable)%2C+and+make+'sprints.create'+invalidate+all+sprints.*+data." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Mark+'sprints.list'+as+stale+(no-store)%2C+'countries.list'+as+cached+(immutable)%2C+and+make+'sprints.create'+invalidate+all+sprints.*+data." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">TEMPORAL AWARENESS</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">LLMs have no sense of time.<br><span style="color:rgba(255,255,255,0.25)">State Sync fixes that.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">After calling <code style="font-size:12px">sprints.list</code> and then <code style="font-size:12px">sprints.create</code>, the agent still believes the list is unchanged. State Sync injects RFC 7234-inspired cache signals into MCP responses.</div>
</div>

## Introduction {#introduction}

LLMs have no sense of time. After calling `sprints.list` and then `sprints.create`, the agent still believes the list is unchanged — nothing told it the data is stale. It makes decisions on outdated information.

Vurb.ts's State Sync injects RFC 7234-inspired cache-control signals into MCP responses, guiding the agent to re-read after mutations. LLMs are trained on web pages with HTTP cache headers — they interpret `no-store` as "re-fetch before using" and `immutable` as "never changes." Zero overhead when not configured.

> Based on ["Your LLM Agents are Temporally Blind"](https://arxiv.org/abs/2510.23853)

## Inline Fluent API {#inline}

The simplest way to declare state sync is directly on the tool builder:

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb<AppContext>();

// Reference data — safe to cache forever
const listCountries = f.query('countries.list')
  .describe('List all country codes')
  .cached()
  .handle(async (input, ctx) => {
    return ctx.db.countries.findMany();
  });

// Volatile data — always re-fetch before acting on it
const listSprints = f.query('sprints.list')
  .describe('List workspace sprints')
  .stale()
  .handle(async (input, ctx) => {
    return ctx.db.sprints.findMany({ where: { tenantId: ctx.tenantId } });
  });

// Mutation — invalidates cached data on success
const createSprint = f.action('sprints.create')
  .describe('Create a new sprint')
  .invalidates('sprints.*')
  .withString('name', 'Sprint name')
  .handle(async (input, ctx) => {
    return ctx.db.sprints.create({ data: { name: input.name } });
  });

// Cross-domain invalidation — tasks affect sprints too
const updateTask = f.action('tasks.update')
  .describe('Update a task')
  .invalidates('tasks.*', 'sprints.*')
  .withString('id', 'Task ID')
  .withOptionalString('title', 'New title')
  .handle(async (input, ctx) => {
    return ctx.db.tasks.update({
      where: { id: input.id },
      data: { title: input.title },
    });
  });
```

| Method | Cache Directive | Use When |
|--------|-----------------|----------|
| `.cached()` | `immutable` | Reference data — country codes, timezones, enums |
| `.stale()` | `no-store` | Volatile data — always re-fetch before acting |
| `.invalidates(...patterns)` | Causal signal | Mutations — tell the agent what data changed |

> [!TIP]
> Inline methods are the recommended approach for simple tools. For complex policies (dozens of tools, cross-tool dependencies), use registry-level configuration instead.

## Registry-Level Policies {#registry}

For full control over cache policies across your entire server, configure `stateSync` at the registry level:

```typescript
import { ToolRegistry } from '@vurb/core';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(sprintsTool, tasksTool, countriesEnumTool);

registry.attachToServer(server, {
  contextFactory: (extra) => createAppContext(extra),
  stateSync: {
    defaults: { cacheControl: 'no-store' },
    policies: [
      { match: 'sprints.update', invalidates: ['sprints.*'] },
      { match: 'sprints.create', invalidates: ['sprints.*'] },
      { match: 'sprints.delete', invalidates: ['sprints.*'] },
      { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },
      { match: 'countries.*',    cacheControl: 'immutable' },
    ],
  },
});
```

Two things happen automatically: `tools/list` descriptions get cache directives appended, and successful mutations prepend invalidation signals to responses.

## How It Works {#how}

**Description decoration** — the LLM sees cache directives inline:

```text
"Manage workspace sprints. [Cache-Control: no-store]"
"List country codes. [Cache-Control: immutable]"
```

**Causal invalidation** — after a successful mutation, a system block is prepended:

```json
{
  "content": [
    { "type": "text", "text": "[System: Cache invalidated for sprints.*, tasks.* — caused by tasks.update]" },
    { "type": "text", "text": "{\"ok\": true}" }
  ]
}
```

Failed mutations (`isError: true`) emit no invalidation — the state didn't change.

## Cache Directives {#directives}

`'no-store'` — dynamic data, may change at any time. `'immutable'` — reference data, never changes. No `max-age` because LLMs have no internal clock.

## Cross-Domain Invalidation {#cross-domain}

A task update changes the sprint's task count. Declare the causal dependency:

```typescript
// Inline:
const updateTask = f.action('tasks.update')
  .invalidates('tasks.*', 'sprints.*')
  .handle(async (input, ctx) => { /* ... */ });

// Or via policies:
policies: [
  { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
  { match: 'tasks.create', invalidates: ['tasks.*', 'sprints.*'] },
]
```

After `tasks.update` succeeds: `[System: Cache invalidated for tasks.*, sprints.* — caused by tasks.update]`

## Glob Patterns {#globs}

`*` matches one segment. `**` matches zero or more segments.

| Pattern | Matches | Doesn't match |
|---|---|---|
| `sprints.get` | `sprints.get` | `sprints.list` |
| `sprints.*` | `sprints.get`, `sprints.update` | `sprints.tasks.get` |
| `sprints.**` | `sprints.get`, `sprints.tasks.get` | `tasks.get` |

Policies are **first-match-wins**. A broad pattern before a narrow one swallows it:

```typescript
policies: [
  { match: 'sprints.get', cacheControl: 'immutable' },  // wins for sprints.get
  { match: 'sprints.*',   cacheControl: 'no-store' },   // wins for other sprints.*
]
```

Unmatched tools use `defaults.cacheControl`. No defaults = no decoration.

## Observability {#observability}

`onInvalidation` receives events for logging or metrics:

```typescript
stateSync: {
  policies: [
    { match: 'billing.pay', invalidates: ['billing.invoices.*', 'reports.balance'] },
  ],
  onInvalidation: (event) => {
    console.log(`[invalidation] ${event.causedBy} → ${event.patterns.join(', ')}`);
    metrics.increment('cache.invalidations', { tool: event.causedBy });
  },
}
```

`InvalidationEvent`: `causedBy` (string), `patterns` (readonly string[]), `timestamp` (ISO-8601). Observer exceptions are silently caught.

`notificationSink` emits MCP `notifications/resources/updated` for each invalidated domain:

```typescript
notificationSink: (notification) => {
  server.notification(notification);
}
// → { method: 'notifications/resources/updated', params: { uri: 'Vurb.ts://stale/sprints.*' } }
```

Fire-and-forget. Async rejections are swallowed.

## Overlap Detection {#overlaps}

`detectOverlaps()` catches policy ordering bugs at startup:

```typescript
import { detectOverlaps } from '@vurb/core';

const warnings = detectOverlaps([
  { match: 'sprints.*', cacheControl: 'no-store' },
  { match: 'sprints.update', invalidates: ['sprints.*'] },  // shadowed!
]);

for (const w of warnings) {
  console.warn(`Policy [${w.shadowingIndex}] shadows [${w.shadowedIndex}]: ${w.message}`);
}
```

> [!TIP]
> Run `detectOverlaps()` in your dev or startup script. It catches shadowed policies that are otherwise silent bugs — the narrow policy never fires because a broader one matches first.

## Performance {#performance}

Policy resolution: O(P) first call, O(1) cached. `tools/list` decoration: O(1) per tool (cached). `tools/call` invalidation: O(1) (cached). Memory capped at 2048 entries with full eviction on overflow. Glob matcher has `MAX_ITERATIONS = 1024` against adversarial patterns. All `ResolvedPolicy` objects are frozen. Policies validated at construction time.

## API Reference {#api}

```typescript
interface StateSyncConfig {
  policies: SyncPolicy[];
  defaults?: { cacheControl?: CacheDirective };
  onInvalidation?: (event: InvalidationEvent) => void;
  notificationSink?: (notification: ResourceNotification) => void | Promise<void>;
}

interface SyncPolicy {
  match: string;
  cacheControl?: CacheDirective;
  invalidates?: string[];
}
```

`matchGlob(pattern, name)` — pure function for dot-separated glob matching. `PolicyEngine` — advanced class for custom pipelines: `new PolicyEngine(policies, defaults).resolve('sprints.get')`.
