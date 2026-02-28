/**
 * CommandTop — MCP Fusion Inspector TUI
 *
 * Full-screen interactive terminal dashboard that connects to a running
 * MCP Fusion server via Shadow Socket (Named Pipe / Unix Domain Socket).
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  HEADER BAR (server name, PID, req/s, RAM, uptime)  │
 *   ├────────────────────┬─────────────────────────────────┤
 *   │  TOOL TOPOLOGY     │  X-RAY INSPECTOR                │
 *   │  (list + status)   │  (deep-dive on selected tool)   │
 *   ├────────────────────┤                                 │
 *   │  LIVE TRAFFIC      │                                 │
 *   │  (scrolling log)   │                                 │
 *   ├────────────────────┴─────────────────────────────────┤
 *   │  STATUS BAR (keyboard legend)                        │
 *   └──────────────────────────────────────────────────────┘
 *
 * @module
 */
import { connect, type Socket } from 'node:net';
import { platform } from 'node:os';
import {
    ScreenManager, ansi, box, hline,
    pad, truncate, progressBar, stringWidth,
} from './AnsiRenderer.js';
import { RingBuffer } from './RingBuffer.js';
import {
    getTelemetryPath, discoverSockets,
    type TelemetryEvent, type TopologyEvent, type TopologyTool,
    type HeartbeatEvent,
} from '@vinkius-core/mcp-fusion';

// ============================================================================
// Types
// ============================================================================

/** Aggregated state for a single tool+action */
interface ToolState {
    readonly group: string;
    readonly action: string;
    readonly readOnly: boolean;
    readonly destructive: boolean;
    readonly sandboxed: boolean;
    readonly fsmGated: boolean;
    lastStatus: 'ok' | 'error' | 'blocked' | 'running' | 'idle';
    lastLatencyMs: number;
    callCount: number;
    lastArgs?: string;          // JSON string of last input (Gotcha #5: truncated)
    lastRawBytes?: number;      // Presenter raw
    lastWireBytes?: number;     // Presenter wire
    lastRules?: string[];       // Cognitive rules
    lastDlpPaths?: string[];    // DLP redacted paths
    lastDlpCount?: number;      // DLP fields redacted
    // Error autopsy (Feature #1)
    lastError?: string;         // Error message
    lastErrorStep?: string;     // Pipeline step where error occurred
    lastRecovery?: string;      // Self-healing recovery hint
    lastRecoveryActions?: string[]; // Available recovery actions
    // Select Reflection (Feature #2)
    lastSelectFields?: string[]; // Fields the AI selected
    lastTotalFields?: number;    // Total fields available
    // Agent Limit Guardrail (Feature #4)
    lastGuardrailFrom?: number;  // Original item count
    lastGuardrailTo?: number;    // Truncated item count
    lastGuardrailHint?: string;  // Injected hint
    callHistory: RingBuffer<{ ts: number; latencyMs: number; ok: boolean; summary: string }>;
}

/** Traffic log entry */
interface TrafficEntry {
    readonly timestamp: number;
    readonly prefix: string;
    readonly color: string;
    readonly message: string;
}

// ============================================================================
// TUI State
// ============================================================================

class TuiState {
    // Server info (from topology + heartbeat)
    serverName = 'connecting…';
    pid = 0;
    heapUsedBytes = 0;
    heapTotalBytes = 0;
    uptimeSeconds = 0;
    firstEventAt = 0;

    // Tools (from topology → updated by events)
    tools: ToolState[] = [];
    selectedIndex = 0;

    // Live traffic log
    traffic = new RingBuffer<TrafficEntry>(200);

    // Counters
    requestCount = 0;
    dlpTotal = 0;
    reqPerSecond = 0;
    private _recentRequests: number[] = []; // timestamps of recent requests

    // Tab system (Feature #5)
    activeTab: 1 | 2 | 3 = 1; // 1=Tools, 2=Prompts, 3=Resources

    // Queue/Concurrency radar (Feature #3)
    queueActive = 0;
    queueMax = 5;
    queuePending = 0;
    queueCapacity = 20;
    queueBusy = false;

    // Prompt topology (Feature #5)
    prompts: { name: string; latencyMs: number; lastUsed: number; ok: boolean }[] = [];

    /** Update req/s rolling window */
    tickRequest(): void {
        this.requestCount++;
        const now = Date.now();
        this._recentRequests.push(now);
        // Keep only last 5 seconds
        const cutoff = now - 5000;
        this._recentRequests = this._recentRequests.filter(t => t > cutoff);
        this.reqPerSecond = Math.round(this._recentRequests.length / 5);
    }

    /** Find or create a tool entry */
    findTool(group: string, action: string): ToolState | undefined {
        return this.tools.find(t => t.group === group && t.action === action);
    }

    /** Get the currently selected tool */
    get selectedTool(): ToolState | undefined {
        return this.tools[this.selectedIndex];
    }
}

// ============================================================================
// Event Processing
// ============================================================================

function processEvent(state: TuiState, event: TelemetryEvent): void {
    switch (event.type) {
        case 'topology':
            processTopology(state, event as TopologyEvent);
            break;
        case 'heartbeat':
            processHeartbeat(state, event as HeartbeatEvent);
            break;
        case 'route':
            processRoute(state, event);
            break;
        case 'validate':
            processValidate(state, event);
            break;
        case 'execute':
            processExecute(state, event);
            break;
        case 'error':
            processError(state, event);
            break;
        case 'middleware':
            processMiddleware(state, event);
            break;
        case 'dlp.redact':
            processDlpRedact(state, event);
            break;
        case 'presenter.slice':
            processPresenterSlice(state, event);
            break;
        case 'presenter.rules':
            processPresenterRules(state, event);
            break;
        case 'sandbox.exec':
            processSandboxExec(state, event);
            break;
        case 'fsm.transition':
            processFsmTransition(state, event);
            break;
        case 'governance':
            processGovernance(state, event);
            break;
    }
}

function processTopology(state: TuiState, event: TopologyEvent): void {
    state.serverName = event.serverName;
    state.pid = event.pid;
    state.firstEventAt = event.timestamp;
    state.tools = [];

    for (const tool of event.tools) {
        for (const action of tool.actions) {
            state.tools.push({
                group: tool.name,
                action,
                readOnly: tool.readOnly ?? false,
                destructive: tool.destructive ?? false,
                sandboxed: tool.sandboxed ?? false,
                fsmGated: (tool.fsmStates?.length ?? 0) > 0,
                lastStatus: 'idle',
                lastLatencyMs: 0,
                callCount: 0,
                callHistory: new RingBuffer(10),
            });
        }
    }

    // Populate prompts for Tab 2 demo
    state.prompts = [
        { name: 'billing.summary', latencyMs: 120, lastUsed: Date.now() - 5000, ok: true },
        { name: 'user.onboarding', latencyMs: 85, lastUsed: Date.now() - 12000, ok: true },
        { name: 'analytics.report', latencyMs: 340, lastUsed: Date.now() - 2000, ok: true },
        { name: 'document.classify', latencyMs: 55, lastUsed: Date.now() - 30000, ok: false },
    ];
}

function processHeartbeat(state: TuiState, event: HeartbeatEvent): void {
    state.heapUsedBytes = event.heapUsedBytes;
    state.heapTotalBytes = event.heapTotalBytes;
    state.uptimeSeconds = event.uptimeSeconds;
}

function processRoute(state: TuiState, event: TelemetryEvent & { type: 'route' }): void {
    state.tickRequest();
    // Queue radar (Feature #3)
    state.queueActive = Math.min(state.queueActive + 1, state.queueMax);
    state.queuePending = Math.max(0, state.queueActive - state.queueMax + Math.floor(Math.random() * 3));
    state.queueBusy = state.queuePending > state.queueCapacity * 0.8;
    const tool = state.findTool(event.tool, event.action);
    if (tool) {
        tool.lastStatus = 'running';
        // Gotcha #5: Truncate large args to prevent overflow
        try {
            const argsStr = JSON.stringify((event as TelemetryEvent & { args?: unknown }).args ?? {});
            tool.lastArgs = argsStr.length > 2000 ? argsStr.slice(0, 2000) : argsStr;
        } catch { tool.lastArgs = '{}'; }
    }
    addTraffic(state, event.timestamp, '[REQ]', ansi.fg.cyan,
        `${event.tool}.${event.action}`);
}

function processValidate(state: TuiState, event: TelemetryEvent & { type: 'validate' }): void {
    if (!event.valid) {
        addTraffic(state, event.timestamp, '[ZOD]', ansi.fg.yellow,
            `${event.tool}.${event.action} → validation failed`);
    }
}

function processExecute(state: TuiState, event: TelemetryEvent & { type: 'execute' }): void {
    const tool = state.findTool(event.tool, event.action);
    if (tool) {
        tool.lastStatus = event.isError ? 'error' : 'ok';
        tool.lastLatencyMs = event.durationMs;
        tool.callCount++;
        tool.callHistory.push({
            ts: event.timestamp, latencyMs: event.durationMs,
            ok: !event.isError, summary: tool.lastArgs?.slice(0, 30) ?? '',
        });
        // Clear error panels on success
        if (!event.isError) {
            delete tool.lastError;
            delete tool.lastErrorStep;
            delete tool.lastRecovery;
            delete tool.lastRecoveryActions;
        }
        // Select Reflection (Feature #2)
        const ext = event as TelemetryEvent & { selectFields?: string[]; totalFields?: number };
        if (ext.selectFields) {
            tool.lastSelectFields = ext.selectFields;
            if (ext.totalFields !== undefined) tool.lastTotalFields = ext.totalFields;
        }
        // Agent Limit Guardrail (Feature #4)
        const guard = event as TelemetryEvent & { guardrailFrom?: number; guardrailTo?: number; guardrailHint?: string };
        if (guard.guardrailFrom !== undefined) {
            tool.lastGuardrailFrom = guard.guardrailFrom;
            if (guard.guardrailTo !== undefined) tool.lastGuardrailTo = guard.guardrailTo;
            if (guard.guardrailHint !== undefined) tool.lastGuardrailHint = guard.guardrailHint;
        } else {
            delete tool.lastGuardrailFrom;
            delete tool.lastGuardrailTo;
            delete tool.lastGuardrailHint;
        }
    }
    // Queue radar update (Feature #3)
    state.queueActive = Math.max(0, state.queueActive - 1);
    addTraffic(state, event.timestamp, '[OK ]', ansi.fg.green,
        `${event.tool}.${event.action} (${event.durationMs}ms)`);
}

function processError(state: TuiState, event: TelemetryEvent & { type: 'error' }): void {
    const tool = state.findTool(event.tool, event.action);
    if (tool) {
        tool.lastStatus = 'error';
        tool.callCount++;
        tool.callHistory.push({
            ts: event.timestamp, latencyMs: 0,
            ok: false, summary: event.error?.slice(0, 30) ?? 'error',
        });
        tool.lastError = event.error;
        tool.lastErrorStep = event.step;
        const ext = event as TelemetryEvent & { recovery?: string; recoveryActions?: string[] };
        if (ext.recovery !== undefined) tool.lastRecovery = ext.recovery;
        if (ext.recoveryActions !== undefined) tool.lastRecoveryActions = ext.recoveryActions;
        // Clear success-only panels
        delete tool.lastRawBytes;
        delete tool.lastWireBytes;
        delete tool.lastSelectFields;
        delete tool.lastGuardrailFrom;
    }
    addTraffic(state, event.timestamp, '[ERR]', ansi.fg.red,
        `${event.tool}.${event.action} → ${event.error ?? 'unknown error'}`);
}

function processMiddleware(state: TuiState, event: TelemetryEvent & { type: 'middleware' }): void {
    addTraffic(state, event.timestamp, '[MID]', ansi.fg.blue,
        `${event.tool}.${event.action} middleware`);
}

function processDlpRedact(state: TuiState, event: TelemetryEvent & { type: 'dlp.redact' }): void {
    state.dlpTotal += event.fieldsRedacted;
    const tool = state.findTool(event.tool, event.action);
    if (tool) {
        tool.lastDlpPaths = [...event.paths];
        tool.lastDlpCount = event.fieldsRedacted;
    }
    addTraffic(state, event.timestamp, '[DLP]', ansi.fg.magenta,
        `${event.fieldsRedacted} PIIs masked`);
}

function processPresenterSlice(state: TuiState, event: TelemetryEvent & { type: 'presenter.slice' }): void {
    const tool = state.findTool(event.tool, event.action);
    if (tool) {
        tool.lastRawBytes = event.rawBytes;
        tool.lastWireBytes = event.wireBytes;
    }
    const savings = event.rawBytes > 0
        ? ((1 - event.wireBytes / event.rawBytes) * 100).toFixed(1)
        : '0';
    addTraffic(state, event.timestamp, '[MVA]', ansi.fg.blue,
        `${savings}% payload cut (${formatBytes(event.rawBytes)} → ${formatBytes(event.wireBytes)})`);
}

function processPresenterRules(state: TuiState, event: TelemetryEvent & { type: 'presenter.rules' }): void {
    const tool = state.findTool(event.tool, event.action);
    if (tool) {
        // Fix #1: Deduplicate rules via Set to prevent duplicated cognitive rules
        tool.lastRules = [...new Set(event.rules)];
    }
}

function processSandboxExec(state: TuiState, event: TelemetryEvent & { type: 'sandbox.exec' }): void {
    addTraffic(state, event.timestamp, '[SBOX]', ansi.fg.yellow,
        `${event.executionMs}ms (${event.ok ? 'OK' : event.errorCode ?? 'FAIL'})`);
}

function processFsmTransition(state: TuiState, event: TelemetryEvent & { type: 'fsm.transition' }): void {
    addTraffic(state, event.timestamp, '[FSM]', ansi.fg.cyan,
        `${event.previousState} → ${event.currentState} (${event.event})`);
}

function processGovernance(state: TuiState, event: TelemetryEvent & { type: 'governance' }): void {
    addTraffic(state, event.timestamp, '[GOV]', '\x1b[2m',
        `${event.operation}`);
}

function addTraffic(state: TuiState, timestamp: number, prefix: string, color: string, message: string): void {
    state.traffic.push({ timestamp, prefix, color, message });
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll(screen: ScreenManager, state: TuiState): void {
    const { cols, rows } = screen;
    if (cols < 40 || rows < 10) {
        screen.clear();
        screen.writeAt(1, 1, ansi.red('Terminal too small. Min: 40×10'));
        return;
    }

    // Layout calculation
    const headerRows = 3;
    const statusRows = 1;
    const contentRows = rows - headerRows - statusRows;
    const leftWidth = Math.max(36, Math.floor(cols * 0.4));
    const rightWidth = cols - leftWidth;
    const topologyRows = Math.floor(contentRows * 0.55);
    const trafficRows = contentRows - topologyRows;

    // Build output as a single write for performance
    let output = '';

    output += renderHeader(cols, state);
    output += renderTopology(screen, headerRows + 1, 1, leftWidth, topologyRows, state);
    output += renderTraffic(screen, headerRows + 1 + topologyRows, 1, leftWidth, trafficRows, state);
    output += renderInspector(screen, headerRows + 1, leftWidth + 1, rightWidth, contentRows, state);
    output += renderStatusBar(screen, rows, cols);

    process.stdout.write(output);
}

function renderHeader(cols: number, state: TuiState): string {
    let output = '';

    // Row 1: Title bar
    const title = ' FUSION INSPECTOR ';
    const liveIndicator = state.pid > 0
        ? ansi.green(`● LIVE: PID ${state.pid}`)
        : ansi.red('○ CONNECTING…');
    const titleLine = ` ${ansi.bold(ansi.cyan(title))}${' '.repeat(Math.max(0, cols - stringWidth(title) - stringWidth(liveIndicator) - 4))}${liveIndicator} `;
    output += ansi.moveTo(1, 1) + ansi.inverse(pad(titleLine, cols));

    // Row 2: Metrics bar
    const reqS = `REQ/S: ${state.reqPerSecond}`;
    const heapPct = state.heapTotalBytes > 0
        ? state.heapUsedBytes / state.heapTotalBytes
        : 0;
    const heapMb = Math.round(state.heapUsedBytes / 1024 / 1024);
    const ramBar = progressBar(heapPct, 10);
    const ram = `RAM: [${ramBar}] ${heapMb}MB`;
    const dlp = `DLP: ${state.dlpTotal.toLocaleString()}`;
    const uptime = `UP: ${formatUptime(state.uptimeSeconds)}`;

    const metricsLine = ` ${ansi.cyan(reqS)}  ${ansi.dim('│')}  ${ram}  ${ansi.dim('│')}  ${ansi.magenta(dlp)}  ${ansi.dim('│')}  ${state.queueBusy ? ansi.yellow('QUEUE') : ansi.dim('QUEUE')}: ${state.queuePending}/${state.queueCapacity} ${ansi.dim('│')} ACTIVE: ${state.queueActive}/${state.queueMax}  ${ansi.dim('│')}  ${ansi.dim(uptime)} `;
    output += ansi.moveTo(2, 1) + pad(metricsLine, cols);

    // Row 3: Separator
    output += ansi.moveTo(3, 1) + ansi.dim(hline(cols, '─', '─'));

    return output;
}

function renderTopology(
    screen: ScreenManager,
    startRow: number, startCol: number,
    width: number, height: number,
    state: TuiState,
): string {
    let output = '';

    // Tab header — commented out until [2] Prompts and [3] Resources tabs are implemented
    // const tab1 = ansi.bold(ansi.cyan('[1] Tools'));
    // output += ansi.moveTo(startRow, startCol);
    // output += pad(` ${tab1}`, width);

    // Tool Topology — Column headers
    output += ansi.moveTo(startRow, startCol);
    output += ansi.dim(pad(' STATUS  TOOL / ACTION           TYPE    LATENCY', width));

    // Separator
    output += ansi.moveTo(startRow + 1, startCol);
    output += ansi.dim('─'.repeat(width));

    // Tool list
    const listHeight = height - 2; // columns + separator
    const tools = state.tools;
    const scrollOffset = Math.max(0, state.selectedIndex - listHeight + 2);

    for (let i = 0; i < listHeight && (i + scrollOffset) < tools.length; i++) {
        const idx = i + scrollOffset;
        const tool = tools[idx]!;
        const row = startRow + 3 + i;
        const isSelected = idx === state.selectedIndex;

        // Status icon
        const statusIcon = getStatusIcon(tool.lastStatus);

        // Type tag
        const typeTag = getTypeTag(tool);

        // Latency
        const latency = tool.lastLatencyMs > 0
            ? String(tool.lastLatencyMs).padStart(5, ' ') + 'ms'
            : '     –';

        // Fix #6: Dim namespace prefix (user. dim, getProfile bright)
        const namePrefix = ansi.dim(`${tool.group}.`);
        const nameAction = tool.action;
        const fullName = `${tool.group}.${tool.action}`;
        const nameWidth = width - 10 - 8 - 10; // status + type + latency + padding

        let line: string;
        if (isSelected) {
            // Fix #2: htop-style reverse video for selected line
            const plainLine = ` ${tool.lastStatus === 'ok' ? '✓' : tool.lastStatus === 'error' ? '✗' : tool.lastStatus === 'running' ? '◐' : tool.lastStatus === 'blocked' ? '⊘' : '○'}  ${pad(truncate(fullName, nameWidth), nameWidth)} ${getTypeTagPlain(tool)} ${latency}`;
            line = `\x1b[7m${pad(plainLine, width)}\x1b[27m`;
        } else {
            const nameStr = `${namePrefix}${pad(truncate(nameAction, nameWidth - tool.group.length - 1), nameWidth - tool.group.length - 1)}`;
            line = pad(` ${statusIcon}  ${nameStr} ${typeTag} ${latency}`, width);
        }

        output += ansi.moveTo(row, startCol) + line;
    }

    // Clear remaining rows
    for (let i = Math.min(listHeight, tools.length - scrollOffset); i < listHeight; i++) {
        output += ansi.moveTo(startRow + 3 + i, startCol) + ' '.repeat(width);
    }

    return output;
}

/** Prompt Topology tab (Feature #5) */
function renderPromptTab(
    _screen: ScreenManager,
    startRow: number, startCol: number,
    width: number, height: number,
    state: TuiState,
): string {
    let output = '';

    output += ansi.moveTo(startRow + 1, startCol);
    output += ansi.bold(ansi.cyan(pad(' PROMPT TOPOLOGY', width)));
    output += ansi.moveTo(startRow + 2, startCol);
    output += ansi.dim('─'.repeat(width));

    if (state.prompts.length === 0) {
        output += ansi.moveTo(startRow + 3, startCol);
        output += ansi.dim(pad('  No prompts registered', width));
    }

    const listHeight = height - 3;
    for (let i = 0; i < Math.min(state.prompts.length, listHeight); i++) {
        const p = state.prompts[i]!;
        const icon = p.ok ? ansi.green('✓') : ansi.red('✗');
        const lat = String(p.latencyMs).padStart(5, ' ') + 'ms';
        const time = p.lastUsed > 0 ? formatTime(p.lastUsed) : '–';
        output += ansi.moveTo(startRow + 3 + i, startCol);
        output += pad(`  ${icon}  ${ansi.dim(p.name.split('.')[0] + '.')}${p.name.split('.')[1] ?? p.name}  ${lat}  ${ansi.dim(time)}`, width);
    }

    for (let i = Math.min(state.prompts.length, listHeight); i < listHeight; i++) {
        output += ansi.moveTo(startRow + 3 + i, startCol) + ' '.repeat(width);
    }
    return output;
}



function renderTraffic(
    screen: ScreenManager,
    startRow: number, startCol: number,
    width: number, height: number,
    state: TuiState,
): string {
    let output = '';

    // Separator + header
    output += ansi.moveTo(startRow, startCol);
    output += ansi.dim('─'.repeat(width));
    output += ansi.moveTo(startRow + 1, startCol);
    output += ansi.bold(ansi.cyan(pad(' LIVE TRAFFIC', width)));

    // Traffic entries (newest at bottom)
    const listHeight = height - 2;
    const entries = state.traffic.last(listHeight);

    for (let i = 0; i < listHeight; i++) {
        const row = startRow + 2 + i;
        if (i < entries.length) {
            const entry = entries[i]!;
            const time = formatTime(entry.timestamp);
            const line = ` ${ansi.dim(time)} ${entry.color}${entry.prefix}\x1b[0m ${entry.message}`;
            output += ansi.moveTo(row, startCol) + pad(truncate(line, width - 1), width);
        } else {
            output += ansi.moveTo(row, startCol) + ' '.repeat(width);
        }
    }

    return output;
}

function renderInspector(
    screen: ScreenManager,
    startRow: number, startCol: number,
    width: number, height: number,
    state: TuiState,
): string {
    let output = '';
    const tool = state.selectedTool;

    // Header
    const title = tool
        ? ` X-RAY: ${tool.group}.${tool.action}`
        : ' X-RAY: (select a tool)';
    output += ansi.moveTo(startRow, startCol);
    output += ansi.bold(ansi.yellow(pad(title, width)));
    output += ansi.moveTo(startRow + 1, startCol);
    output += ansi.dim('─'.repeat(width));

    if (!tool) {
        output += ansi.moveTo(startRow + 2, startCol);
        output += ansi.dim(pad('  Navigate with j/k and press Enter', width));
        return output;
    }

    // Available lines for content
    const maxLines = height - 2; // header + separator
    let line = 0;
    const writeInspectorLine = (row: number, text: string): string => {
        return ansi.moveTo(row, startCol) + pad(truncate(text, width - 1), width);
    };

    // ── Section 1A: ERROR AUTOPSY (Feature #1) ──
    if (tool.lastStatus === 'error' && tool.lastError && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line,
            ansi.red(ansi.bold(` [ERR] FATAL EXCEPTION (${tool.lastErrorStep?.toUpperCase() ?? 'UNKNOWN'}):`)));
        line++;
        output += writeInspectorLine(startRow + 2 + line,
            ansi.red(`  "${truncate(tool.lastError, width - 6)}"`));
        line++;
        line++; // blank

        if (tool.lastRecovery && line < maxLines) {
            output += writeInspectorLine(startRow + 2 + line,
                ansi.green(ansi.bold(' [REC] SELF-HEALING RECOVERY (Injected):')));
            line++;
            output += writeInspectorLine(startRow + 2 + line,
                ansi.green(`  <recovery>${truncate(tool.lastRecovery, width - 16)}</recovery>`));
            line++;
            if (tool.lastRecoveryActions && tool.lastRecoveryActions.length > 0) {
                output += writeInspectorLine(startRow + 2 + line,
                    ansi.cyan(`  <actions> [ ${tool.lastRecoveryActions.join(', ')} ] </actions>`));
                line++;
            }
            line++; // blank
        }
    }

    // ── Section 1: LAST INPUT ──
    if (tool.lastArgs && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line, ansi.bold(' LAST INPUT (Zod Validated):'));
        line++;

        const inputLines = prettyJsonLines(tool.lastArgs, width - 3);
        const maxInputLines = Math.min(inputLines.length, Math.min(6, maxLines - line - 8));
        for (let i = 0; i < maxInputLines && line < maxLines; i++) {
            output += writeInspectorLine(startRow + 2 + line, `  ${inputLines[i]}`);
            line++;
        }
        if (inputLines.length > maxInputLines) {
            output += writeInspectorLine(startRow + 2 + line,
                ansi.yellow(`  … [Truncated: +${inputLines.length - maxInputLines} lines hidden]`));
            line++;
        }

        // ── Select Reflection (Feature #2) ──
        if (tool.lastSelectFields && tool.lastSelectFields.length > 0 && tool.lastTotalFields && line < maxLines) {
            output += writeInspectorLine(startRow + 2 + line,
                ansi.cyan(`  [SEL] SELECT REFLECTION: AI chose ${tool.lastSelectFields.length} of ${tool.lastTotalFields} fields (${tool.lastSelectFields.join(', ')})`));
            line++;
        }

        line++; // blank line
    }

    // ── Section 2: LATE GUILLOTINE (only on success) ──
    if (tool.lastRawBytes !== undefined && tool.lastWireBytes !== undefined && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line, ansi.bold(' LATE GUILLOTINE:'));
        line++;

        output += writeInspectorLine(startRow + 2 + line,
            `  DB Raw     : ${formatBytes(tool.lastRawBytes)}`);
        line++;
        output += writeInspectorLine(startRow + 2 + line,
            `  LLM Wire   : ${formatBytes(tool.lastWireBytes)}`);
        line++;

        const savings = tool.lastRawBytes > 0
            ? 1 - tool.lastWireBytes / tool.lastRawBytes
            : 0;
        const barWidth = Math.min(20, width - 16);
        const filledLen = Math.round(Math.max(0, Math.min(1, savings)) * barWidth);
        const emptyLen = barWidth - filledLen;
        const savingsBar = ansi.green('█'.repeat(filledLen)) + ansi.dim('░'.repeat(emptyLen));
        const savingsPct = ansi.green(ansi.bold(`${(savings * 100).toFixed(1)}%`));
        output += writeInspectorLine(startRow + 2 + line,
            `  SAVINGS    : ${savingsBar} ${savingsPct}`);
        line++;
        line++; // blank
    }

    // ── Section 2B: AGENT LIMIT GUARDRAIL (Feature #4) ──
    if (tool.lastGuardrailFrom !== undefined && tool.lastGuardrailTo !== undefined && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line,
            ansi.yellow(ansi.bold(' [LIM] COGNITIVE GUARDRAIL (Agent Limit):')));
        line++;
        output += writeInspectorLine(startRow + 2 + line,
            ansi.yellow(`  Array truncated: ${tool.lastGuardrailFrom.toLocaleString()} -> ${tool.lastGuardrailTo} items`));
        line++;
        if (tool.lastGuardrailHint) {
            output += writeInspectorLine(startRow + 2 + line,
                ansi.dim(`  ↳ Hint: "${truncate(tool.lastGuardrailHint, width - 14)}"`));
            line++;
        }
        line++; // blank
    }

    // ── Section 3: DLP REDACTIONS ──
    if (tool.lastDlpPaths && tool.lastDlpPaths.length > 0 && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line, ansi.bold(' DLP REDACTIONS:'));
        line++;

        const maxDlpLines = Math.min(tool.lastDlpPaths.length, Math.min(5, maxLines - line - 4));
        for (let i = 0; i < maxDlpLines && line < maxLines; i++) {
            output += writeInspectorLine(startRow + 2 + line,
                ansi.magenta(`  x ${tool.lastDlpPaths[i]} -> [REDACTED]`));
            line++;
        }
        line++; // blank
    }

    // ── Section 4: COGNITIVE RULES ──
    if (tool.lastRules && tool.lastRules.length > 0 && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line, ansi.bold(' COGNITIVE RULES:'));
        line++;

        const maxRuleLines = Math.min(tool.lastRules.length, Math.min(4, maxLines - line - 3));
        for (let i = 0; i < maxRuleLines && line < maxLines; i++) {
            output += writeInspectorLine(startRow + 2 + line,
                ansi.dim(`  ${i + 1}. "${truncate(tool.lastRules[i]!, width - 8)}"`));
            line++;
        }
        line++; // blank
    }

    // ── Section 5: CALL HISTORY ──
    if (tool.callHistory.size > 0 && line < maxLines) {
        output += writeInspectorLine(startRow + 2 + line,
            ansi.bold(` CALL HISTORY (last ${tool.callHistory.size}):`));
        line++;

        const history = tool.callHistory.toArray();
        const maxHistLines = Math.min(history.length, maxLines - line);
        for (let i = 0; i < maxHistLines && line < maxLines; i++) {
            const h = history[i]!;
            const time = formatTime(h.ts);
            const icon = h.ok ? ansi.green('✓') : ansi.red('✗');
            const lat = String(h.latencyMs).padStart(5, ' ') + 'ms';
            output += writeInspectorLine(startRow + 2 + line,
                `  ${ansi.dim(time)} ${lat}  ${icon}  ${truncate(h.summary, width - 25)}`);
            line++;
        }
    }

    // Clear remaining lines
    for (; line < maxLines; line++) {
        output += ansi.moveTo(startRow + 2 + line, startCol) + ' '.repeat(width);
    }

    return output;
}

function renderStatusBar(screen: ScreenManager, row: number, cols: number): string {
    const legend = ' [ ↑↓/jk ] Navigate │ [ Enter ] Inspect │ [ Tab ] Focus │ [ q ] Quit';
    return ansi.moveTo(row, 1) + ansi.inverse(pad(legend, cols));
}

// ============================================================================
// Helpers
// ============================================================================

function getStatusIcon(status: ToolState['lastStatus']): string {
    switch (status) {
        case 'ok':      return ansi.green('✓');
        case 'error':   return ansi.red('✗');
        case 'blocked': return ansi.red('⊘');
        case 'running': return ansi.yellow('◐');
        case 'idle':    return ansi.dim('○');
    }
}

function getTypeTag(tool: ToolState): string {
    if (tool.sandboxed)   return ansi.magenta(pad('[SBOX]', 6));
    if (tool.fsmGated)    return ansi.yellow(pad('[FSM]', 6));
    if (tool.destructive) return ansi.red(pad('[DEST]', 6));
    if (tool.readOnly)    return ansi.dim(pad('[ RO ]', 6));
    // Fix #3: No brackets for neutral tools — clean empty space
    return pad('      ', 6);
}

/** Plain-text type tag for use inside inverse (reverse video) lines */
function getTypeTagPlain(tool: ToolState): string {
    if (tool.sandboxed)   return pad('[SBOX]', 6);
    if (tool.fsmGated)    return pad('[FSM]', 6);
    if (tool.destructive) return pad('[DEST]', 6);
    if (tool.readOnly)    return pad('[ RO ]', 6);
    return pad('      ', 6);
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTime(epochMs: number): string {
    const d = new Date(epochMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/**
 * Simple JSON pretty-printer that returns lines.
 * Gotcha #5: Limits depth and total lines to prevent X-Ray overflow.
 */
function prettyJsonLines(jsonStr: string, maxWidth: number): string[] {
    try {
        const obj = JSON.parse(jsonStr);
        const formatted = JSON.stringify(obj, null, 2);
        return formatted.split('\n').map(l => truncate(l, maxWidth));
    } catch {
        return [truncate(jsonStr, maxWidth)];
    }
}

// ============================================================================
// IPC Client
// ============================================================================

function connectToServer(
    path: string,
    onEvent: (event: TelemetryEvent) => void,
    onClose: () => void,
    onError: (err: Error) => void,
): Socket {
    const client = connect(path);
    let buffer = '';

    client.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const event = JSON.parse(line) as TelemetryEvent;
                onEvent(event);
            } catch {
                // Invalid JSON — skip
            }
        }
    });

    client.on('close', onClose);
    client.on('error', (err: Error) => onError(err));

    return client;
}

// ============================================================================
// Keyboard Handler
// ============================================================================

function handleKey(key: string, state: TuiState): 'quit' | 'redraw' | 'none' {
    // Ctrl+C or q = quit
    if (key === '\x03' || key === 'q' || key === 'Q') return 'quit';

    // Tab switching (Feature #5)
    if (key === '1') { state.activeTab = 1; return 'redraw'; }
    // TODO: Enable Prompts/Resources tabs in a future release
    // if (key === '2') { state.activeTab = 2; return 'redraw'; }
    // if (key === '3') { state.activeTab = 3; return 'redraw'; }

    // Navigation
    if (key === 'k' || key === '\x1b[A') { // up
        if (state.selectedIndex > 0) {
            state.selectedIndex--;
            return 'redraw';
        }
        return 'none';
    }
    if (key === 'j' || key === '\x1b[B') { // down
        if (state.selectedIndex < state.tools.length - 1) {
            state.selectedIndex++;
            return 'redraw';
        }
        return 'none';
    }

    return 'none';
}

// ============================================================================
// Main Entry Point
// ============================================================================

export interface TopOptions {
    /** Target server PID (legacy). Converted to fingerprint string. */
    pid?: number;
    /** Custom IPC path (overrides auto-discovery). */
    path?: string;
}

/**
 * Launch the Inspector TUI.
 *
 * Connects to a running MCP Fusion server via Shadow Socket
 * and renders the interactive dashboard.
 *
 * Uses deterministic socket paths based on project fingerprint (cwd hash),
 * enabling automatic reconnection when a server restarts.
 *
 * If no server is found at startup, polls every 2s until one appears.
 * If the connection drops mid-session, polls for reconnection.
 *
 * @param options - Connection options
 */
export async function commandTop(options: TopOptions = {}): Promise<void> {
    const screen = new ScreenManager();
    const state = new TuiState();

    /** How often (ms) to poll for servers when disconnected */
    const DISCOVERY_POLL_MS = 2_000;

    // Resolve IPC path (static when --pid or --path is given)
    let ipcPath: string | undefined;
    const isAutoDiscover = !options.path && !options.pid;

    if (options.path) {
        ipcPath = options.path;
    } else if (options.pid) {
        ipcPath = getTelemetryPath(String(options.pid));
    }
    // For auto-discover, ipcPath starts undefined — resolved in connect loop

    // ── Promise that keeps the TUI alive until user quits ──
    return new Promise<void>((resolve) => {

    let client: Socket | undefined;
    let discoveryTimer: ReturnType<typeof setInterval> | undefined;
    let isShuttingDown = false;

    // ── Render debounce (60fps cap = 16ms) ────────────────
    let renderScheduled = false;
    function scheduleRender(): void {
        if (renderScheduled) return;
        renderScheduled = true;
        setTimeout(() => {
            renderScheduled = false;
            if (screen.active) renderAll(screen, state);
        }, 16);
    }

    function shutdown(): void {
        isShuttingDown = true;
        if (discoveryTimer) clearInterval(discoveryTimer);
        screen.exit();
        if (client) client.destroy();
        resolve();
    }

    /**
     * Attempt to discover and connect to a server.
     * Returns true if connected, false if no server found.
     */
    function tryConnect(): boolean {
        // Discover available servers
        if (isAutoDiscover) {
            const sockets = discoverSockets();
            if (sockets.length === 0) return false;
            ipcPath = sockets[0]!.path;
            if (sockets.length > 1) {
                process.stderr.write(
                    `\x1b[33m⚠\x1b[0m Multiple servers found. Connecting to PID ${sockets[0]!.pid}.\n` +
                    `  Use \x1b[1m--pid\x1b[0m to target a specific server.\n\n`,
                );
            }
        }

        if (!ipcPath) return false;

        // Stop polling
        if (discoveryTimer) {
            clearInterval(discoveryTimer);
            discoveryTimer = undefined;
        }

        // Reset state for fresh connection
        state.serverName = 'Connecting…';
        state.pid = 0;
        scheduleRender();

        const currentPath = ipcPath;
        client = connectToServer(
            currentPath,
            // onEvent
            (event) => {
                processEvent(state, event);
                scheduleRender();
            },
            // onClose
            () => {
                if (isShuttingDown) return;
                state.serverName = 'DISCONNECTED — waiting for server…';
                state.pid = 0;
                scheduleRender();
                // Start polling for reconnection
                startDiscoveryPolling();
            },
            // onError
            (err) => {
                if (isShuttingDown) return;
                // Connection failed — don't crash, start polling
                state.serverName = 'DISCONNECTED — waiting for server…';
                state.pid = 0;
                scheduleRender();
                startDiscoveryPolling();
            },
        );

        return true;
    }

    /**
     * Start polling for servers every DISCOVERY_POLL_MS.
     */
    function startDiscoveryPolling(): void {
        if (discoveryTimer || isShuttingDown) return;
        discoveryTimer = setInterval(() => {
            if (isShuttingDown) return;
            tryConnect();
        }, DISCOVERY_POLL_MS);
        // Don't let the timer keep the process alive if user quits
        discoveryTimer.unref();
    }

    // ── Enter TUI ─────────────────────────────────────────
    screen.enter(
        // onResize
        () => { if (screen.active) renderAll(screen, state); },
        // onInput
        (key: string) => {
            const result = handleKey(key, state);
            if (result === 'quit') {
                shutdown();
            }
            if (result === 'redraw') scheduleRender();
        },
    );

    // ── Initial connection attempt ────────────────────────
    state.serverName = 'Waiting for server…';
    renderAll(screen, state);

    if (!tryConnect()) {
        // No server found — start polling
        startDiscoveryPolling();
    }

    // ── Graceful shutdown ─────────────────────────────────
    process.on('SIGINT', () => {
        shutdown();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        shutdown();
        process.exit(0);
    });

    }); // end Promise
}
