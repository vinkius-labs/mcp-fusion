/**
 * vurb yaml — Subcommand handler for the @vurb/yaml plugin
 *
 * This module is dynamically imported by the `vurb` CLI when the user runs
 * `vurb yaml <subcommand>`. It is NOT a standalone CLI binary.
 *
 * ## DX
 * ```bash
 * vurb yaml validate               # validate a vurb.yaml manifest
 * vurb yaml dev                     # start local MCP server (stdio)
 * vurb yaml dev --transport http    # start with Streamable HTTP
 * vurb yaml dev --port 3001         # custom port for HTTP transport
 * ```
 *
 * @module
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseVurbYaml, VurbYamlError } from '../parser/VurbYamlParser.js';
import { loadYamlServer } from '../runtime/LocalServer.js';
import { createYamlMcpServer } from '../runtime/YamlMcpServer.js';

// ── ANSI (match @vurb/core style) ────────────────────────

const RST = '\x1b[0m';
const RED = '\x1b[31m';
const GRN = '\x1b[32m';
const CYN = '\x1b[36m';
const BLD = '\x1b[1m';
const DIM = '\x1b[2m';

function log(msg: string): void {
    process.stderr.write(msg + '\n');
}

// ── File Discovery ───────────────────────────────────────

function findYamlFile(fileArg?: string): string {
    if (fileArg) {
        const abs = resolve(fileArg);
        if (!existsSync(abs)) {
            log(`${RED}✗ File not found: ${fileArg}${RST}`);
            process.exit(1);
        }
        return abs;
    }

    for (const name of ['vurb.yaml', 'vurb.yml']) {
        const abs = resolve(name);
        if (existsSync(abs)) return abs;
    }

    log(`${RED}✗ No vurb.yaml found in current directory.${RST}`);
    log(`${DIM}  Create one or specify a path: vurb yaml dev ./path/to/vurb.yaml${RST}`);
    process.exit(1);
}

// ── Help ─────────────────────────────────────────────────

export const YAML_HELP = `
${BLD}vurb yaml${RST} — Declarative MCP Server Engine

${BLD}USAGE${RST}
  vurb yaml validate [file]          Validate a vurb.yaml manifest
  vurb yaml dev [file]               Start a local MCP dev server

${BLD}DEV OPTIONS${RST}
  --transport, -t ${CYN}<stdio|http>${RST}   Transport layer (default: stdio)
  --port, -p ${CYN}<number>${RST}            HTTP port (default: 3001)

${BLD}EXAMPLES${RST}
  ${DIM}vurb yaml validate${RST}
  ${DIM}vurb yaml dev${RST}
  ${DIM}vurb yaml dev --transport http --port 8080${RST}
  ${DIM}vurb yaml dev ./servers/my-server/vurb.yaml${RST}
`.trim();

// ── Internal Arg Parser ──────────────────────────────────

interface YamlArgs {
    subcommand: string;
    file: string | undefined;
    transport: 'stdio' | 'http';
    port: number;
    help: boolean;
}

function parseYamlArgs(argv: string[]): YamlArgs {
    const result: YamlArgs = {
        subcommand: '',
        file: undefined,
        transport: 'stdio',
        port: 3001,
        help: false,
    };

    // argv: ['node', 'vurb', 'yaml', 'dev', '--port', '3001', ...]
    // We start parsing from index 3 (after 'yaml')
    const args = argv.slice(3);
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--transport' || arg === '-t') {
            const val = args[++i];
            if (val === 'http' || val === 'stdio') result.transport = val;
        } else if (arg === '--port' || arg === '-p') {
            result.port = parseInt(args[++i] ?? '3001', 10);
        } else if (!arg.startsWith('-')) {
            positional.push(arg);
        }
    }

    result.subcommand = positional[0] ?? '';
    result.file = positional.length > 1 ? positional[1]! : undefined;
    return result;
}

// ── Subcommands ──────────────────────────────────────────

async function subValidate(fileArg: string | undefined): Promise<void> {
    const filePath = findYamlFile(fileArg);
    const yaml = readFileSync(filePath, 'utf-8');

    log(`${DIM}Validating ${filePath}...${RST}`);

    try {
        const spec = parseVurbYaml(yaml);

        log(`${GRN}✓ Valid vurb.yaml${RST}`);
        log('');
        log(`  ${BLD}Server:${RST}      ${spec.server.name}`);
        if (spec.server.description) {
            log(`  ${BLD}Description:${RST} ${spec.server.description}`);
        }
        log(`  ${BLD}Tools:${RST}       ${spec.tools?.length ?? 0}`);
        log(`  ${BLD}Resources:${RST}   ${spec.resources?.length ?? 0}`);
        log(`  ${BLD}Prompts:${RST}     ${spec.prompts?.length ?? 0}`);
        log(`  ${BLD}Connections:${RST} ${Object.keys(spec.connections ?? {}).length}`);
        log(`  ${BLD}Secrets:${RST}     ${Object.keys(spec.secrets ?? {}).length}`);

        if (spec.tools) {
            log('');
            log(`  ${BLD}Tool list:${RST}`);
            for (const tool of spec.tools) {
                const tag = tool.tag ? ` ${DIM}[${tool.tag}]${RST}` : '';
                log(`    • ${tool.name}${tag} — ${tool.description}`);
            }
        }
    } catch (e) {
        if (e instanceof VurbYamlError) {
            log(`${RED}✗ Validation failed${RST}`);
            log('');
            for (const err of e.details ?? [e.message]) {
                log(`  ${RED}•${RST} ${err}`);
            }
            process.exit(1);
        }
        throw e;
    }
}

async function subDev(
    fileArg: string | undefined,
    transport: 'stdio' | 'http',
    port: number,
): Promise<void> {
    const filePath = findYamlFile(fileArg);
    const yaml = readFileSync(filePath, 'utf-8');

    log(`${DIM}Loading ${filePath}...${RST}`);

    try {
        const compiled = await loadYamlServer(yaml);

        log(`${GRN}✓ vurb.yaml compiled${RST}`);
        log(`  ${BLD}${compiled.tools.length}${RST} tools, ${BLD}${compiled.resources.length}${RST} resources, ${BLD}${compiled.prompts.length}${RST} prompts`);

        if (compiled.settings?.dlp?.enabled || compiled.settings?.finops?.enabled) {
            log(`  ${DIM}⚠ settings.dlp/finops defined but only enforced on Vinkius Cloud${RST}`);
        }

        log('');

        await createYamlMcpServer(compiled, { transport, port });

        process.on('SIGINT', () => {
            log(`\n${DIM}Shutting down...${RST}`);
            process.exit(0);
        });
    } catch (e) {
        if (e instanceof VurbYamlError) {
            log(`${RED}✗ Failed to compile${RST}`);
            for (const err of e.details ?? [e.message]) {
                log(`  ${RED}•${RST} ${err}`);
            }
            process.exit(1);
        }
        log(`${RED}✗ ${e instanceof Error ? e.message : String(e)}${RST}`);
        process.exit(1);
    }
}

// ── Entry Point (called by @vurb/core CLI) ───────────────

/**
 * Handle the `vurb yaml` command group.
 *
 * Called by the core `vurb` CLI via dynamic import when the user runs
 * any `vurb yaml ...` command. The raw `process.argv` is re-parsed
 * internally to extract yaml-specific subcommands and flags.
 *
 * @example
 * ```typescript
 * // Inside @vurb/core vurb.ts:
 * case 'yaml': {
 *     const { commandYaml } = await import('@vurb/yaml');
 *     await commandYaml();
 *     break;
 * }
 * ```
 */
export async function commandYaml(): Promise<void> {
    const args = parseYamlArgs(process.argv);

    if (args.help || !args.subcommand) {
        log(YAML_HELP);
        process.exit(args.help ? 0 : 1);
    }

    switch (args.subcommand) {
        case 'validate':
            await subValidate(args.file);
            break;
        case 'dev':
            await subDev(args.file, args.transport, args.port);
            break;
        default:
            log(`${RED}Unknown yaml subcommand: "${args.subcommand}"${RST}`);
            log('');
            log(YAML_HELP);
            process.exit(1);
    }
}
