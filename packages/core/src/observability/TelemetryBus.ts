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
import { existsSync, unlinkSync, chmodSync, statSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TelemetryEvent, TelemetrySink } from './TelemetryEvent.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum write buffer per client before forced disconnect */
const MAX_CLIENT_BUFFER_BYTES = 65_536; // 64KB

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 5_000;

/** Registry directory for cross-platform server discovery */
const REGISTRY_DIR = join(tmpdir(), 'mcp-fusion-registry');

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

// ============================================================================
// Registry File Helpers (Cross-Platform Discovery)
// ============================================================================

/**
 * Write a registry marker file so `discoverSockets()` can find this server.
 * Creates `{REGISTRY_DIR}/{pid}.json` with metadata.
 *
 * @param pid - Process ID
 * @param serverName - Optional server name for display
 * @internal
 */
function writeRegistryFile(pid: number, serverName?: string): void {
    try {
        mkdirSync(REGISTRY_DIR, { recursive: true });
        const data = JSON.stringify({
            pid,
            path: getTelemetryPath(pid),
            name: serverName,
            startedAt: Date.now(),
        });
        writeFileSync(join(REGISTRY_DIR, `${pid}.json`), data, 'utf8');
    } catch {
        // Non-fatal — discovery won't work but server still runs
    }
}

/**
 * Remove the registry marker file for a given PID.
 * @internal
 */
function removeRegistryFile(pid: number): void {
    try {
        unlinkSync(join(REGISTRY_DIR, `${pid}.json`));
    } catch {
        // File may not exist — ignore
    }
}

/**
 * Check if a process is still alive using signal 0 (probes without killing).
 * Works cross-platform (Windows, Mac, Linux).
 *
 * @param pid - Process ID to check
 * @returns `true` if the process exists, `false` if it's dead
 * @internal
 */
function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0); // Signal 0 = existence check, doesn't kill
        return true;
    } catch {
        return false; // ESRCH — process does not exist
    }
}

/**
 * Discover active telemetry sockets by scanning the registry directory.
 * Works on Windows, Mac, and Linux.
 *
 * Reads `{REGISTRY_DIR}/*.json` marker files written by running servers.
 * Each file contains `{ pid, path }`. Stale files from crashed processes
 * (e.g. SIGKILL where cleanup handlers never run) are detected via PID
 * probing and automatically cleaned up.
 *
 * @returns Array of discovered sockets with their PIDs
 */
export function discoverSockets(): Array<{ pid: number; path: string }> {
    const results: Array<{ pid: number; path: string }> = [];

    // ── Primary: scan registry directory (all platforms) ────
    try {
        const files = readdirSync(REGISTRY_DIR);
        for (const file of files) {
            const match = file.match(/^(\d+)\.json$/);
            if (!match) continue;

            try {
                const raw = readFileSync(join(REGISTRY_DIR, file), 'utf8');
                const entry = JSON.parse(raw) as { pid: number; path: string };

                // ── Stale PID check ──────────────────────────
                // If the process is dead (e.g. SIGKILL'd), the registry
                // file is orphaned — remove it and skip.
                if (!isProcessAlive(entry.pid)) {
                    try { unlinkSync(join(REGISTRY_DIR, file)); } catch { /* ignore */ }
                    continue;
                }

                results.push({ pid: entry.pid, path: entry.path });
            } catch {
                // Corrupted file — clean up
                try { unlinkSync(join(REGISTRY_DIR, file)); } catch { /* ignore */ }
            }
        }
    } catch {
        // Registry dir doesn't exist yet — no servers registered
    }

    // ── Fallback: POSIX socket scan (backward compat) ──────
    if (platform() !== 'win32' && results.length === 0) {
        try {
            const files = readdirSync('/tmp');
            for (const file of files) {
                const match = file.match(/^mcp-fusion-(\d+)\.sock$/);
                if (match) {
                    const pid = parseInt(match[1]!, 10);
                    // Skip stale sockets from dead processes
                    if (!isProcessAlive(pid)) continue;
                    results.push({ pid, path: `/tmp/${file}` });
                }
            }
        } catch { /* ignore */ }
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

    // ── Registry: announce this server for auto-discovery ──
    writeRegistryFile(process.pid, config?.path ? undefined : 'mcp-fusion');

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

        // Remove registry file (cross-platform discovery)
        removeRegistryFile(process.pid);
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
