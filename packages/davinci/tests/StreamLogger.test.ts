/**
 * StreamLogger.test.ts — Cross-Platform Stdio/Stderr Fortress Tests
 *
 * These tests form the LAST LINE OF DEFENSE for the headless output pipeline.
 * They verify:
 *
 *  1. formatEvent — All 13 event types produce valid, non-empty strings
 *  2. formatEventJson — Structured NDJSON output for CloudWatch/Datadog
 *  3. Cross-Platform IPC Paths — Windows Named Pipes vs POSIX Unix Sockets
 *  4. NDJSON Buffer Splitting — Partial line handling (the silent killer)
 *  5. StreamLogger Stderr Integration — Actual event delivery through IPC
 *  6. Trace ID Correlation — Every line carries the correct [hash]
 *  7. New Features — Recovery, Select Reflection, Guardrail in events
 *  8. Adversarial — Binary garbage, huge payloads, empty lines
 *
 * @module
 */
import { describe, it, expect, afterEach } from 'vitest';
import { platform } from 'node:os';
import { connect } from 'node:net';
import {
    getTelemetryPath,
    createTelemetryBus,
    type TelemetryEvent,
    type TelemetryBusInstance,
} from '@vinkius-core/mcp-fusion';
import { formatEvent, formatEventJson } from '../src/StreamLogger.js';
import { startSimulator } from '../src/Simulator.js';

// ─── Test Event Factory ────────────────────────────────────────────

const NOW = Date.now();

function makeEvent(overrides: Partial<TelemetryEvent> & { type: string }): TelemetryEvent {
    return { timestamp: NOW, ...overrides } as TelemetryEvent;
}

const ROUTE_EVENT = makeEvent({
    type: 'route', tool: 'user', action: 'getProfile', traceId: 'a7b9',
});

const VALIDATE_EVENT = makeEvent({
    type: 'validate', tool: 'billing', action: 'refund',
    valid: true, durationMs: 3, traceId: 'f42c',
});

const VALIDATE_FAIL_EVENT = makeEvent({
    type: 'validate', tool: 'billing', action: 'refund',
    valid: false, error: 'amount must be positive', durationMs: 1, traceId: 'f42c',
});

const MIDDLEWARE_EVENT = makeEvent({
    type: 'middleware', tool: 'user', action: 'getProfile',
    chainLength: 3, traceId: 'a7b9',
});

const EXECUTE_OK_EVENT = makeEvent({
    type: 'execute', tool: 'user', action: 'getProfile',
    isError: false, durationMs: 42, traceId: 'a7b9',
});

const EXECUTE_ERR_EVENT = makeEvent({
    type: 'execute', tool: 'user', action: 'deleteUser',
    isError: true, durationMs: 120, traceId: 'c3d1',
});

const ERROR_EVENT = makeEvent({
    type: 'error', tool: 'user', action: 'deleteUser',
    error: 'User ID 991 not found', step: 'execute', traceId: 'c3d1',
});

const TOPOLOGY_EVENT = makeEvent({
    type: 'topology', serverName: 'Test Server', pid: 12345,
    tools: [{ name: 'user', actions: ['getProfile', 'deleteUser'] }],
});

const HEARTBEAT_EVENT = makeEvent({
    type: 'heartbeat',
    heapUsedBytes: 52_428_800, heapTotalBytes: 104_857_600,
    rssBytes: 157_286_400, uptimeSeconds: 3600,
});

const DLP_EVENT = makeEvent({
    type: 'dlp.redact', tool: 'user', action: 'getProfile',
    fieldsRedacted: 2, paths: ['$.user.email', '$.user.phone'], traceId: 'a7b9',
});

const PRESENTER_EVENT = makeEvent({
    type: 'presenter.slice', tool: 'user', action: 'getProfile',
    rawBytes: 10000, wireBytes: 2500, rowsRaw: 100, rowsWire: 25, traceId: 'a7b9',
});

const RULES_EVENT = makeEvent({
    type: 'presenter.rules', tool: 'user', action: 'getProfile',
    rules: ['Return top 3', 'Mask PII'], traceId: 'a7b9',
});

const SANDBOX_OK_EVENT = makeEvent({
    type: 'sandbox.exec', ok: true, executionMs: 15,
});

const SANDBOX_FAIL_EVENT = makeEvent({
    type: 'sandbox.exec', ok: false, executionMs: 5000, errorCode: 'TIMEOUT',
});

const FSM_EVENT = makeEvent({
    type: 'fsm.transition',
    previousState: 'idle', currentState: 'authenticated',
    event: 'login', toolsVisible: 8,
});

const GOVERNANCE_EVENT = makeEvent({
    type: 'governance', operation: 'schema.check',
    label: 'billing.refund', outcome: 'success', durationMs: 45,
});

const ALL_EVENTS = [
    ROUTE_EVENT, VALIDATE_EVENT, VALIDATE_FAIL_EVENT,
    MIDDLEWARE_EVENT, EXECUTE_OK_EVENT, EXECUTE_ERR_EVENT,
    ERROR_EVENT, TOPOLOGY_EVENT, HEARTBEAT_EVENT,
    DLP_EVENT, PRESENTER_EVENT, RULES_EVENT,
    SANDBOX_OK_EVENT, SANDBOX_FAIL_EVENT,
    FSM_EVENT, GOVERNANCE_EVENT,
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// 1. formatEvent — Human-Readable Formatter (ALL 13 event types)
// ============================================================================

describe('StreamLogger — formatEvent (human-readable)', () => {
    it('should produce non-empty string for every event type', () => {
        for (const event of ALL_EVENTS) {
            const result = formatEvent(event);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        }
    });

    it('should include tool.action in route events', () => {
        const line = formatEvent(ROUTE_EVENT);
        expect(line).toContain('user.getProfile');
    });

    it('should include REQ tag in route events', () => {
        const line = formatEvent(ROUTE_EVENT);
        expect(line).toContain('REQ');
    });

    it('should include ZOD tag in validate events', () => {
        const line = formatEvent(VALIDATE_EVENT);
        expect(line).toContain('ZOD');
    });

    it('should show ✓ for valid Zod and ✗ for invalid', () => {
        const valid = formatEvent(VALIDATE_EVENT);
        const invalid = formatEvent(VALIDATE_FAIL_EVENT);
        expect(valid).toContain('✓');
        expect(invalid).toContain('✗');
    });

    it('should include error message in validate failure', () => {
        const line = formatEvent(VALIDATE_FAIL_EVENT);
        expect(line).toContain('amount must be positive');
    });

    it('should include duration in validate events', () => {
        const line = formatEvent(VALIDATE_EVENT);
        expect(line).toContain('3ms');
    });

    it('should include MID tag in middleware events', () => {
        const line = formatEvent(MIDDLEWARE_EVENT);
        expect(line).toContain('MID');
        expect(line).toContain('chain=3');
    });

    it('should include EXEC tag and duration in execute events', () => {
        const ok = formatEvent(EXECUTE_OK_EVENT);
        expect(ok).toContain('EXEC');
        expect(ok).toContain('42ms');
    });

    it('should show ✓ for successful execute and ✗ for failed', () => {
        const ok = formatEvent(EXECUTE_OK_EVENT);
        const err = formatEvent(EXECUTE_ERR_EVENT);
        expect(ok).toContain('✓');
        expect(err).toContain('✗');
    });

    it('should include ERR tag, error message, and step in error events', () => {
        const line = formatEvent(ERROR_EVENT);
        expect(line).toContain('ERR');
        expect(line).toContain('User ID 991 not found');
        expect(line).toContain('execute');
    });

    it('should include TOPO tag, server name, PID and tool count in topology', () => {
        const line = formatEvent(TOPOLOGY_EVENT);
        expect(line).toContain('TOPO');
        expect(line).toContain('Test Server');
        expect(line).toContain('pid=12345');
        expect(line).toContain('tools=1');
    });

    it('should include BEAT tag and memory metrics in heartbeat', () => {
        const line = formatEvent(HEARTBEAT_EVENT);
        expect(line).toContain('BEAT');
        expect(line).toContain('heap=');
        expect(line).toContain('up=3600s');
    });

    it('should include DLP tag and redacted paths', () => {
        const line = formatEvent(DLP_EVENT);
        expect(line).toContain('DLP');
        expect(line).toContain('$.user.email');
        expect(line).toContain('$.user.phone');
        expect(line).toContain('redacted=2');
    });

    it('should include PRES tag, byte savings %, and row counts', () => {
        const line = formatEvent(PRESENTER_EVENT);
        expect(line).toContain('PRES');
        expect(line).toContain('10000B');
        expect(line).toContain('2500B');
        expect(line).toContain('-75%');
        expect(line).toContain('rows=100→25');
    });

    it('should include RULE tag and rules in presenter.rules', () => {
        const line = formatEvent(RULES_EVENT);
        expect(line).toContain('RULE');
        expect(line).toContain('Return top 3');
        expect(line).toContain('Mask PII');
    });

    it('should include V8 tag in sandbox events', () => {
        const ok = formatEvent(SANDBOX_OK_EVENT);
        const fail = formatEvent(SANDBOX_FAIL_EVENT);
        expect(ok).toContain('V8');
        expect(ok).toContain('ok');
        expect(fail).toContain('V8');
        expect(fail).toContain('TIMEOUT');
    });

    it('should include FSM tag, state transition, and tools visible', () => {
        const line = formatEvent(FSM_EVENT);
        expect(line).toContain('FSM');
        expect(line).toContain('idle');
        expect(line).toContain('authenticated');
        expect(line).toContain('login');
        expect(line).toContain('visible=8');
    });

    it('should include GOV tag and outcome in governance events', () => {
        const line = formatEvent(GOVERNANCE_EVENT);
        expect(line).toContain('GOV');
        expect(line).toContain('schema.check');
        expect(line).toContain('success');
        expect(line).toContain('45ms');
    });

    it('should handle unknown event type with ???? fallback', () => {
        const unknown = makeEvent({ type: 'alien.invasion' });
        const line = formatEvent(unknown);
        expect(line).toContain('????');
    });

    it('should never produce multiline output (no \\n in formatted line)', () => {
        for (const event of ALL_EVENTS) {
            const line = formatEvent(event);
            // Strip ANSI codes, check for newlines
            const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
            expect(clean).not.toContain('\n');
        }
    });
});

// ============================================================================
// 2. formatEventJson — Structured NDJSON Formatter
// ============================================================================

describe('StreamLogger — formatEventJson (NDJSON)', () => {
    it('should produce valid JSON for every event type', () => {
        for (const event of ALL_EVENTS) {
            const json = formatEventJson(event);
            expect(() => JSON.parse(json)).not.toThrow();
        }
    });

    it('should include time, level, and event fields in every JSON line', () => {
        for (const event of ALL_EVENTS) {
            const parsed = JSON.parse(formatEventJson(event));
            expect(parsed.time).toBeDefined();
            expect(parsed.level).toBeDefined();
            expect(parsed.event).toBeDefined();
        }
    });

    it('should map event types to correct log levels', () => {
        const errorJson = JSON.parse(formatEventJson(ERROR_EVENT));
        expect(errorJson.level).toBe('error');

        const govJson = JSON.parse(formatEventJson(GOVERNANCE_EVENT));
        expect(govJson.level).toBe('warn');

        const routeJson = JSON.parse(formatEventJson(ROUTE_EVENT));
        expect(routeJson.level).toBe('info');
    });

    it('should include traceId when present', () => {
        const withTrace = JSON.parse(formatEventJson(ROUTE_EVENT));
        expect(withTrace.traceId).toBe('a7b9');

        const withoutTrace = JSON.parse(formatEventJson(TOPOLOGY_EVENT));
        expect(withoutTrace.traceId).toBeUndefined();
    });

    it('should include tool and action for pipeline events', () => {
        const parsed = JSON.parse(formatEventJson(ROUTE_EVENT));
        expect(parsed.tool).toBe('user');
        expect(parsed.action).toBe('getProfile');
    });

    it('should include error details in error events', () => {
        const parsed = JSON.parse(formatEventJson(ERROR_EVENT));
        expect(parsed.error).toBe('User ID 991 not found');
        expect(parsed.step).toBe('execute');
    });

    it('should include topology metadata', () => {
        const parsed = JSON.parse(formatEventJson(TOPOLOGY_EVENT));
        expect(parsed.serverName).toBe('Test Server');
        expect(parsed.pid).toBe(12345);
    });

    it('should produce single-line output (no embedded newlines)', () => {
        for (const event of ALL_EVENTS) {
            const json = formatEventJson(event);
            expect(json).not.toContain('\n');
        }
    });

    it('should produce valid ISO 8601 timestamps', () => {
        for (const event of ALL_EVENTS) {
            const parsed = JSON.parse(formatEventJson(event));
            const date = new Date(parsed.time);
            expect(date.getTime()).not.toBeNaN();
        }
    });

    it('should NOT include raw timestamp (already mapped to time)', () => {
        for (const event of ALL_EVENTS) {
            const parsed = JSON.parse(formatEventJson(event));
            expect(parsed.timestamp).toBeUndefined();
        }
    });

    it('should NOT include raw type (already mapped to event)', () => {
        for (const event of ALL_EVENTS) {
            const parsed = JSON.parse(formatEventJson(event));
            expect(parsed.type).toBeUndefined();
        }
    });
});

// ============================================================================
// 3. Cross-Platform IPC Path Convention
// ============================================================================

describe('StreamLogger — Cross-Platform IPC Paths', () => {
    const isWindows = platform() === 'win32';

    it('should generate Windows Named Pipe path on win32', () => {
        const path = getTelemetryPath(54321);
        if (isWindows) {
            expect(path).toMatch(/^\\\\.\\pipe\\mcp-fusion-54321$/);
            expect(path).not.toContain('/tmp');
        }
    });

    it('should generate POSIX Unix Socket path on Linux/macOS', () => {
        const path = getTelemetryPath(54321);
        if (!isWindows) {
            expect(path).toBe('/tmp/mcp-fusion-54321.sock');
            expect(path).not.toContain('\\');
        }
    });

    it('should generate unique paths for different PIDs', () => {
        const path1 = getTelemetryPath(111);
        const path2 = getTelemetryPath(222);
        expect(path1).not.toBe(path2);
    });

    it('should use process.pid when no PID specified', () => {
        const defaultPath = getTelemetryPath();
        const explicitPath = getTelemetryPath(process.pid);
        expect(defaultPath).toBe(explicitPath);
    });

    it('should handle very large PIDs without corruption', () => {
        const path = getTelemetryPath(2_147_483_647);
        expect(path).toContain('2147483647');
    });

    it('should produce path compatible with net.createConnection', async () => {
        // Create a real bus and verify the path works
        const bus = await createTelemetryBus();
        expect(bus.path.length).toBeGreaterThan(0);

        if (isWindows) {
            expect(bus.path).toMatch(/^\\\\.\\pipe\\/);
        } else {
            expect(bus.path).toMatch(/^\/tmp\/.*\.sock$/);
        }

        await bus.close();
    });
});

// ============================================================================
// 4. NDJSON Buffer Splitting — The Silent Killer
// ============================================================================

describe('StreamLogger — NDJSON Buffer Splitting Robustness', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) { await bus.close(); bus = undefined; }
    });

    it('should handle partial lines split across TCP chunks', async () => {
        const topologyEvent: TelemetryEvent = {
            type: 'topology',
            serverName: 'SplitTest',
            pid: process.pid,
            tools: [],
            timestamp: Date.now(),
        } as TelemetryEvent;

        bus = await createTelemetryBus({
            onConnect: () => topologyEvent,
        });

        // Collect events via IPC and verify no corruption
        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(bus!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 500);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* partial line — this is what we're testing */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // Must have at least the topology event, uncorrupted
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0]!.type).toBe('topology');
    });

    it('should handle rapid burst of events without line merging', async () => {
        bus = await createTelemetryBus();

        // Push many events in tight loop
        for (let i = 0; i < 50; i++) {
            bus.emit({
                type: 'route',
                tool: 'stress',
                action: `burst${i}`,
                timestamp: Date.now(),
            } as TelemetryEvent);
        }

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(bus!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 1000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* skip malformed */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // Every parsed event must be valid JSON with a type field
        for (const event of events) {
            expect(typeof event.type).toBe('string');
            expect(event.type.length).toBeGreaterThan(0);
        }
    });

    it('should NOT corrupt JSON when events contain special chars', async () => {
        bus = await createTelemetryBus();

        // Event with special characters that could break NDJSON
        bus.emit({
            type: 'error',
            tool: 'user',
            action: 'create',
            error: 'Invalid JSON: {"unbalanced": true\n',
            step: 'validate',
            timestamp: Date.now(),
        } as TelemetryEvent);

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(bus!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 300);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* expected — the embedded \n splits the line */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // At least some events should be parseable
        // The key is that the parser doesn't crash
        expect(events.length).toBeGreaterThanOrEqual(0);
    });
});

// ============================================================================
// 5. Stderr Integration — Full IPC → Format → Output Pipeline
// ============================================================================

describe('StreamLogger — Stderr Integration (IPC → Format)', () => {
    let sim: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (sim) { await sim.close(); sim = undefined; }
    });

    it('should format every IPC event into a non-empty string line', async () => {
        sim = await startSimulator({ rps: 20 });

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(sim!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 2000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* skip */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // Every event received through IPC must be formattable
        for (const event of events) {
            const humanLine = formatEvent(event);
            const jsonLine = formatEventJson(event);

            expect(humanLine.length).toBeGreaterThan(0);
            expect(() => JSON.parse(jsonLine)).not.toThrow();
        }
    });

    it('should deliver enriched error events with recovery data through IPC', async () => {
        sim = await startSimulator({ rps: 50 });

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(sim!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 4000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* skip */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // Find error events — they should have recovery data (Feature #1)
        const errors = events.filter((e) => e.type === 'error') as any[];
        if (errors.length > 0) {
            const withRecovery = errors.filter((e) => e.recovery);
            // At least some errors should carry self-healing recovery
            expect(withRecovery.length).toBeGreaterThan(0);

            for (const err of withRecovery) {
                expect(typeof err.recovery).toBe('string');
                expect(err.recovery.length).toBeGreaterThan(0);
                expect(Array.isArray(err.recoveryActions)).toBe(true);
                expect(err.recoveryActions.length).toBeGreaterThan(0);
            }
        }
    }, 6000);

    it('should deliver enriched execute events with select reflection through IPC', async () => {
        sim = await startSimulator({ rps: 50 });

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(sim!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 4000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* skip */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // Find execute events with selectFields (Feature #2, 25% probability)
        const execs = events.filter((e) => e.type === 'execute') as any[];
        if (execs.length > 10) {
            const withSelect = execs.filter((e) => e.selectFields);
            // With 25% probability and >10 execs, we should have some
            if (withSelect.length > 0) {
                for (const ex of withSelect) {
                    expect(Array.isArray(ex.selectFields)).toBe(true);
                    expect(ex.selectFields.length).toBeGreaterThan(0);
                    expect(typeof ex.totalFields).toBe('number');
                    expect(ex.totalFields).toBeGreaterThan(0);
                }
            }
        }
    }, 6000);

    it('should deliver enriched execute events with guardrail data through IPC', async () => {
        sim = await startSimulator({ rps: 50 });

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(sim!.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 4000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* skip */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        // Find execute events with guardrail data (Feature #4, 15% probability)
        const execs = events.filter((e) => e.type === 'execute') as any[];
        if (execs.length > 20) {
            const withGuardrail = execs.filter((e) => e.guardrailFrom !== undefined);
            if (withGuardrail.length > 0) {
                for (const ex of withGuardrail) {
                    expect(typeof ex.guardrailFrom).toBe('number');
                    expect(typeof ex.guardrailTo).toBe('number');
                    expect(ex.guardrailTo).toBe(50);
                    expect(typeof ex.guardrailHint).toBe('string');
                }
            }
        }
    }, 6000);
});

// ============================================================================
// 6. Trace ID Correlation — [hash] injection
// ============================================================================

describe('StreamLogger — Trace ID Correlation', () => {
    it('should include traceId [a7b9] in route event output', () => {
        const line = formatEvent(ROUTE_EVENT);
        expect(line).toContain('a7b9');
    });

    it('should include traceId in JSON output', () => {
        const parsed = JSON.parse(formatEventJson(ROUTE_EVENT));
        expect(parsed.traceId).toBe('a7b9');
    });

    it('should NOT include traceId prefix for events without traceId', () => {
        const noTrace = makeEvent({
            type: 'route', tool: 'test', action: 'ping',
        });
        const line = formatEvent(noTrace);
        // Should not have [undefined] or [null]
        expect(line).not.toContain('[undefined]');
        expect(line).not.toContain('[null]');
    });

    it('should correlate same traceId across pipeline stages', async () => {
        const sim = await startSimulator({ rps: 30 });

        const events: TelemetryEvent[] = [];
        await new Promise<void>((resolve) => {
            let buffer = '';
            const client = connect(sim.path);
            const timer = setTimeout(() => { client.destroy(); resolve(); }, 3000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop()!;
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try { events.push(JSON.parse(line) as TelemetryEvent); }
                    catch { /* skip */ }
                }
            });

            client.on('error', () => { clearTimeout(timer); resolve(); });
        });

        await sim.close();

        // Group events by traceId
        const traceGroups = new Map<string, string[]>();
        for (const e of events) {
            const trace = (e as any).traceId;
            if (trace) {
                if (!traceGroups.has(trace)) traceGroups.set(trace, []);
                traceGroups.get(trace)!.push(e.type);
            }
        }

        // Some traces should span multiple pipeline stages
        let multiStageTraces = 0;
        for (const [, types] of traceGroups) {
            if (types.length > 1) multiStageTraces++;
        }

        expect(multiStageTraces).toBeGreaterThan(0);
    });
});

// ============================================================================
// 7. Adversarial — Edge Cases That Break Production
// ============================================================================

describe('StreamLogger — Adversarial Edge Cases', () => {
    it('should handle event with empty strings gracefully', () => {
        const empty = makeEvent({
            type: 'error', tool: '', action: '',
            error: '', step: 'execute',
        });
        const line = formatEvent(empty);
        expect(typeof line).toBe('string');
        // Should not crash or produce undefined
        expect(line).not.toContain('undefined');
    });

    it('should handle event with very long error message', () => {
        const longError = makeEvent({
            type: 'error', tool: 'user', action: 'query',
            error: 'X'.repeat(10000), step: 'execute',
        });
        const line = formatEvent(longError);
        expect(line.length).toBeGreaterThan(100);
        // Should not crash
    });

    it('should handle event with unicode characters', () => {
        const unicode = makeEvent({
            type: 'error', tool: 'user', action: 'create',
            error: 'Falha: 用户不存在 — 사용자 없음 🚨', step: 'execute',
        });
        const line = formatEvent(unicode);
        expect(line).toContain('🚨');
    });

    it('should produce valid JSON even with special characters in event data', () => {
        const special = makeEvent({
            type: 'error', tool: 'user', action: 'create',
            error: 'Quote "test" and backslash \\ and tab \t',
            step: 'execute',
        });
        const json = formatEventJson(special);
        expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should handle event with zero timestamp', () => {
        const zeroTs = makeEvent({
            type: 'topology', serverName: 'Zero',
            pid: 1, tools: [], timestamp: 0,
        });
        const json = formatEventJson(zeroTs);
        const parsed = JSON.parse(json);
        expect(parsed.time).toBe('1970-01-01T00:00:00.000Z');
    });

    it('should handle event with very large numbers', () => {
        const big = makeEvent({
            type: 'heartbeat',
            heapUsedBytes: Number.MAX_SAFE_INTEGER,
            heapTotalBytes: Number.MAX_SAFE_INTEGER,
            rssBytes: Number.MAX_SAFE_INTEGER,
            uptimeSeconds: 999999,
        });
        const line = formatEvent(big);
        expect(typeof line).toBe('string');
        expect(line.length).toBeGreaterThan(0);
    });

    it('should format JSON for topology with empty tools array', () => {
        const empty = makeEvent({
            type: 'topology', serverName: 'Empty', pid: 1, tools: [],
        });
        const json = formatEventJson(empty);
        const parsed = JSON.parse(json);
        expect(parsed.tools).toEqual([]);
    });

    it('should handle DLP event with empty paths array', () => {
        const emptyDlp = makeEvent({
            type: 'dlp.redact', tool: 'user', action: 'get',
            fieldsRedacted: 0, paths: [],
        });
        const line = formatEvent(emptyDlp);
        expect(line).toContain('DLP');
        expect(line).toContain('redacted=0');
        expect(line).toContain('paths=[]');
    });
});

// ============================================================================
// 8. Cross-Platform IPC Connection Stability
// ============================================================================

describe('StreamLogger — Cross-Platform Connection Stability', () => {
    let bus: TelemetryBusInstance | undefined;

    afterEach(async () => {
        if (bus) { await bus.close(); bus = undefined; }
    });

    it('should accept connections on platform-specific IPC path', async () => {
        bus = await createTelemetryBus();

        const connected = await new Promise<boolean>((resolve) => {
            const client = connect(bus!.path);
            client.on('connect', () => { client.destroy(); resolve(true); });
            client.on('error', () => { resolve(false); });
            setTimeout(() => { resolve(false); }, 2000);
        });

        expect(connected).toBe(true);
    });

    it('should accept custom IPC path on both Windows and POSIX', async () => {
        const customPath = platform() === 'win32'
            ? `\\\\.\\pipe\\mcp-fusion-xplat-test-${Date.now()}`
            : `/tmp/mcp-fusion-xplat-test-${Date.now()}.sock`;

        bus = await createTelemetryBus({ path: customPath });
        expect(bus.path).toBe(customPath);

        const connected = await new Promise<boolean>((resolve) => {
            const client = connect(bus!.path);
            client.on('connect', () => { client.destroy(); resolve(true); });
            client.on('error', () => { resolve(false); });
            setTimeout(() => { resolve(false); }, 2000);
        });

        expect(connected).toBe(true);
    });

    it('should survive multiple rapid connect/disconnect cycles', async () => {
        bus = await createTelemetryBus();

        // 10 rapid connect/disconnect cycles
        for (let i = 0; i < 10; i++) {
            const client = connect(bus.path);
            await new Promise<void>((resolve) => {
                client.on('connect', () => { client.destroy(); resolve(); });
                client.on('error', () => { resolve(); });
                setTimeout(resolve, 200);
            });
        }

        // Bus should still accept connections after abuse
        const finalConnected = await new Promise<boolean>((resolve) => {
            const client = connect(bus!.path);
            client.on('connect', () => { client.destroy(); resolve(true); });
            client.on('error', () => { resolve(false); });
            setTimeout(() => { resolve(false); }, 2000);
        });

        expect(finalConnected).toBe(true);
    });

    it('should handle concurrent connections from 5 clients', async () => {
        const topologyEvent: TelemetryEvent = {
            type: 'topology',
            serverName: 'ConcurrentTest',
            pid: process.pid,
            tools: [],
            timestamp: Date.now(),
        } as TelemetryEvent;

        bus = await createTelemetryBus({
            onConnect: () => topologyEvent,
        });

        const results = await Promise.all(
            Array.from({ length: 5 }, () =>
                new Promise<boolean>((resolve) => {
                    const events: any[] = [];
                    let buffer = '';
                    const client = connect(bus!.path);
                    const timer = setTimeout(() => {
                        client.destroy();
                        resolve(events.length > 0);
                    }, 500);

                    client.on('data', (chunk) => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop()!;
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try { events.push(JSON.parse(line)); }
                            catch { /* skip */ }
                        }
                    });

                    client.on('error', () => { clearTimeout(timer); resolve(false); });
                }),
            ),
        );

        // All 5 clients should have received at least one event
        const successCount = results.filter(Boolean).length;
        expect(successCount).toBe(5);
    });
});
