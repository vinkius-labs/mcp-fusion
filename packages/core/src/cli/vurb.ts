#!/usr/bin/env node
/**
 * Vurb CLI
 *
 * Slim entry point: parses args, dispatches to command modules.
 * All logic lives in focused modules under `./commands/`.
 *
 * @module
 */
import { parseArgs } from './args.js';
import { HELP } from './constants.js';
import { commandLock } from './commands/lock.js';
import { commandDev } from './commands/dev.js';
import { commandCreate } from './commands/create.js';
import { commandRemote } from './commands/remote.js';
import { commandDeploy } from './commands/deploy.js';
import { commandToken } from './commands/token.js';
import { commandVersion } from './commands/version.js';
import { commandUpdate } from './commands/update.js';
import { commandDoctor } from './commands/doctor.js';
import { commandValidate } from './commands/validate.js';

// ─── Re-exports (backward compat — tests import from vurb.js) ──

export { parseArgs } from './args.js';
export type { CliArgs } from './args.js';
export { VURB_VERSION, HELP, ansi } from './constants.js';
export type { StepStatus, ProgressStep, ProgressReporter } from './progress.js';
export { ProgressTracker, createDefaultReporter } from './progress.js';
export type { RegistryLike, PromptRegistryLike } from './registry.js';
export { resolveRegistry } from './registry.js';
export { collectConfig } from './commands/create.js';
export { commandLock, commandDev, commandCreate, commandToken, commandVersion, commandUpdate, commandDoctor, commandValidate };
export { ask } from './utils.js';

// ─── Main ────────────────────────────────────────────────────────

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
            process.exit(0);
            break;
        case 'deploy':
            await commandDeploy(args);
            process.exit(0);
            break;
        case 'remote':
            commandRemote(args);
            break;
        case 'token':
            await commandToken(args);
            break;
        case 'inspect':
        case 'insp':
        case 'debug':
        case 'dbg': {
            const inspectArgv = process.argv.slice(3);
            try {
                const { runInspector } = await import('@vurb/inspector');
                await runInspector(inspectArgv);
            } catch {
                console.error(
                    `\x1b[31m\u2717\x1b[0m The inspector TUI requires the optional package:\n\n` +
                    `  npm install @vurb/inspector\n`,
                );
                process.exit(1);
            }
            break;
        }
        case 'version':
            await commandVersion(args);
            break;
        case 'update':
            await commandUpdate(args);
            break;
        case 'doctor':
            await commandDoctor(args);
            break;
        case 'validate':
            await commandValidate(args);
            process.exit(0);
            break;
        case 'yaml': {
            try {
                const pkg = '@vurb/yaml';
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const { commandYaml } = await import(pkg);
                await commandYaml();
            } catch {
                console.error(
                    `\x1b[31m\u2717\x1b[0m The YAML engine requires the optional package:\n\n` +
                    `  npm install @vurb/yaml\n`,
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

/* c8 ignore next 9 — CLI entry-point guard */
function detectCLI(): boolean {
    if (typeof process === 'undefined' || !process.argv[1]) return false;
    const base = process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '';
    // Strip extension (.js, .cjs, .mjs, .cmd, .ps1, .exe, etc.)
    const name = base.replace(/\.[a-z0-9]+$/i, '');
    return name === 'vurb';
}
if (detectCLI()) {
    main().catch((err: Error) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}
