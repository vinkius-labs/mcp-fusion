<p align="center">
  <h1 align="center">@vurb/vercel</h1>
  <p align="center">
    <strong>MCP Server on Vercel — Vurb.ts</strong> — A framework for creating MCP servers on Vercel<br/>
    Deploy MCP servers as Next.js App Router handlers · Edge Runtime · Node.js runtime · Zero config
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/vercel"><img src="https://img.shields.io/npm/v/@vurb/vercel?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Server on Vercel — Vurb.ts**, the Model Context Protocol framework for building production MCP servers. Deploy your MCP server as a Next.js App Router route handler or standalone Vercel Function — Edge Runtime or Node.js, stateless JSON-RPC, `vercel deploy` and it works.

## Quick Start (Next.js App Router)

```typescript
// app/api/mcp/route.ts
import { createVercelHandler } from '@vurb/vercel';
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
npm install @vurb/vercel
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `@modelcontextprotocol/sdk` | `^1.12.0` |

## Requirements

- **Next.js 14+** (App Router) or standalone Vercel Functions
- **Vurb.ts** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
