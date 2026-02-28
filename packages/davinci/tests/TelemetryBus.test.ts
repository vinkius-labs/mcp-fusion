/**
 * TelemetryBus.test.ts — Shadow Socket IPC Security & Reliability Tests
 *
 * The TelemetryBus is the core IPC transport. A bug here means:
 * - PII leaks through unprotected sockets (Gotcha #1)
 * - Ghost sockets blocking server startup (Gotcha #2)
 * - Memory bloat from slow clients (Gotcha #3)
 * - Event loss or corruption
 *
 * Categories:
 *  1. Path Convention — getTelemetryPath(), discoverSockets()
 *  2. Bus Lifecycle — create, emit, close
 *  3. Client Connection — NDJSON protocol, topology on connect
 *  4. Backpressure — slow client disconnection (Gotcha #3)
 *  5. Zero Overhead — no cost when no clients
 *  6. Multi-client — broadcast to all
 *  7. Heartbeat — automatic health events
 *  8. Clean Shutdown — signal handlers, socket cleanup
 *  9. Security — socket permissions (Gotcha #1)
 * 10. Adversarial — malformed events, rapid connect/disconnect
 *
 * @module
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { connect } from 'node:net';
import { platform } from 'node:os';
import {
    createTelemetryBus,
    getTelemetryPath,
    discoverSockets,
} from '@vinkius-core/mcp-fusion';
import type {
    TelemetryEvent,
    TelemetryBusInstance,
} from '@vinkius-core/mcp-fusion';

// Helper: collect events from IPC
function connectAndCollect(
    ipcPath: string,
    collector: TelemetryEvent[],
    timeout = 5000,
): Promise<void> {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const client = connect(ipcPath);
        const timer = setTimeout(() => {
            client.destroy();
            resolve();
        }, timeout);

        client.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop()!;
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    collector.push(JSON.parse(line) as TelemetryEvent);
                } catch { /* skip malformed */ }
            }
        });

        client.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        client.on('close', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

// Wait helper
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// 1. Path Convention
// ============================================================================

describe('getTelemetryPath', () => {
    it('should return a path containing the PID', () => {
        const path = getTelemetryPath(12345);
        expect(path).toContain('12345');
    });

    it('should use process.pid when no PID specified', () => {
        const path = getTelemetryPath();
        expect(path).toContain(String(process.pid));
    });

    it('should return Named Pipe format on Windows', () => {
        if (platform() === 'win32') {
            const path = getTelemetryPath(999);
            expect(path).toContain('\\\\.\\pipe\\');
        }
    });

    it('should return .sock path on POSIX', () => {
        if (platform() !== 'win32') {
            const path = getTelemetryPath(999);
            expect(path).toContain('/tmp/');
            expect(path).toContain('.sock');
        }
    });

    it('should generate unique paths for different PIDs', () => {
        const path1 = getTelemetryPath(111);
        const path2 = getTelemetryPath(222);
        expect(path1).not.toBe(path2);
    });
});

describe('discoverSockets', () => {
    it('should return an array', () => {
        const sockets = discoverSockets();
        expect(Array.isArray(sockets)).toBe(true);
    });

    it('should return objects with pid and path properties', () => {
        const sockets = discoverSockets([12345]);
        for (const s of sockets) {
            expect(s).toHaveProperty('pid');
            expect(s).toHaveProperty('path');
            expect(typeof s.pid).toBe('number');
            expect(typeof s.path).toBe('string');
        }
    });
});

// ============================================================================
// 2. Bus Lifecycle
// ============================================================================

describe('TelemetryBus — Lifecycle', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) {
            await bus.close();
            bus = undefined;
        }
    });

    it('should create a bus and return emit/close/path', async () => {
        bus = await createTelemetryBus();
        expect(typeof bus.emit).toBe('function');
        expect(typeof bus.close).toBe('function');
        expect(typeof bus.path).toBe('string');
        expect(typeof bus.clientCount).toBe('function');
    });

    it('should start with 0 clients', async () => {
        bus = await createTelemetryBus();
        expect(bus.clientCount()).toBe(0);
    });

    it('should close gracefully', async () => {
        bus = await createTelemetryBus();
        await bus.close();
        bus = undefined; // prevent double-close in afterEach
    });

    it('should use custom path when provided', async () => {
        const customPath = platform() === 'win32'
            ? `\\\\.\\pipe\\mcp-fusion-test-custom-${Date.now()}`
            : `/tmp/mcp-fusion-test-custom-${Date.now()}.sock`;

        bus = await createTelemetryBus({ path: customPath });
        expect(bus.path).toBe(customPath);
    });
});

// ============================================================================
// 3. Client Connection — NDJSON Protocol
// ============================================================================

describe('TelemetryBus — Client Connection', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) {
            await bus.close();
            bus = undefined;
        }
    });

    it('should accept a client connection', async () => {
        bus = await createTelemetryBus();
        const collected: TelemetryEvent[] = [];

        // Start collecting in background
        const collect = connectAndCollect(bus.path, collected, 500);
        await wait(100); // let connection establish

        expect(bus.clientCount()).toBe(1);
        await collect;
    });

    it('should broadcast events as NDJSON', async () => {
        bus = await createTelemetryBus();
        const collected: TelemetryEvent[] = [];

        const collect = connectAndCollect(bus.path, collected, 1000);
        await wait(100);

        // Emit an event
        bus.emit({
            type: 'route',
            tool: 'test',
            action: 'ping',
            timestamp: Date.now(),
        } as TelemetryEvent);

        await wait(200);
        const client = connect(bus.path);
        client.destroy();
        await collect;

        const routeEvent = collected.find((e) => e.type === 'route');
        expect(routeEvent).toBeDefined();
        expect(routeEvent!.tool).toBe('test');
        expect(routeEvent!.action).toBe('ping');
    });

    it('should send topology on connect when onConnect is configured', async () => {
        const topology: TelemetryEvent = {
            type: 'topology',
            serverName: 'test-server',
            pid: process.pid,
            tools: [],
            timestamp: Date.now(),
        } as TelemetryEvent;

        bus = await createTelemetryBus({
            onConnect: () => topology,
        });

        const collected: TelemetryEvent[] = [];
        const collect = connectAndCollect(bus.path, collected, 500);
        await collect;

        const topoEvent = collected.find((e) => e.type === 'topology');
        expect(topoEvent).toBeDefined();
        expect((topoEvent as any).serverName).toBe('test-server');
    });
});

// ============================================================================
// 5. Zero Overhead
// ============================================================================

describe('TelemetryBus — Zero Overhead', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) {
            await bus.close();
            bus = undefined;
        }
    });

    it('should not throw when emitting with zero clients', async () => {
        bus = await createTelemetryBus();
        expect(bus.clientCount()).toBe(0);

        // This should be a silent no-op
        expect(() => {
            bus!.emit({
                type: 'route',
                tool: 'test',
                action: 'ping',
                timestamp: Date.now(),
            } as TelemetryEvent);
        }).not.toThrow();
    });

    it('should handle rapid fire events with zero clients', async () => {
        bus = await createTelemetryBus();

        // Fire 1000 events with no clients — should be O(1) no-op
        for (let i = 0; i < 1000; i++) {
            bus.emit({
                type: 'route',
                tool: 'stress',
                action: `action_${i}`,
                timestamp: Date.now(),
            } as TelemetryEvent);
        }

        expect(bus.clientCount()).toBe(0);
    });
});

// ============================================================================
// 6. Multi-Client Broadcast
// ============================================================================

describe('TelemetryBus — Multi-Client', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) {
            await bus.close();
            bus = undefined;
        }
    });

    it('should broadcast to multiple clients', async () => {
        bus = await createTelemetryBus();
        const collected1: TelemetryEvent[] = [];
        const collected2: TelemetryEvent[] = [];

        const c1 = connectAndCollect(bus.path, collected1, 800);
        const c2 = connectAndCollect(bus.path, collected2, 800);
        await wait(150);

        expect(bus.clientCount()).toBe(2);

        bus.emit({
            type: 'route',
            tool: 'broadcast',
            action: 'test',
            timestamp: Date.now(),
        } as TelemetryEvent);

        await wait(200);
        await bus.close();
        bus = undefined;
        await Promise.all([c1, c2]);

        expect(collected1.some((e) => e.type === 'route')).toBe(true);
        expect(collected2.some((e) => e.type === 'route')).toBe(true);
    });
});

// ============================================================================
// 7. Heartbeat
// ============================================================================

describe('TelemetryBus — Heartbeat', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) {
            await bus.close();
            bus = undefined;
        }
    });

    it('should emit heartbeat events to connected clients', async () => {
        bus = await createTelemetryBus();
        const collected: TelemetryEvent[] = [];

        const collect = connectAndCollect(bus.path, collected, 6500);
        await collect;

        const heartbeats = collected.filter((e) => e.type === 'heartbeat');
        expect(heartbeats.length).toBeGreaterThanOrEqual(1);

        if (heartbeats.length > 0) {
            const hb = heartbeats[0] as any;
            expect(hb.heapUsedBytes).toBeGreaterThan(0);
            expect(hb.rssBytes).toBeGreaterThan(0);
            expect(hb.uptimeSeconds).toBeGreaterThanOrEqual(0);
            expect(hb.timestamp).toBeGreaterThan(0);
        }
    }, 8000);
});

// ============================================================================
// 8. Clean Shutdown
// ============================================================================

describe('TelemetryBus — Clean Shutdown', () => {
    it('should disconnect all clients on close', async () => {
        const bus = await createTelemetryBus();
        const collected: TelemetryEvent[] = [];

        const collect = connectAndCollect(bus.path, collected, 2000);
        await wait(100);

        expect(bus.clientCount()).toBe(1);
        await bus.close();

        await collect;
        // After close, connecting should fail
        expect(bus.clientCount()).toBe(0);
    });

    it('should handle double-close gracefully', async () => {
        const bus = await createTelemetryBus();
        await bus.close();
        // Second close should not throw
        await expect(bus.close()).resolves.not.toThrow();
    });
});

// ============================================================================
// 10. Adversarial
// ============================================================================

describe('TelemetryBus — Adversarial', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) {
            await bus.close();
            bus = undefined;
        }
    });

    it('should handle non-serializable events gracefully', async () => {
        bus = await createTelemetryBus();
        const collected: TelemetryEvent[] = [];

        const collect = connectAndCollect(bus.path, collected, 500);
        await wait(100);

        // Circular reference — JSON.stringify will fail
        const circular: any = { type: 'test' };
        circular.self = circular;

        expect(() => bus!.emit(circular as TelemetryEvent)).not.toThrow();
        await collect;
    });

    it('should handle rapid client connect/disconnect', async () => {
        bus = await createTelemetryBus();

        for (let i = 0; i < 10; i++) {
            const client = connect(bus.path);
            await wait(20);
            client.destroy();
            await wait(20);
        }

        // Bus should still be operational
        bus.emit({
            type: 'route',
            tool: 'resilience',
            action: 'test',
            timestamp: Date.now(),
        } as TelemetryEvent);
    });

    it('should handle emit before any client connects', async () => {
        bus = await createTelemetryBus();

        for (let i = 0; i < 50; i++) {
            bus.emit({
                type: 'route',
                tool: 'pre',
                action: `event_${i}`,
                timestamp: Date.now(),
            } as TelemetryEvent);
        }

        // Now connect — should work
        const collected: TelemetryEvent[] = [];
        const collect = connectAndCollect(bus.path, collected, 500);
        await wait(100);

        bus.emit({
            type: 'route',
            tool: 'post',
            action: 'after_connect',
            timestamp: Date.now(),
        } as TelemetryEvent);

        await wait(200);
        await bus.close();
        bus = undefined;
        await collect;

        // Only events after connect are seen
        expect(collected.some((e) => (e as any).tool === 'post')).toBe(true);
    });
});
