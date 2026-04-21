/**
 * YamlMcpServer — Creates a Real MCP Server from a Compiled YAML Manifest
 *
 * This is the missing piece that turns parsed YAML into a **running server**.
 * Registers tools/list, tools/call, resources/list, resources/read,
 * prompts/list, and prompts/get handlers on the MCP SDK `Server`.
 *
 * **Open-source**: Basic execution via `BasicToolExecutor` (no DLP/SSRF/FinOps).
 * **Vinkius Engine**: Wraps this with the enterprise `ToolExecutionPipeline`.
 *
 * @example
 * ```typescript
 * import { createYamlMcpServer, loadYamlServer } from '@vurb/yaml';
 *
 * const compiled = await loadYamlServer(fs.readFileSync('vurb.yaml', 'utf-8'));
 * const { server, close } = await createYamlMcpServer(compiled);
 * // Server is now running on stdio — ready for Cursor, Claude Desktop, etc.
 * ```
 *
 * @module
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { CompiledYamlServer } from './LocalServer.js';
import type { CompiledTool } from '../compiler/ToolCompiler.js';
import type { CompiledResource } from '../compiler/ResourceCompiler.js';
import type { CompiledPrompt } from '../compiler/PromptCompiler.js';
import { executeYamlTool } from './BasicToolExecutor.js';
import { hydratePromptMessages } from '../compiler/PromptCompiler.js';
import { applyResponseTransform } from '../compiler/ResponseTransformer.js';

// ── Types ────────────────────────────────────────────────

export type YamlServerTransport = 'stdio' | 'http';

export interface YamlServerOptions {
    /** Transport: 'stdio' (default) or 'http'. */
    readonly transport?: YamlServerTransport;

    /** Port for HTTP transport (default: 3001). */
    readonly port?: number;

    /** Custom fetch function — injectable for testing or enterprise wrapping. */
    readonly fetchFn?: typeof fetch;
}

export interface YamlServerResult {
    /** The MCP Server instance. */
    readonly server: InstanceType<typeof Server>;
    /** The HTTP server instance (only present when transport: 'http'). */
    readonly httpServer?: HttpServer;
    /** Gracefully shut down. */
    readonly close: () => Promise<void>;
}

// ── Tool Handler Helpers ─────────────────────────────────

/** Build MCP tools/list response from compiled tools. */
export function buildToolsList(tools: readonly CompiledTool[]) {
    return tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));
}

/** Build MCP resources/list response from compiled resources. */
export function buildResourcesList(resources: readonly CompiledResource[]) {
    return resources.map(resource => ({
        name: resource.name,
        uri: resource.uri,
        ...(resource.description ? { description: resource.description } : {}),
        mimeType: resource.mimeType,
    }));
}

/** Build MCP prompts/list response from compiled prompts. */
export function buildPromptsList(prompts: readonly CompiledPrompt[]) {
    return prompts.map(prompt => ({
        name: prompt.name,
        ...(prompt.description ? { description: prompt.description } : {}),
        arguments: prompt.arguments.map(arg => ({
            name: arg.name,
            ...(arg.description ? { description: arg.description } : {}),
            required: arg.required,
        })),
    }));
}

// ── Resource Content Reader ─────────────────────────────

/** Fetch the content of a compiled resource. */
export async function readResourceContent(
    resource: CompiledResource,
    fetchFn: typeof fetch,
): Promise<string> {
    switch (resource.execute.type) {
        case 'static':
            return resource.execute.content;

        case 'fetch': {
            const res = await fetchFn(resource.execute.url, {
                headers: resource.execute.headers,
            });
            if (!res.ok) {
                throw new Error(`Resource fetch failed: ${res.status} ${res.statusText}`);
            }
            const text = await res.text();
            if (resource.response?.extract) {
                try {
                    const data = JSON.parse(text);
                    const transformed = applyResponseTransform(data, resource.response);
                    return typeof transformed === 'string' ? transformed : JSON.stringify(transformed, null, 2);
                } catch {
                    return text;
                }
            }
            return text;
        }

        case 'connection': {
            const { connection, method, path } = resource.execute;
            const url = new URL(path, connection.baseUrl);
            const res = await fetchFn(url.toString(), {
                method,
                headers: connection.headers as Record<string, string>,
            });
            if (!res.ok) {
                throw new Error(`Resource fetch failed: ${res.status} ${res.statusText}`);
            }
            const text = await res.text();
            if (resource.response?.extract) {
                try {
                    const data = JSON.parse(text);
                    const transformed = applyResponseTransform(data, resource.response);
                    return typeof transformed === 'string' ? transformed : JSON.stringify(transformed, null, 2);
                } catch {
                    return text;
                }
            }
            return text;
        }
    }
}

// ── Main Entry Point ─────────────────────────────────────

/**
 * Create and start a real MCP server from a compiled YAML manifest.
 *
 * This wires everything together:
 * - `tools/list` → returns compiled tool definitions
 * - `tools/call` → executes via BasicToolExecutor (plain fetch)
 * - `resources/list` → returns compiled resource definitions
 * - `resources/read` → fetches resource content (fetch/static/connection)
 * - `prompts/list` → returns compiled prompt definitions
 * - `prompts/get` → hydrates prompt templates with arguments
 *
 * @param compiled - Output from {@link loadYamlServer}
 * @param options - Transport and configuration options
 * @returns Running MCP server with close() cleanup
 */
export async function createYamlMcpServer(
    compiled: CompiledYamlServer,
    options: YamlServerOptions = {},
): Promise<YamlServerResult> {
    const {
        transport = 'stdio',
        port = 3001,
        fetchFn = globalThis.fetch,
    } = options;

    const { serverMeta, tools, resources, prompts } = compiled;

    // ── 1. Server capabilities (only advertise what's defined) ──
    const capabilities: Record<string, Record<string, never>> = {};
    if (tools.length > 0) capabilities['tools'] = {};
    if (resources.length > 0) capabilities['resources'] = {};
    if (prompts.length > 0) capabilities['prompts'] = {};

    const server = new Server(
        { name: serverMeta.name, version: '1.0.0' },
        { capabilities },
    );

    // ── 2. Tools handlers ────────────────────────────────
    if (tools.length > 0) {
        const toolMap = new Map<string, CompiledTool>();
        for (const tool of tools) {
            toolMap.set(tool.name, tool);
        }

        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: buildToolsList(tools),
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args = {} } = request.params;
            const tool = toolMap.get(name);

            if (!tool) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ error: true, message: `Unknown tool: "${name}"` }),
                    }],
                    isError: true,
                } as Record<string, unknown>;
            }

            return executeYamlTool(tool, args, fetchFn) as unknown as Record<string, unknown>;
        });
    }

    // ── 3. Resources handlers ────────────────────────────
    if (resources.length > 0) {
        const resourceMap = new Map<string, CompiledResource>();
        for (const resource of resources) {
            resourceMap.set(resource.uri, resource);
        }

        server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: buildResourcesList(resources),
        }));

        server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            const resource = resourceMap.get(uri);

            if (!resource) {
                const available = [...resourceMap.keys()].join(', ');
                throw new Error(
                    `Unknown resource URI: "${uri}". ` +
                    `Available: ${available || '(none)'}`,
                );
            }

            try {
                const content = await readResourceContent(resource, fetchFn);
                return {
                    contents: [{
                        uri,
                        mimeType: resource.mimeType,
                        text: content,
                    }],
                };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(
                    `Failed to read resource "${resource.name}" (${uri}): ${msg}. ` +
                    (resource.execute.type === 'connection'
                        ? `Check that the connection "${resource.execute.connection.baseUrl}" is reachable.`
                        : resource.execute.type === 'fetch'
                            ? `Check that the URL "${resource.execute.url}" is accessible.`
                            : `Check the static content configuration.`),
                );
            }
        });
    }

    // ── 4. Prompts handlers ──────────────────────────────
    if (prompts.length > 0) {
        const promptMap = new Map<string, CompiledPrompt>();
        for (const prompt of prompts) {
            promptMap.set(prompt.name, prompt);
        }

        server.setRequestHandler(ListPromptsRequestSchema, async () => ({
            prompts: buildPromptsList(prompts),
        }));

        server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args = {} } = request.params;
            const prompt = promptMap.get(name);

            if (!prompt) {
                const available = [...promptMap.keys()].join(', ');
                throw new Error(
                    `Unknown prompt: "${name}". ` +
                    `Available: ${available || '(none)'}`,
                );
            }

            try {
                const messages = hydratePromptMessages(prompt, args);
                return {
                    ...(prompt.description ? { description: prompt.description } : {}),
                    messages,
                };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const requiredArgs = prompt.arguments
                    .filter(a => a.required)
                    .map(a => a.name);
                throw new Error(
                    `Failed to render prompt "${name}": ${msg}. ` +
                    (requiredArgs.length > 0
                        ? `Required arguments: ${requiredArgs.join(', ')}.`
                        : 'This prompt has no required arguments.'),
                );
            }
        });
    }

    // ── 5. Connect transport ─────────────────────────────
    if (transport === 'http') {
        const sessions = new Map<string, StreamableHTTPServerTransport>();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        const httpServer = createHttpServer(async (req, res) => {
            try {
                const url = new URL(req.url ?? '/', `http://localhost:${port}`);
                if (url.pathname !== '/mcp') {
                    res.writeHead(404).end();
                    return;
                }

                // CORS for local dev
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
                if (req.method === 'OPTIONS') {
                    res.writeHead(204).end();
                    return;
                }

                if (req.method === 'POST') {
                    const chunks: Buffer[] = [];
                    for await (const chunk of req) {
                        chunks.push(chunk as Buffer);
                    }
                    let body: unknown;
                    try {
                        body = JSON.parse(Buffer.concat(chunks).toString());
                    } catch {
                        res.writeHead(400).end('Invalid JSON');
                        return;
                    }

                    const sessionId = req.headers['mcp-session-id'] as string | undefined;

                    if (sessionId && sessions.has(sessionId)) {
                        const t = sessions.get(sessionId)!;
                        await t.handleRequest(req, res, body);
                        return;
                    }

                    // New session
                    const t = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (id) => {
                            sessions.set(id, t);
                        },
                    });
                    t.onclose = () => {
                        const id = [...sessions.entries()].find(([, s]) => s === t)?.[0];
                        if (id) sessions.delete(id);
                    };
                    await server.connect(t as unknown as Transport);
                    await t.handleRequest(req, res, body);
                } else if (req.method === 'GET') {
                    const sessionId = req.headers['mcp-session-id'] as string | undefined;
                    if (sessionId && sessions.has(sessionId)) {
                        await sessions.get(sessionId)!.handleRequest(req, res);
                    } else {
                        res.writeHead(400).end('Missing or invalid session');
                    }
                } else if (req.method === 'DELETE') {
                    const sessionId = req.headers['mcp-session-id'] as string | undefined;
                    if (sessionId && sessions.has(sessionId)) {
                        await sessions.get(sessionId)!.handleRequest(req, res);
                    } else {
                        res.writeHead(400).end('Missing or invalid session');
                    }
                } else {
                    res.writeHead(405).end();
                }
            } catch (err) {
                console.error('[vurb-yaml] HTTP error:', err);
                if (!res.headersSent) res.writeHead(500).end();
            }
        });

        httpServer.listen(port, () => {
            process.stderr.write(`⚡ ${serverMeta.name} on http://localhost:${port}/mcp (vurb.yaml)\n`);
        });

        async function close(): Promise<void> {
            for (const t of sessions.values()) { try { await t.close(); } catch { /* best effort */ } }
            sessions.clear();
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
            await server.close();
        }

        const result: YamlServerResult = { server, httpServer, close };
        return result;
    }

    // ── Stdio Transport (default) ────────────────────────
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    process.stderr.write(`⚡ ${serverMeta.name} running on stdio (vurb.yaml)\n`);

    async function close(): Promise<void> {
        await server.close();
    }

    return { server, close };
}

