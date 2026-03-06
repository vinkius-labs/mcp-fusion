/**
 * contextFactoryGuard-bug89.test.ts
 *
 * Regression: In both vercelAdapter and cloudflareWorkersAdapter,
 * contextFactory exceptions propagated unhandled, causing the worker
 * to crash or return a generic error. After the fix, errors from
 * contextFactory are caught and returned as proper JSON-RPC error responses.
 *
 * This file tests the Vercel adapter path (cloudflare uses same pattern).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vercelAdapter, type RegistryLike } from '../src/index.js';

// ── Mock MCP SDK ──────────────────────────────────────────

const mockHandleRequest = vi.fn<(req: Request) => Promise<Response>>();
const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class MockMcpServer {
        constructor() {}
        connect = mockConnect;
        close = mockClose;
    },
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
    WebStandardStreamableHTTPServerTransport: class MockTransport {
        constructor() {}
        handleRequest = mockHandleRequest;
    },
}));

// ── Helpers ───────────────────────────────────────────────

function createMockRegistry(): RegistryLike {
    return {
        attachToServer: vi.fn(async () => vi.fn()),
    };
}

function createPostRequest(): Request {
    return new Request('https://example.vercel.app/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: 1,
        }),
    });
}

// ── Tests ─────────────────────────────────────────────────

describe('Vercel Adapter: contextFactory error guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHandleRequest.mockResolvedValue(
            new Response(JSON.stringify({ jsonrpc: '2.0', result: {}, id: 1 }), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        mockConnect.mockResolvedValue(undefined);
        mockClose.mockResolvedValue(undefined);
    });

    it('should return JSON-RPC error when contextFactory throws Error', async () => {
        const registry = createMockRegistry();
        const handler = vercelAdapter({
            registry,
            contextFactory: () => { throw new Error('Auth failed'); },
        });

        const response = await handler(createPostRequest());
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.jsonrpc).toBe('2.0');
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('Auth failed');
    });

    it('should return JSON-RPC error when contextFactory rejects', async () => {
        const registry = createMockRegistry();
        const handler = vercelAdapter({
            registry,
            contextFactory: async () => { throw new Error('DB connection lost'); },
        });

        const response = await handler(createPostRequest());
        const body = await response.json();
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('DB connection lost');
    });

    it('should handle non-Error throws from contextFactory', async () => {
        const registry = createMockRegistry();
        const handler = vercelAdapter({
            registry,
            contextFactory: () => { throw 'string error'; },
        });

        const response = await handler(createPostRequest());
        const body = await response.json();
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('string error');
    });

    it('should proceed normally when contextFactory succeeds', async () => {
        const registry = createMockRegistry();
        const handler = vercelAdapter({
            registry,
            contextFactory: async (req) => ({ userId: '123' }),
        });

        const response = await handler(createPostRequest());
        // Should not be an error response — should pass through to transport
        expect(response).toBeInstanceOf(Response);
        // Registry.attachToServer should have been called
        expect(registry.attachToServer).toHaveBeenCalled();
    });

    it('should proceed normally when no contextFactory is provided', async () => {
        const registry = createMockRegistry();
        const handler = vercelAdapter({ registry });

        const response = await handler(createPostRequest());
        expect(response).toBeInstanceOf(Response);
        expect(registry.attachToServer).toHaveBeenCalled();
    });
});
