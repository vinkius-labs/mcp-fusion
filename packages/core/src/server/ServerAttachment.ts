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
} from '@modelcontextprotocol/sdk/types.js';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, error } from '../core/response.js';
import { type ToolBuilder } from '../core/types.js';
import { type ProgressSink, type ProgressEvent } from '../core/execution/ProgressHelper.js';
import { resolveServer } from './ServerResolver.js';
import { type DebugObserverFn } from '../observability/DebugObserver.js';
import { type FusionTracer } from '../observability/Tracing.js';
import { StateSyncLayer } from '../state-sync/StateSyncLayer.js';
import { type StateSyncConfig, type SyncPolicy } from '../state-sync/types.js';
import { type IntrospectionConfig } from '../introspection/types.js';
import { registerIntrospectionResource } from '../introspection/IntrospectionResource.js';
import { type ZeroTrustConfig, AttestationError } from '../introspection/CryptoAttestation.js';
import { type SelfHealingConfig } from '../introspection/ContractAwareSelfHealing.js';
import { compileContracts } from '../introspection/ToolContract.js';
import { computeServerDigest } from '../introspection/BehaviorDigest.js';
import { type ToolExposition } from '../exposition/types.js';
import { compileExposition, type FlatRoute, type ExpositionResult } from '../exposition/ExpositionCompiler.js';
import { type PromptRegistry, type PromptFilter } from '../prompt/PromptRegistry.js';
import { StateMachineGate, type FsmStateStore } from '../fsm/StateMachineGate.js';

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
     * When configured, Fusion automatically:
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
     *         uri: 'fusion://manifest.json',
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
     *     tracing: trace.getTracer('mcp-fusion'),
     * });
     * ```
     *
     * @see {@link FusionTracer} for the tracer interface contract
     */
    tracing?: FusionTracer;

    /**
     * Server name used in the introspection manifest.
     * @defaultValue `'mcp-fusion-server'`
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
    enableTracing?(tracer: FusionTracer): void;
    /** Get an iterable of all registered builders (for introspection and exposition) */
    getBuilders(): Iterable<ToolBuilder<TContext>>;
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
    readonly notifyToolListChanged?: () => void;
}

// ── Observability Propagation ────────────────────────────

/**
 * Propagate debug and tracing observers to all registered builders.
 * Zero overhead when neither is configured.
 */
function propagateObservability<TContext>(
    registry: RegistryDelegate<TContext>,
    debug?: DebugObserverFn,
    tracing?: FusionTracer,
): void {
    if (debug && registry.enableDebug) {
        registry.enableDebug(debug);
    }
    if (tracing && registry.enableTracing) {
        registry.enableTracing(tracing);
    }
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
        // Restore FSM state from external store (serverless/edge)
        if (hCtx.fsm && hCtx.fsmStore) {
            const sessionId = extractSessionId(extra);
            if (sessionId) {
                const snap = await hCtx.fsmStore.load(sessionId);
                if (snap) hCtx.fsm.restore(snap);
            }
        }

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
        if (hCtx.fsm && hCtx.fsm.hasBindings) {
            tools = tools.filter(tool => hCtx.fsm!.isToolAllowed(tool.name));
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
            : (undefined as TContext);

        const progressSink = createProgressSink(extra);
        const signal = extractSignal(extra);

        // Restore FSM state from external store (serverless/edge)
        if (hCtx.fsm && hCtx.fsmStore) {
            const sessionId = extractSessionId(extra);
            if (sessionId) {
                const snap = await hCtx.fsmStore.load(sessionId);
                if (snap) hCtx.fsm.restore(snap);
            }
        }

        let result: ToolResponse;

        if (hCtx.isFlat) {
            const exposition = hCtx.recompile();
            const flatRoute = exposition.routingMap.get(name);
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

        // FSM State Gate: auto-transition on successful execution
        if (hCtx.fsm && !result.isError) {
            const transitionEvent = hCtx.fsm.getTransitionEvent(name);
            if (transitionEvent) {
                const transition = await hCtx.fsm.transition(transitionEvent);
                if (transition.changed) {
                    // Persist new state to external store (serverless/edge)
                    if (hCtx.fsmStore) {
                        const sessionId = extractSessionId(extra);
                        if (sessionId) {
                            await hCtx.fsmStore.save(sessionId, hCtx.fsm.snapshot());
                        }
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
            : (undefined as TContext);
        const signal = extractSignal(extra);

        injectLoopbackDispatcher(ctx, registry, signal);
        return prompts.routeGet(ctx, name, args);
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
): void {
    (ctx as Record<string, unknown>)['invokeTool'] = async (
        toolName: string,
        toolArgs: Record<string, unknown> = {},
    ) => {
        const response = await registry.routeCall(ctx, toolName, toolArgs, undefined, signal);
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
        prompts, zeroTrust,
    } = options;

    // 1. Propagate observability to all registered builders
    propagateObservability(registry, debug, tracing);

    // 2. Create State Sync layer (zero overhead when not configured)
    //    Merge manual policies with fluent hints from builders (.invalidates(), .cached())
    const mergedSyncConfig = mergeStateSyncConfig(stateSync, registry.getBuilders());
    const syncLayer = mergedSyncConfig ? new StateSyncLayer(mergedSyncConfig) : undefined;

    // 3. Register introspection resource (zero overhead when disabled)
    if (introspection?.enabled) {
        registerIntrospectionResource(
            resolved,
            introspection,
            serverName ?? 'mcp-fusion-server',
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
                    `[MCP Fusion] Zero-Trust attestation failed: computed digest ${serverDigest.digest} does not match expected ${zeroTrust.expectedDigest}`,
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
                    void (sendFn as Function).call(server, { method: 'notifications/tools/list_changed' });
                } catch {
                    // Connection might not be established — ignore
                }
            };
        }
    }

    const hCtx: HandlerContext<TContext> = {
        registry,
        ...(filter ? { filter } : {}),
        ...(contextFactory ? { contextFactory } : {}),
        ...(syncLayer ? { syncLayer } : {}),
        toolExposition, actionSeparator,
        isFlat: toolExposition === 'flat',
        recompile: () => compileExposition(
            registry.getBuilders(), toolExposition, actionSeparator,
        ),
        ...(fsm ? { fsm } : {}),
        ...(fsmStore ? { fsmStore } : {}),
        ...(notifyToolListChanged ? { notifyToolListChanged } : {}),
    };

    // 5. Register tool handlers
    resolved.setRequestHandler(ListToolsRequestSchema, createToolListHandler(hCtx));
    resolved.setRequestHandler(CallToolRequestSchema, createToolCallHandler(hCtx));

    // 6. Register prompt handlers (zero overhead when omitted)
    if (prompts) {
        registerPromptHandlers(resolved, server, prompts, registry, filter, contextFactory);
    }

    // 7. Return detach function
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
                ...(hint.invalidates?.length ? { invalidates: [...hint.invalidates] } : {}),
            });
        }
    }

    return policies;
}

// ── Session ID Extraction ──────────────────────────────

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
                for (const action of actionList) {
                    const flatName = `${toolName}${separator}${action.key}`;
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
