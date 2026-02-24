---
title: "Testing Convention"
description: "The tests/ layer in the MVA convention — folder structure, file naming, and dependency flow."
---

# Convention

The **MVA Convention** organizes code into three architectural layers: **Model**, **View**, **Agent**. The `@vinkius-core/testing` package introduces a fourth layer: **Tests**.

## Structure

```text
src/
├── models/         ← M — Zod schemas
├── views/          ← V — Presenters
├── agents/         ← A — MCP tool definitions
├── index.ts        ← Registry barrel
└── server.ts       ← Server bootstrap
tests/
├── firewall/       ← Egress Firewall assertions
├── guards/         ← Middleware & OOM Guard tests
├── rules/          ← System Rules verification
├── blocks/         ← UI Blocks & truncation tests
└── setup.ts        ← Shared FusionTester instance
```

## Dependency Flow

```text
models/  →  views/  →  agents/  →  index.ts  →  server.ts
                                       ↓
                                    tests/
```

Tests import **only** the registry barrel (`index.ts`). They never import individual handlers, Presenters, or schemas directly. The FusionTester exercises the entire pipeline through `ToolRegistry.routeCall()`.

## File Naming

| Directory | Suffix | What it tests | Example |
|---|---|---|---|
| `tests/firewall/` | `.firewall.test.ts` | Presenter Zod filtering (PII, hidden fields) | `user.firewall.test.ts` |
| `tests/guards/` | `.guard.test.ts` | Middleware RBAC, OOM input limits | `user.guard.test.ts` |
| `tests/rules/` | `.rules.test.ts` | System rules injection, contextual rules | `user.rules.test.ts` |
| `tests/blocks/` | `.blocks.test.ts` | UI blocks, collection summaries, truncation | `analytics.blocks.test.ts` |

## The `setup.ts` File

Every test suite shares a single `FusionTester` instance:

```typescript
// tests/setup.ts
import { createFusionTester } from '@vinkius-core/testing';
import { registry } from '../src/index.js';

export const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_test',
        role: 'ADMIN',
    }),
});
```

Individual test files import `tester` from setup:

```typescript
// tests/firewall/user.firewall.test.ts
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('User Egress Firewall', () => {
    // ...
});
```

## Why Four Directories?

Each directory maps to a specific **governance concern**:

| Directory | Governance Question | SOC2 Control |
|---|---|---|
| `firewall/` | "Can PII leak to the LLM?" | CC6.1 — Logical Access |
| `guards/` | "Can unauthorized users access this?" | CC6.3 — Access Control |
| `rules/` | "Does the LLM receive correct directives?" | CC7.1 — System Operations |
| `blocks/` | "Is the client experience correct?" | CC8.1 — Change Management |

This structure makes it trivial for a security auditor to find the relevant tests.

## Header Annotations

Every test file identifies its layer:

```typescript
// MVA Test: pipeline verification
```

## Adding a New Entity

When you add a new domain entity (e.g., `Order`), create a test file in each directory:

```text
tests/
├── firewall/
│   ├── user.firewall.test.ts
│   └── order.firewall.test.ts   ← new
├── guards/
│   ├── user.guard.test.ts
│   └── order.guard.test.ts      ← new
├── rules/
│   ├── user.rules.test.ts
│   └── order.rules.test.ts      ← new
└── blocks/
    ├── analytics.blocks.test.ts
    └── order.blocks.test.ts      ← new
```

Each file tests one entity across one governance concern. One entity, one file, one concern.
