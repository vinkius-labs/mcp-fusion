# n8n Connector

A bidirectional translation driver between n8n's REST API and **MCP Fusion**'s in-memory object model.

When you install this package, you gain **5 engineering primitives** that turn your entire n8n visual automation infrastructure into AI-native tools — without writing a single `fetch()` call, without starting a new server, and without giving up an ounce of control over routing, security, or data governance.

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

---

## Install

::: code-group
```bash [npm]
npm install mcp-fusion-n8n
```
```bash [pnpm]
pnpm add mcp-fusion-n8n
```
```bash [yarn]
yarn add mcp-fusion-n8n
```
:::

**Peer dependencies:** `@vinkius-core/mcp-fusion` and `zod`.

---

## The 5 Engineering Primitives

### 1. Dynamic Ingestion & Zero-Trust Topology

The package connects to n8n's REST API at boot (`GET /api/v1/workflows`) and scans the entire visual infrastructure.

**What it does:** It fetches only active workflows triggered by Webhooks that carry specific release tags (e.g., `includeTags: ['ai-enabled']`). It extracts the webhook URL, the HTTP method, and the workflow ID, compiling everything into `ToolBuilder` instances.

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

**The impact:** The developer doesn't write a single `fetch()`. In a few lines of configuration, existing webhook-based automations (create Jira tickets, send Slack alerts, read SAP orders) become MCP tools accessible to any connected LLM client. And tag filtering ensures the AI never accesses unauthorized internal IT flows — credential rotations, database migrations, admin scripts stay completely invisible.

---

### 2. Semantic Inference — The Hallucination Cure

n8n's Webhook node is structurally blind: it accepts any loose JSON (`Record<string, any>`). If you expose this raw to the LLM, the model hallucinates parameter names, invents fields, and breaks every automation it touches.

**What it does:** The package extracts the **Notes** field (visual annotations) that a human wrote on the n8n canvas and converts it into the `description` field of the generated tool.

```
┌──────────────────────────────────────────────────┐
│  n8n Workflow Canvas                             │
│                                                  │
│  📝 Notes: "Send 'customer_email' and           │
│  'urgency' (low | medium | high) in the body."  │
└──────────────────────────────────────────────────┘
                      ↓
            tool.description = "Send 'customer_email'
            and 'urgency' (low | medium | high)
            in the body."
                      ↓
            Claude reads, understands semantics,
            builds { "customer_email": "john@acme.com",
                     "urgency": "high" }
            ✅ Deterministic. Zero-shot.
```

**The impact:** The marketing team writes in the n8n canvas: *"Send 'customer_email' and 'urgency' in the body"*. The package passes that string to the MCP protocol. The AI reads it, understands the semantics, and builds the JSON payload with **deterministic precision in zero-shot** — bypassing n8n's complete lack of strict typing. No Zod schema required. No developer intervention. The semantic bridge between human intent and machine execution is the workflow's own documentation.

---

### 3. Real-Time MVA Interception — The SOC2 Shield

The package **does not start a server**. It only produces `ToolBuilder` instances. This architectural decision enables **in-memory interception** before the network port is even opened.

**What it does:** The developer iterates over the routes generated from n8n and attaches the Zod Egress Firewall (Presenter) or auth Middleware to sensitive routes — all in process memory.

```typescript
const salesforcePresenter = createPresenter('salesforce_view', {
  shape: (raw) => ({
    name: raw.Name,
    email: raw.Email,
    stage: raw.StageName,
    value: raw.Amount,
    // internal IPs, passwords, debug tokens → dropped
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
    if (!ctx.auth?.hasScope('salesforce:read')) {
      throw new Error('Unauthorized');
    }
    return next();
  });

  registry.register(builder);
}
```

**The impact:** The n8n workflow hits Salesforce and returns a 2MB JSON payload packed with internal IPs, password hashes, and debug tokens. Your Node.js server intercepts this **in RAM** — the Zod Presenter strips every sensitive key (PII Drop) — and the LLM receives only the 5KB of clean, shaped data. The 1.995MB of toxic bytes never cross a network boundary, never reach the AI, never leave your process.

---

### 4. Surgical Construction — `defineN8nTool()`

For critical routes (e.g., *Reverse a Stripe Invoice*), auto-discovery is too permissive for a bank or fintech.

**What it does:** The package exports the `defineN8nTool()` macro. The architect points strictly to the exact workflow ID, writes the input Zod schema by hand (strong typing), and attaches a middleware that requires a manager token.

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
  if (!ctx.headers?.['x-manager-token']) {
    throw new Error('Manager approval required for refunds');
  }
  return next();
});

registry.register(builder);
```

**The impact:** You use n8n purely as a "dumb muscle" — it handles the Stripe API call, the retry logic, the webhook chaining. But the business rules, the strict typing, and the access control remain **hardcoded in your TypeScript backend**. The AI cannot bypass the schema. The AI cannot skip the manager token. The audit trail lives in your Git history, not in n8n's visual editor.

---

### 5. Live State Sync — Infrastructure Hot-Reload

n8n is a living organism. The ops team changes webhook URLs, renames workflows, activates new automations, and deactivates old ones — every week. If your MCP server is static, the contract with the AI breaks within 24 hours.

**What it does:** The package includes a configurable background polling motor (e.g., every 60 seconds) that monitors n8n's REST API.

```typescript
const n8n = await createN8nConnector({
  url: process.env.N8N_URL!,
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  pollInterval: 60_000,
  onChange: () => {
    server.notification({ method: 'notifications/tools/list_changed' });
  },
});

// Graceful shutdown
process.on('SIGTERM', () => { n8n.stop(); process.exit(0); });
```

**The impact:** Someone activates a new `send_twilio_sms` workflow in n8n on Friday at 3 PM. The package detects it, recompiles the `ToolBuilder` in RAM, and fires the official MCP notification `notifications/tools/list_changed`. Claude Desktop refreshes the tool list in real time — **without the developer restarting the Node.js server**. Zero-downtime. Zero-redeployment. The infrastructure hot-reloads itself.

---

## What You Deliver

You deliver a bridge between the low-code world (n8n) and the pro-code world (MCP Fusion).

The package resolves HTTP I/O, route discovery, state synchronization, and LLM semantics. But it returns full control over Routing, Protocol, and Security (MVA) to the developer in `server.ts`.

---

## Full Production Example

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  defineTool, ToolRegistry, createServerAttachment, createPresenter,
} from '@vinkius-core/mcp-fusion';
import { createN8nConnector, defineN8nTool } from 'mcp-fusion-n8n';

// ── Connect to n8n ─────────────────────────────────
const n8n = await createN8nConnector({
  url: process.env.N8N_URL!,
  apiKey: process.env.N8N_API_KEY!,
  includeTags: ['ai-enabled'],
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});

// ── Auto-discover all tagged workflows ─────────────
const registry = new ToolRegistry();

for (const tool of n8n.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}

// ── Surgical: deploy with strict typing ────────────
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

// ── Boot ───────────────────────────────────────────
const server = new McpServer({ name: 'ops-automations', version: '1.0.0' });
createServerAttachment(server, registry);
await server.connect(new StdioServerTransport());

process.on('SIGTERM', () => { n8n.stop(); process.exit(0); });
```

---

## Configuration Reference

### `createN8nConnector(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | n8n instance base URL |
| `apiKey` | `string` | — | n8n REST API key |
| `includeTags` | `string[]` | all | Trust boundary — only expose tagged workflows |
| `excludeTags` | `string[]` | none | Hide workflows with these tags from AI |
| `timeout` | `number` | `30000` | Webhook call timeout (ms) |
| `pollInterval` | `number` | off | Live State Sync polling interval (ms) |
| `onChange` | `() => void` | — | Fires when tool list changes — emit `notifications/tools/list_changed` here |

### `N8nConnector`

| Member | Type | Description |
|--------|------|-------------|
| `tools()` | `SynthesizedTool[]` | Current compiled tool definitions |
| `workflows` | `WebhookConfig[]` | Raw discovered workflow metadata |
| `client` | `N8nClient` | HTTP client — reuse in `defineN8nTool()` |
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
