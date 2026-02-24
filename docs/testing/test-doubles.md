---
title: "Test Doubles — Mocking Context"
description: "Mock Prisma, HTTP clients, and external services for deterministic in-memory testing."
---

# Test Doubles

Test doubles (stubs, mocks, spies) replace real dependencies with controlled implementations. In the FusionTester, the primary test double is the **mock context** — the fake database, HTTP client, or cache layer that your handlers interact with.

## What Gets Mocked

The FusionTester runs the **real** pipeline — Zod validation, middleware, handler, Presenter. The only thing you mock is the **context** passed to handlers:

```
Real:  ToolRegistry.routeCall() → Zod → Middleware → Handler → Presenter
Mock:  ctx.prisma, ctx.httpClient, ctx.cache, etc.
```

## Mock Prisma Client

The most common test double — a fake database layer:

```typescript
const mockPrisma = {
    user: {
        findMany: async ({ take, where }: any) => {
            const users = [
                { id: '1', name: 'Alice', email: 'alice@acme.com', passwordHash: 'bcrypt$abc', tenantId: 't_42' },
                { id: '2', name: 'Bob', email: 'bob@acme.com', passwordHash: 'bcrypt$xyz', tenantId: 't_42' },
                { id: '3', name: 'Charlie', email: 'charlie@acme.com', passwordHash: 'bcrypt$123', tenantId: 't_42' },
            ];

            let filtered = users;
            if (where?.tenantId) {
                filtered = filtered.filter(u => u.tenantId === where.tenantId);
            }
            return filtered.slice(0, take);
        },

        create: async (data: any) => ({
            id: crypto.randomUUID(),
            ...data,
            passwordHash: 'bcrypt$generated',
            tenantId: 't_42',
        }),

        findUnique: async ({ where }: any) => ({
            id: where.id,
            name: 'Alice',
            email: 'alice@acme.com',
            passwordHash: 'bcrypt$abc',
            tenantId: 't_42',
        }),

        update: async ({ where, data }: any) => ({
            id: where.id,
            ...data,
            passwordHash: 'bcrypt$abc',
            tenantId: 't_42',
        }),

        delete: async ({ where }: any) => ({
            id: where.id,
            name: 'Deleted User',
            email: 'deleted@acme.com',
            passwordHash: 'bcrypt$del',
            tenantId: 't_42',
        }),
    },
};
```

## Mock HTTP Client

For tools that call external APIs:

```typescript
const mockHttpClient = {
    get: async (url: string) => {
        if (url.includes('/weather')) {
            return { data: { temp: 22, city: 'São Paulo' } };
        }
        throw new Error(`Unmocked URL: ${url}`);
    },

    post: async (url: string, body: any) => {
        if (url.includes('/notify')) {
            return { data: { success: true, messageId: 'msg_123' } };
        }
        throw new Error(`Unmocked URL: ${url}`);
    },
};
```

## Mock Cache

```typescript
const cache = new Map<string, any>();

const mockCache = {
    get: async (key: string) => cache.get(key) ?? null,
    set: async (key: string, value: any, ttl?: number) => { cache.set(key, value); },
    del: async (key: string) => { cache.delete(key); },
    clear: async () => { cache.clear(); },
};
```

## Vitest Mock Functions (Spies)

Use `vi.fn()` to track calls:

```typescript
import { vi, describe, it, expect } from 'vitest';

const findManyFn = vi.fn(async ({ take }: { take: number }) => [
    { id: '1', name: 'Alice', email: 'alice@acme.com', passwordHash: 'bcrypt$abc', tenantId: 't_42' },
].slice(0, take));

const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: { user: { findMany: findManyFn } },
        tenantId: 't_42',
        role: 'ADMIN',
    }),
});

describe('Database interaction', () => {
    it('calls findMany with correct take', async () => {
        await tester.callAction('db_user', 'find_many', { take: 3 });

        expect(findManyFn).toHaveBeenCalledOnce();
        expect(findManyFn).toHaveBeenCalledWith(
            expect.objectContaining({ take: 3 }),
        );
    });

    it('does NOT call database when input is invalid', async () => {
        findManyFn.mockClear();

        await tester.callAction('db_user', 'find_many', { take: 99999 });
        
        // Zod rejects before handler runs — database never called
        expect(findManyFn).not.toHaveBeenCalled();
    });
});
```

## Error-Throwing Mocks

Test how your handler behaves when the database throws:

```typescript
const failingPrisma = {
    user: {
        findMany: async () => {
            throw new Error('Connection refused');
        },
    },
};

const failTester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: failingPrisma,
        tenantId: 't_42',
        role: 'ADMIN',
    }),
});

it('handles database errors gracefully', async () => {
    const result = await failTester.callAction('db_user', 'find_many', { take: 5 });
    expect(result.isError).toBe(true);
});
```

## Conditional Mock Data

Return different data based on input:

```typescript
const smartMock = {
    user: {
        findMany: async ({ take, where }: any) => {
            if (where?.role === 'ADMIN') {
                return [{ id: '1', name: 'Admin User', email: 'admin@acme.com', passwordHash: 'x', tenantId: 't_42' }];
            }
            return [
                { id: '2', name: 'Regular User', email: 'user@acme.com', passwordHash: 'y', tenantId: 't_42' },
                { id: '3', name: 'Another User', email: 'other@acme.com', passwordHash: 'z', tenantId: 't_42' },
            ].slice(0, take);
        },
    },
};
```

## Best Practices

1. **Mock the context, not the pipeline.** The FusionTester runs the real pipeline. Only mock what the handler calls.
2. **Use typed mocks.** Keep your mock interfaces aligned with real types to catch drift.
3. **Spy on database calls.** Use `vi.fn()` to verify that Zod rejects invalid input before hitting the database.
4. **Test failures too.** Use error-throwing mocks to verify graceful degradation.
5. **Keep mocks in `setup.ts`.** Centralize mocks so all test files share the same fake data.
