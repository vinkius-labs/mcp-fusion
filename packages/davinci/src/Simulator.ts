/**
 * Simulator — Realistic MCP Fusion Telemetry Emitter
 *
 * Spins up a TelemetryBus and emits a continuous stream of realistic
 * telemetry events that mimic a live MCP Fusion server. Use with
 * `davinci` to test/demo the TUI without a real server.
 *
 * Usage:
 *   fusion dv --demo                # Built-in simulator + TUI
 *   fusion dv --out stderr --demo   # Headless simulator output
 *
 * @module
 */
import { createTelemetryBus } from '@vinkius-core/mcp-fusion';
import type {
    TelemetryEvent,
    TopologyTool,
    TelemetryBusInstance,
} from '@vinkius-core/mcp-fusion';

// ============================================================================
// Fake Tool Registry
// ============================================================================

const TOOLS: TopologyTool[] = [
    {
        name: 'user',
        actions: ['getProfile', 'updateProfile', 'listUsers', 'deleteUser'],
        readOnly: false,
        destructive: false,
        sandboxed: false,
    },
    {
        name: 'billing',
        actions: ['getInvoice', 'chargeCard', 'refund'],
        readOnly: false,
        destructive: true,
        sandboxed: false,
    },
    {
        name: 'analytics',
        actions: ['queryMetrics', 'exportReport', 'runScript'],
        readOnly: true,
        destructive: false,
        sandboxed: true,
    },
    {
        name: 'auth',
        actions: ['verifyToken', 'revokeSession'],
        readOnly: true,
        destructive: false,
        sandboxed: false,
        fsmStates: ['authenticated', 'mfa_required'],
    },
    {
        name: 'document',
        actions: ['search', 'summarize', 'classify'],
        readOnly: true,
        destructive: false,
        sandboxed: false,
    },
    {
        name: 'notification',
        actions: ['send', 'schedule', 'cancel'],
        readOnly: false,
        destructive: false,
        sandboxed: false,
    },
];

// ============================================================================
// Helpers
// ============================================================================

const FAKE_PATHS = ['$.user.email', '$.user.phone', '$.billing.cardNumber', '$.user.ssn'];
const FAKE_RULES = [
    'Return only the top 3 results',
    'Never reveal internal IDs',
    'Format currency in USD',
    'Summarize in Portuguese',
    'Mask all PII before response',
];
const FSM_STATES = ['idle', 'authenticated', 'mfa_required', 'checkout', 'completed'];
const FSM_EVENTS = ['login', 'verify_mfa', 'start_checkout', 'confirm_payment', 'reset'];

// Error recovery data (Feature #1)
const FAKE_ERRORS = [
    { error: 'User ID 991 not found in database', recovery: 'Verify the ID. Use user.listUsers first.', actions: ['user.listUsers', 'user.search'] },
    { error: 'Connection timeout to upstream service', recovery: 'Retry with exponential backoff. Check service health.', actions: ['health.check', 'retry'] },
    { error: 'Rate limit exceeded (429)', recovery: 'Wait 30s before retrying. Consider batch operations.', actions: ['billing.batchRefund'] },
    { error: 'Insufficient permissions for resource', recovery: 'Request elevated access. Use auth.verifyToken first.', actions: ['auth.verifyToken', 'auth.revokeSession'] },
];

// Select Reflection fields (Feature #2)
const ALL_FIELDS = ['id', 'name', 'email', 'phone', 'status', 'amount', 'currency', 'createdAt', 'updatedAt', 'address', 'city', 'country', 'zipCode', 'role', 'avatar'];

// Agent Limit guardrail hints (Feature #4)
const GUARDRAIL_HINTS = [
    'Results truncated. Use pagination parameters.',
    'Too many results. Apply date range filters.',
    'Consider using _select to reduce payload.',
];

// Prompt topology (Feature #5)
const FAKE_PROMPTS = [
    { name: 'billing.summary', latencyMs: 120 },
    { name: 'user.onboarding', latencyMs: 85 },
    { name: 'analytics.report', latencyMs: 340 },
    { name: 'document.classify', latencyMs: 55 },
];

function randomItem<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBool(probability = 0.5): boolean {
    return Math.random() < probability;
}

/**
 * Generate a short 4-character hex trace ID for correlating events
 * within the same request lifecycle.
 *
 * Examples: "a7b9", "f42c", "03dd"
 */
function generateTraceId(): string {
    return Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0');
}

// ============================================================================
// Event Generators
// ============================================================================

function emitFullPipeline(bus: TelemetryBusInstance): void {
    const tool = randomItem(TOOLS);
    const action = randomItem(tool.actions);
    const now = Date.now();
    const traceId = generateTraceId();

    // 1. Route
    bus.emit({
        type: 'route',
        tool: tool.name,
        action,
        traceId,
        timestamp: now,
    } as TelemetryEvent);

    // 2. Validate (90% pass)
    const vDelay = randomInt(1, 5);
    setTimeout(() => {
        const valid = randomBool(0.9);
        bus.emit({
            type: 'validate',
            tool: tool.name,
            action,
            valid,
            error: valid ? undefined : 'Required field missing: userId',
            durationMs: randomInt(1, 8),
            traceId,
            timestamp: now + vDelay,
        } as TelemetryEvent);

        if (!valid) return;

        // 3. Middleware
        const mDelay = randomInt(2, 10);
        setTimeout(() => {
            bus.emit({
                type: 'middleware',
                tool: tool.name,
                action,
                chainLength: randomInt(1, 4),
                traceId,
                timestamp: now + vDelay + mDelay,
            } as TelemetryEvent);

            // 4. DLP Redaction (30%)
            if (randomBool(0.3)) {
                const count = randomInt(1, 4);
                const paths = Array.from({ length: count }, () => randomItem(FAKE_PATHS));
                bus.emit({
                    type: 'dlp.redact',
                    tool: tool.name,
                    action,
                    fieldsRedacted: count,
                    paths,
                    traceId,
                    timestamp: now + vDelay + mDelay + 1,
                } as TelemetryEvent);
            }

            // 5. Presenter Slice (40%)
            if (randomBool(0.4)) {
                const rawBytes = randomInt(500, 50000);
                const wireBytes = Math.floor(rawBytes * (0.2 + Math.random() * 0.5));
                bus.emit({
                    type: 'presenter.slice',
                    tool: tool.name,
                    action,
                    rawBytes,
                    wireBytes,
                    rowsRaw: randomInt(5, 100),
                    rowsWire: randomInt(1, 20),
                    traceId,
                    timestamp: now + vDelay + mDelay + 2,
                } as TelemetryEvent);
            }

            // 6. Presenter Rules (25%)
            if (randomBool(0.25)) {
                const ruleCount = randomInt(1, 3);
                const rules = Array.from({ length: ruleCount }, () => randomItem(FAKE_RULES));
                bus.emit({
                    type: 'presenter.rules',
                    tool: tool.name,
                    action,
                    rules,
                    traceId,
                    timestamp: now + vDelay + mDelay + 3,
                } as TelemetryEvent);
            }

            // 7. Sandbox (sandboxed tools, 80%)
            if (tool.sandboxed && randomBool(0.8)) {
                const ok = randomBool(0.85);
                bus.emit({
                    type: 'sandbox.exec',
                    ok,
                    executionMs: randomInt(5, 800),
                    errorCode: ok ? undefined : randomItem(['TIMEOUT', 'OOM', 'SYNTAX_ERROR']),
                    timestamp: now + vDelay + mDelay + 4,
                } as TelemetryEvent);
            }

            // 8. Execute
            const xDelay = randomInt(10, 500);
            setTimeout(() => {
                const isError = randomBool(0.08);
                const totalDuration = vDelay + mDelay + xDelay;
                bus.emit({
                    type: 'execute',
                    tool: tool.name,
                    action,
                    durationMs: totalDuration,
                    isError,
                    traceId,
                    timestamp: now + totalDuration,
                } as TelemetryEvent);

                if (isError) {
                    const errData = randomItem(FAKE_ERRORS);
                    bus.emit({
                        type: 'error',
                        tool: tool.name,
                        action,
                        error: errData.error,
                        step: 'execute' as const,
                        traceId,
                        // Self-healing recovery (Feature #1)
                        recovery: errData.recovery,
                        recoveryActions: errData.actions,
                        timestamp: now + totalDuration + 1,
                    } as TelemetryEvent);
                } else {
                    // Select Reflection (Feature #2): 25% chance AI uses _select
                    const hasSelect = randomBool(0.25);
                    const selectFields = hasSelect
                        ? Array.from({ length: randomInt(2, 5) }, () => randomItem(ALL_FIELDS))
                        : undefined;
                    // Agent Limit Guardrail (Feature #4): 15% chance limit fires
                    const hasGuardrail = randomBool(0.15);
                    const guardrailFrom = hasGuardrail ? randomInt(500, 10000) : undefined;
                    const guardrailTo = hasGuardrail ? 50 : undefined;
                    const guardrailHint = hasGuardrail ? randomItem(GUARDRAIL_HINTS) : undefined;

                    bus.emit({
                        type: 'execute',
                        tool: tool.name,
                        action,
                        durationMs: totalDuration,
                        isError: false,
                        traceId,
                        selectFields,
                        totalFields: hasSelect ? ALL_FIELDS.length : undefined,
                        guardrailFrom,
                        guardrailTo,
                        guardrailHint,
                        timestamp: now + totalDuration + 2,
                    } as TelemetryEvent);
                }
            }, xDelay);
        }, mDelay);
    }, vDelay);
}

function emitFsmTransition(bus: TelemetryBusInstance): void {
    const fromIdx = randomInt(0, FSM_STATES.length - 2);
    bus.emit({
        type: 'fsm.transition',
        previousState: FSM_STATES[fromIdx]!,
        currentState: FSM_STATES[fromIdx + 1]!,
        event: FSM_EVENTS[fromIdx]!,
        toolsVisible: randomInt(2, 8),
        timestamp: Date.now(),
    } as TelemetryEvent);
}

// ============================================================================
// Simulator Engine
// ============================================================================

export interface SimulatorOptions {
    /** Requests per second (approximate). Default: 3 */
    rps?: number;
    /** Custom IPC path. If omitted, uses default convention. */
    path?: string;
}

export async function startSimulator(options: SimulatorOptions = {}): Promise<TelemetryBusInstance> {
    const rps = options.rps ?? 3;
    const intervalMs = Math.round(1000 / rps);

    const bus = await createTelemetryBus({
        ...(options.path !== undefined && { path: options.path }),
        onConnect: (): TelemetryEvent => ({
            type: 'topology' as const,
            serverName: 'Fusion Simulator',
            pid: process.pid,
            tools: TOOLS,
            timestamp: Date.now(),
        }),
    });

    // Emit topology
    bus.emit({
        type: 'topology',
        serverName: 'Fusion Simulator',
        pid: process.pid,
        tools: TOOLS,
        timestamp: Date.now(),
    } as TelemetryEvent);

    // Main pipeline loop
    const pipelineTimer = setInterval(() => emitFullPipeline(bus), intervalMs);
    pipelineTimer.unref();

    // FSM transitions every 8-15s
    const fsmTimer = setInterval(() => emitFsmTransition(bus), randomInt(8000, 15000));
    fsmTimer.unref();

    // Governance events every 20-30s
    const govTimer = setInterval(() => {
        bus.emit({
            type: 'governance',
            operation: randomItem([
                'contract.compile', 'contract.diff', 'digest.compute',
                'lockfile.generate', 'lockfile.check',
                'attestation.sign', 'attestation.verify',
            ] as const),
            label: randomItem(['Contract Compilation', 'Lockfile Generation', 'Integrity Check']),
            outcome: randomBool(0.9) ? 'success' as const : 'drift' as const,
            detail: randomItem(['6 tools compiled', 'lockfile up-to-date', '2 drifts detected']),
            durationMs: randomInt(50, 2000),
            timestamp: Date.now(),
        } as TelemetryEvent);
    }, randomInt(20000, 30000));
    govTimer.unref();

    // Heartbeat every 5s
    const beatTimer = setInterval(() => {
        const mem = process.memoryUsage();
        bus.emit({
            type: 'heartbeat',
            heapUsedBytes: mem.heapUsed,
            heapTotalBytes: mem.heapTotal,
            rssBytes: mem.rss,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: Date.now(),
        } as TelemetryEvent);
    }, 5000);
    beatTimer.unref();

    // Override close
    const originalClose = bus.close;
    return {
        ...bus,
        close: async () => {
            clearInterval(pipelineTimer);
            clearInterval(fsmTimer);
            clearInterval(govTimer);
            clearInterval(beatTimer);
            await originalClose();
        },
    };
}

// Standalone entry point
const isMainModule = process.argv[1]?.includes('Simulator');
if (isMainModule) {
    startSimulator().then((bus) => {
        process.stderr.write(
            `\n\x1b[1m\x1b[36m  FUSION SIMULATOR RUNNING\x1b[0m\n` +
            `  PID: ${process.pid}  Path: ${bus.path}\n` +
            `  In another terminal: \x1b[1mnpx fusion dv --pid ${process.pid}\x1b[0m\n\n` +
            `\x1b[2m  Ctrl+C to stop.\x1b[0m\n\n`,
        );
        process.on('SIGINT', async () => {
            await bus.close();
            process.exit(0);
        });
    });
}
