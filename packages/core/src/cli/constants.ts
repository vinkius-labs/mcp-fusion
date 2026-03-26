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
export const VURB_VERSION: string = (() => {
    try { return (_require('../../package.json') as { version: string }).version; }
    catch { return '0.0.0'; }
})();

/** Default API endpoint — Vinkius Cloud production */
export const VINKIUS_CLOUD_URL = 'https://deploy.vinkius.com';

// ─── Validation Constants ────────────────────────────────────────

export const VALID_TRANSPORTS = ['stdio', 'sse'] as const;
export const VALID_VECTORS = ['vanilla', 'prisma', 'n8n', 'openapi', 'oauth'] as const;
export const VALID_TARGETS = ['vinkius', 'vercel', 'cloudflare'] as const;

// ─── Help Text ───────────────────────────────────────────────────

/** @internal exported for testing */
export const HELP = `
vurb — Vurb CLI

USAGE
  vurb create <name>                Scaffold a new Vurb server
  vurb dev --server <entry>         Start HMR dev server with auto-reload
  vurb lock                         Generate or update ${LOCKFILE_NAME}
  vurb lock --check                 Verify lockfile is up to date (CI gate)
  vurb deploy                       Bundle, compress & deploy to Edge
  vurb remote                       Show current remote configuration
  vurb token                        Show current token status
  vurb inspect                      Launch the real-time TUI dashboard
  vurb insp --demo                  Launch TUI with built-in simulator

CREATE OPTIONS
  --transport <stdio|sse>  Transport layer (default: stdio)
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
  --token <token>          Override VURB_DEPLOY_TOKEN (connection token)
  --allow-insecure         Suppress HTTP plaintext warning

REMOTE OPTIONS
  vurb remote <url>          Override API endpoint (default: Vinkius Cloud)
  vurb remote --server-id <id>  Set target server UUID
  --token <token>            Save deploy token to .vurbrc

TOKEN OPTIONS
  vurb token <token>         Save deploy token to .vurbrc
  vurb token                 Show current token status (masked)
  vurb token --clear         Remove token from .vurbrc

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
  vurb create my-server
  vurb create my-server -y
  vurb create my-server --vector prisma --transport sse
  vurb dev --server ./src/server.ts
  vurb dev --server ./src/server.ts --dir ./src/tools
  vurb lock --server ./src/server.ts
  vurb deploy
  vurb remote --server-id abc-123-def
  vurb remote --server-id abc-123-def --token vk_live_xxx
  vurb remote http://localhost:8080 --server-id abc-123-def
  vurb token vk_live_9hfaJlIPOv5xZh
  vurb token --clear
  vurb inspect --demo
  vurb insp --pid 12345
`.trim();
