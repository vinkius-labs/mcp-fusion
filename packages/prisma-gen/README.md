# mcp-fusion-prisma-gen

A compile-time Prisma Generator that reads `schema.prisma` annotations and emits hardened **MCP Fusion** Presenters and ToolBuilders — with field-level security, tenant isolation, and OOM protection baked into the generated code.

```prisma
generator mcp {
  provider = "vinkius-prisma-gen"
  output   = "../src/tools/database"
}

model User {
  id           String @id @default(uuid())
  email        String @unique
  passwordHash String /// @fusion.hide
  stripeToken  String /// @fusion.hide
  creditScore  Int    /// @fusion.describe("Score 0-1000. Above 700 is PREMIUM.")
  tenantId     String /// @fusion.tenantKey
}
```

```bash
npx prisma generate
# → src/tools/database/userPresenter.ts
# → src/tools/database/userTools.ts
# → src/tools/database/index.ts
```

## The 3 Engineering Primitives

### 1. Egress Firewall — Field-Level Security at Compile Time
`/// @fusion.hide` physically excludes columns from the generated Zod response schema. `/// @fusion.describe("...")` injects domain semantics. The LLM never sees `passwordHash` or `stripeToken` — they are structurally absent from the Presenter.

**The impact:** SOC2 compliance enforced at the generator level. The 2MB Prisma result becomes 5KB of clean, shaped data. PII is stripped in RAM before it crosses the transport boundary.

### 2. OOM Guard & Tenant Isolation — Generated Query Safety
`/// @fusion.tenantKey` injects tenant filters into every generated query's `WHERE` clause. Pagination is enforced with `take` (capped at 50) and `skip` — the LLM is physically unable to request unbounded result sets.

**The impact:** Cross-tenant data leakage is a structural impossibility. OOM protection is built into the Zod schema — not in a post-hoc middleware.

### 3. Inversion of Control — The Developer Owns the Server
The generator produces `ToolBuilder` instances and `Presenter` files. It does **not** start a server. The developer wires the generated code into their server, attaches middleware, and controls the transport.

**The impact:** The generator handles tedious plumbing — Zod schemas, CRUD handlers, tenant filters. But business rules, authentication, and middleware remain **hardcoded in your TypeScript backend**.

## Schema Annotations

| Annotation | Effect |
|---|---|
| `/// @fusion.hide` | Excludes the field from the generated Zod response schema |
| `/// @fusion.describe("...")` | Adds `.describe()` to the Zod field — LLM reads this as a business rule |
| `/// @fusion.tenantKey` | Injects the field into every query's `WHERE` clause from `ctx` |

## Install

```bash
npm install mcp-fusion-prisma-gen @vinkius-core/mcp-fusion zod
```

## Documentation

Full docs with configuration reference and production examples: [vinkius-labs.github.io/mcp-fusion/prisma-gen](https://vinkius-labs.github.io/mcp-fusion/prisma-gen).
