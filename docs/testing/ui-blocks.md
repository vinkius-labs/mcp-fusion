---
title: "UI Blocks Testing"
description: "Assert that SSR blocks, charts, summaries, and cognitive guardrails are generated correctly."
---

# UI Blocks

UI Blocks are server-side rendered components that the Presenter generates for the client. They include charts, summaries, markdown tables, and truncation warnings.

Unlike system rules (which govern the LLM), UI Blocks govern the **client experience** — what the user sees.

## Per-Item UI Blocks

Defined via `.uiBlocks()` on the Presenter:

```typescript
const UserPresenter = createPresenter<UserDTO>('User')
    .schema(UserSchema)
    .uiBlocks((user) => [
        ui.summary(`User: ${user.name} (${user.email})`),
    ]);
```

Test them:

```typescript
describe('User UI Blocks', () => {
    it('generates per-item UI blocks', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.uiBlocks).toBeInstanceOf(Array);
    });
});
```

## Collection UI Blocks

Defined via `.collectionUiBlocks()` — executed once for the entire collection:

```typescript
const AnalyticsPresenter = createPresenter<ItemDTO>('Item')
    .schema(ItemSchema)
    .collectionUiBlocks((items) => [
        ui.summary(`Total: ${items.length} items, sum=${items.reduce((s, i) => s + i.value, 0)}`),
    ]);
```

Test them:

```typescript
describe('Analytics Collection UI Blocks', () => {
    it('generates collection summary', async () => {
        const result = await tester.callAction('analytics', 'list', { limit: 5 });

        expect(result.uiBlocks.length).toBeGreaterThan(0);

        const summary = result.uiBlocks.find(
            (b: any) => b.type === 'summary'
        ) as any;

        expect(summary).toBeDefined();
        expect(summary.content).toContain('Total:');
    });
});
```

## Agent Limit Truncation Warning

When `.agentLimit()` truncates a collection, the Presenter generates a truncation warning block:

```typescript
const RichPresenter = createPresenter<ItemDTO>('Item')
    .schema(ItemSchema)
    .agentLimit(20, (omitted) =>
        ui.summary(`⚠️ Truncated. 20 shown, ${omitted} hidden. Apply filters.`)
    );
```

Test truncation:

```typescript
describe('Agent Limit Truncation', () => {
    it('truncates collections beyond agentLimit', async () => {
        // Handler returns 100 items, but agentLimit is 20
        const result = await tester.callAction('analytics', 'list', { limit: 100 });

        const items = result.data as any[];
        expect(items).toHaveLength(20);
    });

    it('includes truncation warning in UI blocks', async () => {
        const result = await tester.callAction('analytics', 'list', { limit: 100 });

        const warning = result.uiBlocks.find(
            (b: any) => b.content?.includes('Truncated')
        ) as any;

        expect(warning).toBeDefined();
        expect(warning.content).toContain('hidden');
    });

    it('does NOT truncate when within limit', async () => {
        const result = await tester.callAction('analytics', 'list', { limit: 5 });

        const items = result.data as any[];
        expect(items).toHaveLength(5);
    });
});
```

## Empty UI Blocks

Verify that tools without a Presenter return empty blocks:

```typescript
it('returns empty UI blocks for raw tools', async () => {
    const result = await tester.callAction('health', 'check');
    expect(result.uiBlocks).toEqual([]);
});
```
