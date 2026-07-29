/**
 * Resource Subscription Integration Tests — MCP API Layer Verification
 *
 * These tests verify the full pipeline through the MCP API layer:
 *  attachToServer() → resource handlers → ResourceRegistry → SubscriptionManager
 *
 * Coverage targets:
 *   1. resources/list — registered resources appear in listing
 *   2. resources/read — URI template matching, content delivery
 *   3. resources/subscribe — subscribable accept, non-subscribable reject
 *   4. resources/unsubscribe — subscription removal
 *   5. notifications/resources/updated — push delivery to subscribers
 *   6. Coexistence — resources + tools + introspection on the same server
 *   7. Zero-overhead — omitted resources option registers nothing
 *   8. Concurrent operations — multiple subscriptions and reads
 *   9. Edge cases — unknown URIs, double subscribe, unsubscribe without subscribe
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { GroupedToolBuilder } from '../../src/core/builder/GroupedToolBuilder.js';
import { success } from '../../src/core/response.js';
import { defineResource } from '../../src/resource/ResourceBuilder.js';
import { ResourceRegistry } from '../../src/resource/ResourceRegistry.js';

// ============================================================================
// Mock MCP Server — Extended for Subscribe/Unsubscribe
// ============================================================================

function createMockServer() {
    const handlers = new Map<string, Function>();
    const notifications: Array<{ method: string; params: unknown }> = [];

    return {
        setRequestHandler(method: string, handler: Function) {
            handlers.set(method, handler);
        },
        // Simulate server.notification() — captures sent notifications
        notification(msg: { method: string; params?: unknown }) {
            notifications.push({ method: msg.method, params: msg.params });
        },
        async callListTools() {
            const h = handlers.get('tools/list');
            if (!h) throw new Error('No tools/list handler');
            return h({ method: 'tools/list', params: {} }, {});
        },
        async callTool(name: string, args: Record<string, unknown> = {}, extra: unknown = {}) {
            const h = handlers.get('tools/call');
            if (!h) throw new Error('No tools/call handler');
            return h({ method: 'tools/call', params: { name, arguments: args } }, extra);
        },
        async callListResources() {
            const h = handlers.get('resources/list');
            if (!h) throw new Error('No resources/list handler');
            return h({ method: 'resources/list', params: {} }, {});
        },
        async callReadResource(uri: string, extra: unknown = {}) {
            const h = handlers.get('resources/read');
            if (!h) throw new Error('No resources/read handler');
            return h({ method: 'resources/read', params: { uri } }, extra);
        },
        async callSubscribe(uri: string) {
            const h = handlers.get('resources/subscribe');
            if (!h) throw new Error('No resources/subscribe handler');
            return h({ method: 'resources/subscribe', params: { uri } }, {});
        },
        async callUnsubscribe(uri: string) {
            const h = handlers.get('resources/unsubscribe');
            if (!h) throw new Error('No resources/unsubscribe handler');
            return h({ method: 'resources/unsubscribe', params: { uri } }, {});
        },
        hasHandler(method: string) {
            return handlers.has(method);
        },
        getNotifications() {
            return notifications;
        },
        clearNotifications() {
            notifications.length = 0;
        },
    };
}

// ============================================================================
// Test Fixtures
// ============================================================================

interface AppContext {
    userId: string;
    region: string;
}

function createTestResources() {
    const stockPrice = defineResource<AppContext>('stock_price', {
        uri: 'stock://prices/{symbol}',
        description: 'Real-time stock price for a given symbol',
        mimeType: 'application/json',
        subscribable: true,
        annotations: { audience: ['assistant'], priority: 0.9 },
        handler: async (uri, ctx) => {
            const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
            return {
                text: JSON.stringify({
                    symbol,
                    price: 142.50,
                    region: ctx.region,
                }),
            };
        },
    });

    const deployStatus = defineResource<AppContext>('deploy_status', {
        uri: 'deploy://status/{environment}',
        description: 'Deploy pipeline status',
        subscribable: true,
        handler: async (uri) => {
            const env = uri.match(/deploy:\/\/status\/(.+)/)?.[1];
            return {
                text: JSON.stringify({
                    environment: env,
                    stage: 'building',
                    progress: 45,
                }),
            };
        },
    });

    const errorLogs = defineResource<AppContext>('error_logs', {
        uri: 'logs://errors/{service}',
        description: 'Error logs for a service (read-only, no subscriptions)',
        mimeType: 'text/plain',
        // subscribable: false (default)
        handler: async (uri) => {
            const service = uri.match(/logs:\/\/errors\/(.+)/)?.[1];
            return { text: `[ERROR] ${service}: connection timeout at ${new Date().toISOString()}` };
        },
    });

    return { stockPrice, deployStatus, errorLogs };
}

function createTestToolRegistry() {
    const registry = new ToolRegistry<AppContext>();
    registry.register(
        new GroupedToolBuilder<AppContext>('projects')
            .description('Project management')
            .action({
                name: 'list',
                description: 'List all projects',
                schema: z.object({ status: z.string().optional() }),
                readOnly: true,
                handler: async (ctx) => success(`projects for ${ctx.userId}`),
            }),
    );
    return registry;
}

// ============================================================================
// 1. resources/list — Full Pipeline
// ============================================================================

describe('MCP API: resources/list', () => {
    let server: ReturnType<typeof createMockServer>;
    let toolRegistry: ToolRegistry<AppContext>;
    let resourceRegistry: ResourceRegistry<AppContext>;

    beforeEach(async () => {
        server = createMockServer();
        toolRegistry = createTestToolRegistry();
        resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice, deployStatus, errorLogs } = createTestResources();
        resourceRegistry.registerAll(stockPrice, deployStatus, errorLogs);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });
    });

    it('should register resources/list handler', () => {
        expect(server.hasHandler('resources/list')).toBe(true);
    });

    it('should list all registered resources', async () => {
        const result = await server.callListResources();
        expect(result.resources).toHaveLength(3);

        const names = result.resources.map((r: { name: string }) => r.name);
        expect(names).toContain('stock_price');
        expect(names).toContain('deploy_status');
        expect(names).toContain('error_logs');
    });

    it('should include URI templates and descriptions', async () => {
        const result = await server.callListResources();
        const stock = result.resources.find((r: { name: string }) => r.name === 'stock_price');

        expect(stock.uri).toBe('stock://prices/{symbol}');
        expect(stock.description).toBe('Real-time stock price for a given symbol');
        expect(stock.mimeType).toBe('application/json');
    });

    it('should include annotations', async () => {
        const result = await server.callListResources();
        const stock = result.resources.find((r: { name: string }) => r.name === 'stock_price');

        expect(stock.annotations).toEqual({
            audience: ['assistant'],
            priority: 0.9,
        });
    });
});

// ============================================================================
// 2. resources/read — Content Delivery Through Full Pipeline
// ============================================================================

describe('MCP API: resources/read', () => {
    let server: ReturnType<typeof createMockServer>;
    let toolRegistry: ToolRegistry<AppContext>;
    let resourceRegistry: ResourceRegistry<AppContext>;

    beforeEach(async () => {
        server = createMockServer();
        toolRegistry = createTestToolRegistry();
        resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice, deployStat: deployStatus, errorLogs } = (() => {
            const f = createTestResources();
            return { stockPrice: f.stockPrice, deployStat: f.deployStatus, errorLogs: f.errorLogs };
        })();
        resourceRegistry.registerAll(stockPrice, deployStatus, errorLogs);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });
    });

    it('should register resources/read handler', () => {
        expect(server.hasHandler('resources/read')).toBe(true);
    });

    it('should read resource with URI template matching', async () => {
        const result = await server.callReadResource('stock://prices/AAPL');

        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe('stock://prices/AAPL');
        expect(result.contents[0].mimeType).toBe('application/json');

        const body = JSON.parse(result.contents[0].text);
        expect(body.symbol).toBe('AAPL');
        expect(body.price).toBe(142.50);
    });

    it('should pass context from contextFactory to handler', async () => {
        const result = await server.callReadResource('stock://prices/GOOG');
        const body = JSON.parse(result.contents[0].text);
        expect(body.region).toBe('us-east');
    });

    it('should read text/plain resources', async () => {
        const result = await server.callReadResource('logs://errors/payments');

        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].text).toMatch(/\[ERROR\] payments: connection timeout/);
    });

    it('should return empty contents for unknown URIs', async () => {
        const result = await server.callReadResource('unknown://resource');
        expect(result.contents).toHaveLength(0);
    });

    it('should match different URIs from the same template', async () => {
        const r1 = await server.callReadResource('deploy://status/staging');
        const r2 = await server.callReadResource('deploy://status/production');

        const body1 = JSON.parse(r1.contents[0].text);
        const body2 = JSON.parse(r2.contents[0].text);

        expect(body1.environment).toBe('staging');
        expect(body2.environment).toBe('production');
    });
});

// ============================================================================
// 3. resources/subscribe — Subscription Acceptance
// ============================================================================

describe('MCP API: resources/subscribe', () => {
    let server: ReturnType<typeof createMockServer>;
    let toolRegistry: ToolRegistry<AppContext>;
    let resourceRegistry: ResourceRegistry<AppContext>;

    beforeEach(async () => {
        server = createMockServer();
        toolRegistry = createTestToolRegistry();
        resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice, deployStatus, errorLogs } = createTestResources();
        resourceRegistry.registerAll(stockPrice, deployStatus, errorLogs);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });
    });

    it('should register resources/subscribe handler', () => {
        expect(server.hasHandler('resources/subscribe')).toBe(true);
    });

    it('should accept subscription for subscribable resource', async () => {
        const result = await server.callSubscribe('stock://prices/AAPL');
        expect(result).toBeDefined();
        expect(result._meta).toBeDefined();
    });

    it('should track subscription internally after accept', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/AAPL')).toBe(true);
    });

    it('should return response for non-subscribable resource (graceful)', async () => {
        // error_logs is NOT subscribable
        const result = await server.callSubscribe('logs://errors/payments');
        expect(result).toBeDefined();
        // Subscription is NOT tracked
        expect(resourceRegistry.subscriptions.isSubscribed('logs://errors/payments')).toBe(false);
    });

    it('should handle multiple subscriptions to different URIs', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        await server.callSubscribe('stock://prices/GOOG');
        await server.callSubscribe('deploy://status/staging');

        expect(resourceRegistry.subscriptions.size).toBe(3);
        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/AAPL')).toBe(true);
        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/GOOG')).toBe(true);
        expect(resourceRegistry.subscriptions.isSubscribed('deploy://status/staging')).toBe(true);
    });

    it('should handle idempotent subscription (same URI twice)', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        await server.callSubscribe('stock://prices/AAPL');
        expect(resourceRegistry.subscriptions.size).toBe(1);
    });
});

// ============================================================================
// 4. resources/unsubscribe — Subscription Removal
// ============================================================================

describe('MCP API: resources/unsubscribe', () => {
    let server: ReturnType<typeof createMockServer>;
    let toolRegistry: ToolRegistry<AppContext>;
    let resourceRegistry: ResourceRegistry<AppContext>;

    beforeEach(async () => {
        server = createMockServer();
        toolRegistry = createTestToolRegistry();
        resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice, deployStatus } = createTestResources();
        resourceRegistry.registerAll(stockPrice, deployStatus);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });
    });

    it('should register resources/unsubscribe handler', () => {
        expect(server.hasHandler('resources/unsubscribe')).toBe(true);
    });

    it('should remove existing subscription', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/AAPL')).toBe(true);

        await server.callUnsubscribe('stock://prices/AAPL');
        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/AAPL')).toBe(false);
    });

    it('should handle unsubscribe for non-existent subscription (graceful)', async () => {
        const result = await server.callUnsubscribe('stock://prices/AAPL');
        expect(result).toBeDefined();
        expect(result._meta).toBeDefined();
    });

    it('should only remove targeted subscription', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        await server.callSubscribe('stock://prices/GOOG');

        await server.callUnsubscribe('stock://prices/AAPL');

        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/AAPL')).toBe(false);
        expect(resourceRegistry.subscriptions.isSubscribed('stock://prices/GOOG')).toBe(true);
    });
});

// ============================================================================
// 5. notifications/resources/updated — Push Delivery
// ============================================================================

describe('MCP API: Push Notifications', () => {
    let server: ReturnType<typeof createMockServer>;
    let toolRegistry: ToolRegistry<AppContext>;
    let resourceRegistry: ResourceRegistry<AppContext>;

    beforeEach(async () => {
        server = createMockServer();
        toolRegistry = createTestToolRegistry();
        resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice, deployStatus } = createTestResources();
        resourceRegistry.registerAll(stockPrice, deployStatus);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });
    });

    it('should emit notifications/resources/updated when subscribed resource changes', async () => {
        await server.callSubscribe('stock://prices/AAPL');

        // Trigger update (simulates external webhook arriving)
        await resourceRegistry.notifyUpdated('stock://prices/AAPL');

        const notifications = server.getNotifications();
        expect(notifications).toHaveLength(1);
        expect(notifications[0].method).toBe('notifications/resources/updated');
        expect(notifications[0].params).toEqual({ uri: 'stock://prices/AAPL' });
    });

    it('should NOT emit notification for unsubscribed resource', async () => {
        // No subscription → no notification
        await resourceRegistry.notifyUpdated('stock://prices/AAPL');

        expect(server.getNotifications()).toHaveLength(0);
    });

    it('should stop notifications after unsubscribe', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        await server.callUnsubscribe('stock://prices/AAPL');

        await resourceRegistry.notifyUpdated('stock://prices/AAPL');

        expect(server.getNotifications()).toHaveLength(0);
    });

    it('should emit separate notifications for different URIs', async () => {
        await server.callSubscribe('stock://prices/AAPL');
        await server.callSubscribe('deploy://status/prod');

        await resourceRegistry.notifyUpdated('stock://prices/AAPL');
        await resourceRegistry.notifyUpdated('deploy://status/prod');

        const notifications = server.getNotifications();
        expect(notifications).toHaveLength(2);
        expect(notifications[0].params).toEqual({ uri: 'stock://prices/AAPL' });
        expect(notifications[1].params).toEqual({ uri: 'deploy://status/prod' });
    });

    it('should emit notification only for subscribed URI (not others from same template)', async () => {
        await server.callSubscribe('stock://prices/AAPL');

        // Update GOOG — NOT subscribed
        await resourceRegistry.notifyUpdated('stock://prices/GOOG');
        expect(server.getNotifications()).toHaveLength(0);

        // Update AAPL — IS subscribed
        await resourceRegistry.notifyUpdated('stock://prices/AAPL');
        expect(server.getNotifications()).toHaveLength(1);
    });
});

// ============================================================================
// 6. Coexistence — Tools + Resources on Same Server
// ============================================================================

describe('MCP API: Tools + Resources Coexistence', () => {
    it('should serve both tools/list and resources/list', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();
        const resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice } = createTestResources();
        resourceRegistry.register(stockPrice);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });

        // Tools work
        const toolsResult = await server.callListTools();
        expect(toolsResult.tools.length).toBeGreaterThan(0);

        // Resources work
        const resourcesResult = await server.callListResources();
        expect(resourcesResult.resources).toHaveLength(1);
        expect(resourcesResult.resources[0].name).toBe('stock_price');
    });

    it('should serve tools/call and resources/read without interference', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();
        const resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice } = createTestResources();
        resourceRegistry.register(stockPrice);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });

        // Tool call
        const toolResult = await server.callTool('projects', { action: 'list' });
        expect(toolResult.content[0].text).toContain('projects for u42');

        // Resource read
        const resResult = await server.callReadResource('stock://prices/TSLA');
        const body = JSON.parse(resResult.contents[0].text);
        expect(body.symbol).toBe('TSLA');
    });

    it('should register all 4 resource handlers alongside tool handlers', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();
        const resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice } = createTestResources();
        resourceRegistry.register(stockPrice);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });

        // Tool handlers
        expect(server.hasHandler('tools/list')).toBe(true);
        expect(server.hasHandler('tools/call')).toBe(true);

        // Resource handlers
        expect(server.hasHandler('resources/list')).toBe(true);
        expect(server.hasHandler('resources/read')).toBe(true);
        expect(server.hasHandler('resources/subscribe')).toBe(true);
        expect(server.hasHandler('resources/unsubscribe')).toBe(true);
    });
});

// ============================================================================
// 7. Zero-Overhead — No Resources Option
// ============================================================================

describe('MCP API: Zero-Overhead (no resources)', () => {
    it('should NOT register resource handlers when resources option is omitted', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            // no resources option
        });

        expect(server.hasHandler('tools/list')).toBe(true);
        expect(server.hasHandler('tools/call')).toBe(true);

        // Resource handlers should NOT be registered
        expect(server.hasHandler('resources/list')).toBe(false);
        expect(server.hasHandler('resources/read')).toBe(false);
        expect(server.hasHandler('resources/subscribe')).toBe(false);
        expect(server.hasHandler('resources/unsubscribe')).toBe(false);
    });
});

// ============================================================================
// 8. Concurrent Operations
// ============================================================================

describe('MCP API: Concurrency', () => {
    it('should handle 20 concurrent resource reads without corruption', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();
        const resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice, deployStatus } = createTestResources();
        resourceRegistry.registerAll(stockPrice, deployStatus);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });

        const symbols = ['AAPL', 'GOOG', 'MSFT', 'AMZN', 'TSLA'];
        const promises = symbols.flatMap(sym => [
            server.callReadResource(`stock://prices/${sym}`),
            server.callReadResource(`stock://prices/${sym}`),
            server.callReadResource(`stock://prices/${sym}`),
            server.callReadResource(`stock://prices/${sym}`),
        ]);

        const results = await Promise.all(promises);

        for (let i = 0; i < results.length; i++) {
            const sym = symbols[Math.floor(i / 4)];
            const body = JSON.parse(results[i].contents[0].text);
            expect(body.symbol).toBe(sym);
            expect(body.price).toBe(142.50);
            expect(body.region).toBe('us-east');
        }
    });

    it('should handle concurrent subscribe/unsubscribe/notify', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();
        const resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice } = createTestResources();
        resourceRegistry.register(stockPrice);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });

        // Subscribe to 5 URIs concurrently
        const uris = ['AAPL', 'GOOG', 'MSFT', 'AMZN', 'TSLA'].map(s => `stock://prices/${s}`);
        await Promise.all(uris.map(uri => server.callSubscribe(uri)));

        expect(resourceRegistry.subscriptions.size).toBe(5);

        // Notify all concurrently
        await Promise.all(uris.map(uri => resourceRegistry.notifyUpdated(uri)));
        expect(server.getNotifications()).toHaveLength(5);

        // Unsubscribe all concurrently
        await Promise.all(uris.map(uri => server.callUnsubscribe(uri)));
        expect(resourceRegistry.subscriptions.size).toBe(0);
    });
});

// ============================================================================
// 9. Full Lifecycle — Subscribe → Read → Notify → Unsubscribe
// ============================================================================

describe('MCP API: Full Lifecycle', () => {
    it('should complete the full resource subscription lifecycle', async () => {
        const server = createMockServer();
        const toolRegistry = createTestToolRegistry();
        const resourceRegistry = new ResourceRegistry<AppContext>();
        const { stockPrice } = createTestResources();
        resourceRegistry.register(stockPrice);

        await toolRegistry.attachToServer(server, {
            contextFactory: () => ({ userId: 'u42', region: 'us-east' }),
            resources: resourceRegistry,
        });

        // Step 1: List available resources
        const listResult = await server.callListResources();
        expect(listResult.resources).toHaveLength(1);
        expect(listResult.resources[0].name).toBe('stock_price');

        // Step 2: Read the resource
        const readResult = await server.callReadResource('stock://prices/AAPL');
        const body = JSON.parse(readResult.contents[0].text);
        expect(body.symbol).toBe('AAPL');
        expect(body.price).toBe(142.50);

        // Step 3: Subscribe for push updates
        const subResult = await server.callSubscribe('stock://prices/AAPL');
        expect(subResult._meta).toBeDefined();

        // Step 4: External system triggers update
        await resourceRegistry.notifyUpdated('stock://prices/AAPL');
        const notifications = server.getNotifications();
        expect(notifications).toHaveLength(1);
        expect(notifications[0].method).toBe('notifications/resources/updated');
        expect(notifications[0].params).toEqual({ uri: 'stock://prices/AAPL' });

        // Step 5: Client reads updated resource
        const updatedResult = await server.callReadResource('stock://prices/AAPL');
        expect(updatedResult.contents).toHaveLength(1);

        // Step 6: Unsubscribe
        server.clearNotifications();
        await server.callUnsubscribe('stock://prices/AAPL');

        // Step 7: Further updates should NOT produce notifications
        await resourceRegistry.notifyUpdated('stock://prices/AAPL');
        expect(server.getNotifications()).toHaveLength(0);
    });
});
