/**
 * Core — Barrel Export
 *
 * Public API for the core tool consolidation engine.
 * Contains only the foundational building blocks: response helpers,
 * result monad, types, builder, registry, schema, execution, and middleware.
 */

// ── Cross-cutting ────────────────────────────────────────
export { success, error, required, toonSuccess, toolError } from './response.js';
export type { ToolResponse, ToolErrorOptions, ErrorCode, ErrorSeverity } from './response.js';
export { succeed, fail } from './result.js';
export type { Result, Success, Failure } from './result.js';

// ── Types & Contracts ────────────────────────────────────
export type {
    ToolBuilder, ActionMetadata,
    InternalAction, MiddlewareFn,
    ActionConfig, StateSyncHint,
} from './types.js';

// ── Builder ──────────────────────────────────────────────
export { GroupedToolBuilder, ActionGroupBuilder, createTool, defineTool } from './builder/index.js';
export { FluentToolBuilder } from './builder/index.js';
export { FluentRouter } from './builder/index.js';
export type { GroupConfigurator, ToolConfig, ActionDef, GroupDef } from './builder/index.js';
export type { SemanticDefaults } from './builder/index.js';

// ── Registry ─────────────────────────────────────────────
export { ToolRegistry } from './registry/index.js';
export type { ToolFilter } from './registry/index.js';

// ── Schema (public strategies) ───────────────────────────
export { generateToonDescription } from './schema/index.js';

// ── Execution (progress streaming + runtime guards) ──────
export { progress } from './execution/index.js';
export type { ProgressEvent, ProgressSink } from './execution/index.js';
export type { ConcurrencyConfig } from './execution/index.js';
export type { EgressConfig } from './execution/index.js';

// ── Sandbox (Zero-Trust Compute Delegation) ──────────────
export type { SandboxConfig, SandboxResult, SandboxErrorCode } from '../sandbox/index.js';

// ── Middleware (context derivation) ──────────────────────
export { defineMiddleware, resolveMiddleware } from './middleware/index.js';
export type { MiddlewareDefinition, MergeContext, InferContextOut } from './middleware/index.js';

// ── Fusion Initializer (tRPC-style) ─────────────────────
export { initFusion } from './initFusion.js';
export type { FusionInstance } from './initFusion.js';

// ── Functional Core ──────────────────────────────────────
export { createGroup } from './createGroup.js';
export type { GroupConfig, GroupAction, CompiledGroup } from './createGroup.js';

// ── Standard Schema ──────────────────────────────────────
export {
    toStandardValidator, fromZodSchema, isStandardSchema, autoValidator,
} from './StandardSchema.js';
export type {
    StandardSchemaV1, StandardSchemaIssue, InferStandardOutput,
    FusionValidator, ValidationResult,
} from './StandardSchema.js';
