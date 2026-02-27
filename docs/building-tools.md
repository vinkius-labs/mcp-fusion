# Building Tools

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Context Setup](#context)
- [Semantic Verbs](#verbs)
- [Parameter Declaration](#params)
- [AI Instructions](#instructions)
- [Semantic Overrides & Annotations](#annotations)
- [Connecting a Presenter](#presenter)
- [Middleware — Context Derivation](#middleware)
- [State Sync — Cache & Invalidation](#state-sync)
- [Runtime Guards](#runtime-guards)
- [Streaming Progress](#streaming)
- [Registering & Serving](#register)

## Introduction {#introduction}

Most MCP servers force you to define tools via giant, nested JSON schemas or tangled Zod objects. A 10-line query requires 40 lines of boilerplate — hand-written schemas, manual parameter validation, explicit `success()` wrapping, and disconnected error handling. The result is code that nobody enjoys reading or maintaining.

MCP Fusion's **Fluent API** eliminates all of that. You declare what your tool does, what it needs, and how it behaves — through semantic verbs, chainable builder methods, and a terminal `.handle()`. The framework handles schema generation, validation, response wrapping, and type inference automatically.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: DatabaseClient;
  tenantId: string;
}

const f = initFusion<AppContext>();

export const listTasks = f.query('tasks.list')
  .describe('Lists all tasks for the current user')
  .instructions('Use when the user asks for a summary of their work.')
  .withOptionalEnum('status', ['open', 'closed'] as const, 'Filter by status')
  .returns(TaskPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.tasks.findMany({
      where: { tenantId: ctx.tenantId, status: input.status },
    });
  });
```

Everything — `input.status`, `ctx.db`, `ctx.tenantId` — is fully typed, zero annotations. The handler just returns raw data; the framework wraps it with `success()` automatically.

## Context Setup {#context}

Before building tools, define the **application context** — the shared state every handler receives. Pass a generic to `initFusion()` and store the result in a shared file:

```typescript
// src/fusion.ts
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: DatabaseClient;
  tenantId: string;
  userId: string;
}

export const f = initFusion<AppContext>();
```

> [!TIP]
> Import `f` across all your tool files. The generic parameter flows through every builder, middleware, and Presenter — zero annotations needed downstream.

## Semantic Verbs {#verbs}

Every tool starts with a **semantic verb** that tells the LLM (and your team) what kind of operation it is:

```typescript
// ── Query: Read-only, no side effects ──────────────────
const listUsers = f.query('users.list')
  .describe('List all users in the workspace')
  .handle(async (input, ctx) => { /* ... */ });

// ── Action: Creates or updates data (reversible) ────────
const createUser = f.action('users.create')
  .describe('Create a new user in the workspace')
  .withString('email', 'User email address')
  .handle(async (input, ctx) => { /* ... */ });

// ── Mutation: Destructive, irreversible ─────────────────
const deleteUser = f.mutation('users.delete')
  .describe('Permanently delete a user and all their data')
  .withString('id', 'User ID to delete')
  .handle(async (input, ctx) => { /* ... */ });
```

The LLM sees these annotations in tool descriptions: `f.query()` adds `[READ-ONLY]`, `f.mutation()` adds `[DESTRUCTIVE]`. MCP clients like Claude Desktop read the annotations and show confirmation dialogs before destructive operations — no prompt engineering needed.

| Verb | MCP Annotations | When to Use |
|---|---|---|
| `f.query()` | `readOnly: true`, `destructive: false` | Fetching data — lists, searches, lookups |
| `f.action()` | Neutral (no flags) | Creating or updating data — reversible side effects |
| `f.mutation()` | `destructive: true` | Deleting, purging, revoking — irreversible changes |

## Parameter Declaration {#params}

Use chainable `with*()` methods instead of Zod schemas. Every method generates a proper JSON Schema under the hood:

```typescript
const semanticSearch = f.query('search.semantic')
  .describe('Search across workspace using embeddings')
  .withString('query', 'The natural language search term')
  .withOptionalNumber('limit', 'Maximum number of results to return')
  .withOptionalEnum('priority', ['high', 'low', 'medium'] as const, 'Filter by priority')
  .withOptionalArray('tags', 'string', 'Filter items by tags')
  .withOptionalBoolean('active_only', 'Only search active items')
  .handle(async (input, ctx) => {
    // input.query: string          ← required
    // input.limit: number | undefined  ← optional
    // input.priority: 'high' | 'low' | 'medium' | undefined
    // input.tags: string[] | undefined
    // input.active_only: boolean | undefined
  });
```

### Available `with*()` Methods

| Method | Required | TypeScript Type |
|--------|----------|-----------------|
| `.withString(name, desc)` | ✅ | `string` |
| `.withOptionalString(name, desc)` | ❌ | `string \| undefined` |
| `.withNumber(name, desc)` | ✅ | `number` |
| `.withOptionalNumber(name, desc)` | ❌ | `number \| undefined` |
| `.withBoolean(name, desc)` | ✅ | `boolean` |
| `.withOptionalBoolean(name, desc)` | ❌ | `boolean \| undefined` |
| `.withEnum(name, values, desc)` | ✅ | Union of values |
| `.withOptionalEnum(name, values, desc)` | ❌ | Union of values \| undefined |
| `.withArray(name, type, desc)` | ✅ | `T[]` |
| `.withOptionalArray(name, type, desc)` | ❌ | `T[] \| undefined` |

> [!NOTE]
> Types accumulate as you chain calls. Each `.with*()` extends the generic `TInput`, so the final `.handle()` function has 100% accurate autocomplete with zero manual annotations.

## AI Instructions {#instructions}

`.instructions()` injects system-level guidance directly into the tool description. This is **Prompt Engineering embedded in the framework** — the LLM reads it before deciding whether and how to use the tool:

```typescript
export const searchDocs = f.query('docs.search')
  .describe('Search internal documentation')
  .instructions(
    'Use ONLY when the user asks about internal policies or procedures. ' +
    'Do NOT use for general knowledge questions.'
  )
  .withString('query', 'Search term')
  .handle(async (input, ctx) => {
    return ctx.docs.search(input.query);
  });
```

The LLM sees:

```text
[INSTRUCTIONS] Use ONLY when the user asks about internal policies or procedures.
Do NOT use for general knowledge questions.

Search internal documentation
```

> [!TIP]
> Use `.instructions()` for behavioral guidance — when to use the tool, what to avoid, how to format the output. Use `.describe()` for what the tool does. Together they eliminate hallucinated tool calls.

## Semantic Overrides & Annotations {#annotations}

### Fine-Grained Semantic Control

Each verb sets defaults, but you can override them on any tool:

```typescript
// An action that is safe to retry
const updateConfig = f.action('config.update')
  .describe('Update application configuration')
  .idempotent()   // ← safe to retry, no duplicate side effects
  .withString('key', 'Config key')
  .withString('value', 'New value')
  .handle(async (input, ctx) => { /* ... */ });

// An action that is also read-only (despite being an action verb)
const healthCheck = f.action('system.health')
  .describe('Run a system health check')
  .readOnly()     // ← override: no side effects
  .handle(async (input, ctx) => { /* ... */ });
```

| Override | Effect |
|----------|--------|
| `.readOnly()` | Sets `readOnlyHint: true` in MCP annotations |
| `.destructive()` | Sets `destructiveHint: true` — triggers confirmation dialogs |
| `.idempotent()` | Sets `idempotentHint: true` — safe to retry |

### Custom MCP Annotations

For tool-specific metadata beyond the standard hints, use `.annotations()`:

```typescript
const betaFeature = f.query('beta.experimental')
  .describe('Access experimental beta features')
  .annotations({
    openWorldHint: true,
    title: 'Beta Features',
  })
  .handle(async (input, ctx) => { /* ... */ });
```

### Capability Tags

Use `.tags()` for selective tool exposure. Tags let you filter tools at registration time — exposing different sets to different clients:

```typescript
const adminTool = f.mutation('admin.reset')
  .describe('Reset all user sessions')
  .tags('internal', 'admin')
  .handle(async (input, ctx) => { /* ... */ });

// Later, at registration:
registry.attachToServer(server, {
  filter: { exclude: ['internal'] }, // hides admin tools from public clients
});
```

## Connecting a Presenter {#presenter}

The `.returns()` method attaches an MVA [Presenter](/presenter) that controls exactly what the agent sees:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

const ProjectPresenter = createPresenter('Project')
  .schema({
    id:     t.string,
    name:   t.string,
    status: t.enum('active', 'archived'),
  })
  .limit(50);

export const listProjects = f.query('projects.list')
  .describe('List all projects in the workspace')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.projects.findMany({
      where: { tenantId: ctx.tenantId },
    });
  });
```

The handler returns the raw database result — a massive array with internal fields, timestamps, and IDs. The Presenter:

1. **Strips** undeclared fields (egress firewall)
2. **Validates** against the schema (Zod `.parse()`)
3. **Truncates** to 50 items with a warning (cognitive guardrail)
4. **Attaches** system rules, UI blocks, and suggested actions

> [!NOTE]
> The handler's only job is to fetch data. The Presenter does all the heavy lifting — validation, stripping, rules, affordances. This is the [MVA pattern](/mva-pattern) in action.

## Middleware — Context Derivation {#middleware}

Use `.use()` to enrich context before it reaches the handler. The middleware receives `{ ctx, next }` and can add properties, enforce guards, or halt execution:

```typescript
export const adminStats = f.query('admin.stats')
  .describe('Retrieve administrative system statistics')
  .use(async ({ ctx, next }) => {
    const session = await checkAuth(ctx.token);
    if (!session.isAdmin) throw new Error('Unauthorized');
    return next({ ...ctx, session });
  })
  .handle(async (input, ctx) => {
    // ctx.session is fully typed — verified and ready
    return ctx.db.getStats(ctx.session.orgId);
  });
```

The derived `ctx.session` is automatically typed in the handler. Stack multiple `.use()` calls for layered derivations (auth → permissions → tenant resolution).

See the full [Middleware guide](/middleware) for `f.middleware()`, `defineMiddleware()`, and composition patterns.

## State Sync — Cache & Invalidation {#state-sync}

LLMs have no sense of time. After calling `sprints.list` and then `sprints.create`, the agent still believes the list is unchanged. Inline state sync methods on the builder solve this:

```typescript
// Query: reference data that never changes
const listCountries = f.query('countries.list')
  .describe('List all country codes')
  .cached()    // ← immutable, safe to cache forever
  .handle(async (input, ctx) => {
    return ctx.db.countries.findMany();
  });

// Query: volatile data that may change at any time
const listSprints = f.query('sprints.list')
  .describe('List workspace sprints')
  .stale()     // ← no-store, re-fetch before using
  .handle(async (input, ctx) => {
    return ctx.db.sprints.findMany({ where: { tenantId: ctx.tenantId } });
  });

// Mutation: invalidates cached data on success
const createSprint = f.mutation('sprints.create')
  .describe('Create a new sprint')
  .invalidates('sprints.*')  // ← tells the agent to re-read sprints
  .withString('name', 'Sprint name')
  .handle(async (input, ctx) => {
    return ctx.db.sprints.create({ data: { name: input.name } });
  });
```

| Method | Cache Directive | Use When |
|--------|-----------------|----------|
| `.cached()` | `immutable` | Reference data — country codes, timezones, enums |
| `.stale()` | `no-store` | Volatile data — always re-fetch before acting |
| `.invalidates(...patterns)` | Causal signal | Mutations — tell the agent what data changed |

See the full [State Sync guide](/state-sync) for registry-level policies, cross-domain invalidation, and observability.

## Runtime Guards {#runtime-guards}

### Concurrency Limits

Prevent expensive tools from overwhelming your backend:

```typescript
const heavyReport = f.query('analytics.heavy_report')
  .describe('Generate a comprehensive analytics report')
  .concurrency({ max: 2, queueSize: 5 })  // ← max 2 concurrent, 5 queued
  .handle(async (input, ctx) => { /* ... */ });
```

### Egress Guards

Cap the maximum response payload to protect the LLM's context window:

```typescript
const bulkExport = f.query('data.export')
  .describe('Export dataset as JSON')
  .egress(1_000_000)  // ← max 1 MB response
  .handle(async (input, ctx) => { /* ... */ });
```

See the [Runtime Guards guide](/runtime-guards) for the full configuration reference.

## Streaming Progress {#streaming}

Long-running operations report progress via generator handlers. Each `yield progress()` becomes an MCP `notifications/progress` event:

```typescript
import { progress } from '@vinkius-core/mcp-fusion';

export const deploy = f.mutation('infra.deploy')
  .describe('Deploy infrastructure to the target environment')
  .withEnum('env', ['staging', 'production'] as const, 'Target environment')
  .handle(async function* (input, ctx) {
    yield progress(10, 'Cloning repository...');
    await cloneRepo(ctx.repoUrl);

    yield progress(90, 'Running integration tests...');
    const results = await runTests();

    yield progress(100, 'Done!');
    return results;
  });
```

> [!TIP]
> The final `return` value goes through the normal Presenter pipeline. The `yield` calls are side-channel progress notifications — they don't affect the response.

See the [Streaming Progress cookbook](/cookbook/streaming) for real-world examples and cancellation support.

## Registering & Serving {#register}

Once your tools are built, registration is straightforward:

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.registerAll(listTasks, deleteTask, listProjects, createSprint);

const server = new McpServer({ name: 'my-app', version: '1.0.0' });

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    db: getDatabaseClient(),
    tenantId: extra.session?.tenantId ?? 'default',
    userId: extra.session?.userId ?? 'anonymous',
  }),
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

> [!TIP]
> Use `autoDiscover()` for file-based routing — drop tool files in a directory and they're registered automatically. See [Routing & Groups](/routing) for the full guide.
