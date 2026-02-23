# OpenAPI Generator

Go from OpenAPI spec to running MCP server in one command.

```bash
npx openapi-gen --input ./petstore.yaml --output ./generated
```

```bash
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

That's it. Full MCP server — typed schemas, validated responses, ready for any LLM.

## What you get

```
generated/
├── models/      ← Zod schemas with .strict() validation
├── views/       ← Presenters with response shaping
├── agents/      ← MCP tool definitions with full annotations
├── index.ts     ← ToolRegistry barrel
└── server.ts    ← Server bootstrap (stdio or SSE)
```

Every file follows the [MVA Convention](./mva-convention). Every pattern is idiomatic **MCP Fusion**.

## Install

::: code-group
```bash [npm]
npm install mcp-fusion-openapi-gen
```
```bash [pnpm]
pnpm add mcp-fusion-openapi-gen
```
```bash [yarn]
yarn add mcp-fusion-openapi-gen
```
:::

## Configuration

Create `openapi-gen.yaml` in your project root. The CLI auto-detects it, or pass `--config <path>`.

```yaml
input: ./specs/petstore.yaml
output: ./generated

features:
  tags: true              # Tag-based tool grouping
  annotations: true       # Infer readOnly / destructive / idempotent
  presenters: true        # Generate Presenter files with Zod schemas
  descriptions: true      # Include OpenAPI summaries on actions
  toonDescription: false  # TOON-optimized descriptions
  serverFile: true        # Generate server.ts bootstrap
  deprecated: comment     # 'include' | 'skip' | 'comment'

naming:
  style: snake_case       # 'snake_case' | 'camelCase'
  deduplication: true     # Auto-suffix duplicates (_2, _3)

server:
  name: petstore-mcp
  version: 1.0.0
  transport: stdio          # 'stdio' | 'sse'
  toolExposition: flat      # 'flat' | 'grouped'
  actionSeparator: '_'      # Flat mode delimiter: pet_get_by_id

context:
  import: '../types.js#AppCtx'

includeTags: [pet, store]
excludeTags: [internal]
```

### CLI flags

```bash
npx openapi-gen [options]
```

| Flag | Default |
|---|---|
| `--input <path>` | From config |
| `--output <dir>` | `./generated` |
| `--config <path>` | Auto-detect |
| `--base-url <expr>` | `ctx.baseUrl` |
| `--server-name <name>` | `openapi-mcp-server` |
| `--context <import>` | Built-in `ApiContext` |

CLI flags override config file values.

## Generated code

### Model — Zod schemas

Every OpenAPI response schema compiles to a strict Zod object:

```typescript
// models/pet.schema.ts
export const PetResponseSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    status: z.enum(['available', 'pending', 'sold']).optional(),
}).strict();
```

Path and query parameters use `z.coerce` for automatic type coercion from strings.

### View — Presenters

Each domain entity gets a Presenter that binds the schema and adds perception rules:

```typescript
// views/pet.presenter.ts
import { PetResponseSchema } from '../models/pet.schema.js';

export const PetPresenter = createPresenter('Pet')
    .schema(PetResponseSchema)
    .systemRules(['Data originates from the Petstore API.']);
```

### Agent — Tool definitions

Tools wire everything together. Annotations are inferred from HTTP methods:

```typescript
// agents/pet.tool.ts
import { PetPresenter } from '../views/pet.presenter.js';

export const petTools = defineTool<ApiContext>('pet', {
    annotations: { title: 'Pet' },
    actions: {
        get_by_id: {
            readOnly: true,        // ← inferred from GET
            description: 'Find pet by ID',
            returns: PetPresenter, // ← auto-bound
            params: z.object({
                petId: z.coerce.number().int().describe('ID of pet'),
            }),
            handler: async (ctx, args) => {
                const res = await fetch(`${ctx.baseUrl}/pet/${args.petId}`);
                return res.json();
            },
        },
    },
});
```

### Automatic annotations

| HTTP Method | Annotation |
|---|---|
| `GET`, `HEAD`, `OPTIONS` | `readOnly: true` |
| `DELETE` | `destructive: true` |
| `PUT` | `idempotent: true` |
| `POST`, `PATCH` | — |

### Exposition strategy

Control how the LLM sees your tools:

| Strategy | Behavior | Best for |
|---|---|---|
| `flat` (default) | Each action = independent MCP tool | Granular control, privilege isolation |
| `grouped` | All actions merge into one tool | Token economy, large APIs |

```yaml
server:
  toolExposition: grouped    # pet_get_by_id → single "pet" tool with action enum
  actionSeparator: '_'
```

### Name resolution

| operationId | `snake_case` | `camelCase` |
|---|---|---|
| `getPetById` | `get_pet_by_id` | `getPetById` |
| `findPetsByTags` | `find_pets_by_tags` | `findPetsByTags` |
| `addPet` | `add_pet` | `addPet` |

When `operationId` is missing: `GET /pets` → `list_pets`, `POST /pets` → `create_pets`.

Duplicates auto-suffix: `list_pets`, `list_pets_2`, `list_pets_3`.

### Tag filtering

Generate only what you need:

```yaml
includeTags: [pet, store]     # Only these tags
excludeTags: [admin, internal] # Everything except these
```

### Custom context

Inject your own typed context:

```yaml
context:
  import: '../types.js#AppCtx'
```

```typescript
// Generated output
import type { AppCtx } from '../types.js';

const petTools = defineTool<AppCtx>('pet', {
    // All handlers receive ctx: AppCtx
});
```

## Programmatic API

```typescript
import { parseOpenAPI, mapEndpoints, emitFiles, mergeConfig } from 'mcp-fusion-openapi-gen';

const spec = parseOpenAPI(yamlString);
const mapped = mapEndpoints(spec);

const config = mergeConfig({
    features: { presenters: true, tags: true },
    server: { name: 'my-server', toolExposition: 'grouped' },
    includeTags: ['pet'],
});

const files = emitFiles(mapped, config);

for (const file of files) {
    writeFileSync(`./out/${file.path}`, file.content);
}
```

## Pipeline

```
OpenAPI 3.x (YAML / JSON)
        │
        ▼
  ┌─────────────┐
  │ OpenApiParser │  Resolves $ref, extracts groups/actions/params/responses
  └──────┬──────┘
         │
         ▼
  ┌───────────────┐
  │ EndpointMapper │  operationId → snake_case, dedup, annotations
  └──────┬────────┘
         │
         ▼
  ┌─────────────┐
  │  ZodCompiler │  SchemaNode → Zod code (coercion, formats, constraints)
  └──────┬──────┘
         │
         ▼
  ┌────────────┐
  │ CodeEmitter │  Generates MVA structure (models/, views/, agents/)
  └────────────┘
```

## Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| `@vinkius-core/mcp-fusion` | ^2.0.0 (peer) |
| `zod` | ^3.25.1 \|\| ^4.0.0 (peer) |
| `yaml` | ^2.7.0 (bundled) |
