# State Sync

LLMs have no sense of time. After calling `sprints.list` and then `sprints.create`, the agent still believes the list is unchanged — nothing told it the data is stale. State Sync injects RFC 7234-inspired cache-control signals into MCP responses, guiding the agent to re-read after mutations. Zero overhead when not configured.

> Based on ["Your LLM Agents are Temporally Blind"](https://arxiv.org/abs/2510.23853)

## Quick Start {#quickstart}

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

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

```
"Manage workspace sprints. [Cache-Control: no-store]"
"List country codes. [Cache-Control: immutable]"
```

LLMs are trained on web pages with HTTP cache headers. They interpret `no-store` as "re-fetch before using" and `immutable` as "never changes."

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

## Cross-Domain Invalidation {#cross-domain}

A task update changes the sprint's task count. Declare the causal dependency:

```typescript
policies: [
  { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
  { match: 'tasks.create', invalidates: ['tasks.*', 'sprints.*'] },
]
```

After `tasks.update` succeeds: `[System: Cache invalidated for tasks.*, sprints.* — caused by tasks.update]`

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
// → { method: 'notifications/resources/updated', params: { uri: 'fusion://stale/sprints.*' } }
```

Fire-and-forget. Async rejections are swallowed.

## Overlap Detection {#overlaps}

`detectOverlaps()` catches policy ordering bugs at startup:

```typescript
import { detectOverlaps } from '@vinkius-core/mcp-fusion';

const warnings = detectOverlaps([
  { match: 'sprints.*', cacheControl: 'no-store' },
  { match: 'sprints.update', invalidates: ['sprints.*'] },  // shadowed!
]);

for (const w of warnings) {
  console.warn(`Policy [${w.shadowingIndex}] shadows [${w.shadowedIndex}]: ${w.message}`);
}
```

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
