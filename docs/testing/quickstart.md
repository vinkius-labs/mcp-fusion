---
title: "Testing Quick Start"
description: "Build your first FusionTester in 5 minutes — zero servers, zero tokens, full pipeline fidelity."
---

# Quick Start

Get your first deterministic AI governance test running in 5 minutes.

## Prerequisites

- An existing **MCP Fusion** application with a `ToolRegistry` and at least one Tool
- A test runner installed (Vitest recommended, but Jest/Mocha/`node:test` all work)

## Step 1: Install

```bash
npm install @vinkius-core/testing
```

No additional configuration needed. Zero runtime dependencies.

## Step 2: Create the Test Setup

Create a `tests/setup.ts` file with your shared `FusionTester` instance:

```typescript
// tests/setup.ts
import { createFusionTester } from '@vinkius-core/testing';
import { registry } from '../src/index.js';

/**
 * Shared FusionTester instance.
 * 
 * The contextFactory produces the mock context for every test call.
 * Inject your fake database, auth tokens, tenant IDs here.
 */
export const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: {
            user: {
                findMany: async ({ take }: { take: number }) => [
                    { id: '1', name: 'Alice', email: 'alice@acme.com', passwordHash: 'bcrypt$abc', tenantId: 't_42' },
                    { id: '2', name: 'Bob', email: 'bob@acme.com', passwordHash: 'bcrypt$xyz', tenantId: 't_42' },
                    { id: '3', name: 'Charlie', email: 'charlie@acme.com', passwordHash: 'bcrypt$123', tenantId: 't_42' },
                ].slice(0, take),
                create: async (data: { email: string; name: string }) => ({
                    id: '99',
                    name: data.name,
                    email: data.email,
                    passwordHash: 'bcrypt$new',
                    tenantId: 't_42',
                }),
            },
        },
        tenantId: 't_42',
        role: 'ADMIN',
    }),
});
```

::: tip Async Context
`contextFactory` supports `async` — useful for resolving test tokens from a database or environment:

```typescript
contextFactory: async () => {
    const token = await fetchTestToken();
    return { prisma: mockPrisma, tenantId: token.tenantId, role: token.role };
},
```
:::

## Step 3: Write Your First Test

```typescript
// tests/firewall/user.firewall.test.ts
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('User Egress Firewall', () => {
    it('strips passwordHash from response', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });

        expect(result.isError).toBe(false);

        for (const user of result.data as any[]) {
            expect(user).not.toHaveProperty('passwordHash');
            expect(user).not.toHaveProperty('tenantId');
        }
    });

    it('preserves declared fields accurately', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });
        const user = (result.data as any[])[0];

        expect(user).toEqual({
            id: '1',
            name: 'Alice',
            email: 'alice@acme.com',
        });
    });

    it('strips PII from create response too', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'new@test.com',
            name: 'New User',
        });

        const user = result.data as Record<string, unknown>;
        expect(user).not.toHaveProperty('passwordHash');
        expect(user.name).toBe('New User');
    });
});
```

## Step 4: Run

```bash
npx vitest run tests/
```

```
 ✓ tests/firewall/user.firewall.test.ts (3 tests) 5ms
   ✓ User Egress Firewall > strips passwordHash from response 2ms
   ✓ User Egress Firewall > preserves declared fields accurately 1ms
   ✓ User Egress Firewall > strips PII from create response too 1ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  450ms
```

**5ms. Zero tokens. Zero servers. Deterministic proof that PII never reaches the LLM.**

::: tip Fun Fact
If your Tool returns perfectly clean XML in the tests, the blame for hallucinating in production shifts to your LLM Provider — not your company's backend.
:::

---

## Running Tests — Command Reference

### Run All Tests

```bash
# Run all tests once
npx vitest run

# Run all tests with verbose output
npx vitest run --reporter=verbose
```

### Run by Directory

```bash
# Run only Egress Firewall tests
npx vitest run tests/firewall/

# Run only Middleware Guard tests
npx vitest run tests/guards/

# Run only System Rules tests
npx vitest run tests/rules/

# Run only UI Blocks tests
npx vitest run tests/blocks/
```

### Run by File

```bash
# Run tests for a specific entity
npx vitest run tests/firewall/user.firewall.test.ts

# Run tests for orders
npx vitest run tests/guards/order.guard.test.ts
```

### Filter by Test Name

```bash
# Run only tests whose name contains "passwordHash"
npx vitest run -t "passwordHash"

# Run only tests related to GUEST role
npx vitest run -t "GUEST"

# Run only tests for OOM Guard
npx vitest run -t "OOM"

# Run only truncation-related tests
npx vitest run -t "truncat"
```

### Watch Mode (Development)

```bash
# Re-run tests automatically when source files change
npx vitest watch

# Watch only firewall tests
npx vitest watch tests/firewall/

# Watch with a name filter
npx vitest watch -t "passwordHash"
```

### Coverage

```bash
# Run with coverage report
npx vitest run --coverage

# Coverage for specific directory
npx vitest run --coverage tests/firewall/
```

Example coverage output:

```
 % CI Coverage Report
 ------------------------------|---------|----------|---------|---------|
 File                          | % Stmts | % Branch | % Funcs | % Lines |
 ------------------------------|---------|----------|---------|---------|
 src/views/user.presenter.ts   |   100   |   100    |   100   |   100   |
 src/agents/user.tool.ts       |    95   |    90    |   100   |    95   |
 src/models/user.schema.ts     |   100   |   100    |   100   |   100   |
 ------------------------------|---------|----------|---------|---------|
```

### CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: MVA Governance Audit

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npx vitest run --reporter=verbose
```

::: info Zero Tokens in CI/CD
The FusionTester runs entirely in RAM. Your CI/CD pipeline **never** calls an LLM API. No `OPENAI_API_KEY` required. No `ANTHROPIC_API_KEY` required. No rate limits. No flaky tests from API outages.
:::

### Combining Filters

```bash
# Run only user firewall tests whose name contains "strip"
npx vitest run tests/firewall/user.firewall.test.ts -t "strip"

# Run all guard tests whose name contains "ADMIN"
npx vitest run tests/guards/ -t "ADMIN"

# Run firewall + rules tests together
npx vitest run tests/firewall/ tests/rules/
```

---

## Step 5: Add More Audits

Expand your test suite across all governance concerns:

### Middleware Guards

```typescript
// tests/guards/user.guard.test.ts
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('User Middleware Guards', () => {
    it('blocks GUEST from listing users', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'GUEST' },
        );

        expect(result.isError).toBe(true);
        expect(result.data).toContain('Unauthorized');
    });

    it('blocks GUEST from creating users', async () => {
        const result = await tester.callAction(
            'db_user', 'create', { email: 'hack@evil.com', name: 'Hacker' },
            { role: 'GUEST' },
        );

        expect(result.isError).toBe(true);
    });

    it('allows ADMIN to create users', async () => {
        const result = await tester.callAction(
            'db_user', 'create', { email: 'new@acme.com', name: 'New' },
            { role: 'ADMIN' },
        );

        expect(result.isError).toBe(false);
    });
});
```

### System Rules

```typescript
// tests/rules/user.rules.test.ts
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('User System Rules', () => {
    it('injects PII governance rule', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.systemRules).toContain(
            'Email addresses are PII. Mask when possible.'
        );
    });

    it('injects data provenance rule', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.systemRules).toContain(
            'All data is from Prisma ORM. Do not infer data outside this response.'
        );
    });

    it('returns empty rules for raw tools', async () => {
        const result = await tester.callAction('health', 'check');
        expect(result.systemRules).toEqual([]);
    });
});
```

### OOM Guard

```typescript
// tests/guards/user.oom.test.ts
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('User OOM Guard', () => {
    it('rejects take > 50', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10000 });
        expect(result.isError).toBe(true);
    });

    it('rejects take = 0', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 0 });
        expect(result.isError).toBe(true);
    });

    it('rejects non-integer take', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 3.14 });
        expect(result.isError).toBe(true);
    });

    it('rejects invalid email on create', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'not-an-email',
            name: 'Test',
        });
        expect(result.isError).toBe(true);
    });

    it('accepts valid boundary inputs', async () => {
        const r1 = await tester.callAction('db_user', 'find_many', { take: 1 });
        const r50 = await tester.callAction('db_user', 'find_many', { take: 50 });

        expect(r1.isError).toBe(false);
        expect(r50.isError).toBe(false);
    });
});
```

### Error Handling

```typescript
// tests/guards/error.test.ts
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('Error Handling', () => {
    it('returns isError for unknown tools', async () => {
        const result = await tester.callAction('ghost_tool', 'list');
        expect(result.isError).toBe(true);
    });

    it('returns isError for unknown actions', async () => {
        const result = await tester.callAction('db_user', 'ghost_action');
        expect(result.isError).toBe(true);
    });

    it('returns empty MVA layers on error', async () => {
        const result = await tester.callAction('ghost_tool', 'list');

        expect(result.systemRules).toEqual([]);
        expect(result.uiBlocks).toEqual([]);
    });
});
```

---

## API Reference

### `createFusionTester(registry, options)`

| Parameter | Type | Description |
|---|---|---|
| `registry` | `ToolRegistry<TContext>` | Your application's tool registry |
| `options.contextFactory` | `() => TContext \| Promise<TContext>` | Factory that produces mock context for each call |

### `tester.callAction(toolName, actionName, args?, overrideContext?)`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `toolName` | `string` | ✅ | Registered tool name (e.g. `'db_user'`) |
| `actionName` | `string` | ✅ | Action discriminator (e.g. `'find_many'`) |
| `args` | `object` | ❌ | Action arguments (without the `action` discriminator — FusionTester injects it) |
| `overrideContext` | `Partial<TContext>` | ❌ | Per-test context overrides (shallow-merged with `contextFactory()` output) |

### `MvaTestResult`

| Field | Type | Description |
|---|---|---|
| `data` | `unknown` | Validated data after Egress Firewall — hidden fields are physically absent |
| `systemRules` | `string[]` | JIT domain rules from the Presenter |
| `uiBlocks` | `unknown[]` | SSR UI blocks (charts, summaries, markdown) |
| `isError` | `boolean` | `true` if pipeline returned an error |
| `rawResponse` | `unknown` | Raw MCP `ToolResponse` for protocol inspection |

---

## Recommended Folder Structure

```text
tests/
├── firewall/                   ← Egress Firewall assertions
│   ├── user.firewall.test.ts
│   └── order.firewall.test.ts
├── guards/                     ← Middleware & OOM Guard tests
│   ├── user.guard.test.ts
│   ├── user.oom.test.ts
│   ├── order.guard.test.ts
│   └── error.test.ts
├── rules/                      ← System Rules verification
│   ├── user.rules.test.ts
│   └── order.rules.test.ts
├── blocks/                     ← UI Blocks & truncation tests
│   └── analytics.blocks.test.ts
└── setup.ts                    ← Shared FusionTester instance
```

### Running by Governance Concern

```bash
# "Show me proof that PII never leaks" (SOC2 CC6.1)
npx vitest run tests/firewall/

# "Show me proof that auth gates work" (SOC2 CC6.3)
npx vitest run tests/guards/

# "Show me proof that the LLM receives correct rules"
npx vitest run tests/rules/

# "Show me proof that UI blocks render correctly"
npx vitest run tests/blocks/
```

## Next Steps

| Guide | What you'll learn |
|---|---|
| [Egress Firewall](/testing/egress-firewall) | Assert PII stripping for SOC2 compliance |
| [System Rules](/testing/system-rules) | Verify LLM governance directives |
| [Middleware Guards](/testing/middleware-guards) | Test RBAC and auth gates |
| [OOM Guard](/testing/oom-guard) | Validate input boundaries and agent limits |
| [UI Blocks](/testing/ui-blocks) | Assert SSR blocks and truncation warnings |
| [Error Handling](/testing/error-handling) | Test all error paths |
| [Raw Response](/testing/raw-response) | Protocol-level MCP inspection |
| [Convention](/testing/convention) | `tests/` folder structure |
