// ============================================================================
// mcp-fusion-n8n — Barrel Export
// ============================================================================

// ── Primary API ──
export { createN8nConnector } from './createN8nConnector.js';
export type { N8nConnector } from './createN8nConnector.js';

export { defineN8nTool } from './defineN8nTool.js';

// ── Client ──
export { N8nClient } from './N8nClient.js';
export type { N8nClientConfig } from './N8nClient.js';

// ── Discovery ──
export { WorkflowDiscovery } from './WorkflowDiscovery.js';
export type { DiscoveryOptions } from './WorkflowDiscovery.js';

// ── Schema Inference ──
export { inferSchema } from './SchemaInferrer.js';

// ── Tool Synthesis ──
export { synthesizeTool, synthesizeAll, toToolName } from './ToolSynthesizer.js';
export type { SynthesizedTool, SynthesizedAction } from './ToolSynthesizer.js';

// ── Types ──
export type {
    N8nWorkflow,
    N8nNode,
    N8nTag,
    N8nWebhookResponse,
    N8nConnectorConfig,
    N8nToolConfig,
    WebhookConfig,
    QueryParam,
    ParamDef,
} from './types.js';
