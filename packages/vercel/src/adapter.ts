/**
 * MCP Fusion — Vercel Adapter
 *
 * Deploys an MCP Fusion ToolRegistry to Vercel Functions (Edge or Node.js)
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
 * **Stateless JSON-RPC**: Vercel Functions are ephemeral. This
 * adapter forces `enableJsonResponse: true` — no SSE, no sessions,
 * no streaming notifications. Pure request/response. Compatible with
 * backend orchestrators (LangChain, Vercel AI SDK, custom agents).
 *
 * **Dual Runtime Support**: Works on both Vercel's Edge Runtime (V8)
 * and Node.js Runtime. Add `export const runtime = 'edge'` in your
 * route file to use the Edge Runtime, or omit it for Node.js.
 *
 * @module
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

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
 * Configuration for the Vercel adapter.
 *
 * @typeParam TContext - Application context type for Fusion handlers
 */
export interface VercelAdapterOptions<TContext> {
    /**
     * A pre-built `ToolRegistry` populated during Cold Start.
     *
     * The registry contains all tools with their Zod schemas,
     * Presenters, and middleware already compiled. This avoids
     * re-running reflection on every request.
     */
    readonly registry: RegistryLike;

    /** MCP server name (visible in capabilities). Default: `'mcp-fusion-vercel'` */
    readonly serverName?: string;

    /** MCP server version string. Default: `'1.0.0'` */
    readonly serverVersion?: string;

    /**
     * Context factory — creates the application context per request.
     *
     * Receives the incoming `Request` object. Access environment
     * variables via `process.env` (Node.js runtime) or through
     * your application's configuration.
     *
     * @example
     * ```typescript
     * contextFactory: async (req) => ({
     *     tenantId: req.headers.get('x-tenant-id') || 'public',
     *     dbUrl: process.env.DATABASE_URL!,
     * })
     * ```
     */
    readonly contextFactory?: (
        req: Request,
    ) => TContext | Promise<TContext>;

    /**
     * Additional options forwarded to `registry.attachToServer()`.
     *
     * Supports `filter`, `stateSync`, `observability`, etc.
     */
    readonly attachOptions?: Record<string, unknown>;
}

/**
 * The handler function returned by `vercelAdapter()`.
 *
 * Compatible with Next.js App Router route handlers:
 *
 * ```typescript
 * // app/api/mcp/route.ts
 * export const POST = vercelAdapter({ registry });
 * ```
 */
export type VercelHandler = (req: Request) => Promise<Response>;

// ============================================================================
// Adapter
// ============================================================================

/**
 * Create a Vercel adapter for MCP Fusion.
 *
 * Returns a `POST` handler function compatible with Next.js App Router
 * route handlers and standalone Vercel Functions. Each request creates
 * an ephemeral `McpServer` + `WebStandardStreamableHTTPServerTransport`,
 * wires the pre-compiled registry, and returns the MCP JSON-RPC response.
 *
 * **Usage with Next.js App Router:**
 *
 * ```typescript
 * // app/api/mcp/route.ts
 * import { ToolRegistry } from '@vinkius-core/mcp-fusion';
 * import { vercelAdapter } from '@vinkius-core/mcp-fusion-vercel';
 * import { billing, projects } from './tools.js';
 *
 * // COLD START: Zod reflection + compilation (once)
 * const registry = new ToolRegistry<MyContext>();
 * registry.registerAll(billing, projects);
 *
 * // WARM REQUEST: Only McpServer + Transport per invocation
 * export const POST = vercelAdapter<MyContext>({
 *     registry,
 *     contextFactory: async (req) => ({
 *         tenantId: req.headers.get('x-tenant-id') || 'public',
 *         dbUrl: process.env.DATABASE_URL!,
 *     }),
 * });
 *
 * // Optional: Use Edge Runtime for lower latency
 * export const runtime = 'edge';
 * ```
 *
 * **Usage as standalone Vercel Function:**
 *
 * ```typescript
 * // api/mcp.ts
 * import { vercelAdapter } from '@vinkius-core/mcp-fusion-vercel';
 *
 * const handler = vercelAdapter({ registry });
 * export default handler;
 * ```
 *
 * @typeParam TContext - Application context type for Fusion handlers
 */
export function vercelAdapter<TContext = void>(
    options: VercelAdapterOptions<TContext>,
): VercelHandler {
    const {
        registry,
        serverName = 'mcp-fusion-vercel',
        serverVersion = '1.0.0',
        contextFactory,
        attachOptions = {},
    } = options;

    return async function handlePost(request: Request): Promise<Response> {
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

        // 3. Build context from the request (per-request)
        const requestContext = contextFactory
            ? await contextFactory(request)
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
    };
}
