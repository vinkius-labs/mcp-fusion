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
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    SubscribeRequestSchema,
    UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, error, toolError } from '../core/response.js';
import { type ToolBuilder } from '../core/types.js';
import { type ProgressSink, type ProgressEvent } from '../core/execution/ProgressHelper.js';
import { resolveServer } from './ServerResolver.js';
import { type DebugObserverFn } from '../observability/DebugObserver.js';
import { type VurbTracer } from '../observability/Tracing.js';
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
import { type PromptRegistry, type PromptFilter } from '../prompt/PromptRegistry.js';
import { type LoopbackContext } from '../prompt/types.js';
import type { StateMachineGate, FsmStateStore, FsmSnapshot } from '../fsm/StateMachineGate.js';
import type { TelemetrySink } from '../observability/TelemetryEvent.js';
import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────

/**
 * Typed interface for MCP SDK Server with overloaded setRequestHandler signatures.
 * ServerResolver returns the generic McpServerLike; we narrow it here for type-safe handler registration.
 */
interface McpServerTyped {
    setRequestHandler(schema: typeof ListToolsRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof CallToolRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof ListPromptsRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof GetPromptRequestSchema, handler: (...args: never[]) => unknown): void;
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
     * When configured, Vurb automatically:
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
     *         uri: 'vurb://manifest.json',
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
     * **Context propagation limitation**: Since Vurb does not depend
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
     *     tracing: trace.getTracer('vurb'),
     * });
     * ```
     *
     * @see {@link VurbTracer} for the tracer interface contract
     */
    tracing?: VurbTracer;

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
     * @defaultValue `'vurb-server'`
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
     *         secret: process.env.VURB_SIGNING_SECRET,
     *         expectedDigest: process.env.VURB_EXPECTED_DIGEST,
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
    enableTracing?(tracer: VurbTracer): void;
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
    readonly recompile: () => ExpositionResult<TContext>;
    readonly isFlat: boolean;
    readonly fsm?: StateMachineGate;
    readonly fsmStore?: FsmStateStore;
    /** In-memory FSM snapshot store for non-serverless transports without fsmStore (Bug #77 fix). */
    readonly fsmMemorySnapshots?: Map<string, FsmSnapshot>;
    readonly notifyToolListChanged?: () => void;
    readonly telemetry?: TelemetrySink;
    readonly selfHealing?: SelfHealingConfig;
    /** Bug #3 fix: per-attachment UUID fallback for transports without session IDs (e.g. stdio). */
    readonly fallbackSessionId: string;
}

// ── Observability Propagation ────────────────────────────

/**
 * Propagate debug and tracing observers to all registered builders.
 * Zero overhead when neither is configured.
 */
function propagateObservability<TContext>(
    registry: RegistryDelegate<TContext>,
    debug?: DebugObserverFn,
    tracing?: VurbTracer,
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
            `[vurb] Attempted to access "ctx.${String(prop)}" but no contextFactory was provided. ` +
            `Add contextFactory to your attachToServer() options:\n\n` +
            `  registry.attachToServer(server, {\n` +
            `      contextFactory: (extra) => createAppContext(extra),\n` +
            `  });\n`,
        );
    },
});

// ── FSM Session Helpers ──────────────────────────────────

/**
 * Resolve the session ID from the MCP extra argument,
 * falling back to the handler context's stable ID for
 * session-less transports (e.g. stdio).
 *
 * Extracted to eliminate 4× repetition of the same expression.
 */
function resolveSessionId<TContext>(extra: unknown, hCtx: HandlerContext<TContext>): string {
    return extractSessionId(extra) ?? hCtx.fallbackSessionId;
}

/**
 * Clone the FSM and restore the session-specific snapshot.
 *
 * Shared by both `tools/list` and `tools/call` handlers.
 * Eliminates the duplicated clone+restore logic (Bug #3 + Bug #77).
 */
async function cloneAndRestoreFsm<TContext>(
    hCtx: HandlerContext<TContext>,
    extra: unknown,
): Promise<HandlerContext<TContext>['fsm']> {
    let fsm = hCtx.fsm;
    if (!fsm) return undefined;

    fsm = fsm.clone();
    const sessionId = resolveSessionId(extra, hCtx);

    if (hCtx.fsmStore) {
        const snap = await hCtx.fsmStore.load(sessionId);
        if (snap) fsm.restore(snap);
    } else {
        const snap = hCtx.fsmMemorySnapshots?.get(sessionId);
        if (snap) fsm.restore(snap);
    }
    return fsm;
}

// ── Handler Factories ────────────────────────────────────

/**
 * Create the `tools/list` request handler.
 *
 * In flat mode, re-compiles exposition from the current registry state.
 * In grouped mode, delegates to the registry's tag-filtered listing.
 */
function createToolListHandler<TContext>(hCtx: HandlerContext<TContext>) {
    return async (_request: unknown, extra: unknown) => {
        // Per-request FSM clone for serverless isolation (Bug #3 + Bug #77 fix).
        const fsm = await cloneAndRestoreFsm(hCtx, extra);

        let tools: McpTool[];

        if (hCtx.isFlat) {
            const exposition = hCtx.recompile();
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

        return { tools: hCtx.syncLayer ? hCtx.syncLayer.decorateTools(tools) : tools };
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
        const emit = hCtx.telemetry;

        // ── Telemetry: route event ──────────────────────────
        // Resolve group/action from the routing map instead of naive
        // split('_') — avoids misattributing tools with underscores
        // in their names (e.g. 'user_accounts_list' → group='user_accounts', action='list').
        //
        // Bug fix: recompile() was called unconditionally in flat mode, even when
        // neither telemetry nor FSM were active. We now lazily compute it once
        // and reuse the same ExpositionResult for telemetry, FSM gate, and routing.
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

        // Per-request FSM clone for serverless isolation (Bug #3 + Bug #77 fix).
        const fsm = await cloneAndRestoreFsm(hCtx, extra);

        // Bug #107 fix: enforce FSM gate on tools/call — not just tools/list.
        // Without this, a client that knows a tool's name can bypass the gate.
        if (fsm && fsm.hasBindings && !fsm.isToolAllowed(name)) {
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

        let result: ToolResponse;
        const t0 = Date.now();

        try {
        if (hCtx.isFlat) {
            // Reuse exposition compiled above for telemetry (avoid double recompile)
            if (flatRoute) {
                const enrichedArgs = { ...args, [flatRoute.discriminator]: flatRoute.actionKey };
                result = await flatRoute.builder.execute(ctx, enrichedArgs, progressSink, signal);
                result = decorateIfSync(hCtx.syncLayer, flatRoute, result);
            } else {
                result = await hCtx.registry.routeCall(ctx, name, args, progressSink, signal);
                result = hCtx.syncLayer ? hCtx.syncLayer.decorateResult(name, result) : result;
            }
        } else {
            result = await hCtx.registry.routeCall(ctx, name, args, progressSink, signal);
            result = hCtx.syncLayer ? hCtx.syncLayer.decorateResult(name, result) : result;
        }
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
            emit?.({ type: 'error', tool: toolGroup, action, error: String(err), timestamp: Date.now() } as any);
            throw err;
        }

        // ── Self-Healing: enrich validation errors with contract deltas (Bug #43 fix) ──
        if (result.isError && hCtx.selfHealing) {
            const text = result.content?.[0]?.type === 'text' ? (result.content[0] as { text: string }).text : '';
            if (text) {
                const healing = enrichValidationError(text, toolGroup, action, hCtx.selfHealing);
                if (healing.injected) {
                    result = { ...result, content: [{ type: 'text' as const, text: healing.enrichedError }] };
                }
            }
        }

        // ── Telemetry: execute event ─────────────────────────
        emit?.({  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
            type: 'execute', tool: toolGroup, action,
            durationMs: Date.now() - t0,
            isError: !!result.isError,
            timestamp: Date.now(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
        } as any);

        // FSM State Gate: auto-transition on successful execution
        if (fsm && !result.isError) {
            const transitionEvent = fsm.getTransitionEvent(name);
            if (transitionEvent) {
                const fromState = fsm.currentState;
                const transition = await fsm.transition(transitionEvent);
                if (transition.changed) {
                    // Emit fsm.transition telemetry event
                    if (hCtx.telemetry) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TelemetrySink accepts extensible event shapes
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
                    // Use fallback session ID for transports without sessions (e.g., stdio) (Bug #44 fix)
                    const sessionId = resolveSessionId(extra, hCtx);
                    if (hCtx.fsmStore) {
                        await hCtx.fsmStore.save(sessionId, fsm.snapshot());
                    } else if (hCtx.fsmMemorySnapshots) {
                        // Bug #77 fix: persist to in-memory session map
                        hCtx.fsmMemorySnapshots.set(sessionId, fsm.snapshot());
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
): void {
    // Wire lifecycle sync
    const serverAny = server as Record<string, unknown>;
    const sendFn = serverAny['sendPromptListChanged'];
    if (typeof sendFn === 'function') {
        prompts.setNotificationSink(() => { sendFn.call(server); });
    }

    // prompts/list
    resolved.setRequestHandler(ListPromptsRequestSchema, async (
        request: { params?: { cursor?: string } },
    ) => {
        const params: { filter?: PromptFilter; cursor?: string } = {};
        if (filter) params.filter = filter as PromptFilter;
        if (request?.params?.cursor) params.cursor = request.params.cursor;
        return await prompts.listPrompts(params);
    });

    // prompts/get — with loopback dispatcher and signal propagation
    resolved.setRequestHandler(GetPromptRequestSchema, async (
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
 * Typed interface for MCP SDK Server with resource + subscribe handler support.
 */
interface McpServerWithResourceSubscriptions {
    setRequestHandler(schema: typeof ListResourcesRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof ReadResourceRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof SubscribeRequestSchema, handler: (...args: never[]) => unknown): void;
    setRequestHandler(schema: typeof UnsubscribeRequestSchema, handler: (...args: never[]) => unknown): void;
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
): void {
    const resourceServer = resolved as unknown as McpServerWithResourceSubscriptions;

    // Bug #4 fix: Pre-compute introspection manifest URI for merge.
    const manifestUri = introspection?.config.uri ?? 'vurb://manifest.json';

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

    // resources/list — merge with introspection resources if present (Bug #4 fix)
    resourceServer.setRequestHandler(ListResourcesRequestSchema, (() => {
        const list = resources.listResources();
        if (introspection) {
            list.push({
                uri: manifestUri,
                name: 'Vurb Manifest',
                description: 'Dynamic introspection manifest exposing all registered tools, actions, and presenters. RBAC-filtered per session context.',
                mimeType: 'application/json',
            });
        }
        return { resources: list };
    }) as (...args: never[]) => unknown);

    // resources/read — with introspection manifest delegation (Bug #4 fix)
    resourceServer.setRequestHandler(ReadResourceRequestSchema, (async (
        request: { params: { uri: string } },
        extra: unknown,
    ) => {
        // Bug #4 fix: Handle introspection manifest URI before ResourceRegistry
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
    resourceServer.setRequestHandler(SubscribeRequestSchema, ((
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
    resourceServer.setRequestHandler(UnsubscribeRequestSchema, ((
        request: { params: { uri: string } },
    ) => {
        resources.unsubscribe(request.params.uri);
        return { _meta: {} };
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
        resolved.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
        resolved.setRequestHandler(CallToolRequestSchema, () =>
            error('Tool handlers have been detached'),
        );
        if (hasPrompts) {
            resolved.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: [] }));
            resolved.setRequestHandler(GetPromptRequestSchema, () => ({
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
        prompts, zeroTrust, selfHealing,
    } = options;

    // 1. Propagate observability to all registered builders
    propagateObservability(registry, debug, tracing, options.telemetry);

    // 2. Create State Sync layer (zero overhead when not configured)
    //    Merge manual policies with fluent hints from builders (.invalidates(), .cached())
    const mergedSyncConfig = mergeStateSyncConfig(stateSync, registry.getBuilders());
    const syncLayer = mergedSyncConfig ? new StateSyncLayer(mergedSyncConfig) : undefined;

    // 3. Register introspection resource (zero overhead when disabled)
    //    Bug #4 fix: When `resources` is also configured, introspection is merged
    //    into registerResourceHandlers to avoid setRequestHandler overwrite.
    if (introspection?.enabled && !options.resources) {
        registerIntrospectionResource(
            resolved,
            introspection,
            serverName ?? 'vurb-server',
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
                    `[Vurb] Zero-Trust attestation failed: computed digest ${serverDigest.digest} does not match expected ${zeroTrust.expectedDigest}`,
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

    // Wire the notification sink for list_changed (FSM transitions)
    let notifyToolListChanged: (() => void) | undefined;
    if (fsm) {
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

    // Bug #7 fix: exposition dirty flag — O(1) cache validation
    // Starts dirty to force initial compile, then stays clean until invalidated.
    let _expositionDirty = true;

    const hCtx: HandlerContext<TContext> = {
        registry,
        ...(filter ? { filter } : {}),
        ...(contextFactory ? { contextFactory } : {}),
        ...(syncLayer ? { syncLayer } : {}),
        toolExposition, actionSeparator,
        isFlat: toolExposition === 'flat',
        // Bug #7 fix: O(1) exposition cache with dirty flag + builder-count safety net.
        // The dirty flag provides O(1) fast-path invalidation (set whenever a builder
        // registers or the filter changes). The builder-count safety net catches
        // late-registered builders that might have been missed by the dirty flag.
        //
        // Bug #4 (Performance) fix: previous safety net iterated `registry.getBuilders()`
        // with a for...of loop (O(n)) on every tools/call request even on the cache hit path.
        // `ToolRegistry.size` is a Map.size getter — always O(1). No loop needed.
        recompile: (() => {
            let cachedResult: ExpositionResult<TContext> | undefined;
            let cachedBuilderCount = -1;
            return () => {
                // O(1) size check: detect late-registered builders without iterating.
                const currentCount = registry.size;
                if (!_expositionDirty && cachedResult && currentCount === cachedBuilderCount) {
                    return cachedResult;
                }
                _expositionDirty = false;
                cachedBuilderCount = currentCount;
                const builders = [...registry.getBuilders()];
                // Bug #131: route diagnostic warnings through debug observer
                const warnFn = debug
                    ? (msg: string) => debug({ type: 'error', tool: '', action: '', error: msg, step: 'route', timestamp: Date.now() })
                    : undefined;
                cachedResult = compileExposition(builders, toolExposition, actionSeparator, warnFn);
                return cachedResult;
            };
        })(),
        ...(fsm ? { fsm } : {}),
        ...(fsmStore ? { fsmStore } : {}),
        // Bug #77 fix: in-memory FSM snapshot store when no external fsmStore
        // Bug #108 fix: bounded LRU eviction (max 10,000 entries) to prevent
        // unbounded memory growth proportional to unique session count.
        ...(fsm && !fsmStore ? { fsmMemorySnapshots: createBoundedSnapshotMap(10_000) } : {}),
        ...(notifyToolListChanged ? { notifyToolListChanged } : {}),
        ...(options.telemetry ? { telemetry: options.telemetry } : {}),
        ...(selfHealing ? { selfHealing } : {}),
        // Bug #3 fix: per-attachment UUID — never use static key for session-scoped mutable state
        fallbackSessionId: randomUUID(),
    };

    // 5. Register tool handlers
    resolved.setRequestHandler(ListToolsRequestSchema, createToolListHandler(hCtx));
    resolved.setRequestHandler(CallToolRequestSchema, createToolCallHandler(hCtx));

    // 6. Register prompt handlers (zero overhead when omitted)
    if (prompts) {
        registerPromptHandlers(resolved, server, prompts, registry, filter, contextFactory);
    }

    // 7. Register resource handlers (zero overhead when omitted)
    const { resources } = options;
    if (resources) {
        // Bug #4 fix: pass introspection config so manifest resource is merged
        // into ResourceRegistry handlers instead of being overwritten.
        registerResourceHandlers(
            resolved, server, resources, contextFactory,
            introspection?.enabled ? {
                config: introspection,
                serverName: serverName ?? 'vurb-server',
                builders: { values: () => registry.getBuilders() },
            } : undefined,
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
 * Bug #108 fix: prevents unbounded memory growth proportional to unique sessions.
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
                    // Bug #9 fix: single-action default tools use bare name
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
