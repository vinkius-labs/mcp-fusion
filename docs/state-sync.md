# State Sync

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Inline Fluent API](#inline)
- [Registry-Level Policies](#registry)
- [How It Works](#how)
- [Cache Directives](#directives)
- [Cross-Domain Invalidation](#cross-domain)
- [Glob Patterns](#globs)
- [Observability](#observability)
- [Overlap Detection](#overlaps)
- [Performance](#performance)
- [API Reference](#api)

## Introduction {#introduction}

LLMs have no sense of time. After calling `sprints.list` and then `sprints.create`, the agent still believes the list is unchanged — nothing told it the data is stale. It makes decisions on outdated information.

MCP Fusion's State Sync injects RFC 7234-inspired cache-control signals into MCP responses, guiding the agent to re-read after mutations. LLMs are trained on web pages with HTTP cache headers — they interpret `no-store` as "re-fetch before using" and `immutable` as "never changes." Zero overhead when not configured.

> Based on ["Your LLM Agents are Temporally Blind"](https://arxiv.org/abs/2510.23853)

## Inline Fluent API {#inline}

The simplest way to declare state sync is directly on the tool builder:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

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
