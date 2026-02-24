---
title: "OOM Guard Testing"
description: "Validate Zod input boundaries and agent limit truncation — prevent memory exhaustion and context window overflow."
---

# OOM Guard

The OOM (Out-of-Memory) Guard operates at two layers:

1. **Zod Input Validation** — rejects invalid or unbounded arguments before they reach the handler
2. **Agent Limit** — truncates large collections before they reach the LLM context window

Both are deterministic and testable without any AI involvement.

## Zod Input Validation

### Max/Min Boundaries

```typescript
describe('User OOM Guard', () => {
    it('rejects take > 50', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10000 });
        expect(result.isError).toBe(true);
    });

    it('rejects take = 0', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 0 });
        expect(result.isError).toBe(true);
    });

    it('accepts take = 1 (minimum boundary)', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });
        expect(result.isError).toBe(false);
    });

    it('accepts take = 50 (maximum boundary)', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 50 });
        expect(result.isError).toBe(false);
    });
});
```

### Type Safety

```typescript
describe('Type Safety', () => {
    it('rejects non-integer take', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 3.14 });
        expect(result.isError).toBe(true);
    });

    it('rejects string take', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 'fifty' });
        expect(result.isError).toBe(true);
    });

    it('rejects missing required fields', async () => {
        const result = await tester.callAction('db_user', 'find_many', {});
        expect(result.isError).toBe(true);
    });
});
```

### Email Validation

```typescript
describe('Email Validation', () => {
    it('rejects invalid email format', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'not-an-email',
            name: 'Test',
        });
        expect(result.isError).toBe(true);
    });

    it('rejects empty name', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'valid@test.com',
            name: '',
        });
        expect(result.isError).toBe(true);
    });

    it('accepts valid input', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'valid@test.com',
            name: 'Valid User',
        });
        expect(result.isError).toBe(false);
    });
});
```

## Agent Limit Truncation

The Agent Limit prevents context window exhaustion by capping the number of items sent to the LLM:

```typescript
describe('Agent Limit', () => {
    it('truncates at the configured limit', async () => {
        // Handler returns 100 items, agentLimit is 20
        const result = await tester.callAction('analytics', 'list', { limit: 100 });

        expect(result.isError).toBe(false);
        const items = result.data as any[];
        expect(items).toHaveLength(20);
    });

    it('passes through when under the limit', async () => {
        const result = await tester.callAction('analytics', 'list', { limit: 5 });

        const items = result.data as any[];
        expect(items).toHaveLength(5);
    });

    it('generates truncation warning', async () => {
        const result = await tester.callAction('analytics', 'list', { limit: 100 });

        const warning = result.uiBlocks.find(
            (b: any) => b.content?.includes('Truncated')
        );
        expect(warning).toBeDefined();
    });
});
```

## Why This Matters

Without OOM Guards, a single LLM request for "list all users" could:

1. **Crash the Node.js server** — returning 100,000 rows exhausts heap memory
2. **Overflow the context window** — the LLM silently drops data or hallucinates
3. **Run up your API bill** — each additional token is money

The FusionTester lets you prove these guards exist and work — in CI/CD, in milliseconds, at zero cost.
