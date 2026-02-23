# Prisma Generator

An official compiler plugin that parasitizes the Prisma generation cycle to emit **MCP Fusion** ToolBuilders and Presenters — with field-level security, tenant isolation, and OOM protection baked into the generated code.

This package is **not a runtime server**. It is a Prisma Generator that reads your `schema.prisma` annotations and produces hardened TypeScript files during `npx prisma generate`. The developer retains 100% control over routing, context, and middleware in `server.ts`.

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

---

## Install

::: code-group
```bash [npm]
npm install mcp-fusion-prisma-gen
```
```bash [pnpm]
pnpm add mcp-fusion-prisma-gen
```
```bash [yarn]
yarn add mcp-fusion-prisma-gen
```
:::

**Peer dependencies:** `@vinkius-core/mcp-fusion`, `zod`, and `@prisma/generator-helper`.

---

## The 3 Engineering Primitives

### 1. The Egress Firewall — Field-Level Security at Compile Time

Prisma models contain columns that must never reach the LLM: password hashes, API tokens, internal tenant flags. If the handler returns a raw Prisma object, every field leaks into the agent's context.

**What it does:** The generator reads `/// @fusion.hide` annotations on your Prisma schema and physically excludes those columns from the generated Zod response schema. The `/// @fusion.describe()` annotation compiles into `.describe()` calls that inject domain semantics into the schema — the LLM reads these descriptions and understands the business rules.

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
    // passwordHash and stripeToken are physically absent from the schema
}).strict();

export const UserPresenter = createPresenter('User')
    .schema(UserResponseSchema)
    .systemRules(['Data originates from the database via Prisma ORM.']);
```

**The impact:** Prisma queries return `passwordHash` and `stripeToken` from the database. The Presenter's Zod `.strict()` strips those fields in RAM before the response reaches the transport layer. The LLM never sees them. The 2MB of raw Prisma output becomes 5KB of clean, shaped data. SOC2 compliance is enforced at the generator level — not in code review.

---

### 2. OOM Guard & Tenant Isolation — Generated Query Safety

LLMs have no concept of database size. Without constraints, a `findMany` call returns 100,000 rows, blows through the context window, and crashes the Node.js process with OOM.

**What it does:** The generator reads `/// @fusion.tenantKey` annotations and injects the tenant filter into every generated query's `WHERE` clause. Pagination is enforced with `take` (capped at 50) and `skip` parameters — the LLM is physically unable to request unbounded result sets.

```prisma
model User {
  tenantId String /// @fusion.tenantKey
}
```

Generated tool:

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
                where['tenantId'] = ctx.tenantId; // ← injected by generator
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
            params: z.object({
                id: z.string(),
            }),
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
            params: z.object({
                id: z.string(),
            }),
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

**The impact:** Every query is tenant-isolated at the generated code level. Cross-tenant data leakage is not a runtime bug to catch — it is a structural impossibility. The `take: z.number().max(50)` cap means the LLM cannot request more than 50 rows per call. OOM protection is built into the schema, not into a post-hoc middleware.

---

### 3. Inversion of Control — The Developer Owns the Server

The generator produces `ToolBuilder` instances and `Presenter` files. It does **not** start a server, bind a port, or touch the transport layer. The developer wires the generated code into their server exactly like any other **MCP Fusion** tool.

**What it does:** The generated files export standard `defineTool()` builders. The developer imports them, attaches middleware (auth, logging, rate limiting), and registers them into the `ToolRegistry` with their own context factory.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ToolRegistry, createServerAttachment } from '@vinkius-core/mcp-fusion';
import { userTools } from './tools/database/userTools.js';
import { prisma } from './lib/prisma.js';

// ── Intercept: add middleware to the generated tool ────
userTools.use(async (ctx, args, next) => {
    if (!ctx.auth?.hasScope('users:read')) {
        throw new Error('Unauthorized');
    }
    return next();
});

// ── Register ───────────────────────────────────────────
const registry = new ToolRegistry();
registry.register(userTools);

// ── Boot ───────────────────────────────────────────────
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

**The impact:** The generator handles the tedious, error-prone plumbing — Zod schemas, CRUD handlers, tenant filters, pagination limits. But the business rules, authentication, middleware chains, and transport selection remain **hardcoded in your TypeScript backend**. The generated code is the starting point, not a black box. You can modify any generated file, add custom actions, or override handlers.

---

## Schema Annotations

| Annotation | Location | Effect |
|---|---|---|
| `/// @fusion.hide` | Field | Excludes the field from the generated Zod response schema |
| `/// @fusion.describe("...")` | Field | Adds `.describe()` to the Zod field — LLM reads this as a business rule |
| `/// @fusion.tenantKey` | Field | Injects the field into every query's `WHERE` clause from `ctx` |

---

## Generator Configuration

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

---

## Generated Output

```
src/tools/database/
├── userPresenter.ts     ← Zod schema + Presenter (fields filtered)
├── userTools.ts         ← CRUD tool with pagination + tenant isolation
├── postPresenter.ts     ← ... per model
├── postTools.ts         ← ... per model
└── index.ts             ← Barrel export
```

Each model produces two files:
- **Presenter** — Zod `.strict()` schema with `@fusion.hide` fields removed and `@fusion.describe()` mapped
- **Tool** — `defineTool()` builder with `find_many`, `find_unique`, `create`, `update`, `delete` actions

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| Prisma | ≥ 5.0 |
| `@vinkius-core/mcp-fusion` | ^2.0.0 (peer) |
| `zod` | ^3.25.1 \|\| ^4.0.0 (peer) |
| `@prisma/generator-helper` | ^6.0.0 (peer) |
