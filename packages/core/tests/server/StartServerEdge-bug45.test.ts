/**
 * Bug #45 Regression: `startServer` edge interceptor returns `server: null` typed as `Server`
 *
 * BUG: When running inside a V8 Isolate (Vinkius Cloud Edge), `startServer`
 * detects `__vinkius_edge_interceptor` and aborts normal startup, returning
 * `{ server: null as any, close: async () => {} }`. The `as any` cast hides
 * the `null` from TypeScript — callers accessing `result.server.close()` or
 * any Server method crash with `TypeError: Cannot read properties of null`.
 *
 * WHY EXISTING TESTS MISSED IT:
 * Zero tests cover the edge interceptor code path. All startServer tests
 * (if any) run in normal stdio mode. The edge interceptor relies on
 * `globalThis.__vinkius_edge_interceptor` which is only injected by the
 * Vinkius Cloud C++ host — never present in test environments.
 *
 * FIX: Changed `StartServerResult.server` type from `Server` to `Server | null`.
 * Removed `as any` cast. TypeScript now correctly warns callers to check
 * for null before accessing server methods.
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startServer, type StartServerResult } from '../../src/server/startServer.js';

describe('Bug #45 Regression: edge interceptor server null safety', () => {

    afterEach(() => {
        // Clean up globalThis
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).__vinkius_edge_interceptor;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).__vinkius_edge_dispatch;
    });

    it('edge mode returns server: null (not as any)', async () => {
        // Simulate Vinkius Cloud edge environment
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__vinkius_edge_interceptor = {
            applySync: vi.fn(),
        };

        const mockRegistry = {
            getBuilders: () => [],
            attachToServer: vi.fn(),
            routeCall: vi.fn(),
        };

        const result = await startServer({
            name: 'test-edge',
            registry: mockRegistry,
        });

        // CRITICAL: server should be null, not `null as any`
        expect(result.server).toBeNull();
    });

    it('edge mode close() is a safe no-op', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__vinkius_edge_interceptor = {
            applySync: vi.fn(),
        };

        const result = await startServer({
            name: 'test-edge',
            registry: {
                getBuilders: () => [],
                attachToServer: vi.fn(),
                routeCall: vi.fn(),
            },
        });

        // close() should be callable without error
        await expect(result.close()).resolves.toBeUndefined();
    });

    it('edge mode sends tool definitions via interceptor', async () => {
        const applySync = vi.fn();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__vinkius_edge_interceptor = { applySync };

        const builders = [{
            getName: () => 'users',
            getActionNames: () => ['list', 'get'],
            buildToolDefinition: () => ({ name: 'users', description: 'User tools' }),
        }];

        await startServer({
            name: 'my-edge-server',
            version: '2.0.0',
            registry: {
                getBuilders: () => builders,
                attachToServer: vi.fn(),
                routeCall: vi.fn(),
            },
        });

        expect(applySync).toHaveBeenCalledOnce();
        const payload = JSON.parse(applySync.mock.calls[0][1][0]);
        expect(payload.serverName).toBe('my-edge-server');
        expect(payload.version).toBe('2.0.0');
        expect(payload.tools).toHaveLength(1);
        expect(payload.tools[0].name).toBe('users');
    });

    it('edge mode exposes __vinkius_edge_dispatch function', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__vinkius_edge_interceptor = {
            applySync: vi.fn(),
        };

        const routeCall = vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
        });

        await startServer({
            name: 'dispatch-test',
            registry: {
                getBuilders: () => [],
                attachToServer: vi.fn(),
                routeCall,
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatch = (globalThis as any).__vinkius_edge_dispatch;
        expect(typeof dispatch).toBe('function');

        const response = await dispatch('users', { action: 'list' });
        expect(response.content[0].text).toBe('ok');
    });

    it('edge dispatch catches errors and returns MCP-safe error object', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__vinkius_edge_interceptor = {
            applySync: vi.fn(),
        };

        const routeCall = vi.fn().mockRejectedValue(new Error('boom'));

        await startServer({
            name: 'dispatch-err',
            registry: {
                getBuilders: () => [],
                attachToServer: vi.fn(),
                routeCall,
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispatch = (globalThis as any).__vinkius_edge_dispatch;
        const response = await dispatch('bad-tool', {});

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('boom');
    });

    it('StartServerResult type allows null server (compile-time check)', () => {
        // This test validates the type-level fix at compile time.
        // Before the fix, `server` was typed as `Server` (non-null).
        // After the fix, `server` is `Server | null`.
        const result: StartServerResult = {
            server: null,
            close: async () => {},
        };

        // TypeScript should accept this without error
        expect(result.server).toBeNull();
    });
});
