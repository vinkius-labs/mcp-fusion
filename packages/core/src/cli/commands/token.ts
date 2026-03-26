/**
 * `vurb token` — manage deploy token in .vurbrc.
 * @module
 */
import type { CliArgs } from '../args.js';
import { ansi, VINKIUS_CLOUD_URL } from '../constants.js';
import { readVurbRc, writeVurbRc } from '../rc.js';

/** Mask a token for display: show prefix + last 4 chars */
function maskToken(token: string): string {
    if (token.length <= 12) return '••••••••';
    const prefix = token.slice(0, token.indexOf('_', 3) + 1) || token.slice(0, 3);
    const suffix = token.slice(-4);
    return `${prefix}${'•'.repeat(8)}${suffix}`;
}

export async function commandToken(args: CliArgs): Promise<void> {
    const cwd = args.cwd;

    // vurb token --clear — remove token from .vurbrc
    if (args.clearToken) {
        const config = readVurbRc(cwd);
        if (!config.token) {
            process.stderr.write(`  ${ansi.yellow('⚠')} No token configured.\n`);
            return;
        }
        const { token: _, ...rest } = config;
        writeVurbRc(cwd, rest);
        process.stderr.write(`  ${ansi.green('✓')} Token removed from .vurbrc\n`);
        return;
    }

    // vurb token <value> — set token and auto-resolve serverId
    if (args.tokenValue) {
        writeVurbRc(cwd, { token: args.tokenValue });
        process.stderr.write(`  ${ansi.green('✓')} Token saved to .vurbrc ${ansi.dim(`(${maskToken(args.tokenValue)})`)}\n`);

        // Auto-resolve which server this token belongs to
        const rc = readVurbRc(cwd);
        const remote = rc.remote ?? VINKIUS_CLOUD_URL;
        try {
            const res = await fetch(`${remote.replace(/\/+$/, '')}/token/info`, {
                headers: { 'Authorization': `Bearer ${args.tokenValue}`, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5_000),
            });
            if (res.ok) {
                const data = await res.json() as { server_id?: string; server_name?: string };
                if (data.server_id) {
                    writeVurbRc(cwd, { serverId: data.server_id });
                    process.stderr.write(`  ${ansi.green('✓')} Server ID resolved: ${ansi.cyan(data.server_id)}${data.server_name ? ansi.dim(` (${data.server_name})`) : ''}\n`);
                }
            }
        } catch { /* API unreachable — token still saved, user can set serverId manually */ }
        return;
    }

    // vurb token — show current token status
    const config = readVurbRc(cwd);
    const envToken = process.env['VURB_DEPLOY_TOKEN'];

    process.stderr.write(`\n  ${ansi.bold('Token Configuration')}\n\n`);

    if (config.token) {
        process.stderr.write(`  ${ansi.dim('.vurbrc:')}   ${ansi.green(maskToken(config.token))}\n`);
    } else {
        process.stderr.write(`  ${ansi.dim('.vurbrc:')}   ${ansi.yellow('not set')}\n`);
    }

    if (envToken) {
        process.stderr.write(`  ${ansi.dim('env:')}       ${ansi.green(maskToken(envToken))}\n`);
    } else {
        process.stderr.write(`  ${ansi.dim('env:')}       ${ansi.yellow('not set')}\n`);
    }

    if (!config.token && !envToken) {
        process.stderr.write(`\n  ${ansi.dim('Quick setup:')}\n`);
        process.stderr.write(`    ${ansi.cyan('$')} vurb token <your-token>\n\n`);
    } else {
        process.stderr.write('\n');
    }
}
