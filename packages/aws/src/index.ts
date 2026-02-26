// ============================================================================
// mcp-fusion-aws — Barrel Export
// ============================================================================

// ── Primary API ──
export { createAwsConnector } from './createAwsConnector.js';
export type { AwsConnector } from './createAwsConnector.js';

export { defineAwsTool } from './defineAwsTool.js';

// ── Client & Adapters ──
export { AwsClient, createLambdaAdapter, createSfnAdapter } from './AwsClient.js';
export type {
    LambdaAdapter, SfnAdapter,
    AwsSdkClientLike,
    LambdaFunctionSummary, SfnStateMachineSummary,
} from './AwsClient.js';

// ── Discovery ──
export { LambdaDiscovery } from './LambdaDiscovery.js';
export type { LambdaDiscoveryOptions } from './LambdaDiscovery.js';

export { StepFunctionDiscovery } from './StepFunctionDiscovery.js';
export type { SfnDiscoveryOptions } from './StepFunctionDiscovery.js';

// ── Tool Synthesis ──
export {
    synthesizeLambdaTools, synthesizeStepFunctionTools,
    synthesizeAll, toToolName,
} from './ToolSynthesizer.js';
export type { SynthesizedToolConfig, SynthesizedAction } from './ToolSynthesizer.js';

// ── Types ──
export type {
    AwsLambdaConfig,
    AwsStepFunctionConfig,
    LambdaInvokeResult,
    SfnSyncResult,
    SfnAsyncResult,
    AwsConnectorConfig,
    AwsToolConfig,
} from './types.js';

export { MCP_TAGS, DEFAULT_TAG_FILTER, DEFAULT_ACTION_NAME } from './types.js';
