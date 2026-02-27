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
