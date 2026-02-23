# OpenAPI Generator

A compile-time and runtime translation driver between any OpenAPI 3.x specification and **MCP Fusion**'s in-memory object model.

When you install this package, you gain **4 engineering primitives** that turn any REST API into AI-native MCP tools — either by generating typed TypeScript files ahead of time, or by parsing the spec at startup and proxying HTTP calls at runtime.

```bash
npx openapi-gen generate -i ./petstore.yaml -o ./generated
```

```bash
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

That's it. Full MCP server — strict Zod schemas, Presenter-shaped responses, annotation-aware actions, ready for any LLM.

---

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

**Peer dependencies:** `@vinkius-core/mcp-fusion` and `zod`.

---

## What You Get

```
generated/
├── models/      ← Zod schemas with .strict() validation
├── views/       ← Presenters with response shaping
├── agents/      ← MCP tool definitions with full annotations
├── index.ts     ← ToolRegistry barrel
└── server.ts    ← Server bootstrap (stdio or SSE)
```

Every file follows the [MVA Convention](./mva-convention). Every pattern is idiomatic **MCP Fusion** — Model (Zod), View (Presenter), Agent (Tool handler).

---

## The 4 Engineering Primitives

### 1. Schema Fidelity — OpenAPI to Strict Zod

OpenAPI response schemas are loose JSON Schema objects. If you expose them raw to the LLM, the model invents fields, misses required constraints, and sends malformed payloads.

**What it does:** The `ZodCompiler` walks every OpenAPI `SchemaNode` and emits strict Zod objects. Path and query parameters get `z.coerce` for automatic string-to-type coercion. Response schemas get `.strict()` so the Presenter rejects undeclared fields at runtime.

```typescript
// models/pet.schema.ts (generated)
export const PetResponseSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    status: z.enum(['available', 'pending', 'sold']).optional(),
}).strict();
```

**The impact:** Every generated schema enforces the same contract the API itself enforces. The LLM cannot hallucinate a `petName` field — Zod rejects it with a per-field correction prompt. Path params like `petId` are automatically coerced from the string the LLM sends to the `number` the API expects.

---

### 2. Annotation Inference — HTTP Semantics to MCP Annotations

The MCP spec defaults `destructiveHint` to `true` — every tool is assumed dangerous unless proven otherwise. If you don't annotate correctly, the LLM client will block or warn on every call, including reads.

**What it does:** The `EndpointMapper` reads the HTTP method of each operation and infers the correct MCP annotation:

| HTTP Method | Annotation |
|---|---|
| `GET`, `HEAD`, `OPTIONS` | `readOnly: true` |
| `DELETE` | `destructive: true` |
| `PUT` | `idempotent: true` |
| `POST`, `PATCH` | — (default) |

```typescript
// agents/pet.tool.ts (generated)
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
        delete: {
            destructive: true,     // ← inferred from DELETE
            params: z.object({ petId: z.coerce.number().int() }),
            handler: async (ctx, args) => { /* ... */ },
        },
    },
});
```

**The impact:** Claude Desktop, Cursor, and every MCP client that respects annotations will allow `GET` calls silently and prompt for confirmation on `DELETE` calls. No manual annotation needed — the HTTP method is the source of truth.

---

### 3. Code Generation Pipeline — Parse → Map → Compile → Emit

For production deployments where you need full control over the generated code, the CLI emits a complete MVA project.

**What it does:** Four compilation stages transform the spec into production-ready TypeScript:

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

Each stage is independently importable for programmatic use:

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

**The impact:** The generated code is fully editable. You can modify handlers, add middleware, attach Presenters, and wire concurrency limits. The generated code is the starting point, not a black box.

---

### 4. Runtime Proxy Mode — Zero Code Generation <Badge type="tip" text="v2.0.0" />

For rapid prototyping or APIs where the spec itself is the contract, `loadOpenAPI()` parses the spec at startup and creates live proxy handlers — no code generation step.

**What it does:** The `HttpHandlerFactory` builds handler functions that interpolate path params, append query params, attach JSON bodies, and proxy the request to the real API. Each handler returns the parsed JSON response directly.

```typescript
import { loadOpenAPI } from 'mcp-fusion-openapi-gen';
import { defineTool, ToolRegistry } from '@vinkius-core/mcp-fusion';

const tools = loadOpenAPI(specYaml, {
    baseUrl: 'https://api.example.com',
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
});

const registry = new ToolRegistry();
for (const tool of tools) {
    registry.register(defineTool(tool.name, {
        description: tool.description,
        actions: Object.fromEntries(
            tool.actions.map(a => [a.name, {
                description: a.description,
                readOnly: a.method === 'GET',
                handler: async (ctx, args) => a.handler(ctx, args),
            }])
        ),
    }));
}
```

**The impact:** You point `loadOpenAPI()` at a spec file and get a working MCP server in under 10 lines. No generated files to commit, no build step, no code to maintain. The spec itself is the single source of truth. When the API spec changes, restart the server and the tools update automatically.

---

## Full Production Example

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    defineTool, ToolRegistry, createServerAttachment, createPresenter,
} from '@vinkius-core/mcp-fusion';
import { loadOpenAPI, defineN8nTool } from 'mcp-fusion-openapi-gen';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

// ── Option A: Runtime Proxy Mode ───────────────────
const specYaml = readFileSync('./petstore.yaml', 'utf-8');
const tools = loadOpenAPI(specYaml, {
    baseUrl: process.env.API_BASE_URL!,
    headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
});

const registry = new ToolRegistry();

for (const tool of tools) {
    const builder = defineTool(tool.name, {
        description: tool.description,
        actions: Object.fromEntries(
            tool.actions.map(a => [a.name, {
                description: a.description,
                readOnly: a.method === 'GET',
                destructive: a.method === 'DELETE',
                handler: async (ctx, args) => a.handler(ctx, args),
            }])
        ),
    });
    registry.register(builder);
}

// ── Boot ───────────────────────────────────────────
const server = new McpServer({ name: 'petstore-mcp', version: '1.0.0' });
createServerAttachment(server, registry);
await server.connect(new StdioServerTransport());
```

---

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

---

## Exposition Strategy

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

---

## Name Resolution

| operationId | `snake_case` | `camelCase` |
|---|---|---|
| `getPetById` | `get_pet_by_id` | `getPetById` |
| `findPetsByTags` | `find_pets_by_tags` | `findPetsByTags` |
| `addPet` | `add_pet` | `addPet` |

When `operationId` is missing: `GET /pets` → `list_pets`, `POST /pets` → `create_pets`.

Duplicates auto-suffix: `list_pets`, `list_pets_2`, `list_pets_3`.

---

## Tag Filtering

Generate only what you need:

```yaml
includeTags: [pet, store]     # Only these tags
excludeTags: [admin, internal] # Everything except these
```

---

## Custom Context

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

---

## Configuration Reference

### `loadOpenAPI(input, config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL for API calls |
| `headers` | `Record<string, string>` | `{}` | Default headers sent with every request |
| `fetchFn` | `typeof fetch` | `globalThis.fetch` | Custom fetch function |

### `RuntimeTool`

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Tool name (from OpenAPI tag) |
| `description` | `string` | Tool description |
| `actions` | `RuntimeAction[]` | Compiled action definitions |

### `RuntimeAction`

| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Action name (from operationId) |
| `description` | `string` | OpenAPI summary |
| `method` | `string` | HTTP method (GET, POST, etc.) |
| `path` | `string` | URL path template |
| `handler` | `(ctx, args) => Promise<unknown>` | Pre-wired HTTP proxy handler |

### Programmatic API

| Export | Description |
|---|---|
| `parseOpenAPI(input)` | Parse YAML/JSON to `ApiSpec` AST |
| `mapEndpoints(spec)` | Apply naming, annotations, dedup |
| `emitFiles(mapped, config)` | Generate TypeScript files |
| `mergeConfig(partial)` | Merge partial config with defaults |
| `loadConfig(path?)` | Load config from YAML file |
| `compileZod(schema)` | Compile a `SchemaNode` to Zod code |
| `loadOpenAPI(input, config)` | Runtime mode — parse + proxy |
| `buildHandler(action)` | Build a single HTTP proxy handler |

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| `@vinkius-core/mcp-fusion` | ^2.0.0 (peer) |
| `zod` | ^3.25.1 \|\| ^4.0.0 (peer) |
| `yaml` | ^2.7.0 (bundled) |
