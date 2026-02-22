/**
 * ProgressHelper — Streaming Progress Support for Async Generators
 *
 * Enables tool handlers to report incremental progress via `yield`,
 * hiding the underlying MCP progress notification protocol.
 *
 * When no server is attached, progress events are silently consumed.
 * When attached, each yielded progress object is sent as a
 * `notifications/progress` packet to the MCP client.
 *
 * @example
 * ```typescript
 * handler: async function* (ctx, args) {
 *     yield progress(10, 'Cloning repository...');
 *     const files = await clone(args.url);
 *
 *     yield progress(50, 'Building AST...');
 *     const ast = buildAST(files);
 *
 *     return success(ast);
 * }
 * ```
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A progress notification emitted via `yield` in a generator handler.
 *
 * @see {@link progress} for the factory function
 */
export interface ProgressEvent {
    readonly __brand: 'ProgressEvent';
    /** Completion percentage (0–100) */
    readonly percent: number;
    /** Human-readable status message */
    readonly message: string;
}

/**
 * Callback that receives progress events during generator execution.
 * By default, a no-op. The server attachment injects a real implementation
 * that forwards to MCP `notifications/progress`.
 */
export type ProgressSink = (event: ProgressEvent) => void;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a progress event to yield from a generator handler.
 *
 * @param percent - Completion percentage (0–100)
 * @param message - Human-readable status message
 * @returns A {@link ProgressEvent} to be yielded
 *
 * @example
 * ```typescript
 * handler: async function* (ctx, args) {
 *     yield progress(10, 'Starting...');
 *     // ... work ...
 *     yield progress(90, 'Almost done...');
 *     return success('Done');
 * }
 * ```
 */
export function progress(percent: number, message: string): ProgressEvent {
    return { __brand: 'ProgressEvent', percent, message };
}

/**
 * Type guard to check if a yielded value is a ProgressEvent.
 * @internal
 */
export function isProgressEvent(value: unknown): value is ProgressEvent {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__brand' in value &&
        (value as ProgressEvent).__brand === 'ProgressEvent'
    );
}
