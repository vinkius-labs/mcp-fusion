/**
 * `vurb create` — interactive project scaffolding wizard.
 * @module
 */
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { CliArgs } from '../args.js';
import type { ProgressReporter } from '../progress.js';
import { ProgressTracker } from '../progress.js';
import { ansi, VALID_TRANSPORTS, VALID_VECTORS, VALID_TARGETS } from '../constants.js';
import { ask } from '../utils.js';
import { scaffold } from '../scaffold.js';
import type { ProjectConfig, TransportLayer, IngestionVector, DeployTarget } from '../types.js';

// ─── Validation ──────────────────────────────────────────────────

/** @internal */
function validateTransport(raw: string | undefined): TransportLayer {
    if (!raw) return 'stdio';
    if (VALID_TRANSPORTS.includes(raw as TransportLayer)) return raw as TransportLayer;
    process.stderr.write(`  ${ansi.red('⚠')} Unknown transport "${raw}" — using ${ansi.bold('stdio')}. Valid: ${VALID_TRANSPORTS.join(', ')}\n`);
    return 'stdio';
}

/** @internal */
function validateVector(raw: string | undefined): IngestionVector {
    if (!raw) return 'vanilla';
    if (VALID_VECTORS.includes(raw as IngestionVector)) return raw as IngestionVector;
    process.stderr.write(`  ${ansi.red('⚠')} Unknown vector "${raw}" — using ${ansi.bold('vanilla')}. Valid: ${VALID_VECTORS.join(', ')}\n`);
    return 'vanilla';
}

/** @internal */
function validateTarget(raw: string | undefined): DeployTarget {
    if (!raw) return 'node';
    if (VALID_TARGETS.includes(raw as DeployTarget)) return raw as DeployTarget;
    process.stderr.write(`  ${ansi.red('⚠')} Unknown target "${raw}" — using ${ansi.bold('node')}. Valid: ${VALID_TARGETS.join(', ')}\n`);
    return 'node';
}

// ─── Config Collection ───────────────────────────────────────────

/**
 * Collect project config — either from flags or interactive prompts.
 * @internal exported for testing
 */
export async function collectConfig(args: CliArgs): Promise<ProjectConfig | null> {
    // ── Fast-path: --yes skips all prompts
    if (args.yes) {
        const name = args.projectName ?? 'my-mcp-server';
        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z0-9]$/.test(name)) {
            process.stderr.write(`  ${ansi.red('✗')} Invalid name: must start with a letter/number, end with a letter/number, and contain only lowercase letters, numbers, and hyphens.\n`);
            return null;
        }

        const transport = validateTransport(args.transport);
        const vector = validateVector(args.vector);
        const target = validateTarget(args.target);

        return {
            name,
            transport,
            vector,
            testing: args.testing ?? true,
            target,
        };
    }

    // ── Interactive wizard
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    try {
        process.stderr.write(`\n  ${ansi.bold('Vurb')} ${ansi.dim('— Create a new MCP server')}\n\n`);

        const name = args.projectName ?? await ask(rl, 'Project name?', 'my-mcp-server');

        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z0-9]$/.test(name)) {
            process.stderr.write(`  ${ansi.red('✗')} Invalid name: must start with a letter/number, end with a letter/number, and contain only lowercase letters, numbers, and hyphens.\n`);
            return null;
        }

        const targetRaw = args.target ?? await ask(rl, 'Target? [node, vercel, cloudflare]', 'node');
        const target = validateTarget(targetRaw);

        // For vercel/cloudflare, transport is always HTTP (stateless JSON-RPC)
        let transport: TransportLayer;
        if (target === 'vercel' || target === 'cloudflare') {
            transport = 'sse';
        } else {
            const transportRaw = args.transport ?? await ask(rl, 'Transport? [stdio, sse]', 'stdio');
            transport = validateTransport(transportRaw);
        }

        const vectorRaw = args.vector ?? await ask(rl, 'Vector? [vanilla, prisma, n8n, openapi, oauth]', 'vanilla');
        const vector = validateVector(vectorRaw);

        const testingRaw = args.testing ?? (await ask(rl, 'Include testing?', 'yes')).toLowerCase();
        const testing = typeof testingRaw === 'boolean' ? testingRaw : testingRaw !== 'no';

        process.stderr.write('\n');
        return { name, transport, vector, testing, target };
    } finally {
        rl.close();
    }
}

// ─── Command ─────────────────────────────────────────────────────

/** @internal exported for testing */
export async function commandCreate(args: CliArgs, reporter?: ProgressReporter): Promise<void> {
    const progress = new ProgressTracker(reporter);

    const config = await collectConfig(args);
    if (!config) {
        process.exit(1);
    }

    const targetDir = resolve(args.cwd, config.name);

    if (existsSync(targetDir)) {
        process.stderr.write(`  ${ansi.red('✗')} Directory "${config.name}" already exists.\n`);
        process.exit(1);
    }

    progress.start('scaffold', 'Scaffolding project');
    const files = scaffold(targetDir, config);
    progress.done('scaffold', 'Scaffolding project', `${files.length} files`);

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

    const steps = [`cd ${config.name}`];
    if (config.target === 'vercel') {
        steps.push('npm run dev', '# MCP endpoint: POST http://localhost:3000/api/mcp', 'npx vercel deploy');
    } else if (config.target === 'cloudflare') {
        steps.push('npm run dev', '# MCP endpoint: POST http://localhost:8787/', 'npm run deploy');
    } else if (config.transport === 'sse') {
        steps.push('vurb dev', '# then connect Cursor or Claude to http://localhost:3001/mcp');
    } else {
        steps.push('vurb dev');
    }
    if (config.testing) steps.push('npm test');

    const targetLabel = config.target === 'vercel'
        ? ' (Vercel)'
        : config.target === 'cloudflare'
            ? ' (Cloudflare)'
            : '';

    process.stderr.write(`\n  ${ansi.green('✓')} ${ansi.bold(config.name)}${targetLabel} is ready!\n\n`);
    process.stderr.write(`  ${ansi.dim('Next steps:')}\n`);
    for (const step of steps) {
        process.stderr.write(`    ${ansi.cyan('$')} ${step}\n`);
    }

    if (config.target === 'vercel') {
        process.stderr.write(`\n  ${ansi.dim('Deploy:')} npx vercel deploy\n`);
    } else if (config.target === 'cloudflare') {
        process.stderr.write(`\n  ${ansi.dim('Deploy:')} npx wrangler deploy\n`);
    } else {
        process.stderr.write(`\n  ${ansi.dim('Cursor:')} .cursor/mcp.json is pre-configured — open in Cursor and go.\n`);
    }
    process.stderr.write(`  ${ansi.dim('Docs:')}   ${ansi.cyan('https://vurb.vinkius.com/')}\n\n`);
}
