# State Sync

- [Introduction](#introduction)
- [The Temporal Blindness Problem](#problem)
- [Quick Start](#quickstart)
- [Cache Directives](#directives)
- [Causal Invalidation](#invalidation)
- [Cross-Domain Dependencies](#cross-domain)
- [Observability](#observability)

## Introduction {#introduction}

LLMs have no sense of time. After calling `sprints.list` and then `sprints.create`, the agent still believes the original list is unchanged — nothing told it the data is stale. It keeps working with outdated information, making decisions based on data that no longer exists.

MCP Fusion's State Sync injects RFC 7234-inspired cache-control signals into MCP responses. After a successful mutation, the agent receives an invalidation signal telling it which data is now stale. Zero overhead when not configured.

## The Temporal Blindness Problem {#problem}

```text
Agent: calls sprints.list → receives 5 sprints
Agent: calls sprints.create → creates sprint #6
Agent: uses the original list (still shows 5 sprints)
Agent: tells the user "You have 5 sprints" ← WRONG, there are 6
```

With State Sync, after `sprints.create` succeeds, the response includes:

```text
[System: Cache invalidated for sprints.* — caused by sprints.create]
```

The agent knows the sprint list is stale and re-fetches before answering.

## Quick Start {#quickstart}

### Inline Fluent API (Recommended for Simple Cases)

The fastest approach — declare cache behavior directly on the tool builder:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

// Reference data — safe to cache forever
const listCountries = f.query('countries.list')
  .describe('List all country codes')
  .cached()
  .handle(async (input, ctx) => ctx.db.countries.findMany());

// Volatile data — always re-fetch
const listSprints = f.query('sprints.list')
  .describe('List workspace sprints')
  .stale()
  .handle(async (input, ctx) => ctx.db.sprints.findMany());

// Mutation — invalidates sprint cache on success
const createSprint = f.action('sprints.create')
  .describe('Create a new sprint')
  .invalidates('sprints.*')
  .withString('name', 'Sprint name')
  .handle(async (input, ctx) => ctx.db.sprints.create({ data: { name: input.name } }));

// Cross-domain invalidation
const updateTask = f.action('tasks.update')
  .describe('Update a task')
  .invalidates('tasks.*', 'sprints.*')
  .withString('id', 'Task ID')
  .withOptionalString('title', 'New title')
  .handle(async (input, ctx) => ctx.db.tasks.update({
    where: { id: input.id },
    data: { title: input.title },
  }));
```

### Fluent StateSyncBuilder (f.stateSync())

For centralized policies across many tools:

```typescript
const sync = f.stateSync()
  .defaults(p => p.stale())                    // all tools default to no-store
  .policy('countries.*', p => p.cached())      // override: reference data
  .policy('sprints.create', p => p.invalidates('sprints.*'))
  .policy('sprints.delete', p => p.invalidates('sprints.*'))
  .policy('tasks.update', p => p.invalidates('tasks.*', 'sprints.*'))
  .onInvalidation(event => {
    console.log(`[invalidation] ${event.causedBy} → ${event.patterns.join(', ')}`);
  });
```

### Registry-Level Config (Alternative)

Configure State Sync when attaching the registry to the server:

```typescript
import { initFusion, ToolRegistry } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();
const registry = new ToolRegistry();

// ... register your tools ...

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

Two things happen automatically:

1. **`tools/list` descriptions** get cache directives: `"Manage sprints. [Cache-Control: no-store]"`
2. **Successful mutations** prepend invalidation signals to the response

## Cache Directives {#directives}

| Directive | Meaning | Use Case |
|---|---|---|
| `'no-store'` | Dynamic data, may change at any time | User-generated content, transactional data |
| `'immutable'` | Reference data, never changes | Country codes, currencies, static config |

LLMs are trained on web pages with HTTP cache headers. They interpret `no-store` as "re-fetch before using" and `immutable` as "safe to cache forever." No `max-age` because LLMs have no internal clock.

## Causal Invalidation {#invalidation}

After a successful mutation, a system block is prepended to the response:

```json
{
  "content": [
    { "type": "text", "text": "[System: Cache invalidated for sprints.* — caused by sprints.create]" },
    { "type": "text", "text": "{\"ok\": true}" }
  ]
}
```

> [!IMPORTANT]
> Failed mutations (`isError: true`) emit **no invalidation** — the state didn't change, so there's nothing to invalidate.

### Glob Patterns

`*` matches one segment. `**` matches zero or more segments:

| Pattern | Matches | Doesn't Match |
|---|---|---|
| `sprints.get` | `sprints.get` | `sprints.list` |
| `sprints.*` | `sprints.get`, `sprints.update` | `sprints.tasks.get` |
| `sprints.**` | `sprints.get`, `sprints.tasks.get` | `tasks.get` |

Policies are **first-match-wins**. Place narrow patterns before broad ones.

## Cross-Domain Dependencies {#cross-domain}

A task update changes the sprint's task count. Declare the causal dependency:

```typescript
policies: [
  { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
  { match: 'tasks.create', invalidates: ['tasks.*', 'sprints.*'] },
]
```

After `tasks.update` succeeds, the agent sees: `[System: Cache invalidated for tasks.*, sprints.* — caused by tasks.update]`. It knows both the task list AND the sprint data are stale.

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

The `InvalidationEvent` contains `causedBy` (the tool that triggered it), `patterns` (the invalidated glob patterns), and `timestamp` (ISO-8601). Observer exceptions are silently caught — an error in your metrics pipeline never blocks the tool response.