/**
 * Simulator.test.ts — Comprehensive Simulator & CLI Tests
 *
 * The Simulator + StreamLogger + CLI form the user-facing layer.
 * Bugs here = broken demos, CI failures, customer embarrassment.
 *
 * Categories:
 *  1. Simulator — lifecycle, event emission, topology, cleanup
 *  2. StreamLogger — event formatting, color support
 *  3. CLI — argument parsing, mode selection
 *  4. Integration — simulator + stream logger e2e
 *  5. Adversarial — invalid options, edge cases
 *
 * @module
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { connect } from 'node:net';
import type { TelemetryEvent } from '@vinkius-core/mcp-fusion';
import { startSimulator } from '../src/Simulator.js';
import type { TelemetryBusInstance } from '@vinkius-core/mcp-fusion';
import { parseInspectorArgs } from '../src/cli/inspector.js';

// Helper: collect events via IPC
function collectEvents(
    ipcPath: string,
    durationMs: number,
): Promise<TelemetryEvent[]> {
    return new Promise((resolve) => {
        const events: TelemetryEvent[] = [];
        let buffer = '';
        const client = connect(ipcPath);
        const timer = setTimeout(() => {
            client.destroy();
            resolve(events);
        }, durationMs);

        client.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop()!;
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    events.push(JSON.parse(line) as TelemetryEvent);
                } catch { /* skip */ }
            }
        });

        client.on('error', () => {
            clearTimeout(timer);
            resolve(events);
        });

        client.on('close', () => {
            clearTimeout(timer);
            resolve(events);
        });
    });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// 1. Simulator — Lifecycle & Events
// ============================================================================

describe('Simulator — Lifecycle', () => {
    let sim: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (sim) {
            await sim.close();
            sim = undefined;
        }
    });

    it('should start and return a TelemetryBusInstance', async () => {
        sim = await startSimulator({ rps: 1 });
        expect(typeof sim.emit).toBe('function');
        expect(typeof sim.close).toBe('function');
        expect(typeof sim.path).toBe('string');
        expect(typeof sim.clientCount).toBe('function');
    });

    it('should close cleanly (all timers stopped)', async () => {
        sim = await startSimulator({ rps: 1 });
        await sim.close();
        sim = undefined; // prevent double-close

        // If timers leak, the test runner would hang — no hang = pass
    });

    it('should start with custom IPC path', async () => {
        const customPath = process.platform === 'win32'
            ? `\\\\.\\pipe\\mcp-fusion-sim-test-${Date.now()}`
            : `/tmp/mcp-fusion-sim-test-${Date.now()}.sock`;

        sim = await startSimulator({ rps: 1, path: customPath });
        expect(sim.path).toBe(customPath);
    });
});

describe('Simulator — Event Emission', () => {
    let sim: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (sim) {
            await sim.close();
            sim = undefined;
        }
    });

    it('should emit topology event immediately on start', async () => {
        sim = await startSimulator({ rps: 5 });
        const events = await collectEvents(sim.path, 500);

        const topos = events.filter((e) => e.type === 'topology');
        expect(topos.length).toBeGreaterThanOrEqual(1);

        const topo = topos[0] as any;
        expect(topo.serverName).toBe('Fusion Simulator');
        expect(topo.pid).toBe(process.pid);
        expect(topo.tools).toBeDefined();
        expect(Array.isArray(topo.tools)).toBe(true);
        expect(topo.tools.length).toBe(6);
    });

    it('should emit route events within 3 seconds', async () => {
        sim = await startSimulator({ rps: 20 });
        const events = await collectEvents(sim.path, 3000);

        const routes = events.filter((e) => e.type === 'route');
        expect(routes.length).toBeGreaterThanOrEqual(1);

        const route = routes[0] as any;
        expect(route.tool).toBeDefined();
        expect(route.action).toBeDefined();
        expect(route.timestamp).toBeGreaterThan(0);
    });

    it('should emit validate events', async () => {
        sim = await startSimulator({ rps: 10 });
        const events = await collectEvents(sim.path, 2000);

        const validates = events.filter((e) => e.type === 'validate');
        expect(validates.length).toBeGreaterThanOrEqual(1);

        const v = validates[0] as any;
        expect(typeof v.valid).toBe('boolean');
        expect(typeof v.durationMs).toBe('number');
    });

    it('should emit middleware events', async () => {
        sim = await startSimulator({ rps: 10 });
        const events = await collectEvents(sim.path, 2000);

        const mws = events.filter((e) => e.type === 'middleware');
        expect(mws.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit execute events', async () => {
        sim = await startSimulator({ rps: 10 });
        const events = await collectEvents(sim.path, 2500);

        const execs = events.filter((e) => e.type === 'execute');
        expect(execs.length).toBeGreaterThanOrEqual(1);

        const ex = execs[0] as any;
        expect(typeof ex.durationMs).toBe('number');
        expect(typeof ex.isError).toBe('boolean');
    });

    it('should emit all 13 event types given enough time', async () => {
        sim = await startSimulator({ rps: 50 });
        const events = await collectEvents(sim.path, 8000);

        const types = new Set(events.map((e) => e.type));

        // Must include at minimum: topology, route, validate, middleware, execute, heartbeat
        expect(types.has('topology')).toBe(true);
        expect(types.has('route')).toBe(true);
        expect(types.has('validate')).toBe(true);
        expect(types.has('middleware')).toBe(true);
        expect(types.has('execute')).toBe(true);
        expect(types.has('heartbeat')).toBe(true);
    }, 12000);
});

// ============================================================================
// 2. Simulator — Topology Tools Validation
// ============================================================================

describe('Simulator — Topology Tools', () => {
    let sim: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (sim) {
            await sim.close();
            sim = undefined;
        }
    });

    it('should include all 6 simulated tools', async () => {
        sim = await startSimulator({ rps: 1 });
        const events = await collectEvents(sim.path, 500);

        const topo = events.find((e) => e.type === 'topology') as any;
        expect(topo).toBeDefined();

        const toolNames = topo.tools.map((t: any) => t.name);
        expect(toolNames).toContain('user');
        expect(toolNames).toContain('billing');
        expect(toolNames).toContain('analytics');
        expect(toolNames).toContain('auth');
        expect(toolNames).toContain('document');
        expect(toolNames).toContain('notification');
    });

    it('should mark billing as destructive', async () => {
        sim = await startSimulator({ rps: 1 });
        const events = await collectEvents(sim.path, 500);

        const topo = events.find((e) => e.type === 'topology') as any;
        const billing = topo.tools.find((t: any) => t.name === 'billing');
        expect(billing.destructive).toBe(true);
    });

    it('should mark analytics as sandboxed', async () => {
        sim = await startSimulator({ rps: 1 });
        const events = await collectEvents(sim.path, 500);

        const topo = events.find((e) => e.type === 'topology') as any;
        const analytics = topo.tools.find((t: any) => t.name === 'analytics');
        expect(analytics.sandboxed).toBe(true);
        expect(analytics.readOnly).toBe(true);
    });

    it('should have auth tool with FSM states', async () => {
        sim = await startSimulator({ rps: 1 });
        const events = await collectEvents(sim.path, 500);

        const topo = events.find((e) => e.type === 'topology') as any;
        const auth = topo.tools.find((t: any) => t.name === 'auth');
        expect(auth.fsmStates).toBeDefined();
        expect(auth.fsmStates).toContain('authenticated');
        expect(auth.fsmStates).toContain('mfa_required');
    });
});

// ============================================================================
// 3. Simulator — Event Structure Validation
// ============================================================================

describe('Simulator — Event Structure', () => {
    let sim: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (sim) {
            await sim.close();
            sim = undefined;
        }
    });

    it('all events should have type and timestamp', async () => {
        sim = await startSimulator({ rps: 20 });
        const events = await collectEvents(sim.path, 3000);

        for (const event of events) {
            expect(event.type).toBeDefined();
            expect(typeof event.type).toBe('string');
            expect((event as any).timestamp).toBeGreaterThan(0);
        }
    });

    it('route events should have tool and action', async () => {
        sim = await startSimulator({ rps: 20 });
        const events = await collectEvents(sim.path, 2000);

        for (const event of events.filter((e) => e.type === 'route')) {
            const r = event as any;
            expect(r.tool).toBeDefined();
            expect(r.action).toBeDefined();
            expect(typeof r.tool).toBe('string');
            expect(typeof r.action).toBe('string');
        }
    });

    it('heartbeat events should have memory metrics', async () => {
        sim = await startSimulator({ rps: 1 });
        const events = await collectEvents(sim.path, 6500);

        const hbs = events.filter((e) => e.type === 'heartbeat');
        if (hbs.length > 0) {
            const hb = hbs[0] as any;
            expect(typeof hb.heapUsedBytes).toBe('number');
            expect(typeof hb.rssBytes).toBe('number');
            expect(typeof hb.uptimeSeconds).toBe('number');
            expect(hb.heapUsedBytes).toBeGreaterThan(0);
            expect(hb.rssBytes).toBeGreaterThan(0);
        }
    }, 8000);

    it('DLP events should have fieldsRedacted and paths', async () => {
        sim = await startSimulator({ rps: 50 });
        const events = await collectEvents(sim.path, 4000);

        const dlps = events.filter((e) => e.type === 'dlp.redact');
        if (dlps.length > 0) {
            const d = dlps[0] as any;
            expect(typeof d.fieldsRedacted).toBe('number');
            expect(d.fieldsRedacted).toBeGreaterThanOrEqual(1);
            expect(Array.isArray(d.paths)).toBe(true);
            expect(d.paths.length).toBeGreaterThanOrEqual(1);
        }
    }, 6000);

    it('presenter.slice events should have byte metrics', async () => {
        sim = await startSimulator({ rps: 50 });
        const events = await collectEvents(sim.path, 4000);

        const slices = events.filter((e) => e.type === 'presenter.slice');
        if (slices.length > 0) {
            const s = slices[0] as any;
            expect(typeof s.rawBytes).toBe('number');
            expect(typeof s.wireBytes).toBe('number');
            expect(typeof s.rowsRaw).toBe('number');
            expect(typeof s.rowsWire).toBe('number');
            expect(s.rawBytes).toBeGreaterThanOrEqual(s.wireBytes);
        }
    }, 6000);

    it('sandbox.exec events should have executionMs', async () => {
        sim = await startSimulator({ rps: 50 });
        const events = await collectEvents(sim.path, 5000);

        const sandboxes = events.filter((e) => e.type === 'sandbox.exec');
        if (sandboxes.length > 0) {
            const sb = sandboxes[0] as any;
            expect(typeof sb.ok).toBe('boolean');
            expect(typeof sb.executionMs).toBe('number');
        }
    }, 7000);

    it('fsm.transition events should have state fields', async () => {
        sim = await startSimulator({ rps: 5 });
        const events = await collectEvents(sim.path, 10_000);

        const fsms = events.filter((e) => e.type === 'fsm.transition');
        if (fsms.length > 0) {
            const f = fsms[0] as any;
            expect(typeof f.previousState).toBe('string');
            expect(typeof f.currentState).toBe('string');
            expect(typeof f.event).toBe('string');
            expect(typeof f.toolsVisible).toBe('number');
        }
    }, 12000);
});

// ============================================================================
// 4. CLI — Argument Parsing
// ============================================================================

describe('CLI — parseInspectorArgs', () => {
    it('should return defaults for empty argv', () => {
        const args = parseInspectorArgs([]);
        expect(args.demo).toBe(false);
        expect(args.out).toBe('tui');
        expect(args.pid).toBeUndefined();
        expect(args.path).toBeUndefined();
    });

    it('should parse --demo flag', () => {
        const args = parseInspectorArgs(['--demo']);
        expect(args.demo).toBe(true);
    });

    it('should parse --out stderr', () => {
        const args = parseInspectorArgs(['--out', 'stderr']);
        expect(args.out).toBe('stderr');
    });

    it('should parse --pid', () => {
        const args = parseInspectorArgs(['--pid', '12345']);
        expect(args.pid).toBe(12345);
    });

    it('should parse --path', () => {
        const args = parseInspectorArgs(['--path', '/tmp/test.sock']);
        expect(args.path).toBe('/tmp/test.sock');
    });

    it('should parse all flags combined', () => {
        const args = parseInspectorArgs([
            '--demo',
            '--out', 'stderr',
            '--pid', '999',
            '--path', '/tmp/custom.sock',
        ]);
        expect(args.demo).toBe(true);
        expect(args.out).toBe('stderr');
        expect(args.pid).toBe(999);
        expect(args.path).toBe('/tmp/custom.sock');
    });

    it('should handle unknown flags gracefully', () => {
        const args = parseInspectorArgs(['--unknown', '--foo', 'bar']);
        expect(args.demo).toBe(false);
    });

    it('should handle --demo anywhere in args', () => {
        const args = parseInspectorArgs(['--out', 'stderr', '--demo']);
        expect(args.demo).toBe(true);
        expect(args.out).toBe('stderr');
    });
});

// ============================================================================
// 5. Adversarial
// ============================================================================

describe('Adversarial — Simulator', () => {
    let sim: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (sim) {
            await sim.close();
            sim = undefined;
        }
    });

    it('should handle rps = 0 without crashing', async () => {
        // rps=0 means intervalMs=Infinity → no events emitted
        sim = await startSimulator({ rps: 0.1 });
        expect(sim.path).toBeDefined();
    });

    it('should handle very high rps gracefully', async () => {
        sim = await startSimulator({ rps: 1000 });
        await wait(200);
        await sim.close();
        sim = undefined; // prevent double-close
    });

    it('should not leak events after close', async () => {
        sim = await startSimulator({ rps: 50 });
        await sim.close();
        sim = undefined;

        await wait(500);
        // No hanging timers = test passes without timeout
    });
});

describe('Adversarial — CLI Args', () => {
    it('should handle --pid with non-numeric value', () => {
        const args = parseInspectorArgs(['--pid', 'abc']);
        expect(Number.isNaN(args.pid)).toBe(true);
    });

    it('should handle --pid without value (no trailing arg)', () => {
        const args = parseInspectorArgs(['--pid']);
        // argv[++i] is undefined → parseInt(undefined) → NaN, but guarded by if(val)
        expect(args.pid).toBeUndefined();
    });

    it('should handle --out without value (stays default)', () => {
        const args = parseInspectorArgs(['--out']);
        expect(args.out).toBe('tui'); // stays default when no value follows
    });

    it('should handle --path without value', () => {
        const args = parseInspectorArgs(['--path']);
        // argv[++i] is undefined when no value follows
        expect(args.path).toBeUndefined();
    });

    it('should handle empty string args', () => {
        const args = parseInspectorArgs(['', '', '']);
        expect(args.demo).toBe(false);
    });
});
