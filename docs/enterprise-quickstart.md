# Enterprise Quickstart

A production-grade MCP server with JWT authentication, tenant isolation, field-level data protection, audit logging, and cognitive affordances. About 15 minutes of work.

By the end, unauthenticated requests are rejected before any handler runs. A `viewer`-role agent receives user records _without_ email addresses. An `admin`-role agent sees everything — same tool, same handler, different perception.

If you don't need authentication yet, start with the [basic Quickstart](/quickstart). Every layer below is additive.

## The Pipeline

Every tool call executes this pipeline in order:

```
contextFactory → authMiddleware → handler → Presenter → agent
```

Each stage has one job. If any stage throws, everything after it is skipped — the handler cannot run if middleware rejects the request.

## Step 1 — Project Setup {#step-1-project-setup}

```bash
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

MCP Fusion uses top-level `await`, so your project must target ESM. Ensure `package.json` has `"type": "module"` and `tsconfig.json` targets `ES2022` with `NodeNext` module resolution.

```bash
mkdir -p src/middleware src/presenters src/tools
```

## Step 2 — Define Your Context Type {#step-2-context-type}

```typescript
// src/fusion.ts
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: 'admin' | 'viewer'; tenantId: string };
}

export const f = initFusion<AppContext>();
```

The `f` object provides typed factory methods — `f.tool()`, `f.presenter()`, `f.middleware()`, `f.registry()` — that all inherit `AppContext`. TypeScript knows `ctx.user.tenantId` is a `string` in every handler.

## Step 3 — Authentication Middleware {#step-3-auth-middleware}

Middleware follows tRPC's context derivation pattern. Your function receives the current `ctx`, returns an object, and that object is merged via `Object.assign`. TypeScript infers the resulting type.

If any middleware throws, the handler never executes — runtime guarantee, not convention.

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

For multiple sequential stages — authentication, then rate limiting, then feature flags — use an array: `middleware: [authMiddleware, rateLimiter, featureFlags]`.

## Step 4 — The Presenter {#step-4-presenter}

Instead of excluding what shouldn't be in the response, declare what _should_. The Zod schema is an allowlist — anything not declared is stripped by `parse()`:

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
  rules: (user, ctx) => [
    'Dates are in ISO 8601 format.',
    (ctx as any).user?.role !== 'admin'
      ? 'Email addresses are included for display only.'
      : null,
  ],
  suggest: (user) => [
    suggest('users.get', 'View user', { id: user.id }),
    suggest('users.update', 'Update user', { id: user.id }),
  ],
  limit: 50,
});
```

The database row has 10+ fields. The agent sees 5. When a developer adds a new column, it doesn't leak unless explicitly added to the schema.

`suggest` gives the agent concrete next-steps instead of hallucinating tool names. `limit` truncates large collections and teaches the agent to use filters.

## Step 5 — Tools {#step-5-tools}

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

The handler has one job — query the database with tenant scope. Authentication is middleware. Column filtering is the Presenter. Collection capping is `limit`. Each concern is independently testable.

### Write Tool with Error Recovery

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

`tags: ['admin']` makes this tool invisible when the registry is filtered with `exclude: ['admin']`. The agent doesn't waste tokens discovering tools it can't use.

`toolError()` gives the agent a structured error code, recovery suggestion, and available fallback actions — no blind retries.

## Step 6 — Server with Observability {#step-6-server}

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

`contextFactory` extracts the token from the MCP request. If it throws, nothing else runs. `createDebugObserver` emits typed `DebugEvent` objects for each pipeline stage — `route`, `validate`, `middleware`, `execute`, `error`, `governance`. `autoDiscover` scans `./src/tools` and registers every exported tool definition automatically.

```bash
npx tsc && node dist/server.js
```
