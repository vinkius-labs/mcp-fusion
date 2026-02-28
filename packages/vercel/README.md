<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-vercel</h1>
  <p align="center">
    <strong>Vercel Adapter</strong> — Deploy MCP Fusion servers as Next.js route handlers or Vercel Functions
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-vercel"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-vercel?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> Vercel adapter for MCP Fusion. Deploy your MCP server as a Next.js App Router route handler or standalone Vercel Function — Edge Runtime or Node.js, stateless JSON-RPC, zero config.

## Quick Start (Next.js App Router)

```typescript
// app/api/mcp/route.ts
import { createVercelHandler } from '@vinkius-core/mcp-fusion-vercel';
import { registry } from '@/server/registry';

const handler = createVercelHandler(registry, {
    contextFactory: () => ({
        db: prisma,
        role: 'ADMIN',
    }),
});

export const POST = handler;
```

## Features

| Feature | Description |
|---------|-------------|
| **App Router Native** | Works as a Next.js route handler (`app/api/mcp/route.ts`) |
| **Edge Runtime** | Deploy to Vercel Edge Functions for global low-latency |
| **Node.js Runtime** | Full Node.js support for Prisma, file system, etc. |
| **Stateless JSON-RPC** | Each request is a standalone invocation |
| **Zero Config** | `vercel deploy` and it works |

## Edge Runtime

```typescript
// app/api/mcp/route.ts
export const runtime = 'edge';

const handler = createVercelHandler(registry, {
    contextFactory: () => ({
        kv: process.env.KV_REST_API_URL,
    }),
});

export const POST = handler;
```

## Installation

```bash
npm install @vinkius-core/mcp-fusion-vercel
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |
| `@modelcontextprotocol/sdk` | `^1.12.0` |

## Requirements

- **Next.js 14+** (App Router) or standalone Vercel Functions
- **MCP Fusion** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE)
