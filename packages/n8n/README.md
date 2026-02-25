# mcp-fusion-n8n

A bidirectional translation driver: **n8n REST API ↔ MCP In-Memory Objects**.

Install this package and you gain **5 engineering primitives** that turn your entire n8n automation infrastructure into AI-native tools.

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

## The 5 Primitives

### 1. Dynamic Ingestion & Zero-Trust Topology
Connects to n8n at boot (`GET /api/v1/workflows`), scans the visual infrastructure, fetches only active webhook-triggered flows with release tags, and compiles them into `ToolBuilder` instances.

**The impact:** The developer writes zero `fetch()` calls. In 3 lines, 400 legacy automations (Jira, Slack, SAP) become native tools for Claude. Tag filtering guarantees the AI never accesses unauthorized internal flows.

### 2. Semantic Inference — The Hallucination Cure
n8n webhooks accept any loose JSON. The package extracts the **Notes** field from the workflow canvas and injects it as the tool `description`.

**The impact:** The ops team writes *"Send 'customer_email' and 'urgency' in the body"* in n8n. The AI reads it, understands the semantics, and builds correct JSON with **deterministic precision in zero-shot** — bypassing n8n's complete lack of strict typing.

### 3. Real-Time MVA Interception — The SOC2 Shield
The package produces `ToolBuilder` instances, not a server. You attach Presenters (Zod Egress Firewall) and auth Middleware to sensitive routes — **in RAM, before the port opens**.

**The impact:** n8n returns 2MB of raw Salesforce JSON packed with internal IPs and passwords. Your Zod Presenter strips every sensitive key. The LLM receives 5KB of clean data. **Absolute data governance.**

### 4. Surgical Construction — `defineN8nTool()`
For critical routes (Stripe refunds, production deploys), `defineN8nTool()` points to the exact workflow ID, enforces hand-written input schemas, and attaches authorization middleware.

**The impact:** n8n is "dumb muscle". The business rules, strict typing, and security stay **hardcoded in your TypeScript backend**.

### 5. Live State Sync — Infrastructure Hot-Reload
Background polling motor monitors n8n every N seconds. On change, recompiles `ToolBuilder` in RAM and fires `notifications/tools/list_changed`.

**The impact:** Ops activates a new workflow on Friday at 3 PM. Within 60 seconds, Claude has it — without restarting the Node.js server. **Zero-downtime.**

## What You Deliver

A **fiber-optic cable** between the low-code world (n8n) and the pro-code world (**MCP Fusion**). The package resolves HTTP I/O, route discovery, state synchronization, and LLM semantics. But it returns **100% of the control** over Routing, Protocol, and Security (MVA) to the developer in `server.ts`.

The perfect balance between the insane agility of low-code integrations and hardcore software engineering.

## Install

```bash
npm install mcp-fusion-n8n @vinkius-core/mcp-fusion zod
```

## Documentation

Full docs with configuration reference and production examples: [mcp-fusion.vinkius.com/n8n-connector](https://mcp-fusion.vinkius.com/n8n-connector).
