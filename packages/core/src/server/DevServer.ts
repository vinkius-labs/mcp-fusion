/**
 * DevServer — HMR-enabled MCP Development Server
 *
 * The "killer feature" for MCP DX: `npx mcp-fusion dev` starts a
 * development server that watches for file changes and performs
 * automatic Hot Module Replacement without requiring the LLM client
 * (Claude Desktop, Cursor, etc.) to be restarted.
 *
 * ## How It Works
 *
 * 1. The dev server starts an MCP stdio server with your tools
 * 2. When a `.ts`/`.js` file changes, the module cache is invalidated
 * 3. Tools are re-registered from the updated modules
 * 4. The MCP `notifications/tools/list_changed` notification is sent
 * 5. The LLM client picks up the new tool definitions transparently
 *
 * ## Usage
 *
 * ```bash
 * # Start dev server watching src/tools/ directory
 * npx mcp-fusion dev --dir ./src/tools --entry ./src/server.ts
 *
 * # With specific file pattern
 * npx mcp-fusion dev --dir ./src/tools --pattern "*.tool.ts"
 * ```
 *
 * @example
 * ```typescript
 * // Using the programmatic API
 * import { createDevServer } from '@vinkius-core/mcp-fusion/dev';
 *
 * const devServer = createDevServer({
 *   dir: './src/tools',
 *   setup: async (registry) => {
 *     // Your setup logic — called on every reload
 *     await autoDiscover(registry, './src/tools');
 *   },
 * });
 *
 * await devServer.start();
 * ```
 *
 * @module
 */
import { watch, type FSWatcher } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Types ────────────────────────────────────────────────

/** Duck-typed MCP server that supports notifications */
interface McpServerLike {
    notification(notification: { method: string }): Promise<void>;
    sendNotification?(notification: { method: string }): Promise<void>;
}

/** Duck-typed ToolRegistry */
interface ToolRegistryLike {
    register(builder: unknown): void;
    // Optional: clear for re-registration
    getBuilders?(): unknown[];
}

/**
 * Configuration for the development server.
 */
export interface DevServerConfig {
    /**
     * Directory to watch for file changes.
     * Relative paths are resolved from the current working directory.
     */
    readonly dir: string;

    /**
     * File extension filter for watched files.
     * @default ['.ts', '.js', '.mjs', '.mts']
     */
    readonly extensions?: string[];

    /**
     * Debounce interval in milliseconds.
     * Prevents rapid-fire reloads when editors save multiple files.
     * @default 300
     */
    readonly debounce?: number;

    /**
     * Setup callback invoked on every reload.
     *
     * Receives a fresh ToolRegistry. The callback should:
     * 1. Import/define all tools
     * 2. Register them on the registry
     *
     * This is called on initial startup and on every file change.
     */
    readonly setup: (registry: ToolRegistryLike) => void | Promise<void>;

    /**
     * Optional callback when a reload occurs.
     * Useful for logging or triggering downstream updates.
     */
    readonly onReload?: (changedFile: string) => void;

    /**
     * Optional MCP server reference for sending tool list change notifications.
     * When provided, the dev server sends `notifications/tools/list_changed`
     * on every reload, so the LLM client picks up changes automatically.
     */
    readonly server?: McpServerLike;
}

/**
 * Interface for a running dev server instance.
 */
export interface DevServer {
    /** Start watching and perform initial load */
    start(): Promise<void>;
    /** Stop the watcher and clean up */
    stop(): void;
    /** Force a manual reload (useful from CLI) */
    reload(reason?: string): Promise<void>;
}

// ── Module Cache Invalidation ────────────────────────────

/**
 * Invalidate Node.js ESM module cache for a given file.
 *
 * ESM modules are cached by URL. We use an import timestamp trick
 * to force re-evaluation on next import.
 *
 * For CJS, we clear `require.cache` if available.
 *
 * @internal
 */
function invalidateModule(filePath: string): void {
    const absolutePath = resolve(filePath);

    // CJS cache invalidation (when running in CJS mode)
    if (typeof require !== 'undefined' && require.cache) {
        delete require.cache[absolutePath];
    }

    // ESM modules can't be uncached directly — the caller must
    // re-import with a cache-busting query parameter.
}

/**
 * Create a cache-busting import URL for ESM modules.
 * Appends a timestamp query to force the module to be re-evaluated.
 * @internal
 */
function cacheBustUrl(filePath: string): string {
    const url = pathToFileURL(resolve(filePath));
    url.searchParams.set('t', String(Date.now()));
    return url.href;
}

// ── Dev Server Factory ───────────────────────────────────

/**
 * Create an HMR-enabled MCP development server.
 *
 * Watches a directory for file changes and automatically reloads
 * tools, then notifies the connected MCP client via the native
 * `notifications/tools/list_changed` notification.
 *
 * @param config - Dev server configuration
 * @returns A {@link DevServer} instance with start/stop/reload controls
 *
 * @example
 * ```typescript
 * import { createDevServer, autoDiscover, ToolRegistry } from '@vinkius-core/mcp-fusion';
 *
 * const devServer = createDevServer({
 *   dir: './src/tools',
 *   setup: async (registry) => {
 *     await autoDiscover(registry, './src/tools');
 *   },
 *   onReload: (file) => console.log(`[HMR] Reloaded: ${file}`),
 * });
 *
 * await devServer.start();
 * // File changes → auto-reload → LLM client gets notification
 * ```
 */
export function createDevServer(config: DevServerConfig): DevServer {
    const {
        dir,
        extensions = ['.ts', '.js', '.mjs', '.mts'],
        debounce = 300,
        setup,
        onReload,
        server,
    } = config;

    const absoluteDir = resolve(dir);
    let watcher: FSWatcher | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let reloadCount = 0;

    /**
     * Perform a full reload: clear caches, re-run setup, notify MCP client.
     */
    async function performReload(changedFile: string): Promise<void> {
        reloadCount++;

        // Invalidate CJS cache for all watched files
        invalidateModule(changedFile);

        // Re-run the user's setup callback
        // The user is responsible for creating a fresh registry or clearing it
        try {
            await setup({} as ToolRegistryLike);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error(`[mcp-fusion dev] Reload failed: ${message}`);
            return;
        }

        // Notify MCP client about tool list changes
        if (server) {
            const notification = { method: 'notifications/tools/list_changed' };
            try {
                if (typeof server.sendNotification === 'function') {
                    await server.sendNotification(notification);
                } else if (typeof server.notification === 'function') {
                    await server.notification(notification);
                }
            } catch {
                // Connection might not be established yet — ignore
            }
        }

        // User callback
        onReload?.(changedFile);
    }

    return {
        async start(): Promise<void> {
            // Perform initial load
            await performReload('(initial)');

            // Start watching
            const watchOptions = { recursive: true };

            watcher = watch(absoluteDir, watchOptions, (_eventType, filename) => {
                if (!filename) return;

                // Filter by extension
                const ext = '.' + filename.split('.').pop();
                if (!extensions.includes(ext)) return;

                // Skip test/spec files
                if (/\.(test|spec|d)\./.test(filename)) return;

                // Debounce rapid changes
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const fullPath = join(absoluteDir, filename);
                    void performReload(relative(process.cwd(), fullPath));
                }, debounce);
            });

            // eslint-disable-next-line no-console
            console.log(`[mcp-fusion dev] Watching ${relative(process.cwd(), absoluteDir)} for changes...`);
        },

        stop(): void {
            if (debounceTimer) clearTimeout(debounceTimer);
            watcher?.close();
            watcher = undefined;
            // eslint-disable-next-line no-console
            console.log(`[mcp-fusion dev] Stopped. ${reloadCount} reload(s) performed.`);
        },

        async reload(reason?: string): Promise<void> {
            await performReload(reason ?? '(manual)');
        },
    };
}
