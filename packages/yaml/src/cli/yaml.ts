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
  vurb yaml deploy [file]            Deploy manifest to Vinkius Cloud

${BLD}DEV OPTIONS${RST}
  --transport, -t ${CYN}<stdio|http>${RST}   Transport layer (default: stdio)
  --port, -p ${CYN}<number>${RST}            HTTP port (default: 3001)

${BLD}DEPLOY OPTIONS${RST}
  --token ${CYN}<token>${RST}                Connection token (or use .vurbrc / VURB_DEPLOY_TOKEN)

${BLD}EXAMPLES${RST}
  ${DIM}vurb yaml validate${RST}
  ${DIM}vurb yaml dev${RST}
  ${DIM}vurb yaml dev --transport http --port 8080${RST}
  ${DIM}vurb yaml deploy${RST}
  ${DIM}vurb yaml deploy ./servers/my-api/vurb.yaml --token vk_xxxxx${RST}
`.trim();

// ── Internal Arg Parser ──────────────────────────────────

interface YamlArgs {
    subcommand: string;
    file: string | undefined;
    transport: 'stdio' | 'http';
    port: number;
    token: string | undefined;
    help: boolean;
}

function parseYamlArgs(argv: string[]): YamlArgs {
    const result: YamlArgs = {
        subcommand: '',
        file: undefined,
        transport: 'stdio',
        port: 3001,
        token: undefined,
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
        } else if (arg === '--token') {
            result.token = args[++i];
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

// ── Deploy ───────────────────────────────────────────────

const VINKIUS_CLOUD_URL = 'https://api.vinkius.com';
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function maskToken(token: string): string {
    if (token.length <= 8) return '****';
    return token.slice(0, 4) + '…' + token.slice(-4);
}

async function subDeploy(
    fileArg: string | undefined,
    tokenArg: string | undefined,
): Promise<void> {
    const filePath = findYamlFile(fileArg);
    const yaml = readFileSync(filePath, 'utf-8');

    // ── 1. Local validation ──────────────────────────────
    log(`${DIM}Validating ${filePath}...${RST}`);

    let spec: ReturnType<typeof parseVurbYaml>;
    try {
        spec = parseVurbYaml(yaml);
    } catch (e) {
        if (e instanceof VurbYamlError) {
            log(`${RED}✗ Validation failed — fix errors before deploying${RST}`);
            for (const err of e.details ?? [e.message]) {
                log(`  ${RED}•${RST} ${err}`);
            }
            process.exit(1);
        }
        throw e;
    }

    log(`${GRN}✓ Valid vurb.yaml${RST}  ${spec.tools?.length ?? 0} tools, ${spec.resources?.length ?? 0} resources, ${spec.prompts?.length ?? 0} prompts`);

    // ── 2. Resolve credentials ───────────────────────────
    // Priority: --token flag > VURB_DEPLOY_TOKEN env > .vurbrc
    let token = tokenArg ?? process.env['VURB_DEPLOY_TOKEN'];
    let serverId: string | undefined;
    let remote = VINKIUS_CLOUD_URL;

    try {
        const { readVurbRc, loadEnv } = await import('@vurb/core/cli');
        const cwd = process.cwd();
        loadEnv(cwd);
        const rc = readVurbRc(cwd);
        if (!token) token = rc.token;
        serverId = rc.serverId;
        if (rc.remote) remote = rc.remote;
    } catch {
        // @vurb/core/cli not available — rely on env/flag only
    }

    if (!token) {
        log(`${RED}✗ No deploy token found${RST}`);
        log(`  ${DIM}Set via: --token <token>, VURB_DEPLOY_TOKEN env, or vurb token <token>${RST}`);
        process.exit(1);
    }

    // ── 3. Resolve serverId from token ───────────────────
    if (!serverId) {
        log(`${DIM}Resolving server from token...${RST}`);
        try {
            const infoRes = await fetch(`${remote.replace(/\/+$/, '')}/token/info`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10_000),
            });
            if (infoRes.ok) {
                const info = await infoRes.json() as { server_id: string; server_name: string };
                serverId = info.server_id;
                log(`  ${GRN}✓${RST} ${info.server_name} ${DIM}(${serverId})${RST}`);
            } else {
                log(`${RED}✗ Token rejected (HTTP ${infoRes.status})${RST}`);
                log(`  ${DIM}Check your token or set serverId in .vurbrc${RST}`);
                process.exit(1);
            }
        } catch (e) {
            log(`${RED}✗ Cannot reach Vinkius Cloud: ${e instanceof Error ? e.message : String(e)}${RST}`);
            process.exit(1);
        }
    }

    if (!SAFE_ID.test(serverId)) {
        log(`${RED}✗ Invalid server ID: ${serverId}${RST}`);
        process.exit(1);
    }

    // ── 4. Deploy ────────────────────────────────────────
    log(`${DIM}Deploying to ${remote}...${RST}`);

    const url = `${remote.replace(/\/+$/, '')}/servers/${encodeURIComponent(serverId)}/yaml-deploy`;

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify({ yaml_spec: yaml }),
            signal: AbortSignal.timeout(30_000),
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`${RED}✗ Network error: ${msg}${RST}`);
        process.exit(1);
    }

    if (!res.ok) {
        const errBody = await res.text();
        let message = `HTTP ${res.status}`;
        let errors: string[] = [];

        try {
            const parsed = JSON.parse(errBody) as { message?: string; errors?: string[] };
            message = parsed.message ?? message;
            errors = parsed.errors ?? [];
        } catch { /* use status code */ }

        if (res.status === 401) {
            message = 'token revoked or invalid — check your dashboard';
        } else if (res.status === 403) {
            message = 'token does not belong to this server';
        }

        log(`${RED}✗ Deploy failed: ${message}${RST}`);
        for (const err of errors) {
            log(`  ${RED}•${RST} ${err}`);
        }
        process.exit(1);
    }

    const data = await res.json() as {
        status: string;
        server_id: string;
        message: string;
        warnings?: string[];
    };

    // ── 5. Output ────────────────────────────────────────
    log('');
    log(`  ${GRN}✓ YAML manifest deployed${RST}`);
    log(`  ${DIM}Server:${RST} ${data.server_id}`);
    log(`  ${DIM}Token:${RST}  ${maskToken(token)}`);

    if (spec.tools && spec.tools.length > 0) {
        log('');
        log(`  ${BLD}${spec.tools.length}${RST} ${spec.tools.length === 1 ? 'tool' : 'tools'} registered:`);
        for (const tool of spec.tools) {
            const tag = tool.tag ? ` ${DIM}[${tool.tag}]${RST}` : '';
            log(`    ${GRN}●${RST} ${tool.name}${tag}`);
        }
    }

    if (data.warnings && data.warnings.length > 0) {
        log('');
        for (const w of data.warnings) {
            log(`  ${CYN}⚠${RST} ${w}`);
        }
    }

    log('');
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
        case 'deploy':
            await subDeploy(args.file, args.token);
            break;
        default:
            log(`${RED}Unknown yaml subcommand: "${args.subcommand}"${RST}`);
            log('');
            log(YAML_HELP);
            process.exit(1);
    }
}
