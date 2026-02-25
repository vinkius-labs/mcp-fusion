# State Sync

LLMs operating through MCP have no sense of time. They cannot distinguish between data fetched 2 seconds ago and data fetched 20 minutes ago. This architectural blindspot — called **Temporal Blindness** — causes silent data corruption when AI agents make decisions based on stale state.

MCP Fusion's **State Sync** layer solves this by injecting RFC 7234-inspired cache-control signals directly into the MCP protocol, guiding the LLM to re-read data after mutations.

::: tip Zero Overhead
State Sync is fully opt-in. When not configured, **no code runs** — no conditionals, no overhead. The layer only activates when you pass `stateSync` to `attachToServer()`.
:::

---

## The Problem

### 1. Temporal Blindness

An LLM calls `sprints.list` and receives 5 sprints. Later in the conversation, it calls `sprints.create` to add a new sprint. When asked "how many sprints are there?", the LLM answers **5** — because it has no signal that its cached knowledge is stale.

### 2. Causal State Drift

A more dangerous variant: the LLM calls `tasks.update` to move a task to a different sprint. The sprint's task count has now changed, but the LLM still believes the old count is correct. **The mutation causally invalidated a domain it never directly touched.**

### The Insight

LLMs are trained on billions of web pages containing HTTP cache headers. They interpret `Cache-Control: no-store` (don't cache this) and `Cache-Control: immutable` (this never changes) at a semantic level. State Sync exploits this training.

> 📄 Based on the research paper: ["Your LLM Agents are Temporally Blind"](https://arxiv.org/abs/2510.23853)

---

## Quick Start

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
registry.registerAll(sprintsTool, tasksTool, countriesEnumTool);

registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    stateSync: {
        defaults: { cacheControl: 'no-store' },
        policies: [
            // Mutations that invalidate related domains
            { match: 'sprints.update', invalidates: ['sprints.*'] },
            { match: 'sprints.create', invalidates: ['sprints.*'] },
            { match: 'sprints.delete', invalidates: ['sprints.*'] },
            { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },

            // Static reference data
            { match: 'countries.*',    cacheControl: 'immutable' },
        ],
    },
});
```

That's it. Fusion now automatically:

1. **Appends `[Cache-Control: X]` to tool descriptions** during `tools/list`
2. **Prepends `[System: Cache invalidated...]` to responses** after successful mutations

---

## How It Works

### Cache-Control Decoration (`tools/list`)

When the LLM requests the tool list, descriptions are decorated with their cache directive:

```
Before: "Manage workspace sprints."
After:  "Manage workspace sprints. [Cache-Control: no-store]"

Before: "List country codes."
After:  "List country codes. [Cache-Control: immutable]"
```

The LLM reads `no-store` as "I should re-fetch this data before using it" and `immutable` as "this data never changes, I can trust my cached copy."

### Causal Invalidation (`tools/call`)

After a successful mutation (when `isError` is not `true`), State Sync prepends a system block to the response:

```json
{
  "content": [
    { "type": "text", "text": "[System: Cache invalidated for sprints.*, tasks.* — caused by tasks.update]" },
    { "type": "text", "text": "{\"ok\": true}" }
  ]
}
```

The LLM sees this signal **before** the actual response data. It knows:
- **What changed:** `sprints.*` and `tasks.*` domains
- **Why:** caused by `tasks.update`
- **What to do:** re-read those domains before using cached data

::: warning isError Guard
If a mutation fails (`isError: true`), **no invalidation signals are emitted**. A failed mutation means the state didn't actually change — invalidating caches would force unnecessary re-reads.
:::

---

## Configuration

### `StateSyncConfig`

```typescript
interface StateSyncConfig {
    /** Policy rules, evaluated in declaration order (first match wins). */
    policies: SyncPolicy[];
    /** Defaults applied when no policy matches a tool. */
    defaults?: {
        cacheControl?: CacheDirective;
    };
}
```

### `SyncPolicy`

```typescript
interface SyncPolicy {
    /** Glob pattern to match tool names. */
    match: string;
    /** Cache directive for matching tools' descriptions. */
    cacheControl?: CacheDirective;
    /** Glob patterns of tools whose cache is invalidated on success. */
    invalidates?: string[];
}
```

### `CacheDirective`

| Value | Semantics | When to Use |
|---|---|---|
| `'no-store'` | Data may change at any time — do not trust cached values | Dynamic data (lists, status, counts) |
| `'immutable'` | Data never changes — cached values are always valid | Reference data (countries, currencies, enums) |

::: info Why No `max-age`?
LLMs have no internal clock. Unlike browsers, they cannot evaluate time-based cache expiration. The binary `no-store` / `immutable` vocabulary is the maximum useful precision.
:::

---

## Glob Pattern Matching

Tool names are matched against policies using dot-separated glob patterns:

| Pattern | Matches | Does NOT Match |
|---|---|---|
| `sprints.get` | `sprints.get` | `sprints.list` |
| `sprints.*` | `sprints.get`, `sprints.update` | `sprints.tasks.get` |
| `sprints.**` | `sprints.get`, `sprints.tasks.get` | `tasks.get` |
| `**` | Everything | — |
| `*.get` | `sprints.get`, `tasks.get` | `sprints.tasks.get` |
| `**.get` | `sprints.get`, `a.b.c.get` | `sprints.update` |

- `*` matches exactly **one** segment
- `**` matches **zero or more** segments

### First-Match-Wins

Policies are evaluated in **declaration order**. The first matching policy wins:

```typescript
policies: [
    { match: 'sprints.get', cacheControl: 'immutable' },    // ← wins for sprints.get
    { match: 'sprints.*',   cacheControl: 'no-store' },     // ← wins for all other sprints.*
]
```

### Defaults Fallback

When no policy matches a tool, the `defaults.cacheControl` is applied. If no defaults are configured, no decoration occurs for unmatched tools.

```typescript
stateSync: {
    defaults: { cacheControl: 'no-store' },  // Every tool gets no-store unless overridden
    policies: [
        { match: 'countries.*', cacheControl: 'immutable' },  // Override for static data
    ],
}
```

---

## Real-World Patterns

### Cross-Domain Invalidation

A task update changes the sprint's task count. Declare cross-domain invalidation:

```typescript
policies: [
    { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
    { match: 'tasks.create', invalidates: ['tasks.*', 'sprints.*'] },
    { match: 'tasks.delete', invalidates: ['tasks.*', 'sprints.*'] },
]
```

After `tasks.update` succeeds, the LLM sees:
```
[System: Cache invalidated for tasks.*, sprints.* — caused by tasks.update]
```

### Read-Only Tools (No Invalidation)

Read-only tools with `cacheControl` but no `invalidates` just get description decoration:

```typescript
{ match: 'reports.*', cacheControl: 'no-store' }
// Description: "Generate reports. [Cache-Control: no-store]"
// No invalidation signals on call
```

### Mixed Static and Dynamic

```typescript
stateSync: {
    defaults: { cacheControl: 'no-store' },
    policies: [
        // Static → safe to cache forever
        { match: 'countries.*', cacheControl: 'immutable' },
        { match: 'currencies.*', cacheControl: 'immutable' },
        { match: 'timezones.*', cacheControl: 'immutable' },

        // Mutations → explicit invalidation
        { match: 'sprints.create', invalidates: ['sprints.*'] },
        { match: 'sprints.update', invalidates: ['sprints.*'] },
        { match: 'sprints.delete', invalidates: ['sprints.*'] },
        { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },

        // Everything else → falls through to default: no-store
    ],
}
```

---

## Architecture

State Sync is built from **5 modules**, each with a single responsibility:

```
state-sync/
├── types.ts              → Core types (CacheDirective, SyncPolicy, etc.)
├── PolicyValidator.ts    → Fail-fast config validation at construction
├── GlobMatcher.ts        → Iterative dot-separated glob matching
├── PolicyEngine.ts       → First-match-wins resolution with bounded cache
├── DescriptionDecorator.ts → Append [Cache-Control: X] to descriptions
├── CausalEngine.ts       → isError guard + invalidation resolution
├── ResponseDecorator.ts  → Prepend [System: ...] to responses
├── StateSyncLayer.ts     → Orchestrator (thin facade)
└── index.ts              → Barrel exports
```

### Performance Characteristics

| Operation | Complexity | Notes |
|---|---|---|
| Policy resolution | O(P) first call, O(1) cached | P = number of policies |
| `tools/list` decoration | O(1) per tool (cached) | Decorated tools cached by name |
| `tools/call` decoration | O(1) | Policy lookup is cached |
| Glob matching | O(N·M) worst-case | N = pattern segments, M = name segments |
| Memory (cache) | Bounded at 2048 entries | Full eviction on overflow |

### Security

- **Bounded iteration**: Glob matcher uses `MAX_ITERATIONS = 1024` to prevent adversarial pattern DoS
- **Bounded cache**: Policy cache is capped at 2048 entries to prevent memory exhaustion
- **Fail-fast validation**: All policies and defaults are validated at construction time
- **isError guard**: Failed mutations never trigger invalidation (prevents incorrect state signals)
- **Immutable results**: All `ResolvedPolicy` objects are `Object.freeze()`'d

---

## API Reference

### `StateSyncLayer`

The orchestrator class — used internally by `ServerAttachment`.

| Method | Description |
|---|---|
| `constructor(config)` | Validates config, creates `PolicyEngine` |
| `decorateTools(tools)` | Decorates `McpTool[]` descriptions with cache directives |
| `decorateResult(name, result)` | Decorates `ToolResponse` with invalidation signals |

### `PolicyEngine`

Available for advanced use cases (custom pipelines, testing).

| Method | Description |
|---|---|
| `constructor(policies, defaults?)` | Validates and stores policies |
| `resolve(toolName)` | Returns `ResolvedPolicy \| null` for a tool name |

### `matchGlob(pattern, name)`

Pure function for dot-separated glob matching. Available for advanced use cases.

```typescript
import { matchGlob } from '@vinkius-core/mcp-fusion';

matchGlob('sprints.*', 'sprints.get');       // true
matchGlob('sprints.*', 'sprints.tasks.get'); // false
matchGlob('**', 'anything.at.all');          // true
```

### Types

| Type | Description |
|---|---|
| `StateSyncConfig` | Configuration object for `AttachOptions.stateSync` |
| `SyncPolicy` | A single policy rule (match, cacheControl, invalidates) |
| `CacheDirective` | `'no-store' \| 'immutable'` |
| `ResolvedPolicy` | Result of resolving a tool name against policies |
| `InvalidationEvent` | `{ causedBy, patterns, timestamp }` — fired on invalidation |
| `ResourceNotification` | MCP protocol notification payload |
| `OverlapWarning` | Result of `detectOverlaps()` — policy shadowing info |

---

## Observability Hooks

### onInvalidation Callback

React to invalidation events for logging, metrics, or downstream coordination:

```typescript
registry.attachToServer(server, {
    stateSync: {
        policies: [
            { match: 'billing.pay', invalidates: ['billing.invoices.*', 'reports.balance'] },
        ],
        onInvalidation: (event) => {
            console.log(`[invalidation] ${event.causedBy} → ${event.patterns.join(', ')}`);
            metrics.increment('cache.invalidations', { tool: event.causedBy });
        },
    },
});
```

The `InvalidationEvent` contains:

| Field | Type | Description |
|---|---|---|
| `causedBy` | `string` | Tool name that triggered the invalidation |
| `patterns` | `string[]` | Domain patterns that were invalidated |
| `timestamp` | `number` | `Date.now()` value when the invalidation occurred |

::: warning
Observer exceptions are silently caught — a crashing observer never breaks the pipeline.
:::

### notificationSink — Protocol-Level Notifications

Emit MCP `notifications/resources/updated` notifications for each invalidated domain. Useful for Multi-Agent architectures where downstream clients subscribe to resource changes:

```typescript
registry.attachToServer(server, {
    stateSync: {
        policies: [
            { match: 'sprints.create', invalidates: ['sprints.*'] },
        ],
        notificationSink: (notification) => {
            server.notification(notification);
        },
    },
});
// After sprints.create succeeds:
// → { method: 'notifications/resources/updated', params: { uri: 'fusion://stale/sprints.*' } }
```

The sink is fire-and-forget. Both sync and async sinks are supported — async rejections are safely swallowed to prevent unhandled promise rejections.

---

## Policy Overlap Detection

Use `detectOverlaps()` to identify policy ordering issues at startup:

```typescript
import { detectOverlaps } from '@vinkius-core/mcp-fusion';

const warnings = detectOverlaps([
    { match: 'sprints.*', cacheControl: 'no-store' },      // index 0
    { match: 'sprints.update', invalidates: ['sprints.*'] }, // index 1 — shadowed by 0!
]);

for (const w of warnings) {
    console.warn(`Policy [${w.shadowingIndex}] shadows [${w.shadowedIndex}]: ${w.message}`);
}
```

This is a static analysis utility — call it at server startup to catch first-match-wins ordering bugs before they affect production.

---

## Combining with Other Features

State Sync works seamlessly with all Fusion features:

```typescript
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    debug: createDebugObserver(),        // ← Observability
    filter: { tags: ['core'] },          // ← Tag filtering
    stateSync: {                         // ← State Sync
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'tasks.update', invalidates: ['tasks.*', 'sprints.*'] },
            { match: 'countries.*', cacheControl: 'immutable' },
        ],
    },
});
```

All three features compose orthogonally — each operates at a different layer of the protocol pipeline.
