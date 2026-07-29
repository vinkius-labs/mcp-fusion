/**
 * Federated Handoff Protocol — Upstream MCP Client
 *
 * Outbound MCP client that tunnels from the SwarmGateway to an upstream
 * micro-server. Implements:
 *
 * - **AbortSignal cascade**: closing the parent connection aborts the tunnel
 * - **Connect timeout**: the timeout AbortController cancels the in-flight HTTP request
 * - **Idle timeout**: closes zombie tunnels after configurable inactivity
 * - **Progress passthrough**: pipes `notifications/progress` and
 *   `notifications/message` from upstream back to the LLM client
 *
 * @module
 */
import { Client, SSEClientTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Tool as McpTool, Transport } from "@modelcontextprotocol/client";
import type { ToolResponse } from '@mcpfusion/core';

/** Progress notification forwarded from the upstream to the gateway client. */
export interface ProgressNotification {
    method: string;
    params: Record<string, unknown>;
}

/** Callback used by SwarmGateway to relay progress upstream → LLM client. */
export type ProgressForwarder = (notification: ProgressNotification) => void;

// ============================================================================
// UpstreamMcpClient
// ============================================================================

export interface UpstreamMcpClientConfig {
    /** Milliseconds to wait for the initial connection (default: 5 000). */
    connectTimeoutMs: number;
    /** Milliseconds of inactivity before the tunnel is closed (default: 300 000). */
    idleTimeoutMs: number;
    /** Delegation token to send via `x-mcpfusion-delegation` header. */
    delegationToken: string;
    /** W3C traceparent to propagate (optional). */
    traceparent?: string;
    /**
     * Transport override.
     * - `'auto'` (default): SSE on Node.js, HTTP on edge runtimes
     * - `'sse'`: always SSE (persistent)
     * - `'http'`: always Streamable HTTP (stateless, edge-compatible)
     */
    transport?: 'auto' | 'sse' | 'http';
}

/**
 * Outbound MCP client for the SwarmGateway B2BUA face.
 *
 * One instance per active handoff session. Closed via `dispose()` or
 * automatically when the idle timeout or AbortSignal fires.
 */
export class UpstreamMcpClient {
    private readonly _abortController: AbortController;
    // keep ref to listener so we can remove it in dispose() to prevent
    // the closure from holding a reference to this instance after the session ends.
    private readonly _onParentAbort: () => void;
    private readonly _parentSignal: AbortSignal;
    private _client: Client | undefined;
    private _idleTimer: ReturnType<typeof setTimeout> | undefined;
    private _progressForwarder: ProgressForwarder | undefined;
    // tracks concurrent tool calls to suspend the idle timer during execution
    private _activeCalls = 0;
    // set to true by dispose() to prevent orphan timers from firing
    private _disposed = false;

    constructor(
        private readonly _targetUri: string,
        private readonly _config: UpstreamMcpClientConfig,
        parentSignal: AbortSignal,
    ) {
        this._abortController = new AbortController();
        // save ref to both signal and listener for cleanup in dispose().
        // Using `{ once: true }` auto-removes on fire, but NOT on voluntary dispose().
        // Without explicit removal, the closure keeps this entire instance alive
        // in memory for as long as parentSignal lives (typically the MCP connection lifetime).
        this._onParentAbort = () => this._abortController.abort();
        this._parentSignal = parentSignal;
        parentSignal.addEventListener('abort', this._onParentAbort, { once: true });
    }

    /** Register a forwarder for upstream progress/logging notifications. */
    setProgressForwarder(forwarder: ProgressForwarder): void {
        this._progressForwarder = forwarder;
    }

    /**
     * Connect to the upstream server.
     *
     * @throws `Error` with `code: 'UPSTREAM_CONNECT_TIMEOUT'` if unreachable within `connectTimeoutMs`
     */
    async connect(): Promise<void> {
        const headers: Record<string, string> = {
            'x-mcpfusion-delegation': this._config.delegationToken,
        };
        if (this._config.traceparent) {
            headers['traceparent'] = this._config.traceparent;
        }

        // use a dedicated connect-phase controller merged with the session-lifetime
        // signal. The SSEClientTransport holds the signal for the full SSE stream lifetime,
        // so it must be the session signal — not the one-shot connect timeout signal.
        // We create a merged signal that fires on either: (a) connect timeout, or (b) session abort.
        const connectController = new AbortController();
        // AbortSignal.any is available in Node ≥18.17.
        // the old fallback used only connectController.signal, ignoring
        // _abortController.signal entirely on older runtimes. This meant a parent-abort
        // during connect() would not cancel the in-flight TCP/HTTP request immediately.
        // The manual merge below ensures both signals are observed on all runtimes.
        const connectSignal = typeof AbortSignal.any === 'function'
            ? AbortSignal.any([connectController.signal, this._abortController.signal])
            : (() => {
                const mergedController = new AbortController();
                const abort = () => mergedController.abort();
                connectController.signal.addEventListener('abort', abort, { once: true });
                this._abortController.signal.addEventListener('abort', abort, { once: true });
                return mergedController.signal;
            })();
        const transport = this._resolveTransport(headers, connectSignal);

        // do NOT set this._client before the promise settles.
        // We use a local variable during connect; only assign to this._client on success.
        const client = new Client({ name: 'mcpfusion-swarm-gateway', version: '0.1.0' });

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                connectController.abort(); // cancel the in-flight request
                reject(Object.assign(new Error(
                    `[mcpfusion/swarm] Upstream "${this._targetUri}" did not respond within ${this._config.connectTimeoutMs}ms.`,
                ), { code: 'UPSTREAM_CONNECT_TIMEOUT' }));
            }, this._config.connectTimeoutMs);

            void client.connect(transport).then(() => {
                clearTimeout(timer);
                resolve();
            }, (err: unknown) => {
                clearTimeout(timer);
                reject(err);
            });
        });

        // only set this._client AFTER a successful connect.
        // If the promise above rejected (timeout, network error), this line is never reached
        // and _client remains undefined — _assertConnected() correctly blocks further calls.
        this._client = client;

        this._wireNotifications();
        this._resetIdleTimer();
    }

    /** List all tools exposed by the upstream server. */
    async listTools(): Promise<McpTool[]> {
        this._assertConnected();

        // apply the same idle-timer suspension pattern as callTool.
        // Without this, a slow upstream (large tool list) could cause the idle timer
        // to fire mid-awaiting the listTools RPC and close the tunnel prematurely.
        this._activeCalls++;
        clearTimeout(this._idleTimer);
        this._idleTimer = undefined;

        try {
            // declare inside the try block (same pattern as callTool)
            // so TypeScript never infers `response` as `T | undefined` outside it.
            const response = await this._client!.listTools();
            return response.tools;
        } finally {
            this._activeCalls--;
            if (this._activeCalls === 0) {
                this._resetIdleTimer();
            }
        }
    }

    /**
     * Call a tool on the upstream server.
     * @param name   - Tool name (without namespace prefix)
     * @param args   - Tool arguments
     * @param signal - AbortSignal from the parent tools/call request
     */
    async callTool(
        name: string,
        args: Record<string, unknown>,
        signal: AbortSignal,
    ): Promise<ToolResponse> {
        this._assertConnected();

        // suspend the idle timer while a tool call is in progress.
        // Previously, the timer was reset only at the START of the call. A long-running
        // tool (e.g., 4+ minutes) would not reset the timer on completion, causing
        // the tunnel to close while the tool is still executing. Now we pause the
        // timer during the call and restart it only after the call completes.
        this._activeCalls++;
        clearTimeout(this._idleTimer);
        this._idleTimer = undefined;
        // declare result inside the try block (same pattern as listTools after ).
        // With `let result` outside, TypeScript infers `result: T | undefined` — if callTool()
        // throws, `result.content` below would never execute but TS doesn't know that.
        // Moving everything inside the try makes the types strict and intent crystal-clear.
        try {
            const result = await this._client!.callTool(
                { name, arguments: args },
                { signal },
            );

            // ToolResponse only supports type:'text'. Produce human-readable representations
            // for non-text blocks (image, resource, audio) rather than losing type information
            // via a raw JSON.stringify. LLMs benefit from knowing what was returned.
            const content = (result.content as Array<{
                type: string;
                text?: string;
                data?: string;
                mimeType?: string;
                uri?: string;
                resource?: unknown;
            }>).map(c => {
                if (c.type === 'text') {
                    return { type: 'text' as const, text: c.text ?? '' };
                }
                if (c.type === 'image') {
                    const size = c.data?.length ?? 0;
                    return { type: 'text' as const, text: `[Image (${c.mimeType ?? 'unknown type'}); ${size} base64 chars — not renderable as text]` };
                }
                if (c.type === 'resource') {
                    return { type: 'text' as const, text: `[Resource: ${JSON.stringify(c.resource)}]` };
                }
                return { type: 'text' as const, text: `[${c.type}: ${JSON.stringify(c)}]` };
            });

            return { content, isError: result.isError === true };
        } finally {
            this._activeCalls--;
            // Restart the idle timer only when no other calls are pending
            if (this._activeCalls === 0) {
                this._resetIdleTimer();
            }
        }
    }

    /** Close the connection and clear all timers. */
    async dispose(): Promise<void> {
        // mark as disposed FIRST so any in-flight finally blocks
        // (e.g. callTool's _activeCalls--) won't restart the idle timer.
        this._disposed = true;
        // remove the parent signal listener to break the closure reference.
        // Without this, parentSignal retains a reference to this instance for its entire
        // lifetime (usually the MCP connection), preventing GC after the session ends.
        this._parentSignal.removeEventListener('abort', this._onParentAbort);
        clearTimeout(this._idleTimer);
        this._abortController.abort();
        try {
            await this._client?.close();
        } catch {
            // Best-effort close — swallow errors during cleanup
        }
        this._client = undefined;
    }

    // ── Private ─────────────────────────────────────────────

    private _assertConnected(): void {
        if (!this._client) {
            throw new Error('[mcpfusion/swarm] UpstreamMcpClient is not connected. Call connect() first.');
        }
    }

    /**
     * Build the MCP transport for the given headers and connect-phase abort signal.
     *
     * The `connectSignal` is only used for the initial TCP/SSE handshake.
     * It is NOT the same as the session lifetime signal (`_abortController`).
     *
     * `mcps://` (secure MCP) is mapped to `https://`.
     */
    private _resolveTransport(headers: Record<string, string>, sessionSignal: AbortSignal): Transport {
        const mode = this._config.transport ?? 'auto';
        const useHttp = mode === 'http' ||
            (mode === 'auto' && typeof (globalThis as Record<string, unknown>)['EdgeRuntime'] !== 'undefined');

        const url = new URL(this._targetUri
            .replace(/^mcps:\/\//, 'https://')  // secure MCP scheme
            .replace(/^mcp:\/\//, 'http://'));

        if (useHttp) {
            return new StreamableHTTPClientTransport(url, {
                requestInit: { headers, signal: sessionSignal },
            }) as unknown as Transport;
        }
        return new SSEClientTransport(url, {
            requestInit: { headers, signal: sessionSignal },
        } as ConstructorParameters<typeof SSEClientTransport>[1]) as unknown as Transport;
    }

    /**
     * Register notification handlers with correctly typed wrappers.
     *
     * The MCP SDK's `setNotificationHandler` expects a Zod schema as the first argument.
     * We create a minimal compliant object that satisfies the runtime duck-type without
     * importing Zod directly (the SDK validates at transport level, not via our schema).
     * The `as never` cast is retained on the schema only — all handler types are explicit.
     */
    private _wireNotifications(): void {
        if (!this._client) return;

        type NotificationWithParams = {
            method: string;
            params?: Record<string, unknown>;
        };

        // include safeParse() so future MCP SDK versions that call it
        // don't silently break notification forwarding. The cast to `never` is retained
        // only on the schema argument — handler types remain explicit.
        // v2: setNotificationHandler takes a method string directly.

        this._client.setNotificationHandler(
            'notifications/progress' as never,
            (n: NotificationWithParams) => {
                this._progressForwarder?.({ method: 'notifications/progress', params: n.params ?? {} });
            },
        );

        this._client.setNotificationHandler(
            'notifications/message' as never,
            (n: NotificationWithParams) => {
                this._progressForwarder?.({ method: 'notifications/message', params: n.params ?? {} });
            },
        );
    }

    private _resetIdleTimer(): void {
        // never restart the timer after dispose() — that would schedule
        // another dispose() call on a dead client, leaking the timer handle.
        if (this._disposed) return;
        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            void this.dispose();
        }, this._config.idleTimeoutMs);
    }
}
