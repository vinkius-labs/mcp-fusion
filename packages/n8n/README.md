<p align="center">
  <h1 align="center">@vurb/n8n</h1>
  <p align="center">
    <strong>MCP Tools from n8n Workflows — Vurb.ts</strong> — A framework for creating MCP servers from n8n automations<br/>
    Auto-discover n8n workflows as MCP tools · Live hot-reload · Semantic inference · Zero-downtime sync
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/n8n"><img src="https://img.shields.io/npm/v/@vurb/n8n?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Tools from n8n Workflows — Vurb.ts**, the Model Context Protocol framework for building production MCP servers. A bidirectional translation driver: **n8n REST API ↔ MCP In-Memory Objects**. Drop this package in and your entire n8n automation infrastructure becomes AI-native MCP tools.

## Quick Start

```typescript
const n8n = await createN8nConnector({
  url: process.env.N8N_URL!,
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});

for (const tool of n8n.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}
```

## Features

| Feature | Description |
|---------|-------------|
| **Dynamic Ingestion** | Connects at boot, scans n8n, fetches active webhook flows with release tags, compiles to `ToolBuilder` instances |
| **Semantic Inference** | Extracts the Notes field from the workflow canvas and injects it as the tool description — zero-shot precision |
| **MVA Interception** | Produces `ToolBuilder` instances (not a server). Attach Presenters and auth Middleware in RAM |
| **Surgical Construction** | `defineN8nTool()` points to an exact workflow ID with hand-written Zod schemas and auth middleware |
| **Live State Sync** | Background polling recompiles tools on change and fires `notifications/tools/list_changed` — zero-downtime hot-reload |

## How It Works

The package resolves HTTP I/O, route discovery, state synchronization, and LLM semantics. But it returns **100% of the control** over Routing, Protocol, and Security (MVA) to the developer in `server.ts`.

The perfect balance between the agility of low-code integrations and hardcore software engineering.

## Installation

```bash
npm install @vurb/n8n vurb zod
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `zod` | `^3.25.1 \|\| ^4.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **Vurb.ts** ≥ 2.0.0 (peer dependency)
- n8n instance with API access enabled

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
