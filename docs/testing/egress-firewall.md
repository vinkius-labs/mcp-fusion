---
title: "Egress Firewall Testing"
description: "Prove mathematically that sensitive fields never reach the LLM — SOC2 CC6.1 compliance in CI/CD."
---

# Egress Firewall

The Egress Firewall is the Presenter's Zod schema acting as a **physical barrier** between your database and the LLM. Fields not declared in the schema are stripped in RAM — they never exist in the response object.

This is the most critical audit in any AI application: **proving that PII, secrets, and internal identifiers never leak to the model.**

## Why This Matters

Without the Egress Firewall, your handler returns raw database rows:

```typescript
// What the handler sends to the Presenter:
{ id: '1', name: 'Alice', email: 'alice@acme.com', passwordHash: 'bcrypt$abc', tenantId: 't_42' }

// What the Presenter outputs (Zod strips undeclared fields):
{ id: '1', name: 'Alice', email: 'alice@acme.com' }
```

The `passwordHash` and `tenantId` are not "hidden" or "masked" — they are **physically absent** from the response object. `JSON.stringify` cannot leak what doesn't exist.

## Testing PII Stripping

```typescript
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('User Egress Firewall', () => {
    it('strips passwordHash from find_many response', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });

        expect(result.isError).toBe(false);
        const users = result.data as Array<Record<string, unknown>>;

        for (const user of users) {
            expect(user).not.toHaveProperty('passwordHash');
        }
    });

    it('strips tenantId (multi-tenant isolation)', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });

        for (const user of result.data as any[]) {
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
});
```

## Testing Single-Item Responses

Egress works on both arrays and single objects:

```typescript
describe('User Create — Single Item Egress', () => {
    it('strips passwordHash from create response', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: 'new@test.com',
            name: 'New User',
        });

        expect(result.isError).toBe(false);
        const user = result.data as Record<string, unknown>;

        expect(user).not.toHaveProperty('passwordHash');
        expect(user).not.toHaveProperty('tenantId');
        expect(user.name).toBe('New User');
        expect(user.email).toBe('new@test.com');
    });
});
```

## Testing Cross-Presenter Stripping

Different Presenters can strip different fields:

```typescript
describe('Order Egress Firewall', () => {
    it('strips internalNotes from order response', async () => {
        const result = await tester.callAction('db_order', 'find_many', { take: 3 });

        for (const order of result.data as any[]) {
            expect(order).not.toHaveProperty('internalNotes');
            expect(order).not.toHaveProperty('profitMargin');
            expect(order).toHaveProperty('total');
            expect(order).toHaveProperty('status');
        }
    });
});
```

## Symbol Invisibility Verification

Prove that the structured MVA metadata is invisible to JSON transport:

```typescript
import { MVA_META_SYMBOL } from '@vinkius-core/mcp-fusion';

it('Symbol metadata is invisible to JSON.stringify', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 1 });
    const json = JSON.stringify(result.rawResponse);

    // Transport layer never sees MVA metadata
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('systemRules');
    expect(json).not.toContain('mva-meta');

    // But the Symbol IS accessible in memory
    const meta = (result.rawResponse as any)[MVA_META_SYMBOL];
    expect(meta).toBeDefined();
    expect(meta.data).toBeDefined();
});
```

## SOC2 Compliance Matrix

| Control | FusionTester Assertion | Status |
|---|---|---|
| CC6.1 — Logical Access | `passwordHash` absent from `result.data` | ✅ Provable |
| CC6.1 — Data Classification | `tenantId` absent (multi-tenant isolation) | ✅ Provable |
| CC6.7 — Output Controls | Only declared schema fields exist in response | ✅ Provable |
| CC7.2 — Monitoring | Deterministic, reproducible in CI/CD | ✅ Automated |
