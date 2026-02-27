# Testing

`@vinkius-core/mcp-fusion-testing` runs the full execution pipeline in RAM — same code path as production — and returns structured `MvaTestResult` objects with each MVA layer decomposed into its own field. Zero tokens, zero servers, deterministic on every CI run.

```bash
npm install @vinkius-core/mcp-fusion-testing
```

Works with Vitest, Jest, Mocha, or `node:test`. The tester returns plain objects — your runner, your choice.

## Create a Tester

```typescript
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
import { registry } from './server/registry.js';

const tester = createFusionTester(registry, {
  contextFactory: () => ({
    prisma: mockPrisma,
    tenantId: 't_enterprise_42',
    role: 'ADMIN',
  }),
});
```

`createFusionTester` wraps your real `ToolRegistry` and calls `routeCall()` — the same function production uses. No pipeline reimplementation, no mock transport.

## Assert Every MVA Layer

```typescript
import { describe, it, expect } from 'vitest';

describe('SOC2 Data Governance', () => {
  it('strips PII before it reaches the LLM', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 10 });

    for (const user of result.data) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('tenantId');
    }
  });

  it('rejects unbounded queries', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 99999 });
    expect(result.isError).toBe(true);
  });

  it('sends governance rules with data', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 5 });
    expect(result.systemRules).toContain('Email addresses are PII. Mask when possible.');
  });

  it('blocks guest access', async () => {
    const result = await tester.callAction(
      'db_user', 'find_many', { take: 5 },
      { role: 'GUEST' },
    );
    expect(result.isError).toBe(true);
  });
});
```

Four tests, 8 ms, zero tokens.

## What `MvaTestResult` Exposes

| Field | What you assert | Compliance mapping |
|---|---|---|
| `result.data` | Presenter schema stripped undeclared fields | SOC2 CC6.1 — data leak prevention |
| `result.isError` | Middleware rejected the request | SOC2 CC6.3 — access control |
| `result.systemRules` | Domain directives present in response | Context governance |
| `result.uiBlocks` | Server-rendered charts and summaries correct | Response quality |
| `result.data.length` | `agentLimit` capped the collection | Context window protection |
| `rawResponse` | `<action_suggestions>` HATEOAS hints present | Agent navigation |

## How It Works

`ResponseBuilder.build()` attaches MVA metadata via `Symbol.for('mcp-fusion.mva-meta')`. Symbols are invisible to `JSON.stringify`, so the MCP transport never sees them — but `FusionTester` reads them in RAM:

```typescript
// MCP transport sees:
{ "content": [{ "type": "text", "text": "<data>...</data>" }] }

// FusionTester reads (Symbol key):
response[Symbol.for('mcp-fusion.mva-meta')] = {
  data: { id: '1', name: 'Alice', email: 'alice@acme.com' },
  rules: ['Data from Prisma ORM. Do not infer outside this response.'],
  ui: [{ type: 'summary', content: 'User: Alice (alice@acme.com)' }],
};
```

The tester exercises the full pipeline — Zod validation, compiled middleware chain, concurrency semaphore, mutation serialization, abort signal propagation, egress guards, agent limit truncation, and HATEOAS suggestions.

## Guides

| Guide | Description |
|---|---|
| [Quick Start](/testing/quickstart) | Build your first FusionTester in 5 minutes |
| [Egress Firewall](/testing/egress-firewall) | Audit PII stripping and field-level security |
| [System Rules](/testing/system-rules) | Verify LLM governance directives |
| [UI Blocks](/testing/ui-blocks) | Assert SSR blocks, charts, and cognitive guardrails |
| [Middleware Guards](/testing/middleware-guards) | Test RBAC, auth gates, and context derivation |
| [OOM Guard](/testing/oom-guard) | Validate Zod input boundaries and agent limits |
| [Error Handling](/testing/error-handling) | Assert `isError`, error messages, empty MVA layers |
| [Raw Response](/testing/raw-response) | Protocol-level MCP transport inspection |
| [Convention](/testing/convention) | `tests/` folder structure in the MVA convention |
