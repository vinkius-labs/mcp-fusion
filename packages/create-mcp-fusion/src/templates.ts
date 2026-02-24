/**
 * create-mcp-fusion — Template Generators
 *
 * Each function receives a ProjectConfig and returns a string
 * with the file contents. All templates generate valid, compilable
 * TypeScript — not stubs or placeholders.
 *
 * @module
 */
import type { ProjectConfig } from './types.js';

// ── Helpers ──────────────────────────────────────────────

const CORE_VERSION = '^2.4.0';
const TESTING_VERSION = '^1.0.0';
const MCP_SDK_VERSION = '^1.12.1';
const ZOD_VERSION = '^3.25.1';

// ── package.json ─────────────────────────────────────────

export function packageJson(config: ProjectConfig): string {
    const deps: Record<string, string> = {
        '@modelcontextprotocol/sdk': MCP_SDK_VERSION,
        '@vinkius-core/mcp-fusion': CORE_VERSION,
        'zod': ZOD_VERSION,
    };

    if (config.vector === 'database') {
        deps['@prisma/client'] = '^6.0.0';
        deps['mcp-fusion-prisma-gen'] = '^1.0.0';
    }
    if (config.vector === 'workflow') {
        deps['mcp-fusion-n8n'] = '^1.0.0';
    }
    if (config.vector === 'openapi') {
        deps['mcp-fusion-openapi-gen'] = '^1.0.0';
    }

    const devDeps: Record<string, string> = {
        'tsx': '^4.19.0',
        'typescript': '^5.7.3',
        '@types/node': '^22.0.0',
    };

    if (config.testing) {
        devDeps['vitest'] = '^3.0.5';
        devDeps['@vinkius-core/testing'] = TESTING_VERSION;
    }

    const scripts: Record<string, string> = {
        'dev': 'tsx watch src/server.ts',
        'start': 'tsx src/server.ts',
        'build': 'tsc',
    };

    if (config.testing) {
        scripts['test'] = 'vitest run';
        scripts['test:watch'] = 'vitest';
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

// ── tsconfig.json ────────────────────────────────────────

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
            esModuleInterop: true,
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

// ── vitest.config.ts ─────────────────────────────────────

export function vitestConfig(): string {
    return `import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
    },
});
`;
}

// ── .gitignore ───────────────────────────────────────────

export function gitignore(): string {
    return `node_modules/
dist/
*.tsbuildinfo
.env
.env.local
coverage/
`;
}

// ── src/server.ts ────────────────────────────────────────

export function serverTs(config: ProjectConfig): string {
    const serverAttachment = config.transport === 'stdio'
        ? `const detach = registry.attachToServer(server, {
    toolExposition: '${config.exposition}',
});`
        : config.transport === 'sse'
        ? `const detach = registry.attachToServer(server, {
    transport: new SSEServerTransport('/mcp/messages', res),
    toolExposition: '${config.exposition}',
});`
        : `const detach = registry.attachToServer(server, {
    toolExposition: '${config.exposition}',
});`;

    const imports = [
        `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';`,
        config.transport === 'stdio' ? `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';` : null,
        config.transport === 'sse' ? `import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';\nimport { createServer } from 'node:http';` : null,
        `import { registry } from './registry.js';`,
    ].filter(Boolean).join('\n');

    if (config.transport === 'sse') {
        return `${imports}

const server = new McpServer({
    name: '${config.name}',
    version: '0.1.0',
});

const PORT = Number(process.env['PORT'] ?? 3001);

const httpServer = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/sse') {
        ${serverAttachment}
    } else {
        res.writeHead(404).end();
    }
});

httpServer.listen(PORT, () => {
    console.error(\`🚀 MCP SSE Server listening on http://localhost:\${PORT}/sse\`);
});
`;
    }

    return `${imports}

const server = new McpServer({
    name: '${config.name}',
    version: '0.1.0',
});

${serverAttachment}
`;
}

// ── src/registry.ts ──────────────────────────────────────

export function registryTs(): string {
    return `/**
 * Registry — The Centralized Tool Vault
 *
 * Instantiates the ToolRegistry with your application context type
 * and registers all tool builders.
 */
import { ToolRegistry } from '@vinkius-core/mcp-fusion';
import { systemTools } from './agents/systemTools.js';

// ── Application Context ──────────────────────────────────
// Define the context type that every tool handler receives.
// Extend this with your own services (DB client, auth, etc.)

export interface TContext {
    /** Current user role for RBAC checks */
    role: 'ADMIN' | 'USER' | 'GUEST';
}

// ── Registry ─────────────────────────────────────────────

export const registry = new ToolRegistry<TContext>();

registry.register(systemTools);
`;
}

// ── Tool file ────────────────────────────────────────────

export function systemToolsTs(): string {
    return `/**
 * System Tools — Example Agent-Facing Interface
 *
 * Demonstrates the defineTool() API with:
 *  - Action routing
 *  - Zod parameter validation
 *  - MVA Presenter integration (Egress Firewall)
 *  - Middleware (RBAC guard)
 */
import { defineTool, success } from '@vinkius-core/mcp-fusion';
import { SystemPresenter } from '../views/SystemPresenter.js';
import { authGuard } from '../middleware/AuthGuard.js';
import type { TContext } from '../registry.js';

export const systemTools = defineTool<TContext>('system', {
    description: 'System administration and health monitoring',
    middleware: [authGuard],
    actions: {
        health: {
            description: 'Check system health status',
            readOnly: true,
            returns: SystemPresenter,
            handler: async (_ctx) => {
                // Return data through the Presenter to enforce the Egress Firewall
                // and inject system rules into the LLM context.
                return SystemPresenter.make({
                    status: 'healthy',
                    uptime: process.uptime(),
                    version: '0.1.0',
                    timestamp: new Date().toISOString(),
                }).build();
            },
        },
        echo: {
            description: 'Echo a message back (useful for connectivity testing)',
            readOnly: true,
            params: {
                message: { type: 'string', description: 'Message to echo' },
            },
            handler: async (_ctx, args) => {
                return success({ echo: args['message'], receivedAt: new Date().toISOString() });
            },
        },
    },
});
`;
}

// ── Presenter ────────────────────────────────────────────

export function systemPresenterTs(): string {
    return `/**
 * System Presenter — MVA View Layer
 *
 * Defines how the Agent perceives system health data.
 * The Egress Firewall (Zod .strict()) strips any undeclared
 * fields before they reach the LLM context window.
 */
import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
import { SystemHealthSchema } from '../models/system.schema.js';

export const SystemPresenter = createPresenter('SystemPresenter')
    .schema(SystemHealthSchema)
    .systemRules([
        'This data represents real-time system health.',
        'Uptime is measured in seconds since process start.',
    ])
    .uiBlocks(data => [
        ui.markdown(\`🟢 Status: \${data.status} | Uptime: \${Math.floor(data.uptime)}s | v\${data.version}\`),
    ]);
`;
}

// ── Schema (grouped mode only) ───────────────────────────

export function systemSchemaTs(): string {
    return `/**
 * System Schema — MVA Model Layer
 *
 * Pure Zod contracts that define the data boundary.
 * The .strict() call rejects any undeclared fields —
 * this is the Egress Firewall that prevents data leaks.
 */
import { z } from 'zod';

export const SystemHealthSchema = z.object({
    status: z.string(),
    uptime: z.number(),
    version: z.string(),
    timestamp: z.string(),
}).strict();

export type SystemHealth = z.infer<typeof SystemHealthSchema>;
`;
}

// ── Middleware ────────────────────────────────────────────

export function authGuardTs(): string {
    return `/**
 * AuthGuard — Example RBAC Middleware
 *
 * Demonstrates how to implement authorization checks
 * that run before every tool handler in the middleware chain.
 *
 * Rejects requests from GUEST users with a structured error.
 */
import { error } from '@vinkius-core/mcp-fusion';

export interface AuthContext {
    role: 'ADMIN' | 'USER' | 'GUEST';
}

export async function authGuard<TArgs>(
    ctx: AuthContext,
    _args: TArgs,
    next: () => Promise<unknown>,
): Promise<unknown> {
    if (ctx.role === 'GUEST') {
        return error('Access denied. Authentication required.');
    }
    return next();
}
`;
}

// ── Test Setup ───────────────────────────────────────────

export function testSetupTs(config: ProjectConfig): string {
    return `/**
 * Test Setup — Shared FusionTester Instance
 *
 * Creates an in-memory MVA lifecycle emulator that runs the
 * full pipeline (Zod Input → Middlewares → Handler → Egress Firewall)
 * without any network transport.
 */
import { createFusionTester } from '@vinkius-core/testing';
import { registry } from '../src/registry.js';

export const tester = createFusionTester(registry, {
    contextFactory: () => ({
        role: 'ADMIN' as const,
    }),
});
`;
}

// ── Example Test ─────────────────────────────────────────

export function systemFirewallTestTs(): string {
    return `/**
 * System Firewall Test — Egress Validation
 *
 * Proves that the Zod Egress Firewall strips undeclared fields
 * from tool responses before they reach the LLM context window.
 */
import { describe, it, expect } from 'vitest';
import { tester } from '../setup.js';

describe('System Tools', () => {
    describe('Egress Firewall', () => {
        it('should return valid health data through the Presenter', async () => {
            const result = await tester.callAction('system', 'health');

            expect(result.isError).toBe(false);
            expect(result.data).toHaveProperty('status');
            expect(result.data).toHaveProperty('uptime');
            expect(result.data).toHaveProperty('version');
            expect(result.data).toHaveProperty('timestamp');
        });

        it('should include system rules from the Presenter', async () => {
            const result = await tester.callAction('system', 'health');

            expect(result.systemRules.length).toBeGreaterThan(0);
            expect(result.systemRules.some(r => r.includes('system health'))).toBe(true);
        });
    });

    describe('RBAC Middleware', () => {
        it('should deny access for GUEST role', async () => {
            const result = await tester.callAction(
                'system', 'health', {},
                { role: 'GUEST' },
            );

            expect(result.isError).toBe(true);
            expect(result.data).toContain('Access denied');
        });

        it('should allow access for ADMIN role', async () => {
            const result = await tester.callAction('system', 'health');

            expect(result.isError).toBe(false);
        });
    });
});
`;
}

// ── Vector-Specific Hints ────────────────────────────────

export function vectorReadme(config: ProjectConfig): string {
    if (config.vector === 'database') {
        return `# Database-Driven Setup

This project is configured for the **Database-Driven** ingestion vector.

## Next Steps

1. Install Prisma:
   \`\`\`bash
   npx prisma init
   \`\`\`

2. Define your schema in \`prisma/schema.prisma\`

3. Add the MCP Fusion Prisma generator:
   \`\`\`prisma
   generator fusion {
       provider = "vinkius-prisma-gen"
   }
   \`\`\`

4. Run \`npx prisma generate\` to auto-generate Presenters and ToolBuilders

See: https://vinkius-labs.github.io/mcp-fusion/prisma-gen
`;
    }

    if (config.vector === 'workflow') {
        return `# Workflow Automation Setup

This project is configured for the **Workflow Automation** ingestion vector.

## Next Steps

1. Configure your n8n instance URL in \`.env\`:
   \`\`\`
   N8N_BASE_URL=http://localhost:5678
   N8N_API_KEY=your-api-key
   \`\`\`

2. Use the n8n connector to auto-discover webhook workflows:
   \`\`\`typescript
   import { discoverN8nWorkflows } from 'mcp-fusion-n8n';

   const workflows = await discoverN8nWorkflows({
       baseUrl: process.env.N8N_BASE_URL,
       apiKey: process.env.N8N_API_KEY,
   });

   registry.registerAll(...workflows);
   \`\`\`

See: https://vinkius-labs.github.io/mcp-fusion/n8n
`;
    }

    if (config.vector === 'openapi') {
        return `# Legacy API Proxy Setup

This project is configured for the **Legacy API Proxy** ingestion vector.

## Next Steps

1. Place your OpenAPI 3.x spec at \`openapi.yaml\`

2. Generate the MCP server from the spec:
   \`\`\`bash
   npx openapi-gen ./openapi.yaml --outDir ./src/generated
   \`\`\`

3. Import and register the generated tools in \`src/registry.ts\`

See: https://vinkius-labs.github.io/mcp-fusion/openapi-gen
`;
    }

    return '';
}
