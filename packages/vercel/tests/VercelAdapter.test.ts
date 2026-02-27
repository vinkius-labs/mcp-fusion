/**
 * VercelAdapter.test.ts
 *
 * Tests for the Vercel adapter (`vercelAdapter()`).
 *
 * Validates:
 *   - POST handler creation and signature
 *   - Method rejection (GET, PUT, DELETE → 405)
 *   - McpServer + Transport instantiation per request
 *   - Context factory invocation and context injection
 *   - Registry attachToServer wiring
 *   - Cleanup (server.close) on success and error
 *   - Configuration defaults and overrides
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vercelAdapter, type VercelAdapterOptions, type RegistryLike } from '../src/index.js';

// ============================================================================
// Test Helpers — Mock McpServer & Transport
// ============================================================================

// We mock the MCP SDK modules to verify the adapter's wiring behavior
// without requiring a real MCP server.

const mockHandleRequest = vi.fn<(req: Request) => Promise<Response>>();
const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockServerConstructor = vi.fn();
const mockTransportConstructor = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class MockMcpServer {
        constructor(opts: Record<string, unknown>) {
            mockServerConstructor(opts);
        }
        connect = mockConnect;
        close = mockClose;
    },
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
    WebStandardStreamableHTTPServerTransport: class MockTransport {
        constructor(opts: Record<string, unknown>) {
            mockTransportConstructor(opts);
        }
        handleRequest = mockHandleRequest;
    },
}));

// ============================================================================
// Mock Registry
// ============================================================================

function createMockRegistry(): RegistryLike {
    return {
        attachToServer: vi.fn<(server: unknown, options?: Record<string, unknown>) => Promise<unknown>>(
            async () => vi.fn(),
        ),
    };
}

// ============================================================================
// Helper — create Request
// ============================================================================

function createRequest(method = 'POST', headers: Record<string, string> = {}): Request {
    return new Request('https://example.vercel.app/api/mcp', {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: method === 'POST' ? JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: 1,
        }) : undefined,
    });
}

// ============================================================================
// Tests
// ============================================================================

describe('Vercel Adapter', () => {
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

    // ── Handler Creation ────────────────────────────────────

    describe('Handler Creation', () => {
        it('returns a function', () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            expect(typeof handler).toBe('function');
        });

        it('returned function accepts a Request and returns a Promise<Response>', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            const response = await handler(createRequest());
            expect(response).toBeInstanceOf(Response);
        });
    });

    // ── Method Rejection ────────────────────────────────────

    describe('Method Rejection', () => {
        it('rejects GET requests with 405', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            const response = await handler(createRequest('GET'));

            expect(response.status).toBe(405);
            expect(response.headers.get('Allow')).toBe('POST');

            const body = await response.json();
            expect(body.jsonrpc).toBe('2.0');
            expect(body.error.code).toBe(-32600);
        });

        it('rejects PUT requests with 405', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            const response = await handler(createRequest('PUT'));
            expect(response.status).toBe(405);
        });

        it('rejects DELETE requests with 405', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            const response = await handler(createRequest('DELETE'));
            expect(response.status).toBe(405);
        });

        it('405 response has correct Content-Type', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            const response = await handler(createRequest('GET'));
            expect(response.headers.get('Content-Type')).toBe('application/json');
        });
    });

    // ── McpServer Configuration ────────────────────────────

    describe('McpServer Configuration', () => {
        it('uses default server name and version', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            await handler(createRequest());

            expect(mockServerConstructor).toHaveBeenCalledWith({
                name: 'mcp-fusion-vercel',
                version: '1.0.0',
            });
        });

        it('uses custom server name and version', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({
                registry,
                serverName: 'my-api',
                serverVersion: '2.5.0',
            });
            await handler(createRequest());

            expect(mockServerConstructor).toHaveBeenCalledWith({
                name: 'my-api',
                version: '2.5.0',
            });
        });
    });

    // ── Transport Configuration ─────────────────────────────

    describe('Transport Configuration', () => {
        it('creates transport with enableJsonResponse: true', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            await handler(createRequest());

            expect(mockTransportConstructor).toHaveBeenCalledWith({
                enableJsonResponse: true,
            });
        });
    });

    // ── Registry Wiring ─────────────────────────────────────

    describe('Registry Wiring', () => {
        it('calls attachToServer on the registry', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            await handler(createRequest());

            expect(registry.attachToServer).toHaveBeenCalledTimes(1);
        });

        it('forwards attachOptions to attachToServer', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({
                registry,
                attachOptions: { debug: true, filter: { tags: ['api'] } },
            });
            await handler(createRequest());

            const callArgs = (registry.attachToServer as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(callArgs.debug).toBe(true);
            expect(callArgs.filter).toEqual({ tags: ['api'] });
        });
    });

    // ── Context Factory ────────────────────────────────────

    describe('Context Factory', () => {
        it('calls contextFactory with the request', async () => {
            const registry = createMockRegistry();
            const contextFactory = vi.fn().mockResolvedValue({ tenantId: 'acme' });
            const handler = vercelAdapter({ registry, contextFactory });

            const request = createRequest('POST', { 'x-tenant-id': 'acme' });
            await handler(request);

            expect(contextFactory).toHaveBeenCalledTimes(1);
            expect(contextFactory).toHaveBeenCalledWith(request);
        });

        it('injects context into attachOptions when contextFactory is provided', async () => {
            const registry = createMockRegistry();
            const contextFactory = vi.fn().mockResolvedValue({ tenantId: 'acme' });
            const handler = vercelAdapter({ registry, contextFactory });
            await handler(createRequest());

            const callArgs = (registry.attachToServer as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(callArgs.contextFactory).toBeDefined();
            expect(typeof callArgs.contextFactory).toBe('function');
            // The injected factory should return the context value
            expect(callArgs.contextFactory()).toEqual({ tenantId: 'acme' });
        });

        it('does not inject contextFactory when none is provided', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });
            await handler(createRequest());

            const callArgs = (registry.attachToServer as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(callArgs.contextFactory).toBeUndefined();
        });

        it('supports async contextFactory', async () => {
            const registry = createMockRegistry();
            const contextFactory = vi.fn().mockImplementation(async (req: Request) => {
                // Simulate async DB lookup
                await new Promise(resolve => setTimeout(resolve, 1));
                return { tenantId: req.headers.get('x-tenant-id') || 'default' };
            });
            const handler = vercelAdapter({ registry, contextFactory });
            await handler(createRequest('POST', { 'x-tenant-id': 'corp' }));

            const callArgs = (registry.attachToServer as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(callArgs.contextFactory()).toEqual({ tenantId: 'corp' });
        });
    });

    // ── Request Lifecycle ────────────────────────────────────

    describe('Request Lifecycle', () => {
        it('connects transport before handling request', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });

            const callOrder: string[] = [];
            mockConnect.mockImplementation(async () => { callOrder.push('connect'); });
            mockHandleRequest.mockImplementation(async () => {
                callOrder.push('handleRequest');
                return new Response('{}');
            });
            mockClose.mockImplementation(async () => { callOrder.push('close'); });

            await handler(createRequest());

            expect(callOrder).toEqual(['connect', 'handleRequest', 'close']);
        });

        it('closes server even when handleRequest throws', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });

            mockHandleRequest.mockRejectedValue(new Error('transport error'));

            await expect(handler(createRequest())).rejects.toThrow('transport error');
            expect(mockClose).toHaveBeenCalledTimes(1);
        });

        it('creates new McpServer per request (isolation)', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });

            await handler(createRequest());
            await handler(createRequest());

            expect(mockServerConstructor).toHaveBeenCalledTimes(2);
            expect(mockTransportConstructor).toHaveBeenCalledTimes(2);
        });

        it('forwards handleRequest response to caller', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });

            const expectedBody = JSON.stringify({
                jsonrpc: '2.0',
                result: { tools: [] },
                id: 1,
            });
            mockHandleRequest.mockResolvedValue(new Response(expectedBody, {
                headers: { 'Content-Type': 'application/json' },
            }));

            const response = await handler(createRequest());
            const body = await response.json();

            expect(body.jsonrpc).toBe('2.0');
            expect(body.result.tools).toEqual([]);
        });
    });

    // ── Edge Cases ───────────────────────────────────────────

    describe('Edge Cases', () => {
        it('works without optional configuration', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({ registry });

            const response = await handler(createRequest());
            expect(response).toBeInstanceOf(Response);
        });

        it('merges attachOptions with contextFactory', async () => {
            const registry = createMockRegistry();
            const handler = vercelAdapter({
                registry,
                contextFactory: async () => ({ userId: '123' }),
                attachOptions: { debug: true },
            });

            await handler(createRequest());

            const callArgs = (registry.attachToServer as ReturnType<typeof vi.fn>).mock.calls[0][1];
            expect(callArgs.debug).toBe(true);
            expect(callArgs.contextFactory).toBeDefined();
        });
    });
});
