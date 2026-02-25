---
title: "System Rules Testing"
description: "Verify that the LLM receives deterministic governance directives — not vibes, not hopes, mathematical proof."
---

# System Rules

System Rules are JIT (Just-In-Time) domain directives injected by the Presenter into the LLM context. They replace the bloated global system prompt with **per-response, per-entity governance.**

Unlike global system prompts that burn tokens on every turn regardless of relevance, System Rules are **tree-shaken** — the LLM only receives rules relevant to the data it's currently looking at.

## Why This Matters

Without deterministic testing, you have no way to prove:

- That the LLM was told "Email addresses are PII" when it received user data
- That the LLM was told "Values are in cents" when it received financial data
- That the LLM was **not** told a rule meant for a different entity

System Rules are the governance contract between your application and the AI model. They must be auditable.

## Testing Static Rules

Static rules are defined as string arrays in the Presenter:

```typescript
const UserPresenter = definePresenter({
    name: 'User',
    schema: UserSchema,
    systemRules: [
        'All data is from Prisma ORM. Do not infer data outside this response.',
        'Email addresses are PII. Mask when possible.',
    ],
});
```

Test them:

```typescript
describe('User System Rules', () => {
    it('injects data provenance rule', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.systemRules).toContain(
            'All data is from Prisma ORM. Do not infer data outside this response.'
        );
    });

    it('injects PII governance rule', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.systemRules).toContain(
            'Email addresses are PII. Mask when possible.'
        );
    });

    it('returns exactly 2 rules', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });
        expect(result.systemRules).toHaveLength(2);
    });
});
```

## Testing Contextual Rules (Dynamic Functions)

Contextual rules are functions that receive the data and context, producing rules dynamically:

```typescript
const AnalyticsPresenter = createPresenter<AnalyticsDTO>('Analytics')
    .schema(AnalyticsSchema)
    .systemRules((data, ctx) => [
        'Values are in cents. Divide by 100 for display.',
        ctx.role === 'ADMIN' ? 'User is ADMIN. Show full details.' : null,
        data.length > 100 ? 'Large dataset. Summarize instead of listing.' : null,
    ]);
```

Test them:

```typescript
describe('Analytics Contextual Rules', () => {
    it('includes base rule for all roles', async () => {
        const result = await tester.callAction('analytics', 'list', { limit: 5 });

        expect(result.systemRules).toContain(
            'Values are in cents. Divide by 100 for display.'
        );
    });

    it('includes ADMIN-specific rule for admins', async () => {
        const result = await tester.callAction(
            'analytics', 'list', { limit: 5 },
            { role: 'ADMIN' },
        );

        expect(result.systemRules).toContain(
            'User is ADMIN. Show full details.'
        );
    });

    it('excludes ADMIN rule for non-admins', async () => {
        const result = await tester.callAction(
            'analytics', 'list', { limit: 5 },
            { role: 'VIEWER' },
        );

        expect(result.systemRules).not.toContain(
            'User is ADMIN. Show full details.'
        );
    });
});
```

## Testing Manual `response()` Builder Rules

Actions that use the `response()` builder directly (without a Presenter) can also inject rules:

```typescript
// In your handler:
handler: async () => {
    return response({ status: 'healthy' })
        .systemRules(['System is operational.', 'No action required.'])
        .build();
}
```

Test them:

```typescript
it('extracts rules from manual response() builder', async () => {
    const result = await tester.callAction('system', 'health');

    expect(result.systemRules).toContain('System is operational.');
    expect(result.systemRules).toContain('No action required.');
});
```

## Testing Rule Absence

Equally important — verify that tools **without** a Presenter return empty rules:

```typescript
it('returns empty rules for tools without Presenter', async () => {
    const result = await tester.callAction('health', 'check');
    expect(result.systemRules).toEqual([]);
});
```

This proves that the LLM is not receiving stale or irrelevant governance directives.

## Context Tree-Shaking Proof

The ultimate value of System Rules testing is proving **Context Tree-Shaking** — the LLM only sees rules relevant to the current entity:

```typescript
describe('Context Tree-Shaking', () => {
    it('User rules do NOT appear in Order responses', async () => {
        const result = await tester.callAction('db_order', 'find_many', { take: 1 });

        expect(result.systemRules).not.toContain('Email addresses are PII.');
        expect(result.systemRules).toContain('Order totals include tax.');
    });

    it('Order rules do NOT appear in User responses', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.systemRules).not.toContain('Order totals include tax.');
        expect(result.systemRules).toContain('Email addresses are PII.');
    });
});
```
