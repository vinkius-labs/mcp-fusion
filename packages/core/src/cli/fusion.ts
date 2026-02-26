#!/usr/bin/env node
/**
 * MCP Fusion CLI — `fusion`
 *
 * Commands:
 *
 *   fusion lock [--server <entrypoint>] [--name <serverName>]
 *       Generate or update `mcp-fusion.lock`.
 *
 *   fusion lock --check [--server <entrypoint>]
 *       Verify the lockfile matches the current server.
 *       Exits 0 if up-to-date, 1 if stale (CI gate).
 *
 * The lockfile captures the complete behavioral surface of your
 * MCP Fusion server — tool contracts, cognitive guardrails,
 * entitlements, and token economics — in a deterministic,
 * git-diffable format.
 *
 * @module
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
fusion — MCP Fusion Capability Lockfile CLI

USAGE
  fusion lock                         Generate or update ${LOCKFILE_NAME}
  fusion lock --check                 Verify lockfile is up to date (CI gate)

OPTIONS
  --server, -s <path>     Path to server entrypoint (default: auto-discover)
  --name, -n <name>       Server name for lockfile header
  --cwd <dir>             Project root directory (default: process.cwd())
  --help, -h              Show this help message

EXAMPLES
  fusion lock
  fusion lock --check
  fusion lock --server ./src/server.ts --name my-server
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
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
            case 'lock':
                result.command = 'lock';
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
            default:
                if (!result.command) result.command = arg;
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
        console.error('Error: --server <path> is required.\n');
        console.error('Usage: fusion lock --server ./src/server.ts');
        process.exit(1);
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
    const contracts = compileContracts(builders);
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
        const result = checkLockfile(existing, contracts, options);
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
        const lockfile = generateLockfile(serverName, contracts, MCP_FUSION_VERSION, options);
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
// Entry Point
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs(process.argv);

    if (args.help || !args.command) {
        console.log(HELP);
        process.exit(args.help ? 0 : 1);
    }

    switch (args.command) {
        case 'lock':
            await commandLock(args);
            break;
        default:
            console.error(`Unknown command: "${args.command}"\n`);
            console.log(HELP);
            process.exit(1);
    }
}

/* c8 ignore next 6 — CLI entry-point guard */
const isCLI =
    typeof process !== 'undefined' &&
    process.argv[1]?.endsWith('fusion') || process.argv[1]?.endsWith('fusion.js');
if (isCLI) {
    main().catch((err: Error) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}
