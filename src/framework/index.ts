/**
 * Framework — Barrel Export
 *
 * Public API for the MCP Tool Consolidation Framework.
 * All exports are re-exported from bounded context modules.
 */

// ── Cross-cutting ────────────────────────────────────────
export { success, error, required, toonSuccess } from './response.js';
export type { ToolResponse } from './response.js';
export { succeed, fail } from './result.js';
export type { Result, Success, Failure } from './result.js';

// ── Types & Contracts ────────────────────────────────────
export type {
    ToolBuilder, ActionMetadata,
    InternalAction, MiddlewareFn,
    ActionConfig,
} from './types.js';

// ── Builder ──────────────────────────────────────────────
export { GroupedToolBuilder, ActionGroupBuilder } from './builder/index.js';
export type { GroupConfigurator } from './builder/index.js';

// ── Registry ─────────────────────────────────────────────
export { ToolRegistry } from './registry/index.js';
export type { ToolFilter } from './registry/index.js';
export type { AttachOptions, DetachFn } from './server/index.js';

// ── Schema (public strategies) ───────────────────────────
export { generateToonDescription } from './schema/index.js';
