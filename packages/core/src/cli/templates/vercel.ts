/**
 * Vercel Templates — Next.js App Router scaffold for @vurb/vercel
 *
 * Generates a complete Next.js project that exposes an MCP server
 * via `vercelAdapter()`. Deploy with `vercel deploy`.
 *
 * @module
 */
import type { ProjectConfig } from '../types.js';
import { CORE_VERSION, MCP_SDK_VERSION, VERCEL_ADAPTER_VERSION, ZOD_VERSION, TESTING_VERSION } from './constants.js';

/** Generate `package.json` for Vercel/Next.js project */
export function vercelPackageJson(config: ProjectConfig): string {
    const deps: Record<string, string> = {
        '@modelcontextprotocol/sdk': MCP_SDK_VERSION,
        '@vurb/core': CORE_VERSION,
        '@vurb/vercel': VERCEL_ADAPTER_VERSION,
        'next': '^15.0.0',
        'react': '^19.0.0',
        'react-dom': '^19.0.0',
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
        '@types/react': '^19.0.0',
    };

    if (config.vector === 'prisma') {
        devDeps['prisma'] = '^6.0.0';
    }
    if (config.testing) {
        devDeps['vitest'] = '^3.0.5';
        devDeps['@vurb/testing'] = TESTING_VERSION;
    }

    const scripts: Record<string, string> = {
        'dev': 'next dev',
        'build': 'next build',
        'start': 'next start',
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

/** Generate `tsconfig.json` for Next.js */
export function vercelTsconfig(): string {
    return JSON.stringify({
        compilerOptions: {
            target: 'es2022',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
    }, null, 4) + '\n';
}

/** Generate `next.config.ts` */
export function vercelNextConfig(): string {
    return `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`;
}

/** Generate `app/api/mcp/route.ts` — The MCP endpoint */
export function vercelRouteTs(config: ProjectConfig): string {
    return `/**
 * MCP Endpoint — Vercel Adapter
 *
 * This route exposes your Vurb tools as a stateless MCP server.
 * Connect any MCP client to: POST /api/mcp
 */
import { vercelAdapter } from '@vurb/vercel';
import { registry } from '@/mcp/registry.js';
import { createContext } from '@/mcp/context.js';

export const POST = vercelAdapter({
    registry,
    serverName: '${config.name}',
    contextFactory: async (req) => createContext(),
});
`;
}

/** Generate `src/mcp/registry.ts` — Tool registry (cold-start) */
export function vercelRegistryTs(): string {
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

/** Generate `src/mcp/vurb.ts` — initVurb instance */
export function vercelVurbTs(): string {
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

/** Generate `src/mcp/context.ts` — Application context */
export function vercelContextTs(): string {
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
 * In production, hydrate from request headers, JWT tokens,
 * or environment variables.
 */
export function createContext(): AppContext {
    return {
        role: 'ADMIN',
        tenantId: 'default',
    };
}
`;
}

/** Generate `.env.example` for Vercel */
export function vercelEnvExample(config: ProjectConfig): string {
    let env = `# ── Vurb + Vercel Environment ──────────────────
# Copy this to .env.local and fill in your values.

NODE_ENV=development
`;

    if (config.vector === 'prisma') {
        env += `
# Database (Prisma)
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
`;
    }
    if (config.vector === 'oauth') {
        env += `
# OAuth Device Flow (RFC 8628)
OAUTH_CLIENT_ID=your-client-id
OAUTH_AUTH_ENDPOINT=https://api.example.com/oauth/device/code
OAUTH_TOKEN_ENDPOINT=https://api.example.com/oauth/device/token
`;
    }

    return env;
}

/** Generate `.gitignore` for Next.js */
export function vercelGitignore(): string {
    return `node_modules/
.next/
out/
*.tsbuildinfo
.env
.env.local
.vercel
coverage/
`;
}

/** Generate `README.md` for Vercel project */
export function vercelReadme(config: ProjectConfig): string {
    return `# ${config.name}

MCP Server built with [Vurb](https://vurb.vinkius.com/) — deployed to Vercel.

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

The MCP endpoint is available at \`POST http://localhost:3000/api/mcp\`.

## Deploy to Vercel

\`\`\`bash
npx vercel deploy
\`\`\`

## Client Configuration

### Cursor / VS Code

\`\`\`json
{
    "mcpServers": {
        "${config.name}": {
            "url": "https://your-app.vercel.app/api/mcp"
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
            "url": "https://your-app.vercel.app/api/mcp"
        }
    }
}
\`\`\`

## Project Structure

\`\`\`
src/
└── mcp/
    ├── vurb.ts           # initVurb<AppContext>()
    ├── context.ts         # AppContext type + factory
    ├── registry.ts        # Tool registry (cold-start)
    └── tools/
        └── system/
            ├── health.ts  # Health check
            └── echo.ts    # Echo tool
app/
└── api/
    └── mcp/
        └── route.ts       # POST /api/mcp → vercelAdapter()
\`\`\`

## Adding New Tools

1. Create a tool in \`src/mcp/tools/\`:

\`\`\`typescript
import { f } from '../../vurb.js';

export default f.query('my_tool')
    .describe('What this tool does')
    .withString('query', 'Search query')
    .handle(async (input, ctx) => {
        return { result: input.query };
    });
\`\`\`

2. Register it in \`src/mcp/registry.ts\`:

\`\`\`typescript
import myTool from './tools/my-domain/my-tool.js';
registry.register(myTool);
\`\`\`

## Edge Runtime (Optional)

For lower latency, add to \`app/api/mcp/route.ts\`:

\`\`\`typescript
export const runtime = 'edge';
\`\`\`

## Documentation

- [Vurb Docs](https://vurb.vinkius.com/)
- [Vercel Adapter](https://vurb.vinkius.com/vercel-adapter)
- [Presenter — Egress Firewall](https://vurb.vinkius.com/presenter)
`;
}
