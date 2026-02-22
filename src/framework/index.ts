/**
 * Framework — Barrel Export
 *
 * Public API for the MCP Tool Consolidation Framework.
 * All exports are re-exported from bounded context modules.
 */

// ── Cross-cutting ────────────────────────────────────────
export { success, error, required, toonSuccess, toolError } from './response.js';
export type { ToolResponse, ToolErrorOptions } from './response.js';
export { succeed, fail } from './result.js';
export type { Result, Success, Failure } from './result.js';

// ── Types & Contracts ────────────────────────────────────
export type {
    ToolBuilder, ActionMetadata,
    InternalAction, MiddlewareFn,
    ActionConfig,
} from './types.js';

// ── Builder ──────────────────────────────────────────────
export { GroupedToolBuilder, ActionGroupBuilder, createTool, defineTool } from './builder/index.js';
export type { GroupConfigurator, ToolConfig, ActionDef, GroupDef } from './builder/index.js';
export type {
    ParamDef, ParamsMap, InferParams,
    StringParamDef, NumberParamDef, BooleanParamDef,
    EnumParamDef, ArrayParamDef,
} from './builder/index.js';

// ── Registry ─────────────────────────────────────────────
export { ToolRegistry } from './registry/index.js';
export type { ToolFilter } from './registry/index.js';
export type { AttachOptions, DetachFn } from './server/index.js';

// ── Schema (public strategies) ───────────────────────────
export { generateToonDescription } from './schema/index.js';

// ── Progress (streaming) ─────────────────────────────────
export { progress } from './execution/index.js';
export type { ProgressEvent, ProgressSink } from './execution/index.js';

// ── Middleware (context derivation) ──────────────────────
export { defineMiddleware, resolveMiddleware } from './middleware/index.js';
export type { MiddlewareDefinition, MergeContext, InferContextOut } from './middleware/index.js';

// ── Client (type-safe tRPC-style) ────────────────────────
export { createFusionClient, createTypedRegistry } from './client/index.js';
export type { FusionClient, FusionTransport, RouterMap, InferRouter, TypedToolRegistry } from './client/index.js';
