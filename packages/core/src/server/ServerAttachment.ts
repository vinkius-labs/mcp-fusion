/**
 * ServerAttachment — MCP Server Integration Strategy
 *
 * Handles attaching a ToolRegistry to an MCP Server by registering
 * request handlers for tools/list and tools/call.
 *
 * Supports both Server (low-level) and McpServer (high-level) via duck-typing.
 *
 * Pure-function module: receives dependencies, returns detach function.
 */
import type { Tool as McpTool } from "@modelcontextprotocol/server";
import { type ToolResponse, error, toolError, isHandoffResponse, type HandoffPayload } from '../core/response.js';
import { type ToolBuilder } from '../core/types.js';
import { type ProgressSink, type ProgressEvent } from '../core/execution/ProgressHelper.js';
import { resolveServer } from './ServerResolver.js';
import { type DebugObserverFn } from '../observability/DebugObserver.js';
import { type MCPFusionTracer } from '../observability/Tracing.js';
import { StateSyncLayer } from '../state-sync/StateSyncLayer.js';
import { type StateSyncConfig, type SyncPolicy } from '../state-sync/types.js';
import { type IntrospectionConfig } from '../introspection/types.js';
import { registerIntrospectionResource } from '../introspection/IntrospectionResource.js';
import { compileManifest, cloneManifest } from '../introspection/ManifestCompiler.js';
import { type ZeroTrustConfig, AttestationError } from '../introspection/CryptoAttestation.js';
import { type SelfHealingConfig, enrichValidationError } from '../introspection/ContractAwareSelfHealing.js';
import { compileContracts } from '../introspection/ToolContract.js';
import { computeServerDigest } from '../introspection/BehaviorDigest.js';
import { type ToolExposition } from '../exposition/types.js';
import { compileExposition, type FlatRoute, type ExpositionResult } from '../exposition/ExpositionCompiler.js';
import { type ResourceRegistry } from '../resource/ResourceRegistry.js';
import type { SubscriptionFilter } from '../resource/SubscriptionManager.js';
import { type PromptRegistry, type PromptFilter } from '../prompt/PromptRegistry.js';
import { type LoopbackContext } from '../prompt/types.js';
import type { StateMachineGate, FsmStateStore, FsmSnapshot } from '../fsm/StateMachineGate.js';
import type { TelemetrySink } from '../observability/TelemetryEvent.js';
import { randomUUID } from 'node:crypto';
import { type ElicitSink, isInputRequiredResponse } from '../core/elicitation/index.js';
import { runWithElicitation } from '../core/elicitation/runtime.js';

// ── Types ────────────────────────────────────────────────

/**
 * Typed interface for MCP SDK v2 Server with method-string handler registration.
 * ServerResolver returns the generic McpServerLike; we narrow it here for type-safe handler registration.
 */
interface McpServerTyped {
    setRequestHandler(method: string, handler: (...args: never[]) => unknown): void;
}

/**
 * Duck-typed interface for the MCP SDK `extra` object passed to request handlers.
 * We extract fields needed for progress notification wiring and cancellation propagation.
 */
interface McpRequestExtra {
    /** Metadata from the original JSON-RPC request (contains progressToken) */
    _meta?: { progressToken?: string | number };
    /** Send a notification back to the client within the current request scope */
    sendNotification: (notification: unknown) => Promise<void>;
    /**
     * Send a request to the client within the current request scope.
     *
     * Used by MCP Elicitation (`elicitation/create`) for human-in-the-loop
     * workflows on 2025-era (stateful) connections. Only available when the
     * MCP SDK version supports bidirectional requests.
     *
     * @deprecated MCP 2.0 (`2026-07-28`) removes the persistent server→client
     * request channel that this field depends on. The stateless protocol uses
     * return-based elicitation (`requireInput()` + `readInput()`) instead.
     * This field remains wired for backward compatibility with 2025-era
     * clients during the deprecation window (earliest removal: 2027-07-28).
     * New implementations SHOULD NOT rely on `sendRequest` — use
     * `requireInput()` to request input and `readInput()` to consume answers.
     * See the [Deprecation Registry](/docs/deprecation-registry).
     */
    sendRequest?: (request: { method: string; params: unknown }) => Promise<unknown>;
    /**
     * Abort signal from the MCP SDK protocol layer.
     *
     * Fired when the client sends `notifications/cancelled` or the connection drops.
     * The framework propagates this signal through the entire execution pipeline
     * so that handlers can abort long-running operations (fetch, DB queries, etc.).
     */
    signal?: AbortSignal;
}

/** Options for attaching to an MCP Server */
export interface AttachOptions<TContext> {
    /** Only expose tools matching these tag filters */
    filter?: { tags?: string[]; anyTag?: string[]; exclude?: string[] };

    /**
     * Cache hint (in milliseconds) for `tools/list`, `prompts/list`,
     * `resources/list`, and `resources/read` responses (MCP `2026-07-28` SEP-2549).
     *
     * When set, the framework emits `ttlMs` and `cacheScope: 'public'`
     * on list responses so clients can cache tool catalogs and keep upstream
     * prompt caches stable across reconnects. Set to `0` to disable caching
     * (equivalent to `no-store`).
     *
     * @default 300000 (5 minutes)
     */
    listCacheTtlMs?: number;

    /**
     * Cache scope for list responses (MCP 2026-07-28 SEP-2549).
     *
     * - `'private'` (default) — most conservative; responses are cacheable
     *   only by the client that issued the request.
     * - `'public'` — responses may be cached by shared proxies/CDNs/gateways.
     *
     * Only effective when `listCacheTtlMs > 0`.
     *
     * @default 'private'
     */
    listCacheScope?: 'private' | 'public';
    /**
     * Factory function to create a per-request context.
     * Receives the MCP `extra` object (session info, meta, etc.).
     * If omitted, `undefined` is used as context (suitable for `ToolRegistry<void>`).
     * Supports async factories (e.g. for token verification, DB connection).
     */
    contextFactory?: (extra: unknown) => TContext | Promise<TContext>;
    /**
     * Enable debug observability for ALL registered tools.
     *
     * When set, the observer is automatically propagated to every tool
     * builder, and registry-level routing events are also emitted.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     debug: createDebugObserver(),
     * });
     * ```
     *
     * @see {@link createDebugObserver} for creating an observer
     */
    debug?: DebugObserverFn;

    /**
     * Enable State Sync to prevent LLM Temporal Blindness and Causal State Drift.
     *
     * When configured, MCP Fusion automatically:
     * 1. Appends `[Cache-Control: X]` to tool descriptions during `tools/list`
     * 2. Prepends `[System: Cache invalidated...]` after successful mutations in `tools/call`
     *
     * Zero overhead when omitted — no state-sync code runs.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     stateSync: {
     *         defaults: { cacheControl: 'no-store' },
     *         policies: [
     *             { match: 'sprints.update', invalidates: ['sprints.*'] },
     *             { match: 'tasks.update',   invalidates: ['tasks.*', 'sprints.*'] },
     *             { match: 'countries.*',     cacheControl: 'immutable' },
     *         ],
     *     },
     * });
     * ```
     *
     * @see {@link StateSyncConfig} for configuration options
     * @see {@link https://arxiv.org/abs/2510.23853 | "Your LLM Agents are Temporally Blind"}
     */
    stateSync?: StateSyncConfig;

    /**
     * Enable dynamic introspection manifest (MCP Resource).
     *
     * When enabled, the framework registers a `resources/list` and
     * `resources/read` handler exposing a structured manifest of all
     * registered tools, actions, and presenters.
     *
     * **Security**: Opt-in only. Never enabled silently.
     * **RBAC**: The `filter` callback allows dynamic per-session
     * manifest filtering. Unauthorized agents never see hidden tools.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     introspection: {
     *         enabled: process.env.NODE_ENV !== 'production',
     *         uri: 'mcpfusion://manifest.json',
     *         filter: (manifest, ctx) => {
     *             if (ctx.user.role !== 'admin') {
     *                 delete manifest.capabilities.tools['admin.delete_user'];
     *             }
     *             return manifest;
     *         },
     *     },
     * });
     * ```
     *
     * @see {@link IntrospectionConfig} for configuration options
     */
    introspection?: IntrospectionConfig<TContext>;

    /**
     * Enable OpenTelemetry-compatible tracing for ALL registered tools.
     *
     * When set, the tracer is automatically propagated to every tool
     * builder, and registry-level routing spans are also created.
     *
     * **Context propagation limitation**: Since MCP Fusion does not depend
     * on `@opentelemetry/api`, it cannot call `context.with(trace.setSpan(...))`.
     * Auto-instrumented downstream calls (Prisma, HTTP, Redis) inside tool
     * handlers will appear as **siblings**, not children, of the MCP span.
     * This is an intentional trade-off for zero runtime dependencies.
     *
     * @example
     * ```typescript
     * import { trace } from '@opentelemetry/api';
     *
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     tracing: trace.getTracer('mcpfusion'),
     * });
     * ```
     *
     * @see {@link MCPFusionTracer} for the tracer interface contract
     */
    tracing?: MCPFusionTracer;

    /**
     * Telemetry sink for the Inspector TUI.
     *
     * When set, emits `route`, `execute`, and `error` events for each
     * tool call, enabling the real-time TUI dashboard.
     *
     * Zero overhead when omitted.
     */
    telemetry?: TelemetrySink;

    /**
     * Server name used in the introspection manifest.
     * @defaultValue `'mcpfusion-server'`
     */
    serverName?: string;

    // ── Topology Compiler (Exposition Strategy) ──────────

    /**
     * Exposition strategy for projecting grouped tools onto the MCP wire format.
     *
     * - `'flat'` (default): Each action becomes an independent atomic MCP tool.
     *   Guarantees privilege isolation, deterministic routing, and granular UI.
     *   Example: `projects_list`, `projects_create` — two separate buttons in Claude.
     *
     * - `'grouped'`: All actions within a builder are merged into a single MCP
     *   tool with a discriminated-union schema (legacy behavior).
     *
     * @default 'flat'
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     toolExposition: 'flat',      // Each action = 1 MCP tool
     *     actionSeparator: '_',        // projects_list, projects_create
     * });
     * ```
     *
     * @see {@link ToolExposition} for strategy details
     */
    toolExposition?: ToolExposition;

    /**
     * Delimiter for deterministic naming interpolation in flat mode.
     * Used to join `{toolName}{separator}{actionKey}`.
     *
     * @default '_'
     *
     * @example
     * ```typescript
     * // '_' → projects_list, projects_create
     * // '.' → projects.list, projects.create
     * // '-' → projects-list, projects-create
     * ```
     */
    actionSeparator?: string;

    // ── Prompt Engine ────────────────────────────────────

    /**
     * Prompt registry for server-side hydrated prompts.
     *
     * When provided, the framework registers `prompts/list` and
     * `prompts/get` handlers on the MCP server, enabling slash
     * command discovery and Zero-Shot Context hydration.
     *
     * Zero overhead when omitted — no prompt code runs.
     *
     * @example
     * ```typescript
     * const promptRegistry = new PromptRegistry<AppContext>();
     * promptRegistry.register(AuditPrompt);
     *
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     prompts: promptRegistry,
     * });
     * ```
     *
     * @see {@link PromptRegistry} for prompt registration
     * @see {@link definePrompt} for creating prompts
     */
    prompts?: PromptRegistry<TContext>;

    // ── Zero-Trust Runtime ───────────────────────────────

    /**
     * Enable Zero-Trust runtime verification for behavioral contracts.
     *
     * When configured, the framework:
     * 1. Materializes ToolContracts from all registered builders
     * 2. Computes a server-level behavioral digest
     * 3. Optionally verifies against a known-good digest (capability pinning)
     * 4. Exposes the trust capability via MCP server metadata
     *
     * Zero overhead when omitted — no cryptographic operations run.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     zeroTrust: {
     *         signer: 'hmac',
     *         secret: process.env.FUSION_SIGNING_SECRET,
     *         expectedDigest: process.env.FUSION_EXPECTED_DIGEST,
     *         failOnMismatch: process.env.NODE_ENV === 'production',
     *     },
     * });
     * ```
     *
     * @see {@link ZeroTrustConfig} for configuration options
     */
    zeroTrust?: ZeroTrustConfig;

    // ── Self-Healing Context ─────────────────────────────

    /**
     * Enable contract-aware self-healing for validation errors.
     *
     * When configured, Zod validation errors are enriched with
     * contract change context, helping the LLM self-correct
     * when the tool's behavioral contract has changed.
     *
     * Zero overhead when omitted or when no contract deltas exist.
     *
     * @see {@link SelfHealingConfig} for configuration options
     */
    selfHealing?: SelfHealingConfig;

    // ── FSM State Gate (Temporal Anti-Hallucination) ───

    /**
     * FSM gate for temporal anti-hallucination.
     *
     * When configured, tools bound to FSM states (via `.bindState()`)
     * are dynamically filtered from `tools/list` based on the current
     * workflow state. The LLM physically cannot call tools that don't
     * exist in its reality.
     *
     * On successful tool execution, the FSM transitions automatically
     * (if a transition event is bound), and `notifications/tools/list_changed`
     * is emitted so the client re-fetches the tool list.
     *
     * Zero overhead when omitted — no FSM code runs.
     *
     * @example
     * ```typescript
     * const gate = new StateMachineGate({
     *     id: 'checkout',
     *     initial: 'empty',
     *     states: {
     *         empty:     { on: { ADD_ITEM: 'has_items' } },
     *         has_items: { on: { CHECKOUT: 'payment' } },
     *         payment:   { on: { PAY: 'confirmed' } },
     *         confirmed: { type: 'final' },
     *     },
     * });
     *
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     fsm: gate,
     * });
     * ```
     *
     * @see {@link StateMachineGate} for the FSM engine
     */
    fsm?: StateMachineGate;

    /**
     * External state store for FSM persistence in serverless/edge deployments.
     *
     * When MCP runs over Streamable HTTP (Vercel, Cloudflare Workers),
     * there is no persistent process — FSM state must be externalized.
     * The `sessionId` comes from the `Mcp-Session-Id` request header.
     *
     * Zero overhead when omitted — FSM state lives in-memory.
     *
     * @example
     * ```typescript
     * registry.attachToServer(server, {
     *     fsm: gate,
     *     fsmStore: {
     *         load: async (sessionId) => {
     *             const data = await redis.get(`fsm:${sessionId}`);
     *             return data ? JSON.parse(data) : undefined;
     *         },
     *         save: async (sessionId, snapshot) => {
     *             await redis.set(`fsm:${sessionId}`, JSON.stringify(snapshot), { EX: 3600 });
     *         },
     *     },
     * });
     * ```
     */
    fsmStore?: FsmStateStore;

    /**
     * Name of the tool argument to use as the FSM/handoff state handle
     * (MCP 2026-07-28 stateless protocol).
     *
     * When set, the framework extracts the handle from the tool's arguments
     * (e.g. `stateHandleKey: 'workflow_id'` reads `args.workflow_id`).
     * When not set, falls back to the transport session ID (2025-era) or
     * a per-attachment UUID fallback.
     *
     * This is the spec-recommended pattern: "mint an explicit handle from
     * a tool and have the model pass it back as an argument."
     */
    stateHandleKey?: string;

    // ── MCP Resources (Push Subscriptions) ───────────────

    /**
     * Resource registry for live data feeds with push subscriptions.
     *
     * When provided, the framework registers `resources/list`, `resources/read`,
     * `resources/subscribe`, and `resources/unsubscribe` handlers on the MCP
     * server, enabling AI agents to subscribe to real-time data updates.
     *
     * Zero overhead when omitted — no resource code runs.
     *
     * @example
     * ```typescript
     * const resourceRegistry = new ResourceRegistry<AppContext>();
     * resourceRegistry.register(stockPrice);
     * resourceRegistry.register(deployStatus);
     *
     * registry.attachToServer(server, {
     *     contextFactory: createContext,
     *     resources: resourceRegistry,
     * });
     * ```
     *
     * @see {@link ResourceRegistry} for resource registration
     * @see {@link defineResource} for creating resources
     */
    resources?: ResourceRegistry<TContext>;

    /**
     * SwarmGateway for federated multi-agent handoffs (Federated Handoff Protocol).
     *
     * When provided, the framework detects `HandoffResponse` from tool handlers
     * and activates the B2BUA tunnel to the upstream MCP micro-server.
     * Zero overhead when omitted — no FHP code runs.
     *
     * Import from `@mcpfusion/swarm`:
     * ```typescript
     * import { SwarmGateway } from '@mcpfusion/swarm';
     *
     * registry.attachToServer(server, {
     *     swarmGateway: new SwarmGateway({
     *         registry: { finance: 'http://finance-agent:8081' },
     *         delegationSecret: process.env.MCPFUSION_DELEGATION_SECRET!,
     *     }),
     * });
     * ```
     */
    swarmGateway?: ISwarmGateway;
}


/**
 * Minimal duck-typed interface for the SwarmGateway.
 * Defined here to avoid a hard dependency on `@mcpfusion/swarm` from `@mcpfusion/core`.
 * The real `SwarmGateway` from `@mcpfusion/swarm` satisfies this interface automatically.
 *
 * @internal
 */
export interface ISwarmGateway {
    activateHandoff(payload: HandoffPayload, handoffHandle: string, signal: AbortSignal): Promise<void>;
    proxyToolsList(handoffHandle: string): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }> | null>;
    proxyToolsCall(handoffHandle: string, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResponse | null>;
    returnToGateway(handoffHandle: string): Promise<void>;
    hasActiveHandoff(handoffHandle: string): boolean;
}

/** Function to detach the registry from the server */
export type DetachFn = () => void;

/** Delegate interface for the registry operations needed by ServerAttachment */
export interface RegistryDelegate<TContext> {
    getAllTools(): McpTool[];
    getTools(filter: { tags?: string[]; anyTag?: string[]; exclude?: string[] }): McpTool[];
    routeCall(ctx: TContext, name: string, args: Record<string, unknown>, progressSink?: ProgressSink, signal?: AbortSignal): Promise<ToolResponse>;
    /** Propagate a debug observer to all registered builders (duck-typed) */
    enableDebug?(observer: DebugObserverFn): void;
    /** Propagate a tracer to all registered builders (duck-typed) */
    enableTracing?(tracer: MCPFusionTracer): void;
    /** Propagate a telemetry sink to all registered builders (duck-typed) */
    enableTelemetry?(sink: TelemetrySink): void;
    /** Get an iterable of all registered builders (for introspection and exposition) */
    getBuilders(): Iterable<ToolBuilder<TContext>>;
    /** O(1) count of registered builders — used by recompile() cache safety net. */
    readonly size: number;
}

// ── Internal Shared State ────────────────────────────────

/**
 * Internal context shared between handler factories.
 * Avoids passing many individual parameters through each factory.
 */
interface HandlerContext<TContext> {
    readonly registry: RegistryDelegate<TContext>;
    readonly filter?: { tags?: string[]; anyTag?: string[]; exclude?: string[] };
    readonly contextFactory?: (extra: unknown) => TContext | Promise<TContext>;
    readonly syncLayer?: StateSyncLayer;
    readonly toolExposition: ToolExposition;
    readonly actionSeparator: string;
    readonly recompile: (fsmCompactMode?: boolean) => ExpositionResult<TContext>;
    readonly isFlat: boolean;
    readonly fsm?: StateMachineGate;
    readonly fsmStore?: FsmStateStore;
    /** In-memory FSM snapshot store for non-serverless transports without fsmStore ( fix). */
    readonly fsmMemorySnapshots?: Map<string, FsmSnapshot>;
    readonly notifyToolListChanged?: () => void;
    readonly telemetry?: TelemetrySink;
    readonly selfHealing?: SelfHealingConfig;
    /** per-attachment UUID fallback for transports without session IDs (e.g. stdio). */
    readonly fallbackStateHandle: string;
    /** SwarmGateway for federated handoff (optional — zero overhead when absent). */
    readonly swarmGateway?: ISwarmGateway;
    /** Cache hint (ms) for list responses per MCP 2026-07-28 SEP-2549. */
    readonly listCacheTtlMs?: number;
    /** Cache scope for list responses ('private' default, 'server' for shared caches). */
    readonly listCacheScope?: 'private' | 'public';
    /** Tool argument key to use as FSM/handoff state handle (2026-07-28 stateless). */
    readonly stateHandleKey?: string;
}

// ── Observability Propagation ────────────────────────────

/**
 * Propagate debug and tracing observers to all registered builders.
 * Zero overhead when neither is configured.
 */
function propagateObservability<TContext>(
    registry: RegistryDelegate<TContext>,
    debug?: DebugObserverFn,
    tracing?: MCPFusionTracer,
    telemetry?: TelemetrySink,
): void {
    if (debug && registry.enableDebug) {
        registry.enableDebug(debug);
    }
    if (tracing && registry.enableTracing) {
        registry.enableTracing(tracing);
    }
    if (telemetry && registry.enableTelemetry) {
        registry.enableTelemetry(telemetry);
    }
}
// ── Missing Context Guard ────────────────────────────────

/**
 * Proxy sentinel used when `contextFactory` is not provided.
 *
 * Instead of `undefined` (which causes cryptic `TypeError: Cannot read
 * properties of undefined`), this proxy throws a clear, actionable error
 * the moment a handler accesses any property on `ctx`.
 *
 * For `void` contexts where handlers never touch `ctx`, the proxy is
 * never triggered — zero false positives.
 *
 * @internal — exported for reuse by `startServer.ts` edge handler.
 */
export const _missingContextProxy: unknown = new Proxy(Object.freeze({}), {
    get(_target, prop) {
        // Allow symbol access (e.g. Symbol.toPrimitive, Symbol.toStringTag) and
        // JSON.stringify probing ('toJSON') to avoid breaking framework internals.
        if (typeof prop === 'symbol') return undefined;
        throw new Error(
            `[mcpfusion] Attempted to access "ctx.${String(prop)}" but no contextFactory was provided. ` +
            `Add contextFactory to your attachToServer() options:\n\n` +
            `  registry.attachToServer(server, {\n` +
            `      contextFactory: (extra) => createAppContext(extra),\n` +
            `  });\n`,
        );
    },
});

// ── FSM Session Helpers ──────────────────────────────────

/**
 * Resolve the state handle for FSM/handoff state from the request context.
 *
 * Resolution order (first wins):
 * 1. Tool argument named by `stateHandleKey` (2026-07-28 stateless pattern —
 *    the model threads an explicit handle between calls)
 * 2. Transport session ID from `Mcp-Session-Id` header or SDK `sessionId` (2025-era)
 * 3. Per-attachment UUID fallback (stdio, stateless without handle arg)
 *
 * This replaces the v1-era `resolveSessionId` and works on both protocol eras.
 */
function resolveStateHandle<TContext>(
    extra: unknown,
    hCtx: HandlerContext<TContext>,
    toolArgs?: Record<string, unknown>,
): string {
    // 1. Tool-minted handle (2026-07-28 stateless)
    if (hCtx.stateHandleKey && toolArgs) {
        const handle = toolArgs[hCtx.stateHandleKey];
        if (typeof handle === 'string' && handle.length > 0) return handle;
    }
    // 2. Transport session ID (2025-era)
    const sessionId = extractSessionId(extra);
    if (sessionId) return sessionId;
    // 3. Fallback UUID
    return hCtx.fallbackStateHandle;
}

/**
 * Clone the FSM and restore the session-specific snapshot.
 *
 * Shared by both `tools/list` and `tools/call` handlers.
 * Eliminates the duplicated clone+restore logic ( + ).
 */
async function cloneAndRestoreFsm<TContext>(
    hCtx: HandlerContext<TContext>,
    extra: unknown,
    toolArgs?: Record<string, unknown>,
): Promise<HandlerContext<TContext>['fsm']> {
    let fsm = hCtx.fsm;
    if (!fsm) return undefined;

    fsm = fsm.clone();
    const stateHandle = resolveStateHandle(extra, hCtx, toolArgs);

    if (hCtx.fsmStore) {
        const snap = await hCtx.fsmStore.load(stateHandle);
        if (snap) fsm.restore(snap);
    } else {
        const snap = hCtx.fsmMemorySnapshots?.get(stateHandle);
        if (snap) fsm.restore(snap);
    }
    return fsm;
}

// ── Handler Factories ────────────────────────────────────

/**
 * Build the `_meta` cache hint for list responses per MCP 2026-07-28 SEP-2549.
 * Returns `{ ttlMs, cacheScope }` when caching is enabled (ttlMs > 0),
 * or `undefined` when disabled (ttlMs === 0) — zero overhead.
 *
 * The spec defaults to `cacheScope: 'private'` (most conservative). The
 * framework allows overriding to `'public'` for shared caches behind a CDN
 * or gateway.
 *
 * MCP 2.0 (2026-07-28) places `ttlMs` and `cacheScope` directly on the
 * result object root — NOT inside `_meta`. See:
 * https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching
 */
function buildListCacheMeta(hCtx: { readonly listCacheTtlMs?: number | undefined; readonly listCacheScope?: 'private' | 'public' | undefined }): { ttlMs: number; cacheScope: 'private' | 'public' } | undefined {
    const ttlMs = hCtx.listCacheTtlMs ?? 0;
    if (ttlMs <= 0) return undefined;
    return { ttlMs, cacheScope: hCtx.listCacheScope ?? 'private' };
}

/**
 * Create the `tools/list` request handler.
 *
 * In flat mode, re-compiles exposition from the current registry state.
 * In grouped mode, delegates to the registry's tag-filtered listing.
 */
function createToolListHandler<TContext>(hCtx: HandlerContext<TContext>) {
    return async (_request: unknown, extra: unknown) => {
        // Per-request FSM clone for serverless isolation ( +  fix).
        const fsm = await cloneAndRestoreFsm(hCtx, extra);

        // FHP: if a handoff tunnel is active, proxy the upstream's tools list
        if (hCtx.swarmGateway) {
            const stateHandle = resolveStateHandle(extra, hCtx);
            const proxied = await hCtx.swarmGateway.proxyToolsList(stateHandle);
            if (proxied != null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- McpTool shape
                return { tools: proxied as any };
            }
        }

        let tools: McpTool[];

        if (hCtx.isFlat) {
            // FSM Progressive Disclosure: determine compact mode from FSM state.
            // Initial state = compact descriptions. After first call triggers
            // transition, FSM moves to a non-initial state = full expert descriptions.
            // listChanged notification forces client re-fetch with new descriptions.
            const fsmCompactMode = fsm ? fsm.currentState === fsm.initialState : false;
            const exposition = hCtx.recompile(fsmCompactMode);
            tools = hCtx.filter
                ? filterFlatTools(exposition.tools, exposition.routingMap, hCtx.filter)
                : exposition.tools;
        } else {
            tools = hCtx.filter
                ? hCtx.registry.getTools(hCtx.filter)
                : hCtx.registry.getAllTools();
        }

        // FSM State Gate: remove tools not allowed in the current state
        if (fsm && fsm.hasBindings) {
            tools = tools.filter(tool => fsm!.isToolAllowed(tool.name));
        }

        // MCP 2.0 pagination: cursor / nextCursor (SEP-2549).
        // Simple index-based pagination — the cursor is the opaque offset.
        // Default page size is 1000 tools (most servers have fewer).
        const PAGE_SIZE = 1000;
        const requestParams = (_request as { params?: { cursor?: string } })?.params;
        const cursor = requestParams?.cursor;
        const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
        const pagedTools = tools.slice(offset, offset + PAGE_SIZE);
        const nextCursor = offset + PAGE_SIZE < tools.length
            ? String(offset + PAGE_SIZE)
            : undefined;

        const cacheMeta = buildListCacheMeta(hCtx);
        return {
            tools: hCtx.syncLayer ? hCtx.syncLayer.decorateTools(pagedTools) : pagedTools,
            ...(nextCursor ? { nextCursor } : {}),
            ...(cacheMeta ?? {}),
        };
    };
}

/**
 * Create the `tools/call` request handler.
 *
 * Handles both flat (O(1) dispatch) and grouped (registry routing) modes.
 * Wires progress notifications when the client opts in via `_meta.progressToken`.
 */
function createToolCallHandler<TContext>(hCtx: HandlerContext<TContext>) {
    return async (
        request: { params: { name: string; arguments?: Record<string, unknown> } },
        extra: unknown,
    ) => {
        const { name, arguments: args = {} } = request.params;
        const ctx = hCtx.contextFactory
            ? await hCtx.contextFactory(extra)
            : _missingContextProxy as TContext;

        const progressSink = createProgressSink(extra);
        const signal = extractSignal(extra);
        const elicitSink = extractElicitSink(extra);
        const emit = hCtx.telemetry;

        // ── Telemetry: route event ──────────────────────────
        // Resolve group/action from the routing map instead of naive
        // split('_') — avoids misattributing tools with underscores
        // in their names (e.g. 'user_accounts_list' → group='user_accounts', action='list').
        //
        // Lazy evaluation: recompile() is deferred until the first consumer
        // needs it (telemetry, FSM gate, or routing). Zero overhead when
        // none of these features are active.
        let _cachedExposition: ReturnType<typeof hCtx.recompile> | undefined;
        const getExposition = (): ReturnType<typeof hCtx.recompile> | undefined => {
            if (!hCtx.isFlat) return undefined;
            if (!_cachedExposition) _cachedExposition = hCtx.recompile();
            return _cachedExposition;
        };

        const exposition = getExposition();
        const flatRoute = exposition?.routingMap.get(name);
        const toolGroup = flatRoute ? flatRoute.builder.getName() : name;
        const action = flatRoute ? flatRoute.actionKey : name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
        emit?.({ type: 'route', tool: toolGroup, action, args, timestamp: Date.now() } as any);

        // Per-request FSM clone for serverless isolation ( +  fix).
        // Pass tool args so resolveStateHandle can extract a tool-minted handle.
        const fsm = await cloneAndRestoreFsm(hCtx, extra, args as Record<string, unknown> | undefined);

        // Resolve the canonical FSM tool name:
        // - Flat mode: `name` is already the action-qualified key
        // - Grouped mode: compose `group.action` to match FSM bindings
        //   (grouped `name` is the builder name, e.g. 'billing', not the
        //    action-qualified key 'billing.get_invoice')
        const fsmToolName = flatRoute ? name : `${toolGroup}.${action}`;

        // enforce FSM gate on tools/call — not just tools/list.
        // Without this, a client that knows a tool's name can bypass the gate.
        if (fsm && fsm.hasBindings && !fsm.isToolAllowed(fsmToolName)) {
            return toolError('FORBIDDEN', {
                message: `Tool "${name}" is not available in the current FSM state ("${fsm.currentState}").`,
                suggestion: 'This tool is gated by the FSM State Gate. Call an allowed tool to advance the state first.',
                availableActions: fsm.getVisibleToolNames([...new Set(
                    (exposition?.tools ?? hCtx.registry.getAllTools()).map(t => t.name),
                )]),
                severity: 'error',
                details: { currentState: fsm.currentState, blockedTool: name },
            });
        }

        // ── FHP: proxy tools/call when handoff tunnel is active ──────────────────
        // This check MUST happen before the local tool execution block below.
        // When a session has an active handoff, the LLM will call upstream tools
        // (e.g. 'finance.refund') that do not exist in the gateway registry.
        // Checking for an active handoff FIRST short-circuits the local execution
        // entirely, giving clean telemetry and avoiding the unnecessary registry lookup.
        if (hCtx.swarmGateway) {
            const stateHandle = resolveStateHandle(extra, hCtx, args as Record<string, unknown> | undefined);
            if (hCtx.swarmGateway.hasActiveHandoff(stateHandle)) {
                // Handle return_to_triage
                if (name.endsWith('.return_to_triage')) {
                    await hCtx.swarmGateway.returnToGateway(stateHandle);
                    hCtx.notifyToolListChanged?.();
                    return { content: [{ type: 'text' as const, text: '[RETURN] Specialised session ended. Gateway tools restored.' }] };
                }
                const callSignal = extractSignal(extra) ?? new AbortController().signal;
                const proxied = await hCtx.swarmGateway.proxyToolsCall(stateHandle, name, args as Record<string, unknown>, callSignal);
                if (proxied !== null) return proxied;
                // proxied === null means the gateway deferred (e.g. unknown tool in upstream);
                // fall through to local execution so gateway-native tools still work.
            }
        }

        let result: ToolResponse;
        const t0 = Date.now();

        // Core execution — wrapped in elicitation runtime so readInput()
        // can resolve answers via AsyncLocalStorage on re-entry.
        const executeLocal = async (): Promise<ToolResponse> => {
        try {
        if (hCtx.isFlat) {
            // Reuse exposition compiled above for telemetry (avoid double recompile)
            if (flatRoute) {
                const enrichedArgs = { ...args, [flatRoute.discriminator]: flatRoute.actionKey };
                const r = await flatRoute.builder.execute(ctx, enrichedArgs, progressSink, signal);
                // Skip state-sync decoration for non-terminal input-required returns:
                // invalidation must fire on the terminal response after re-entry, not now.
                return isInputRequiredResponse(r) ? r : decorateIfSync(hCtx.syncLayer, flatRoute, r);
            } else {
                const r = await hCtx.registry.routeCall(ctx, name, args, progressSink, signal);
                return hCtx.syncLayer && !isInputRequiredResponse(r) ? hCtx.syncLayer.decorateResult(name, r) : r;
            }
        } else {
            const r = await hCtx.registry.routeCall(ctx, name, args, progressSink, signal);
            return hCtx.syncLayer && !isInputRequiredResponse(r) ? hCtx.syncLayer.decorateResult(name, r) : r;
        }
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
            emit?.({ type: 'error', tool: toolGroup, action, error: String(err), timestamp: Date.now() } as any);
            throw err;
        }
        };

        // Drive return-based input requests (requireInput).
        // On 2025-era connections the framework fulfills each requested input
        // over the live sendRequest channel and re-enters the handler.
        // Zero added overhead when elicitSink is undefined and no input is requested.
        result = await runWithElicitation(executeLocal, elicitSink);

        // ── Self-Healing: enrich validation errors with contract deltas ( fix) ──
        if (result.isError && hCtx.selfHealing) {
            const firstContent = result.content[0];
            const text = firstContent?.type === 'text' ? (firstContent as { text: string }).text : '';
            if (text) {
                const healing = enrichValidationError(text, toolGroup, action, hCtx.selfHealing);
                if (healing.injected) {
                    result = { ...result, content: [{ type: 'text' as const, text: healing.enrichedError }] };
                }
            }
        }

        // ── FHP: detect HandoffResponse and activate SwarmGateway tunnel ──────────
        if (isHandoffResponse(result) && hCtx.swarmGateway) {
            const stateHandle = resolveStateHandle(extra, hCtx, args as Record<string, unknown> | undefined);
            // Reuse the signal already extracted at the top of this handler (line ~656).
            // Using a new name avoids shadowing the outer `signal` variable.
            const handoffSignal = signal ?? new AbortController().signal;
            const gateway = hCtx.swarmGateway;
            const payload = result.payload;

            // Activate tunnel asynchronously — ACK is returned immediately to the LLM
            void gateway.activateHandoff(payload, stateHandle, handoffSignal)
                .then(() => hCtx.notifyToolListChanged?.())
                .catch(() => hCtx.notifyToolListChanged?.());

            // Cognitive anchor: visible ACK prevents LLM anxiety loop while tools reload.
            // Uses HANDOFF_CONNECTING (not HANDOFF_UPSTREAM_UNAVAILABLE): the latter
            // signals a failure to the LLM, whereas here the upstream is actively connecting.
            return toolError('HANDOFF_CONNECTING', {
                message: `[HANDOFF] ${payload.reason ?? 'Specialist selected'}. Your tools are being updated — please wait.`,
                suggestion: 'Wait for the tools list to refresh, then proceed with the specialised tools.',
                severity: 'warning',
            }) as unknown as ToolResponse;
        }

        // ── Telemetry: execute event ─────────────────────────
        // Single Date.now() capture ensures durationMs and timestamp are coherent.
        const t1 = Date.now();
        emit?.({   
            type: 'execute', tool: toolGroup, action,
            durationMs: t1 - t0,
            isError: !!result.isError,
            timestamp: t1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
        } as any);

        // FSM State Gate: auto-transition on successful execution
        if (fsm && !result.isError) {
            const transitionEvent = fsm.getTransitionEvent(fsmToolName);
            if (transitionEvent) {
                const fromState = fsm.currentState;
                const transition = await fsm.transition(transitionEvent);
                if (transition.changed) {
                    // Emit fsm.transition telemetry event
                    if (hCtx.telemetry) {
                         
                    hCtx.telemetry({
                            type: 'fsm.transition',
                            tool: name,
                            action: transitionEvent,
                            from: fromState,
                            to: fsm.currentState,
                            timestamp: Date.now(),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
                        } as any);
                    }
                    // Persist new state to external store (serverless/edge)
                    // Use state handle (session ID or tool-minted handle) for transports without sessions
                    const stateHandle = resolveStateHandle(extra, hCtx, args as Record<string, unknown> | undefined);
                    if (hCtx.fsmStore) {
                        await hCtx.fsmStore.save(stateHandle, fsm.snapshot());
                    } else if (hCtx.fsmMemorySnapshots) {
                        // persist to in-memory state map
                        hCtx.fsmMemorySnapshots.set(stateHandle, fsm.snapshot());
                    }
                    // Notify client to re-fetch tools/list
                    hCtx.notifyToolListChanged?.();
                }
            }
        }

        return result;
    };
}

/**
 * Decorate a flat-route result with state-sync metadata when applicable.
 * Uses the canonical dot-notation key for policy matching.
 */
function decorateIfSync<TContext>(
    syncLayer: StateSyncLayer | undefined,
    flatRoute: FlatRoute<TContext>,
    result: ToolResponse,
): ToolResponse {
    if (!syncLayer) return result;
    const canonicalKey = `${flatRoute.builder.getName()}.${flatRoute.actionKey}`;
    return syncLayer.decorateResult(canonicalKey, result);
}

/**
 * Register `prompts/list` and `prompts/get` handlers on the server.
 *
 * Wires the prompt lifecycle notification sink and the internal
 * loopback dispatcher that allows prompts to invoke tools in-memory.
 */
function registerPromptHandlers<TContext>(
    resolved: McpServerTyped,
    server: unknown,
    prompts: PromptRegistry<TContext>,
    registry: RegistryDelegate<TContext>,
    filter?: { tags?: string[]; anyTag?: string[]; exclude?: string[] },
    contextFactory?: (extra: unknown) => TContext | Promise<TContext>,
    listCacheTtlMs?: number,
): void {
    // Wire lifecycle sync
    const serverAny = server as Record<string, unknown>;
    const sendFn = serverAny['sendPromptListChanged'];
    if (typeof sendFn === 'function') {
        prompts.setNotificationSink(() => { sendFn.call(server); });
    }

    // prompts/list
    const promptCacheMeta = buildListCacheMeta({ listCacheTtlMs });
    resolved.setRequestHandler('prompts/list', async (
        request: { params?: { cursor?: string } },
    ) => {
        const params: { filter?: PromptFilter; cursor?: string } = {};
        if (filter) params.filter = filter as PromptFilter;
        if (request.params?.cursor) params.cursor = request.params.cursor;
        const result = await prompts.listPrompts(params);
        return { ...result, ...(promptCacheMeta ?? {}) };
    });

    // prompts/get — with loopback dispatcher and signal propagation
    resolved.setRequestHandler('prompts/get', async (
        request: { params: { name: string; arguments?: Record<string, string> } },
        extra: unknown,
    ) => {
        const { name, arguments: args = {} } = request.params;
        const ctx = contextFactory
            ? await contextFactory(extra)
            : _missingContextProxy as TContext;
        const signal = extractSignal(extra);

        const enrichedCtx = injectLoopbackDispatcher(ctx, registry, signal);
        return prompts.routeGet(enrichedCtx, name, args);
    });
}

/**
 * Inject `invokeTool()` into the context so prompt handlers can call
 * tools in-memory. Runs the Tool's full pipeline with RBAC enforced.
 * Propagates the cancellation signal from the parent request.
 */
function injectLoopbackDispatcher<TContext>(
    ctx: TContext,
    registry: RegistryDelegate<TContext>,
    signal?: AbortSignal,
): TContext & LoopbackContext {
    // Protect the original context from mutation — use prototype-based proxy
    // for object contexts (safe — no property copy). For non-object contexts
    // (primitives or null), start with an empty wrapper.
    let wrapped: Record<string, unknown>;
    if (ctx != null && typeof ctx === 'object') {
        wrapped = Object.create(ctx as object) as Record<string, unknown>;
    } else {
        // ctx is null, undefined, or a primitive — start fresh.
        // No prototype pollution risk here: no properties to copy.
        wrapped = {};
    }
    wrapped['invokeTool'] = async (
        toolName: string,
        toolArgs: Record<string, unknown> = {},
    ) => {
        const response = await registry.routeCall(wrapped as TContext, toolName, toolArgs, undefined, signal);
        const text = response.content
            .filter((c: { type: string }): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c: { type: 'text'; text: string }) => c.text)
            .join('\n');
        return {
            text,
            isError: response.isError ?? false,
            raw: response,
        };
    };
    return wrapped as TContext & LoopbackContext;
}

/**
 * Typed interface for MCP SDK v2 Server with resource + subscribe handler support.
 */
interface McpServerWithResourceSubscriptions {
    setRequestHandler(method: string, handler: (...args: never[]) => unknown): void;
}

/**
 * Register `resources/list`, `resources/read`, `resources/subscribe`,
 * and `resources/unsubscribe` handlers on the MCP server.
 *
 * Wires the ResourceRegistry notification sink to the MCP server's
 * notification method for push delivery via SSE/Streamable HTTP.
 *
 * @internal
 */
function registerResourceHandlers<TContext>(
    resolved: McpServerTyped,
    server: unknown,
    resources: ResourceRegistry<TContext>,
    contextFactory?: (extra: unknown) => TContext | Promise<TContext>,
    introspection?: {
        config: IntrospectionConfig<TContext>;
        serverName: string;
        builders: { values: () => Iterable<ToolBuilder<TContext>> };
    },
    listCacheTtlMs?: number,
): void {
    const resourceServer = resolved as unknown as McpServerWithResourceSubscriptions;

    // Pre-compute introspection manifest URI for merge.
    const manifestUri = introspection?.config.uri ?? 'mcpfusion://manifest.json';

    // Wire notification sink for `notifications/resources/updated`
    const serverAny = server as Record<string, unknown>;
    const sendResourceUpdated = serverAny['sendResourceUpdated'];
    const sendNotification = serverAny['notification'];

    if (typeof sendResourceUpdated === 'function') {
        resources.setNotificationSink((uri: string) => {
            (sendResourceUpdated as (...args: unknown[]) => unknown).call(server, uri);
        });
    } else if (typeof sendNotification === 'function') {
        resources.setNotificationSink((uri: string) => {
            void (sendNotification as (...args: unknown[]) => unknown).call(server, {
                method: 'notifications/resources/updated',
                params: { uri },
            });
        });
    }

    // Wire lifecycle sync for `notifications/resources/list_changed`
    const sendListChanged = serverAny['sendResourceListChanged'];
    if (typeof sendListChanged === 'function') {
        resources.setListChangedSink(() => { (sendListChanged as (...args: unknown[]) => unknown).call(server); });
    }

    // resources/list — merge with introspection resources if present
    // The handler is a per-request arrow function (not an IIFE) so that
    // resources registered or removed dynamically after attachToServer() are
    // always reflected in the response.
    const resourceCacheMeta = buildListCacheMeta({ listCacheTtlMs });
    resourceServer.setRequestHandler('resources/list', (() => {
        return () => {
            const list = resources.listResources();
            if (introspection) {
                list.push({
                    uri: manifestUri,
                    name: 'mcpfusion:manifest',
                    description: 'Dynamic introspection manifest exposing all registered tools, actions, and presenters. RBAC-filtered per session context.',
                    mimeType: 'application/json',
                });
            }
            return { resources: list, ...(resourceCacheMeta ?? {}) };
        };
    })() as (...args: never[]) => unknown);

    // resources/templates/list — MCP 2.0 (2026-07-28) URI template resources
    resourceServer.setRequestHandler('resources/templates/list', ((
        request: { params?: { cursor?: string } },
    ) => {
        const cursor = request.params?.cursor;
        const result = resources.listResourceTemplates(cursor);
        return { ...result, ...(resourceCacheMeta ?? {}) };
    }) as (...args: never[]) => unknown);

    // resources/read — with introspection manifest delegation ( fix)
    resourceServer.setRequestHandler('resources/read', (async (
        request: { params: { uri: string } },
        extra: unknown,
    ) => {
        // Handle introspection manifest URI before ResourceRegistry
        if (introspection && request.params.uri === manifestUri) {
            const fullManifest = compileManifest(
                introspection.serverName,
                introspection.builders.values(),
            );
            let manifest = fullManifest;
            if (introspection.config.filter && contextFactory) {
                const ctx = await contextFactory(extra);
                manifest = introspection.config.filter(cloneManifest(fullManifest), ctx);
            }
            return {
                contents: [{
                    uri: manifestUri,
                    mimeType: 'application/json',
                    text: JSON.stringify(manifest, null, 2),
                }],
            };
        }

        const ctx = contextFactory
            ? await contextFactory(extra)
            : _missingContextProxy as TContext;
        return resources.readResource(request.params.uri, ctx);
    }) as (...args: never[]) => unknown);

    // resources/subscribe
    resourceServer.setRequestHandler('resources/subscribe', ((
        request: { params: { uri: string } },
    ) => {
        const accepted = resources.subscribe(request.params.uri);
        if (!accepted) {
            return {
                _meta: {},
            };
        }
        return { _meta: {} };
    }) as (...args: never[]) => unknown);

    // resources/unsubscribe
    resourceServer.setRequestHandler('resources/unsubscribe', ((
        request: { params: { uri: string } },
    ) => {
        resources.unsubscribe(request.params.uri);
        return { _meta: {} };
    }) as (...args: never[]) => unknown);

    // subscriptions/listen — MCP 2.0 (2026-07-28) stream-based subscription pattern.
    // Replaces the 2025-era resources/subscribe with a unified, filter-aware stream.
    // The client sends a SubscriptionFilter; the server acknowledges and then pushes
    // notifications (tools/list_changed, resources/updated, etc.) on this stream.
    resourceServer.setRequestHandler('subscriptions/listen', (async (
        request: { params?: { notifications?: SubscriptionFilter } },
        extra: unknown,
    ) => {
        const filter = request.params?.notifications ?? {};
        const subscriptionId = String(Math.random().toString(36).slice(2));

        // Register the subscription filter with the SubscriptionManager.
        // Pass the sendNotification function as the stream sink so that
        // pushNotification() actually delivers notifications to the client.
        const extraObj = extra as Record<string, unknown> | null;
        const sendNotification = extraObj?.['sendNotification'];
        const streamSink = typeof sendNotification === 'function'
            ? (notification: unknown) => {
                void (sendNotification as (...args: unknown[]) => Promise<void>)(notification);
            }
            : undefined;
        resources.registerSubscriptionFilter(subscriptionId, filter, streamSink);

        // Send acknowledgment notification (first message on the stream)
        if (typeof sendNotification === 'function') {
            try {
                await (sendNotification as (...args: unknown[]) => Promise<void>)({
                    method: 'notifications/subscriptions/acknowledged',
                    params: { notifications: filter },
                });
            } catch {
                // Best-effort — client may not support acknowledged notification
            }
        }

        // The stream stays open — the SDK v2 Server keeps the request pending.
        // Notifications are pushed via the notification sink wired below.
        // The stream ends when the client cancels (notifications/cancelled) or
        // the server sends a result (graceful shutdown).
        return {
            _meta: { 'io.modelcontextprotocol/subscriptionId': subscriptionId },
        };
    }) as (...args: never[]) => unknown);
}

/**
 * Create the detach function that replaces all handlers with no-ops.
 */
function createDetachFn(
    resolved: McpServerTyped,
    hasPrompts: boolean,
): DetachFn {
    return () => {
        resolved.setRequestHandler('tools/list', () => ({ tools: [] }));
        resolved.setRequestHandler('tools/call', () =>
            error('Tool handlers have been detached'),
        );
        if (hasPrompts) {
            resolved.setRequestHandler('prompts/list', () => ({ prompts: [] }));
            resolved.setRequestHandler('prompts/get', () => ({
                messages: [{ role: 'user', content: { type: 'text', text: 'Prompt handlers have been detached' } }],
            }));
        }
    };
}

// ── Public API ───────────────────────────────────────────

/**
 * Attach a registry to an MCP Server.
 *
 * Resolves the server type, registers tools/list and tools/call handlers,
 * and returns a detach function to remove the handlers.
 *
 * @param server - Server or McpServer instance (duck-typed)
 * @param registry - Delegate providing tool listing and routing
 * @param options - Filter and context factory options
 * @returns A detach function to remove the handlers
 */
export async function attachToServer<TContext>(
    server: unknown,
    registry: RegistryDelegate<TContext>,
    options: AttachOptions<TContext> = {},
): Promise<DetachFn> {
    const resolved = resolveServer(server) as McpServerTyped;

    const {
        filter, contextFactory, debug, tracing, stateSync,
        introspection, serverName,
        toolExposition = 'flat', actionSeparator = '_',
        prompts, zeroTrust, selfHealing, swarmGateway,
    } = options;

    // 1. Propagate observability to all registered builders
    propagateObservability(registry, debug, tracing, options.telemetry);

    // 2. Create State Sync layer (zero overhead when not configured)
    //    Merge manual policies with fluent hints from builders (.invalidates(), .cached())
    const mergedSyncConfig = mergeStateSyncConfig(stateSync, registry.getBuilders());
    const syncLayer = mergedSyncConfig ? new StateSyncLayer(mergedSyncConfig) : undefined;

    // 3. Register introspection resource (zero overhead when disabled)
    //    When `resources` is also configured, introspection is merged
    //    into registerResourceHandlers to avoid setRequestHandler overwrite.
    if (introspection?.enabled && !options.resources) {
        registerIntrospectionResource(
            resolved,
            introspection,
            serverName ?? 'mcpfusion-server',
            { values: () => registry.getBuilders() },
            contextFactory,
        );
    }

    // 3b. Zero-Trust: compile contracts, compute digest, verify attestation
    //     Zero overhead when not configured — no crypto operations run.
    if (zeroTrust) {
        const contracts = await compileContracts(registry.getBuilders());
        const serverDigest = await computeServerDigest(contracts);

        // Synchronous digest comparison (no signer needed for pinning)
        if (zeroTrust.expectedDigest && serverDigest.digest !== zeroTrust.expectedDigest) {
            if (zeroTrust.failOnMismatch ?? true) {
                throw new AttestationError(
                    `[mcpfusion] Zero-Trust attestation failed: computed digest ${serverDigest.digest} does not match expected ${zeroTrust.expectedDigest}`,
                    {
                        valid: false,
                        computedDigest: serverDigest.digest,
                        expectedDigest: zeroTrust.expectedDigest,
                        signature: null,
                        signerName: typeof zeroTrust.signer === 'string' ? zeroTrust.signer : zeroTrust.signer.name,
                        attestedAt: new Date().toISOString(),
                        error: `Digest mismatch: ${serverDigest.digest} !== ${zeroTrust.expectedDigest}`,
                    },
                );
            }
        }
    }

    // 4. Build handler context (shared state for all handler factories)

    // FSM State Gate: auto-bind tool bindings from builders
    const { fsm, fsmStore } = options;
    if (fsm) {
        autoBindFsmFromBuilders(fsm, registry.getBuilders(), toolExposition, actionSeparator);
    }

    // Wire the notification sink for list_changed (FSM transitions + FHP swarm)
    let notifyToolListChanged: (() => void) | undefined;
    if (fsm || swarmGateway) {
        const serverAny = server as Record<string, unknown>;
        const sendFn = serverAny['sendToolListChanged'] ?? serverAny['notification'];
        if (typeof sendFn === 'function') {
            notifyToolListChanged = () => {
                try {
                    void (sendFn as (...args: unknown[]) => unknown).call(server, { method: 'notifications/tools/list_changed' });
                } catch {
                    // Connection might not be established — ignore
                }
            };
        }
    }

    // exposition dirty flag — O(1) cache validation
    // Starts dirty to force initial compile, then stays clean until invalidated.
    let _expositionDirty = true;

    const hCtx: HandlerContext<TContext> = {
        registry,
        ...(filter ? { filter } : {}),
        ...(contextFactory ? { contextFactory } : {}),
        ...(syncLayer ? { syncLayer } : {}),
        toolExposition, actionSeparator,
        isFlat: toolExposition === 'flat',
        // O(1) exposition cache with dirty flag + builder-count safety net.
        // The dirty flag provides O(1) fast-path invalidation (set whenever a builder
        // registers or the filter changes). The builder-count safety net catches
        // late-registered builders that might have been missed by the dirty flag.
        //
        //  (Performance) fix: previous safety net iterated `registry.getBuilders()`
        // with a for...of loop (O(n)) on every tools/call request even on the cache hit path.
        // `ToolRegistry.size` is a Map.size getter — always O(1). No loop needed.
        recompile: (() => {
            let cachedResult: ExpositionResult<TContext> | undefined;
            let cachedBuilderCount = -1;
            let cachedCompactMode: boolean | undefined;
            return (fsmCompactMode?: boolean) => {
                // O(1) size check: detect late-registered builders without iterating.
                const currentCount = registry.size;
                // Invalidate cache when FSM compact mode changes (progressive disclosure transition)
                const compactModeChanged = fsmCompactMode !== cachedCompactMode;
                if (!_expositionDirty && cachedResult && currentCount === cachedBuilderCount && !compactModeChanged) {
                    return cachedResult;
                }
                _expositionDirty = false;
                cachedBuilderCount = currentCount;
                cachedCompactMode = fsmCompactMode;
                const builders = [...registry.getBuilders()];
                // route diagnostic warnings through debug observer
                const warnFn = debug
                    ? (msg: string) => debug({ type: 'error', tool: '', action: '', error: msg, step: 'route', timestamp: Date.now() })
                    : undefined;
                cachedResult = compileExposition(builders, toolExposition, actionSeparator, warnFn, fsmCompactMode);
                return cachedResult;
            };
        })(),
        ...(fsm ? { fsm } : {}),
        ...(fsmStore ? { fsmStore } : {}),
        // in-memory FSM snapshot store when no external fsmStore
        // bounded LRU eviction (max 10,000 entries) to prevent
        // unbounded memory growth proportional to unique session count.
        ...(fsm && !fsmStore ? { fsmMemorySnapshots: createBoundedSnapshotMap(10_000) } : {}),
        ...(notifyToolListChanged ? { notifyToolListChanged } : {}),
        ...(options.telemetry ? { telemetry: options.telemetry } : {}),
        ...(selfHealing ? { selfHealing } : {}),
        ...(swarmGateway ? { swarmGateway } : {}),
        // per-attachment UUID — never use static key for session-scoped mutable state
        fallbackStateHandle: randomUUID(),
        // MCP 2026-07-28 SEP-2549: cache hints for list responses.
        // Default 5 min; 0 disables (no-store).
        listCacheTtlMs: options.listCacheTtlMs ?? 300_000,
        listCacheScope: options.listCacheScope ?? 'private',
        ...(options.stateHandleKey ? { stateHandleKey: options.stateHandleKey } : {}),
    };

    // 5. Register tool handlers
    resolved.setRequestHandler('tools/list', createToolListHandler(hCtx));
    resolved.setRequestHandler('tools/call', createToolCallHandler(hCtx));

    // 6. Register prompt handlers (zero overhead when omitted)
    if (prompts) {
        registerPromptHandlers(resolved, server, prompts, registry, filter, contextFactory, hCtx.listCacheTtlMs);
    }

    // 7. Register resource handlers (zero overhead when omitted)
    const { resources } = options;
    if (resources) {
        // pass introspection config so manifest resource is merged
        // into ResourceRegistry handlers instead of being overwritten.
        registerResourceHandlers(
            resolved, server, resources, contextFactory,
            introspection?.enabled ? {
                config: introspection,
                serverName: serverName ?? 'mcpfusion-server',
                builders: { values: () => registry.getBuilders() },
            } : undefined,
            hCtx.listCacheTtlMs,
        );
    }

    // 8. Return detach function
    return createDetachFn(resolved, prompts !== undefined);
}

// ── Flat Tool Filtering ──────────────────────────────────

/**
 * Filter flat tools by tag criteria.
 *
 * Maps each flat tool back to its originating builder to check tags,
 * then applies the standard tag filter logic.
 */
function filterFlatTools<TContext>(
    tools: McpTool[],
    routeMap: ReadonlyMap<string, FlatRoute<TContext>>,
    filter: { tags?: string[]; anyTag?: string[]; exclude?: string[] },
): McpTool[] {
    const requiredTags = filter.tags && filter.tags.length > 0 ? new Set(filter.tags) : undefined;
    const anyTags = filter.anyTag && filter.anyTag.length > 0 ? new Set(filter.anyTag) : undefined;
    const excludeTags = filter.exclude && filter.exclude.length > 0 ? new Set(filter.exclude) : undefined;

    if (!requiredTags && !anyTags && !excludeTags) return tools;

    return tools.filter(tool => {
        const route = routeMap.get(tool.name);
        if (!route) return true; // Non-flat tool, include by default

        const builderTags = route.builder.getTags();

        // AND logic: builder must have ALL required tags
        if (requiredTags && !Array.from(requiredTags).every(t => builderTags.includes(t))) {
            return false;
        }

        // OR logic: builder must have at least ONE of these tags
        if (anyTags && !builderTags.some(t => anyTags.has(t))) {
            return false;
        }

        // Exclude: builder must NOT have ANY of these tags
        if (excludeTags && builderTags.some(t => excludeTags.has(t))) {
            return false;
        }

        return true;
    });
}

// ── Progress Sink Factory ────────────────────────────────

/**
 * Duck-type check: the extra object from MCP SDK has _meta and sendNotification.
 */
function isMcpExtra(extra: unknown): extra is McpRequestExtra {
    return (
        typeof extra === 'object' &&
        extra !== null &&
        'sendNotification' in extra &&
        typeof (extra as McpRequestExtra).sendNotification === 'function'
    );
}

/**
 * Create a ProgressSink from the MCP request `extra` object.
 *
 * When the client includes `_meta.progressToken` in its `tools/call` request,
 * this factory returns a ProgressSink that maps each internal ProgressEvent
 * to the MCP `notifications/progress` protocol wire format.
 *
 * When no progressToken is present (client didn't opt in),
 * returns `undefined` — zero overhead.
 *
 * @param extra - The MCP request handler's extra argument (duck-typed)
 * @returns A ProgressSink or undefined
 */
function createProgressSink(extra: unknown): ProgressSink | undefined {
    if (!isMcpExtra(extra)) return undefined;

    const token = extra._meta?.progressToken;
    if (token === undefined) return undefined;

    const sendNotification = extra.sendNotification;

    return (event: ProgressEvent): void => {
        // Fire-and-forget: progress notifications are best-effort.
        // We intentionally do not await to avoid blocking the handler pipeline.
        void sendNotification({
            method: 'notifications/progress',
            params: {
                progressToken: token,
                progress: event.percent,
                total: 100,
                message: event.message,
            },
        });
    };
}

// ── Signal Extraction ────────────────────────────────────

/**
 * Extract the AbortSignal from the MCP SDK `extra` object.
 *
 * The SDK fires this signal when the client sends `notifications/cancelled`
 * or when the transport connection drops. By extracting and propagating it,
 * the framework enables cooperative cancellation at every pipeline layer.
 *
 * Returns `undefined` when not available — zero overhead.
 *
 * @param extra - The MCP request handler's extra argument (duck-typed)
 * @returns The AbortSignal or undefined
 */
function extractSignal(extra: unknown): AbortSignal | undefined {
    if (!isMcpExtra(extra)) return undefined;
    return extra.signal;
}

// ── Elicitation Sink Extraction ────────────────────────

/**
 * Extract the elicitation transport function from the MCP SDK `extra` object.
 *
 * When the MCP SDK provides `sendRequest`, this returns a function that
 * sends `elicitation/create` requests to the client for human-in-the-loop
 * workflows. Used by the elicitation runtime to fulfill `requireInput()`
 * requests on 2025-era (stateful) connections.
 *
 * @deprecated MCP 2.0 (`2026-07-28`) deprecates the `sendRequest` channel.
 * This extractor remains for backward compatibility with 2025-era clients
 * during the deprecation window. New code should use the return-based
 * `requireInput()` + `readInput()` model instead.
 *
 * Returns `undefined` when not available — zero overhead.
 *
 * @param extra - The MCP request handler's extra argument (duck-typed)
 * @returns An ElicitSink or undefined
 */
function extractElicitSink(extra: unknown): ElicitSink | undefined {
    if (!isMcpExtra(extra)) return undefined;
    const sendRequest = extra.sendRequest;
    if (typeof sendRequest !== 'function') return undefined;
    return sendRequest as ElicitSink;
}

// ── State Sync Hint Collection ──────────────────────────────

/**
 * Collect per-builder state sync hints and merge with manual config.
 *
 * Three scenarios:
 * 1. Manual `stateSync` only — returns it unchanged
 * 2. Fluent hints only — generates policies automatically
 * 3. Both — fluent-generated policies are appended AFTER manual ones
 *    (first-match-wins, so manual policies take precedence)
 *
 * Zero overhead when neither is configured.
 */
function mergeStateSyncConfig<TContext>(
    manual: StateSyncConfig | undefined,
    builders: Iterable<ToolBuilder<TContext>>,
): StateSyncConfig | undefined {
    const hintPolicies = collectHintPolicies(builders);

    if (hintPolicies.length === 0) return manual;
    if (!manual) return { policies: hintPolicies };

    // Merge: manual first (higher precedence), then auto-generated
    return {
        ...manual,
        policies: [...manual.policies, ...hintPolicies],
    };
}

/**
 * Walk all builders and convert their StateSyncHints into SyncPolicy[].
 *
 * For each builder with hints:
 * - `'*'` key → tool-level policy matching `{toolName}.*`
 * - Named action keys → action-level policy matching `{toolName}.{actionKey}`
 */
function collectHintPolicies<TContext>(
    builders: Iterable<ToolBuilder<TContext>>,
): SyncPolicy[] {
    const policies: SyncPolicy[] = [];

    for (const builder of builders) {
        if (!builder.getStateSyncHints) continue;
        const hints = builder.getStateSyncHints();
        if (hints.size === 0) continue;

        const toolName = builder.getName();

        for (const [key, hint] of hints) {
            const match = key === '*' ? `${toolName}.*` : `${toolName}.${key}`;
            policies.push({
                match,
                ...(hint.cacheControl ? { cacheControl: hint.cacheControl } : {}),
                ...(hint.invalidates != null && hint.invalidates.length > 0 ? { invalidates: [...hint.invalidates] } : {}),
            });
        }
    }

    return policies;
}

// ── Session ID Extraction ──────────────────────────────

/**
 * Create a bounded Map for in-memory FSM snapshots with LRU eviction.
 *
 * When the map exceeds `maxSize`, the oldest entry (first inserted) is evicted.
 * Uses native `Map` iteration order guarantee (insertion order) as the LRU proxy.
 * On `get()`, the accessed entry is re-inserted to refresh its position.
 *
 * prevents unbounded memory growth proportional to unique sessions.
 */
function createBoundedSnapshotMap(maxSize: number): Map<string, FsmSnapshot> {
    const map = new Map<string, FsmSnapshot>();
    const originalSet = map.set.bind(map);
    const originalGet = map.get.bind(map);
    const originalHas = map.has.bind(map);
    const originalDelete = map.delete.bind(map);

    map.get = (key: string): FsmSnapshot | undefined => {
        const value = originalGet(key);
        if (value !== undefined) {
            // Refresh position: delete and re-insert to make it "most recently used"
            originalDelete(key);
            originalSet(key, value);
        }
        return value;
    };

    map.set = (key: string, value: FsmSnapshot): Map<string, FsmSnapshot> => {
        // If key already exists, delete first to refresh position
        if (originalHas(key)) {
            originalDelete(key);
        }
        originalSet(key, value);
        // Evict oldest entry if over capacity
        if (map.size > maxSize) {
            const oldest = map.keys().next().value;
            if (oldest !== undefined) originalDelete(oldest);
        }
        return map;
    };

    return map;
}


/**
 * Extract the MCP session identifier from the request `extra` object.
 *
 * For Streamable HTTP transport, the session ID comes from the
 * `Mcp-Session-Id` header. For stdio/SSE transports with persistent
 * connections, a stable session ID may be available from the SDK.
 *
 * Returns `undefined` when not available (stdio transport without session tracking).
 *
 * @param extra - The MCP request handler's extra argument (duck-typed)
 * @returns Session ID string or undefined
 */
function extractSessionId(extra: unknown): string | undefined {
    if (typeof extra !== 'object' || extra === null) return undefined;
    const ex = extra as Record<string, unknown>;
    // Standard MCP SDK session ID
    if (typeof ex['sessionId'] === 'string') return ex['sessionId'];
    // Streamable HTTP: from request headers  
    const headers = ex['headers'] as Record<string, unknown> | undefined;
    if (headers && typeof headers['mcp-session-id'] === 'string') {
        return headers['mcp-session-id'];
    }
    return undefined;
}

// ── FSM Auto-Binding ─────────────────────────────────

/**
 * Auto-bind FSM tool bindings from all registered builders.
 *
 * Walks all builders, checks for `.bindState()` metadata, and registers
 * the bindings on the `StateMachineGate`. This allows the dev to use
 * `.bindState()` on FluentToolBuilder without manually calling
 * `gate.bindTool()` for each tool.
 *
 * In flat exposition mode, tool names are `{toolName}{separator}{actionKey}`.
 * In grouped mode, tool names are just the builder's name.
 */
function autoBindFsmFromBuilders<TContext>(
    gate: StateMachineGate,
    builders: Iterable<ToolBuilder<TContext>>,
    exposition: ToolExposition,
    separator: string,
): void {
    for (const builder of builders) {
        // Duck-type: check if builder has getFsmBinding
        const getFsm = (builder as unknown as Record<string, unknown>)['getFsmBinding'];
        if (typeof getFsm !== 'function') continue;
        const binding = getFsm.call(builder) as { states: string[]; transition?: string } | undefined;
        if (!binding) continue;

        const toolName = builder.getName();

        if (exposition === 'flat') {
            // In flat mode, each action becomes a separate tool: toolName_actionKey
            // We need to bind each flat tool name to the FSM
            const actions = (builder as unknown as Record<string, unknown>)['getActions'];
            if (typeof actions === 'function') {
                const actionList = actions.call(builder) as Array<{ key: string }>;
                const isSingleAction = actionList.length === 1;
                for (const action of actionList) {
                    // single-action default tools use bare name
                    // (matching ExpositionCompiler.compileFlat behavior)
                    const flatName = (isSingleAction && action.key === 'default')
                        ? toolName
                        : `${toolName}${separator}${action.key}`;
                    gate.bindTool(flatName, binding.states, binding.transition);
                }
            } else {
                // Fallback: bind the base tool name
                gate.bindTool(toolName, binding.states, binding.transition);
            }
        } else {
            // Grouped mode: tool name is just the builder name
            gate.bindTool(toolName, binding.states, binding.transition);
        }
    }
}
