<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-prisma-gen</h1>
  <p align="center">
    <strong>Prisma Schema → MCP Tools Generator</strong> — Compile-time CRUD generation with field-level security
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-prisma-gen"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-prisma-gen?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> A compile-time Prisma Generator that reads `schema.prisma` annotations and emits hardened MCP Fusion Presenters and ToolBuilders — with field-level security, tenant isolation, and OOM protection baked into the generated code.

## Quick Start

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

## Features

| Feature | Description |
|---------|-------------|
| **Egress Firewall** | `@fusion.hide` physically excludes columns from the generated Zod response schema — SOC2 at compile time |
| **Semantic Descriptions** | `@fusion.describe("...")` injects domain semantics into generated Zod fields |
| **Tenant Isolation** | `@fusion.tenantKey` injects tenant filters into every query's WHERE clause |
| **OOM Guard** | Pagination enforced with `take` (capped at 50) and `skip` — unbounded queries are structurally impossible |
| **Inversion of Control** | Generates `ToolBuilder` + `Presenter` files, not a server. You wire them in |

## Schema Annotations

| Annotation | Effect |
|---|---|
| `/// @fusion.hide` | Excludes the field from the generated Zod response schema |
| `/// @fusion.describe("...")` | Adds `.describe()` to the Zod field — LLM reads this as a business rule |
| `/// @fusion.tenantKey` | Injects the field into every query's `WHERE` clause from `ctx` |

## Installation

```bash
npm install @vinkius-core/mcp-fusion-prisma-gen @vinkius-core/mcp-fusion zod
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |
| `prisma` | `^6.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **MCP Fusion** ≥ 2.0.0 (peer dependency)
- **Prisma** ≥ 6.0.0

## License

[Apache-2.0](https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE)
