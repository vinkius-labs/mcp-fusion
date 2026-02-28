/**
 * PipelineHooks — Strategy Pattern for Execution Observability
 *
 * Defines the hook interface used to instrument the tool execution
 * pipeline without duplicating the core flow. The fast path passes
 * no hooks (zero overhead); debug and traced paths supply their
 * strategy via factory methods.
 *
 * @module
 */
import { type ToolResponse } from '../response.js';

// ── Hook Interface ───────────────────────────────────────

/**
 * Hooks for observability instrumentation on each pipeline step.
 *
 * Each hook is called at the corresponding step of the execution
 * pipeline: route → resolve → validate → middleware → execute.
 */
export interface PipelineHooks {
    /** When true, runChain rethrows exceptions (traced path handles them). */
    readonly rethrow?: boolean;
    onRouteError?(): void;
    onRouteOk?(action: string): void;
    onResolveError?(action: string): void;
    onValidateError?(action: string, durationMs: number): void;
    onValidateOk?(action: string, durationMs: number): void;
    onMiddleware?(action: string, chainLength: number): void;
    onExecuteOk?(action: string, response: ToolResponse): void;
    onExecuteError?(action: string, err: unknown): void;
    /** Wraps every response before returning (used by traced path for span finalization). */
    wrapResponse?(response: ToolResponse): ToolResponse;
}

// ── Utilities ────────────────────────────────────────────

/**
 * Compute the UTF-8 byte size of a ToolResponse.
 *
 * Sums the byte length of all text content blocks.
 * Uses TextEncoder for UTF-8 accurate byte measurement,
 * consistent with EgressGuard's byte measurement.
 *
 * Used by tracing to record `mcp.response_size` on spans.
 */
const _sizeEncoder = new TextEncoder();

export function computeResponseSize(response: ToolResponse): number {
    let size = 0;
    for (const c of response.content) {
        if ('text' in c && typeof c.text === 'string') size += _sizeEncoder.encode(c.text).byteLength;
    }
    return size;
}

// ── Hook Merging ─────────────────────────────────────────

/**
 * Merge two PipelineHooks into one that calls both in sequence.
 *
 * When both `primary` and `secondary` define the same hook,
 * the merged hook calls `primary` first, then `secondary`.
 *
 * Returns `primary` if `secondary` is undefined (zero allocation).
 *
 * Used to layer telemetry emission on top of debug or traced hooks.
 *
 * @internal
 */
export function mergeHooks(
    primary: PipelineHooks,
    secondary: PipelineHooks | undefined,
): PipelineHooks {
    if (!secondary) return primary;

    const merged: PipelineHooks = {
        rethrow: !!(primary.rethrow || secondary.rethrow),
        onRouteError: () => { primary.onRouteError?.(); secondary.onRouteError?.(); },
        onRouteOk: (a) => { primary.onRouteOk?.(a); secondary.onRouteOk?.(a); },
        onResolveError: (a) => { primary.onResolveError?.(a); secondary.onResolveError?.(a); },
        onValidateError: (a, d) => { primary.onValidateError?.(a, d); secondary.onValidateError?.(a, d); },
        onValidateOk: (a, d) => { primary.onValidateOk?.(a, d); secondary.onValidateOk?.(a, d); },
        onMiddleware: (a, c) => { primary.onMiddleware?.(a, c); secondary.onMiddleware?.(a, c); },
        onExecuteOk: (a, r) => { primary.onExecuteOk?.(a, r); secondary.onExecuteOk?.(a, r); },
        onExecuteError: (a, e) => { primary.onExecuteError?.(a, e); secondary.onExecuteError?.(a, e); },
    };
    if (primary.wrapResponse) {
        merged.wrapResponse = (r) => { const wrapped = primary.wrapResponse!(r); secondary.wrapResponse?.(wrapped); return wrapped; };
    } else if (secondary.wrapResponse) {
        merged.wrapResponse = secondary.wrapResponse;
    }
    return merged;
}

