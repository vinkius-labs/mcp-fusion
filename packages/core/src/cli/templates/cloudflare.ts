/**
 * Cloudflare Templates — Workers scaffold for @vurb/cloudflare
 *
 * Generates a complete Cloudflare Worker project that exposes an MCP
 * server via `cloudflareWorkersAdapter()`. Deploy with `wrangler deploy`.
 *
 * @module
 */
import type { ProjectConfig } from '../types.js';
import { CORE_VERSION, MCP_SDK_VERSION, CLOUDFLARE_ADAPTER_VERSION, ZOD_VERSION, TESTING_VERSION } from './constants.js';

/** Generate `package.json` for Cloudflare Workers project */
export function cloudflarePackageJson(config: ProjectConfig): string {
    const deps: Record<string, string> = {
        '@modelcontextprotocol/sdk': MCP_SDK_VERSION,
        '@vurb/core': CORE_VERSION,
        '@vurb/cloudflare': CLOUDFLARE_ADAPTER_VERSION,
        'zod': ZOD_VERSION,
    };

    if (config.vector === 'prisma') {
        deps['@prisma/client'] = '^6.0.0';
        deps['@vurb/prisma-gen'] = '^1.0.0';
    }
    if (config.vector === 'oauth') {
        deps['@vurb/oauth'] = '^1.0.0';
    }

    const devDeps: Record<string, string> = {
        'typescript': '^5.7.3',
        '@types/node': '^22.0.0',
        '@cloudflare/workers-types': '^4.0.0',
        'wrangler': '^3.0.0',
    };

    if (config.vector === 'prisma') {
        devDeps['prisma'] = '^6.0.0';
    }
    if (config.testing) {
        devDeps['vitest'] = '^3.0.5';
        devDeps['@vurb/testing'] = TESTING_VERSION;
    }

    const scripts: Record<string, string> = {
        'dev': 'wrangler dev',
        'deploy': 'wrangler deploy',
        'build': 'tsc',
        'typecheck': 'tsc --noEmit',
    };

    if (config.testing) {
        scripts['test'] = 'vitest run';
        scripts['test:watch'] = 'vitest';
    }
    if (config.vector === 'prisma') {
        scripts['db:generate'] = 'prisma generate';
        scripts['db:push'] = 'prisma db push';
    }

    const pkg = {
        name: config.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts,
        dependencies: deps,
        devDependencies: devDeps,
        engines: { node: '>=18.0.0' },
    };

    return JSON.stringify(pkg, null, 4) + '\n';
}

/** Generate `tsconfig.json` for Cloudflare Workers */
export function cloudflareTsconfig(): string {
    return JSON.stringify({
        compilerOptions: {
            target: 'es2022',
            module: 'es2022',
            moduleResolution: 'bundler',
            declaration: true,
            sourceMap: true,
            strict: true,
            noUncheckedIndexedAccess: true,
            noFallthroughCasesInSwitch: true,
            exactOptionalPropertyTypes: true,
            noImplicitOverride: true,
            noPropertyAccessFromIndexSignature: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            skipLibCheck: true,
            lib: ['es2022'],
            types: ['@cloudflare/workers-types'],
            rootDir: './src',
            outDir: './dist',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'tests'],
    }, null, 4) + '\n';
}

/** Generate `wrangler.toml` */
export function cloudflareWranglerToml(config: ProjectConfig): string {
    return `name = "${config.name}"
main = "src/worker.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

# ── Bindings ────────────────────────────────────────
# Uncomment to enable Cloudflare services:

# [vars]
# MY_SECRET = "value"

# [[d1_databases]]
# binding = "DB"
# database_name = "${config.name}-db"
# database_id = "<your-database-id>"

# [[kv_namespaces]]
# binding = "KV"
# id = "<your-kv-namespace-id>"

# [[r2_buckets]]
# binding = "BUCKET"
# bucket_name = "${config.name}-bucket"
`;
}

/** Generate `src/worker.ts` — The Worker entry point */
export function cloudflareWorkerTs(config: ProjectConfig): string {
    return `/**
 * Cloudflare Worker — MCP Server
 *
 * Exposes your Vurb tools as a stateless MCP endpoint.
 * Connect any MCP client to: POST https://your-worker.workers.dev/
 */
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
import { registry } from './registry.js';
import { createContext } from './context.js';

export interface Env {
    // Add your Cloudflare bindings here:
    // DB: D1Database;
    // KV: KVNamespace;
    // BUCKET: R2Bucket;
}

export default cloudflareWorkersAdapter<Env, ReturnType<typeof createContext>>({
    registry,
    serverName: '${config.name}',
    contextFactory: async (req, env) => createContext(),
});
`;
}

/** Generate `src/registry.ts` — Tool registry (cold-start) */
export function cloudflareRegistryTs(): string {
    return `/**
 * Tool Registry — Cold Start Initialization
 *
 * Registered tools are compiled once during cold start.
 * Warm requests only instantiate McpServer + Transport.
 */
import { f } from './vurb.js';
import healthTool from './tools/system/health.js';
import echoTool from './tools/system/echo.js';

export const registry = f.registry();
registry.register(healthTool);
registry.register(echoTool);
`;
}

/** Generate `src/vurb.ts` — initVurb instance */
export function cloudflareVurbTs(): string {
    return `/**
 * Vurb Instance — Context Initialization
 *
 * Define your context type ONCE. Every f.query(), f.mutation(),
 * and f.presenter() call inherits AppContext.
 */
import { initVurb } from '@vurb/core';
import type { AppContext } from './context.js';

export const f = initVurb<AppContext>();
`;
}

/** Generate `src/context.ts` — Application context */
export function cloudflareContextTs(): string {
    return `/**
 * Application Context — Shared State for Every Tool Handler
 *
 * Every f.query() / f.mutation() handler receives (input, ctx)
 * where ctx is this AppContext.
 */

export interface AppContext {
    /** Current user role for RBAC checks */
    role: 'ADMIN' | 'USER' | 'GUEST';

    /** Tenant identifier (multi-tenancy) */
    tenantId: string;
}

/**
 * Create the application context for each tool invocation.
 *
 * In production, hydrate from Cloudflare env bindings,
 * request headers, or secrets.
 */
export function createContext(): AppContext {
    return {
        role: 'ADMIN',
        tenantId: 'default',
    };
}
`;
}

/** Generate `.env.example` for Cloudflare */
export function cloudflareEnvExample(config: ProjectConfig): string {
    let env = `# ── Vurb + Cloudflare Workers Environment ─────
# Secrets are managed via wrangler:
#   wrangler secret put MY_SECRET

NODE_ENV=development
`;

    if (config.vector === 'prisma') {
        env += `
# Database (Prisma — Hyperdrive or external)
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
`;
    }

    return env;
}

/** Generate `.gitignore` for Cloudflare Workers */
export function cloudflareGitignore(): string {
    return `node_modules/
dist/
.wrangler/
*.tsbuildinfo
.env
.dev.vars
coverage/
`;
}

/** Generate `README.md` for Cloudflare project */
export function cloudflareReadme(config: ProjectConfig): string {
    return `# ${config.name}

MCP Server built with [Vurb](https://vurb.vinkius.com/) — deployed to Cloudflare Workers.

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

The MCP endpoint is available at \`POST http://localhost:8787/\`.

## Deploy to Cloudflare

\`\`\`bash
npm run deploy
\`\`\`

Or directly:

\`\`\`bash
npx wrangler deploy
\`\`\`

## Client Configuration

### Cursor / VS Code

\`\`\`json
{
    "mcpServers": {
        "${config.name}": {
            "url": "https://${config.name}.your-subdomain.workers.dev/"
        }
    }
}
\`\`\`

### Claude Desktop

Add to your \`claude_desktop_config.json\`:

\`\`\`json
{
    "mcpServers": {
        "${config.name}": {
            "url": "https://${config.name}.your-subdomain.workers.dev/"
        }
    }
}
\`\`\`

## Project Structure

\`\`\`
src/
├── worker.ts          # Worker entry → cloudflareWorkersAdapter()
├── vurb.ts            # initVurb<AppContext>()
├── context.ts         # AppContext type + factory
├── registry.ts        # Tool registry (cold-start)
└── tools/
    └── system/
        ├── health.ts  # Health check
        └── echo.ts    # Echo tool
wrangler.toml          # Cloudflare configuration
\`\`\`

## Cloudflare Bindings

Uncomment bindings in \`wrangler.toml\` and update \`Env\` in \`worker.ts\`:

\`\`\`typescript
// worker.ts
export interface Env {
    DB: D1Database;
    KV: KVNamespace;
}

export default cloudflareWorkersAdapter<Env, MyContext>({
    registry,
    contextFactory: async (req, env) => ({
        db: env.DB,
        tenantId: req.headers.get('x-tenant-id') || 'public',
    }),
});
\`\`\`

## Adding New Tools

1. Create a tool in \`src/tools/\`:

\`\`\`typescript
import { f } from '../../vurb.js';

export default f.query('my_tool')
    .describe('What this tool does')
    .withString('query', 'Search query')
    .handle(async (input, ctx) => {
        return { result: input.query };
    });
\`\`\`

2. Register it in \`src/registry.ts\`:

\`\`\`typescript
import myTool from './tools/my-domain/my-tool.js';
registry.register(myTool);
\`\`\`

## Documentation

- [Vurb Docs](https://vurb.vinkius.com/)
- [Cloudflare Adapter](https://vurb.vinkius.com/cloudflare-adapter)
- [Presenter — Egress Firewall](https://vurb.vinkius.com/presenter)
`;
}
