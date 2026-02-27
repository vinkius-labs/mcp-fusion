/**
 * MCP Fusion — Cloudflare Workers Adapter
 *
 * Deploys an MCP Fusion ToolRegistry to Cloudflare Workers edge
 * with zero configuration. Uses the MCP SDK's native WinterCG
 * transport (`WebStandardStreamableHTTPServerTransport`).
 *
 * **Architecture**:
 *
 * - **Cold Start** (once): The developer builds and populates a
 *   `ToolRegistry` in the module's top-level scope. Zod reflection,
 *   Presenter compilation, and schema generation happen here —
 *   zero CPU cost on warm requests.
 *
 * - **Warm Request** (per invocation): Only `McpServer` + `Transport`
 *   are instantiated per request. `attachToServer()` is a trivial
 *   handler-routing layer — no reflection, no compilation.
 *
 * **Stateless JSON-RPC**: Cloudflare Workers are ephemeral. This
 * adapter forces `enableJsonResponse: true` — no SSE, no sessions,
 * no streaming notifications. Pure request/response. Compatible with
 * backend orchestrators (LangChain, Vercel AI SDK, custom agents).
 *
 * **Cloudflare `env` Injection**: The `env` object (D1, KV, R2,
 * secrets) is injected per-request via the Worker's `fetch()` 
 * signature. The adapter exposes it to the user's `contextFactory`.
 *
 * @module
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

// ============================================================================
// Cloudflare Workers Types (inline — avoids @cloudflare/workers-types dep)
// ============================================================================

/**
 * Cloudflare Workers ExecutionContext.
 *
 * Provides `waitUntil()` for background tasks and `passThroughOnException()`.
 * Defined inline to avoid requiring `@cloudflare/workers-types`.
 *
 * If `@cloudflare/workers-types` is installed, the user's types will
 * merge with this via declaration merging.
 */
export interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Duck-typed interface for MCP Fusion's ToolRegistry.
 *
 * Accepts any object with `attachToServer()` — decoupled from the
 * concrete class to avoid importing the core package at type level.
 */
export interface RegistryLike {
    attachToServer(
        server: unknown,
        options?: Record<string, unknown>,
    ): Promise<unknown>;
}

/**
 * Configuration for the Cloudflare Workers adapter.
 *
 * @typeParam TEnv - Cloudflare environment bindings (D1, KV, R2, secrets)
 * @typeParam TContext - Application context type for Fusion handlers
 */
export interface CloudflareAdapterOptions<TEnv, TContext> {
    /**
     * A pre-built `ToolRegistry` populated during Cold Start.
     *
     * The registry contains all tools with their Zod schemas,
     * Presenters, and middleware already compiled. This avoids
     * re-running reflection on every request.
     */
    readonly registry: RegistryLike;

    /** MCP server name (visible in capabilities). Default: `'mcp-fusion-edge'` */
    readonly serverName?: string;

    /** MCP server version string. Default: `'1.0.0'` */
    readonly serverVersion?: string;

    /**
     * Context factory — creates the application context per request.
     *
     * Receives the Cloudflare `Request`, `env` bindings, and `ExecutionContext`,
     * allowing full access to D1 databases, KV namespaces, R2 buckets, and secrets.
     *
     * @example
     * ```typescript
     * contextFactory: async (req, env) => ({
     *     db: env.DB,           // D1 binding
     *     tenantId: req.headers.get('x-tenant-id') || 'public',
     * })
     * ```
     */
    readonly contextFactory?: (
        req: Request,
        env: TEnv,
        ctx: ExecutionContext,
    ) => TContext | Promise<TContext>;

    /**
     * Additional options forwarded to `registry.attachToServer()`.
     *
     * Supports `filter`, `stateSync`, `observability`, etc.
     */
    readonly attachOptions?: Record<string, unknown>;
}

/**
 * The object returned by `cloudflareWorkersAdapter()`.
 *
 * Implements the Cloudflare Workers ES Modules `fetch` handler signature.
 *
 * @typeParam TEnv - Cloudflare environment bindings
 */
export interface CloudflareWorkerHandler<TEnv> {
    fetch(
        request: Request,
        env: TEnv,
        ctx: ExecutionContext,
    ): Promise<Response>;
}

// ============================================================================
// Adapter
// ============================================================================

/**
 * Create a Cloudflare Workers adapter for MCP Fusion.
 *
 * Returns an object with a `fetch()` method matching the Workers
 * ES Modules export default interface. Each request creates an
 * ephemeral `McpServer` + `WebStandardStreamableHTTPServerTransport`,
 * wires the pre-compiled registry, and returns the MCP JSON-RPC response.
 *
 * @typeParam TEnv - Cloudflare environment bindings (typed by the developer)
 * @typeParam TContext - Application context type for Fusion handlers
 *
 * @example
 * ```typescript
 * // worker.ts
 * import { ToolRegistry } from '@vinkius-core/mcp-fusion';
 * import { cloudflareWorkersAdapter } from '@vinkius-core/mcp-fusion-cloudflare';
 * import { billing, projects } from './tools.js';
 *
 * // COLD START: Zod reflection + compilation (once)
 * const registry = new ToolRegistry<MyContext>();
 * registry.registerAll(billing, projects);
 *
 * export interface Env { DB: D1Database; KV: KVNamespace; }
 *
 * // WARM REQUEST: Only McpServer + Transport per invocation
 * export default cloudflareWorkersAdapter<Env, MyContext>({
 *     registry,
 *     contextFactory: async (req, env) => ({
 *         db: env.DB,
 *         tenantId: req.headers.get('x-tenant-id') || 'public',
 *     }),
 * });
 * ```
 */
export function cloudflareWorkersAdapter<TEnv = unknown, TContext = void>(
    options: CloudflareAdapterOptions<TEnv, TContext>,
): CloudflareWorkerHandler<TEnv> {
    const {
        registry,
        serverName = 'mcp-fusion-edge',
        serverVersion = '1.0.0',
        contextFactory,
        attachOptions = {},
    } = options;

    return {
        async fetch(
            request: Request,
            env: TEnv,
            ctx: ExecutionContext,
        ): Promise<Response> {
            // Only POST is valid for stateless MCP JSON-RPC
            if (request.method !== 'POST') {
                return new Response(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        error: {
                            code: -32600,
                            message: 'Only POST requests are accepted. This is a stateless MCP endpoint.',
                        },
                    }),
                    {
                        status: 405,
                        headers: {
                            'Content-Type': 'application/json',
                            'Allow': 'POST',
                        },
                    },
                );
            }

            // 1. Ephemeral McpServer (isolates concurrent requests)
            const server = new McpServer({
                name: serverName,
                version: serverVersion,
            });

            // 2. Stateless WinterCG transport — JSON-RPC only, no SSE
            const transport = new WebStandardStreamableHTTPServerTransport({
                enableJsonResponse: true,
            });

            // 3. Build context from Cloudflare env (per-request)
            const requestContext = contextFactory
                ? await contextFactory(request, env, ctx)
                : undefined;

            // 4. Wire the pre-compiled registry to the ephemeral server
            const mergedOptions: Record<string, unknown> = {
                ...attachOptions,
            };
            if (requestContext !== undefined) {
                mergedOptions['contextFactory'] = () => requestContext;
            }

            await registry.attachToServer(server, mergedOptions);

            // 5. Connect transport and handle the request
            await server.connect(transport);

            try {
                return await transport.handleRequest(request);
            } finally {
                // Cleanup — release resources
                await server.close();
            }
        },
    };
}
