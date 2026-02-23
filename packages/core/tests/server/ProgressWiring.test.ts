/**
 * ProgressWiring — End-to-End Progress Notification Tests
 *
 * Verifies that the "last mile" wiring works correctly:
 * generator handler → ProgressEvent → ProgressSink → MCP notifications/progress.
 *
 * Tests both the ServerAttachment integration and direct progressSink usage
 * through the ToolBuilder.execute() and ToolRegistry.routeCall() APIs.
 */
import { describe, it, expect, vi } from 'vitest';
import { createTool } from '../../src/core/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success } from '../../src/core/response.js';
import { progress, type ProgressEvent, type ProgressSink } from '../../src/core/execution/ProgressHelper.js';

// ============================================================================
// 1. Direct progressSink via builder.execute()
// ============================================================================

describe('ProgressWiring — builder.execute() with progressSink', () => {
    it('should forward ProgressEvents to the provided progressSink', async () => {
        const events: ProgressEvent[] = [];
        const sink: ProgressSink = (event) => events.push(event);

        const tool = createTool('deploy_tool').action({
            name: 'deploy',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(10, 'Cloning...');
                yield progress(50, 'Building...');
                yield progress(90, 'Deploying...');
                return success('Deployed!');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'deploy' }, sink);

        expect(result.content[0].text).toBe('Deployed!');
        expect(result.isError).toBeUndefined();
        expect(events).toHaveLength(3);
        expect(events[0]).toEqual({ __brand: 'ProgressEvent', percent: 10, message: 'Cloning...' });
        expect(events[1]).toEqual({ __brand: 'ProgressEvent', percent: 50, message: 'Building...' });
        expect(events[2]).toEqual({ __brand: 'ProgressEvent', percent: 90, message: 'Deploying...' });
    });

    it('should work without progressSink (backward compatibility)', async () => {
        const tool = createTool('silent_tool').action({
            name: 'run',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(50, 'Working...');
                return success('Done');
            }) as any,
        });

        // No sink — should not throw, events silently consumed
        const result = await tool.execute(undefined, { action: 'run' });
        expect(result.content[0].text).toBe('Done');
    });

    it('should forward progress through debug path as well', async () => {
        const events: ProgressEvent[] = [];
        const sink: ProgressSink = (event) => events.push(event);

        const tool = createTool('debug_progress')
            .debug(() => {}) // Enable debug path
            .action({
                name: 'process',
                handler: (async function* (_ctx: any, _args: any) {
                    yield progress(25, 'Phase 1');
                    yield progress(75, 'Phase 2');
                    return success('Complete');
                }) as any,
            });

        const result = await tool.execute(undefined, { action: 'process' }, sink);

        expect(result.content[0].text).toBe('Complete');
        expect(events).toHaveLength(2);
        expect(events[0].percent).toBe(25);
        expect(events[1].percent).toBe(75);
    });
});

// ============================================================================
// 2. progressSink via registry.routeCall()
// ============================================================================

describe('ProgressWiring — registry.routeCall() with progressSink', () => {
    it('should forward ProgressEvents through registry routing', async () => {
        const events: ProgressEvent[] = [];
        const sink: ProgressSink = (event) => events.push(event);

        const tool = createTool('registry_progress').action({
            name: 'export',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(33, 'Querying...');
                yield progress(66, 'Formatting...');
                yield progress(100, 'Writing...');
                return success('Exported!');
            }) as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(
            undefined,
            'registry_progress',
            { action: 'export' },
            sink,
        );

        expect(result.content[0].text).toBe('Exported!');
        expect(events).toHaveLength(3);
        expect(events.map(e => e.percent)).toEqual([33, 66, 100]);
        expect(events.map(e => e.message)).toEqual(['Querying...', 'Formatting...', 'Writing...']);
    });
});

// ============================================================================
// 3. E2E via MCP ServerAttachment (mock server, full pipeline)
// ============================================================================

/**
 * Minimal mock that mirrors the MCP SDK Server's handler registration.
 * Reuses the same pattern as McpServerAdapter.test.ts.
 */
function createMockServer() {
    const handlers = new Map<string, Function>();
    return {
        setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
            handlers.set(schema.shape.method.value, handler);
        },
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const handler = handlers.get('tools/call');
            if (!handler) throw new Error('No tools/call handler registered');
            return handler({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
    };
}

describe('ProgressWiring — MCP ServerAttachment integration', () => {
    it('should send notifications/progress when progressToken is present in _meta', async () => {
        const notifications: unknown[] = [];
        const sendNotification = vi.fn(async (notification: unknown) => {
            notifications.push(notification);
        });

        const tool = createTool('mcp_progress').action({
            name: 'analyze',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(20, 'Scanning...');
                yield progress(60, 'Analyzing...');
                yield progress(100, 'Complete');
                return success('Analysis done');
            }) as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);
        const server = createMockServer();
        registry.attachToServer(server);

        // Simulate MCP extra object with progressToken and sendNotification
        const mockExtra = {
            _meta: { progressToken: 'tok_123' },
            sendNotification,
            signal: new AbortController().signal,
            requestId: '1',
        };

        const result = await server.callTool(
            'mcp_progress',
            { action: 'analyze' },
            mockExtra,
        );

        expect(result.content[0].text).toBe('Analysis done');
        expect(sendNotification).toHaveBeenCalledTimes(3);

        // Verify the notification wire format
        expect(notifications[0]).toEqual({
            method: 'notifications/progress',
            params: {
                progressToken: 'tok_123',
                progress: 20,
                total: 100,
                message: 'Scanning...',
            },
        });
        expect(notifications[1]).toEqual({
            method: 'notifications/progress',
            params: {
                progressToken: 'tok_123',
                progress: 60,
                total: 100,
                message: 'Analyzing...',
            },
        });
        expect(notifications[2]).toEqual({
            method: 'notifications/progress',
            params: {
                progressToken: 'tok_123',
                progress: 100,
                total: 100,
                message: 'Complete',
            },
        });
    });

    it('should NOT send notifications when no progressToken is present', async () => {
        const sendNotification = vi.fn();

        const tool = createTool('no_token_progress').action({
            name: 'run',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(50, 'Working...');
                return success('Done');
            }) as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);
        const server = createMockServer();
        registry.attachToServer(server);

        // Extra WITHOUT progressToken
        const result = await server.callTool(
            'no_token_progress',
            { action: 'run' },
            { _meta: {}, sendNotification, signal: new AbortController().signal, requestId: '2' },
        );

        expect(result.content[0].text).toBe('Done');
        expect(sendNotification).not.toHaveBeenCalled();
    });

    it('should handle non-MCP extra gracefully (no sendNotification)', async () => {
        const tool = createTool('plain_extra').action({
            name: 'run',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(50, 'Working...');
                return success('Done');
            }) as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);
        const server = createMockServer();
        registry.attachToServer(server);

        // Extra is a plain object without MCP fields — should not crash
        const result = await server.callTool(
            'plain_extra',
            { action: 'run' },
            {},
        );

        expect(result.content[0].text).toBe('Done');
    });

    it('should support numeric progressToken', async () => {
        const notifications: unknown[] = [];
        const sendNotification = vi.fn(async (notification: unknown) => {
            notifications.push(notification);
        });

        const tool = createTool('num_token').action({
            name: 'run',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(100, 'Done');
                return success('ok');
            }) as any,
        });

        const registry = new ToolRegistry();
        registry.register(tool);
        const server = createMockServer();
        registry.attachToServer(server);

        await server.callTool(
            'num_token',
            { action: 'run' },
            { _meta: { progressToken: 42 }, sendNotification },
        );

        expect(sendNotification).toHaveBeenCalledTimes(1);
        expect((notifications[0] as any).params.progressToken).toBe(42);
    });
});
