<p align="center">
  <h1 align="center">@vurb/testing</h1>
  <p align="center">
    <strong>MCP Server Testing Framework — Vurb.ts</strong> — A framework for testing MCP servers in-memory<br/>
    Full MVA pipeline · Egress Firewall audit · PII redaction checks · Middleware guards · Vitest · Jest · Mocha
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/testing"><img src="https://img.shields.io/npm/v/@vurb/testing?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero Dependencies" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Server Testing Framework — Vurb.ts**, the Model Context Protocol framework for building production MCP servers. In-memory MVA lifecycle emulator — runs the full execution pipeline without network transport. Zero runtime dependencies. Runner agnostic (Vitest, Jest, Mocha, `node:test`).

## Why

Every MCP server today is tested with HTTP mocks, raw `JSON.stringify` assertions, and string matching. That's like testing a REST API by reading TCP packets.

**Vurb.ts** applications have **five auditable layers** (Zod Validation → Middleware Chain → Handler → Presenter Egress Firewall → System Rules). The `VurbTester` lets you assert each layer independently, in-memory, without starting a server.

```
┌─────────────────────────────────────────────────────────┐
│                    VurbTester                          │
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

## What You Can Audit

| MVA Layer | What VurbTester asserts | SOC2 Relevance |
|---|---|---|
| **Egress Firewall** | Hidden fields (`passwordHash`, `tenantId`) are physically absent from `result.data` | Data leak prevention |
| **OOM Guard** | Zod rejects `take: 10000` before it reaches the handler | Memory exhaustion protection |
| **System Rules** | `result.systemRules` contains the expected domain rules | Deterministic LLM governance |
| **UI Blocks** | SSR blocks (echarts, summaries) are correctly generated | Agent response quality |
| **Middleware** | Auth guards block unauthorized calls, isError is true | Access control verification |
| **Agent Limit** | Collections are truncated at cognitive guardrail bounds | Context window protection |
| **HATEOAS** | `suggestActions` produces correct next-step affordances | Agent navigation safety |

## Quick Start

```typescript
import { describe, it, expect } from 'vitest';
import { createVurbTester } from '@vurb/testing';
import { registry } from './server/registry.js';

const tester = createVurbTester(registry, {
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

## API Reference

### `createVurbTester(registry, options)`

Factory function — creates a `VurbTester` instance.

```typescript
function createVurbTester<TContext>(
    registry: ToolRegistry<TContext>,
    options: TesterOptions<TContext>,
): VurbTester<TContext>;
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
| `args` | `object` | ❌ | Arguments for the action — omit the `action` discriminator |
| `overrideContext` | `Partial<TContext>` | ❌ | Per-test context overrides. Shallow-merged with `contextFactory()` output |

### `MvaTestResult<TData>`

Decomposed MVA response — each field maps to a specific pipeline layer.

| Field | Type | Source | Description |
|---|---|---|---|
| `data` | `TData` | Presenter Zod schema | Validated data **after** the Egress Firewall. Hidden fields are physically absent. |
| `systemRules` | `string[]` | Presenter `.systemRules()` | JIT domain rules injected by the Presenter. Empty array if no Presenter. |
| `uiBlocks` | `unknown[]` | Presenter `.uiBlocks()` | SSR UI blocks (charts, summaries, markdown). Empty array if no Presenter. |
| `isError` | `boolean` | Pipeline | `true` if Zod rejected, middleware blocked, or handler returned `error()`. |
| `rawResponse` | `unknown` | Pipeline | The raw MCP `ToolResponse` for protocol-level inspection. |

## Cookbook

### Egress Firewall Audit

```typescript
it('strips PII from response', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 5 });

    const users = result.data as Array<Record<string, unknown>>;
    for (const user of users) {
        expect(user).not.toHaveProperty('passwordHash');
        expect(user).not.toHaveProperty('tenantId');
    }
});
```

### Middleware Guards (RBAC)

```typescript
it('blocks GUEST role', async () => {
    const result = await tester.callAction(
        'db_user', 'find_many', { take: 5 },
        { role: 'GUEST' },
    );
    expect(result.isError).toBe(true);
});

it('allows ADMIN role', async () => {
    const result = await tester.callAction(
        'db_user', 'find_many', { take: 5 },
        { role: 'ADMIN' },
    );
    expect(result.isError).toBe(false);
});
```

### Agent Limit (Cognitive Guardrail)

```typescript
it('truncates at agentLimit', async () => {
    const result = await tester.callAction('analytics', 'list', { limit: 100 });
    expect((result.data as any[]).length).toBe(20);
});
```

### Protocol-Level Inspection

```typescript
it('raw response follows MCP shape', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 1 });
    const raw = result.rawResponse as { content: Array<{ type: string; text: string }> };

    expect(raw.content).toBeInstanceOf(Array);
    expect(raw.content[0].type).toBe('text');
});
```

## How It Works

The `VurbTester` runs the **real** execution pipeline — the exact same code path as your production MCP server:

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

The key insight: `ResponseBuilder.build()` attaches structured MVA metadata via a **global Symbol** (`MVA_META_SYMBOL`). Symbols are ignored by `JSON.stringify`, so the MCP transport never sees them — but the `VurbTester` reads them in RAM.

**No XML regex. No string parsing. Zero coupling to response formatting.**

## Installation

```bash
npm install @vurb/testing
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **TypeScript** 5.7+
- **Vurb.ts** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
