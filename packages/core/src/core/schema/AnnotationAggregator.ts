/**
 * AnnotationAggregator — Tool Annotation Aggregation Strategy
 *
 * Aggregates per-action hints (readOnly, destructive, idempotent)
 * into a single annotation record, with explicit overrides.
 *
 * Pure-function module: no state, no side effects.
 */
import { type InternalAction } from '../types.js';

/** Shape of the aggregated MCP tool annotations */
interface AggregatedAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    [key: string]: unknown;
}

// ── Public API ───────────────────────────────────────────

export function aggregateAnnotations<TContext>(
    actions: readonly InternalAction<TContext>[],
    explicitAnnotations: Record<string, unknown> | undefined,
): Record<string, unknown> {
    const result: AggregatedAnnotations = {};

    // Copy explicit annotations
    if (explicitAnnotations) {
        Object.assign(result, explicitAnnotations);
    }

    // Per-action aggregation (only override if not explicitly set)
    if (result.readOnlyHint === undefined) {
        const allReadOnly = actions.length > 0 &&
            actions.every(a => a.readOnly === true);
        result.readOnlyHint = allReadOnly;
    }

    if (result.destructiveHint === undefined) {
        const anyDestructive = actions.some(a => a.destructive === true);
        result.destructiveHint = anyDestructive;
    }

    if (result.idempotentHint === undefined) {
        const allIdempotent = actions.length > 0 &&
            actions.every(a => a.idempotent === true);
        result.idempotentHint = allIdempotent;
    }

    return result;
}
