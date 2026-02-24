---
title: "Middleware Guards Testing"
description: "Test RBAC, authentication gates, and context-derived authorization — deterministically in CI/CD."
---

# Middleware Guards

Middleware in **MCP Fusion** runs before the handler — it can block unauthorized calls, derive context, or transform arguments. Testing middleware is critical because it enforces **who** can access **what**.

## The `overrideContext` Pattern

The `FusionTester` provides `overrideContext` as the fourth argument to `callAction()`. It shallow-merges with the base context from `contextFactory`, letting you simulate different users, roles, or tenants in each test — without creating separate tester instances.

```typescript
// Default context: role = 'ADMIN' (from contextFactory)
const result = await tester.callAction('db_user', 'find_many', { take: 5 });

// Override: role = 'GUEST'
const result = await tester.callAction(
    'db_user', 'find_many', { take: 5 },
    { role: 'GUEST' },  // ← only role changes, everything else preserved
);
```

## Testing RBAC (Role-Based Access Control)

```typescript
describe('User RBAC', () => {
    it('allows ADMIN role', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'ADMIN' },
        );

        expect(result.isError).toBe(false);
        expect((result.data as any[]).length).toBeGreaterThan(0);
    });

    it('blocks GUEST role', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'GUEST' },
        );

        expect(result.isError).toBe(true);
        expect(result.data).toContain('Unauthorized');
    });

    it('blocks VIEWER from write operations', async () => {
        const result = await tester.callAction(
            'db_user', 'create', { email: 'test@co.com', name: 'Test' },
            { role: 'VIEWER' },
        );

        expect(result.isError).toBe(true);
    });

    it('middleware blocks propagate empty MVA layers', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'GUEST' },
        );

        expect(result.systemRules).toEqual([]);
        expect(result.uiBlocks).toEqual([]);
    });
});
```

## Testing Multi-Tenant Isolation

```typescript
describe('Tenant Isolation', () => {
    it('uses overridden tenantId', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { tenantId: 't_other_tenant' },
        );

        // If your middleware filters by tenantId, assert accordingly
        expect(result.isError).toBe(false);
    });
});
```

## Context Isolation Between Tests

Verify that `overrideContext` does NOT mutate the original context:

```typescript
describe('Context Isolation', () => {
    it('does not leak context between calls', async () => {
        // Call 1: GUEST (blocked)
        const r1 = await tester.callAction(
            'db_user', 'find_many', { take: 1 },
            { role: 'GUEST' },
        );

        // Call 2: default ADMIN (succeeds)
        const r2 = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(r1.isError).toBe(true);
        expect(r2.isError).toBe(false);
    });

    it('does not mutate the original context object', async () => {
        const originalCtx = createMockContext();
        const isolatedTester = createFusionTester(registry, {
            contextFactory: () => originalCtx,
        });

        await isolatedTester.callAction(
            'db_user', 'find_many', { take: 1 },
            { role: 'GUEST' },
        );

        // Original was never modified
        expect(originalCtx.role).toBe('ADMIN');
    });
});
```

## Middleware Applied to All Actions

Prove that middleware protects **every** action on the tool, not just one:

```typescript
describe('Middleware Coverage', () => {
    const actions = ['find_many', 'create', 'update', 'delete'];

    for (const action of actions) {
        it(`blocks GUEST on ${action}`, async () => {
            const result = await tester.callAction(
                'db_user', action, {},
                { role: 'GUEST' },
            );

            expect(result.isError).toBe(true);
        });
    }
});
```
