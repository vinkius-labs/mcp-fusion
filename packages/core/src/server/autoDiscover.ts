/**
 * File-Based Routing — Auto-Discovery of Tools via Directory Structure
 *
 * Scans a directory at startup and auto-registers tools based on the
 * file-system naming convention:
 *
 * ```
 * src/tools/
 * ├── billing/
 * │   ├── get_invoice.ts  → billing.get_invoice
 * │   └── pay.ts          → billing.pay
 * └── users/
 *     ├── list.ts         → users.list
 *     └── ban.ts          → users.ban
 * ```
 *
 * Each file must export a `GroupedToolBuilder` (via `defineTool()`,
 * `createTool()`, `f.tool()`, etc.) as the **default export** or
 * a named export called `tool`.
 *
 * **Benefits:**
 * - Zero code orchestration — no central `index.ts` with 50 imports
 * - Git-friendly — reduced merge conflicts (no shared import file)
 * - Instant onboarding — "drop a file → it's a tool"
 *
 * @example
 * ```typescript
 * import { autoDiscover, ToolRegistry } from '@vinkius-core/mcp-fusion';
 *
 * const registry = new ToolRegistry<AppContext>();
 *
 * // Scan src/tools/ and register everything
 * await autoDiscover(registry, './src/tools');
 *
 * // Or with options
 * await autoDiscover(registry, './src/tools', {
 *   pattern: /\.tool\.ts$/,     // only files ending in .tool.ts
 *   recursive: true,            // scan subdirectories (default: true)
 *   separator: '.',             // directory separator for tool names
 * });
 * ```
 *
 * @module
 */
import { promises as fs } from 'node:fs';
import { join, resolve, relative, basename, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Types ────────────────────────────────────────────────

/** Duck-typed ToolBuilder — avoids circular imports */
interface ToolBuilderLike {
    getName(): string;
    buildToolDefinition?(): unknown;
}

/** Duck-typed ToolRegistry — avoids circular imports */
interface ToolRegistryLike {
    register(builder: ToolBuilderLike): void;
}

/**
 * Options for `autoDiscover()`.
 */
export interface AutoDiscoverOptions {
    /**
     * Regex pattern to filter files. Only files matching this pattern
     * are imported. Default: matches `.ts`, `.js`, `.mjs`, `.mts` files,
     * excluding `.test.`, `.spec.`, and `.d.ts` files.
     */
    pattern?: RegExp;

    /**
     * Whether to recurse into subdirectories.
     * @default true
     */
    recursive?: boolean;

    /**
     * Module resolution style:
     * - `'esm'` — Uses dynamic `import()` (default for ESM projects)
     * - `'cjs'` — Uses `require()` (for CommonJS projects)
     *
     * @default 'esm'
     */
    loader?: 'esm' | 'cjs';

    /**
     * Custom export resolver. When provided, this function is called
     * with the module's exports and must return the tool builder(s).
     *
     * Default behavior: looks for `default` export or named `tool` export.
     */
    resolve?: (mod: Record<string, unknown>) => ToolBuilderLike | ToolBuilderLike[] | undefined;
}

// ── Internal ─────────────────────────────────────────────

const DEFAULT_PATTERN = /\.(ts|js|mjs|mts)$/;
const EXCLUDED_PATTERN = /\.(test|spec|d)\./;

/**
 * Walk a directory tree and collect file paths matching the filter.
 * @internal
 */
async function walkDir(dir: string, pattern: RegExp, recursive: boolean): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
            const nested = await walkDir(fullPath, pattern, recursive);
            files.push(...nested);
        } else if (entry.isFile() && pattern.test(entry.name) && !EXCLUDED_PATTERN.test(entry.name)) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Check if a value looks like a ToolBuilder (duck typing).
 * @internal
 */
function isToolBuilder(value: unknown): value is ToolBuilderLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as ToolBuilderLike).getName === 'function'
    );
}

/**
 * Default export resolver: check default → tool → any exported builder.
 * @internal
 */
function defaultResolver(mod: Record<string, unknown>): ToolBuilderLike | ToolBuilderLike[] | undefined {
    // Priority 1: default export
    const defaultExport = mod['default'];
    if (isToolBuilder(defaultExport)) return defaultExport;

    // Priority 2: named `tool` export
    const toolExport = mod['tool'];
    if (isToolBuilder(toolExport)) return toolExport;

    // Priority 3: collect all exported builders
    const builders: ToolBuilderLike[] = [];
    for (const value of Object.values(mod)) {
        if (isToolBuilder(value)) {
            builders.push(value);
        }
    }

    return builders.length > 0 ? builders : undefined;
}

// ── Public API ───────────────────────────────────────────

/**
 * Scan a directory and auto-register all discovered tool builders.
 *
 * Eliminates the need for a central `index.ts` that manually imports
 * and registers every tool. New tools are automatically picked up
 * when they are dropped into the scanned directory.
 *
 * @param registry - A ToolRegistry instance to register discovered tools
 * @param dir - Path to the tools directory (absolute or relative to CWD)
 * @param options - Discovery options (pattern, recursive, loader, resolve)
 * @returns Array of discovered file paths (for logging/debugging)
 * @throws If the directory does not exist or is not readable
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry<AppContext>();
 * const files = await autoDiscover(registry, './src/tools');
 * console.log(`Discovered ${files.length} tool files`);
 * ```
 */
export async function autoDiscover(
    registry: ToolRegistryLike,
    dir: string,
    options: AutoDiscoverOptions = {},
): Promise<string[]> {
    const {
        pattern = DEFAULT_PATTERN,
        recursive = true,
        loader = 'esm',
        resolve: customResolve,
    } = options;

    const absoluteDir = resolve(dir);
    const files = await walkDir(absoluteDir, pattern, recursive);
    const discoveredFiles: string[] = [];

    for (const filePath of files) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let mod: Record<string, unknown>;

            if (loader === 'cjs') {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                mod = require(filePath) as Record<string, unknown>;
            } else {
                const fileUrl = pathToFileURL(filePath).href;
                mod = await import(fileUrl) as Record<string, unknown>;
            }

            const resolver = customResolve ?? defaultResolver;
            const result = resolver(mod);

            if (!result) continue;

            const builders = Array.isArray(result) ? result : [result];

            for (const builder of builders) {
                registry.register(builder);
            }

            discoveredFiles.push(filePath);
        } catch {
            // Skip files that fail to import (syntax errors, missing deps, etc.)
            // In production, this should be logged via the observability layer
            continue;
        }
    }

    return discoveredFiles;
}
