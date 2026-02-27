/**
 * Config Templates — Root config files (package.json, tsconfig, etc.)
 * @module
 */
import type { ProjectConfig } from '../types.js';
import { CORE_VERSION, TESTING_VERSION, MCP_SDK_VERSION, ZOD_VERSION } from './constants.js';

/** Generate `package.json` with vector-specific deps */
export function packageJson(config: ProjectConfig): string {
    const deps: Record<string, string> = {
        '@modelcontextprotocol/sdk': MCP_SDK_VERSION,
        '@vinkius-core/mcp-fusion': CORE_VERSION,
        'zod': ZOD_VERSION,
    };

    if (config.vector === 'prisma') {
        deps['@prisma/client'] = '^6.0.0';
        deps['@vinkius-core/mcp-fusion-prisma-gen'] = '^1.0.0';
    }
    if (config.vector === 'n8n') {
        deps['@vinkius-core/mcp-fusion-n8n'] = '^1.0.0';
    }
    if (config.vector === 'openapi') {
        deps['@vinkius-core/mcp-fusion-openapi-gen'] = '^1.0.0';
    }
    if (config.vector === 'oauth') {
        deps['@vinkius-core/mcp-fusion-oauth'] = '^1.0.0';
    }

    const devDeps: Record<string, string> = {
        'tsx': '^4.19.0',
        'typescript': '^5.7.3',
        '@types/node': '^22.0.0',
    };

    if (config.vector === 'prisma') {
        devDeps['prisma'] = '^6.0.0';
    }
    if (config.testing) {
        devDeps['vitest'] = '^3.0.5';
        devDeps['@vinkius-core/mcp-fusion-testing'] = TESTING_VERSION;
    }

    const scripts: Record<string, string> = {
        'dev': 'tsx watch src/server.ts',
        'start': 'tsx src/server.ts',
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

/** Generate `tsconfig.json` */
export function tsconfig(): string {
    return JSON.stringify({
        compilerOptions: {
            target: 'es2022',
            module: 'Node16',
            moduleResolution: 'Node16',
            declaration: true,
            sourceMap: true,
            strict: true,
            noUncheckedIndexedAccess: true,
            noFallthroughCasesInSwitch: true,
            exactOptionalPropertyTypes: true,
            noImplicitOverride: true,
            noPropertyAccessFromIndexSignature: true,
            verbatimModuleSyntax: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            skipLibCheck: true,
            rootDir: './src',
            outDir: './dist',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'tests'],
    }, null, 4) + '\n';
}

/** Generate `.gitignore` */
export function gitignore(): string {
    return `node_modules/
dist/
*.tsbuildinfo
.env
.env.local
coverage/
`;
}

/** Generate `.env.example` with vector-specific vars */
export function envExample(config: ProjectConfig): string {
    let env = `# ── MCP Fusion Server Environment ─────────────────────
# Copy this to .env and fill in your values.

# Server
NODE_ENV=development
`;

    if (config.vector === 'prisma') {
        env += `
# Database (Prisma)
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
`;
    }
    if (config.vector === 'n8n') {
        env += `
# n8n Workflow Automation
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here
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
    if (config.transport === 'sse') {
        env += `
# SSE Transport
PORT=3001
`;
    }

    return env;
}
