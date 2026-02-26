# Enterprise Quickstart

## Introduction

This guide builds a production-grade MCP server from scratch. Not a calculator — a **User Management** server with JWT authentication, tenant isolation, field-level data protection, structured audit logging, and cognitive affordances for the agent. Roughly 15 minutes of work.

By the end, an unauthenticated request is rejected before any handler code runs. A `viewer`-role agent receives user records _without_ email addresses or internal fields. An `admin`-role agent sees everything — same tool, same handler, different perception. Every tool call emits a typed event for audit trails. And an agent that fails a destructive operation receives explicit recovery suggestions instead of guessing.

If you don't need authentication yet, start with the [basic Quickstart](/quickstart). You can add every layer in this guide later — MCP Fusion's architecture makes them additive, not invasive.

::: tip
Every code example uses verified MCP Fusion APIs. You can copy any block and it will compile. To follow along interactively, create a new directory and start at [Step 1](#step-1-project-setup).
:::

---

## The Architecture You're Building

Before writing code, understand the pipeline your server executes on every tool call. This is the literal runtime execution order — not an abstraction:

```text
contextFactory → authMiddleware → handler → Presenter → agent
```

Each stage has one job. `contextFactory` extracts identity material from the MCP request. Middleware resolves and validates that identity. The handler queries the database. The Presenter shapes what the agent perceives. If any stage throws, everything after it is skipped — the handler cannot run if middleware rejects the request.

This separation matters because in a raw MCP server, all five concerns live inside a single handler function. MCP Fusion decomposes them into discrete pipeline stages, each independently testable and replaceable.

::: info
This pipeline is the runtime expression of the [MVA (Model-View-Agent) pattern](/mva-pattern). The handler is the Model (raw data). The Presenter is the View (perception shaping). Middleware controls the Agent's access context.
:::

---

## Step 1 — Project Setup {#step-1-project-setup}

MCP Fusion requires three packages: the core framework, the official MCP SDK (transport layer), and Zod (schema validation).

::: code-group
```bash [npm]
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```
```bash [pnpm]
pnpm add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
pnpm add -D typescript @types/node
```
:::

MCP Fusion uses top-level `await` in its `autoDiscover` function, so your project must target ESM. Your `tsconfig.json` needs at minimum:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  }
}
```

::: warning
Without ESM module resolution, `autoDiscover` imports will fail at runtime with `ERR_REQUIRE_ESM`. Make sure your `package.json` includes `"type": "module"`.
:::

Create the project structure:

```bash
mkdir -p src/middleware src/presenters src/tools
```

---

## Step 2 — Define Your Context Type {#step-2-context-type}

Every MCP Fusion project starts with `initFusion<T>()`. The generic parameter defines your **application context** — the shape of everything a handler might need. Define it once; every tool, middleware, and Presenter inherits it automatically.

```typescript
// src/fusion.ts
interface AppContext {
  db: PrismaClient;
  user: { id: string; role: 'admin' | 'viewer'; tenantId: string };
}

export const f = initFusion<AppContext>();
```

The `f` object provides typed factory methods — `f.tool()`, `f.presenter()`, `f.middleware()`, `f.registry()` — that all know about `AppContext`. When you write a handler, TypeScript knows that `ctx.user.tenantId` exists and is a `string`. If a property is missing, the compiler catches it before runtime.

This is the key difference from a raw MCP server, where every handler independently parses auth headers and instantiates database clients with no compile-time guarantee of consistency.

::: tip
Many teams start with `initFusion<{}>()` during prototyping and add context properties as they build out middleware. The context type is a design choice, not a framework requirement. See the [basic Quickstart](/quickstart) for a zero-context example.
:::

---

## Step 3 — Authentication Middleware {#step-3-auth-middleware}

MCP Fusion's middleware follows tRPC's context derivation pattern. Your function receives the current `ctx`, returns an object, and that object is merged via `Object.assign`. TypeScript infers the resulting type — no manual generics.

### The Pipeline Guarantee

The framework runs stages in strict sequence. If any stage throws, everything after it is skipped — "skipped" means the function is _never called_, not that the error is silently caught. If `authMiddleware` throws because the JWT is expired, the handler doesn't execute. This is a runtime guarantee, not a convention.

### Writing the Middleware

The middleware extracts the raw token from context (set by `contextFactory` in [Step 6](#step-6-server)), verifies the JWT, and resolves the user from the database:

```typescript
// src/middleware/auth.ts
export const authMiddleware = f.middleware(async (ctx) => {
  const token = (ctx as any).rawToken;
  if (!token) throw new Error('Missing authentication token');

  const payload = await verifyJWT(token);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
  });

  return { db: prisma, user: { id: user.id, role: user.role, tenantId: user.tenantId } };
});
```

The returned object is merged into `ctx`. After this middleware runs, every downstream stage receives `ctx.db`, `ctx.user.id`, `ctx.user.role`, and `ctx.user.tenantId` — all with full type inference.

### What Happens When Auth Fails

If `verifyJWT()` throws (expired token, invalid signature), the pipeline short-circuits. The handler never runs. The [debug observer](#step-6-server) emits an `error` event with `step: 'middleware'`, so your audit trail captures rejected requests — something invisible in raw MCP servers.

::: tip
For multiple sequential stages — authentication, then rate limiting, then feature flags — use an array: `middleware: [authMiddleware, rateLimiter, featureFlags]`. Each stage receives the accumulated context from all previous stages. See [Security & Authentication](/enterprise/security) for the full composition model.
:::

---

## Step 4 — The Presenter {#step-4-presenter}

This is where MCP Fusion diverges from every other MCP framework.

### The Problem

In a raw MCP server, the handler decides what to return. If it queries `SELECT * FROM users`, the agent sees every column — `password_hash`, `ssn`, `internal_notes`, `billing_rate`. The developer must manually exclude sensitive fields in every handler. One forgotten destructuring, one new column added to the table, and sensitive data reaches the agent.

### The Inversion

The Presenter inverts this. Instead of excluding what shouldn't be there, you declare what _should_. The Zod schema is an allowlist — anything not declared is stripped by `parse()`:

```typescript
// src/presenters/user.presenter.ts
export const UserPresenter = f.presenter({
  name: 'User',
  schema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().describe('User email address'),
    role: z.string(),
    createdAt: z.string(),
  }),
```

The database row has 10+ fields. The agent sees 5. The other fields — `password_hash`, `ssn`, `internal_notes`, `billing_rate` — never reach the wire. When a developer adds a new column to the database, it doesn't leak to the agent unless explicitly added to the schema. The default is _invisible_, not visible.

### Domain Rules

Rules are contextual instructions that travel _with_ the data. When a tool returns `{ amount_cents: 5000 }`, the agent needs to know that value is in cents. With raw MCP, you hope the agent infers this — or you write it in a system prompt that may have scrolled out of the context window. Presenter rules are attached to every response:

```typescript
  rules: (user, ctx) => [
    'Dates are in ISO 8601 format.',
    (ctx as any).user?.role !== 'admin'
      ? 'Email addresses are included for display only.'
      : null,
  ],
```

The `viewer` role receives a guidance note about email usage. The `admin` role does not. Same tool, same Presenter — different instructions based on the caller.

### Action Affordances

Without affordances, the agent guesses which tool to call next — it might hallucinate `user.edit`, `modify_user`, or `update_user_42`. With `suggestActions`, the Presenter declares the valid next actions based on the data state:

```typescript
  suggestActions: (user) => [
    { tool: 'users.get', args: { id: user.id } },
    { tool: 'users.update', args: { id: user.id } },
  ],
```

The agent doesn't guess — it receives concrete `{ tool, args }` suggestions. This is the [HATEOAS principle](https://en.wikipedia.org/wiki/HATEOAS) applied to agent interactions.

### Cognitive Guardrail

If a query returns 10,000 rows, sending all of them is counterproductive — large context windows degrade accuracy. `agentLimit` truncates the collection and injects guidance:

```typescript
  agentLimit: {
    max: 50,
    onTruncate: (omitted) => ({
      type: 'text' as const,
      text: `${omitted} users omitted. Use "search" to narrow results.`,
    }),
  },
});
```

The agent learns to use filters instead of requesting unbounded data.

::: info
For more Presenter capabilities — `ui` (ECharts/Mermaid visualizations), `embeds` (nested composition), and `autoRules` (rules from Zod `.describe()`) — see the [Presenter guide](/presenter).
:::

---

## Step 5 — Tools {#step-5-tools}

Tools are where domain logic lives. A tool declares its input schema, middleware stack, and optionally a Presenter. The handler itself is a pure function: it receives validated input and enriched context, and returns raw data.

### A Read Tool

```typescript
// src/tools/users.ts
export const listUsers = f.tool({
  name: 'users.list',
  description: 'List users in the current tenant',
  input: z.object({
    limit: z.number().optional().default(20),
    search: z.string().optional(),
  }),
  middleware: [authMiddleware],
  returns: UserPresenter,
  handler: async ({ input, ctx }) => {
    return ctx.db.user.findMany({
      where: { tenantId: ctx.user.tenantId, ...(input.search ? { name: { contains: input.search } } : {}) },
      take: input.limit,
    });
  },
});
```

Notice what the handler _doesn't_ do: it doesn't check authentication (middleware does that), it doesn't filter columns (Presenter does that), and it doesn't cap the result set (`agentLimit` does that). The handler has one job — query the database with the tenant scope. Everything else is handled by the pipeline.

The `returns: UserPresenter` declaration routes the handler's return through the Presenter. If you omit `returns`, the handler's value is sent as-is in an MCP text content block.

### A Write Tool with Error Recovery

```typescript
export const deleteUser = f.tool({
  name: 'users.delete',
  description: 'Permanently delete a user account',
  input: z.object({ id: z.string() }),
  tags: ['admin'],
  middleware: [authMiddleware],
  handler: async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin') {
      return toolError('FORBIDDEN', {
        message: 'Only admin users can delete accounts',
        suggestion: 'Contact an administrator',
        availableActions: ['users.list', 'users.get'],
      });
    }
    await ctx.db.user.delete({ where: { id: input.id, tenantId: ctx.user.tenantId } });
    return { deleted: true, id: input.id };
  },
});
```

Two concepts work together here:

**Tags.** `tags: ['admin']` is metadata. When you call `attachToServer()` with `filter: { exclude: ['admin'] }`, this tool becomes invisible — it doesn't appear in `tools/list` and can't be called. The agent doesn't waste tokens discovering tools it can't use. See [Security & Authentication](/enterprise/security#tag-filtering) for the full filtering model.

**`toolError()`.** When authorization fails, the agent receives a structured response with an error code, a human-readable message, a recovery suggestion, and available fallback actions. The error _teaches_ the agent how to recover instead of leaving it to retry blindly. See [Error Handling](/error-handling) for the full API.

---

## Step 6 — Server with Observability {#step-6-server}

`attachToServer()` connects your registry to the MCP SDK server. Two options are critical for production: `contextFactory` and `debug`.

### contextFactory

This is the entry point for every request. It receives the MCP SDK's `extra` object and returns the seed context that middleware will transform:

```typescript
contextFactory: (extra: any) => ({
  rawToken: extra?._meta?.token ?? process.env.DEFAULT_TOKEN,
}),
```

If `contextFactory` throws, nothing else runs — no middleware, no handler. This is the first circuit breaker. The auth middleware in [Step 3](#step-3-auth-middleware) consumes `rawToken` and resolves it into a user identity.

::: warning
The location of auth tokens in MCP requests is not standardized. `extra._meta.token` is a common convention but not universal. Check your client's documentation. The `process.env.DEFAULT_TOKEN` fallback is for development only.
:::

### createDebugObserver

Every pipeline stage emits a typed `DebugEvent`. The event type is a discriminated union — `route`, `validate`, `middleware`, `execute`, `error`, and `governance` — where each type determines the available fields:

```typescript
debug: createDebugObserver((event) => {
  if (event.type === 'execute') {
    console.log(JSON.stringify({
      timestamp: event.timestamp, tool: event.tool,
      durationMs: event.durationMs, isError: event.isError,
    }));
  }
  if (event.type === 'error') {
    console.error(`[${event.step}] ${event.tool}: ${event.error}`);
  }
}),
```

Without a handler argument, `createDebugObserver()` prints to `console.debug`. With a handler, you control exactly which events to capture. This is the foundation for audit trails — see [Observability & Audit](/enterprise/observability) for SIEM integration and SOC 2 alignment.

### autoDiscover

Instead of manually importing and registering every tool, `autoDiscover` scans a directory and registers all exported tool definitions:

```typescript
const registry = f.registry();
await autoDiscover(registry, './src/tools');
```

Add a new file to `src/tools/`, export a tool from it, and it's automatically registered. During development, `createDevServer()` provides hot-reload — see the [DX Guide](/dx-guide).

### The Complete Server

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { attachToServer, autoDiscover, createDebugObserver } from '@vinkius-core/mcp-fusion';
import { f } from './fusion';

const registry = f.registry();
await autoDiscover(registry, './src/tools');

const server = new McpServer({ name: 'user-management', version: '1.0.0' });

attachToServer(server, registry, {
  contextFactory: (extra: any) => ({
    rawToken: extra?._meta?.token ?? process.env.DEFAULT_TOKEN,
  }),
  debug: createDebugObserver((event) => {
    if (event.type === 'execute') {
      console.log(JSON.stringify({ tool: event.tool, durationMs: event.durationMs }));
    }
  }),
});

await server.connect(new StdioServerTransport());
```

Compile and run:

```bash
npx tsc && node dist/server.js
```

---

## What You Built

| Layer | What It Does | What It Prevents |
|---|---|---|
| `contextFactory` | Extracts raw token from MCP metadata | Handlers accessing unvalidated data |
| `authMiddleware` | Resolves JWT → identity → tenant | Unauthenticated access to any handler |
| Presenter schema | Strips undeclared columns | `password_hash`, `ssn` reaching the agent |
| Presenter rules | Sends domain context with data | Agent misinterpreting formats |
| `suggestActions` | Explicit next-action hints | Agent hallucinating tool names |
| `agentLimit` | Caps response at 50 items | Context window overflow |
| `toolError()` | Structured recovery suggestions | Blind retries after failures |
| `createDebugObserver` | Typed events per stage | Audit trail blind spots |
| `tags: ['admin']` | Registry-level filtering | Non-admin agents seeing destructive ops |
| `ctx.user.tenantId` | Scopes all queries | Cross-tenant data leakage |

---

## Next Steps

- **[Security & Authentication](/enterprise/security)** — the full four-layer defense model, three middleware APIs, tag-based filtering patterns
- **[Observability & Audit](/enterprise/observability)** — all six `DebugEvent` types, OpenTelemetry tracing, SIEM forwarding, SOC 2 alignment
- **[Multi-Tenancy](/enterprise/multi-tenancy)** — tenant resolution, per-plan capability filtering, perception isolation
- **[Capability Governance](/governance/)** — `mcp-fusion.lock`, contract diffing, zero-trust attestation
- **[Presenter Guide](/presenter)** — UI blocks, embeds, autoRules, composition
- **[Testing](/testing)** — assertion helpers, middleware mocking, Presenter snapshots
