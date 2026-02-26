# @vinkius-core/mcp-fusion-testing

<div align="center">
  <strong>The official test runner for MCP Fusion applications.</strong>
  <br />
  In-memory MVA lifecycle emulator — runs the full execution pipeline without network transport.
  <br /><br />

  [![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-testing.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion-testing)
  [![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg?style=flat-square)](package.json)
  [![Runner Agnostic](https://img.shields.io/badge/runner-agnostic-purple.svg?style=flat-square)](package.json)
</div>

---

## Why

Every MCP server today is tested with HTTP mocks, raw `JSON.stringify` assertions, and string matching. That's like testing a REST API by reading TCP packets.

**MCP Fusion** applications have **five auditable layers** (Zod Validation → Middleware Chain → Handler → Presenter Egress Firewall → System Rules). The `FusionTester` lets you assert each layer independently, in-memory, without starting a server.

```
┌─────────────────────────────────────────────────────────┐
│                    FusionTester                          │
│                                                         │
│  ┌──────────┐   ┌────────────┐   ┌─────────┐           │
│  │   Zod    │──▶│ Middleware  │──▶│ Handler │           │
│  │  Input   │   │   Chain    │   │         │           │
│  └──────────┘   └────────────┘   └────┬────┘           │
│                                       │                 │
│                                  ┌────▼────┐            │
│                                  │Presenter│            │
│                                  │ (Egress │            │
│                                  │Firewall)│            │
│                                  └────┬────┘            │
│                                       │                 │
│  ┌────────────────────────────────────▼──────────────┐  │
│  │              MvaTestResult                        │  │
│  │  ┌──────┐ ┌───────────┐ ┌────────┐ ┌───────────┐ │  │
│  │  │ data │ │systemRules│ │uiBlocks│ │rawResponse│ │  │
│  │  └──────┘ └───────────┘ └────────┘ └───────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### What you can audit

| MVA Layer | What FusionTester asserts | SOC2 Relevance |
|---|---|---|
| **Egress Firewall** | Hidden fields (`passwordHash`, `tenantId`) are physically absent from `result.data` | Data leak prevention |
| **OOM Guard** | Zod rejects `take: 10000` before it reaches the handler | Memory exhaustion protection |
| **System Rules** | `result.systemRules` contains the expected domain rules | Deterministic LLM governance |
| **UI Blocks** | SSR blocks (echarts, summaries) are correctly generated | Agent response quality |
| **Middleware** | Auth guards block unauthorized calls, isError is true | Access control verification |
| **Agent Limit** | Collections are truncated at cognitive guardrail bounds | Context window protection |
| **HATEOAS** | `suggestActions` produces correct next-step affordances | Agent navigation safety |

---

## Install

```bash
npm install @vinkius-core/mcp-fusion-testing
```

### Peer Dependencies

| Package | Version |
|---|---|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |

> **Zero runtime dependencies.** The package ships only TypeScript types and one class. Your test runner (Vitest, Jest, Mocha, `node:test`) is your choice.

---

## Quick Start

```typescript
import { describe, it, expect } from 'vitest';
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
import { registry } from './server/registry.js';

const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_enterprise_42',
        role: 'ADMIN',
    }),
});

describe('User MVA Audit', () => {
    it('Egress Firewall strips sensitive fields', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10 });

        expect(result.data[0]).not.toHaveProperty('passwordHash');
        expect(result.data[0]).not.toHaveProperty('tenantId');
        expect(result.data[0].email).toBe('ceo@acme.com');
    });

    it('System rules are injected by Presenter', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });

        expect(result.systemRules).toContain(
            'Data originates from the database via Prisma ORM.'
        );
    });

    it('OOM Guard rejects unbounded queries', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 99999 });
        expect(result.isError).toBe(true);
    });
});
```

---

## API Reference

### `createFusionTester(registry, options)`

Factory function — creates a `FusionTester` instance.

```typescript
function createFusionTester<TContext>(
    registry: ToolRegistry<TContext>,
    options: TesterOptions<TContext>,
): FusionTester<TContext>;
```

| Parameter | Type | Description |
|---|---|---|
| `registry` | `ToolRegistry<TContext>` | Your application's tool registry — the same one wired to the MCP server |
| `options` | `TesterOptions<TContext>` | Configuration object |

### `TesterOptions<TContext>`

```typescript
interface TesterOptions<TContext> {
    contextFactory: () => TContext | Promise<TContext>;
}
```

| Field | Type | Description |
|---|---|---|
| `contextFactory` | `() => TContext \| Promise<TContext>` | Factory that produces the mock context for each call. Inject fake Prisma, auth tokens, tenant IDs here. Supports async (e.g., DB lookup). |

### `tester.callAction(toolName, actionName, args?, overrideContext?)`

Executes a single tool action through the **full MVA pipeline** and returns a decomposed result.

```typescript
async callAction<TArgs>(
    toolName: string,
    actionName: string,
    args?: TArgs,
    overrideContext?: Partial<TContext>,
): Promise<MvaTestResult>;
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `toolName` | `string` | ✅ | The registered tool name (e.g. `'db_user'`, `'analytics'`) |
| `actionName` | `string` | ✅ | The action discriminator (e.g. `'find_many'`, `'create'`) |
| `args` | `object` | ❌ | Arguments for the action — omit the `action` discriminator, FusionTester injects it |
| `overrideContext` | `Partial<TContext>` | ❌ | Per-test context overrides. Shallow-merged with `contextFactory()` output |

### `MvaTestResult<TData>`

Decomposed MVA response — each field maps to a specific pipeline layer.

```typescript
interface MvaTestResult<TData = unknown> {
    data: TData;
    systemRules: readonly string[];
    uiBlocks: readonly unknown[];
    isError: boolean;
    rawResponse: unknown;
}
```

| Field | Type | Source | Description |
|---|---|---|---|
| `data` | `TData` | Presenter Zod schema | Validated data **after** the Egress Firewall. Hidden fields are physically absent. |
| `systemRules` | `string[]` | Presenter `.systemRules()` | JIT domain rules injected by the Presenter. Empty array if no Presenter. |
| `uiBlocks` | `unknown[]` | Presenter `.uiBlocks()` / `.collectionUiBlocks()` | SSR UI blocks (charts, summaries, markdown). Empty array if no Presenter. |
| `isError` | `boolean` | Pipeline | `true` if Zod rejected the input, middleware blocked, or handler returned `error()`. |
| `rawResponse` | `unknown` | Pipeline | The raw MCP `ToolResponse` for protocol-level inspection. |

---

## Cookbook

### Egress Firewall Audit

Verify that the Presenter's Zod schema physically strips sensitive fields:

```typescript
it('strips PII from response', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 5 });

    const users = result.data as Array<Record<string, unknown>>;
    for (const user of users) {
        expect(user).not.toHaveProperty('passwordHash');
        expect(user).not.toHaveProperty('tenantId');
        expect(user).not.toHaveProperty('internalFlags');
    }
});
```

### OOM Guard (Input Validation)

Verify that Zod boundaries reject out-of-range values:

```typescript
it('rejects take > 50 (OOM Guard)', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 10000 });
    expect(result.isError).toBe(true);
});

it('rejects non-integer take', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 3.14 });
    expect(result.isError).toBe(true);
});

it('rejects invalid email format', async () => {
    const result = await tester.callAction('db_user', 'create', {
        email: 'not-an-email', name: 'Test',
    });
    expect(result.isError).toBe(true);
});
```

### Agent Limit (Cognitive Guardrail)

Verify that collections are truncated to prevent context window exhaustion:

```typescript
it('truncates at agentLimit', async () => {
    // Handler returns 100 items, Presenter has agentLimit(20)
    const result = await tester.callAction('analytics', 'list', { limit: 100 });
    expect((result.data as any[]).length).toBe(20);
});

it('shows truncation warning in UI blocks', async () => {
    const result = await tester.callAction('analytics', 'list', { limit: 100 });
    const warning = result.uiBlocks.find((b: any) => b.content?.includes('Truncated'));
    expect(warning).toBeDefined();
});
```

### Middleware Guards (RBAC)

Test authentication and authorization middleware using `overrideContext`:

```typescript
it('blocks GUEST role', async () => {
    const result = await tester.callAction(
        'db_user', 'find_many', { take: 5 },
        { role: 'GUEST' },
    );
    expect(result.isError).toBe(true);
    expect(result.data).toContain('Unauthorized');
});

it('allows ADMIN role', async () => {
    const result = await tester.callAction(
        'db_user', 'find_many', { take: 5 },
        { role: 'ADMIN' },
    );
    expect(result.isError).toBe(false);
});

it('blocks across all actions (not just find_many)', async () => {
    const result = await tester.callAction(
        'db_user', 'create', { email: 'test@co.com', name: 'Test' },
        { role: 'VIEWER' },
    );
    expect(result.isError).toBe(true);
});
```

### System Rules Verification

Assert that the LLM receives correct domain directives:

```typescript
it('injects domain rules from Presenter', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 1 });

    expect(result.systemRules).toContain(
        'Data originates from the database via Prisma ORM.'
    );
    expect(result.systemRules).toContain(
        'Email addresses are PII. Mask when possible.'
    );
});

it('injects contextual rules based on role', async () => {
    const result = await tester.callAction(
        'analytics', 'list', { limit: 1 },
        { role: 'ADMIN' },
    );
    expect(result.systemRules).toContain('User is ADMIN. Show full details.');
});
```

### UI Block Inspection

Verify SSR blocks are generated for client rendering:

```typescript
it('generates collection summary', async () => {
    const result = await tester.callAction('analytics', 'list', { limit: 5 });

    const summary = result.uiBlocks.find((b: any) => b.type === 'summary') as any;
    expect(summary).toBeDefined();
    expect(summary.content).toContain('Total:');
});
```

### Manual `response()` Builder

Test actions that use the `response()` builder directly (without a Presenter):

```typescript
it('extracts rules from manual builder', async () => {
    const result = await tester.callAction('system', 'health');

    expect(result.systemRules).toContain('System is operational.');
    expect(result.data).toEqual({ status: 'healthy', uptime: 42 });
});
```

### Context Override Isolation

Verify that overrides don't leak between test calls:

```typescript
it('isolates context between sequential calls', async () => {
    // Call 1 — GUEST (blocked)
    const r1 = await tester.callAction('db_user', 'find_many', { take: 1 }, { role: 'GUEST' });

    // Call 2 — default ADMIN (succeeds)
    const r2 = await tester.callAction('db_user', 'find_many', { take: 1 });

    expect(r1.isError).toBe(true);
    expect(r2.isError).toBe(false);
});
```

### Async Context Factory

Simulate async DI resolution (e.g., reading JWT from a database):

```typescript
const tester = createFusionTester(registry, {
    contextFactory: async () => {
        const token = await fetchTestToken();
        return {
            prisma: mockPrisma,
            tenantId: token.tenantId,
            role: token.role,
        };
    },
});
```

### Protocol-Level Inspection

Inspect the raw MCP `ToolResponse` for transport-level assertions:

```typescript
it('raw response follows MCP shape', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 1 });
    const raw = result.rawResponse as { content: Array<{ type: string; text: string }> };

    expect(raw.content).toBeInstanceOf(Array);
    expect(raw.content[0].type).toBe('text');
});

it('Symbol metadata is invisible to JSON.stringify', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 1 });
    const json = JSON.stringify(result.rawResponse);

    // Transport layer never sees MVA metadata
    expect(json).not.toContain('systemRules');
    expect(json).not.toContain('mva-meta');
});
```

---

## Architecture

### The Symbol Backdoor

The `FusionTester` runs the **real** execution pipeline — the exact same code path as your production MCP server:

```
ToolRegistry.routeCall()
  → Concurrency Semaphore
    → Discriminator Parsing
      → Zod Input Validation
        → Compiled Middleware Chain
          → Handler Execution
            → PostProcessor (Presenter auto-application)
              → Egress Guard
```

The key insight: `ResponseBuilder.build()` attaches structured MVA metadata via a **global Symbol** (`MVA_META_SYMBOL`). Symbols are ignored by `JSON.stringify`, so the MCP transport never sees them — but the `FusionTester` reads them in RAM.

```typescript
// What the MCP transport sees (JSON.stringify):
{ "content": [{ "type": "text", "text": "{...}" }] }

// What FusionTester reads (Symbol key):
response[Symbol.for('mcp-fusion.mva-meta')] = {
    data: { id: '1', name: 'Alice', email: 'alice@acme.com' },
    systemRules: ['Data from Prisma ORM...'],
    uiBlocks: [{ type: 'summary', content: 'User: Alice' }],
};
```

**No XML regex. No string parsing. Zero coupling to response formatting.**

### Why not reimplement the pipeline?

The tester calls `ToolRegistry.routeCall()` — the same function your production server uses. A reimplemented pipeline would allow tests to pass in the tester but fail in production. Full fidelity means:

- ✅ Concurrency semaphore limits
- ✅ Mutation serialization
- ✅ Abort signal propagation
- ✅ Egress payload guards
- ✅ Zod error formatting
- ✅ Generator result draining

---

## MVA Convention: `tests/` Layer

The testing package introduces a fourth layer to the MVA convention:

```text
src/
├── models/         ← M — Zod schemas
├── views/          ← V — Presenters
├── agents/         ← A — MCP tool definitions
├── index.ts        ← Registry barrel
└── server.ts       ← Server bootstrap
tests/
├── firewall/       ← Egress Firewall assertions
├── guards/         ← Middleware & OOM Guard tests
├── rules/          ← System Rules verification
└── setup.ts        ← Shared tester instance
```

### Recommended `setup.ts`

```typescript
// tests/setup.ts
import { createFusionTester } from '@vinkius-core/mcp-fusion-testing';
import { registry } from '../src/index.js';

export const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_test',
        role: 'ADMIN',
    }),
});
```

### File Naming

| Directory | Suffix | What it tests |
|---|---|---|
| `tests/firewall/` | `.firewall.test.ts` | Presenter Zod filtering (PII, hidden fields) |
| `tests/guards/` | `.guard.test.ts` | Middleware RBAC, OOM limits, input validation |
| `tests/rules/` | `.rules.test.ts` | System rules injection, contextual rules |
| `tests/blocks/` | `.blocks.test.ts` | UI blocks, collection summaries, truncation warnings |

---

## Requirements

- Node.js 18+
- TypeScript 5.7+
- `@vinkius-core/mcp-fusion ^2.0.0`
- `zod ^3.25.1 || ^4.0.0`

## Documentation

Full docs: **[mcp-fusion.vinkius.com](https://mcp-fusion.vinkius.com/)**.
