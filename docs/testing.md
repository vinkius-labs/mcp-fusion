---
title: "Testing — Deterministic AI Governance"
description: "The end of Vibes-Based Testing. Audit every MVA layer in CI/CD — zero tokens, zero servers, mathematically verifiable."
---

# Testing

::: danger The Only Framework Where PII Protection is Code-Assertable
**MCP Fusion** is the only solution in the market where sensitive data protection (PII Drop) can be **asserted in code** and **formally audited in CI/CD**:

```typescript
// This is not a hope. This is not a visual check. This is a mathematical proof.
expect(result.data).not.toHaveProperty('passwordHash');  // SOC2 CC6.1
expect(result.data).not.toHaveProperty('tenantId');       // Multi-tenant isolation
expect(result.isError).toBe(true);                        // SOC2 CC6.3 — GUEST blocked
expect(result.systemRules).toContain('PII policy');       // Governance directive present
```

The field is **physically absent** from `result.data` — not hidden, not masked, but removed by the Presenter's Zod schema in RAM. `JSON.stringify` cannot leak what doesn't exist. This runs in **2ms**, costs **$0.00**, and produces the **same result on every CI run, on every machine, forever.**
:::

## The End of Vibes-Based Testing

How does a developer test if the Tool he created for Claude works today?

He starts the Node.js server in the terminal, opens Claude Desktop, types "Get user 5", waits 10 seconds for the AI to respond, looks at the screen and says: *"Cool, the password didn't leak. Commit and Deploy."*

The AI industry calls this **"Vibes-Based Testing"** — testing by gut feeling.

**This is unacceptable in Enterprise Software Engineering.**

- You **cannot** put this in a CI/CD pipeline (GitHub Actions).
- You **cannot** spend tokens (money) from the API on unit tests.
- You **cannot** pass a security audit by relying on what the AI *"decided"* to respond.

And yet, today, this is the **only** testing strategy available for MCP servers. Every framework, every SDK, every tutorial ends at `JSON.stringify()` and hopes for the best.

### The Problem is Structural

MCP responses are flat `ToolResponse` objects — an array of `{ type: 'text', text: string }` blocks. Everything is serialized into strings. To assert that a `passwordHash` field was stripped, you would need to:

1. Parse the XML wrapper
2. Find the `<data>` block
3. Parse the JSON inside it
4. Check that the field is absent

That's fragile, format-dependent, and breaks every time the response format evolves. It's not testable. It's not auditable. It's not engineering.

### The Paradigm Shift: Deterministic MVA Auditing

**MCP Fusion** introduces `@vinkius-core/testing` — the first and only framework capable of **mathematically auditing AI Data Governance (SOC2)** in a CI/CD pipeline.

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

The `FusionTester`:

- Runs the **real** execution pipeline in RAM — the exact same code path as production
- Returns **structured** `MvaTestResult` objects — each MVA layer decomposed into its own field
- **Zero tokens consumed.** No LLM calls. No API bills. No network transport.
- **Zero servers.** No HTTP, no stdio, no MCP transport layer.
- **Deterministic.** Same input → same output. Every time. In every CI run. On every machine.

### What You Can Audit

| MVA Layer | What the test asserts | SOC2 / Compliance Relevance |
|---|---|---|
| [**Egress Firewall**](/testing/egress-firewall) | `result.data` has no `passwordHash`, no `tenantId` | Data leak prevention (SOC2 CC6.1) |
| [**OOM Guard**](/testing/oom-guard) | `result.isError === true` when `take: 10000` | Memory exhaustion protection |
| [**System Rules**](/testing/system-rules) | `result.systemRules` contains expected domain directives | Deterministic context control |
| [**UI Blocks**](/testing/ui-blocks) | `result.uiBlocks` produces correct charts/summaries | Response quality assurance |
| [**Middleware Guards**](/testing/middleware-guards) | `result.isError === true` when `role: 'GUEST'` | Access control verification (SOC2 CC6.3) |
| **Agent Limit** | `result.data.length <= 20` even when DB has 10,000 rows | Context window protection |
| **HATEOAS** | `rawResponse` includes `<action_suggestions>` | Agent navigation safety |

::: tip Deterministic ≠ Vibes
Every assertion above is **deterministic** — it does not depend on what any AI model "decides" to do. It depends on what **your code** does. That's the difference between engineering and vibes.
:::

### Before vs After

| | Before (Vibes-Based) | After (FusionTester) |
|---|---|---|
| **How you test** | Open Claude Desktop, type a prompt, read the response | `await tester.callAction('users', 'find_many', { take: 5 })` |
| **What you assert** | "Looks right to me" | `expect(result.data[0]).not.toHaveProperty('passwordHash')` |
| **Cost per test** | ~$0.01–0.05 in API tokens | $0.00 |
| **Duration** | 5–15 seconds (LLM round-trip) | 2ms (in-memory) |
| **CI/CD compatible** | ❌ | ✅ `npx vitest run` |
| **SOC2 auditable** | ❌ | ✅ Mathematical proof |
| **Reproducible** | ❌ LLM responses vary | ✅ Deterministic |

## Install

```bash
npm install @vinkius-core/testing
```

**Zero runtime dependencies.** Only peer dependencies on `@vinkius-core/mcp-fusion` and `zod`.

**Runner agnostic.** Works with Vitest, Jest, Mocha, or Node's native `node:test`. The FusionTester returns plain JS objects — your test runner, your choice.

## 30-Second Example

```typescript
import { describe, it, expect } from 'vitest';
import { createFusionTester } from '@vinkius-core/testing';
import { registry } from './server/registry.js';

const tester = createFusionTester(registry, {
    contextFactory: () => ({
        prisma: mockPrisma,
        tenantId: 't_enterprise_42',
        role: 'ADMIN',
    }),
});

describe('SOC2 Data Governance Audit', () => {
    it('Egress Firewall strips PII before it reaches the LLM', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10 });

        // DETERMINISTIC: passwordHash is physically absent from the response
        for (const user of result.data) {
            expect(user).not.toHaveProperty('passwordHash');
            expect(user).not.toHaveProperty('tenantId');
        }
    });

    it('OOM Guard rejects unbounded queries', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 99999 });
        expect(result.isError).toBe(true);
    });

    it('LLM receives correct domain governance rules', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });

        expect(result.systemRules).toContain(
            'Email addresses are PII. Mask when possible.'
        );
    });

    it('Guest users cannot access admin tools', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'GUEST' },  // ← context override
        );
        expect(result.isError).toBe(true);
        expect(result.data).toContain('Unauthorized');
    });
});
```

**4 tests. 8ms total. Zero tokens. Zero servers. SOC2-grade proof.**

## Architecture: The Symbol Backdoor

The `FusionTester` runs the **real** execution pipeline — the exact same code path as your production MCP server:

```
ToolRegistry.routeCall()
  → Concurrency Semaphore
    → Discriminator Parsing
      → Zod Input Validation
        → Compiled Middleware Chain
          → Handler Execution
            → PostProcessor (Presenter auto-application)
              → Egress Guard (maxPayloadBytes)
```

The key insight: `ResponseBuilder.build()` attaches structured MVA metadata via a **global Symbol** (`MVA_META_SYMBOL`). Symbols are ignored by `JSON.stringify`, so the MCP transport never sees them — but the `FusionTester` reads them in RAM.

```typescript
// What the MCP transport sees (JSON.stringify):
{ "content": [{ "type": "text", "text": "<data>...</data>" }] }

// What FusionTester reads (Symbol key — invisible to transport):
response[Symbol.for('mcp-fusion.mva-meta')] = {
    data: { id: '1', name: 'Alice', email: 'alice@acme.com' },
    systemRules: ['Data from Prisma ORM. Do not infer outside this response.'],
    uiBlocks: [{ type: 'summary', content: 'User: Alice (alice@acme.com)' }],
};
```

**No XML regex. No string parsing. No pipeline reimplementation.**

The FusionTester calls `ToolRegistry.routeCall()` — the same function your production server uses. If we reimplemented the pipeline, tests would pass in the tester but fail in production. Full fidelity means:

- ✅ Zod input validation
- ✅ Compiled middleware chain
- ✅ Concurrency semaphore limits
- ✅ Mutation serialization
- ✅ Abort signal propagation
- ✅ Egress payload guards
- ✅ Agent limit truncation
- ✅ HATEOAS action suggestions

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
