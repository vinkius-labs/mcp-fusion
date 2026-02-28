#!/usr/bin/env node
/**
 * Davinci CLI — MCP Fusion Command Nexus
 *
 * Launch the interactive TUI or headless stderr logger that connects
 * to a running MCP Fusion server via Shadow Socket IPC.
 *
 * USAGE
 *   fusion davinci             Auto-discover and connect (TUI)
 *   fusion dv                  Alias for davinci
 *   fusion dv --demo           Launch with built-in simulator
 *   fusion dv --out stderr     Headless log stream (ECS/K8s/CI)
 *   fusion dv --pid <pid>      Connect to a specific server process
 *   fusion dv --path <path>    Connect via custom IPC path
 *   fusion dv --help           Show help
 *
 * @module
 */
import { commandTop } from '../CommandTop.js';

// ============================================================================
// Arg Parser
// ============================================================================

export type OutputMode = 'tui' | 'stderr';

export interface DavinciArgs {
    pid: number | undefined;
    path: string | undefined;
    out: OutputMode;
    demo: boolean;
    help: boolean;
}

export function parseDavinciArgs(argv: string[]): DavinciArgs {
    const result: DavinciArgs = {
        pid: undefined,
        path: undefined,
        out: 'tui',
        demo: false,
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        switch (arg) {
            case '--pid':
            case '-p': {
                const val = argv[++i];
                if (val) result.pid = parseInt(val, 10);
                break;
            }
            case '--path':
                result.path = argv[++i];
                break;
            case '--out':
            case '-o': {
                const val = argv[++i];
                if (val === 'stderr') result.out = 'stderr';
                break;
            }
            case '--demo':
                result.demo = true;
                break;
            case '-h':
            case '--help':
                result.help = true;
                break;
        }
    }

    return result;
}

// ============================================================================
// Help
// ============================================================================

export const DAVINCI_HELP = `
\x1b[1m\x1b[36mfusion davinci\x1b[0m — Command Nexus TUI

  Real-time interactive terminal dashboard for MCP Fusion servers.
  Connects via Shadow Socket (IPC) for zero stdio interference.

\x1b[1mUSAGE\x1b[0m
  fusion davinci               Auto-discover and connect (TUI)
  fusion dv                    Alias for davinci
  fusion dv --demo             Launch with built-in simulator
  fusion dv --out stderr       Headless log stream (ECS/K8s/CI)
  fusion dv --out stderr --demo  Simulator + stderr output
  fusion dv --pid <pid>        Connect to a specific server PID
  fusion dv --path <path>      Connect via custom IPC path

\x1b[1mOPTIONS\x1b[0m
  --demo               Launch built-in simulator (no server needed)
  --out, -o <mode>     Output mode: tui (default), stderr (headless)
  --pid, -p <pid>      Target server process ID
  --path <path>        Custom IPC socket/pipe path
  --help, -h           Show this help message

\x1b[1mKEYBOARD (TUI mode)\x1b[0m
  ↑↓ / j/k             Navigate tool list
  Enter                 Inspect selected tool
  q / Ctrl+C            Exit

\x1b[1mEXAMPLES\x1b[0m
  fusion dv --demo                      \x1b[2m# Interactive demo\x1b[0m
  fusion dv --out stderr --demo         \x1b[2m# Headless demo (ECS/K8s)\x1b[0m
  fusion dv --pid 12345                 \x1b[2m# Connect to running server\x1b[0m
  fusion dv --out stderr | tee log.txt  \x1b[2m# Stream + save\x1b[0m

\x1b[2mhttps://mcp-fusion.vinkius.com/\x1b[0m
`.trim();

// ============================================================================
// Entry Point
// ============================================================================

/**
 * Execute the davinci command.
 * Called from the core `fusion` CLI or directly.
 *
 * @param argv - Command arguments (without the `fusion davinci` prefix)
 */
export async function runDavinci(argv: string[]): Promise<void> {
    const args = parseDavinciArgs(argv);

    if (args.help) {
        console.log(DAVINCI_HELP);
        return;
    }

    // ── Demo Mode: Built-in Simulator ─────────────────────
    if (args.demo) {
        const { startSimulator } = await import('../Simulator.js');
        const bus = await startSimulator();

        // Small delay for the bus to start listening
        await new Promise(r => setTimeout(r, 100));

        if (args.out === 'stderr') {
            // Headless: stream events to stderr
            process.stderr.write('\x1b[2m  Simulator started. Streaming to stderr…\x1b[0m\n\n');
            const { streamToStderr } = await import('../StreamLogger.js');
            await streamToStderr({ path: bus.path });
        } else {
            // Interactive TUI
            if (!process.stdout.isTTY) {
                process.stderr.write(
                    '\x1b[31m✗\x1b[0m TUI requires an interactive terminal.\n' +
                    '  Use \x1b[1m--out stderr\x1b[0m for headless environments.\n',
                );
                await bus.close();
                process.exit(1);
            }
            process.stderr.write('\x1b[2m  Simulator started. Launching TUI…\x1b[0m\n');
            await commandTop({ path: bus.path });
        }

        await bus.close();
        return;
    }

    // ── Stderr Mode: Headless Log Stream ──────────────────
    if (args.out === 'stderr') {
        const { streamToStderr } = await import('../StreamLogger.js');
        await streamToStderr({
            ...(args.pid !== undefined && { pid: args.pid }),
            ...(args.path !== undefined && { path: args.path }),
        });
        return;
    }

    // ── Normal TUI Mode ───────────────────────────────────
    if (!process.stdout.isTTY) {
        process.stderr.write(
            '\x1b[31m✗\x1b[0m TUI requires an interactive terminal.\n' +
            '  Use \x1b[1m--out stderr\x1b[0m for headless environments.\n',
        );
        process.exit(1);
    }

    await commandTop({
        ...(args.pid !== undefined && { pid: args.pid }),
        ...(args.path !== undefined && { path: args.path }),
    });
}

// ── Standalone execution ──────────────────────────────────
const isMainModule = process.argv[1]?.includes('davinci');
if (isMainModule) {
    runDavinci(process.argv.slice(2)).catch((err: Error) => {
        console.error(`\x1b[31m✗\x1b[0m ${err.message}`);
        process.exit(1);
    });
}
