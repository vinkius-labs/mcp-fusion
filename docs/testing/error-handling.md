---
title: "Error Handling Testing"
description: "Assert isError, error messages, and empty MVA layers — every failure mode is auditable."
---

# Error Handling

The `MvaTestResult.isError` field is the universal signal for pipeline failures. It's `true` whenever:

- Zod input validation rejects the arguments
- Middleware blocks the call (e.g., RBAC rejection)
- The handler explicitly returns `error()`
- The tool or action name is unknown

## Testing Unknown Tools

```typescript
describe('Error: Unknown Tool', () => {
    it('sets isError for nonexistent tools', async () => {
        const result = await tester.callAction('nonexistent_tool', 'list');

        expect(result.isError).toBe(true);
    });
});
```

## Testing Unknown Actions

```typescript
describe('Error: Unknown Action', () => {
    it('sets isError for nonexistent actions', async () => {
        const result = await tester.callAction('db_user', 'nonexistent_action');

        expect(result.isError).toBe(true);
    });
});
```

## Testing Handler-Returned Errors

When a handler explicitly returns `error()`:

```typescript
// In your handler:
handler: async () => {
    return error('This operation is temporarily disabled.');
}
```

Test it:

```typescript
describe('Error: Handler Error', () => {
    it('sets isError when handler returns error()', async () => {
        const result = await tester.callAction('system', 'disabled_action');

        expect(result.isError).toBe(true);
        expect(result.data).toContain('temporarily disabled');
    });
});
```

## Empty MVA Layers on Error

When a pipeline error occurs, the MVA layers (systemRules, uiBlocks) should be empty — no partial data leaks:

```typescript
describe('Error: Empty MVA Layers', () => {
    it('returns empty systemRules on error', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 99999 });

        expect(result.isError).toBe(true);
        expect(result.systemRules).toEqual([]);
    });

    it('returns empty uiBlocks on error', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 99999 });

        expect(result.isError).toBe(true);
        expect(result.uiBlocks).toEqual([]);
    });
});
```

## Testing Error Message Content

Assert the error message for debugging and monitoring:

```typescript
describe('Error Messages', () => {
    it('middleware error contains "Unauthorized"', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'GUEST' },
        );

        expect(result.isError).toBe(true);
        expect(result.data).toContain('Unauthorized');
    });

    it('handler error contains the specific message', async () => {
        const result = await tester.callAction('system', 'disabled_action');

        expect(result.isError).toBe(true);
        expect(result.data).toContain('temporarily disabled');
    });
});
```

## Error vs Exception

Important distinction: `isError: true` means the pipeline **handled** the error gracefully. The FusionTester returned a structured result. This is different from an unhandled exception (which would throw).

```typescript
it('validation errors are handled, not thrown', async () => {
    // This does NOT throw — it returns isError: true
    const result = await tester.callAction('db_user', 'find_many', { take: 'invalid' });

    expect(result.isError).toBe(true);
    expect(result.data).toBeDefined(); // error message is in data
});
```
