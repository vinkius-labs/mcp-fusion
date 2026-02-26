/**
 * DebugObserver — Zero-Overhead Observability for MCP Fusion
 *
 * Provides structured, typed debug events emitted at each stage of
 * the execution pipeline. When disabled (the default), there is
 * ZERO runtime overhead — no conditionals in the hot path.
 *
 * Design principles:
 * - Pure function observer (no class hierarchy)
 * - Discriminated union events (exhaustive switch possible)
 * - Immutable event payloads (readonly)
 * - Opt-in: only active when explicitly enabled
 *
 * @example
 * ```typescript
 * import { createDebugObserver } from '@vinkius-core/mcp-fusion';
 *
 * // Default: pretty console.debug output
 * const debug = createDebugObserver();
 *
 * // Custom handler (e.g. send to telemetry)
 * const debug = createDebugObserver((event) => {
 *     telemetry.track(event.type, event);
 * });
 *
 * // Attach to registry
 * registry.attachToServer(server, {
 *     contextFactory: createContext,
 *     debug,
 * });
 * ```
 *
 * @module
 */

// ============================================================================
// Event Types (Discriminated Union)
// ============================================================================

/**
 * Emitted when an incoming MCP call is routed to a tool builder.
 * This is the first event in the pipeline — before any validation.
 */
export interface RouteEvent {
    readonly type: 'route';
    readonly tool: string;
    readonly action: string;
    readonly timestamp: number;
}

/**
 * Emitted after argument validation (pass or fail).
 * Contains timing information for the Zod schema execution.
 */
export interface ValidateEvent {
    readonly type: 'validate';
    readonly tool: string;
    readonly action: string;
    readonly valid: boolean;
    /** Validation error message if `valid` is false */
    readonly error?: string;
    /** Milliseconds spent in Zod validation */
    readonly durationMs: number;
    readonly timestamp: number;
}

/**
 * Emitted when middleware starts executing.
 * One event per middleware function in the chain.
 */
export interface MiddlewareEvent {
    readonly type: 'middleware';
    readonly tool: string;
    readonly action: string;
    /** Number of middleware functions in the compiled chain */
    readonly chainLength: number;
    readonly timestamp: number;
}

/**
 * Emitted after successful handler execution.
 * Contains the total pipeline duration (route → response).
 */
export interface ExecuteEvent {
    readonly type: 'execute';
    readonly tool: string;
    readonly action: string;
    /** Total milliseconds from route to response */
    readonly durationMs: number;
    /** Whether the response was an error response */
    readonly isError: boolean;
    readonly timestamp: number;
}

/**
 * Emitted when an unhandled error occurs in the pipeline.
 * This captures exceptions — not validation errors (those are in ValidateEvent).
 */
export interface ErrorEvent {
    readonly type: 'error';
    readonly tool: string;
    readonly action: string;
    readonly error: string;
    /** The pipeline step where the error occurred */
    readonly step: 'route' | 'validate' | 'middleware' | 'execute';
    readonly timestamp: number;
}

// ── Governance Events ────────────────────────────────────

/**
 * Emitted during governance operations (contract materialization,
 * lockfile generation, integrity verification, attestation).
 *
 * Connects the introspection/governance modules to observability,
 * enabling debug logging and telemetry for CI/CD pipeline steps.
 */
export interface GovernanceEvent {
    readonly type: 'governance';
    /** Which governance operation ran */
    readonly operation: GovernanceOperation;
    /** Human-readable label */
    readonly label: string;
    /** Outcome of the operation */
    readonly outcome: 'success' | 'failure' | 'drift';
    /** Optional details (e.g. "3 tools compiled", "lockfile stale") */
    readonly detail?: string;
    /** Milliseconds spent in this operation */
    readonly durationMs: number;
    readonly timestamp: number;
}

/**
 * Named governance operations that emit debug/tracing events.
 */
export type GovernanceOperation =
    | 'contract.compile'
    | 'contract.diff'
    | 'digest.compute'
    | 'lockfile.generate'
    | 'lockfile.check'
    | 'lockfile.write'
    | 'lockfile.read'
    | 'attestation.sign'
    | 'attestation.verify'
    | 'entitlement.scan'
    | 'token.profile';

/**
 * Union of all debug event types.
 *
 * Use a `switch` on `event.type` for exhaustive handling:
 * ```typescript
 * function handle(event: DebugEvent) {
 *     switch (event.type) {
 *         case 'route':    // RouteEvent
 *         case 'validate': // ValidateEvent
 *         case 'middleware': // MiddlewareEvent
 *         case 'execute':  // ExecuteEvent
 *         case 'error':    // ErrorEvent
 *     }
 * }
 * ```
 */
export type DebugEvent =
    | RouteEvent
    | ValidateEvent
    | MiddlewareEvent
    | ExecuteEvent
    | ErrorEvent
    | GovernanceEvent;

/**
 * Observer function that receives debug events.
 *
 * This is a simple function type — no class, no inheritance.
 * Pass it to `attachToServer()` or `ToolRegistry` to receive events.
 */
export type DebugObserverFn = (event: DebugEvent) => void;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a debug observer with pretty console output.
 *
 * If a custom handler is provided, events are forwarded to it instead.
 * The default handler produces compact, readable output:
 *
 * ```
 * [mcp-fusion] route     projects/list
 * [mcp-fusion] validate  projects/list ✓ 0.3ms
 * [mcp-fusion] execute   projects/list ✓ 12ms
 * ```
 *
 * @param handler - Optional custom event handler. If omitted, uses `console.debug`.
 * @returns A `DebugObserverFn` to pass to registry or server attachment.
 *
 * @example
 * ```typescript
 * // Default: console.debug
 * const debug = createDebugObserver();
 *
 * // Custom: forward to telemetry
 * const debug = createDebugObserver((event) => {
 *     opentelemetry.addEvent(event.type, event);
 * });
 * ```
 */
export function createDebugObserver(handler?: DebugObserverFn): DebugObserverFn {
    if (handler) return handler;

    return (event: DebugEvent): void => {
        const prefix = '[mcp-fusion]';

        // GovernanceEvent has no tool/action — handle separately
        if (event.type === 'governance') {
            const outcomeIcon = event.outcome === 'success' ? '✓' : event.outcome === 'drift' ? '⚠' : '✗';
            const detail = event.detail ? ` ${event.detail}` : '';
            console.debug(`${prefix} gov       ${event.operation} ${outcomeIcon}${detail} ${event.durationMs.toFixed(1)}ms`);
            return;
        }

        const path = event.action
            ? `${event.tool}/${event.action}`
            : event.tool;

        switch (event.type) {
            case 'route':
                console.debug(`${prefix} route     ${path}`);
                break;

            case 'validate': {
                const status = event.valid ? '✓' : `✗ ${event.error ?? ''}`;
                console.debug(`${prefix} validate  ${path} ${status} ${event.durationMs.toFixed(1)}ms`);
                break;
            }

            case 'middleware':
                console.debug(`${prefix} mw-chain  ${path} (${event.chainLength} functions)`);
                break;

            case 'execute': {
                const icon = event.isError ? '✗' : '✓';
                console.debug(`${prefix} execute   ${path} ${icon} ${event.durationMs.toFixed(1)}ms`);
                break;
            }

            case 'error':
                console.debug(`${prefix} ERROR     ${path} [${event.step}] ${event.error}`);
                break;
        }
    };
}
