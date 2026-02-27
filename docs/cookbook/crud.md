# CRUD Tools

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Defining Your Context](#context)
- [Read Operations — Queries](#queries)
- [Write Operations — Actions & Mutations](#writes)
- [Registering & Serving](#register)
- [Semantic Verb Reference](#verbs)

## Introduction {#introduction}

Every SaaS application has entities — projects, invoices, users, tasks. MCP Fusion's Fluent API makes defining CRUD operations for these entities a joy. Instead of writing verbose JSON schemas or tangled Zod objects, you declare your tool's intent with semantic verbs and chainable parameter methods.

> [!TIP]
> Already using Prisma? Skip manual tool definitions — [@vinkius-core/mcp-fusion-prisma-gen](/prisma-gen) auto-generates CRUD tools directly from your `prisma/schema.prisma`. Scaffold a Prisma project with `npx fusion create my-api --vector prisma`.

By the end of this page you'll have a complete, production-ready CRUD module that any developer can read and understand in seconds.

## Defining Your Context {#context}

Before building tools, define the **application context** — the shared state every tool handler receives. This is the foundation of type safety in MCP Fusion: once you declare it, every `.handle()` callback knows exactly what `ctx` contains.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: DatabaseClient;
  tenantId: string;
  userId: string;
}

const f = initFusion<AppContext>();
```

> [!TIP]
> Define `f` in a shared file (e.g. `src/fusion.ts`) and import it across your tool files. The generic parameter flows through every builder — zero annotations needed downstream.

## Read Operations — Queries {#queries}

Use `f.query()` for any operation that **reads data without side effects**. The framework automatically marks these as `readOnly: true`, and the LLM sees a `[READ-ONLY]` tag in the tool description.

### Define the Presenter First

Before building query tools, define a Presenter for the entity. The Presenter handles validation, truncation, and formatting — so your tools stay lean:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

export const ProjectPresenter = createPresenter('Project')
  .schema({
    id:     t.string,
    name:   t.string,
    status: t.enum('active', 'archived'),
  })
  .limit(50);
```

`.limit(50)` means: if the handler returns 2,000 rows, the AI receives 50 with a truncation warning. No manual `limit` parameter needed — the framework handles it.

### Listing Records

```typescript
export const listProjects = f.query('projects.list')
  .describe('List all projects in the current workspace')
  .withOptionalEnum('status', ['active', 'archived', 'all'] as const, 'Filter by project status')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.projects.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(input.status && input.status !== 'all' && { status: input.status }),
      },
    });
  });
```

Notice: no `limit` parameter, no `take: 20` in the query. The Presenter handles truncation at the perception layer. The handler just returns all matching data — clean and simple.

### Fetching a Single Record

```typescript
export const getProject = f.query('projects.get')
  .describe('Get a single project by its unique ID')
  .withString('id', 'The project ID')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    const project = await ctx.db.projects.findUnique({
      where: { id: input.id, tenantId: ctx.tenantId },
    });
    if (!project) throw new Error(`Project "${input.id}" not found`);
    return project;
  });
```

> [!NOTE]
> Handlers just return raw data. The Presenter validates it (stripping undeclared fields), attaches rules, and wraps it into a proper MCP response automatically.

## Write Operations — Actions & Mutations {#writes}

MCP Fusion distinguishes between **actions** (creates, updates — reversible) and **mutations** (deletes — destructive and irreversible). The LLM sees `[DESTRUCTIVE]` tags on mutations, triggering confirmation workflows in MCP clients.

### Creating a Record

```typescript
export const createProject = f.action('projects.create')
  .describe('Create a new project in the workspace')
  .withString('name', 'Project name (1-200 characters)')
  .withOptionalString('description', 'Optional project description')
  .handle(async (input, ctx) => {
    return ctx.db.projects.create({
      data: {
        name: input.name,
        description: input.description ?? '',
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        status: 'active',
      },
    });
  });
```

`f.action()` is the default semantic verb — no special annotations. Use it for any operation that **changes state but isn't destructive**.

### Updating a Record

```typescript
export const updateProject = f.action('projects.update')
  .describe('Update a project\'s details')
  .withString('id', 'The project ID')
  .withOptionalString('name', 'New project name')
  .withOptionalString('description', 'New description')
  .withOptionalEnum('status', ['active', 'archived'] as const, 'New project status')
  .handle(async (input, ctx) => {
    const { id, ...data } = input;
    // Only update fields that were actually provided
    const updates = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    return ctx.db.projects.update({
      where: { id, tenantId: ctx.tenantId },
      data: updates,
    });
  });
```

### Deleting a Record

```typescript
export const deleteProject = f.mutation('projects.delete')
  .describe('Permanently delete a project and all its data')
  .withString('id', 'The project ID to delete')
  .handle(async (input, ctx) => {
    await ctx.db.projects.delete({
      where: { id: input.id, tenantId: ctx.tenantId },
    });
    return { deleted: true, id: input.id };
  });
```

You don't need to tell the AI to "confirm before deleting" — the framework handles this for you. `f.mutation()` automatically sets `destructiveHint: true` in the MCP tool annotations. MCP clients like Claude Desktop read this annotation and show a confirmation dialog before executing. Zero boilerplate, zero prompt engineering.

## Registering & Serving {#register}

Once your tools are built, registration is a single line:

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Register all tools
const registry = new ToolRegistry();
registry.registerAll(listProjects, getProject, createProject, updateProject, deleteProject);

// Create and connect the MCP server
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

The same registry deploys to serverless with zero tool code changes:

### Vercel — CRUD API as a Route Handler

```typescript
import { vercelAdapter } from '@vinkius-core/mcp-fusion-vercel';
export const POST = vercelAdapter({ registry, contextFactory });
```

### Cloudflare Workers — CRUD at the Edge

```typescript
import { cloudflareWorkersAdapter } from '@vinkius-core/mcp-fusion-cloudflare';
export default cloudflareWorkersAdapter({ registry, contextFactory });
```

Full guides: [Vercel Adapter](/vercel-adapter) · [Cloudflare Adapter](/cloudflare-adapter)

## Semantic Verb Reference {#verbs}

| Verb | MCP Annotations | When to Use |
|---|---|---|
| `f.query()` | `readOnly: true`, `destructive: false` | Fetching data — lists, searches, lookups |
| `f.action()` | default | Creating or updating data — reversible side effects |
| `f.mutation()` | `destructive: true` | Deleting, purging, revoking — irreversible changes |

The LLM sees these annotations in the tool's metadata. `f.query()` tools get `[READ-ONLY]` in their description. `f.mutation()` tools get `[DESTRUCTIVE]`. This dramatically reduces hallucinated write calls by giving the model clear semantic signals about each tool's behavior.