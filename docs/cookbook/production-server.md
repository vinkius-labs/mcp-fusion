# Production Server

::: info Prerequisites
Install Vurb.ts before following this recipe: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Set up a production Vurb server with stdio transport, graceful shutdown, and Vinkius Cloud deployment."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Set up a production Vurb server with stdio transport, graceful shutdown, and Vinkius Cloud deployment.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Set+up+a+production+Vurb+server+with+stdio+transport%2C+graceful+shutdown%2C+and+Vinkius+Cloud+deployment." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Set+up+a+production+Vurb+server+with+stdio+transport%2C+graceful+shutdown%2C+and+Vinkius+Cloud+deployment." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">DEPLOY ANYWHERE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">One registry. Every platform.<br><span style="color:rgba(255,255,255,0.25)">Stdio, HTTP, Edge, Serverless.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The same `ToolRegistry` runs on Stdio, HTTP/SSE, Vinkius Cloud, Vercel, Cloudflare Workers, and AWS Lambda — unchanged. The recommended path: `vurb deploy`.</div>
</div>

## Vinkius Cloud — Recommended {#vinkius-cloud}

The fastest path to production. `vurb deploy` publishes your server to Vinkius Cloud's global edge with built-in DLP, kill switch, audit logging, and a managed MCP token:

```bash
vurb deploy
```

That's it. No Dockerfile, no CI/CD pipeline, no infrastructure to manage. Share the connection token with any MCP client — Cursor, Claude Desktop, Claude Code, Windsurf, Cline, VS Code + Copilot — and they connect instantly.

```bash
# Deploy with a custom name
vurb deploy --name my-production-api

# Deploy to a specific environment
vurb deploy --env production
```

[Learn more about Vinkius Cloud →](https://docs.vinkius.com/getting-started)

> [!TIP]
> Install the [Vinkius extension](https://marketplace.visualstudio.com/items?itemName=vinkius.cloud-extension) to manage your servers directly from VS Code, Cursor, or Windsurf. Every server shows up in the sidebar with a full dashboard — live connections, requests, P95 latency, DLP intercepts, token management, tool toggling, logs, and deployment history.

## Stdio Transport {#stdio}

The simplest deployment. The MCP client spawns your server as a child process:

```typescript
import { ToolRegistry } from '@vurb/core';
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
import { ToolRegistry } from '@vurb/core';
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
import { ToolRegistry } from '@vurb/core';

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