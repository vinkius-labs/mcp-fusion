/**
 * TelemetryEvent — Enriched Out-of-Band Telemetry Types
 *
 * Extends the core {@link DebugEvent} discriminated union with
 * domain-specific telemetry events for the Shadow Socket transport.
 *
 * These events are emitted over an IPC channel (Named Pipe on Windows,
 * Unix Domain Socket on POSIX) and consumed by `fusion top`.
 * They NEVER touch stdio — the MCP JSON-RPC channel is 100% safe.
 *
 * Design rules:
 * - All events are JSON-serializable (no Date objects, no functions)
 * - All events carry a `timestamp` (epoch ms) for chronological ordering
 * - The `type` field is the discriminator for exhaustive `switch` handling
 * - Events are fire-and-forget — dropping them must never affect the server
 *
 * @module
 */
import type { DebugEvent } from './DebugObserver.js';

// ============================================================================
// Domain Telemetry Events
// ============================================================================

/**
 * Emitted after the DLP RedactEngine masks PII fields.
 * Allows the TUI to display live redaction activity and field paths.
 */
export interface DlpRedactEvent {
    readonly type: 'dlp.redact';
    readonly tool: string;
    readonly action: string;
    /** Number of fields that were masked */
    readonly fieldsRedacted: number;
    /** The configured redaction paths that matched */
    readonly paths: readonly string[];
    /** Short hex trace ID for correlating events in the same request lifecycle */
    readonly traceId?: string;
    readonly timestamp: number;
}

/**
 * Emitted after the Presenter's Late Guillotine slices data.
 * Shows the token-saving ratio — the visual ROI proof.
 */
export interface PresenterSliceEvent {
    readonly type: 'presenter.slice';
    readonly tool: string;
    readonly action: string;
    /** Size of the raw data from the handler (bytes) */
    readonly rawBytes: number;
    /** Size after Presenter filtering for the LLM wire (bytes) */
    readonly wireBytes: number;
    /** Number of raw rows/items before filtering */
    readonly rowsRaw: number;
    /** Number of rows/items after filtering */
    readonly rowsWire: number;
    /** Short hex trace ID for correlating events in the same request lifecycle */
    readonly traceId?: string;
    readonly timestamp: number;
}

/**
 * Emitted after the Presenter injects cognitive rules.
 * Allows the TUI to display the JIT domain rules sent to the LLM.
 */
export interface PresenterRulesEvent {
    readonly type: 'presenter.rules';
    readonly tool: string;
    readonly action: string;
    /** The system rules injected into the response */
    readonly rules: readonly string[];
    /** Short hex trace ID for correlating events in the same request lifecycle */
    readonly traceId?: string;
    readonly timestamp: number;
}

/**
 * Emitted after a SandboxEngine execution completes.
 * Shows V8 isolate metrics for the computation delegation.
 */
export interface SandboxExecEvent {
    readonly type: 'sandbox.exec';
    /** Execution time in milliseconds */
    readonly executionMs: number;
    /** Whether the execution succeeded */
    readonly ok: boolean;
    /** Error code if execution failed */
    readonly errorCode?: string;
    readonly timestamp: number;
}

/**
 * Emitted after an FSM state transition.
 * Shows the temporal anti-hallucination gate in action.
 */
export interface FsmTransitionEvent {
    readonly type: 'fsm.transition';
    readonly previousState: string;
    readonly currentState: string;
    /** The event that triggered the transition */
    readonly event: string;
    /** Number of tools visible in the new state */
    readonly toolsVisible: number;
    readonly timestamp: number;
}

/**
 * Emitted once on TUI client connection.
 * Provides the full server topology for immediate panel population.
 */
export interface TopologyEvent {
    readonly type: 'topology';
    readonly serverName: string;
    readonly pid: number;
    readonly tools: readonly TopologyTool[];
    /** Current FSM state, if FSM is configured */
    readonly fsmState?: string;
    readonly timestamp: number;
}

/** Tool entry within a {@link TopologyEvent} */
export interface TopologyTool {
    readonly name: string;
    readonly actions: readonly string[];
    /** Read-only or destructive annotation */
    readonly readOnly?: boolean;
    readonly destructive?: boolean;
    /** Whether this tool runs in the V8 Sandbox */
    readonly sandboxed?: boolean;
    /** FSM states where this tool is visible */
    readonly fsmStates?: readonly string[];
}

/**
 * Periodic heartbeat with process-level metrics.
 * Emitted every 5 seconds to keep the TUI header bar alive.
 */
export interface HeartbeatEvent {
    readonly type: 'heartbeat';
    /** V8 heap used in bytes */
    readonly heapUsedBytes: number;
    /** V8 heap total in bytes */
    readonly heapTotalBytes: number;
    /** RSS in bytes */
    readonly rssBytes: number;
    /** Process uptime in seconds */
    readonly uptimeSeconds: number;
    readonly timestamp: number;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * All possible telemetry events that flow through the Shadow Socket.
 *
 * This is a superset of {@link DebugEvent} — the core pipeline events
 * are included alongside the domain-specific telemetry.
 *
 * Use `switch (event.type)` for exhaustive handling:
 * ```typescript
 * function handle(event: TelemetryEvent) {
 *     switch (event.type) {
 *         case 'route':           // DebugEvent
 *         case 'validate':        // DebugEvent
 *         case 'execute':         // DebugEvent
 *         case 'error':           // DebugEvent
 *         case 'middleware':       // DebugEvent
 *         case 'governance':      // DebugEvent
 *         case 'dlp.redact':      // DlpRedactEvent
 *         case 'presenter.slice': // PresenterSliceEvent
 *         case 'presenter.rules': // PresenterRulesEvent
 *         case 'sandbox.exec':    // SandboxExecEvent
 *         case 'fsm.transition':  // FsmTransitionEvent
 *         case 'topology':        // TopologyEvent
 *         case 'heartbeat':       // HeartbeatEvent
 *     }
 * }
 * ```
 */
export type TelemetryEvent =
    | DebugEvent
    | DlpRedactEvent
    | PresenterSliceEvent
    | PresenterRulesEvent
    | SandboxExecEvent
    | FsmTransitionEvent
    | TopologyEvent
    | HeartbeatEvent;

// ============================================================================
// Sink Interface
// ============================================================================

/**
 * A function that accepts telemetry events for out-of-band delivery.
 *
 * The implementation is a fire-and-forget NDJSON writer to the IPC socket.
 * If no TUI client is connected, the events are silently discarded.
 *
 * This type is passed to `AttachOptions.telemetry` and to individual
 * subsystems (Presenter, RedactEngine, SandboxEngine) for event emission.
 */
export type TelemetrySink = (event: TelemetryEvent) => void;
