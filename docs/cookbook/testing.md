# Testing

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [FusionTester Setup](#setup)
- [Executing Tools](#executing)
- [Firewall Tests — Field Whitelist](#firewall)
- [Rules Verification](#rules)
- [Middleware & Guards](#guards)
- [Generator Tests](#generators)

## Introduction {#introduction}

MCP Fusion ships `@vinkius-core/mcp-fusion-testing` — a dedicated testing harness that lets you execute tools, inspect responses, verify Presenter rules, and assert on field whitelists without spinning up a full MCP server.

The philosophy: **test perception, not plumbing**. Instead of testing "does `findMany` return rows?", test "does the AI receive exactly the fields it should, with the right rules attached?"

## FusionTester Setup {#setup}

Create a shared tester instance in your test setup file:

```typescript
// tests/setup.ts
import { FusionTester } from '@vinkius-core/mcp-fusion-testing';
import { registry } from '../src/index.js';

export function createTester(contextOverrides?: Partial<AppContext>) {
  return new FusionTester(registry, {
    db: createTestDatabase(),
    tenantId: 'test-tenant',
    userId: 'test-user',
    ...contextOverrides,
  });
}
```

`FusionTester` wraps your registry with a test-friendly API. It executes tools with the same middleware chain, Presenter pipeline, and response builder as production — but without the MCP transport layer.

## Executing Tools {#executing}

```typescript
import { describe, it, expect } from 'vitest';
import { createTester } from './setup.js';

describe('projects.list', () => {
  it('returns projects for the current tenant', async () => {
    const tester = createTester();

    const result = await tester.callTool('projects.list', {
      status: 'active',
    });

    expect(result.isError).toBe(false);
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('active');
  });

  it('returns error for invalid parameters', async () => {
    const tester = createTester();

    const result = await tester.callTool('projects.list', {
      status: 'invalid_status',   // not in enum
    });

    expect(result.isError).toBe(true);
  });
});
```

`callTool(name, args)` executes the full pipeline: validation → middleware → handler → Presenter → response. The result is an MCP `ToolResponse`.

## Firewall Tests — Field Whitelist {#firewall}

The most important test category: verify that internal fields never leak to the AI. The Presenter's Zod `.strict()` schema strips undeclared fields — but you should test it:

```typescript
// tests/firewall/invoices.firewall.test.ts
import { describe, it, expect } from 'vitest';
import { createTester } from '../setup.js';

describe('Invoice firewall', () => {
  it('strips internal fields from response', async () => {
    const tester = createTester();
    const result = await tester.callTool('billing.get_invoice', { id: 'INV-1' });

    const data = JSON.parse(result.content[0].text);

    // These fields MUST be present
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('amount_cents');
    expect(data).toHaveProperty('status');

    // These MUST NOT leak
    expect(data).not.toHaveProperty('stripe_customer_id');
    expect(data).not.toHaveProperty('internal_notes');
    expect(data).not.toHaveProperty('password_hash');
  });
});
```

> [!IMPORTANT]
> Firewall tests are your **security boundary**. Run them on every CI push. A failing firewall test means sensitive data could reach the AI.

## Rules Verification {#rules}

Verify that system rules appear in the response when (and only when) they should:

```typescript
// tests/rules/invoices.rules.test.ts
describe('Invoice rules', () => {
  it('includes currency rules in response', async () => {
    const tester = createTester();
    const result = await tester.callTool('billing.get_invoice', { id: 'INV-1' });

    const text = result.content.map(c => c.text).join('\n');
    expect(text).toContain('CENTS');
    expect(text).toContain('Divide by 100');
  });

  it('includes RBAC restriction for non-admins', async () => {
    const tester = createTester({ user: { role: 'viewer' } });
    const result = await tester.callTool('employees.get', { id: 'EMP-1' });

    const text = result.content.map(c => c.text).join('\n');
    expect(text).toContain('RESTRICTED');
    expect(text).toContain('Do NOT display salary');
  });
});
```

## Middleware & Guards {#guards}

Test that middleware blocks unauthorized access:

```typescript
// tests/guards/auth.guard.test.ts
describe('Auth middleware', () => {
  it('rejects unauthenticated requests', async () => {
    const tester = createTester({ token: '' });
    const result = await tester.callTool('users.list', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication required');
  });

  it('rejects non-admin from admin endpoints', async () => {
    const tester = createTester({ token: memberToken });
    const result = await tester.callTool('users.delete', { user_id: 'U-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('admin role required');
  });
});
```

## Generator Tests {#generators}

Test streaming handlers by collecting progress events:

```typescript
describe('Streaming', () => {
  it('emits progress events', async () => {
    const tester = createTester();
    const progressEvents: { progress: number; message: string }[] = [];

    const result = await tester.callTool(
      'repo.analyze',
      { url: 'https://github.com/test/repo' },
      { onProgress: (p) => progressEvents.push(p) },
    );

    expect(result.isError).toBe(false);
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1].progress).toBe(100);
  });
});
```

The `onProgress` callback collects every `yield progress()` from the generator handler.