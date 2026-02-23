# MVA Convention

The **MVA Convention** defines how **MCP Fusion** organizes generated code into three architectural layers.

## Structure

```text
generated/
├── models/         ← M — Zod schemas
├── views/          ← V — Presenters
├── agents/         ← A — MCP tool definitions
├── index.ts        ← Registry barrel
└── server.ts       ← Server bootstrap
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

export const PetPresenter = createPresenter()
    .schema(PetResponseSchema)
    .rules('Only show available pets unless explicitly requested')
    .ui(pet => [{ type: 'text', text: `${pet.name} (${pet.status})` }]);
```

- One Presenter per domain entity, shared across all tools
- Encapsulates: schema validation, system rules, UI blocks, cognitive guardrails, agentic affordances
- Imports from `models/` only

### Agent (`agents/`)

Agent-facing interface. MCP tool definitions that the LLM interacts with.

```typescript
// agents/pet.tool.ts
import { PetPresenter } from '../views/pet.presenter.js';

export const petTools = defineTool<ApiContext>('pet', {
    actions: {
        get_by_id: {
            description: 'Get a pet by ID',
            parameters: z.object({ petId: z.coerce.number().int() }),
            returns: PetPresenter,
            handler: async (ctx, params) => { /* ... */ },
        },
    },
});
```

- Wires Models and Views into MCP-compatible tools
- Handlers return raw data — the Presenter handles everything else
- Imports from `views/` only

## Dependency Flow

```text
models/  →  views/  →  agents/  →  index.ts  →  server.ts
```

No layer imports from a layer below it. Models never import Presenters. Views never import Tools.

## File Naming

| Layer | Directory | Suffix | API |
|---|---|---|---|
| Model | `models/` | `.schema.ts` | `z.object()` |
| View | `views/` | `.presenter.ts` | `createPresenter()` |
| Agent | `agents/` | `.tool.ts` | `defineTool()` |

## Header Annotations

Every generated file identifies its layer:

```typescript
// MVA Layer: Model (data boundary)
// MVA Layer: View (perception layer)
// MCP Tool: delivery layer for the Agent
```
