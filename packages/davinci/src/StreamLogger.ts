/**
 * StreamLogger — Headless Telemetry Output for Non-TTY Environments
 *
 * When running in ECS, K8s, CI/CD, or any environment without a TTY,
 * this module provides structured log output to stderr instead of the
 * interactive TUI. Events are formatted as human-readable, timestamped
 * log lines compatible with CloudWatch, Datadog, and journald.
 *
 * Features:
 *   - **Trace ID**: Short hex correlator (e.g., [a7b9]) for isolating
 *     a single request lifecycle across concurrent log streams.
 *   - **JSON mode**: Set `FUSION_LOG_FORMAT=json` for structured NDJSON
 *     output that CloudWatch/Datadog/ELK ingest natively.
 *
 * Usage:
 *   fusion dv --out stderr
 *   fusion dv --out stderr --demo
 *   FUSION_LOG_FORMAT=json fusion dv --out stderr --demo
 *
 * @module
 */
import * as net from 'node:net';
import {
    getTelemetryPath, discoverSockets,
    type TelemetryEvent,
} from '@vinkius-core/mcp-fusion';

// ============================================================================
// ANSI (minimal — respects NO_COLOR)
// ============================================================================

const useColor = !process.env['NO_COLOR'] && process.stderr.isTTY !== false;
const useJsonFormat = process.env['FUSION_LOG_FORMAT'] === 'json';
const c = {
    reset: useColor ? '\x1b[0m' : '',
    dim: useColor ? '\x1b[2m' : '',
    bold: useColor ? '\x1b[1m' : '',
    cyan: useColor ? '\x1b[36m' : '',
    green: useColor ? '\x1b[32m' : '',
    yellow: useColor ? '\x1b[33m' : '',
    red: useColor ? '\x1b[31m' : '',
    magenta: useColor ? '\x1b[35m' : '',
    blue: useColor ? '\x1b[34m' : '',
};

function ts(): string {
    return `${c.dim}${new Date().toISOString()}${c.reset}`;
}

function tag(label: string, color: string): string {
    return `${color}[${label}]${c.reset}`;
}

/**
 * Extract traceId prefix for log lines.
 * Returns `[a7b9] ` if present, empty string otherwise.
 */
function tracePrefix(event: { traceId?: string }): string {
    if (!event.traceId) return '';
    return `${c.dim}[${event.traceId}]${c.reset} `;
}

// ============================================================================
// Event Formatter (matches TelemetryEvent union exactly)
// ============================================================================

export function formatEvent(event: TelemetryEvent): string {
    switch (event.type) {
        // ── DebugEvent types ──
        case 'route':
            return `${ts()} ${tag(' REQ', c.cyan)} ${tracePrefix(event)}${c.bold}${event.tool}.${event.action}${c.reset}`;

        case 'validate': {
            const status = event.valid
                ? `${c.green}✓${c.reset}`
                : `${c.red}✗ ${event.error ?? 'invalid'}${c.reset}`;
            return `${ts()} ${tag(' ZOD', c.yellow)} ${tracePrefix(event)}${event.tool}.${event.action} ${status} ${c.dim}${event.durationMs}ms${c.reset}`;
        }

        case 'middleware':
            return `${ts()} ${tag(' MID', c.blue)} ${tracePrefix(event)}${event.tool}.${event.action} chain=${event.chainLength}`;

        case 'execute': {
            const icon = event.isError ? `${c.red}✗` : `${c.green}✓`;
            return `${ts()} ${tag('EXEC', c.green)} ${tracePrefix(event)}${event.tool}.${event.action} ${icon}${c.reset} ${c.dim}${event.durationMs}ms${c.reset}`;
        }

        case 'error':
            return `${ts()} ${tag(' ERR', c.red)} ${tracePrefix(event)}${c.red}${event.tool}.${event.action} → ${event.error} [${event.step}]${c.reset}`;

        case 'governance': {
            const col = event.outcome === 'success' ? c.green : event.outcome === 'drift' ? c.yellow : c.red;
            return `${ts()} ${tag(' GOV', c.cyan)} ${event.operation}: ${event.label} ${col}${event.outcome}${c.reset} ${c.dim}${event.durationMs}ms${c.reset}`;
        }

        // ── Domain telemetry ──
        case 'topology':
            return `${ts()} ${tag('TOPO', c.cyan)} ${c.bold}${event.serverName}${c.reset} pid=${event.pid} tools=${event.tools.length}`;

        case 'heartbeat':
            return `${ts()} ${tag('BEAT', c.dim)} heap=${(event.heapUsedBytes / 1024 / 1024).toFixed(1)}MB rss=${(event.rssBytes / 1024 / 1024).toFixed(1)}MB up=${event.uptimeSeconds}s`;

        case 'dlp.redact':
            return `${ts()} ${tag(' DLP', c.magenta)} ${tracePrefix(event)}${event.tool}.${event.action} redacted=${event.fieldsRedacted} paths=[${event.paths.join(', ')}]`;

        case 'presenter.slice': {
            const savings = event.rawBytes > 0
                ? Math.round((1 - event.wireBytes / event.rawBytes) * 100)
                : 0;
            return `${ts()} ${tag('PRES', c.yellow)} ${tracePrefix(event)}${event.tool}.${event.action} ${event.rawBytes}B → ${event.wireBytes}B (${c.green}-${savings}%${c.reset}) rows=${event.rowsRaw}→${event.rowsWire}`;
        }

        case 'presenter.rules':
            return `${ts()} ${tag('RULE', c.yellow)} ${tracePrefix(event)}${event.tool}.${event.action} rules=[${event.rules.join('; ')}]`;

        case 'sandbox.exec': {
            const status = event.ok
                ? `${c.green}ok${c.reset}`
                : `${c.red}${event.errorCode ?? 'fail'}${c.reset}`;
            return `${ts()} ${tag(' V8 ', c.blue)} ${status} ${c.dim}${event.executionMs}ms${c.reset}`;
        }

        case 'fsm.transition':
            return `${ts()} ${tag(' FSM', c.magenta)} ${event.previousState} → ${c.bold}${event.currentState}${c.reset} (${event.event}) visible=${event.toolsVisible}`;

        default:
            return `${ts()} ${tag('????', c.dim)} ${JSON.stringify(event).slice(0, 120)}`;
    }
}

// ============================================================================
// JSON Formatter (for FUSION_LOG_FORMAT=json)
// ============================================================================

/**
 * Map event types to human-readable log levels.
 */
function eventLevel(type: string): 'info' | 'warn' | 'error' {
    if (type === 'error') return 'error';
    if (type === 'governance') return 'warn';
    return 'info';
}

/**
 * Format a TelemetryEvent as a single NDJSON line.
 * Strips volatile fields and adds metadata for log ingestion.
 */
export function formatEventJson(event: TelemetryEvent): string {
    const base: Record<string, unknown> = {
        time: new Date(event.timestamp).toISOString(),
        level: eventLevel(event.type),
        event: event.type,
    };

    // Add traceId if present
    if ('traceId' in event && event['traceId']) {
        base['traceId'] = event['traceId'];
    }

    // Add all event-specific fields (except type and timestamp, already mapped)
    for (const [key, value] of Object.entries(event)) {
        if (key === 'type' || key === 'timestamp' || key === 'traceId') continue;
        base[key] = value;
    }

    return JSON.stringify(base);
}

// ============================================================================
// Stream Logger
// ============================================================================

export interface StreamLoggerOptions {
    path?: string;
    pid?: number;
}

export async function streamToStderr(options: StreamLoggerOptions = {}): Promise<void> {
    let ipcPath: string;

    if (options.path) {
        ipcPath = options.path;
    } else if (options.pid) {
        ipcPath = getTelemetryPath(options.pid);
    } else {
        const sockets = discoverSockets();
        if (sockets.length === 0) {
            process.stderr.write(
                `${c.red}✗${c.reset} No MCP Fusion servers found.\n` +
                `  Start a server with telemetry or use ${c.bold}--demo${c.reset}\n`,
            );
            process.exit(1);
        }
        ipcPath = sockets[0]!.path;
    }

    process.stderr.write(`${c.dim}Connecting to ${ipcPath}…${c.reset}\n`);

    return new Promise<void>((resolve, reject) => {
        let buffer = '';
        const client = net.createConnection(ipcPath);

        client.on('connect', () => {
            process.stderr.write(`${c.green}●${c.reset} Connected. Streaming events…\n\n`);
        });

        client.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop()!;

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line) as TelemetryEvent;
                    const formatted = useJsonFormat
                        ? formatEventJson(event)
                        : formatEvent(event);
                    process.stderr.write(formatted + '\n');
                } catch { /* skip malformed */ }
            }
        });

        client.on('error', (err) => {
            process.stderr.write(`${c.red}✗${c.reset} Connection error: ${err.message}\n`);
            reject(err);
        });

        client.on('close', () => {
            process.stderr.write(`\n${c.dim}Connection closed.${c.reset}\n`);
            resolve();
        });

        const shutdown = () => { client.destroy(); resolve(); };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    });
}
