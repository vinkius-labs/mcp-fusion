# OpenAPI Generator

- [Install](#install)
- [Generated Output](#output)
- [Schema Fidelity — OpenAPI to Strict Zod](#schema-fidelity)
- [Annotation Inference](#annotations)
- [Code Generation Pipeline](#pipeline)
- [Swagger 2.0 Support](#swagger2)
- [Runtime Proxy Mode](#runtime)
- [Full Production Example](#production)
- [Configuration](#config)
- [Exposition Strategy](#exposition)
- [Name Resolution](#naming)
- [Tag Filtering](#tag-filtering)
- [Custom Context](#context)
- [API Reference](#api)
- [Requirements](#requirements)

Turn any **REST/OpenAPI 3.x or Swagger 2.0 spec into a working MCP server** — either by generating typed TypeScript files ahead of time, or by parsing the spec at startup and proxying requests at runtime. 

This is the ultimate **Legacy API Migration strategy for AI Agents**. Whether you need to connect thousands of legacy corporate endpoints to an LLM, or simply want to bridge **Swagger to Claude Desktop**, this generator completely automates the creation of strict MVA architectures, models, and Presenters.

```bash
npx openapi-gen generate -i ./petstore.yaml -o ./generated
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

## Install {#install}

```bash
npm install @vinkius-core/mcp-fusion-openapi-gen
```

Peer dependencies: `@vinkius-core/mcp-fusion` and `zod`.

## Generated Output {#output}

```
generated/
├── models/      ← Zod schemas with .strict() validation
├── views/       ← Presenters with response shaping
├── agents/      ← MCP tool definitions with full annotations
├── index.ts     ← ToolRegistry barrel
└── server.ts    ← Server bootstrap (stdio or SSE)
```

Every file follows the [MVA Convention](./mva-convention).

## Schema Fidelity — OpenAPI to Strict Zod {#schema-fidelity}

The `ZodCompiler` walks every OpenAPI `SchemaNode` and emits strict Zod objects. Path and query parameters get `z.coerce` for automatic string-to-type coercion. Response schemas get `.strict()` to reject undeclared fields at runtime.

```typescript
// models/pet.schema.ts (generated)
export const PetResponseSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    status: z.enum(['available', 'pending', 'sold']).optional(),
}).strict();
```

## Annotation Inference {#annotations}

The `EndpointMapper` reads the HTTP method of each operation and infers the correct MCP annotation:

| HTTP Method | Annotation |
|---|---|
| `GET`, `HEAD`, `OPTIONS` | `readOnly: true` |
| `DELETE` | `destructive: true` |
| `PUT` | `idempotent: true` |
| `POST`, `PATCH` | default |

```typescript
// agents/pet.tool.ts (generated)
export const petTools = defineTool<ApiContext>('pet', {
    annotations: { title: 'Pet' },
    actions: {
        get_by_id: {
            readOnly: true,
            description: 'Find pet by ID',
            returns: PetPresenter,
            params: z.object({
                petId: z.coerce.number().int().describe('ID of pet'),
            }),
            handler: async (ctx, args) => {
                const res = await fetch(`${ctx.baseUrl}/pet/${args.petId}`);
                return res.json();
            },
        },
        delete: {
            destructive: true,
            params: z.object({ petId: z.coerce.number().int() }),
            handler: async (ctx, args) => { /* ... */ },
        },
    },
});
```

## Code Generation Pipeline {#pipeline}

Five compilation stages transform the spec into production-ready TypeScript. Swagger 2.0 specs are auto-converted before processing. Each stage is independently importable:

```typescript
import { parseOpenAPI, mapEndpoints, emitFiles, mergeConfig } from '@vinkius-core/mcp-fusion-openapi-gen';

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

The generated code is fully editable — modify handlers, add middleware, attach Presenters.

## Swagger 2.0 Support {#swagger2}

Swagger 2.0 specs are **automatically detected and converted** to OpenAPI 3.0 internally — no configuration needed. Both the CLI and programmatic API accept v2 specs:

```bash
# Works with legacy Swagger 2.0 specs out of the box
npx openapi-gen generate -i ./petstore-v2.json -o ./generated
```

The internal `Swagger2Converter` handles all structural differences:

| Swagger 2.0 | → OpenAPI 3.0 |
|---|---|
| `host` + `basePath` + `schemes` | `servers` array |
| `definitions` | `components.schemas` |
| `parameters[in: body]` | `requestBody` |
| `parameters[in: formData]` | `requestBody` (multipart/urlencoded) |
| `#/definitions/Model` | `#/components/schemas/Model` |
| `produces` / `consumes` | Per-operation `content` types |

You can also use the converter standalone:

```typescript
import { isSwagger2, convertSwagger2ToV3, parseOpenAPI } from '@vinkius-core/mcp-fusion-openapi-gen';

const raw = JSON.parse(specJson);
if (isSwagger2(raw)) {
    const v3 = convertSwagger2ToV3(raw);
    // v3 is now a valid OpenAPI 3.0 object
}

// Or just pass directly — auto-detected:
const spec = parseOpenAPI(specJson); // works with both v2 and v3
```

## Runtime Proxy Mode {#runtime}

For rapid prototyping, `loadOpenAPI()` parses the spec at startup and creates live proxy handlers with no code generation step. Accepts both OpenAPI 3.x and Swagger 2.0:

```typescript
import { loadOpenAPI } from '@vinkius-core/mcp-fusion-openapi-gen';
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

When the API spec changes, restart the server and the tools update automatically.

## Full Production Example {#production}

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defineTool, ToolRegistry, createServerAttachment } from '@vinkius-core/mcp-fusion';
import { loadOpenAPI } from '@vinkius-core/mcp-fusion-openapi-gen';
import { readFileSync } from 'node:fs';

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

const server = new McpServer({ name: 'petstore-mcp', version: '1.0.0' });
createServerAttachment(server, registry);
await server.connect(new StdioServerTransport());
```

## Configuration {#config}

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

### CLI Flags

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

## Exposition Strategy {#exposition}

| Strategy | Behavior | Best for |
|---|---|---|
| `flat` (default) | Each action = independent MCP tool | Granular control, privilege isolation |
| `grouped` | All actions merge into one tool | Token economy, large APIs |

```yaml
server:
  toolExposition: grouped
  actionSeparator: '_'
```

## Name Resolution {#naming}

| operationId | `snake_case` | `camelCase` |
|---|---|---|
| `getPetById` | `get_pet_by_id` | `getPetById` |
| `findPetsByTags` | `find_pets_by_tags` | `findPetsByTags` |
| `addPet` | `add_pet` | `addPet` |

When `operationId` is missing: `GET /pets` → `list_pets`, `POST /pets` → `create_pets`. Duplicates auto-suffix: `list_pets`, `list_pets_2`.

## Tag Filtering {#tag-filtering}

```yaml
includeTags: [pet, store]
excludeTags: [admin, internal]
```

## Custom Context {#context}

```yaml
context:
  import: '../types.js#AppCtx'
```

```typescript
import type { AppCtx } from '../types.js';
const petTools = defineTool<AppCtx>('pet', { /* handlers receive ctx: AppCtx */ });
```

## API Reference {#api}

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
| `method` | `string` | HTTP method |
| `path` | `string` | URL path template |
| `handler` | `(ctx, args) => Promise<unknown>` | Pre-wired HTTP proxy handler |

### Programmatic API

| Export | Description |
|---|---|
| `parseOpenAPI(input)` | Parse YAML/JSON to `ApiSpec` AST (v2 + v3) |
| `mapEndpoints(spec)` | Apply naming, annotations, dedup |
| `emitFiles(mapped, config)` | Generate TypeScript files |
| `mergeConfig(partial)` | Merge partial config with defaults |
| `loadConfig(path?)` | Load config from YAML file |
| `compileZod(schema)` | Compile a `SchemaNode` to Zod code |
| `loadOpenAPI(input, config)` | Runtime mode — parse + proxy (v2 + v3) |
| `buildHandler(action)` | Build a single HTTP proxy handler |
| `isSwagger2(obj)` | Detect Swagger 2.0 documents |
| `convertSwagger2ToV3(obj)` | Convert Swagger 2.0 → OpenAPI 3.0 |

## Requirements {#requirements}

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| `@vinkius-core/mcp-fusion` | ^2.0.0 (peer) |
| `zod` | ^3.25.1 \|\| ^4.0.0 (peer) |
| `yaml` | ^2.7.0 (bundled) |
