<p align="center">
  <h1 align="center">@vurb/prisma-gen</h1>
  <p align="center">
    <strong>MCP Tools from Prisma Schema — Vurb.ts</strong> — A framework for creating MCP servers from Prisma databases<br/>
    Prisma Generator → MCP tools with field-level security · Tenant isolation · PII redaction · OOM protection
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/prisma-gen"><img src="https://img.shields.io/npm/v/@vurb/prisma-gen?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Tools from Prisma Schema — Vurb.ts**, the Model Context Protocol framework for building production MCP servers. A compile-time Prisma Generator that reads `schema.prisma` annotations and emits hardened MCP Presenters and ToolBuilders — with field-level security, tenant isolation, and OOM protection baked into the generated code.

## Quick Start

```prisma
generator mcp {
  provider = "vurb-prisma-gen"
  output   = "../src/tools/database"
}

model User {
  id           String @id @default(uuid())
  email        String @unique
  passwordHash String /// @vurb.hide
  stripeToken  String /// @vurb.hide
  creditScore  Int    /// @vurb.describe("Score 0-1000. Above 700 is PREMIUM.")
  tenantId     String /// @vurb.tenantKey
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
| **Egress Firewall** | `@vurb.hide` physically excludes columns from the generated Zod response schema — SOC2 at compile time |
| **Semantic Descriptions** | `@vurb.describe("...")` injects domain semantics into generated Zod fields |
| **Tenant Isolation** | `@vurb.tenantKey` injects tenant filters into every query's WHERE clause |
| **OOM Guard** | Pagination enforced with `take` (capped at 50) and `skip` — unbounded queries are structurally impossible |
| **Inversion of Control** | Generates `ToolBuilder` + `Presenter` files, not a server. You wire them in |

## Schema Annotations

| Annotation | Effect |
|---|---|
| `/// @vurb.hide` | Excludes the field from the generated Zod response schema |
| `/// @vurb.describe("...")` | Adds `.describe()` to the Zod field — LLM reads this as a business rule |
| `/// @vurb.tenantKey` | Injects the field into every query's `WHERE` clause from `ctx` |

## Installation

```bash
npm install @vurb/prisma-gen vurb zod
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |
| `prisma` | `^6.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **Vurb.ts** ≥ 2.0.0 (peer dependency)
- **Prisma** ≥ 6.0.0

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
