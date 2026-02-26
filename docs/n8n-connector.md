# n8n Connector

Turn n8n webhook workflows into MCP tools. Tag filtering controls what the AI can see, and Presenters strip sensitive data before it leaves your process.

```typescript
import { createN8nConnector, defineN8nTool } from 'mcp-fusion-n8n';
import { defineTool, ToolRegistry } from '@vinkius-core/mcp-fusion';

const n8n = await createN8nConnector({
  url: process.env.N8N_URL!,
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});

const registry = new ToolRegistry();
for (const tool of n8n.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}
```

## Install

```bash
npm install mcp-fusion-n8n
```

Peer dependencies: `@vinkius-core/mcp-fusion` and `zod`.

## Dynamic Ingestion

`createN8nConnector` connects to n8n's REST API at boot, fetches active workflows triggered by Webhooks matching your `includeTags`, and compiles them into `ToolBuilder` instances. Tag filtering ensures internal flows (credential rotations, database migrations) stay invisible to the AI.

```typescript
const n8n = await createN8nConnector({
  url: 'http://n8n.internal:5678',
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  excludeTags: ['internal-ops'],
});

for (const tool of n8n.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}
```

## Semantic Inference

n8n's Webhook node accepts loose JSON (`Record<string, any>`). The package extracts the **Notes** field from the n8n canvas and uses it as the tool's `description`. The LLM reads that description and builds the correct payload without a Zod schema.

A workflow note like *"Send 'customer_email' and 'urgency' (low | medium | high) in the body"* becomes the tool description. Claude reads it, understands the semantics, and sends `{ "customer_email": "john@acme.com", "urgency": "high" }` — zero-shot, deterministic.

## MVA Interception

The package produces `ToolBuilder` instances, not a server. Attach Presenters and middleware before registration:

```typescript
const salesforcePresenter = createPresenter('salesforce_view', {
  shape: (raw) => ({
    name: raw.Name,
    email: raw.Email,
    stage: raw.StageName,
    value: raw.Amount,
  }),
});

for (const tool of n8n.tools()) {
  const builder = defineTool(tool.name, {
    ...tool.config,
    actions: {
      execute: {
        ...tool.config.actions.execute,
        presenter: salesforcePresenter,
      },
    },
  });

  builder.use(async (ctx, next) => {
    if (!ctx.auth?.hasScope('salesforce:read')) throw new Error('Unauthorized');
    return next();
  });

  registry.register(builder);
}
```

The n8n workflow returns a 2MB Salesforce payload. The Presenter strips it to 5KB of clean data in RAM. Sensitive fields never reach the transport layer.

## Surgical Construction

For critical routes where auto-discovery is too permissive, use `defineN8nTool()` with strict typing:

```typescript
const refund = defineN8nTool('refund_invoice', n8n.client, {
  workflowId: 15,
  webhookPath: '/webhook/refund',
  method: 'POST',
  description: 'Reverse a Stripe invoice. Requires finance manager approval.',
  params: {
    invoice_id: 'string',
    reason: {
      type: 'string',
      enum: ['duplicate', 'fraudulent', 'requested_by_customer'],
      description: 'Refund reason code (required by compliance)',
    },
    amount_cents: {
      type: 'number',
      description: 'Partial refund amount in cents. Omit for full refund.',
    },
  },
  annotations: { destructiveHint: true },
  tags: ['finance', 'stripe'],
});

const builder = defineTool(refund.name, refund.config);
builder.use(async (ctx, next) => {
  if (!ctx.headers?.['x-manager-token']) throw new Error('Manager approval required');
  return next();
});
registry.register(builder);
```

n8n handles the Stripe API call and retry logic. Business rules, typing, and access control stay in your TypeScript backend.

## Live State Sync

Background polling detects workflow changes and fires `notifications/tools/list_changed` so the LLM client refreshes automatically:

```typescript
const n8n = await createN8nConnector({
  url: process.env.N8N_URL!,
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});

process.on('SIGTERM', () => { n8n.stop(); process.exit(0); });
```

## Full Production Example

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defineTool, ToolRegistry, createServerAttachment } from '@vinkius-core/mcp-fusion';
import { createN8nConnector, defineN8nTool } from 'mcp-fusion-n8n';

const n8n = await createN8nConnector({
  url: process.env.N8N_URL!,
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});

const registry = new ToolRegistry();
for (const tool of n8n.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}

const deploy = defineN8nTool('deploy_staging', n8n.client, {
  workflowId: 23,
  webhookPath: '/webhook/deploy',
  description: 'Deploy a branch to the staging environment.',
  params: {
    branch: 'string',
    environment: { type: 'string', enum: ['staging', 'production'] },
  },
  annotations: { destructiveHint: true },
});
registry.register(defineTool(deploy.name, deploy.config));

const server = new McpServer({ name: 'ops-automations', version: '1.0.0' });
createServerAttachment(server, registry);
await server.connect(new StdioServerTransport());

process.on('SIGTERM', () => { n8n.stop(); process.exit(0); });
```

## Configuration Reference

### `createN8nConnector(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | n8n instance base URL |
| `apiKey` | `string` | — | n8n REST API key |
| `includeTags` | `string[]` | all | Only expose tagged workflows |
| `excludeTags` | `string[]` | none | Hide workflows with these tags |
| `timeout` | `number` | `30000` | Webhook call timeout (ms) |
| `pollInterval` | `number` | off | Polling interval for live sync (ms) |
| `onChange` | `() => void` | — | Fires when tool list changes |

### `N8nConnector`

| Member | Type | Description |
|--------|------|-------------|
| `tools()` | `SynthesizedTool[]` | Current compiled tool definitions |
| `workflows` | `WebhookConfig[]` | Raw discovered workflow metadata |
| `client` | `N8nClient` | HTTP client for `defineN8nTool()` |
| `refresh()` | `Promise<boolean>` | Manual poll; returns `true` if list changed |
| `stop()` | `void` | Stop background polling |

### `defineN8nTool(name, client, config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workflowId` | `number` | — | Exact workflow ID |
| `webhookPath` | `string` | — | Webhook endpoint path |
| `method` | `string` | `'POST'` | HTTP method |
| `description` | `string` | auto | Tool description for the LLM |
| `params` | `Record<string, ParamDef>` | `{}` | Strict parameter schema |
| `annotations` | `object` | auto | `readOnlyHint`, `destructiveHint` |
| `tags` | `string[]` | `[]` | Tool tags |

### `ParamDef`

```typescript
// Shorthand
{ email: 'string' }

// Full definition
{
  status: {
    type: 'string',
    enum: ['open', 'closed', 'pending'],
    description: 'Filter by ticket status',
  }
}
```
