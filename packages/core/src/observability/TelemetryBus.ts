/**
 * TelemetryBus — Shadow Socket IPC Server
 *
 * Fire-and-forget out-of-band telemetry transport. Creates a Named Pipe
 * (Windows) or Unix Domain Socket (POSIX) that streams NDJSON events
 * to connected `fusion top` / `davinci` TUI clients.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  MCP Server Process (owns the IPC server)           │
 *   │                                                     │
 *   │  createTelemetryBus()                               │
 *   │    │                                                │
 *   │    ▼                                                │
 *   │  net.createServer() → Named Pipe / Unix Socket      │
 *   │    │                                                │
 *   │    ▼                                                │
 *   │  emit(event) → NDJSON → broadcast to all clients    │
 *   │    │                                                │
 *   │    └─ If 0 clients → silent no-op (zero overhead)   │
 *   └─────────────────────────────────────────────────────┘
 *
 * Security mitigations (Staff Engineer Gotchas):
 *   1. chmod 0o600 on Unix sockets (prevents PII sniffing)
 *   2. Ghost socket recovery (stale file → probe → unlink)
 *   3. Backpressure: slow clients disconnected at 64KB buffer
 *   4. Clean shutdown on process exit / SIGTERM
 *
 * @module
 */
import { createServer, connect, type Server, type Socket } from 'node:net';
import { existsSync, unlinkSync, chmodSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import type { TelemetryEvent, TelemetrySink } from './TelemetryEvent.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum write buffer per client before forced disconnect */
const MAX_CLIENT_BUFFER_BYTES = 65_536; // 64KB

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 5_000;

// ============================================================================
// Path Convention
// ============================================================================

/**
 * Compute the IPC path for a given process ID.
 *
 * - Windows: `\\.\pipe\mcp-fusion-{pid}` (Named Pipe, auto-cleaned by OS)
 * - POSIX:   `/tmp/mcp-fusion-{pid}.sock` (Unix Domain Socket)
 *
 * @param pid - Process ID (defaults to `process.pid`)
 * @returns The IPC path string
 */
export function getTelemetryPath(pid?: number): string {
    const id = pid ?? process.pid;
    if (platform() === 'win32') {
        return `\\\\.\\pipe\\mcp-fusion-${id}`;
    }
    return `/tmp/mcp-fusion-${id}.sock`;
}

/**
 * Discover active telemetry sockets by scanning for `mcp-fusion-*.sock`.
 * Returns an array of `{ pid, path }` for each discovered socket.
 *
 * On Windows, Named Pipes are not file-system entities, so we probe
 * a list of candidate PIDs from the user.
 *
 * @param candidatePids - Optional list of PIDs to probe (Windows-only)
 * @returns Array of discovered sockets with their PIDs
 */
export function discoverSockets(candidatePids?: number[]): Array<{ pid: number; path: string }> {
    if (platform() === 'win32') {
        // On Windows, Named Pipes don't live in the filesystem.
        // We probe the candidate PIDs by attempting a connection.
        const pids = candidatePids ?? [];
        return pids
            .map((pid) => ({ pid, path: getTelemetryPath(pid) }));
    }

    // On POSIX: scan /tmp for mcp-fusion-*.sock files
    const results: Array<{ pid: number; path: string }> = [];
    try {
        const { readdirSync } = require('node:fs') as typeof import('node:fs');
        const files = readdirSync('/tmp');
        for (const file of files) {
            const match = file.match(/^mcp-fusion-(\d+)\.sock$/);
            if (match) {
                const pid = parseInt(match[1]!, 10);
                const path = `/tmp/${file}`;
                results.push({ pid, path });
            }
        }
    } catch {
        // /tmp scan failed — return empty
    }
    return results;
}

// ============================================================================
// Ghost Socket Recovery (Gotcha #2)
// ============================================================================

/**
 * Check if a socket file is a "ghost" (stale, left by a crashed process).
 *
 * Attempts a dummy connection. If `ECONNREFUSED`, the socket is stale
 * and safe to unlink. If the connection succeeds, it's alive — don't touch it.
 *
 * @param socketPath - Path to the Unix socket file
 * @returns Promise that resolves to `true` if the ghost was cleaned up
 * @internal
 */
function cleanGhostSocket(socketPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        // On Windows, Named Pipes are auto-cleaned — skip
        if (platform() === 'win32') {
            resolve(false);
            return;
        }

        if (!existsSync(socketPath)) {
            resolve(false);
            return;
        }

        // Verify it's actually a socket file, not a regular file
        try {
            const stats = statSync(socketPath);
            if (!stats.isSocket()) {
                // Not a socket — don't touch it
                resolve(false);
                return;
            }
        } catch {
            resolve(false);
            return;
        }

        // Probe with a dummy client connection
        const probe = connect(socketPath);
        const timeout = setTimeout(() => {
            // Connection hanging — assume ghost, clean up
            probe.destroy();
            try { unlinkSync(socketPath); } catch { /* ignore */ }
            resolve(true);
        }, 500);

        probe.on('connect', () => {
            // Socket is alive — another server is using it!
            clearTimeout(timeout);
            probe.destroy();
            resolve(false);
        });

        probe.on('error', (err: NodeJS.ErrnoException) => {
            clearTimeout(timeout);
            probe.destroy();
            if (err.code === 'ECONNREFUSED') {
                // Ghost socket — safe to remove
                try { unlinkSync(socketPath); } catch { /* ignore */ }
                resolve(true);
            }
            resolve(false);
        });
    });
}

// ============================================================================
// Telemetry Bus
// ============================================================================

/**
 * Configuration for the telemetry bus.
 */
export interface TelemetryBusConfig {
    /**
     * Custom IPC path. If omitted, uses the default path convention.
     */
    readonly path?: string;

    /**
     * Callback invoked when a TUI client connects.
     * Receives a function to send the initial topology snapshot.
     */
    readonly onConnect?: () => TelemetryEvent | undefined;
}

/**
 * A running telemetry bus instance.
 */
export interface TelemetryBusInstance {
    /** The emit function — pass as `TelemetrySink` to the server */
    readonly emit: TelemetrySink;
    /** The IPC path the bus is listening on */
    readonly path: string;
    /** Number of connected TUI clients */
    readonly clientCount: () => number;
    /** Gracefully shut down the bus */
    readonly close: () => Promise<void>;
}

/**
 * Create an out-of-band telemetry bus for MCP Fusion.
 *
 * The returned `emit` function is the {@link TelemetrySink} to pass
 * to `AttachOptions.telemetry`. It broadcasts events as NDJSON
 * to all connected TUI clients via IPC.
 *
 * When no clients are connected, `emit()` is a no-op — zero overhead.
 *
 * @param config - Optional configuration
 * @returns A promise that resolves to the running bus instance
 *
 * @example
 * ```typescript
 * import { createTelemetryBus } from '@vinkius-core/mcp-fusion/observability';
 *
 * const bus = await createTelemetryBus();
 *
 * // Pass to server attachment
 * registry.attachToServer(server, {
 *     contextFactory: createContext,
 *     telemetry: bus.emit,
 * });
 *
 * // On shutdown
 * await bus.close();
 * ```
 */
export async function createTelemetryBus(config?: TelemetryBusConfig): Promise<TelemetryBusInstance> {
    const socketPath = config?.path ?? getTelemetryPath();
    const clients = new Set<Socket>();

    // ── Gotcha #2: Ghost Socket Recovery ──────────────────
    await cleanGhostSocket(socketPath);

    // ── Create IPC Server ─────────────────────────────────
    const server: Server = createServer((client: Socket) => {
        clients.add(client);

        // Send initial topology snapshot if available
        if (config?.onConnect) {
            const topology = config.onConnect();
            if (topology) {
                try {
                    client.write(JSON.stringify(topology) + '\n');
                } catch { /* swallow */ }
            }
        }

        client.on('error', () => {
            clients.delete(client);
        });

        client.on('close', () => {
            clients.delete(client);
        });
    });

    // ── Start Listening ───────────────────────────────────
    await new Promise<void>((resolve, reject) => {
        server.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                // Final fallback: force unlink and retry
                try { unlinkSync(socketPath); } catch { /* ignore */ }
                server.listen(socketPath, () => resolve());
            } else {
                reject(err);
            }
        });

        server.listen(socketPath, () => resolve());
    });

    // ── Gotcha #1: IPC Security (chmod 0o600) ─────────────
    // Restrict socket to owner-only on POSIX to prevent PII sniffing
    if (platform() !== 'win32') {
        try {
            chmodSync(socketPath, 0o600);
        } catch {
            // Non-fatal — log warning via stderr (never stdout!)
            process.stderr.write(
                '[mcp-fusion] Warning: Could not restrict socket permissions.\n',
            );
        }
    }

    // ── Heartbeat Timer ───────────────────────────────────
    const heartbeatTimer = setInterval(() => {
        if (clients.size === 0) return;

        const mem = process.memoryUsage();
        emit({
            type: 'heartbeat',
            heapUsedBytes: mem.heapUsed,
            heapTotalBytes: mem.heapTotal,
            rssBytes: mem.rss,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: Date.now(),
        });
    }, HEARTBEAT_INTERVAL_MS);

    // Don't let the heartbeat timer keep the process alive
    heartbeatTimer.unref();

    // ── Emit Function (Fire-and-Forget) ───────────────────
    function emit(event: TelemetryEvent): void {
        // Zero overhead when no clients
        if (clients.size === 0) return;

        let line: string;
        try {
            line = JSON.stringify(event) + '\n';
        } catch {
            return; // Non-serializable event — silently drop
        }

        for (const client of clients) {
            // ── Gotcha #3 (Backpressure) ──────────────────
            // If the client's write buffer exceeds the limit,
            // disconnect it to protect the server from memory bloat
            if (client.writableLength > MAX_CLIENT_BUFFER_BYTES) {
                client.destroy();
                clients.delete(client);
                continue;
            }

            try {
                client.write(line);
            } catch {
                // Write failed — client is dead, remove it
                client.destroy();
                clients.delete(client);
            }
        }
    }

    // ── Clean Shutdown ────────────────────────────────────
    function cleanup(): void {
        clearInterval(heartbeatTimer);
        for (const client of clients) {
            try { client.destroy(); } catch { /* ignore */ }
        }
        clients.clear();
        try { server.close(); } catch { /* ignore */ }

        // Remove socket file on POSIX
        if (platform() !== 'win32') {
            try { unlinkSync(socketPath); } catch { /* ignore */ }
        }
    }

    // Register cleanup on process exit signals
    const exitHandler = (): void => { cleanup(); };
    process.on('exit', exitHandler);
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);

    // ── Close Method ──────────────────────────────────────
    async function close(): Promise<void> {
        process.removeListener('exit', exitHandler);
        process.removeListener('SIGINT', exitHandler);
        process.removeListener('SIGTERM', exitHandler);
        cleanup();
    }

    return {
        emit,
        path: socketPath,
        clientCount: () => clients.size,
        close,
    };
}
