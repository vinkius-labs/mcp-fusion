#!/usr/bin/env node
/**
 * MCP Fusion CLI — `fusion`
 *
 * Commands:
 *
 *   fusion create <name> [--transport stdio|sse] [--vector blank|database|workflow|openapi] [--testing] [--yes|-y]
 *       Scaffold a new MCP Fusion server project.
 *
 *   fusion dev --server <entrypoint> [--dir <watchDir>]
 *       Start HMR dev server with auto-reload and tool list notifications.
 *
 *   fusion lock [--server <entrypoint>] [--name <serverName>]
 *       Generate or update `mcp-fusion.lock`.
 *
 *   fusion lock --check [--server <entrypoint>]
 *       Verify the lockfile matches the current server.
 *       Exits 0 if up-to-date, 1 if stale (CI gate).
 *
 * @module
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { compileContracts } from '../introspection/ToolContract.js';
import {
    generateLockfile,
    writeLockfile,
    readLockfile,
    checkLockfile,
    serializeLockfile,
    LOCKFILE_NAME,
    type PromptBuilderLike,
} from '../introspection/CapabilityLockfile.js';
import { scaffold } from './scaffold.js';
import type { ProjectConfig, IngestionVector, TransportLayer } from './types.js';
import { createDevServer } from '../server/DevServer.js';

// ============================================================================
// ANSI Styling (zero dependencies)
// ============================================================================

/** @internal exported for testing */
export const ansi = {
    cyan:  (s: string): string => `\x1b[36m${s}\x1b[0m`,
    green: (s: string): string => `\x1b[32m${s}\x1b[0m`,
    dim:   (s: string): string => `\x1b[2m${s}\x1b[0m`,
    bold:  (s: string): string => `\x1b[1m${s}\x1b[0m`,
    red:   (s: string): string => `\x1b[31m${s}\x1b[0m`,
    reset: '\x1b[0m',
} as const;

// ============================================================================
// Progress Reporter (Composer / Yarn-style progress output)
// ============================================================================

/**
 * Step status for CLI progress reporting.
 * @internal
 */
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

/**
 * A progress step emitted during CLI operations.
 * @internal
 */
export interface ProgressStep {
    /** Step identifier */
    readonly id: string;
    /** Human-readable label */
    readonly label: string;
    /** Current status */
    readonly status: StepStatus;
    /** Optional detail (e.g. "12 tools, 3 prompts") */
    readonly detail?: string;
    /** Duration in milliseconds (set when done/failed) */
    readonly durationMs?: number;
}

/**
 * Callback that receives progress updates.
 * Default implementation writes to stderr like Composer / Yarn.
 * @internal
 */
export type ProgressReporter = (step: ProgressStep) => void;

/** Icon map for each step status */
const STATUS_ICONS: Record<StepStatus, string> = {
    pending: '○',
    running: '◐',
    done: '●',
    failed: '✗',
};

/**
 * Create the default pretty-print progress reporter.
 * Output goes to stderr so it doesn't pollute piped stdout.
 * @internal exported for testing
 */
export function createDefaultReporter(): ProgressReporter {
    return (step: ProgressStep): void => {
        const icon = STATUS_ICONS[step.status];
        const timing = step.durationMs !== undefined ? ` (${step.durationMs}ms)` : '';
        const detail = step.detail ? ` — ${step.detail}` : '';
        process.stderr.write(`  ${icon} ${step.label}${detail}${timing}\n`);
    };
}

/**
 * A progress tracker that drives step-by-step progress reporting.
 * @internal exported for testing
 */
export class ProgressTracker {
    private readonly reporter: ProgressReporter;
    private startTimes = new Map<string, number>();

    constructor(reporter?: ProgressReporter) {
        this.reporter = reporter ?? createDefaultReporter();
    }

    /** Mark a step as running */
    start(id: string, label: string): void {
        this.startTimes.set(id, Date.now());
        this.reporter({ id, label, status: 'running' });
    }

    /** Mark a step as completed */
    done(id: string, label: string, detail?: string): void {
        const durationMs = this.elapsed(id);
        this.reporter({
            id, label, status: 'done',
            ...(detail !== undefined ? { detail } : {}),
            ...(durationMs !== undefined ? { durationMs } : {}),
        });
    }

    /** Mark a step as failed */
    fail(id: string, label: string, detail?: string): void {
        const durationMs = this.elapsed(id);
        this.reporter({
            id, label, status: 'failed',
            ...(detail !== undefined ? { detail } : {}),
            ...(durationMs !== undefined ? { durationMs } : {}),
        });
    }

    private elapsed(id: string): number | undefined {
        const start = this.startTimes.get(id);
        if (start === undefined) return undefined;
        this.startTimes.delete(id);
        return Date.now() - start;
    }
}

// ============================================================================
// Constants
// ============================================================================

/** @internal exported for testing */
export const MCP_FUSION_VERSION = '1.1.0';

/** @internal exported for testing */
export const HELP = `
fusion — MCP Fusion CLI

USAGE
  fusion create <name>                Scaffold a new MCP Fusion server
  fusion dev --server <entry>         Start HMR dev server with auto-reload
  fusion lock                         Generate or update ${LOCKFILE_NAME}
  fusion lock --check                 Verify lockfile is up to date (CI gate)
  fusion inspect                     Launch the real-time TUI dashboard
  fusion insp --demo                  Launch TUI with built-in simulator

CREATE OPTIONS
  --transport <stdio|sse>  Transport layer (default: stdio)
  --vector <type>          Ingestion vector: vanilla, prisma, n8n, openapi, oauth
  --testing                Include test suite (default: true)
  --no-testing             Skip test suite
  --yes, -y                Skip prompts, use defaults

DEV OPTIONS
  --server, -s <path>      Path to server entrypoint (default: auto-detect)
  --dir, -d <path>         Directory to watch for changes (default: auto-detect from server)

INSPECTOR OPTIONS
  --demo, -d               Launch with built-in simulator (no server needed)
  --out, -o <mode>         Output: tui (default), stderr (headless ECS/K8s)
  --pid, -p <pid>          Connect to a specific server PID
  --path <path>            Custom IPC socket/pipe path

LOCK OPTIONS
  --server, -s <path>      Path to server entrypoint
  --name, -n <name>        Server name for lockfile header
  --cwd <dir>              Project root directory

GLOBAL
  --help, -h               Show this help message

EXAMPLES
  fusion create my-server
  fusion create my-server -y
  fusion create my-server --vector prisma --transport sse
  fusion dev --server ./src/server.ts
  fusion dev --server ./src/server.ts --dir ./src/tools
  fusion lock --server ./src/server.ts
  fusion inspect --demo
  fusion insp --pid 12345
`.trim();

// ============================================================================
// Arg Parser
// ============================================================================

/** @internal exported for testing */
export interface CliArgs {
    command: string;
    check: boolean;
    server: string | undefined;
    name: string | undefined;
    cwd: string;
    help: boolean;
    // ── Create-specific ──
    projectName: string | undefined;
    transport: TransportLayer | undefined;
    vector: IngestionVector | undefined;
    testing: boolean | undefined;
    yes: boolean;
    // ── Dev-specific ──
    dir: string | undefined;
}

/** @internal exported for testing */
export function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2);
    const result: CliArgs = {
        command: '',
        check: false,
        server: undefined,
        name: undefined,
        cwd: process.cwd(),
        help: false,
        projectName: undefined,
        transport: undefined,
        vector: undefined,
        testing: undefined,
        yes: false,
        dir: undefined,
    };

    let seenCommand = false;
    let seenProjectName = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
            case 'lock':
            case 'create':
            case 'dev':
            case 'inspect':
            case 'insp':
            case 'debug':
            case 'dbg':
                result.command = arg;
                seenCommand = true;
                break;
            case '--check':
                result.check = true;
                break;
            case '-s':
            case '--server':
                result.server = args[++i];
                break;
            case '-n':
            case '--name':
                result.name = args[++i];
                break;
            case '--cwd':
                result.cwd = args[++i] ?? process.cwd();
                break;
            case '-h':
            case '--help':
                result.help = true;
                break;
            case '--transport':
                result.transport = args[++i] as TransportLayer;
                break;
            case '--vector':
                result.vector = args[++i] as IngestionVector;
                break;
            case '--testing':
                result.testing = true;
                break;
            case '--no-testing':
                result.testing = false;
                break;
            case '-d':
            case '--dir':
                result.dir = args[++i];
                break;
            case '-y':
            case '--yes':
                result.yes = true;
                break;
            default:
                if (!seenCommand) {
                    result.command = arg;
                    seenCommand = true;
                } else if (result.command === 'create' && !seenProjectName && !arg.startsWith('-')) {
                    result.projectName = arg;
                    seenProjectName = true;
                }
                break;
        }
    }

    return result;
}

// ============================================================================
// Registry Resolution
// ============================================================================

/**
 * Duck-typed interface for objects that can provide tool builders.
 * Supports both ToolRegistry and FusionInstance.
 */
/** @internal exported for testing */
export interface RegistryLike {
    getBuilders(): Iterable<import('../core/types.js').ToolBuilder<unknown>>;
}

/**
 * Duck-typed interface for objects that can provide prompt builders.
 * Supports PromptRegistry.
 */
/** @internal exported for testing */
export interface PromptRegistryLike {
    getBuilders?(): Iterable<PromptBuilderLike>;
}

/**
 * Attempt to load and resolve a tool registry from a server entrypoint.
 *
 * Supports common export patterns:
 * - `export const registry = new ToolRegistry()`
 * - `export default { registry }`
 * - `export const fusion = initFusion()`
 *
 * @internal
 */
/** @internal exported for testing */
export async function resolveRegistry(serverPath: string): Promise<{ registry: RegistryLike; name: string; promptRegistry?: PromptRegistryLike }> {
    const absolutePath = resolve(serverPath);
    const fileUrl = pathToFileURL(absolutePath).href;

    // Register tsx loader so dynamic import() can handle .ts files
    // and resolve .js extension imports to .ts (ESM convention).
    // Uses tsx/esm/api which is compatible with Node 22+ (--import style).
    // Resolve tsx from the USER's project (not from the CLI's dist location)
    // via createRequire anchored to the server file's directory.
    if (absolutePath.endsWith('.ts')) {
        try {
            const { createRequire } = await import('node:module');
            const userRequire = createRequire(absolutePath);
            const tsxApiPath = userRequire.resolve('tsx/esm/api');
            const { register } = await import(pathToFileURL(tsxApiPath).href) as { register: () => void };
            register();
        } catch {
            // tsx not available — fall through, import() will fail with
            // a clear "Cannot find module" error if .ts resolution is needed
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import(fileUrl);

    /** Extract prompt registry from a module-like object */
    function extractPrompts(obj: Record<string, unknown>): PromptRegistryLike | undefined {
        // Look for promptRegistry, prompts, or promptsRegistry
        for (const key of ['promptRegistry', 'prompts', 'promptsRegistry']) {
            const candidate = obj[key];
            if (candidate && typeof candidate === 'object' && candidate !== null) {
                return candidate as PromptRegistryLike;
            }
        }
        return undefined;
    }

    // Strategy 1: Named `registry` export (ToolRegistry pattern)
    if (mod.registry && typeof mod.registry.getBuilders === 'function') {
        const pr = extractPrompts(mod as Record<string, unknown>);
        return {
            registry: mod.registry as RegistryLike,
            name: mod.serverName ?? 'mcp-fusion-server',
            ...(pr ? { promptRegistry: pr } : {}),
        };
    }

    // Strategy 2: Named `fusion` export (initFusion pattern)
    if (mod.fusion && mod.fusion.registry && typeof mod.fusion.registry.getBuilders === 'function') {
        const pr = extractPrompts(mod.fusion as Record<string, unknown>);
        return {
            registry: mod.fusion.registry as RegistryLike,
            name: mod.fusion.name ?? 'mcp-fusion-server',
            ...(pr ? { promptRegistry: pr } : {}),
        };
    }

    // Strategy 3: Default export with registry
    if (mod.default) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const def = mod.default;
        if (def.registry && typeof def.registry.getBuilders === 'function') {
            const pr = extractPrompts(def as Record<string, unknown>);
            return {
                registry: def.registry as RegistryLike,
                name: (def.serverName as string) ?? 'mcp-fusion-server',
                ...(pr ? { promptRegistry: pr } : {}),
            };
        }
        if (typeof def.getBuilders === 'function') {
            return { registry: def as RegistryLike, name: 'mcp-fusion-server' };
        }
    }

    throw new Error(
        `Could not resolve a ToolRegistry from "${serverPath}".\n` +
        `Expected one of:\n` +
        `  export const registry = new ToolRegistry()  // named 'registry' with getBuilders()\n` +
        `  export const fusion = initFusion()           // named 'fusion' with .registry\n` +
        `  export default { registry }                  // default export with .registry`,
    );
}

// ============================================================================
// Commands
// ============================================================================

/** @internal exported for testing */
export async function commandLock(args: CliArgs, reporter?: ProgressReporter): Promise<void> {
    const progress = new ProgressTracker(reporter);

    if (!args.server) {
        const detected = inferServerEntry(args.cwd);
        if (!detected) {
            console.error('Error: Could not auto-detect server entrypoint.\n');
            console.error('Usage: fusion lock --server ./src/server.ts');
            process.exit(1);
        }
        args.server = detected;
    }

    const mode = args.check ? 'Verifying' : 'Generating';
    process.stderr.write(`\n  fusion lock — ${mode} ${LOCKFILE_NAME}\n\n`);

    // Step 1: Resolve registry
    progress.start('resolve', 'Resolving server entrypoint');
    const { registry, name, promptRegistry } = await resolveRegistry(args.server);
    const serverName = args.name ?? name;
    progress.done('resolve', 'Resolving server entrypoint', serverName);

    // Step 2: Compile tool contracts
    progress.start('compile', 'Compiling tool contracts');
    const builders = [...registry.getBuilders()];
    const contracts = await compileContracts(builders);
    const toolCount = Object.keys(contracts).length;
    progress.done('compile', 'Compiling tool contracts', `${toolCount} tool${toolCount !== 1 ? 's' : ''}`);

    // Step 3: Discover prompts
    progress.start('prompts', 'Discovering prompts');
    const promptBuilders: PromptBuilderLike[] = [];
    if (promptRegistry && typeof promptRegistry.getBuilders === 'function') {
        promptBuilders.push(...promptRegistry.getBuilders());
    }
    const options = promptBuilders.length > 0 ? { prompts: promptBuilders } : undefined;
    const promptCount = promptBuilders.length;
    progress.done('prompts', 'Discovering prompts', `${promptCount} prompt${promptCount !== 1 ? 's' : ''}`);

    if (args.check) {
        // ── Check Mode ──
        progress.start('read', 'Reading existing lockfile');
        const existing = await readLockfile(args.cwd);
        if (!existing) {
            progress.fail('read', 'Reading existing lockfile', 'not found');
            console.error(`\n✗ No ${LOCKFILE_NAME} found. Run \`fusion lock\` to generate.`);
            process.exit(1);
        }
        progress.done('read', 'Reading existing lockfile');

        progress.start('verify', 'Verifying integrity');
        const result = await checkLockfile(existing, contracts, options);
        if (result.ok) {
            progress.done('verify', 'Verifying integrity', 'up to date');
            console.log(`\n✓ ${LOCKFILE_NAME} is up to date.`);
            process.exit(0);
        } else {
            progress.fail('verify', 'Verifying integrity', 'stale');
            console.error(`\n✗ ${result.message}`);
            if (result.added.length > 0) console.error(`  + Tools added: ${result.added.join(', ')}`);
            if (result.removed.length > 0) console.error(`  - Tools removed: ${result.removed.join(', ')}`);
            if (result.changed.length > 0) console.error(`  ~ Tools changed: ${result.changed.join(', ')}`);
            if (result.addedPrompts.length > 0) console.error(`  + Prompts added: ${result.addedPrompts.join(', ')}`);
            if (result.removedPrompts.length > 0) console.error(`  - Prompts removed: ${result.removedPrompts.join(', ')}`);
            if (result.changedPrompts.length > 0) console.error(`  ~ Prompts changed: ${result.changedPrompts.join(', ')}`);
            process.exit(1);
        }
    } else {
        // ── Generate Mode ──
        progress.start('generate', 'Computing behavioral digests');
        const lockfile = await generateLockfile(serverName, contracts, MCP_FUSION_VERSION, options);
        progress.done('generate', 'Computing behavioral digests');

        progress.start('write', `Writing ${LOCKFILE_NAME}`);
        await writeLockfile(lockfile, args.cwd);
        progress.done('write', `Writing ${LOCKFILE_NAME}`);

        const tc = Object.keys(lockfile.capabilities.tools).length;
        const pc = Object.keys(lockfile.capabilities.prompts ?? {}).length;
        const parts = [`${tc} tool${tc !== 1 ? 's' : ''}`];
        if (pc > 0) parts.push(`${pc} prompt${pc !== 1 ? 's' : ''}`);
        console.log(`\n✓ ${LOCKFILE_NAME} generated (${parts.join(', ')}).`);
        console.log(`  Integrity: ${lockfile.integrityDigest}`);
    }
}

// ============================================================================
// Dev Command — HMR Development Server
// ============================================================================

/** @internal exported for testing */
export async function commandDev(args: CliArgs, reporter?: ProgressReporter): Promise<void> {
    const progress = new ProgressTracker(reporter);

    if (!args.server) {
        const detected = inferServerEntry(args.cwd);
        if (!detected) {
            console.error('Error: Could not auto-detect server entrypoint.\n');
            console.error('Usage: fusion dev --server ./src/server.ts');
            process.exit(1);
        }
        args.server = detected;
    }

    // Narrowed: args.server is guaranteed to be a string from here
    const serverEntry = args.server;

    process.stderr.write(`\n  ${ansi.bold('⚡ fusion dev')} ${ansi.dim('— HMR Development Server')}\n\n`);

    // Step 1: Resolve registry from server entrypoint
    progress.start('resolve', 'Resolving server entrypoint');
    const { registry, name } = await resolveRegistry(serverEntry);
    progress.done('resolve', 'Resolving server entrypoint', name);

    // Step 2: Determine watch directory
    const watchDir = args.dir ?? inferWatchDir(serverEntry);
    progress.start('watch', `Watching ${watchDir}`);
    progress.done('watch', `Watching ${watchDir}`);

    // Step 3: Create and start dev server
    const devServer = createDevServer({
        dir: watchDir,
        setup: async (reg) => {
            // Clear existing registrations if supported
            if ('clear' in reg && typeof (reg as { clear: unknown }).clear === 'function') {
                (reg as { clear: () => void }).clear();
            }

            // Re-resolve the registry (re-imports with cache-busting)
            try {
                const resolved = await resolveRegistry(serverEntry);
                // Copy builders from re-resolved registry into the dev server's registry
                for (const builder of resolved.registry.getBuilders()) {
                    reg.register(builder);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to reload: ${message}`);
            }
        },
    });

    // Handle SIGINT for clean shutdown
    process.on('SIGINT', () => {
        process.stderr.write(`\n  ${ansi.dim('Shutting down...')}\n\n`);
        devServer.stop();
        process.exit(0);
    });

    await devServer.start();
}

/**
 * Auto-detect the server entrypoint by probing common file paths.
 *
 * Checks in order: `src/server.ts`, `src/index.ts`, `server.ts`, `index.ts`,
 * and their `.js` counterparts.
 *
 * @param cwd - Current working directory
 * @returns Detected file path, or undefined if none found
 * @internal
 */
function inferServerEntry(cwd: string): string | undefined {
    const candidates = [
        'src/server.ts', 'src/index.ts',
        'src/server.js', 'src/index.js',
        'server.ts', 'index.ts',
        'server.js', 'index.js',
    ];
    for (const candidate of candidates) {
        const fullPath = resolve(cwd, candidate);
        if (existsSync(fullPath)) return fullPath;
    }
    return undefined;
}

/**
 * Infer the watch directory from the server entrypoint path.
 *
 * Heuristic: if the server is in `src/server.ts`, watch `src/`.
 * Falls back to the directory containing the entrypoint.
 *
 * @internal
 */
function inferWatchDir(serverPath: string): string {
    const dir = resolve(serverPath, '..');
    const dirName = dir.split(/[\\/]/).pop() ?? '';

    // If the server is directly in `src/`, watch `src/`
    if (dirName === 'src') return dir;

    // If the server is deeper (e.g. `src/server/index.ts`), walk up to `src/`
    const parentDir = resolve(dir, '..');
    const parentName = parentDir.split(/[\\/]/).pop() ?? '';
    if (parentName === 'src') return parentDir;

    // Fallback: watch the directory containing the entrypoint
    return dir;
}

// ============================================================================
// Create Command — Interactive Wizard + Fast-Path
// ============================================================================

const VALID_TRANSPORTS = ['stdio', 'sse'] as const;
const VALID_VECTORS = ['vanilla', 'prisma', 'n8n', 'openapi', 'oauth'] as const;

/**
 * Ask a question via readline with styled ANSI output.
 * @internal exported for testing
 */
export function ask(
    rl: { question: (q: string, cb: (a: string) => void) => void },
    prompt: string,
    fallback: string,
): Promise<string> {
    return new Promise((resolve) => {
        rl.question(`  ${ansi.cyan('◇')} ${prompt} ${ansi.dim(`(${fallback})`)} `, (answer: string) => {
            resolve(answer.trim() || fallback);
        });
    });
}

/**
 * Collect project config — either from flags or interactive prompts.
 * @internal exported for testing
 */
export async function collectConfig(args: CliArgs): Promise<ProjectConfig | null> {
    // ── Fast-path: --yes skips all prompts ────────────────
    if (args.yes) {
        const name = args.projectName ?? 'my-mcp-server';
        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z0-9]$/.test(name)) {
            process.stderr.write(`  ${ansi.red('✗')} Invalid name: must start with a letter/number, end with a letter/number, and contain only lowercase letters, numbers, and hyphens.\n`);
            return null;
        }

        const transport = validateTransport(args.transport);
        const vector = validateVector(args.vector);

        return {
            name,
            transport,
            vector,
            testing: args.testing ?? true,
        };
    }

    // ── Interactive wizard ────────────────────────────────
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    try {
        process.stderr.write(`\n  ${ansi.bold('⚡ MCP Fusion')} ${ansi.dim('— Create a new MCP server')}\n\n`);

        const name = args.projectName ?? await ask(rl, 'Project name?', 'my-mcp-server');

        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z0-9]$/.test(name)) {
            process.stderr.write(`  ${ansi.red('✗')} Invalid name: must start with a letter/number, end with a letter/number, and contain only lowercase letters, numbers, and hyphens.\n`);
            return null;
        }

        const transportRaw = args.transport ?? await ask(rl, 'Transport? [stdio, sse]', 'stdio');
        const transport = validateTransport(transportRaw);

        const vectorRaw = args.vector ?? await ask(rl, 'Vector? [vanilla, prisma, n8n, openapi, oauth]', 'vanilla');
        const vector = validateVector(vectorRaw);

        const testingRaw = args.testing ?? (await ask(rl, 'Include testing?', 'yes')).toLowerCase();
        const testing = typeof testingRaw === 'boolean' ? testingRaw : testingRaw !== 'no';

        process.stderr.write('\n');
        return { name, transport, vector, testing };
    } finally {
        rl.close();
    }
}

/** @internal Validate and warn on invalid transport */
function validateTransport(raw: string | undefined): TransportLayer {
    if (!raw) return 'stdio';
    if (VALID_TRANSPORTS.includes(raw as TransportLayer)) return raw as TransportLayer;
    process.stderr.write(`  ${ansi.red('⚠')} Unknown transport "${raw}" — using ${ansi.bold('stdio')}. Valid: ${VALID_TRANSPORTS.join(', ')}\n`);
    return 'stdio';
}

/** @internal Validate and warn on invalid vector */
function validateVector(raw: string | undefined): IngestionVector {
    if (!raw) return 'vanilla';
    if (VALID_VECTORS.includes(raw as IngestionVector)) return raw as IngestionVector;
    process.stderr.write(`  ${ansi.red('⚠')} Unknown vector "${raw}" — using ${ansi.bold('vanilla')}. Valid: ${VALID_VECTORS.join(', ')}\n`);
    return 'vanilla';
}

/** @internal exported for testing */
export async function commandCreate(args: CliArgs, reporter?: ProgressReporter): Promise<void> {
    const progress = new ProgressTracker(reporter);

    // ── Collect config ───────────────────────────────────
    const config = await collectConfig(args);
    if (!config) {
        process.exit(1);
    }

    const targetDir = resolve(args.cwd, config.name);

    // ── Guard: directory exists ──────────────────────────
    if (existsSync(targetDir)) {
        process.stderr.write(`  ${ansi.red('✗')} Directory "${config.name}" already exists.\n`);
        process.exit(1);
    }

    // ── Scaffold ─────────────────────────────────────────
    progress.start('scaffold', 'Scaffolding project');
    const files = scaffold(targetDir, config);
    progress.done('scaffold', 'Scaffolding project', `${files.length} files`);

    // ── Install dependencies ─────────────────────────────
    progress.start('install', 'Installing dependencies');
    try {
        execSync('npm install', {
            cwd: targetDir,
            stdio: 'ignore',
            timeout: 120_000,
        });
        progress.done('install', 'Installing dependencies');
    } catch {
        progress.fail('install', 'Installing dependencies', 'run npm install manually');
    }

    // ── Done ─────────────────────────────────────────────
    const steps = [`cd ${config.name}`];
    if (config.transport === 'sse') {
        steps.push('fusion dev', '# then connect Cursor or Claude to http://localhost:3001/sse');
    } else {
        steps.push('fusion dev');
    }
    if (config.testing) steps.push('npm test');

    process.stderr.write(`\n  ${ansi.green('✓')} ${ansi.bold(config.name)} is ready!\n\n`);
    process.stderr.write(`  ${ansi.dim('Next steps:')}\n`);
    for (const step of steps) {
        process.stderr.write(`    ${ansi.cyan('$')} ${step}\n`);
    }
    process.stderr.write(`\n  ${ansi.dim('Cursor:')} .cursor/mcp.json is pre-configured — open in Cursor and go.\n`);
    process.stderr.write(`  ${ansi.dim('Docs:')}   ${ansi.cyan('https://mcp-fusion.vinkius.com/')}\n\n`);
}

// ============================================================================
// Entry Point
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs(process.argv);

    if (args.help || !args.command) {
        console.log(HELP);
        process.exit(args.help ? 0 : 1);
    }

    switch (args.command) {
        case 'create':
            await commandCreate(args);
            break;
        case 'dev':
            await commandDev(args);
            break;
        case 'lock':
            await commandLock(args);
            // Force exit: imported server modules may keep the event loop
            // alive (e.g. transport listeners, telemetry bus, IPC sockets).
            process.exit(0);
            break; // unreachable, but keeps lint happy
        case 'inspect':
        case 'insp':
        case 'debug':
        case 'dbg': {
            // Inspector subcommand: forward remaining args to inspector package
            const inspectArgv = process.argv.slice(3); // strip 'node fusion inspect'
            try {
                const { runInspector } = await import('@vinkius-core/mcp-fusion-inspector');
                await runInspector(inspectArgv);
            } catch (importErr) {
                console.error(
                    `\x1b[31m\u2717\x1b[0m The inspector TUI requires the optional package:\n\n` +
                    `  npm install @vinkius-core/mcp-fusion-inspector\n`,
                );
                process.exit(1);
            }
            break;
        }
        default:
            console.error(`Unknown command: "${args.command}"\n`);
            console.log(HELP);
            process.exit(1);
    }
}

/* c8 ignore next 6 — CLI entry-point guard */
const isCLI =
    typeof process !== 'undefined' &&
    (process.argv[1]?.endsWith('fusion') || process.argv[1]?.endsWith('fusion.js'));
if (isCLI) {
    main().catch((err: Error) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}
