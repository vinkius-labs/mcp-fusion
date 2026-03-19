# OpenAPI Generator

<a href="https://www.npmjs.com/package/@vurb/openapi-gen"><img src="https://img.shields.io/npm/v/@vurb/openapi-gen?color=blue" alt="npm" /></a>

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Generate a complete MCP server from our petstore.yaml OpenAPI spec — with strict Zod models, Presenters, annotations, and a server.ts bootstrap."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Generate a complete MCP server from our petstore.yaml OpenAPI spec — with strict Zod models, Presenters, annotations, and a server.ts bootstrap.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Generate+a+complete+MCP+server+from+our+petstore.yaml+OpenAPI+spec+%E2%80%94+with+strict+Zod+models%2C+Presenters%2C+annotations%2C+and+a+server.ts+bootstrap." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Generate+a+complete+MCP+server+from+our+petstore.yaml+OpenAPI+spec+%E2%80%94+with+strict+Zod+models%2C+Presenters%2C+annotations%2C+and+a+server.ts+bootstrap." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">LEGACY API MIGRATION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Any REST API → MCP Server.<br><span style="color:rgba(255,255,255,0.25)">OpenAPI 3.x and Swagger 2.0.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Turn any OpenAPI spec into a working MCP server — either by generating typed TypeScript files ahead of time, or by parsing the spec at startup and proxying requests at runtime. The ultimate Legacy API Migration strategy for AI Agents.</div>
</div>

```bash
npx openapi-gen generate -i ./petstore.yaml -o ./generated
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

## Install {#install}

```bash
npm install @vurb/openapi-gen
```

Peer dependencies: `Vurb.ts` and `zod`.

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
import { parseOpenAPI, mapEndpoints, emitFiles, mergeConfig } from '@vurb/openapi-gen';

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
import { isSwagger2, convertSwagger2ToV3, parseOpenAPI } from '@vurb/openapi-gen';

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
import { loadOpenAPI } from '@vurb/openapi-gen';
import { defineTool, ToolRegistry } from '@vurb/core';

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
import { defineTool, ToolRegistry, createServerAttachment } from '@vurb/core';
import { loadOpenAPI } from '@vurb/openapi-gen';
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
| `Vurb.ts` | ^2.0.0 (peer) |
| `zod` | ^3.25.1 \|\| ^4.0.0 (peer) |
| `yaml` | ^2.7.0 (bundled) |

## Other Generators & Connectors {#other-generators}

| Generator | Guide |
|---|---|
| Auto-generate MCP tools from Prisma schema | [Prisma Generator](/prisma-gen) |
| Bridge n8n workflows as MCP tools | [n8n Connector](/n8n-connector) |
| Type-safe tRPC-style client for MCP tools | [FusionClient](/fusion-client) |

