<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-openapi-gen</h1>
  <p align="center">
    <strong>OpenAPI 3.x → MCP Fusion Server Generator</strong> — Parse any spec, generate a complete MCP server
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-openapi-gen"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-openapi-gen?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> Parse any OpenAPI 3.x spec and generate a **complete, ready-to-run MCP Server** powered by MCP Fusion — with Presenters, Tools, ToolRegistry, and server bootstrap. All features configurable via YAML.

## What It Generates

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

Every file follows the **MVA Convention** — the standard directory structure for MCP Fusion projects.

## Quick Start

```bash
# 1. Generate from OpenAPI spec
npx openapi-gen --input ./petstore.yaml --output ./generated

# 2. Run the generated server
API_BASE_URL=https://api.example.com npx tsx ./generated/server.ts
```

## Configuration

Create an `openapi-gen.yaml` file in your project root:

```yaml
input: ./specs/petstore.yaml
output: ./generated

features:
  tags: true              # Add tags to tools
  annotations: true       # Infer readOnly, destructive, idempotent from HTTP method
  presenters: true        # Generate Presenter files with response schemas
  descriptions: true      # Include summaries/descriptions on actions
  serverFile: true        # Generate server.ts bootstrap
  deprecated: comment     # 'include' | 'skip' | 'comment'

naming:
  style: snake_case       # 'snake_case' | 'camelCase'
  deduplication: true     # Auto-suffix duplicates

server:
  name: petstore-mcp
  version: 1.0.0
  transport: stdio        # 'stdio' | 'sse'
  toolExposition: flat    # 'flat' | 'grouped'
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--input <path>` | Path to OpenAPI YAML/JSON spec | From config |
| `--output <dir>` | Output directory | `./generated` |
| `--config <path>` | Path to config file | Auto-detect |
| `--base-url <expr>` | Base URL expression for fetch calls | `ctx.baseUrl` |
| `--server-name <name>` | MCP Server name | `openapi-mcp-server` |
| `--context <import>` | Custom context type import | Default `ApiContext` |

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

## Installation

```bash
npm install @vinkius-core/mcp-fusion-openapi-gen
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **MCP Fusion** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE)
