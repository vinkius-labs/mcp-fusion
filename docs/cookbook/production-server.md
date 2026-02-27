# Production Server

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Stdio Transport](#stdio)
- [HTTP/SSE Transport](#sse)
- [Cloudflare Workers](#cloudflare)
- [Vercel Edge Functions](#vercel)
- [Graceful Shutdown](#shutdown)

## Introduction {#introduction}

MCP Fusion tools are transport-agnostic — the same registry works with Stdio, HTTP/SSE, WebSocket, and edge runtimes. This page covers production deployment patterns for each transport.

## Stdio Transport {#stdio}

The simplest deployment. The MCP client spawns your server as a child process:

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.registerAll(...tools);

const server = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    db: getDatabaseClient(),
    tenantId: 'default',
  }),
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/server.ts"]
    }
  }
}
```

## HTTP/SSE Transport {#sse}

For remote servers accessible over the network:

```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

const app = express();
const sessions = new Map<string, SSEServerTransport>();

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  sessions.set(transport.sessionId, transport);

  const server = new McpServer({ name: 'my-server', version: '1.0.0' });
  registry.attachToServer(server, {
    contextFactory: async (extra) => ({
      db: getDatabaseClient(),
      tenantId: req.headers['x-tenant-id'] ?? 'default',
    }),
  });

  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sessions.get(sessionId);
  if (transport) await transport.handlePostMessage(req, res);
});

app.listen(3000);
```

## Cloudflare Workers {#cloudflare}

See the full [Cloudflare Adapter](/cloudflare-adapter) guide. Quick start:

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpAgent } from 'agents/mcp';

const registry = new ToolRegistry();
registry.registerAll(...tools);

export class MyMcpAgent extends McpAgent {
  server = new McpServer({ name: 'cf-server', version: '1.0.0' });

  async init() {
    registry.attachToServer(this.server, {
      contextFactory: async () => ({
        db: getDatabaseClient(this.env),
      }),
    });
  }
}
```

## Vercel Edge Functions {#vercel}

See the full [Vercel Adapter](/vercel-adapter) guide. Quick start:

```typescript
import { createMcpHandler } from '@vercel/mcp-adapter';
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry();
registry.registerAll(...tools);

export const GET = createMcpHandler(
  (server) => {
    registry.attachToServer(server, {
      contextFactory: async () => ({
        db: getDatabaseClient(),
      }),
    });
  },
  {},
  { basePath: '/api/mcp', maxDuration: 60 },
);
```

## Graceful Shutdown {#shutdown}

Handle `SIGTERM` and `SIGINT` for clean shutdown in containerized environments:

```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await server.close();
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Interrupted, shutting down...');
  await server.close();
  await db.$disconnect();
  process.exit(0);
});
```

> [!IMPORTANT]
> In Docker and Kubernetes, the entrypoint must handle signals. Use `exec` form in Dockerfile: `CMD ["node", "dist/server.js"]` (not `CMD node dist/server.js`).