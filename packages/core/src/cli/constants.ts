/**
 * CLI constants — version, help text, ANSI styling.
 * @module
 */
import { createRequire } from 'node:module';
import { LOCKFILE_NAME } from '../introspection/CapabilityLockfile.js';

// ─── ANSI Styling (zero dependencies) ────────────────────────────

/** @internal exported for testing */
export const ansi = {
    cyan:   (s: string): string => `\x1b[36m${s}\x1b[0m`,
    green:  (s: string): string => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string): string => `\x1b[33m${s}\x1b[0m`,
    dim:    (s: string): string => `\x1b[2m${s}\x1b[0m`,
    bold:   (s: string): string => `\x1b[1m${s}\x1b[0m`,
    red:    (s: string): string => `\x1b[31m${s}\x1b[0m`,
    reset: '\x1b[0m',
} as const;

// ─── Version ─────────────────────────────────────────────────────

/** @internal exported for testing */
const _require = createRequire(import.meta.url);
export const MCPFUSION_VERSION: string = (() => {
    try { return (_require('../../package.json') as { version: string }).version; }
    catch { return '0.0.0'; }
})();

/** Default API endpoint — Vinkius Cloud production */
export const VINKIUS_CLOUD_URL = 'https://deploy.vinkius.com';

// ─── Validation Constants ────────────────────────────────────────

export const VALID_TRANSPORTS = ['stdio', 'http'] as const;
export const VALID_VECTORS = ['vanilla', 'prisma', 'n8n', 'openapi', 'oauth'] as const;
export const VALID_TARGETS = ['vinkius', 'vercel', 'cloudflare'] as const;

// ─── Help Text ───────────────────────────────────────────────────

/** @internal exported for testing */
export const HELP = `
MCP Fusion — MCP Fusion CLI

USAGE
  mcpfusion create <name>                Scaffold a new MCP mcpfusion server
  mcpfusion dev --server <entry>         Start HMR dev server with auto-reload
  mcpfusion lock                         Generate or update ${LOCKFILE_NAME}
  mcpfusion lock --check                 Verify lockfile is up to date (CI gate)
  mcpfusion deploy                       Bundle, compress & deploy to Edge
  mcpfusion remote                       Show current remote configuration
  mcpfusion token                        Show current token status
  mcpfusion inspect                      Launch the real-time TUI dashboard
  mcpfusion insp --demo                  Launch TUI with built-in simulator
  mcpfusion version                      Show CLI and installed package versions
  mcpfusion update                       Update all @mcpfusion/* packages to latest
  mcpfusion doctor                       Run environment diagnostics
  mcpfusion validate                     Validate server tools, schemas & lockfile
  mcpfusion yaml                          Declarative MCP server engine (mcpfusion.yaml)

CREATE OPTIONS
  --transport <stdio|http>  Transport layer (default: stdio)
  --vector <type>          Ingestion vector: vanilla, prisma, n8n, openapi, oauth
  --target <platform>      Deploy target: vinkius (default), vercel, cloudflare
  --testing                Include test suite (default: true)
  --no-testing             Skip test suite
  --yes, -y                Skip prompts, use defaults

DEV OPTIONS
  --server, -s <path>      Path to server entrypoint (default: auto-detect)
  --dir, -d <path>         Directory to watch for changes (default: auto-detect from server)

DEPLOY OPTIONS
  --server, -s <path>      Path to server entrypoint (default: auto-detect)
  --token <token>          Override MCPFUSION_DEPLOY_TOKEN (connection token)
  --no-marketplace         Skip marketplace manifest (deploy code only)
  --allow-insecure         Suppress HTTP plaintext warning

REMOTE OPTIONS
  mcpfusion remote <url>          Override API endpoint (default: Vinkius Cloud)
  mcpfusion remote --server-id <id>  Set target server UUID
  --token <token>            Save deploy token to .mcpfusionrc

TOKEN OPTIONS
  mcpfusion token <token>         Save deploy token to .mcpfusionrc
  mcpfusion token                 Show current token status (masked)
  mcpfusion token --clear         Remove token from .mcpfusionrc

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
  mcpfusion create my-server
  mcpfusion create my-server -y
  mcpfusion create my-server --vector prisma --transport http
  mcpfusion dev --server ./src/server.ts
  mcpfusion dev --server ./src/server.ts --dir ./src/tools
  mcpfusion lock --server ./src/server.ts
  mcpfusion deploy
  mcpfusion remote --server-id abc-123-def
  mcpfusion remote --server-id abc-123-def --token vk_live_xxx
  mcpfusion remote http://localhost:8080 --server-id abc-123-def
  mcpfusion token vk_live_9hfaJlIPOv5xZh
  mcpfusion token --clear
  mcpfusion inspect --demo
  mcpfusion insp --pid 12345
  mcpfusion version
  mcpfusion update
  mcpfusion doctor
  mcpfusion validate
  mcpfusion validate --server ./src/server.ts
  mcpfusion yaml validate
  mcpfusion yaml dev
  mcpfusion yaml dev --transport http --port 3001
`.trim();
