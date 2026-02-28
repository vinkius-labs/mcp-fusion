/**
 * startServer — One-Liner Bootstrap for MCP Fusion Servers
 *
 * Abstracts the entire server startup boilerplate into a single call:
 *   1. Creates the MCP Server instance
 *   2. Attaches the tool registry with telemetry
 *   3. Builds the topology for Inspector TUI auto-discovery
 *   4. Starts the Telemetry Bus (IPC)
 *   5. Connects the stdio transport
 *
 * @module
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { attachToServer, type AttachOptions } from './ServerAttachment.js';
import { createTelemetryBus, type TelemetryBusInstance } from '../observability/TelemetryBus.js';
import type { PromptRegistry } from '../prompt/PromptRegistry.js';

// ============================================================================
// Types
// ============================================================================

/** Options for `startServer`. */
export interface StartServerOptions<TContext> {
    /** Server display name (shown in MCP clients and Inspector). */
    readonly name: string;

    /** Server version string (e.g. '1.0.0'). */
    readonly version?: string;

    /** The tool registry to expose. */
    readonly registry: ServerRegistry<TContext>;

    /** Optional prompt registry. */
    readonly prompts?: PromptRegistry<TContext>;

    /** Factory to create per-request context. */
    readonly contextFactory?: (extra: unknown) => TContext | Promise<TContext>;

    /** Enable Inspector TUI telemetry (default: true). */
    readonly telemetry?: boolean;

    /** Extra attach options (debug, tracing, zeroTrust, etc.). */
    readonly attach?: Omit<AttachOptions<TContext>, 'contextFactory' | 'prompts' | 'telemetry'>;
}

/**
 * Minimal registry interface expected by `startServer`.
 * Both `ToolRegistry` and any object with `getBuilders()` + `attachToServer()` qualify.
 */
interface ServerRegistry<TContext> {
    getBuilders(): Iterable<ToolBuilderLike>;
    attachToServer(server: unknown, options: AttachOptions<TContext>): Promise<unknown>;
}

/** Minimal builder shape for topology extraction. */
interface ToolBuilderLike {
    getName(): string;
    getActionNames(): string[];
}

/** Result returned by `startServer`. */
export interface StartServerResult {
    /** The MCP Server instance. */
    readonly server: InstanceType<typeof Server>;
    /** The Telemetry Bus (if enabled). */
    readonly bus?: TelemetryBusInstance;
    /** Gracefully shut down everything. */
    readonly close: () => Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Start an MCP Fusion server with a single call.
 *
 * Handles all bootstrap boilerplate: Server creation, registry attachment,
 * telemetry bus, and stdio transport connection.
 *
 * @example
 * ```typescript
 * import { startServer, autoDiscover } from '@vinkius-core/mcp-fusion';
 *
 * const registry = f.registry();
 * await autoDiscover(registry, new URL('./tools', import.meta.url));
 *
 * await startServer({
 *     name: 'my-server',
 *     registry,
 *     contextFactory: () => createContext(),
 * });
 * ```
 */
export async function startServer<TContext>(
    options: StartServerOptions<TContext>,
): Promise<StartServerResult> {
    const {
        name,
        version = '1.0.0',
        registry,
        prompts,
        contextFactory,
        telemetry = true,
        attach = {},
    } = options;

    // 1. Telemetry Bus (optional, default on)
    //    Gracefully degrades on serverless platforms (Vercel, Cloudflare)
    //    where IPC sockets / Named Pipes are not available.
    let bus: TelemetryBusInstance | undefined;
    if (telemetry) {
        try {
            // Build topology from registry builders
            const toolGroups = new Map<string, string[]>();
            for (const b of registry.getBuilders()) {
                for (const actionKey of b.getActionNames()) {
                    const flatName = `${b.getName()}_${actionKey}`;
                    const parts = flatName.split('_');
                    const group = parts[0]!;
                    const action = parts.slice(1).join('_');
                    const list = toolGroups.get(group) ?? [];
                    list.push(action);
                    toolGroups.set(group, list);
                }
            }

            bus = await createTelemetryBus({
                onConnect: () => ({
                    type: 'topology' as const,
                    serverName: name,
                    pid: process.pid,
                    tools: [...toolGroups.entries()].map(([n, actions]) => ({ name: n, actions })),
                    timestamp: Date.now(),
                }),
            });
            process.stderr.write(`📡 Telemetry bus ready (PID ${process.pid})\n`);
        } catch {
            // Serverless / sandboxed environments — telemetry unavailable
        }
    }

    // 2. MCP Server Instance
    const server = new Server(
        { name, version },
        { capabilities: { tools: {}, ...(prompts ? { prompts: {} } : {}) } },
    );

    // 3. Attach Registry
    await registry.attachToServer(server, {
        ...attach,
        ...(contextFactory ? { contextFactory } : {}),
        ...(prompts ? { prompts } : {}),
        ...(bus ? { telemetry: bus.emit } : {}),
    } as AttachOptions<TContext>);

    // 4. Connect Stdio Transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`⚡ ${name} running on stdio\n`);

    // 5. Close helper
    async function close(): Promise<void> {
        if (bus) await bus.close();
        await server.close();
    }

    const result: StartServerResult = { server, close };
    if (bus) (result as { bus?: TelemetryBusInstance }).bus = bus;
    return result;
}
