# Prisma Generator

- [Install](#install)
- [Field-Level Security](#field-security)
- [OOM Guard & Tenant Isolation](#oom-guard)
- [Wiring into Your Server](#wiring)
- [Schema Annotations](#annotations)
- [Generator Configuration](#configuration)
- [Generated Output](#output)
- [Requirements](#requirements)

A Prisma Generator that reads `schema.prisma` annotations and produces MCP Fusion ToolBuilders and Presenters with field-level security, tenant isolation, and OOM protection baked into the generated code.

```prisma
generator mcp {
  provider = "vinkius-prisma-gen"
  output   = "../src/tools/database"
}

model User {
  id           String @id @default(uuid())
  email        String @unique
  role         String @default("USER")
  passwordHash String /// @fusion.hide
  stripeToken  String /// @fusion.hide
  creditScore  Int    /// @fusion.describe("Financial score from 0 to 1000. Above 700 is PREMIUM.")
  tenantId     String /// @fusion.tenantKey
}
```

```bash
npx prisma generate
# → src/tools/database/userPresenter.ts
# → src/tools/database/userTools.ts
```

## Install {#install}

```bash
npm install mcp-fusion-prisma-gen
```

Peer dependencies: `@vinkius-core/mcp-fusion`, `zod`, and `@prisma/generator-helper`.

## Field-Level Security {#field-security}

`/// @fusion.hide` physically excludes fields from the generated Zod response schema. `/// @fusion.describe()` compiles into `.describe()` calls that inject domain semantics.

```prisma
model User {
  id           String @id @default(uuid())
  email        String @unique
  passwordHash String /// @fusion.hide
  stripeToken  String /// @fusion.hide
  creditScore  Int    /// @fusion.describe("Financial score from 0 to 1000. Above 700 is PREMIUM.")
}
```

Generated Presenter:

```typescript
// src/tools/database/userPresenter.ts (generated)
export const UserResponseSchema = z.object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    creditScore: z.number().int().describe('Financial score from 0 to 1000. Above 700 is PREMIUM.'),
    // passwordHash and stripeToken are physically absent
}).strict();

export const UserPresenter = createPresenter('User')
    .schema(UserResponseSchema)
    .rules(['Data originates from the database via Prisma ORM.']);
```

Prisma queries return `passwordHash` and `stripeToken` from the database. The Presenter's `.strict()` strips them in RAM before serialization.

## OOM Guard & Tenant Isolation {#oom-guard}

`/// @fusion.tenantKey` injects the tenant filter into every generated query's `WHERE` clause. Pagination is enforced with `take` capped at 50.

```typescript
// src/tools/database/userTools.ts (generated)
export const userTools = defineTool<PrismaFusionContext>('db_user', {
    actions: {
        find_many: {
            readOnly: true,
            description: 'List User records with pagination',
            returns: UserPresenter,
            params: z.object({
                email_contains: z.string().optional(),
                take: z.number().int().min(1).max(50).default(20)
                    .describe('Max rows per page (capped at 50)'),
                skip: z.number().int().min(0).default(0)
                    .describe('Offset for pagination'),
            }),
            handler: async (ctx, args) => {
                const where: Record<string, unknown> = {};
                where['tenantId'] = ctx.tenantId;
                if (args.email_contains !== undefined) {
                    where['email'] = { contains: args.email_contains };
                }
                return await ctx.prisma.user.findMany({
                    where,
                    take: args.take,
                    skip: args.skip,
                });
            },
        },
        find_unique: {
            readOnly: true,
            description: 'Get a single record by ID',
            returns: UserPresenter,
            params: z.object({ id: z.string() }),
            handler: async (ctx, args) => {
                return await ctx.prisma.user.findUniqueOrThrow({
                    where: { id: args.id, tenantId: ctx.tenantId },
                });
            },
        },
        create: {
            description: 'Create a new record',
            returns: UserPresenter,
            params: z.object({
                email: z.string(),
                role: z.string().optional(),
                passwordHash: z.string(),
                stripeToken: z.string(),
                creditScore: z.number().int()
                    .describe('Financial score from 0 to 1000. Above 700 is PREMIUM.'),
            }),
            handler: async (ctx, args) => {
                return await ctx.prisma.user.create({
                    data: { ...args, tenantId: ctx.tenantId },
                });
            },
        },
        update: {
            description: 'Update an existing record',
            returns: UserPresenter,
            params: z.object({
                id: z.string(),
                email: z.string().optional(),
                role: z.string().optional(),
                passwordHash: z.string().optional(),
                stripeToken: z.string().optional(),
                creditScore: z.number().int()
                    .describe('Financial score from 0 to 1000. Above 700 is PREMIUM.')
                    .optional(),
            }),
            handler: async (ctx, args) => {
                const { id, ...data } = args;
                return await ctx.prisma.user.update({
                    where: { id, tenantId: ctx.tenantId },
                    data,
                });
            },
        },
        delete: {
            destructive: true,
            description: 'Delete a record by ID',
            params: z.object({ id: z.string() }),
            handler: async (ctx, args) => {
                await ctx.prisma.user.delete({
                    where: { id: args.id, tenantId: ctx.tenantId },
                });
                return { deleted: true };
            },
        },
    },
});
```

Every query is tenant-isolated at the generated code level. Cross-tenant access is structurally impossible.

## Wiring into Your Server {#wiring}

The generator produces `ToolBuilder` instances and `Presenter` files — no server, no transport. You import and wire them:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ToolRegistry, createServerAttachment } from '@vinkius-core/mcp-fusion';
import { userTools } from './tools/database/userTools.js';
import { prisma } from './lib/prisma.js';

userTools.use(async (ctx, args, next) => {
    if (!ctx.auth?.hasScope('users:read')) throw new Error('Unauthorized');
    return next();
});

const registry = new ToolRegistry();
registry.register(userTools);

const server = new McpServer({ name: 'my-api', version: '1.0.0' });
createServerAttachment(server, registry, {
    contextFactory: (req) => ({
        prisma,
        tenantId: extractTenantFromJWT(req),
        auth: extractAuthFromJWT(req),
    }),
});
await server.connect(new StdioServerTransport());
```

## Schema Annotations {#annotations}

| Annotation | Location | Effect |
|---|---|---|
| `/// @fusion.hide` | Field | Excludes from the generated Zod response schema |
| `/// @fusion.describe("...")` | Field | Adds `.describe()` to the Zod field |
| `/// @fusion.tenantKey` | Field | Injects into every query's `WHERE` clause from `ctx` |

## Generator Configuration {#configuration}

```prisma
generator mcp {
  provider = "vinkius-prisma-gen"
  output   = "../src/tools/database"
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `string` | — | Must be `"vinkius-prisma-gen"` |
| `output` | `string` | `"./generated"` | Output directory for generated files |

## Generated Output {#output}

```
src/tools/database/
├── userPresenter.ts     ← Zod schema + Presenter (fields filtered)
├── userTools.ts         ← CRUD tool with pagination + tenant isolation
├── postPresenter.ts
├── postTools.ts
└── index.ts             ← Barrel export
```

Each model produces a Presenter (Zod `.strict()` schema with `@fusion.hide` fields removed) and a Tool (`defineTool()` builder with `find_many`, `find_unique`, `create`, `update`, `delete` actions).

## Requirements {#requirements}

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| Prisma | ≥ 5.0 |
| `@vinkius-core/mcp-fusion` | ^2.0.0 (peer) |
| `zod` | ^3.25.1 \|\| ^4.0.0 (peer) |
| `@prisma/generator-helper` | ^6.0.0 (peer) |
