# Quickstart

Your first MCP server with validated input, structured output, and a running transport — in under 5 minutes.

## Install {#install}

::: code-group
```bash [npm]
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [pnpm]
pnpm add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
:::

---

## Create a Fusion Instance {#init}

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const f = initFusion();
```

`initFusion()` without a generic parameter creates a `void` context — no authentication, no shared state. This is the simplest starting point. When you need to pass database connections or user identity to handlers, you'll add a generic parameter (`initFusion<AppContext>()`), but not today.

The `f` object is your entry point for everything: `f.tool()`, `f.presenter()`, `f.middleware()`. All type inference flows from this single call.

---

## Define a Tool {#first-tool}

```typescript
const getWeather = f.tool({
  name: 'weather.get',
  description: 'Get current weather for a city',
  input: z.object({
    city: z.string().describe('City name, e.g. "San Francisco"'),
  }),
  readOnly: true,
  handler: async ({ input }) => {
    return { city: input.city, temp_c: 18, condition: 'Partly cloudy' };
  },
});
```

The `name` follows MCP Fusion's `domain.action` convention — `weather` becomes the tool group, `get` becomes the action. When [tool exposition](/tool-exposition) is set to `flat` (the default), the MCP client sees a single tool called `weather_get`. When set to `grouped`, it sees a `weather` tool with a discriminator parameter.

`input` is a Zod schema. Every field gets validated before the handler runs — if the agent sends `{ city: 42 }`, the handler never executes. The agent receives a structured validation error with the exact field that failed and what was expected.

`readOnly: true` tells the MCP client this tool doesn't modify state. This is an [MCP annotation](https://spec.modelcontextprotocol.io/specification/2024-11-05/server/tools/) — agents and clients use it to decide which tools are safe to call without user confirmation.

The handler returns a plain object. MCP Fusion wraps it in a `success()` response automatically — you don't need to construct `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` yourself.

---

## Register and Attach to a Server {#server}

```typescript
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.register(getWeather);
```

`ToolRegistry` is the central catalog. Every tool you build gets registered here. The registry handles routing — when an MCP call arrives for `weather_get`, it resolves the builder, validates input, runs middleware (if configured), executes the handler, and applies the Presenter (if defined).

```typescript
const server = new McpServer({
  name: 'my-first-server',
  version: '1.0.0',
});

registry.attachToServer(server);
```

`attachToServer()` wires MCP Fusion's registry into the MCP SDK's server. It registers a `tools/list` handler that exposes your tools, and a `tools/call` handler that routes incoming calls through the pipeline. One line replaces all the manual `server.tool()` registrations you'd write in a raw MCP server.

```typescript
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

This starts the server on stdio — the transport that Claude Desktop, Cursor, and most MCP clients expect. The server reads JSON-RPC messages from stdin and writes responses to stdout.

---

## The Complete File {#complete}

Here's everything together — a single file you can copy and run:

```typescript
import { initFusion, ToolRegistry } from '@vinkius-core/mcp-fusion';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const f = initFusion();

const getWeather = f.tool({
  name: 'weather.get',
  description: 'Get current weather for a city',
  input: z.object({
    city: z.string().describe('City name, e.g. "San Francisco"'),
  }),
  readOnly: true,
  handler: async ({ input }) => {
    return { city: input.city, temp_c: 18, condition: 'Partly cloudy' };
  },
});

const registry = new ToolRegistry();
registry.register(getWeather);

const server = new McpServer({
  name: 'my-first-server',
  version: '1.0.0',
});

registry.attachToServer(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

That's 30 lines. You have input validation, structured responses, tool annotations, and a running MCP server.

---

## Test It {#test}

Configure your MCP client to connect to the server. For Claude Desktop, add this to your config:

```json
{
  "mcpServers": {
    "my-first-server": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```

Ask the agent: _"What's the weather in San Francisco?"_ — it will call `weather_get` with `{ city: "San Francisco" }` and receive the structured response.

---

## Where to Go Next {#next-steps}

You have a running MCP server with validated input and structured responses. Here's what to add:

- [Enterprise Quickstart](/enterprise-quickstart) — add authentication, Presenters, and observability in 15 minutes
- [Building Tools](/building-tools) — multiple tools, `defineTool()`, `createTool()`, error handling, validation constraints
- [Presenter Guide](/presenter) — control exactly what the agent sees and what it's told to do next
- [Middleware](/middleware) — authentication, rate limiting, audit logging
