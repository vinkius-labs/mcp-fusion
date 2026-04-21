# @vurb/yaml

> **Declarative MCP Server Engine** — define tools, resources, and prompts in `vurb.yaml`. The docker-compose for MCP servers.

[![npm](https://img.shields.io/npm/v/@vurb/yaml.svg)](https://www.npmjs.com/package/@vurb/yaml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

## What is this?

Write a single `vurb.yaml` file and get a fully compliant MCP server — with tools, resources, prompts — **zero TypeScript required**.

```yaml
# vurb.yaml
version: "1.0"

server:
  name: "github-tools"

connections:
  github:
    type: rest
    base_url: "https://api.github.com"
    auth:
      type: bearer
      token: "${SECRETS.GITHUB_TOKEN}"

secrets:
  GITHUB_TOKEN:
    label: "GitHub Personal Access Token"
    type: api_key
    required: true
    sensitive: true

tools:
  - name: search_repos
    description: "Search GitHub repositories"
    instruction: "Use for finding open-source projects by topic or keyword."
    rules:
      - "Max 10 results per query"
    parameters:
      query: { type: string, required: true, description: "Search query" }
    execute:
      connection: github
      method: GET
      path: "/search/repositories"
      query: { q: "{{query}}", per_page: "10" }
    response:
      extract: ["items[].{full_name, description, stargazers_count, html_url}"]
```

```bash
vurb yaml dev             # → MCP server running on stdio
vurb yaml validate        # → validates your manifest
```

## Installation

```bash
npm install @vurb/yaml
```

## CLI

```bash
# Validate a manifest
vurb yaml validate
vurb yaml validate ./path/to/vurb.yaml

# Start a local dev server (stdio)
vurb yaml dev

# Start with Streamable HTTP transport
vurb yaml dev --transport http --port 3001
```

## Programmatic API

```typescript
import { loadYamlServer, createYamlMcpServer } from '@vurb/yaml';
import { readFileSync } from 'fs';

// 1. Parse, validate, and compile the YAML
const compiled = await loadYamlServer(
    readFileSync('vurb.yaml', 'utf-8'),
);

// 2. Create a real MCP server
const { server, close } = await createYamlMcpServer(compiled, {
    transport: 'stdio',  // or 'http'
});
```

## Specification

### Server

```yaml
version: "1.0"

server:
  name: "my-server"
  description: "What this server does"
  capabilities:
    tools: true
    resources: true
    prompts: true
  instructions: |
    System-level instructions for the AI agent.
```

### Secrets

Environment variables resolved at runtime via `process.env[KEY]`.

```yaml
secrets:
  API_KEY:
    label: "API Key"
    type: api_key       # api_key | oauth_token | email | password | custom
    required: true
    sensitive: true      # masked in logs
```

### Connections

Named HTTP clients with auth and headers.

```yaml
connections:
  api:
    type: rest
    base_url: "https://api.example.com/v1"
    auth:
      type: bearer          # bearer | basic | custom
      token: "${SECRETS.API_KEY}"
    headers:
      Accept: "application/json"
```

### Tools — The Trichotomy

Every tool has three semantic layers:

| Field | Purpose | MCP Mapping |
|---|---|---|
| `description` | Short summary | `tools/list` → `description` |
| `instruction` | Detailed how-to-use | Mapped to `custom_description` |
| `rules` | Hard constraints | Mapped to `system_rules[]` |

```yaml
tools:
  - name: create_ticket
    description: "Creates a Jira ticket"
    instruction: |
      Use when the user needs IT access, equipment, or VPN setup.
      Create one ticket per request type.
    rules:
      - "Never create duplicate tickets"
      - "Priority 'highest' only for C-level executives"
    tag: tickets
    annotations:
      readOnlyHint: false
    parameters:
      title: { type: string, required: true }
      priority:
        type: string
        enum: [low, medium, high]
        default: medium
    execute:
      connection: jira
      method: POST
      path: "/issue"
      body:
        fields:
          summary: "{{title}}"
          priority: { name: "{{priority}}" }
    response:
      extract: ["id", "key"]
```

### Resources

```yaml
resources:
  - name: "Company Manual"
    uri: "docs://manual"
    mime_type: "text/markdown"
    execute:
      type: static
      content: "# Manual\nWelcome."

  - name: "Live Data"
    uri: "data://metrics"
    execute:
      type: connection
      connection: api
      method: GET
      path: "/metrics"
```

### Prompts

```yaml
prompts:
  - name: "welcome_email"
    description: "Generates a welcome email"
    arguments:
      name: { type: string, required: true }
      role: { type: string, required: true }
    messages:
      - role: user
        content: "Write a welcome email for {{name}} ({{role}})."
```

### Settings (Vinkius Cloud only)

These are parsed but **not enforced** by the open-source engine. They activate when deployed to [Vinkius Cloud](https://vinkius.com).

```yaml
settings:
  dlp:
    enabled: true
    patterns: ["*.cpf", "*.salary"]
  finops:
    enabled: true
    max_array_items: 25
  circuit_breaker:
    threshold: 5
    reset_seconds: 60
```

## Architecture

```
vurb.yaml → Parser → Validator → Compiler → MCP Server
                                     │
                                     ├── ToolCompiler      → tools/list, tools/call
                                     ├── ResourceCompiler   → resources/list, resources/read
                                     ├── PromptCompiler     → prompts/list, prompts/get
                                     └── ResponseTransformer → dot-path extraction
```

**Open-source** (`@vurb/yaml`): Local execution via `BasicToolExecutor` — plain `fetch()`, no guards.

**[Vinkius Cloud](https://vinkius.com)**: Enterprise execution with DLP redaction, SSRF protection, circuit breakers, FinOps token economy, and encrypted secret vault.

## License

Apache 2.0 — see [LICENSE](./LICENSE).
