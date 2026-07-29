/**
 * Federated Handoff Protocol — SwarmGateway (B2BUA)
 *
 * The central orchestrator implementing the Back-to-Back User Agent pattern:
 *
 * - **External face (UAS)**: MCP server for the LLM client (Claude/Cursor)
 * - **Internal face (UAC)**: MCP client for upstream micro-servers
 *
 * Lifecycle per session:
 * 1. `activateHandoff()` — opens tunnel to upstream, mints delegation token
 * 2. `proxyToolsList()`  — returns prefixed upstream tools + return-trip tool
 * 3. `proxyToolsCall()`  — strips prefix, forwards to upstream
 * 4. `returnToGateway()` — closes tunnel, session returns to gateway tools
 *
 * @module
 */
import { randomUUID } from 'node:crypto';
import {
    mintDelegationToken,
    InMemoryHandoffStateStore,
    toolError,
} from '@mcpfusion/core';
import type { HandoffPayload, HandoffStateStore, ToolResponse } from '@mcpfusion/core';
import { UpstreamMcpClient } from './UpstreamMcpClient.js';
import { NamespaceRewriter, NamespaceError } from './NamespaceRewriter.js';
import { injectReturnTripTool } from './ReturnTripInjector.js';
import type { Tool as McpTool } from "@modelcontextprotocol/server";

// ============================================================================
// Config
// ============================================================================

export interface SwarmGatewayConfig {
    /**
     * Domain → upstream URI registry.
     * @example `{ finance: 'http://finance-agent:8081', devops: 'http://devops-agent:8082' }`
     */
    registry: Record<string, string>;
    /** HMAC secret shared with all upstream micro-servers. */
    delegationSecret: string;
    /** Store for Claim-Check pattern (state > 2 KB). Defaults to InMemory. */
    stateStore?: HandoffStateStore;
    /** Upstream connection timeout in ms (default: 5 000). */
    connectTimeoutMs?: number;
    /** Tunnel idle timeout in ms (default: 300 000 = 5 min). */
    idleTimeoutMs?: number;
    /** Delegation token TTL in seconds (default: 60). */
    tokenTtlSeconds?: number;
    /**
     * Upstream transport selection.
     * - `'auto'` (default): SSE on Node.js, HTTP on edge runtimes
     * - `'sse'`: Always use SSE (persistent connection)
     * - `'http'`: Always use Streamable HTTP (stateless, edge-compatible)
     */
    upstreamTransport?: 'auto' | 'sse' | 'http';
    /**
     * Name used for the return-trip tool.
     * Default: `'gateway'` → tool name `'gateway.return_to_triage'`
     */
    gatewayName?: string;
    /**
     * Maximum number of concurrent active handoff sessions.
     * Excess activations are rejected with `REGISTRY_SESSION_LIMIT_EXCEEDED`.
     * Default: 100.
     */
    maxSessions?: number;
}

// ============================================================================
// Active session state (discriminated union — )
// ============================================================================

type SessionState =
    // include optional client ref in 'connecting' so _closeSession
    // can abort an in-flight connect() when dispose() or re-activation is called.
    // The client is set immediately after construction (before await connect()),
    // so there's still a brief window at session-set time where client is absent.
    | { status: 'connecting'; client?: UpstreamMcpClient }
    | { status: 'active'; client: UpstreamMcpClient; domain: string; traceparent: string };

// ============================================================================
// SwarmGateway
// ============================================================================

/**
 * SwarmGateway — B2BUA for multi-agent MCP orchestration.
 *
 * @example
 * ```typescript
 * import { SwarmGateway } from '@mcpfusion/swarm';
 *
 * const gateway = new SwarmGateway({
 *     registry: {
 *         finance: 'http://finance-agent:8081',
 *         devops:  'http://devops-agent:8082',
 *     },
 *     delegationSecret: process.env.MCPFUSION_DELEGATION_SECRET!,
 * });
 *
 * // Pass to attachToServer:
 * registry.attachToServer(server, { swarmGateway: gateway });
 * ```
 */
export class SwarmGateway {
    private readonly _config: Required<SwarmGatewayConfig>;
    private readonly _sessions = new Map<string, SessionState>();
    private readonly _rewriter = new NamespaceRewriter();
    // tracks sessions currently being closed to prevent concurrent double-dispose
    private readonly _closingSessions = new Set<string>();

    constructor(config: SwarmGatewayConfig) {
        // validate registry — reject entries with empty URIs before they
        // cause a silent `TypeError: Invalid URL` deep in _resolveTransport at runtime.
        // An empty-string URI is always a configuration error, not a runtime edge case.
        const emptyUriKeys = Object.entries(config.registry)
            .filter(([, uri]) => !uri)
            .map(([key]) => JSON.stringify(key));
        if (emptyUriKeys.length > 0) {
            throw Object.assign(
                new Error(
                    `[mcpfusion/swarm] Registry entries with empty URIs: ${emptyUriKeys.join(', ')}. ` +
                    'All registry values must be non-empty URI strings.',
                ),
                { code: 'REGISTRY_INVALID_URI' },
            );
        }

        this._config = {
            stateStore:        config.stateStore ?? new InMemoryHandoffStateStore(),
            connectTimeoutMs:  config.connectTimeoutMs  ?? 5_000,
            idleTimeoutMs:     config.idleTimeoutMs     ?? 300_000,
            tokenTtlSeconds:   config.tokenTtlSeconds   ?? 60,
            upstreamTransport: config.upstreamTransport ?? 'auto',
            gatewayName:       config.gatewayName       ?? 'gateway',
            // enforce a default session limit to prevent unbounded growth
            maxSessions:       config.maxSessions       ?? 100,
            registry:          config.registry,
            delegationSecret:  config.delegationSecret,
        };
    }

    // ── Public API ───────────────────────────────────────────

    /**
     * Activate a handoff tunnel to the upstream server described by `payload`.
     *
     * Called by `ServerAttachment` after detecting a `HandoffResponse` from a
     * tool handler. Connects asynchronously — does not block the ACK to the LLM.
     *
     * **Concurrent safety**: If an activation is already in progress or active
     * for `sessionId`, the previous session is disposed before the new one starts.
     *
     * @param payload    - Handoff payload produced by `f.handoff()`
     * @param sessionId  - MCP session ID (used to key the active tunnel)
     * @param signal     - AbortSignal tied to the parent MCP connection
     * @throws If the target is not found in the registry
     * @throws If the session limit is exceeded
     */
    async activateHandoff(
        payload: HandoffPayload,
        sessionId: string,
        signal: AbortSignal,
    ): Promise<void> {
        // dispose any pre-existing session for this ID before starting
        await this._closeSession(sessionId);

        // count ALL sessions (connecting + active) to prevent bypass attacks
        // where an attacker opens maxSessions 'connecting' tunnels and then opens more.
        if (this._sessions.size >= this._config.maxSessions) {
            throw Object.assign(
                new Error(
                    `[mcpfusion/swarm] Session limit of ${this._config.maxSessions} reached. ` +
                    'Close existing sessions before activating more.',
                ),
                { code: 'SESSION_LIMIT_EXCEEDED' },
            );
        }

        // Mark the slot as 'connecting' immediately to prevent double-activation
        this._sessions.set(sessionId, { status: 'connecting' });

        // track the client so dispose() can be called if connect() fails
        let client: UpstreamMcpClient | undefined;

        try {
            // _resolveDomain throws on unknown targets
            const domain = this._resolveDomain(payload.target);
            const upstreamUri = this._config.registry[domain]!;
            const traceparent = generateTraceparent();

            const token = await mintDelegationToken(
                domain,
                this._config.tokenTtlSeconds,
                this._config.delegationSecret,
                // use the configured gateway name as the token issuer (iss claim)
                // so that tokens from different gateway instances are distinguishable in audit logs.
                this._config.gatewayName,
                payload.carryOverState,
                this._config.stateStore,
                traceparent,
            );

            client = new UpstreamMcpClient(upstreamUri, {
                connectTimeoutMs: this._config.connectTimeoutMs,
                idleTimeoutMs:    this._config.idleTimeoutMs,
                delegationToken:  token,
                traceparent,
                transport:        this._config.upstreamTransport,
            }, signal);

            // update session with client reference BEFORE awaiting connect().
            // This lets _closeSession dispose the client even during the in-flight connect,
            // preventing dispose() called on the gateway from leaving zombie connections.
            this._sessions.set(sessionId, { status: 'connecting', client });

            await client.connect();
            this._sessions.set(sessionId, { status: 'active', client, domain, traceparent });
        } catch (err) {
            this._sessions.delete(sessionId);
            // Dispose the client if it was created, even if _closeSession already did so
            // concurrently (e.g. parentSignal abort racing with the in-flight connect).
            // UpstreamMcpClient.dispose() is fully idempotent — safe to call multiple times.
            await client?.dispose();
            throw err;
        }
    }

    /**
     * Proxy the tools/list for an active session.
     *
     * Returns `null` for non-existent sessions.
     * Returns only the return-trip escape tool if the upstream is unreachable.
     * Returns an empty list while the session is still connecting.
     */
    async proxyToolsList(sessionId: string): Promise<McpTool[] | null> {
        const session = this._sessions.get(sessionId);

        // distinguish 'no session' from 'still connecting'
        if (!session) return null;
        // While connecting, report no tools yet (caller should retry)
        if (session.status !== 'active') return [];

        // only wrap the network call in try/catch — not the pure transform
        // functions. `rewriteList` and `injectReturnTripTool` are pure and should never
        // throw. Catching them silently would hide programming errors as degraded UX.
        let raw: McpTool[];
        try {
            raw = await session.client.listTools();
        } catch {
            // upstream went away — return only the escape hatch
            return injectReturnTripTool([], this._config.gatewayName);
        }
        const prefixed = this._rewriter.rewriteList(raw, session.domain);
        return injectReturnTripTool(prefixed, this._config.gatewayName);
    }

    /**
     * Proxy a tools/call for an active session.
     *
     * Strips the namespace prefix before forwarding to the upstream.
     *
     * @returns The upstream's ToolResponse, or `null` if no active tunnel.
     */
    async proxyToolsCall(
        sessionId: string,
        name: string,
        args: Record<string, unknown>,
        signal: AbortSignal,
    ): Promise<ToolResponse | null> {
        const session = this._sessions.get(sessionId);
        // No session at all — caller serves gateway-level tools
        if (!session) return null;

        // when session is still connecting, return a descriptive error
        // instead of null. Returning null causes ServerAttachment to look up the
        // tool in the gateway's own list, which fails with a generic 'tool not found'.
        if (session.status !== 'active') {
            return toolError('HANDOFF_CONNECTING', {
                message: 'The upstream specialist is still connecting. Please retry in a moment.',
                suggestion: 'Wait 1-2 seconds and retry the same tool call.',
                retryAfter: 2,
                severity: 'warning',
            });
        }

        try {
            const strippedName = this._rewriter.stripPrefix(name, session.domain);
            return await session.client.callTool(strippedName, args, signal);
        } catch (err) {
            // instanceof instead of duck-typing .name
            if (err instanceof NamespaceError) {
                return toolError('HANDOFF_NAMESPACE_MISMATCH', {
                    message: `Tool "${name}" does not match the active upstream domain "${session.domain}".`,
                    suggestion: 'Re-fetch the tools/list and retry with a valid tool name.',
                    severity: 'error',
                });
            }
            // log non-NamespaceError errors for observability before masking them.
            // The LLM must not see internal error details (security + UX), but errors must
            // surface somewhere so bugs are diagnosable in production.
            console.warn(
                `[mcpfusion/swarm] proxyToolsCall unexpected error for tool "${name}" in domain "${session.domain}":`,
                err,
            );
            return toolError('HANDOFF_UPSTREAM_UNAVAILABLE', {
                message: `The upstream specialist "${session.domain}" is temporarily unavailable.`,
                suggestion: 'Inform the user and retry in 30 seconds, or call gateway.return_to_triage.',
                retryAfter: 30,
                severity: 'error',
            });
        }
    }

    /**
     * Close the tunnel for `sessionId` and restore the gateway's tool list.
     *
     * Called when the LLM invokes the `gateway.return_to_triage` tool.
     * `ServerAttachment` emits `notifications/tools/list_changed` after this.
     */
    async returnToGateway(sessionId: string): Promise<void> {
        await this._closeSession(sessionId);
    }

    /**
     * `true` if there is a tracked tunnel (connecting or active) for the given session.
     *
     * Returning `true` during `'connecting'` ensures `ServerAttachment` routes
     * tools/call through `proxyToolsCall`, which already returns the correct
     * `HANDOFF_CONNECTING` error for in-progress tunnels — preventing gateway-local
     * execution from silently bypassing the handoff.
     */
    hasActiveHandoff(sessionId: string): boolean {
        return this._sessions.has(sessionId);
    }

    /** `true` if an activation is in progress for the given session. */
    isConnecting(sessionId: string): boolean {
        return this._sessions.get(sessionId)?.status === 'connecting';
    }

    /**
     * Total number of tracked sessions (connecting + active).
     *
     * exposed for integration testing and observability.
     * Allows tests to assert session lifecycle transitions deterministically
     * without accessing private state via casting.
     */
    get sessionCount(): number {
        return this._sessions.size;
    }

    /**
     * Number of sessions currently in the `'connecting'` state.
     *
     * useful for load-shedding checks and integration tests.
     */
    get connectingCount(): number {
        let count = 0;
        for (const s of this._sessions.values()) {
            if (s.status === 'connecting') count++;
        }
        return count;
    }

    /**
     * Dispose all active sessions and release all resources.
     *
     * Call this when shutting down the gateway to cleanly close
     * all upstream connections, idle timers, and AbortController listeners.
     */
    async dispose(): Promise<void> {
        const sessionIds = [...this._sessions.keys()];
        await Promise.allSettled(sessionIds.map(id => this._closeSession(id)));
    }

    // ── Private ─────────────────────────────────────────────

    private async _closeSession(sessionId: string): Promise<void> {
        // prevent concurrent double-dispose (e.g. abort signal + returnToGateway racing).
        // If already closing, bail out immediately — dispose() is idempotent in UpstreamMcpClient
        // but calling it concurrently can cause duplicate timers and listener leaks.
        if (this._closingSessions.has(sessionId)) return;
        const session = this._sessions.get(sessionId);
        if (!session) return;
        this._closingSessions.add(sessionId);
        this._sessions.delete(sessionId);
        try {
            // also dispose 'connecting' sessions if client was already created.
            // This aborts the in-flight connect() and cleans up the parentSignal listener.
            // Sessions where client hasn't been set yet (first ~few ms of activateHandoff)
            // will simply be deleted from the map — activateHandoff's catch handles cleanup.
            if (session.status === 'active' || (session.status === 'connecting' && session.client)) {
                await session.client!.dispose();
            }
        } finally {
            this._closingSessions.delete(sessionId);
        }
    }

    /**
     * Extract the domain key from a target URI.
     *
     * `'mcp://finance-agent.internal:8080'` → `'finance'` (registry lookup)
     * `'finance'`                            → `'finance'` (direct key)
     *
     * @throws If the target does not resolve to any entry in the registry.
     *         Configure all targets explicitly in `SwarmGatewayConfig.registry`.
     */
    private _resolveDomain(target: string): string {
        // reject empty-string targets before the registry lookup.
        // An empty target is always a caller error; if the registry happened to
        // contain a '' key, we would silently accept it and produce confusing logs.
        if (!target) {
            throw Object.assign(
                new Error('[mcpfusion/swarm] Handoff target must not be an empty string.'),
                { code: 'REGISTRY_LOOKUP_FAILED' },
            );
        }

        // use Object.hasOwn instead of truthiness — an empty string value
        // is a config error, not a valid reason to skip the lookup and throw a confusing error
        if (Object.hasOwn(this._config.registry, target)) return target;

        // Try to extract subdomain from mcp:// or mcps:// URI hostname
        try {
            const url = new URL(target
                .replace(/^mcps:\/\//, 'https://')   // handle secure mcp scheme
                .replace(/^mcp:\/\//, 'http://'));
            const subdomain = url.hostname.split('.')[0] ?? '';
            if (subdomain && Object.hasOwn(this._config.registry, subdomain)) return subdomain;
        } catch {
            // ignore URL parse error
        }

        // sanitize the target before including it in the error message.
        // A verbatim target can contain control characters, ANSI escapes, or adversarial
        // payloads that pollute logs or trip structured error parsers.
        const safeTarget = String(target).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
        throw Object.assign(
            new Error(
                `[mcpfusion/swarm] Unknown handoff target "${safeTarget}". ` +
                'All targets must be registered in SwarmGatewayConfig.registry.',
            ),
            { code: 'REGISTRY_LOOKUP_FAILED' },
        );
    }
}

// ============================================================================
// W3C traceparent
// ============================================================================

/**
 * Generate a W3C Trace Context `traceparent` header value.
 * Format: `00-{32 hex}-{16 hex}-01`
 * Uses `crypto.randomUUID()` — no external dependencies.
 */
function generateTraceparent(): string {
    const traceId = randomUUID().replace(/-/g, '');
    const spanId  = randomUUID().replace(/-/g, '').slice(0, 16);
    return `00-${traceId}-${spanId}-01`;
}
