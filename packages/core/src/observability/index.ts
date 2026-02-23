/**
 * Observability — Barrel Export
 *
 * Public API for debug observers and OpenTelemetry-compatible tracing.
 */

// ── Debug Observer ───────────────────────────────────────
export { createDebugObserver } from './DebugObserver.js';
export type {
    DebugEvent, DebugObserverFn,
    RouteEvent, ValidateEvent, MiddlewareEvent, ExecuteEvent, ErrorEvent,
} from './DebugObserver.js';

// ── Tracing (OpenTelemetry-compatible) ───────────────────
export { SpanStatusCode } from './Tracing.js';
export type { FusionSpan, FusionTracer, FusionAttributeValue } from './Tracing.js';
