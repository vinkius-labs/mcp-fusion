---
title: "Assertions Reference"
description: "Every assertion pattern for MvaTestResult — data, systemRules, uiBlocks, isError, rawResponse."
---

# Assertions

The `FusionTester` returns `MvaTestResult` objects. Every field in the result maps to a specific MVA pipeline layer. This page documents every assertion pattern.

## `result.data` — Egress Firewall Output

The `data` field contains the **validated, filtered** output after the Presenter's Zod schema strips undeclared fields.

### Assert field absence (PII stripping)

```typescript
expect(result.data).not.toHaveProperty('passwordHash');
expect(result.data).not.toHaveProperty('tenantId');
expect(result.data).not.toHaveProperty('internalFlags');
```

### Assert field presence

```typescript
expect(result.data).toHaveProperty('id');
expect(result.data).toHaveProperty('name');
expect(result.data).toHaveProperty('email');
```

### Assert exact value

```typescript
const user = result.data as { id: string; name: string; email: string };
expect(user.id).toBe('1');
expect(user.name).toBe('Alice');
expect(user.email).toBe('alice@acme.com');
```

### Assert shape (exact match)

```typescript
expect(result.data).toEqual({
    id: '1',
    name: 'Alice',
    email: 'alice@acme.com',
});
```

### Assert array length

```typescript
const items = result.data as any[];
expect(items).toHaveLength(5);
```

### Assert array item shape

```typescript
const users = result.data as any[];
for (const user of users) {
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('name');
    expect(user).not.toHaveProperty('passwordHash');
}
```

### Assert truncation (Agent Limit)

```typescript
const items = result.data as any[];
expect(items.length).toBeLessThanOrEqual(20); // agentLimit(20)
```

## `result.systemRules` — LLM Governance Directives

The `systemRules` field is a `string[]` of domain rules injected by the Presenter.

### Assert rule presence

```typescript
expect(result.systemRules).toContain('Email addresses are PII. Mask when possible.');
```

### Assert rule absence

```typescript
expect(result.systemRules).not.toContain('Order totals include tax.');
```

### Assert exact number of rules

```typescript
expect(result.systemRules).toHaveLength(3);
```

### Assert empty rules (no Presenter)

```typescript
expect(result.systemRules).toEqual([]);
```

### Assert array type

```typescript
expect(result.systemRules).toBeInstanceOf(Array);
```

### Assert rule contains substring

```typescript
const hasPiiRule = result.systemRules.some(r => r.includes('PII'));
expect(hasPiiRule).toBe(true);
```

### Assert all rules are strings

```typescript
for (const rule of result.systemRules) {
    expect(typeof rule).toBe('string');
    expect(rule.length).toBeGreaterThan(0);
}
```

## `result.uiBlocks` — Server-Side Rendered Components

The `uiBlocks` field is an `unknown[]` of SSR blocks from the Presenter.

### Assert block existence

```typescript
expect(result.uiBlocks.length).toBeGreaterThan(0);
```

### Assert block type

```typescript
const summary = result.uiBlocks.find((b: any) => b.type === 'summary');
expect(summary).toBeDefined();
```

### Assert block content

```typescript
const summary = result.uiBlocks.find((b: any) => b.type === 'summary') as any;
expect(summary.content).toContain('Total:');
```

### Assert truncation warning

```typescript
const warning = result.uiBlocks.find(
    (b: any) => b.content?.includes('Truncated')
);
expect(warning).toBeDefined();
```

### Assert empty blocks (no Presenter)

```typescript
expect(result.uiBlocks).toEqual([]);
```

## `result.isError` — Pipeline Error Flag

### Assert success

```typescript
expect(result.isError).toBe(false);
```

### Assert failure

```typescript
expect(result.isError).toBe(true);
```

### Assert error message content

```typescript
expect(result.isError).toBe(true);
expect(result.data).toContain('Unauthorized');
```

### Assert error message type

```typescript
expect(result.isError).toBe(true);
expect(typeof result.data).toBe('string');
```

### Assert empty MVA layers on error

When `isError` is true, system rules and UI blocks should be empty:

```typescript
expect(result.isError).toBe(true);
expect(result.systemRules).toEqual([]);
expect(result.uiBlocks).toEqual([]);
```

## `result.rawResponse` — MCP Protocol Object

### Assert content array exists

```typescript
const raw = result.rawResponse as { content: Array<{ type: string; text: string }> };
expect(raw.content).toBeInstanceOf(Array);
expect(raw.content.length).toBeGreaterThan(0);
```

### Assert content block type

```typescript
const raw = result.rawResponse as { content: Array<{ type: string }> };
expect(raw.content[0].type).toBe('text');
```

### Assert isError flag on raw response

```typescript
const raw = result.rawResponse as { isError?: boolean };
expect(raw.isError).toBe(true);
```

### Assert Symbol invisibility (critical)

```typescript
const json = JSON.stringify(result.rawResponse);
expect(json).not.toContain('mva-meta');
expect(json).not.toContain('systemRules');
expect(json).not.toContain('passwordHash');
```

### Assert Symbol accessibility

```typescript
import { MVA_META_SYMBOL } from '@vinkius-core/mcp-fusion';

const meta = (result.rawResponse as any)[MVA_META_SYMBOL];
expect(meta).toBeDefined();
expect(meta.data).toBeDefined();
expect(meta.systemRules).toBeInstanceOf(Array);
```

### Assert XML content blocks

```typescript
const raw = result.rawResponse as { content: Array<{ text: string }> };
const hasDataBlock = raw.content.some(c => c.text.includes('<data>'));
const hasRulesBlock = raw.content.some(c => c.text.includes('<system_rules>'));
expect(hasDataBlock).toBe(true);
expect(hasRulesBlock).toBe(true);
```

## Composite Assertions

### Full SOC2 Audit (single test)

```typescript
it('SOC2 CC6.1 — no PII leak to LLM', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 10 });

    // 1. No error
    expect(result.isError).toBe(false);

    // 2. PII stripped
    for (const user of result.data as any[]) {
        expect(user).not.toHaveProperty('passwordHash');
        expect(user).not.toHaveProperty('tenantId');
    }

    // 3. Governance rules present
    expect(result.systemRules).toContain('Email addresses are PII. Mask when possible.');

    // 4. Transport clean
    const json = JSON.stringify(result.rawResponse);
    expect(json).not.toContain('passwordHash');
});
```

### Full RBAC Audit (single test)

```typescript
it('SOC2 CC6.3 — access control enforcement', async () => {
    const admin = await tester.callAction('db_user', 'find_many', { take: 1 });
    const guest = await tester.callAction(
        'db_user', 'find_many', { take: 1 },
        { role: 'GUEST' },
    );

    expect(admin.isError).toBe(false);
    expect(admin.data).toHaveProperty('[0].id');

    expect(guest.isError).toBe(true);
    expect(guest.systemRules).toEqual([]);
});
```
