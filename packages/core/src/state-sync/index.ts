/**
 * State Sync — Public API
 *
 * Epistemic cache-control layer for MCP tool routing.
 * Prevents LLM Temporal Blindness and Causal State Drift via
 * RFC 7234 semantics and coarse-grained causal domain invalidation.
 *
 * **Consumer API:**
 * - {@link StateSyncConfig} — Configuration type (passed to `attachToServer`)
 * - {@link StateSyncLayer} — Orchestrator (used internally by ServerAttachment)
 *
 * Pure functions and PolicyEngine are exported for advanced use cases
 * (custom pipelines, testing) but are not needed for standard usage.
 *
 * @see {@link StateSyncLayer} for the orchestration facade
 * @see {@link StateSyncConfig} for configuration options
 *
 * @module
 */

// ── Orchestrator (primary export) ────────────────────────
export { StateSyncLayer } from './StateSyncLayer.js';
export { StateSyncBuilder, PolicyBuilder } from './StateSyncBuilder.js';

// ── Configuration Types ──────────────────────────────────
export type {
    CacheDirective,
    SyncPolicy,
    StateSyncConfig,
    ResolvedPolicy,
    InvalidationEvent,
    ResourceNotification,
} from './types.js';

// ── Infrastructure (advanced usage) ──────────────────────
export { PolicyEngine } from './PolicyEngine.js';
export { matchGlob } from './GlobMatcher.js';
export { detectOverlaps } from './PolicyValidator.js';
export type { OverlapWarning } from './PolicyValidator.js';
