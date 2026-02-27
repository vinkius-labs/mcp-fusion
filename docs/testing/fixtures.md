---
title: "Fixtures — Test Setup & Context"
description: "Shared context, per-test overrides, async factories, and isolation patterns."
---

# Fixtures

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

Fixtures are the foundation of every test suite — the shared context, mock data, and configuration that prepare the environment before any assertion runs. In the FusionTester, the fixture is the **`contextFactory`** and the **`setup.ts`** file.

## The `setup.ts` File

Every test suite shares a single `FusionTester` instance defined in `tests/setup.ts`:

```typescript
// tests/setup.ts
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
import { registry } from '../src/index.js';

// Mock database layer
const mockPrisma = {
    user: {
        findMany: async ({ take }: { take: number }) => [
            { id: '1', name: 'Alice', email: 'alice@acme.com', passwordHash: 'bcrypt$abc', tenantId: 't_42' },
            { id: '2', name: 'Bob', email: 'bob@acme.com', passwordHash: 'bcrypt$xyz', tenantId: 't_42' },
            { id: '3', name: 'Charlie', email: 'charlie@acme.com', passwordHash: 'bcrypt$123', tenantId: 't_42' },
        ].slice(0, take),
        create: async (data: { email: string; name: string }) => ({
            id: '99', name: data.name, email: data.email,
            passwordHash: 'bcrypt$new', tenantId: 't_42',
        }),
        findUnique: async ({ where }: { where: { id: string } }) => ({
            id: where.id, name: 'Alice', email: 'alice@acme.com',
            passwordHash: 'bcrypt$abc', tenantId: 't_42',
        }),
    },
    order: {
        findMany: async ({ take }: { take: number }) => [
            { id: 'o1', total: 9900, status: 'paid', internalNotes: 'VIP client', profitMargin: 42 },
            { id: 'o2', total: 5500, status: 'pending', internalNotes: 'Expedite', profitMargin: 38 },
        ].slice(0, take),
    },
};

export const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_42',
        role: 'ADMIN',
    }),
});
```

Test files import the shared instance:

```typescript
// tests/firewall/user.firewall.test.ts
import { tester } from '../setup.js';
```

## Context Factory

The `contextFactory` is called **once per `callAction()`**. This ensures each test call gets a fresh context:

```typescript
const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_42',
        role: 'ADMIN',
        requestId: crypto.randomUUID(), // unique per call
    }),
});
```

### Async Context Factory

For scenarios that require async resolution (JWT decoding, database lookups):

```typescript
const tester = createFusionTester(registry, {
    contextFactory: async () => {
        const token = await decodeTestJWT('test-token');
        return {
            prisma: await createTestPrismaClient(),
            tenantId: token.tenantId,
            role: token.role,
            userId: token.sub,
        };
    },
});
```

## Per-Test Context Overrides

The fourth argument of `callAction()` lets you **override specific context fields** for a single test call, without creating a new FusionTester:

```typescript
// Base context: role = 'ADMIN' (from contextFactory)
const r1 = await tester.callAction('db_user', 'find_many', { take: 5 });

// Override: role = 'GUEST' (only for this call)
const r2 = await tester.callAction(
    'db_user', 'find_many', { take: 5 },
    { role: 'GUEST' },
);

// Override: different tenant (only for this call)
const r3 = await tester.callAction(
    'db_user', 'find_many', { take: 5 },
    { tenantId: 't_other' },
);
```

The override is **shallow-merged** — only the specified fields change, everything else comes from `contextFactory`.

## Context Isolation

Overrides do **not** leak between calls:

```typescript
describe('Context Isolation', () => {
    it('override does not persist to next call', async () => {
        // Call 1: GUEST override
        await tester.callAction('db_user', 'find_many', { take: 1 }, { role: 'GUEST' });

        // Call 2: no override — uses the default ADMIN
        const r2 = await tester.callAction('db_user', 'find_many', { take: 1 });
        expect(r2.isError).toBe(false); // ADMIN succeeds
    });

    it('does not mutate the original context object', async () => {
        const ctx = { prisma: mockPrisma, tenantId: 't_42', role: 'ADMIN' as string };
        const isolatedTester = createFusionTester(registry, {
            contextFactory: () => ctx,
        });

        await isolatedTester.callAction(
            'db_user', 'find_many', { take: 1 },
            { role: 'GUEST' },
        );

        expect(ctx.role).toBe('ADMIN'); // original untouched
    });
});
```

## Multiple Tester Instances

For tests that require fundamentally different configurations, create separate tester instances:

```typescript
// tests/setup.ts

// Admin tester (default)
export const adminTester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_42',
        role: 'ADMIN',
    }),
});

// Guest tester (for unauthorized path testing)
export const guestTester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_42',
        role: 'GUEST',
    }),
});

// Multi-tenant tester (for tenant isolation testing)
export const tenantBTester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrismaTenantB,
        tenantId: 't_other',
        role: 'ADMIN',
    }),
});
```

## Vitest `beforeEach` / `afterEach`

If you need per-test setup/teardown, use your runner's lifecycle hooks:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
import { registry } from '../../src/index.js';

describe('User CRUD', () => {
    let tester: ReturnType<typeof createFusionTester>;

    beforeEach(() => {
        // Fresh tester per test
        tester = createFusionTester(registry, {
            contextFactory: () => ({
                prisma: createFreshMockPrisma(),
                tenantId: 't_42',
                role: 'ADMIN',
            }),
        });
    });

    it('creates a user', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'new@test.com',
            name: 'New',
        });
        expect(result.isError).toBe(false);
    });
});
```

## Shared Fixture (Global State)

For expensive fixtures (like a real test database), use Vitest's `globalSetup`:

```typescript
// vitest.config.ts
export default defineConfig({
    test: {
        globalSetup: './tests/global-setup.ts',
    },
});
```

```typescript
// tests/global-setup.ts
export async function setup() {
    // Start test database, seed data, etc.
    globalThis.__TEST_DB_URL__ = await startTestDatabase();
}

export async function teardown() {
    await stopTestDatabase();
}
```
