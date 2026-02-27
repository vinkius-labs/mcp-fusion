# @vinkius-core/mcp-fusion-openapi-gen

> OpenAPI 3.x → **MCP Fusion** Server Generator

[![npm version](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-openapi-gen.svg?style=flat-square&color=0ea5e9)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion-openapi-gen)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square)](../../LICENSE)

Parse any OpenAPI 3.x spec and generate a **complete, ready-to-run MCP Server** powered by **MCP Fusion** — with Presenters, Tools, ToolRegistry, and server bootstrap. All features configurable via YAML.

---

## What It Generates

Given an OpenAPI spec (YAML/JSON), the generator produces:

```
output/
├── models/                # M — Zod schemas (data boundary)
│   ├── pet.schema.ts
│   └── store.schema.ts
├── views/                 # V — createPresenter() (perception layer)
│   ├── pet.presenter.ts
│   └── store.presenter.ts
├── agents/                # A — Agent layer — defineTool()
│   ├── pet.tool.ts
│   └── store.tool.ts
├── server.ts              # MCP Server bootstrap
└── index.ts               # ToolRegistry + registerAll barrel
```

Every file follows the **[MVA Convention](/mva-convention)** — the standard directory structure for **MCP Fusion** projects.

## Installation

```bash
npm install @vinkius-core/mcp-fusion-openapi-gen
```

## Quick Start

### 1. Generate from OpenAPI spec

```bash
npx openapi-gen --input ./petstore.yaml --output ./generated
```

### 2. Run the generated server

```bash
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

That's it — you have a fully functional MCP Server.

## Configuration

Create an `openapi-gen.yaml` file in your project root for full control:

```yaml
# openapi-gen.yaml
input: ./specs/petstore.yaml
output: ./generated

features:
  tags: true              # Add tags to tools
  annotations: true       # Infer readOnly, destructive, idempotent from HTTP method
  presenters: true        # Generate Presenter files with response schemas
  descriptions: true      # Include summaries/descriptions on actions
  toonDescription: false  # Enable TOON-optimized descriptions
  serverFile: true        # Generate server.ts bootstrap
  deprecated: comment     # 'include' | 'skip' | 'comment'

naming:
  style: snake_case       # 'snake_case' | 'camelCase'
  deduplication: true     # Auto-suffix duplicates (_2, _3, ...)

server:
  name: petstore-mcp
  version: 1.0.0
  transport: stdio          # 'stdio' | 'sse'
  toolExposition: flat      # 'flat' | 'grouped' — how the LLM sees your tools
  actionSeparator: '_'      # Flat mode delimiter: pet_get_by_id

context:
  import: '../types.js#AppCtx'  # Custom context type

# Tag filtering
includeTags:
  - pet
  - store
excludeTags:
  - internal
```

Auto-detected when present, or pass explicitly:

```bash
npx openapi-gen --config ./openapi-gen.yaml
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--input <path>` | Path to OpenAPI YAML/JSON spec | From config |
| `--output <dir>` | Output directory | `./generated` |
| `--config <path>` | Path to config file | Auto-detect `openapi-gen.yaml` |
| `--base-url <expr>` | Base URL expression for fetch calls | `ctx.baseUrl` |
| `--server-name <name>` | MCP Server name | `openapi-mcp-server` |
| `--context <import>` | Custom context type import | Default `ApiContext` |

CLI flags override config file values.

## Generated Code Features

### Annotations (from HTTP Method)

```typescript
// GET → readOnly: true
// DELETE → destructive: true
// PUT → idempotent: true
```

### Coerced Path/Query Parameters

```typescript
// Path and query params use z.coerce for safe string-to-type conversion
petId: z.coerce.number().int().describe('ID of pet to return')
```

### Presenter Binding

```typescript
// Each action with a response schema binds to a Presenter
get_pet_by_id: {
    returns: PetPresenter,
    // ...
}
```

### Tag Filtering

Only generate tools for the tags you need:

```yaml
includeTags: [pet]         # Only pet tools
excludeTags: [internal]    # Everything except internal
```

### Custom Context

Inject your own typed context into all tools:

```yaml
context:
  import: '../types.js#AppCtx'
```

Generates:

```typescript
import type { AppCtx } from '../types.js';
const petTools = defineTool<AppCtx>('pet', { ... });
```

## Programmatic API

```typescript
import { parseOpenAPI, mapEndpoints, emitFiles, mergeConfig } from '@vinkius-core/mcp-fusion-openapi-gen';

const spec = parseOpenAPI(yamlString);
const mapped = mapEndpoints(spec);
const config = mergeConfig({ features: { tags: true }, includeTags: ['pet'] });
const files = emitFiles(mapped, config);

for (const file of files) {
    writeFileSync(`./out/${file.path}`, file.content);
}
```

## Pipeline

```
OpenAPI 3.x Spec (YAML/JSON)
        │
        ▼
  ┌─────────────┐
  │ OpenApiParser │  → ApiSpec IR (groups, actions, params, responses)
  └─────────────┘
        │
        ▼
  ┌───────────────┐
  │ EndpointMapper │  → Named actions (snake_case), dedup, annotations
  └───────────────┘
        │
        ▼
  ┌────────────┐
  │ CodeEmitter │  → TypeScript files (Presenters, Tools, Registry, Server)
  └────────────┘
```

## Requirements

- Node.js ≥ 18
- `@vinkius-core/mcp-fusion` ^2.0.0 (peer dependency)
- `zod` ^3.25.1 || ^4.0.0 (peer dependency)

## License

Apache-2.0
