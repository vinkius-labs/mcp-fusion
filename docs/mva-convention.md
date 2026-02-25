# MVA Convention

The **MVA Convention** defines how **MCP Fusion** organizes generated code into three architectural layers, plus a **testing layer** for pipeline verification.

## Structure

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
├── blocks/         ← UI Blocks & truncation tests
└── setup.ts        ← Shared FusionTester instance
```

## Layers

### Model (`models/`)

Pure data contracts. Zod schemas that validate input and filter output.

```typescript
// models/pet.schema.ts
export const PetResponseSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    status: z.enum(['available', 'pending', 'sold']),
}).strict();
```

- Imports only `zod` — zero framework dependencies
- Security boundary — `.strict()` rejects undeclared fields
- One file per OpenAPI tag

### View (`views/`)

Perception layer. Presenters that shape how the Agent perceives domain data.

```typescript
// views/pet.presenter.ts
import { PetResponseSchema } from '../models/pet.schema.js';

export const PetPresenter = definePresenter({
    name: 'Pet',
    schema: PetResponseSchema,
    autoRules: true,
    systemRules: ['Only show available pets unless explicitly requested'],
    uiBlocks: (pet) => [{ type: 'text', text: `${pet.name} (${pet.status})` }],
});
```

- One Presenter per domain entity, shared across all tools
- Encapsulates: schema validation, system rules, UI blocks, cognitive guardrails, agentic affordances
- Imports from `models/` only

### Agent (`agents/`)

Agent-facing interface. MCP tool definitions that the LLM interacts with.

```typescript
// agents/pet.tool.ts
import { PetPresenter } from '../views/pet.presenter.js';

const f = initFusion<ApiContext>();

export const getPet = f.tool({
    name: 'pet.get_by_id',
    description: 'Get a pet by ID',
    input: z.object({ petId: z.coerce.number().int() }),
    returns: PetPresenter,
    handler: async ({ input, ctx }) => { /* ... */ },
});
```

- Wires Models and Views into MCP-compatible tools
- Handlers return raw data — the Presenter handles everything else
- Imports from `views/` only

### Tests (`tests/`)

Pipeline verification. Uses `@vinkius-core/mcp-fusion-testing` to audit each MVA layer independently.

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

```typescript
// tests/firewall/pet.firewall.test.ts
import { tester } from '../setup.js';

it('strips internal fields from Pet response', async () => {
    const result = await tester.callAction('pet', 'get_by_id', { petId: 1 });
    expect(result.data).not.toHaveProperty('internalFlags');
});
```

- Four subdirectories: `firewall/`, `guards/`, `rules/`, `blocks/`
- One shared `setup.ts` with the `FusionTester` instance
- Imports from `agents/` (via the registry barrel) only

## Dependency Flow

```text
models/  →  views/  →  agents/  →  index.ts  →  server.ts
                                       ↓
                                    tests/
```

No layer imports from a layer below it. Models never import Presenters. Views never import Tools. Tests import only the registry barrel.

## File Naming

| Layer | Directory | Suffix | API |
|---|---|---|---|
| Model | `models/` | `.schema.ts` | `z.object()` |
| View | `views/` | `.presenter.ts` | `definePresenter()` |
| Agent | `agents/` | `.tool.ts` | `f.tool()` |
| Test — Firewall | `tests/firewall/` | `.firewall.test.ts` | `tester.callAction()` |
| Test — Guards | `tests/guards/` | `.guard.test.ts` | `tester.callAction()` |
| Test — Rules | `tests/rules/` | `.rules.test.ts` | `tester.callAction()` |
| Test — Blocks | `tests/blocks/` | `.blocks.test.ts` | `tester.callAction()` |

## Header Annotations

Every generated file identifies its layer:

```typescript
// MVA Layer: Model (data boundary)
// MVA Layer: View (perception layer)
// MCP Tool: delivery layer for the Agent
// MVA Test: pipeline verification
```

