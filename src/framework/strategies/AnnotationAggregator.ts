/**
 * AnnotationAggregator — Tool Annotation Aggregation Strategy
 *
 * Aggregates per-action hints (readOnly, destructive, idempotent)
 * into a single annotation record, with explicit overrides.
 *
 * Pure-function module: no state, no side effects.
 */
import { type InternalAction } from './Types.js';

// ── Public API ───────────────────────────────────────────

export function aggregateAnnotations<TContext>(
    actions: readonly InternalAction<TContext>[],
    explicitAnnotations: Record<string, unknown> | undefined,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Copy explicit annotations
    if (explicitAnnotations) {
        Object.assign(result, explicitAnnotations);
    }

    // Per-action aggregation (only override if not explicitly set)
    if (explicitAnnotations?.readOnlyHint === undefined) {
        const allReadOnly = actions.length > 0 &&
            actions.every(a => a.readOnly === true);
        result.readOnlyHint = allReadOnly;
    }

    if (explicitAnnotations?.destructiveHint === undefined) {
        const anyDestructive = actions.some(a => a.destructive === true);
        result.destructiveHint = anyDestructive;
    }

    if (explicitAnnotations?.idempotentHint === undefined) {
        const allIdempotent = actions.length > 0 &&
            actions.every(a => a.idempotent === true);
        result.idempotentHint = allIdempotent;
    }

    return result;
}
