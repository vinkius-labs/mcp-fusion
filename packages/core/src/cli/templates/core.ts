/**
 * Core Templates — fusion.ts, context.ts, server.ts
 *
 * The architectural spine of every scaffolded project.
 * @module
 */
import type { ProjectConfig } from '../types.js';

/** Generate `src/fusion.ts` — The one-file context center */
export function fusionTs(): string {
    return `/**
 * Fusion Instance — Context Initialization
 *
 * Define your context type ONCE. Every f.query(), f.mutation(),
 * f.presenter(), f.prompt(), and f.middleware() call inherits
 * AppContext — zero generic repetition anywhere in the codebase.
 */
import { initFusion } from '@vinkius-core/mcp-fusion';
import type { AppContext } from './context.js';

export const f = initFusion<AppContext>();
`;
}

/** Generate `src/context.ts` — Application context type + factory */
export function contextTs(): string {
    return `/**
 * Application Context — Shared State for Every Tool Handler
 *
 * Every f.query() / f.mutation() handler receives (input, ctx)
 * where ctx is this AppContext. Extend it with your own services
 * (DB client, auth, external APIs, etc.)
 */

export interface AppContext {
    /** Current user role for RBAC checks */
    role: 'ADMIN' | 'USER' | 'GUEST';

    /** Tenant identifier (multi-tenancy) */
    tenantId: string;
}

/**
 * Create the application context for each tool invocation.
 *
 * In production, hydrate this from the MCP session metadata,
 * JWT tokens, or environment variables.
 */
export function createContext(): AppContext {
    return {
        role: 'ADMIN',
        tenantId: 'default',
    };
}
`;
}

/** Generate `src/server.ts` — Bootstrap with autoDiscover + transport */
export function serverTs(config: ProjectConfig): string {
    if (config.transport === 'stdio') {
        // Simplified: one-liner bootstrap via startServer()
        return `/**
 * Server Bootstrap — MCP Fusion
 *
 * Tools are auto-discovered from src/tools/.
 * Drop a file, it becomes a tool.
 */
import { fileURLToPath } from 'node:url';
import { autoDiscover, PromptRegistry, startServer } from '@vinkius-core/mcp-fusion';
import { createContext } from './context.js';
import { f } from './fusion.js';
import { GreetPrompt } from './prompts/greet.js';

// ── Registry ─────────────────────────────────────────────
const registry = f.registry();
const prompts = new PromptRegistry();

// ── Auto-Discover & Register ─────────────────────────────
await autoDiscover(registry, fileURLToPath(new URL('./tools', import.meta.url)));
prompts.register(GreetPrompt);

// ── Start ────────────────────────────────────────────────
await startServer({
    name: '${config.name}',
    registry,
    prompts,
    contextFactory: () => createContext(),
});
`;
    }

    // SSE transport — manual setup required (startServer is stdio-only)
    return `/**
 * Server Bootstrap — MCP Fusion with SSE Transport
 *
 * Tools are auto-discovered from src/tools/.
 * Drop a file, it becomes a tool.
 */
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { autoDiscover, PromptRegistry } from '@vinkius-core/mcp-fusion';
import { createContext } from './context.js';
import { f } from './fusion.js';
import { GreetPrompt } from './prompts/greet.js';

// ── Registry ─────────────────────────────────────────────
const registry = f.registry();
const prompts = new PromptRegistry();

// ── Auto-Discover & Register ─────────────────────────────
await autoDiscover(registry, fileURLToPath(new URL('./tools', import.meta.url)));
prompts.register(GreetPrompt);

// ── Server ───────────────────────────────────────────────
const server = new Server(
    { name: '${config.name}', version: '0.1.0' },
    { capabilities: { tools: {}, prompts: {} } },
);

registry.attachToServer(server, {
    contextFactory: () => createContext(),
    prompts,
});

// ── Transport ────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3001);
const transports = new Map<string, SSEServerTransport>();

const httpServer = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/sse') {
        const sseTransport = new SSEServerTransport('/mcp/messages', res);
        transports.set(sseTransport.sessionId, sseTransport);
        res.on('close', () => transports.delete(sseTransport.sessionId));
        await server.connect(sseTransport);
    } else if (req.method === 'POST' && req.url?.startsWith('/mcp/messages')) {
        const url = new URL(req.url, \`http://localhost:\${PORT}\`);
        const sessionId = url.searchParams.get('sessionId') ?? '';
        const transport = transports.get(sessionId);
        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.writeHead(400).end('Unknown session');
        }
    } else {
        res.writeHead(404).end();
    }
});

httpServer.listen(PORT, () => {
    console.error(\`⚡ MCP Fusion SSE server on http://localhost:\${PORT}/sse\`);
});
`;
}
