/**
 * DevServer — HMR-enabled MCP Development Server
 *
 * The "killer feature" for MCP DX: `vurb dev` starts a
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
 * # Auto-detects src/server.ts
 * vurb dev
 *
 * # Explicit entrypoint + custom watch dir
 * vurb dev --server ./src/server.ts --dir ./src/tools
 * ```
 *
 * @example
 * ```typescript
 * // Using the programmatic API
 * import { createDevServer } from 'vurb/dev';
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
import { toErrorMessage } from '../core/ErrorUtils.js';
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
    /** Optional: clear all builders before re-registering (for hot-reload) */
    clear?(): void;
}

/**
 * Context passed to the `setup` callback on each reload.
 * Provides the registry for tool registration and the cache-busted URL
 * for ESM module re-imports.
 */
export interface DevServerSetupContext {
    /** Registry to register tools on. */
    readonly registry: ToolRegistryLike;
    /**
     * Cache-busted URL of the changed file (if any).
     * Use this to re-import ESM modules so the module cache is invalidated:
     * ```ts
     * const mod = await import(ctx.cacheBustUrl ?? cacheBustUrl('./src/tools.ts'));
     * ```
     * For CJS modules, cache invalidation is automatic.
     */
    readonly cacheBustUrl: string | undefined;
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
     * Receives either a `ToolRegistryLike` (legacy) or a
     * `DevServerSetupContext` with the registry and cache-busted URL.
     *
     * For ESM hot-reload to work, use the `cacheBustUrl` from the context
     * when re-importing modules:
     * ```ts
     * setup: async (ctx) => {
     *   const { registry, cacheBustUrl: url } = ctx as DevServerSetupContext;
     *   const mod = await import(url ?? './src/tools.ts');
     *   registry.register(mod.default);
     * }
     * ```
     *
     * This is called on initial startup and on every file change.
     */
    readonly setup: (registryOrCtx: ToolRegistryLike | DevServerSetupContext) => void | Promise<void>;

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

    /**
     * Optional real ToolRegistry reference for hot-reload.
     *
     * When provided, builders collected during `setup()` are automatically
     * transferred to this registry after each reload, making hot-reload
     * effective. Without this, the user must close over their own registry
     * in the setup callback (fragile and undocumented pattern).
     *
     * If the registry implements `clear()`, old builders are removed
     * before re-registration to avoid duplicates.
     */
    readonly registry?: ToolRegistryLike;
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
        invalidateCjsTree(absolutePath);
    }

    // ESM modules can't be uncached directly — use a cache-busting
    // query parameter so the next dynamic import() re-evaluates the module.
    lastCacheBustUrl = cacheBustUrl(absolutePath);
}

/**
 * The last cache-busted URL produced by `invalidateModule()`.
 * The setup callback can use this to re-import an ESM module that was invalidated.
 * @internal
 */
let lastCacheBustUrl: string | undefined;

/**
 * Recursively invalidate a CJS module and all modules that depend on it.
 *
 * Walks `require.cache` to find modules whose `children` include the
 * changed module (i.e., importers / dependents), and removes them so
 * the next `require()` re-evaluates the entire dependency chain.
 *
 * @internal
 */
function invalidateCjsTree(entryPath: string): void {
    const visited = new Set<string>();
    const queue = [entryPath];

    while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        delete require.cache[current];

        // Find all cached modules that imported `current`
        for (const [key, mod] of Object.entries(require.cache)) {
            if (!mod) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — require.cache module type lacks .children in @types/node
            const children: Array<{ id: string }> = (mod as any).children ?? [];
            if (children.some(c => c.id === current)) {
                queue.push(key);
            }
        }
    }
}

/**
 * Create a cache-busting import URL for ESM modules.
 * Appends a timestamp query to force the module to be re-evaluated.
 *
 * Use this inside a DevServer `setup` callback to re-import ESM modules:
 * ```ts
 * const mod = await import(cacheBustUrl('./src/tools.ts'));
 * ```
 */
export function cacheBustUrl(filePath: string): string {
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
 * import { createDevServer, autoDiscover, ToolRegistry } from '@vurb/core';
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

    /** Whether we've warned about ESM cache-bust already */
    let esmWarningEmitted = false;

    /**
     * Perform a full reload: clear caches, re-run setup, notify MCP client.
     */
    async function performReload(changedFile: string): Promise<void> {
        reloadCount++;

        // Invalidate CJS cache for all watched files
        invalidateModule(changedFile);

        // Capture the cache-busted URL before calling setup
        const currentCacheBustUrl = lastCacheBustUrl;

        // Re-run the user's setup callback
        // Provide a duck-typed registry that satisfies the interface.
        // The user's setup may use this or close over their own registry.
        const builders: unknown[] = [];
        const reloadRegistry: ToolRegistryLike = {
            register(builder: unknown) { builders.push(builder); },
            getBuilders() { return builders; },
        };

        // Pass both registry and cacheBustUrl to the setup callback.
        // The setup function can destructure the context or treat it
        // as a plain registry (backward-compatible duck typing).
        const setupCtx: DevServerSetupContext = {
            registry: reloadRegistry,
            cacheBustUrl: currentCacheBustUrl,
            // Duck-type compatibility: expose register/getBuilders at top level
            // so legacy callbacks that expect (registry) still work.
        };
        // Assign duck-type methods so old `setup(registry)` signatures work
        const ctxWithDuck = Object.assign(setupCtx, {
            register: reloadRegistry.register.bind(reloadRegistry),
            getBuilders: reloadRegistry.getBuilders!.bind(reloadRegistry),
        });

        try {
            await setup(ctxWithDuck);
        } catch (err) {
            const message = toErrorMessage(err);
            // eslint-disable-next-line no-console
            console.error(`[vurb dev] Reload failed: ${message}`);
            return;
        }

        // Warn once if ESM modules may not benefit from cache invalidation
        if (!esmWarningEmitted && changedFile !== '(initial)' && changedFile !== '(manual)') {
            const isEsm = extensions.some(ext => ext === '.mjs' || ext === '.mts') ||
                           changedFile.endsWith('.mjs') || changedFile.endsWith('.mts') ||
                           extensions.includes('.ts') || extensions.includes('.js');
            if (isEsm) {
                // eslint-disable-next-line no-console
                console.warn(
                    '[vurb dev] ESM hot-reload requires cache-busted imports. ' +
                    'Use the `cacheBustUrl` from the setup context or `cacheBustUrl()` from \'@vurb/core\' ' +
                    'when dynamically importing modules. Plain `import(\'./path\')` will use stale cache.',
                );
                esmWarningEmitted = true;
            }
        }

        // Transfer collected builders to the real registry (Bug #42 fix)
        if (builders.length > 0 && config.registry) {
            if (typeof config.registry.clear === 'function') {
                config.registry.clear();
            }
            for (const b of builders) {
                config.registry.register(b);
            }
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

            // Bug #128: warn on Linux with Node.js < 20 where recursive watch is unsupported
            if (process.platform === 'linux' && parseInt(process.versions.node, 10) < 20) {
                // eslint-disable-next-line no-console
                console.warn(
                    '[vurb dev] Warning: recursive fs.watch() is not fully supported on Linux with Node.js < 20. ' +
                    'File changes in subdirectories may not be detected. Consider upgrading to Node.js 20+.',
                );
            }

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

            watcher.on('error', (err) => {
                // eslint-disable-next-line no-console
                console.error(`[vurb dev] Watcher error: ${toErrorMessage(err)}`);
            });

            // eslint-disable-next-line no-console
            console.log(`[vurb dev] Watching ${relative(process.cwd(), absoluteDir)} for changes...`);
        },

        stop(): void {
            if (debounceTimer) clearTimeout(debounceTimer);
            watcher?.close();
            watcher = undefined;
            // eslint-disable-next-line no-console
            console.log(`[vurb dev] Stopped. ${reloadCount} reload(s) performed.`);
        },

        async reload(reason?: string): Promise<void> {
            await performReload(reason ?? '(manual)');
        },
    };
}
