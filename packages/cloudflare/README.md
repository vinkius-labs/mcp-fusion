<p align="center">
  <h1 align="center">@vurb/cloudflare</h1>
  <p align="center">
    <strong>MCP Server on Cloudflare Workers — Vurb.ts</strong> — A framework for creating MCP servers at the edge<br/>
    Deploy MCP servers to Cloudflare Workers · Zero polyfills · Native KV, D1, R2 bindings · Wrangler ready
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/cloudflare"><img src="https://img.shields.io/npm/v/@vurb/cloudflare?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Server on Cloudflare Workers — Vurb.ts**, the Model Context Protocol framework for building production MCP servers. Deploy your MCP server to the global edge: stateless JSON-RPC, cold-start caching, native KV/D1/R2 bindings, zero polyfills, `wrangler deploy` ready.

## Quick Start

```typescript
// src/index.ts (Cloudflare Worker)
import { createCloudflareHandler } from '@vurb/cloudflare';
import { registry } from './registry.js';

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const handler = createCloudflareHandler(registry, {
            contextFactory: () => ({
                db: env.DB,
                kv: env.KV_STORE,
            }),
        });
        return handler(req);
    },
};
```

## Features

| Feature | Description |
|---------|-------------|
| **Zero Polyfills** | Built for the WinterCG runtime, no Node.js shims |
| **Stateless JSON-RPC** | Each request is a standalone invocation, ideal for edge |
| **Cold-Start Caching** | Registry and Zod schemas compiled once per isolate |
| **Native Bindings** | Access KV, D1, R2, and Durable Objects via context |
| **Wrangler Ready** | Deploy with `wrangler deploy` |

## With D1 Database

```typescript
const handler = createCloudflareHandler(registry, {
    contextFactory: (env) => ({
        db: env.DB,          // D1 binding
        cache: env.KV_CACHE, // KV binding
        role: 'ADMIN',
    }),
});
```

## Installation

```bash
npm install @vurb/cloudflare
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `@modelcontextprotocol/sdk` | `^1.12.0` |

## Requirements

- **Cloudflare Workers** (WinterCG runtime)
- **Vurb.ts** ≥ 2.0.0 (peer dependency)
- `wrangler` CLI for deployment

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
