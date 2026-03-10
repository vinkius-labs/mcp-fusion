/**
 * CLI argument parser.
 * @module
 */
import type { IngestionVector, TransportLayer } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────

/** @internal Consume the next arg, throwing if it looks like a flag or is missing */
function consumeValue(args: string[], i: number, flag: string): string {
    const next = args[i + 1];
    if (next === undefined || next.startsWith('-')) {
        throw new Error(`Missing value for ${flag}`);
    }
    return next;
}

// ─── Types ───────────────────────────────────────────────────────

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
    // ── Deploy/Remote-specific ──
    token: string | undefined;
    serverId: string | undefined;
    remoteUrl: string | undefined;
    allowInsecure: boolean;
}

// ─── Parser ──────────────────────────────────────────────────────

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
        token: undefined,
        serverId: undefined,
        remoteUrl: undefined,
        allowInsecure: false,
    };

    let seenCommand = false;
    let seenProjectName = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
            case 'lock':
            case 'create':
            case 'dev':
            case 'deploy':
            case 'remote':
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
                result.server = consumeValue(args, i, arg);
                i++;
                break;
            case '-n':
            case '--name':
                result.name = consumeValue(args, i, arg);
                i++;
                break;
            case '--cwd':
                result.cwd = consumeValue(args, i, arg);
                i++;
                break;
            case '-h':
            case '--help':
                result.help = true;
                break;
            case '--transport':
                result.transport = consumeValue(args, i, arg) as TransportLayer;
                i++;
                break;
            case '--vector':
                result.vector = consumeValue(args, i, arg) as IngestionVector;
                i++;
                break;
            case '--testing':
                result.testing = true;
                break;
            case '--no-testing':
                result.testing = false;
                break;
            case '-d':
            case '--dir':
                result.dir = consumeValue(args, i, arg);
                i++;
                break;
            case '-y':
            case '--yes':
                result.yes = true;
                break;
            case '--token':
                result.token = consumeValue(args, i, arg);
                i++;
                break;
            case '--server-id':
                result.serverId = consumeValue(args, i, arg);
                i++;
                break;
            case '--allow-insecure':
                result.allowInsecure = true;
                break;
            default:
                if (!seenCommand) {
                    result.command = arg;
                    seenCommand = true;
                } else if (result.command === 'create' && !seenProjectName && !arg.startsWith('-')) {
                    result.projectName = arg;
                    seenProjectName = true;
                } else if (result.command === 'remote' && !arg.startsWith('-')) {
                    result.remoteUrl = arg;
                }
                break;
        }
    }

    return result;
}
