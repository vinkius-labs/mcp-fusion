# Functional Groups

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Shared Tags & Middleware](#shared)
- [Auto-Discovery](#discovery)
- [File Organization](#organization)

## Introduction {#introduction}

When your domain has many entities that share the same middleware (auth, logging) or tags, defining `.use(withAuth)` on every single tool becomes repetitive. **Functional groups** let you define shared middleware, tags, and configuration once, then register all tools inside the group.

## Shared Tags & Middleware {#shared}

Use `f.group()` to create a functional group that applies shared configuration to all tools registered inside it:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

// Auth middleware
const withAuth = f.middleware(async (ctx) => {
  const user = await verifyJwt(ctx.token);
  if (!user) throw new Error('Authentication required');
  return { user };
});

// Create a group with shared middleware and tags
const authenticated = f.group()
  .use(withAuth)
  .tags('authenticated', 'v1');

// All tools in the group inherit the middleware and tags
export const listProjects = authenticated.query('projects.list')
  .describe('List all projects')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.projects.findMany({ where: { orgId: ctx.user.orgId } });
  });

export const getProject = authenticated.query('projects.get')
  .describe('Get a project by ID')
  .withString('id', 'Project ID')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.projects.findUnique({ where: { id: input.id } });
  });

export const deleteProject = authenticated.mutation('projects.delete')
  .describe('Delete a project')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => {
    await ctx.db.projects.delete({ where: { id: input.id } });
    return { deleted: input.id };
  });
```

Every tool created from `authenticated` automatically has `withAuth` middleware and the `authenticated`/`v1` tags — no repetition.

## Auto-Discovery {#discovery}

`autoDiscover()` scans a directory for exported tool builders and registers them automatically:

```typescript
import { autoDiscover, ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry();
const tools = await autoDiscover('./src/tools');

registry.registerAll(...tools);
```

The discovery scans all `.ts` / `.js` files in the directory recursively and collects every exported `FluentToolBuilder` instance. No manual imports needed — add a new tool file to the directory and it's automatically registered.

> [!TIP]
> `autoDiscover()` only picks up tool builders (created by `f.query()`, `f.mutation()`, etc.). It does not discover prompts, middleware, or raw functions.

## File Organization {#organization}

Recommended project structure with groups:

```text
src/
├── fusion.ts              ← shared f = initFusion<AppContext>()
├── middleware/
│   ├── auth.ts            ← withAuth middleware
│   └── tenant.ts          ← withTenant middleware
├── groups/
│   ├── authenticated.ts   ← f.group().use(withAuth)
│   └── admin.ts           ← f.group().use(withAuth).use(requireAdmin)
├── tools/
│   ├── projects.ts        ← authenticated.query / authenticated.mutation
│   ├── invoices.ts        ← authenticated.query / authenticated.mutation
│   └── admin/
│       └── users.ts       ← admin.mutation
├── presenters/
│   ├── ProjectPresenter.ts
│   └── InvoicePresenter.ts
└── index.ts               ← autoDiscover('./src/tools')
```

Each file exports its tools. `autoDiscover()` finds them all. Groups ensure middleware consistency without copy-paste.