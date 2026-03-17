/**
 * startServer — One-Liner Bootstrap for Vurb Servers
 *
 * Abstracts the entire server startup boilerplate into a single call:
 *   1. Creates the MCP Server instance
 *   2. Attaches the tool registry with telemetry
 *   3. Builds the topology for Inspector TUI auto-discovery
 *   4. Starts the Telemetry Bus (IPC)
 *   5. Connects the transport (stdio or Streamable HTTP)
 *
 * Supports both `stdio` and `http` transports:
 * - `stdio` (default): connects via stdin/stdout
 * - `http`: starts an HTTP server with session management
 *
 * @module
 */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { attachToServer, type AttachOptions, _missingContextProxy } from './ServerAttachment.js';
import { createTelemetryBus, type TelemetryBusInstance } from '../observability/TelemetryBus.js';
import type { PromptRegistry } from '../prompt/PromptRegistry.js';
import type { ProgressSink } from '../core/execution/ProgressHelper.js';

// ============================================================================
// Types
// ============================================================================

/** Transport layer for the server. */
export type ServerTransport = 'stdio' | 'http';

/** Options for `startServer`. */
export interface StartServerOptions<TContext> {
    /** Server display name (shown in MCP clients and Inspector). */
    readonly name: string;

    /** Server version string (e.g. '1.0.0'). */
    readonly version?: string;

    /** The tool registry to expose. */
    readonly registry: ServerRegistry<TContext>;

    /** Optional prompt registry. */
    readonly prompts?: PromptRegistry<TContext>;

    /** Factory to create per-request context. */
    readonly contextFactory?: (extra: unknown) => TContext | Promise<TContext>;

    /** Enable Inspector TUI telemetry (default: true). */
    readonly telemetry?: boolean;

    /**
     * Transport layer: `'stdio'` (default) or `'http'` (Streamable HTTP).
     *
     * - `stdio` — connects via stdin/stdout (for Cursor, Claude Desktop)
     * - `http`  — starts an HTTP server with session management on `/mcp`
     */
    readonly transport?: ServerTransport;

    /**
     * Port for the HTTP server (only used when `transport: 'http'`).
     * @default 3001
     */
    readonly port?: number;

    /**
     * Maximum request body size in bytes for the HTTP transport.
     * Requests exceeding this limit are rejected with HTTP 413.
     *
     * @default 4_194_304 (4MB)
     */
    readonly maxBodyBytes?: number;

    /** Extra attach options (debug, tracing, zeroTrust, etc.). */
    readonly attach?: Omit<AttachOptions<TContext>, 'contextFactory' | 'prompts' | 'telemetry'>;
}

/**
 * Minimal registry interface expected by `startServer`.
 * Both `ToolRegistry` and any object with `getBuilders()` + `attachToServer()` qualify.
 */
interface ServerRegistry<TContext> {
    getBuilders(): Iterable<ToolBuilderLike>;
    attachToServer(server: unknown, options: AttachOptions<TContext>): Promise<unknown>;
    routeCall(ctx: TContext, name: string, args: Record<string, unknown>, progressSink?: ProgressSink, signal?: AbortSignal): Promise<unknown>;
}

/** Minimal builder shape for topology extraction. */
interface ToolBuilderLike {
    getName(): string;
    getActionNames(): string[];
    buildToolDefinition(): unknown;
}

/** Result returned by `startServer`. */
export interface StartServerResult {
    /** The MCP Server instance (`null` in edge/interceptor mode). */
    readonly server: InstanceType<typeof Server> | null;
    /** The Telemetry Bus (if enabled). */
    readonly bus?: TelemetryBusInstance;
    /** The HTTP server instance (only present when `transport: 'http'`). */
    readonly httpServer?: HttpServer;
    /** Gracefully shut down everything. */
    readonly close: () => Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Start an Vurb server with a single call.
 *
 * Handles all bootstrap boilerplate: Server creation, registry attachment,
 * telemetry bus, and stdio transport connection.
 *
 * @example
 * ```typescript
 * import { startServer, autoDiscover } from '@vurb/core';
 *
 * const registry = f.registry();
 * await autoDiscover(registry, new URL('./tools', import.meta.url));
 *
 * await startServer({
 *     name: 'my-server',
 *     registry,
 *     contextFactory: () => createContext(),
 * });
 * ```
 */
export async function startServer<TContext>(
    options: StartServerOptions<TContext>,
): Promise<StartServerResult> {
    const {
        name,
        version = '1.0.0',
        registry,
        prompts,
        contextFactory,
        telemetry = true,
        transport = 'stdio',
        port = 3001,
        attach = {},
    } = options;

    // ── Vinkius Cloud Edge Detection ─────────────────────────────────────
    // When running inside a V8 Isolate, the host injects
    // __vinkius_edge_interceptor into globalThis. If present:
    //   1. Serialize tool definitions to host via IPC
    //   2. Expose __vinkius_edge_dispatch for tool invocations
    //   3. Abort normal server startup (no stdio transport)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (typeof g.__vinkius_edge_interceptor !== 'undefined') {
        const tools: Array<{ definition: unknown; name: string }> = [];
        for (const b of registry.getBuilders()) {
            tools.push({
                definition: b.buildToolDefinition(),
                name: b.getName(),
            });
        }

        // ── Prompt Definitions ───────────────────────────────
        // Serialize all registered prompts so the host can expose
        // them via MCP prompts/list + prompts/get.
        // McpPromptDef is already the serializable shape (name, description, arguments)
        const promptDefs = prompts ? prompts.getAllPrompts() : [];

        // ── FSM Config ───────────────────────────────────────
        // Serialize FSM config and tool bindings so the host can
        // implement state-gated tool visibility at edge.
        let fsmData: { config: unknown; bindings: Array<{ tool: string; states: string[]; event?: string }> } | undefined;
        const fsmGate = (attach as Record<string, unknown>)?.['fsm'] as
            { _config?: unknown; _bindings?: Map<string, { allowedStates: Set<string>; transitionEvent?: string }> } | undefined;
        if (fsmGate?._config && fsmGate?._bindings) {
            const bindings: Array<{ tool: string; states: string[]; event?: string }> = [];
            for (const [toolName, binding] of fsmGate._bindings) {
                bindings.push({
                    tool: toolName,
                    states: [...binding.allowedStates],
                    ...(binding.transitionEvent ? { event: binding.transitionEvent } : {}),
                });
            }
            fsmData = { config: fsmGate._config, bindings };
        }

        // Send definitions to host via C++ IPC
        g.__vinkius_edge_interceptor.applySync(undefined, [
            JSON.stringify({
                serverName: name,
                version,
                tools,
                ...(promptDefs.length > 0 ? { prompts: promptDefs } : {}),
                ...(fsmData ? { fsm: fsmData } : {}),
            }),
        ]);

        // Expose async dispatcher — PLAIN OBJECT return, never Error class.
        // Host extracts via { result: { copy: true } } (C++ structured clone).
        g.__vinkius_edge_dispatch = async (
            toolName: string,
            args: Record<string, unknown>,
        ) => {
            try {
                const ctx = contextFactory
                    ? await contextFactory(undefined)
                    : _missingContextProxy as TContext;
                return await registry.routeCall(ctx, toolName, args);
            } catch (e: unknown) {
                // Error class cannot survive C++ structured clone.
                // Return MCP-protocol plain object instead.
                const err = e as { stack?: string; message?: string };
                return {
                    isError: true,
                    content: [{
                        type: 'text',
                        text: String(err?.stack || err?.message || e),
                    }],
                };
            }
        };

        // ── Prompt Dispatcher ────────────────────────────────
        // Expose prompt handler for host-side prompt/get invocation.
        if (prompts) {
            g.__vinkius_edge_prompt_get = async (
                promptName: string,
                args: Record<string, string>,
            ) => {
                try {
                    const ctx = contextFactory
                        ? await contextFactory(undefined)
                        : _missingContextProxy as TContext;
                    return await prompts.routeGet(ctx, promptName, args);
                } catch (e: unknown) {
                    const err = e as { stack?: string; message?: string };
                    return {
                        messages: [{
                            role: 'user',
                            content: {
                                type: 'text',
                                text: `[ERROR] ${String(err?.message || e)}`,
                            },
                        }],
                    };
                }
            };
        }

        // Abort normal startup — no Server, no Transport (Bug #45 fix)
        return { server: null, close: async () => {} };
    }

    // ── Normal Server Startup ────────────────────────────────────────────

    // 1. Telemetry Bus (optional, default on)
    //    Gracefully degrades on serverless platforms (Vercel, Cloudflare)
    //    where IPC sockets / Named Pipes are not available.
    let bus: TelemetryBusInstance | undefined;
    if (telemetry) {
        try {
            // Build topology from registry builders
            const toolGroups = new Map<string, string[]>();
            for (const b of registry.getBuilders()) {
                const group = b.getName();
                for (const actionKey of b.getActionNames()) {
                    const list = toolGroups.get(group) ?? [];
                    list.push(actionKey);
                    toolGroups.set(group, list);
                }
            }

            bus = await createTelemetryBus({
                onConnect: () => ({
                    type: 'topology' as const,
                    serverName: name,
                    pid: process.pid,
                    tools: [...toolGroups.entries()].map(([n, actions]) => ({ name: n, actions })),
                    timestamp: Date.now(),
                }),
            });
            process.stderr.write(`📡 Telemetry bus ready (PID ${process.pid})\n`);
        } catch {
            // Serverless / sandboxed environments — telemetry unavailable
        }
    }

    // 2. MCP Server Instance
    const server = new Server(
        { name, version },
        { capabilities: { tools: {}, ...(prompts ? { prompts: {} } : {}) } },
    );

    // 3. Attach Registry
    await registry.attachToServer(server, {
        ...attach,
        ...(contextFactory ? { contextFactory } : {}),
        ...(prompts ? { prompts } : {}),
        ...(bus ? { telemetry: bus.emit } : {}),
    } as AttachOptions<TContext>);

    // 4. Connect Transport
    if (transport === 'http') {
        // ── Streamable HTTP Transport ────────────────────────
        const sessions = new Map<string, StreamableHTTPServerTransport>();

        const httpServer = createHttpServer(async (req, res) => {
            try {
                const url = new URL(req.url ?? '/', `http://localhost:${port}`);

                if (url.pathname !== '/mcp') {
                    res.writeHead(404).end();
                    return;
                }

                if (req.method === 'POST') {
                    // Bug #149 fix: enforce body size limit to prevent DoS/OOM.
                    const maxBytes = options.maxBodyBytes ?? 4_194_304; // 4MB
                    const declaredLength = parseInt(req.headers['content-length'] ?? '', 10);
                    if (declaredLength > maxBytes) {
                        res.writeHead(413).end('Payload too large');
                        return;
                    }
                    const chunks: Buffer[] = [];
                    let receivedBytes = 0;
                    for await (const chunk of req) {
                        receivedBytes += (chunk as Buffer).byteLength;
                        if (receivedBytes > maxBytes) {
                            req.destroy();
                            res.writeHead(413).end('Payload too large');
                            return;
                        }
                        chunks.push(chunk as Buffer);
                    }
                    const body = JSON.parse(Buffer.concat(chunks).toString());

                    const sessionId = req.headers['mcp-session-id'] as string | undefined;

                    if (sessionId && sessions.has(sessionId)) {
                        const t = sessions.get(sessionId)!;
                        await t.handleRequest(req, res, body);
                        return;
                    }

                    const t = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => crypto.randomUUID(),
                        onsessioninitialized: (id) => {
                            sessions.set(id, t);
                        },
                    });
                    t.onclose = () => {
                        const id = [...sessions.entries()].find(([, s]) => s === t)?.[0];
                        if (id) sessions.delete(id);
                    };
                    await server.connect(t as unknown as import('@modelcontextprotocol/sdk/shared/transport.js').Transport);
                    await t.handleRequest(req, res, body);
                } else if (req.method === 'GET') {
                    const sessionId = req.headers['mcp-session-id'] as string | undefined;
                    if (sessionId && sessions.has(sessionId)) {
                        const t = sessions.get(sessionId)!;
                        await t.handleRequest(req, res);
                    } else {
                        res.writeHead(400).end('Missing or invalid session');
                    }
                } else if (req.method === 'DELETE') {
                    const sessionId = req.headers['mcp-session-id'] as string | undefined;
                    if (sessionId && sessions.has(sessionId)) {
                        const t = sessions.get(sessionId)!;
                        await t.handleRequest(req, res);
                    } else {
                        res.writeHead(400).end('Missing or invalid session');
                    }
                } else {
                    res.writeHead(405).end();
                }
            } catch (err) {
                console.error('[Vurb] Unhandled error in HTTP handler:', err);
                if (!res.headersSent) res.writeHead(500).end();
            }
        });

        httpServer.listen(port, () => {
            process.stderr.write(`⚡ ${name} on http://localhost:${port}/mcp\n`);
        });

        async function close(): Promise<void> {
            if (bus) await bus.close();
            for (const t of sessions.values()) { try { await t.close(); } catch { /* best effort */ } }
            sessions.clear();
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
            await server.close();
        }

        const result: StartServerResult = { server, httpServer, close };
        if (bus) (result as { bus?: TelemetryBusInstance }).bus = bus;
        return result;
    }

    // ── Stdio Transport (default) ────────────────────────────
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    process.stderr.write(`⚡ ${name} running on stdio\n`);

    // 5. Close helper
    async function close(): Promise<void> {
        if (bus) await bus.close();
        await server.close();
    }

    const result: StartServerResult = { server, close };
    if (bus) (result as { bus?: TelemetryBusInstance }).bus = bus;
    return result;
}
