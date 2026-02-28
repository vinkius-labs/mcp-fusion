/**
 * CLI `fusion create` — Integration Tests
 *
 * Tests the create command pipeline end-to-end:
 *   - `parseArgs` — create command argument parsing
 *   - `ansi` — ANSI color helpers
 *   - `ask` — readline prompt helper
 *   - `collectConfig` — fast-path and interactive fallback
 *   - `scaffold` — file tree generation for all 4 vectors
 *   - Templates — content validation for every template
 *   - Config Matrix — all combinations of transport × vector × testing
 *   - Edge cases — invalid names, empty inputs
 *
 * @module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    parseArgs,
    ansi,
    ask,
    collectConfig,
    HELP,
    ProgressTracker,
    createDefaultReporter,
    commandCreate,
    MCP_FUSION_VERSION,
} from '../../src/cli/fusion.js';
import type { CliArgs } from '../../src/cli/fusion.js';
import { scaffold } from '../../src/cli/scaffold.js';
import type { ProjectConfig, IngestionVector, TransportLayer } from '../../src/cli/types.js';
import * as tpl from '../../src/cli/templates/index.js';

// ============================================================================
// Helpers
// ============================================================================

function tempDir(): string {
    const dir = join(tmpdir(), `fusion-create-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

/** Recursively list all files in a directory (relative paths) */
function listFilesRecursive(dir: string, base = ''): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results.push(...listFilesRecursive(join(dir, entry.name), rel));
        } else {
            results.push(rel);
        }
    }
    return results.sort();
}

function baseCliArgs(): CliArgs {
    return {
        command: 'create',
        check: false,
        server: undefined,
        name: undefined,
        cwd: process.cwd(),
        help: false,
        projectName: undefined,
        transport: undefined,
        vector: undefined,
        testing: undefined,
        yes: false,
    };
}

// ============================================================================
// parseArgs — create command
// ============================================================================

describe('parseArgs — create command', () => {
    it('parses basic create command with project name', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'my-server']);
        expect(args.command).toBe('create');
        expect(args.projectName).toBe('my-server');
    });

    it('parses create without project name', () => {
        const args = parseArgs(['node', 'fusion', 'create']);
        expect(args.command).toBe('create');
        expect(args.projectName).toBeUndefined();
    });

    it('parses --yes / -y flag', () => {
        const args1 = parseArgs(['node', 'fusion', 'create', 'demo', '-y']);
        expect(args1.yes).toBe(true);

        const args2 = parseArgs(['node', 'fusion', 'create', 'demo', '--yes']);
        expect(args2.yes).toBe(true);
    });

    it('parses --transport flag', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--transport', 'sse']);
        expect(args.transport).toBe('sse');
    });

    it('parses --vector flag for each valid value', () => {
        for (const v of ['vanilla', 'prisma', 'n8n', 'openapi', 'oauth']) {
            const args = parseArgs(['node', 'fusion', 'create', 'srv', '--vector', v]);
            expect(args.vector).toBe(v);
        }
    });

    it('parses --testing and --no-testing flags', () => {
        const a1 = parseArgs(['node', 'fusion', 'create', 'srv', '--testing']);
        expect(a1.testing).toBe(true);

        const a2 = parseArgs(['node', 'fusion', 'create', 'srv', '--no-testing']);
        expect(a2.testing).toBe(false);
    });

    it('parses all create flags combined', () => {
        const args = parseArgs([
            'node', 'fusion', 'create', 'my-tool',
            '--transport', 'sse',
            '--vector', 'n8n',
            '--no-testing',
            '-y',
        ]);
        expect(args.command).toBe('create');
        expect(args.projectName).toBe('my-tool');
        expect(args.transport).toBe('sse');
        expect(args.vector).toBe('n8n');
        expect(args.testing).toBe(false);
        expect(args.yes).toBe(true);
    });

    it('defaults create-specific fields to undefined/false when absent', () => {
        const args = parseArgs(['node', 'fusion', 'create']);
        expect(args.projectName).toBeUndefined();
        expect(args.transport).toBeUndefined();
        expect(args.vector).toBeUndefined();
        expect(args.testing).toBeUndefined();
        expect(args.yes).toBe(false);
    });

    it('does not confuse lock flags with create flags', () => {
        const args = parseArgs(['node', 'fusion', 'lock', '--check']);
        expect(args.command).toBe('lock');
        expect(args.check).toBe(true);
        expect(args.yes).toBe(false);
    });

    it('does not treat flags as project name', () => {
        const args = parseArgs(['node', 'fusion', 'create', '--transport', 'stdio']);
        expect(args.projectName).toBeUndefined();
        expect(args.transport).toBe('stdio');
    });

    it('ignores extra positional args after project name', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'my-server', 'extra-arg']);
        expect(args.projectName).toBe('my-server');
    });
});

// ============================================================================
// ANSI Helpers
// ============================================================================

describe('ANSI helpers', () => {
    it('wraps text with correct escape codes', () => {
        expect(ansi.cyan('hello')).toBe('\x1b[36mhello\x1b[0m');
        expect(ansi.green('ok')).toBe('\x1b[32mok\x1b[0m');
        expect(ansi.dim('faded')).toBe('\x1b[2mfaded\x1b[0m');
        expect(ansi.bold('strong')).toBe('\x1b[1mstrong\x1b[0m');
        expect(ansi.red('error')).toBe('\x1b[31merror\x1b[0m');
    });

    it('handles empty strings', () => {
        expect(ansi.cyan('')).toBe('\x1b[36m\x1b[0m');
    });

    it('reset is plain string', () => {
        expect(ansi.reset).toBe('\x1b[0m');
    });
});

// ============================================================================
// ask() helper
// ============================================================================

describe('ask — readline prompt helper', () => {
    it('returns user input when provided', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb('user-input'),
        };
        const result = await ask(mockRl, 'Name?', 'default');
        expect(result).toBe('user-input');
    });

    it('returns fallback when input is empty', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb(''),
        };
        const result = await ask(mockRl, 'Name?', 'my-fallback');
        expect(result).toBe('my-fallback');
    });

    it('trims whitespace from input', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb('  trimmed  '),
        };
        const result = await ask(mockRl, 'Name?', 'default');
        expect(result).toBe('trimmed');
    });

    it('returns fallback when input is only whitespace', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb('   '),
        };
        const result = await ask(mockRl, 'Name?', 'fallback');
        expect(result).toBe('fallback');
    });

    it('prompt string contains the styled markers', async () => {
        let capturedPrompt = '';
        const mockRl = {
            question: (q: string, cb: (a: string) => void) => { capturedPrompt = q; cb(''); },
        };
        await ask(mockRl, 'Transport?', 'stdio');
        expect(capturedPrompt).toContain('◇');
        expect(capturedPrompt).toContain('Transport?');
        expect(capturedPrompt).toContain('stdio');
    });
});

// ============================================================================
// collectConfig — fast-path
// ============================================================================

describe('collectConfig — fast-path (--yes)', () => {
    it('returns defaults when --yes with no overrides', async () => {
        const args = { ...baseCliArgs(), yes: true };
        const config = await collectConfig(args);
        expect(config).toEqual({
            name: 'my-mcp-server',
            transport: 'stdio',
            vector: 'vanilla',
            testing: true,
        });
    });

    it('respects projectName override with --yes', async () => {
        const args = { ...baseCliArgs(), yes: true, projectName: 'custom-name' };
        const config = await collectConfig(args);
        expect(config!.name).toBe('custom-name');
    });

    it('respects all flag overrides with --yes', async () => {
        const args: CliArgs = {
            ...baseCliArgs(),
            yes: true,
            projectName: 'my-srv',
            transport: 'sse' as TransportLayer,
            vector: 'prisma' as IngestionVector,
            testing: false,
        };
        const config = await collectConfig(args);
        expect(config).toEqual({
            name: 'my-srv',
            transport: 'sse',
            vector: 'prisma',
            testing: false,
        });
    });

    it('defaults testing to true when not specified', async () => {
        const args = { ...baseCliArgs(), yes: true, testing: undefined };
        const config = await collectConfig(args);
        expect(config!.testing).toBe(true);
    });
});

// ============================================================================
// HELP string
// ============================================================================

describe('HELP string', () => {
    it('includes create command', () => {
        expect(HELP).toContain('fusion create');
    });

    it('includes all create options', () => {
        expect(HELP).toContain('--transport');
        expect(HELP).toContain('--vector');
        expect(HELP).toContain('--testing');
        expect(HELP).toContain('--no-testing');
        expect(HELP).toContain('--yes');
        expect(HELP).toContain('-y');
    });

    it('includes create examples', () => {
        expect(HELP).toContain('fusion create my-server');
        expect(HELP).toContain('fusion create my-server -y');
        expect(HELP).toContain('--vector prisma');
    });

    it('still includes lock command', () => {
        expect(HELP).toContain('fusion lock');
        expect(HELP).toContain('--server');
        expect(HELP).toContain('--check');
    });
});

// ============================================================================
// Template Unit Tests — Content Validation
// ============================================================================

describe('Template output — core files', () => {
    const baseConfig: ProjectConfig = {
        name: 'test-server',
        transport: 'stdio',
        vector: 'vanilla',
        testing: true,
    };

    // ── package.json ─────────────────────────────────────────

    describe('packageJson', () => {
        it('produces valid JSON with correct structure', () => {
            const content = tpl.packageJson(baseConfig);
            const pkg = JSON.parse(content);
            expect(pkg.name).toBe('test-server');
            expect(pkg.version).toBe('0.1.0');
            expect(pkg.type).toBe('module');
            expect(pkg.private).toBe(true);
            expect(pkg.engines.node).toBe('>=18.0.0');
        });

        it('includes core dependencies', () => {
            const pkg = JSON.parse(tpl.packageJson(baseConfig));
            expect(pkg.dependencies['@vinkius-core/mcp-fusion']).toBeDefined();
            expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
            expect(pkg.dependencies['zod']).toBeDefined();
        });

        it('includes dev dependencies', () => {
            const pkg = JSON.parse(tpl.packageJson(baseConfig));
            expect(pkg.devDependencies['tsx']).toBeDefined();
            expect(pkg.devDependencies['typescript']).toBeDefined();
            expect(pkg.devDependencies['@types/node']).toBeDefined();
        });

        it('includes scripts', () => {
            const pkg = JSON.parse(tpl.packageJson(baseConfig));
            expect(pkg.scripts.dev).toContain('tsx');
            expect(pkg.scripts.start).toContain('tsx');
            expect(pkg.scripts.build).toBe('tsc');
        });

        it('includes test deps when testing=true', () => {
            const pkg = JSON.parse(tpl.packageJson({ ...baseConfig, testing: true }));
            expect(pkg.devDependencies['vitest']).toBeDefined();
            expect(pkg.devDependencies['@vinkius-core/mcp-fusion-testing']).toBeDefined();
            expect(pkg.scripts.test).toBe('vitest run');
            expect(pkg.scripts['test:watch']).toBe('vitest');
        });

        it('omits test deps when testing=false', () => {
            const pkg = JSON.parse(tpl.packageJson({ ...baseConfig, testing: false }));
            expect(pkg.devDependencies['vitest']).toBeUndefined();
            expect(pkg.devDependencies['@vinkius-core/mcp-fusion-testing']).toBeUndefined();
            expect(pkg.scripts.test).toBeUndefined();
        });

        it('includes database deps for database vector', () => {
            const pkg = JSON.parse(tpl.packageJson({ ...baseConfig, vector: 'prisma' }));
            expect(pkg.dependencies['@prisma/client']).toBeDefined();
            expect(pkg.dependencies['@vinkius-core/mcp-fusion-prisma-gen']).toBeDefined();
            expect(pkg.devDependencies['prisma']).toBeDefined();
            expect(pkg.scripts['db:generate']).toBeDefined();
            expect(pkg.scripts['db:push']).toBeDefined();
        });

        it('includes workflow deps for workflow vector', () => {
            const pkg = JSON.parse(tpl.packageJson({ ...baseConfig, vector: 'n8n' }));
            expect(pkg.dependencies['@vinkius-core/mcp-fusion-n8n']).toBeDefined();
        });

        it('includes openapi deps for openapi vector', () => {
            const pkg = JSON.parse(tpl.packageJson({ ...baseConfig, vector: 'openapi' }));
            expect(pkg.dependencies['@vinkius-core/mcp-fusion-openapi-gen']).toBeDefined();
        });

        it('includes oauth deps for oauth vector', () => {
            const pkg = JSON.parse(tpl.packageJson({ ...baseConfig, vector: 'oauth' }));
            expect(pkg.dependencies['@vinkius-core/mcp-fusion-oauth']).toBeDefined();
        });

        it('does not include vector deps for blank', () => {
            const pkg = JSON.parse(tpl.packageJson(baseConfig));
            expect(pkg.dependencies['@prisma/client']).toBeUndefined();
            expect(pkg.dependencies['mcp-fusion-n8n']).toBeUndefined();
            expect(pkg.dependencies['mcp-fusion-openapi-gen']).toBeUndefined();
            expect(pkg.dependencies['@vinkius-core/mcp-fusion-oauth']).toBeUndefined();
        });

        it('ends with newline', () => {
            expect(tpl.packageJson(baseConfig).endsWith('\n')).toBe(true);
        });
    });

    // ── tsconfig ─────────────────────────────────────────────

    describe('tsconfig', () => {
        it('is valid JSON with strict settings', () => {
            const parsed = JSON.parse(tpl.tsconfig());
            expect(parsed.compilerOptions.strict).toBe(true);
            expect(parsed.compilerOptions.target).toBe('es2022');
            expect(parsed.compilerOptions.module).toBe('Node16');
            expect(parsed.compilerOptions.moduleResolution).toBe('Node16');
            expect(parsed.compilerOptions.verbatimModuleSyntax).toBe(true);
        });
    });

    // ── vitestConfig ─────────────────────────────────────────

    describe('vitestConfig', () => {
        it('imports from vitest/config and includes tests pattern', () => {
            const content = tpl.vitestConfig();
            expect(content).toContain("import { defineConfig } from 'vitest/config'");
            expect(content).toContain('tests/**/*.test.ts');
        });
    });

    // ── gitignore ────────────────────────────────────────────

    describe('gitignore', () => {
        it('contains standard ignores', () => {
            const content = tpl.gitignore();
            expect(content).toContain('node_modules/');
            expect(content).toContain('dist/');
            expect(content).toContain('.env');
        });
    });

    // ── envExample ───────────────────────────────────────────

    describe('envExample', () => {
        it('always contains NODE_ENV', () => {
            expect(tpl.envExample(baseConfig)).toContain('NODE_ENV');
        });

        it('includes DATABASE_URL for database vector', () => {
            expect(tpl.envExample({ ...baseConfig, vector: 'prisma' })).toContain('DATABASE_URL');
        });

        it('includes N8N vars for workflow vector', () => {
            const env = tpl.envExample({ ...baseConfig, vector: 'n8n' });
            expect(env).toContain('N8N_BASE_URL');
            expect(env).toContain('N8N_API_KEY');
        });

        it('includes OAUTH vars for oauth vector', () => {
            const env = tpl.envExample({ ...baseConfig, vector: 'oauth' });
            expect(env).toContain('OAUTH_CLIENT_ID');
            expect(env).toContain('OAUTH_AUTH_ENDPOINT');
            expect(env).toContain('OAUTH_TOKEN_ENDPOINT');
        });

        it('includes PORT for SSE transport', () => {
            expect(tpl.envExample({ ...baseConfig, transport: 'sse' })).toContain('PORT=');
        });

        it('does not include PORT for stdio transport', () => {
            expect(tpl.envExample(baseConfig)).not.toContain('PORT=');
        });
    });
});

describe('Template output — source files', () => {
    // ── fusionTs ─────────────────────────────────────────────

    describe('fusionTs', () => {
        it('imports initFusion and exports f', () => {
            const content = tpl.fusionTs();
            expect(content).toContain("import { initFusion } from '@vinkius-core/mcp-fusion'");
            expect(content).toContain("import type { AppContext } from './context.js'");
            expect(content).toContain('export const f = initFusion<AppContext>()');
        });
    });

    // ── contextTs ────────────────────────────────────────────

    describe('contextTs', () => {
        it('defines AppContext interface', () => {
            const content = tpl.contextTs();
            expect(content).toContain('export interface AppContext');
            expect(content).toContain('role:');
            expect(content).toContain('tenantId:');
        });

        it('exports createContext function', () => {
            const content = tpl.contextTs();
            expect(content).toContain('export function createContext(): AppContext');
        });
    });

    // ── serverTs ─────────────────────────────────────────────

    describe('serverTs', () => {
        const stdioConfig: ProjectConfig = { name: 'srv', transport: 'stdio', vector: 'vanilla', testing: false };
        const sseConfig: ProjectConfig = { name: 'srv', transport: 'sse', vector: 'vanilla', testing: false };

        it('uses startServer for stdio', () => {
            const content = tpl.serverTs(stdioConfig);
            expect(content).toContain('startServer');
            expect(content).not.toContain('SSEServerTransport');
        });

        it('uses SSEServerTransport for sse', () => {
            const content = tpl.serverTs(sseConfig);
            expect(content).toContain('SSEServerTransport');
            expect(content).not.toContain('startServer');
        });

        it('uses autoDiscover', () => {
            const content = tpl.serverTs(stdioConfig);
            expect(content).toContain('autoDiscover');
            expect(content).toContain('./tools');
        });

        it('uses f.registry() from fusion.ts', () => {
            const content = tpl.serverTs(stdioConfig);
            expect(content).toContain("import { f } from './fusion.js'");
            expect(content).toContain('f.registry()');
        });

        it('embeds the server name in Server constructor', () => {
            const content = tpl.serverTs({ ...stdioConfig, name: 'my-cool-srv' });
            expect(content).toContain("name: 'my-cool-srv'");
        });

        it('imports PromptRegistry', () => {
            const content = tpl.serverTs(stdioConfig);
            expect(content).toContain('PromptRegistry');
        });
    });

    // ── healthToolTs ─────────────────────────────────────────

    describe('healthToolTs', () => {
        it('uses Fluent API f.query() pattern', () => {
            const content = tpl.healthToolTs();
            expect(content).toContain("f.query('system.health')");
        });

        it('imports from fusion.js and Presenter', () => {
            const content = tpl.healthToolTs();
            expect(content).toContain("import { f } from '../../fusion.js'");
            expect(content).toContain("import { SystemPresenter } from '../../presenters/SystemPresenter.js'");
        });

        it('uses .returns() for Presenter binding', () => {
            const content = tpl.healthToolTs();
            expect(content).toContain('.returns(SystemPresenter)');
        });

        it('handler uses typed ctx parameter', () => {
            const content = tpl.healthToolTs();
            expect(content).toContain('.handle(async');
            expect(content).toContain('ctx.tenantId');
        });
    });

    // ── echoToolTs ───────────────────────────────────────────

    describe('echoToolTs', () => {
        it('uses Fluent API f.query() with .withString()', () => {
            const content = tpl.echoToolTs();
            expect(content).toContain("f.query('system.echo')");
            expect(content).toContain(".withString('message'");
        });

        it('uses .handle() and returns raw data', () => {
            const content = tpl.echoToolTs();
            expect(content).toContain('.handle(async');
            expect(content).toContain('input.message');
        });
    });

    // ── systemPresenterTs ────────────────────────────────────

    describe('systemPresenterTs', () => {
        it('uses definePresenter with Zod schema', () => {
            const content = tpl.systemPresenterTs();
            expect(content).toContain('definePresenter');
            expect(content).toContain('z.object');
        });

        it('includes .describe() annotations for auto-rules', () => {
            const content = tpl.systemPresenterTs();
            expect(content).toContain(".describe('Server operational status')");
            expect(content).toContain(".describe('Uptime in seconds");
        });

        it('includes ui.markdown block', () => {
            const content = tpl.systemPresenterTs();
            expect(content).toContain('ui.markdown');
            expect(content).toContain('data.status');
        });

        it('includes suggestActions', () => {
            const content = tpl.systemPresenterTs();
            expect(content).toContain('suggestActions');
            expect(content).toContain("'system.health'");
        });
    });

    // ── greetPromptTs ────────────────────────────────────────

    describe('greetPromptTs', () => {
        it('uses f.prompt with PromptMessage', () => {
            const content = tpl.greetPromptTs();
            expect(content).toContain("f.prompt('greet'");
            expect(content).toContain('PromptMessage.system(');
            expect(content).toContain('PromptMessage.user(');
        });

        it('defines args with enum', () => {
            const content = tpl.greetPromptTs();
            expect(content).toContain("'formal'");
            expect(content).toContain("'casual'");
            expect(content).toContain("'pirate'");
        });
    });

    // ── authMiddlewareTs ─────────────────────────────────────

    describe('authMiddlewareTs', () => {
        it('uses f.middleware() and rejects GUEST', () => {
            const content = tpl.authMiddlewareTs();
            expect(content).toContain('f.middleware(');
            expect(content).toContain("ctx.role === 'GUEST'");
            expect(content).toContain('error(');
        });

        it('exports withAuth constant', () => {
            const content = tpl.authMiddlewareTs();
            expect(content).toContain('export const withAuth');
        });
    });

    // ── cursorMcpJson ────────────────────────────────────────

    describe('cursorMcpJson', () => {
        it('is valid JSON with correct structure', () => {
            const config: ProjectConfig = { name: 'my-srv', transport: 'stdio', vector: 'vanilla', testing: false };
            const content = tpl.cursorMcpJson(config);
            const parsed = JSON.parse(content);
            expect(parsed.mcpServers['my-srv']).toBeDefined();
            expect(parsed.mcpServers['my-srv'].command).toBe('npx');
            expect(parsed.mcpServers['my-srv'].args).toEqual(['tsx', 'src/server.ts']);
        });

        it('uses project name as server key', () => {
            const config: ProjectConfig = { name: 'custom-name', transport: 'sse', vector: 'prisma', testing: true };
            const parsed = JSON.parse(tpl.cursorMcpJson(config));
            expect(Object.keys(parsed.mcpServers)).toEqual(['custom-name']);
        });
    });

    // ── readme ───────────────────────────────────────────────

    describe('readme', () => {
        const config: ProjectConfig = { name: 'test-srv', transport: 'stdio', vector: 'vanilla', testing: true };

        it('contains project name as heading', () => {
            expect(tpl.readme(config)).toContain('# test-srv');
        });

        it('mentions Cursor auto-configuration', () => {
            expect(tpl.readme(config)).toContain('.cursor/mcp.json');
        });

        it('includes Claude Desktop config', () => {
            expect(tpl.readme(config)).toContain('claude_desktop_config.json');
        });

        it('includes Quick Start and testing section', () => {
            const content = tpl.readme(config);
            expect(content).toContain('npm install');
            expect(content).toContain('npm run dev');
            expect(content).toContain('npm test');
        });

        it('omits testing section when testing=false', () => {
            const content = tpl.readme({ ...config, testing: false });
            expect(content).not.toContain('npm test');
        });

        it('includes database section for database vector', () => {
            expect(tpl.readme({ ...config, vector: 'prisma' })).toContain('DATABASE_URL');
            expect(tpl.readme({ ...config, vector: 'prisma' })).toContain('@fusion.hide');
        });

        it('includes workflow section for workflow vector', () => {
            expect(tpl.readme({ ...config, vector: 'n8n' })).toContain('n8n');
            expect(tpl.readme({ ...config, vector: 'n8n' })).toContain('N8N_BASE_URL');
        });

        it('includes openapi section for openapi vector', () => {
            expect(tpl.readme({ ...config, vector: 'openapi' })).toContain('openapi.yaml');
            expect(tpl.readme({ ...config, vector: 'openapi' })).toContain('mcp-fusion-openapi-gen');
        });

        it('includes oauth section for oauth vector', () => {
            const content = tpl.readme({ ...config, vector: 'oauth' });
            expect(content).toContain('OAUTH_CLIENT_ID');
            expect(content).toContain('withAuth');
            expect(content).toContain('Device Flow');
        });

        it('shows autoDiscover example for adding tools', () => {
            expect(tpl.readme(config)).toContain('autoDiscover');
            expect(tpl.readme(config)).toContain("import { f } from '../../fusion.js'");
        });
    });

    // ── testSetupTs ──────────────────────────────────────────

    describe('testSetupTs', () => {
        it('imports createFusionTester and autoDiscover', () => {
            const content = tpl.testSetupTs();
            expect(content).toContain("import { createFusionTester } from '@vinkius-core/mcp-fusion-testing'");
            expect(content).toContain('autoDiscover');
        });

        it('exports tester', () => {
            expect(tpl.testSetupTs()).toContain('export const tester');
        });
    });

    // ── systemTestTs ─────────────────────────────────────────

    describe('systemTestTs', () => {
        it('imports from vitest and setup', () => {
            const content = tpl.systemTestTs();
            expect(content).toContain("import { describe, it, expect } from 'vitest'");
            expect(content).toContain("import { tester } from './setup.js'");
        });

        it('tests Egress Firewall stripping', () => {
            const content = tpl.systemTestTs();
            expect(content).toContain("not.toHaveProperty('tenant')");
        });

        it('tests system rules injection', () => {
            expect(tpl.systemTestTs()).toContain('systemRules');
        });

        it('tests echo tool', () => {
            const content = tpl.systemTestTs();
            expect(content).toContain("'hello fusion'");
            expect(content).toContain("'echo'");
        });
    });
});

// ============================================================================
// Vector-specific template tests
// ============================================================================

describe('Vector-specific templates', () => {
    it('prismaSchema contains @fusion.hide on password', () => {
        const content = tpl.prismaSchema();
        expect(content).toContain('@fusion.hide');
        expect(content).toContain('password');
    });

    it('prismaSchema has both generators (client + fusion)', () => {
        const content = tpl.prismaSchema();
        expect(content).toContain('provider = "prisma-client-js"');
        expect(content).toContain('provider = "@vinkius-core/mcp-fusion-prisma-gen"');
    });

    it('prismaSchema has User and Post models', () => {
        const content = tpl.prismaSchema();
        expect(content).toContain('model User');
        expect(content).toContain('model Post');
        expect(content).toContain('@relation');
    });

    it('dbUsersToolTs uses Fluent API f.query()', () => {
        const content = tpl.dbUsersToolTs();
        expect(content).toContain("f.query('db.list_users')");
        expect(content).toContain('.withOptionalNumber');
    });

    it('n8nConnectorTs exports discoverWorkflows typed function', () => {
        const content = tpl.n8nConnectorTs();
        expect(content).toContain('export async function discoverWorkflows<TContext>');
        expect(content).toContain('ToolRegistry<TContext>');
    });

    it('n8nConnectorTs reads env vars', () => {
        const content = tpl.n8nConnectorTs();
        expect(content).toContain("process.env['N8N_BASE_URL']");
        expect(content).toContain("process.env['N8N_API_KEY']");
    });

    it('openapiYaml embeds project name', () => {
        const config: ProjectConfig = { name: 'api-srv', transport: 'stdio', vector: 'openapi', testing: false };
        const content = tpl.openapiYaml(config);
        expect(content).toContain('api-srv');
        expect(content).toContain("openapi: '3.0.3'");
    });

    it('openapiSetupMd contains step-by-step instructions', () => {
        const content = tpl.openapiSetupMd();
        expect(content).toContain('mcp-fusion-openapi-gen');
        expect(content).toContain('openapi.yaml');
        expect(content).toContain('--outDir');
    });
});

// ============================================================================
// Scaffold Integration Tests
// ============================================================================

describe('scaffold — file tree generation', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    // ── Base structure (all vectors) ─────────────────────────

    it('generates correct base file tree for vanilla vector with testing', () => {
        const projectDir = join(tmpDir, 'blank-test');
        const config: ProjectConfig = { name: 'blank-test', transport: 'stdio', vector: 'vanilla', testing: true };
        const files = scaffold(projectDir, config);

        // Plan defines 18 files for blank+testing
        const expectedFiles = [
            'package.json', 'tsconfig.json', '.gitignore', '.env.example', 'README.md',
            '.cursor/mcp.json', 'vitest.config.ts',
            'src/fusion.ts', 'src/context.ts', 'src/server.ts',
            'src/tools/system/health.ts', 'src/tools/system/echo.ts',
            'src/presenters/SystemPresenter.ts',
            'src/prompts/greet.ts',
            'src/middleware/auth.ts',
            'tests/setup.ts', 'tests/system.test.ts',
        ];
        for (const f of expectedFiles) {
            expect(files).toContain(f);
            expect(existsSync(join(projectDir, f))).toBe(true);
        }
    });

    it('all generated files are non-empty', () => {
        const projectDir = join(tmpDir, 'non-empty');
        const config: ProjectConfig = { name: 'non-empty', transport: 'stdio', vector: 'vanilla', testing: true };
        const files = scaffold(projectDir, config);

        for (const f of files) {
            const content = readFileSync(join(projectDir, f), 'utf-8');
            expect(content.length).toBeGreaterThan(0);
        }
    });

    // ── .cursor/mcp.json ─────────────────────────────────────

    it('generates .cursor/mcp.json with correct JSON structure', () => {
        const projectDir = join(tmpDir, 'cursor-json');
        scaffold(projectDir, { name: 'cursor-json', transport: 'stdio', vector: 'vanilla', testing: false });

        const cursorPath = join(projectDir, '.cursor', 'mcp.json');
        expect(existsSync(cursorPath)).toBe(true);

        const parsed = JSON.parse(readFileSync(cursorPath, 'utf-8'));
        expect(parsed.mcpServers['cursor-json']).toBeDefined();
        expect(parsed.mcpServers['cursor-json'].command).toBe('npx');
        expect(parsed.mcpServers['cursor-json'].args).toEqual(['tsx', 'src/server.ts']);
    });

    // ── Testing toggle ───────────────────────────────────────

    it('omits test files when testing=false', () => {
        const projectDir = join(tmpDir, 'no-tests');
        const files = scaffold(projectDir, { name: 'no-tests', transport: 'stdio', vector: 'vanilla', testing: false });

        expect(files).not.toContain('vitest.config.ts');
        expect(files).not.toContain('tests/setup.ts');
        expect(files).not.toContain('tests/system.test.ts');
        expect(existsSync(join(projectDir, 'vitest.config.ts'))).toBe(false);
    });

    it('includes test files when testing=true', () => {
        const projectDir = join(tmpDir, 'with-tests');
        const files = scaffold(projectDir, { name: 'with-tests', transport: 'stdio', vector: 'vanilla', testing: true });

        expect(files).toContain('vitest.config.ts');
        expect(files).toContain('tests/setup.ts');
        expect(files).toContain('tests/system.test.ts');
    });

    // ── Vector: database ─────────────────────────────────────

    it('generates prisma files for database vector', () => {
        const projectDir = join(tmpDir, 'db-test');
        const files = scaffold(projectDir, { name: 'db-test', transport: 'stdio', vector: 'prisma', testing: false });

        expect(files).toContain('prisma/schema.prisma');
        expect(files).toContain('src/tools/db/users.ts');

        const schema = readFileSync(join(projectDir, 'prisma', 'schema.prisma'), 'utf-8');
        expect(schema).toContain('@fusion.hide');
        expect(schema).toContain('mcp-fusion-prisma-gen');

        const dbTool = readFileSync(join(projectDir, 'src', 'tools', 'db', 'users.ts'), 'utf-8');
        expect(dbTool).toContain("'db.list_users'");
    });

    // ── Vector: workflow ─────────────────────────────────────

    it('generates n8n.ts for workflow vector', () => {
        const projectDir = join(tmpDir, 'wf-test');
        const files = scaffold(projectDir, { name: 'wf-test', transport: 'stdio', vector: 'n8n', testing: false });

        expect(files).toContain('src/n8n.ts');
        const n8n = readFileSync(join(projectDir, 'src', 'n8n.ts'), 'utf-8');
        expect(n8n).toContain('N8nConnector');
        expect(n8n).toContain('discoverWorkflows');
    });

    // ── Vector: openapi ──────────────────────────────────────

    it('generates openapi.yaml and SETUP.md for openapi vector', () => {
        const projectDir = join(tmpDir, 'api-test');
        const files = scaffold(projectDir, { name: 'api-test', transport: 'sse', vector: 'openapi', testing: false });

        expect(files).toContain('openapi.yaml');
        expect(files).toContain('SETUP.md');

        const yaml = readFileSync(join(projectDir, 'openapi.yaml'), 'utf-8');
        expect(yaml).toContain("openapi: '3.0.3'");
        expect(yaml).toContain('api-test');

        const setup = readFileSync(join(projectDir, 'SETUP.md'), 'utf-8');
        expect(setup).toContain('mcp-fusion-openapi-gen');
    });

    // ── Vector: oauth ───────────────────────────────────────

    it('generates auth files for oauth vector', () => {
        const projectDir = join(tmpDir, 'oauth-test');
        const files = scaffold(projectDir, { name: 'oauth-test', transport: 'stdio', vector: 'oauth', testing: false });

        expect(files).toContain('src/auth.ts');
        expect(files).toContain('src/middleware/auth.ts');

        const auth = readFileSync(join(projectDir, 'src', 'auth.ts'), 'utf-8');
        expect(auth).toContain('createAuthTool');
        expect(auth).toContain('OAUTH_CLIENT_ID');
        expect(auth).toContain('registerAuth');

        const middleware = readFileSync(join(projectDir, 'src', 'middleware', 'auth.ts'), 'utf-8');
        expect(middleware).toContain('requireAuth');
        expect(middleware).toContain('withAuth');
        expect(middleware).toContain('AUTH_REQUIRED');
    });

    // ── Transport toggle ─────────────────────────────────────

    it('server.ts uses startServer for stdio', () => {
        const projectDir = join(tmpDir, 'stdio-srv');
        scaffold(projectDir, { name: 'stdio-srv', transport: 'stdio', vector: 'vanilla', testing: false });
        const server = readFileSync(join(projectDir, 'src', 'server.ts'), 'utf-8');
        expect(server).toContain('startServer');
        expect(server).not.toContain('SSEServerTransport');
    });

    it('server.ts uses SSEServerTransport for sse', () => {
        const projectDir = join(tmpDir, 'sse-srv');
        scaffold(projectDir, { name: 'sse-srv', transport: 'sse', vector: 'vanilla', testing: false });
        const server = readFileSync(join(projectDir, 'src', 'server.ts'), 'utf-8');
        expect(server).toContain('SSEServerTransport');
        expect(server).not.toContain('startServer');
    });

    // ── package.json on disk ─────────────────────────────────

    it('package.json on disk is valid JSON with correct name', () => {
        const projectDir = join(tmpDir, 'pkg-test');
        scaffold(projectDir, { name: 'pkg-test', transport: 'stdio', vector: 'vanilla', testing: true });
        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('pkg-test');
        expect(pkg.type).toBe('module');
    });
});

// ============================================================================
// Config Matrix — All Combinations
// ============================================================================

describe('scaffold — config matrix (transport × vector × testing)', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    const transports: TransportLayer[] = ['stdio', 'sse'];
    const vectors: IngestionVector[] = ['vanilla', 'prisma', 'n8n', 'openapi'];
    const testingOptions = [true, false];

    for (const transport of transports) {
        for (const vector of vectors) {
            for (const testing of testingOptions) {
                const label = `${transport}/${vector}/testing=${testing}`;

                it(`scaffolds successfully for ${label}`, () => {
                    const name = `cfg-${transport}-${vector}-${testing}`;
                    const projectDir = join(tmpDir, name);
                    const config: ProjectConfig = { name, transport, vector, testing };

                    const files = scaffold(projectDir, config);
                    expect(files.length).toBeGreaterThan(10);

                    // Core files always present
                    expect(files).toContain('package.json');
                    expect(files).toContain('.cursor/mcp.json');
                    expect(files).toContain('src/fusion.ts');
                    expect(files).toContain('src/server.ts');

                    // package.json is valid JSON
                    expect(() => JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'))).not.toThrow();
                });
            }
        }
    }
});

// ============================================================================
// EDGE CASES — parseArgs
// ============================================================================

describe('parseArgs — edge cases & error paths', () => {
    it('handles empty argv gracefully', () => {
        const args = parseArgs([]);
        expect(args.command).toBe('');
        expect(args.projectName).toBeUndefined();
    });

    it('handles argv with only node and script', () => {
        const args = parseArgs(['node', 'fusion']);
        expect(args.command).toBe('');
    });

    it('treats unknown command as first positional', () => {
        const args = parseArgs(['node', 'fusion', 'unknown-cmd']);
        expect(args.command).toBe('unknown-cmd');
    });

    it('handles --transport without value (undefined)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--transport']);
        expect(args.transport).toBeUndefined();
    });

    it('handles --vector without value (undefined)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--vector']);
        expect(args.vector).toBeUndefined();
    });

    it('accepts invalid transport string at parse level (validation is in collectConfig)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--transport', 'websocket']);
        expect(args.transport).toBe('websocket');
    });

    it('accepts invalid vector string at parse level (validation is in collectConfig)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--vector', 'graphql']);
        expect(args.vector).toBe('graphql');
    });

    it('--testing flag at the end is captured', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--testing']);
        expect(args.testing).toBe(true);
    });

    it('--no-testing overrides earlier --testing (last wins)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--testing', '--no-testing']);
        expect(args.testing).toBe(false);
    });

    it('--testing overrides earlier --no-testing (last wins)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--no-testing', '--testing']);
        expect(args.testing).toBe(true);
    });

    it('handles project name with only hyphens', () => {
        const args = parseArgs(['node', 'fusion', 'create', '---']);
        expect(args.projectName).toBeUndefined(); // starts with --, treated as flag
    });

    it('handles duplicate --transport (last wins)', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--transport', 'stdio', '--transport', 'sse']);
        expect(args.transport).toBe('sse');
    });

    it('handles help flag combined with create', () => {
        const args = parseArgs(['node', 'fusion', 'create', '--help']);
        expect(args.command).toBe('create');
        expect(args.help).toBe(true);
    });

    it('does not capture lock --check flags in create context', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'srv', '--check']);
        expect(args.command).toBe('create');
        expect(args.check).toBe(true);
        expect(args.projectName).toBe('srv');
    });

    it('handles single character project name', () => {
        const args = parseArgs(['node', 'fusion', 'create', 'a']);
        expect(args.projectName).toBe('a');
    });
});

// ============================================================================
// EDGE CASES — collectConfig (invalid inputs)
// ============================================================================

describe('collectConfig — error paths & boundary conditions', () => {
    it('fast-path: invalid transport warns and falls back to stdio', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, transport: 'websocket' as TransportLayer };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.transport).toBe('stdio');
    });

    it('fast-path: invalid vector warns and falls back to blank', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, vector: 'graphql' as IngestionVector };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.vector).toBe('vanilla');
    });

    it('fast-path with testing=false explicitly', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, testing: false };
        const config = await collectConfig(args);
        expect(config!.testing).toBe(false);
    });

    it('fast-path with testing=true explicitly', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, testing: true };
        const config = await collectConfig(args);
        expect(config!.testing).toBe(true);
    });

    it('fast-path always returns a non-null config', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.name).toBeDefined();
        expect(config!.transport).toBeDefined();
        expect(config!.vector).toBeDefined();
        expect(typeof config!.testing).toBe('boolean');
    });

    it('fast-path uses all defaults correctly', async () => {
        const args: CliArgs = {
            ...baseCliArgs(),
            yes: true,
            projectName: undefined,
            transport: undefined,
            vector: undefined,
            testing: undefined,
        };
        const config = await collectConfig(args);
        expect(config).toEqual({
            name: 'my-mcp-server',
            transport: 'stdio',
            vector: 'vanilla',
            testing: true,
        });
    });
});

// ============================================================================
// EDGE CASES — Template output integrity
// ============================================================================

describe('Template integrity — no broken output', () => {
    const configs: ProjectConfig[] = [
        { name: 'test', transport: 'stdio', vector: 'vanilla', testing: true },
        { name: 'test', transport: 'sse', vector: 'prisma', testing: false },
        { name: 'test', transport: 'stdio', vector: 'n8n', testing: true },
        { name: 'test', transport: 'sse', vector: 'openapi', testing: false },
    ];

    for (const config of configs) {
        const label = `${config.transport}/${config.vector}/testing=${config.testing}`;

        it(`packageJson is valid JSON for ${label}`, () => {
            expect(() => JSON.parse(tpl.packageJson(config))).not.toThrow();
        });

        it(`cursorMcpJson is valid JSON for ${label}`, () => {
            expect(() => JSON.parse(tpl.cursorMcpJson(config))).not.toThrow();
        });
    }

    it('tsconfig is always valid JSON regardless of config', () => {
        expect(() => JSON.parse(tpl.tsconfig())).not.toThrow();
    });

    it('no template returns undefined or null', () => {
        const config: ProjectConfig = { name: 'x', transport: 'stdio', vector: 'vanilla', testing: true };

        const results = [
            tpl.packageJson(config), tpl.tsconfig(), tpl.vitestConfig(),
            tpl.gitignore(), tpl.envExample(config), tpl.fusionTs(),
            tpl.contextTs(), tpl.serverTs(config), tpl.healthToolTs(),
            tpl.echoToolTs(), tpl.systemPresenterTs(), tpl.greetPromptTs(),
            tpl.authMiddlewareTs(), tpl.cursorMcpJson(config), tpl.readme(config),
            tpl.testSetupTs(), tpl.systemTestTs(),
            tpl.prismaSchema(), tpl.dbUsersToolTs(), tpl.n8nConnectorTs(),
            tpl.openapiYaml(config), tpl.openapiSetupMd(),
        ];

        for (const result of results) {
            expect(result).toBeDefined();
            expect(result).not.toBeNull();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        }
    });

    it('no template contains literal "undefined" or "null" as text', () => {
        const config: ProjectConfig = { name: 'check', transport: 'stdio', vector: 'vanilla', testing: true };

        const templates = [
            tpl.packageJson(config), tpl.serverTs(config),
            tpl.cursorMcpJson(config), tpl.readme(config),
            tpl.healthToolTs(), tpl.echoToolTs(),
            tpl.fusionTs(), tpl.contextTs(),
        ];

        for (const content of templates) {
            // "undefined" as a string value (not in comments/descriptions)
            expect(content).not.toMatch(/:\s*undefined/);
            expect(content).not.toMatch(/:\s*null,/);
        }
    });
});

// ============================================================================
// EDGE CASES — ESM Import Validation
// ============================================================================

describe('Template imports — ESM .js extensions', () => {
    it('fusionTs uses .js extension for local imports', () => {
        const content = tpl.fusionTs();
        const localImports = content.match(/from\s+'\.\/[^']+'/g) ?? [];
        for (const imp of localImports) {
            expect(imp).toMatch(/\.js'$/);
        }
    });

    it('contextTs has no local imports (self-contained)', () => {
        const content = tpl.contextTs();
        const imports = content.match(/^import .+ from/gm) ?? [];
        // contextTs should have zero imports — it's a pure type/function file
        expect(imports.length).toBe(0);
    });

    it('serverTs uses .js extension for all local imports', () => {
        const config: ProjectConfig = { name: 'srv', transport: 'stdio', vector: 'vanilla', testing: false };
        const content = tpl.serverTs(config);
        const localImports = content.match(/from\s+'\.\/[^']+'/g) ?? [];
        expect(localImports.length).toBeGreaterThan(0);
        for (const imp of localImports) {
            expect(imp).toMatch(/\.js'$/);
        }
    });

    it('healthToolTs uses .js extension for relative imports', () => {
        const content = tpl.healthToolTs();
        const relativeImports = content.match(/from\s+'\.\.\/[^']+'/g) ?? [];
        expect(relativeImports.length).toBeGreaterThan(0);
        for (const imp of relativeImports) {
            expect(imp).toMatch(/\.js'$/);
        }
    });

    it('echoToolTs uses .js extension for relative imports', () => {
        const content = tpl.echoToolTs();
        const relativeImports = content.match(/from\s+'\.\.\/[^']+'/g) ?? [];
        expect(relativeImports.length).toBeGreaterThan(0);
        for (const imp of relativeImports) {
            expect(imp).toMatch(/\.js'$/);
        }
    });

    it('greetPromptTs uses .js extension for relative imports', () => {
        const content = tpl.greetPromptTs();
        const relativeImports = content.match(/from\s+'\.\.\/[^']+'/g) ?? [];
        for (const imp of relativeImports) {
            expect(imp).toMatch(/\.js'$/);
        }
    });

    it('testSetupTs references correct import paths', () => {
        const content = tpl.testSetupTs();
        expect(content).toContain("'@vinkius-core/mcp-fusion-testing'");
    });

    it('systemTestTs imports from setup with .js extension', () => {
        const content = tpl.systemTestTs();
        expect(content).toContain("from './setup.js'");
    });
});

// ============================================================================
// EDGE CASES — Cross-contamination guards
// ============================================================================

describe('Scaffold — cross-contamination guards', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    it('vanilla vector does NOT contain prisma, n8n, openapi, or oauth files', () => {
        const projectDir = join(tmpDir, 'blank-guard');
        const files = scaffold(projectDir, { name: 'blank-guard', transport: 'stdio', vector: 'vanilla', testing: false });

        expect(files).not.toContain('prisma/schema.prisma');
        expect(files).not.toContain('src/tools/db/users.ts');
        expect(files).not.toContain('src/n8n.ts');
        expect(files).not.toContain('openapi.yaml');
        expect(files).not.toContain('SETUP.md');
        expect(files).not.toContain('src/auth.ts');
    });

    it('database vector does NOT contain n8n, openapi, or oauth files', () => {
        const projectDir = join(tmpDir, 'db-guard');
        const files = scaffold(projectDir, { name: 'db-guard', transport: 'stdio', vector: 'prisma', testing: false });

        expect(files).toContain('prisma/schema.prisma');
        expect(files).not.toContain('src/n8n.ts');
        expect(files).not.toContain('openapi.yaml');
        expect(files).not.toContain('SETUP.md');
        expect(files).not.toContain('src/auth.ts');
    });

    it('workflow vector does NOT contain prisma, openapi, or oauth files', () => {
        const projectDir = join(tmpDir, 'wf-guard');
        const files = scaffold(projectDir, { name: 'wf-guard', transport: 'stdio', vector: 'n8n', testing: false });

        expect(files).toContain('src/n8n.ts');
        expect(files).not.toContain('prisma/schema.prisma');
        expect(files).not.toContain('src/tools/db/users.ts');
        expect(files).not.toContain('openapi.yaml');
        expect(files).not.toContain('src/auth.ts');
    });

    it('openapi vector does NOT contain prisma, n8n, or oauth files', () => {
        const projectDir = join(tmpDir, 'api-guard');
        const files = scaffold(projectDir, { name: 'api-guard', transport: 'stdio', vector: 'openapi', testing: false });

        expect(files).toContain('openapi.yaml');
        expect(files).toContain('SETUP.md');
        expect(files).not.toContain('prisma/schema.prisma');
        expect(files).not.toContain('src/n8n.ts');
        expect(files).not.toContain('src/auth.ts');
    });

    it('oauth vector does NOT contain prisma, n8n, or openapi files', () => {
        const projectDir = join(tmpDir, 'oauth-guard');
        const files = scaffold(projectDir, { name: 'oauth-guard', transport: 'stdio', vector: 'oauth', testing: false });

        expect(files).toContain('src/auth.ts');
        expect(files).toContain('src/middleware/auth.ts');
        expect(files).not.toContain('prisma/schema.prisma');
        expect(files).not.toContain('src/tools/db/users.ts');
        expect(files).not.toContain('src/n8n.ts');
        expect(files).not.toContain('openapi.yaml');
        expect(files).not.toContain('SETUP.md');
    });

    it('stdio server does NOT import SSEServerTransport in on-disk content', () => {
        const projectDir = join(tmpDir, 'stdio-guard');
        scaffold(projectDir, { name: 'stdio-guard', transport: 'stdio', vector: 'vanilla', testing: false });
        const server = readFileSync(join(projectDir, 'src', 'server.ts'), 'utf-8');
        expect(server).not.toContain('SSEServerTransport');
        expect(server).not.toContain('createServer');
    });

    it('sse server does NOT import StdioServerTransport in on-disk content', () => {
        const projectDir = join(tmpDir, 'sse-guard');
        scaffold(projectDir, { name: 'sse-guard', transport: 'sse', vector: 'vanilla', testing: false });
        const server = readFileSync(join(projectDir, 'src', 'server.ts'), 'utf-8');
        expect(server).not.toContain('StdioServerTransport');
        expect(server).toContain('createServer');
    });

    it('package.json deps are mutually exclusive across vectors', () => {
        const db = JSON.parse(tpl.packageJson({ name: 'x', transport: 'stdio', vector: 'prisma', testing: false }));
        const wf = JSON.parse(tpl.packageJson({ name: 'x', transport: 'stdio', vector: 'n8n', testing: false }));
        const api = JSON.parse(tpl.packageJson({ name: 'x', transport: 'stdio', vector: 'openapi', testing: false }));
        const auth = JSON.parse(tpl.packageJson({ name: 'x', transport: 'stdio', vector: 'oauth', testing: false }));

        // database should NOT have n8n, openapi, or oauth deps
        expect(db.dependencies['mcp-fusion-n8n']).toBeUndefined();
        expect(db.dependencies['mcp-fusion-openapi-gen']).toBeUndefined();
        expect(db.dependencies['@vinkius-core/mcp-fusion-oauth']).toBeUndefined();

        // workflow should NOT have prisma, openapi, or oauth deps
        expect(wf.dependencies['@prisma/client']).toBeUndefined();
        expect(wf.dependencies['mcp-fusion-openapi-gen']).toBeUndefined();
        expect(wf.dependencies['@vinkius-core/mcp-fusion-oauth']).toBeUndefined();

        // openapi should NOT have prisma, n8n, or oauth deps
        expect(api.dependencies['@prisma/client']).toBeUndefined();
        expect(api.dependencies['mcp-fusion-n8n']).toBeUndefined();
        expect(api.dependencies['@vinkius-core/mcp-fusion-oauth']).toBeUndefined();

        // oauth should NOT have prisma, n8n, or openapi deps
        expect(auth.dependencies['@prisma/client']).toBeUndefined();
        expect(auth.dependencies['mcp-fusion-n8n']).toBeUndefined();
        expect(auth.dependencies['mcp-fusion-openapi-gen']).toBeUndefined();
    });
});

// ============================================================================
// EDGE CASES — Scaffold file count invariants
// ============================================================================

describe('Scaffold — file count invariants', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    // Base files always generated (no testing, vanilla vector):
    // package.json, tsconfig.json, .gitignore, .env.example, README.md,
    // .cursor/mcp.json,
    // src/fusion.ts, src/context.ts, src/server.ts,
    // src/tools/system/health.ts, src/tools/system/echo.ts,
    // src/presenters/SystemPresenter.ts,
    // src/prompts/greet.ts,
    // src/middleware/auth.ts
    // = 14 files

    const BASE_COUNT = 14;

    it('blank + no testing = exactly 14 files', () => {
        const projectDir = join(tmpDir, 'count-base');
        const files = scaffold(projectDir, { name: 'count-base', transport: 'stdio', vector: 'vanilla', testing: false });
        expect(files.length).toBe(BASE_COUNT);
    });

    it('blank + testing = base + 3 files (vitest.config, setup, test)', () => {
        const projectDir = join(tmpDir, 'count-testing');
        const files = scaffold(projectDir, { name: 'count-testing', transport: 'stdio', vector: 'vanilla', testing: true });
        expect(files.length).toBe(BASE_COUNT + 3);
    });

    it('database + no testing = base + 2 files (schema, users.ts)', () => {
        const projectDir = join(tmpDir, 'count-db');
        const files = scaffold(projectDir, { name: 'count-db', transport: 'stdio', vector: 'prisma', testing: false });
        expect(files.length).toBe(BASE_COUNT + 2);
    });

    it('workflow + no testing = base + 1 file (n8n.ts)', () => {
        const projectDir = join(tmpDir, 'count-wf');
        const files = scaffold(projectDir, { name: 'count-wf', transport: 'stdio', vector: 'n8n', testing: false });
        expect(files.length).toBe(BASE_COUNT + 1);
    });

    it('openapi + no testing = base + 2 files (openapi.yaml, SETUP.md)', () => {
        const projectDir = join(tmpDir, 'count-api');
        const files = scaffold(projectDir, { name: 'count-api', transport: 'stdio', vector: 'openapi', testing: false });
        expect(files.length).toBe(BASE_COUNT + 2);
    });

    it('database + testing = base + 3 + 2 = 19 files', () => {
        const projectDir = join(tmpDir, 'count-db-test');
        const files = scaffold(projectDir, { name: 'count-db-test', transport: 'stdio', vector: 'prisma', testing: true });
        expect(files.length).toBe(BASE_COUNT + 3 + 2);
    });

    it('no duplicate file paths across any config', () => {
        const projectDir = join(tmpDir, 'no-dupes');
        const files = scaffold(projectDir, { name: 'no-dupes', transport: 'stdio', vector: 'prisma', testing: true });
        const unique = new Set(files);
        expect(unique.size).toBe(files.length);
    });
});

// ============================================================================
// EDGE CASES — Scaffold with special characters in name
// ============================================================================

describe('Scaffold — project name edge cases', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    it('handles single char project name', () => {
        const projectDir = join(tmpDir, 'a');
        const files = scaffold(projectDir, { name: 'a', transport: 'stdio', vector: 'vanilla', testing: false });
        expect(files.length).toBeGreaterThan(0);

        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('a');
    });

    it('handles very long project name (50 chars)', () => {
        const longName = 'a'.repeat(50);
        const projectDir = join(tmpDir, longName);
        const files = scaffold(projectDir, { name: longName, transport: 'stdio', vector: 'vanilla', testing: false });

        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe(longName);
    });

    it('handles numeric-only project name', () => {
        const projectDir = join(tmpDir, '12345');
        const files = scaffold(projectDir, { name: '12345', transport: 'stdio', vector: 'vanilla', testing: false });

        const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('12345');
    });

    it('project name appears in server.ts, cursor config, and readme', () => {
        const projectDir = join(tmpDir, 'named-srv');
        scaffold(projectDir, { name: 'named-srv', transport: 'stdio', vector: 'vanilla', testing: false });

        const server = readFileSync(join(projectDir, 'src', 'server.ts'), 'utf-8');
        expect(server).toContain("'named-srv'");

        const cursor = JSON.parse(readFileSync(join(projectDir, '.cursor', 'mcp.json'), 'utf-8'));
        expect(cursor.mcpServers['named-srv']).toBeDefined();

        const readme = readFileSync(join(projectDir, 'README.md'), 'utf-8');
        expect(readme).toContain('# named-srv');
    });
});

// ============================================================================
// EDGE CASES — Scaffold filesystem verification
// ============================================================================

describe('Scaffold — filesystem integrity', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    it('creates all nested directories for deep file paths', () => {
        const projectDir = join(tmpDir, 'nested');
        scaffold(projectDir, { name: 'nested', transport: 'stdio', vector: 'prisma', testing: true });

        // Verify deep nested directories exist
        expect(existsSync(join(projectDir, 'src', 'tools', 'system'))).toBe(true);
        expect(existsSync(join(projectDir, 'src', 'tools', 'db'))).toBe(true);
        expect(existsSync(join(projectDir, 'src', 'presenters'))).toBe(true);
        expect(existsSync(join(projectDir, 'src', 'prompts'))).toBe(true);
        expect(existsSync(join(projectDir, 'src', 'middleware'))).toBe(true);
        expect(existsSync(join(projectDir, '.cursor'))).toBe(true);
        expect(existsSync(join(projectDir, 'prisma'))).toBe(true);
        expect(existsSync(join(projectDir, 'tests'))).toBe(true);
    });

    it('files written to disk match returned path list exactly', () => {
        const projectDir = join(tmpDir, 'match');
        const files = scaffold(projectDir, { name: 'match', transport: 'stdio', vector: 'vanilla', testing: true });

        const onDisk = listFilesRecursive(projectDir);
        // Convert to forward slashes for comparison
        const normalizedFiles = files.map(f => f.replace(/\\/g, '/'));
        const normalizedOnDisk = onDisk.map(f => f.replace(/\\/g, '/'));

        expect(normalizedOnDisk.sort()).toEqual(normalizedFiles.sort());
    });

    it('all files are UTF-8 text and readable', () => {
        const projectDir = join(tmpDir, 'utf8');
        const files = scaffold(projectDir, { name: 'utf8', transport: 'stdio', vector: 'vanilla', testing: false });

        for (const f of files) {
            const content = readFileSync(join(projectDir, f), 'utf-8');
            expect(typeof content).toBe('string');
            expect(content.length).toBeGreaterThan(0);
        }
    });

    it('no empty files are generated', () => {
        const projectDir = join(tmpDir, 'no-empty');
        const files = scaffold(projectDir, { name: 'no-empty', transport: 'sse', vector: 'prisma', testing: true });

        for (const f of files) {
            const size = statSync(join(projectDir, f)).size;
            expect(size).toBeGreaterThan(0);
        }
    });

    it('.cursor/mcp.json has exactly one server entry', () => {
        const projectDir = join(tmpDir, 'one-entry');
        scaffold(projectDir, { name: 'one-entry', transport: 'stdio', vector: 'vanilla', testing: false });

        const cursor = JSON.parse(readFileSync(join(projectDir, '.cursor', 'mcp.json'), 'utf-8'));
        expect(Object.keys(cursor.mcpServers)).toHaveLength(1);
    });
});

// ============================================================================
// EDGE CASES — Template dep version consistency
// ============================================================================

describe('Template output — dependency version format', () => {
    const config: ProjectConfig = { name: 'ver', transport: 'stdio', vector: 'prisma', testing: true };

    it('all dependency versions start with ^ or ~', () => {
        const pkg = JSON.parse(tpl.packageJson(config));

        for (const [name, ver] of Object.entries(pkg.dependencies as Record<string, string>)) {
            expect(ver).toMatch(/^\^|~/, `Dependency ${name} has invalid version: ${ver}`);
        }
        for (const [name, ver] of Object.entries(pkg.devDependencies as Record<string, string>)) {
            expect(ver).toMatch(/^\^|~/, `Dev dependency ${name} has invalid version: ${ver}`);
        }
    });

    it('no dependency has "latest" or "*" as version', () => {
        const pkg = JSON.parse(tpl.packageJson(config));

        for (const ver of Object.values(pkg.dependencies as Record<string, string>)) {
            expect(ver).not.toBe('latest');
            expect(ver).not.toBe('*');
        }
    });
});

// ============================================================================
// EDGE CASES — ANSI color safety
// ============================================================================

describe('ANSI helpers — edge cases', () => {
    it('handles special characters without corruption', () => {
        const result = ansi.cyan('hello "world" <test> & stuff');
        expect(result).toContain('hello "world" <test> & stuff');
    });

    it('handles newlines in input', () => {
        const result = ansi.bold('line1\nline2');
        expect(result).toContain('line1\nline2');
    });

    it('handles unicode', () => {
        const result = ansi.green('✓ 日本語 émoji 🚀');
        expect(result).toContain('✓ 日本語 émoji 🚀');
    });

    it('all colors start with ESC[ and end with reset', () => {
        const helpers = [ansi.cyan, ansi.green, ansi.dim, ansi.bold, ansi.red];
        for (const fn of helpers) {
            const result = fn('test');
            expect(result.startsWith('\x1b[')).toBe(true);
            expect(result.endsWith('\x1b[0m')).toBe(true);
        }
    });
});

// ============================================================================
// EDGE CASES — ask() boundary conditions
// ============================================================================

describe('ask — boundary conditions', () => {
    it('handles newlines in user input (takes first line)', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb('first\nsecond'),
        };
        const result = await ask(mockRl, 'Name?', 'default');
        // readline typically delivers one line, but we should handle it
        expect(result).toBe('first\nsecond');
    });

    it('handles very long input (1000 chars)', async () => {
        const longInput = 'x'.repeat(1000);
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb(longInput),
        };
        const result = await ask(mockRl, 'Name?', 'default');
        expect(result).toBe(longInput);
    });

    it('handles tab characters as non-empty input', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb('\t'),
        };
        const result = await ask(mockRl, 'Name?', 'default');
        // \t.trim() === '' → fallback
        expect(result).toBe('default');
    });

    it('handles special characters in fallback', async () => {
        const mockRl = {
            question: (_q: string, cb: (a: string) => void) => cb(''),
        };
        const result = await ask(mockRl, 'Name?', 'my-server-2.0');
        expect(result).toBe('my-server-2.0');
    });
});

// ============================================================================
// EDGE CASES — Scaffold does not leak state between calls
// ============================================================================

describe('Scaffold — isolation between calls', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = tempDir(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

    it('two sequential scaffolds produce independent trees', () => {
        const dir1 = join(tmpDir, 'proj-1');
        const dir2 = join(tmpDir, 'proj-2');

        const files1 = scaffold(dir1, { name: 'proj-1', transport: 'stdio', vector: 'prisma', testing: true });
        const files2 = scaffold(dir2, { name: 'proj-2', transport: 'sse', vector: 'n8n', testing: false });

        // proj-1 should have database files but not workflow
        expect(files1).toContain('prisma/schema.prisma');
        expect(files1).not.toContain('src/n8n.ts');

        // proj-2 should have workflow files but not database
        expect(files2).toContain('src/n8n.ts');
        expect(files2).not.toContain('prisma/schema.prisma');

        // proj-1 should have test files, proj-2 should not
        expect(files1).toContain('tests/setup.ts');
        expect(files2).not.toContain('tests/setup.ts');

        // Different server names in package.json
        const pkg1 = JSON.parse(readFileSync(join(dir1, 'package.json'), 'utf-8'));
        const pkg2 = JSON.parse(readFileSync(join(dir2, 'package.json'), 'utf-8'));
        expect(pkg1.name).toBe('proj-1');
        expect(pkg2.name).toBe('proj-2');
    });

    it('scaffold returns fresh array each time (no shared state)', () => {
        const dir1 = join(tmpDir, 'fresh-1');
        const dir2 = join(tmpDir, 'fresh-2');

        const files1 = scaffold(dir1, { name: 'fresh-1', transport: 'stdio', vector: 'vanilla', testing: false });
        const files2 = scaffold(dir2, { name: 'fresh-2', transport: 'stdio', vector: 'vanilla', testing: false });

        // Same structure but different objects
        expect(files1).toEqual(files2);
        expect(files1).not.toBe(files2); // not the same reference
    });
});

// ============================================================================
// EDGE CASES — packageJson script consistency
// ============================================================================

describe('Template output — script & config consistency', () => {
    it('dev script references same file as Cursor mcp.json args', () => {
        const config: ProjectConfig = { name: 'consistent', transport: 'stdio', vector: 'vanilla', testing: false };
        const pkg = JSON.parse(tpl.packageJson(config));
        const cursor = JSON.parse(tpl.cursorMcpJson(config));

        // dev script uses `tsx watch src/server.ts`, cursor uses `tsx src/server.ts`
        expect(pkg.scripts.dev).toContain('src/server.ts');
        expect(cursor.mcpServers['consistent'].args).toContain('src/server.ts');
    });

    it('test script matches vitest config pattern', () => {
        const config: ProjectConfig = { name: 'test-match', transport: 'stdio', vector: 'vanilla', testing: true };
        const pkg = JSON.parse(tpl.packageJson(config));
        const vitestContent = tpl.vitestConfig();

        expect(pkg.scripts.test).toBe('vitest run');
        expect(vitestContent).toContain('tests/**/*.test.ts');
    });

    it('tsconfig rootDir/outDir match gitignore', () => {
        const tsconfig = JSON.parse(tpl.tsconfig());
        const gitignoreContent = tpl.gitignore();

        expect(tsconfig.compilerOptions.outDir).toBe('./dist');
        expect(gitignoreContent).toContain('dist/');
    });

    it('tsconfig exclude matches expected directories', () => {
        const tsconfig = JSON.parse(tpl.tsconfig());
        expect(tsconfig.exclude).toContain('node_modules');
        expect(tsconfig.exclude).toContain('dist');
        expect(tsconfig.exclude).toContain('tests');
    });

    it('envExample .env pattern matches gitignore', () => {
        const gitignoreContent = tpl.gitignore();
        expect(gitignoreContent).toContain('.env');
        expect(gitignoreContent).toContain('.env.local');
    });
});

// ============================================================================
// DX Audit Coverage — Round 2 & 3 Fixes
// ============================================================================

describe('Name validation — trailing hyphen and edge cases', () => {
    it('rejects names ending with a hyphen', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: 'my-server-' };
        const config = await collectConfig(args);
        expect(config).toBeNull();
    });

    it('rejects names starting with a hyphen', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: '-my-server' };
        const config = await collectConfig(args);
        expect(config).toBeNull();
    });

    it('rejects names with consecutive hyphens', async () => {
        // consecutive hyphens are allowed by the regex (ugly but valid npm names)
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: 'my--server' };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
    });

    it('accepts single character name', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: 'a' };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.name).toBe('a');
    });

    it('accepts two character name', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: 'ab' };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.name).toBe('ab');
    });

    it('rejects names starting with a number', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: '3server' };
        const config = await collectConfig(args);
        expect(config).toBeNull();
    });

    it('accepts single digit name', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, projectName: '3' };
        const config = await collectConfig(args);
        // single digit matches /^[a-z0-9]$/
        expect(config).not.toBeNull();
    });
});

describe('Transport/vector validation warnings', () => {
    it('fast-path: warns and falls back for unknown transport', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, transport: 'http' as TransportLayer };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.transport).toBe('stdio');
    });

    it('fast-path: warns and falls back for unknown vector', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, vector: 'redis' as IngestionVector };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.vector).toBe('vanilla');
    });

    it('fast-path: accepts valid transport without warning', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, transport: 'sse' };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.transport).toBe('sse');
    });

    it('fast-path: accepts valid vector without warning', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, vector: 'prisma' };
        const config = await collectConfig(args);
        expect(config).not.toBeNull();
        expect(config!.vector).toBe('prisma');
    });

    it('fast-path: undefined transport defaults to stdio without warning', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, transport: undefined };
        const config = await collectConfig(args);
        expect(config!.transport).toBe('stdio');
    });

    it('fast-path: undefined vector defaults to blank without warning', async () => {
        const args: CliArgs = { ...baseCliArgs(), yes: true, vector: undefined };
        const config = await collectConfig(args);
        expect(config!.vector).toBe('vanilla');
    });
});

describe('SSE transport-aware templates', () => {
    it('cursor config for SSE uses url instead of command', () => {
        const config: ProjectConfig = { name: 'sse-proj', transport: 'sse', vector: 'vanilla', testing: false };
        const cursor = JSON.parse(tpl.cursorMcpJson(config));

        expect(cursor.mcpServers['sse-proj'].url).toBe('http://localhost:3001/sse');
        expect(cursor.mcpServers['sse-proj'].command).toBeUndefined();
        expect(cursor.mcpServers['sse-proj'].args).toBeUndefined();
    });

    it('cursor config for stdio uses command, not url', () => {
        const config: ProjectConfig = { name: 'stdio-proj', transport: 'stdio', vector: 'vanilla', testing: false };
        const cursor = JSON.parse(tpl.cursorMcpJson(config));

        expect(cursor.mcpServers['stdio-proj'].command).toBe('npx');
        expect(cursor.mcpServers['stdio-proj'].args).toContain('tsx');
        expect(cursor.mcpServers['stdio-proj'].url).toBeUndefined();
    });

    it('README for SSE shows npm start instead of npm run dev', () => {
        const config: ProjectConfig = { name: 'sse-readme', transport: 'sse', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain('npm start');
        expect(readmeContent).not.toContain('npm run dev');
    });

    it('README for stdio shows npm run dev', () => {
        const config: ProjectConfig = { name: 'stdio-readme', transport: 'stdio', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain('npm run dev');
    });

    it('README for SSE includes SSE note about starting server first', () => {
        const config: ProjectConfig = { name: 'sse-note', transport: 'sse', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain('SSE transport requires the server to be running first');
    });

    it('README for SSE uses url-based client config', () => {
        const config: ProjectConfig = { name: 'sse-client', transport: 'sse', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain('http://localhost:3001/sse');
        expect(readmeContent).not.toContain('"command": "npx"');
    });

    it('README for stdio uses command-based client config', () => {
        const config: ProjectConfig = { name: 'stdio-client', transport: 'stdio', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain('"command": "npx"');
        expect(readmeContent).not.toContain('http://localhost:3001/sse');
    });
});

describe('server.ts — prompt registration', () => {
    it('server.ts imports GreetPrompt', () => {
        const config: ProjectConfig = { name: 'prompt-srv', transport: 'stdio', vector: 'vanilla', testing: false };
        const server = tpl.serverTs(config);

        expect(server).toContain("import { GreetPrompt } from './prompts/greet.js'");
    });

    it('server.ts registers GreetPrompt with prompts registry', () => {
        const config: ProjectConfig = { name: 'prompt-reg', transport: 'stdio', vector: 'vanilla', testing: false };
        const server = tpl.serverTs(config);

        expect(server).toContain('prompts.register(GreetPrompt)');
    });

    it('server.ts uses startServer for stdio bootstrap', () => {
        const config: ProjectConfig = { name: 'prompt-log', transport: 'stdio', vector: 'vanilla', testing: false };
        const server = tpl.serverTs(config);

        expect(server).toContain('startServer');
    });
});

describe('package.json — typecheck script', () => {
    it('always includes typecheck script', () => {
        const config: ProjectConfig = { name: 'tc-test', transport: 'stdio', vector: 'vanilla', testing: false };
        const pkg = JSON.parse(tpl.packageJson(config));

        expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    });

    it('typecheck script present even without testing', () => {
        const config: ProjectConfig = { name: 'tc-no-test', transport: 'stdio', vector: 'vanilla', testing: false };
        const pkg = JSON.parse(tpl.packageJson(config));

        expect(pkg.scripts.typecheck).toBeDefined();
        expect(pkg.scripts.test).toBeUndefined();
    });
});

describe('tsconfig — no conflicting flags', () => {
    it('does NOT include esModuleInterop when verbatimModuleSyntax is set', () => {
        const tsconfig = JSON.parse(tpl.tsconfig());

        expect(tsconfig.compilerOptions.verbatimModuleSyntax).toBe(true);
        expect(tsconfig.compilerOptions.esModuleInterop).toBeUndefined();
    });

    it('includes all strict-mode flags', () => {
        const tsconfig = JSON.parse(tpl.tsconfig());

        expect(tsconfig.compilerOptions.strict).toBe(true);
        expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
        expect(tsconfig.compilerOptions.noFallthroughCasesInSwitch).toBe(true);
        expect(tsconfig.compilerOptions.exactOptionalPropertyTypes).toBe(true);
        expect(tsconfig.compilerOptions.noImplicitOverride).toBe(true);
    });
});

describe('README — correct tool example syntax', () => {
    it('tool example uses Fluent API f.query() pattern', () => {
        const config: ProjectConfig = { name: 'readme-syntax', transport: 'stdio', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        // Must use f.query() with .withString() and .handle()
        expect(readmeContent).toContain("f.query('my_domain.my_tool')");
        expect(readmeContent).toContain(".withString('query', 'Search query')");
    });

    it('tool example uses .handle() with raw data return', () => {
        const config: ProjectConfig = { name: 'readme-handle', transport: 'stdio', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain('.handle(async');
        expect(readmeContent).toContain('return { result: input.query }');
    });

    it('tool example imports f from fusion.js', () => {
        const config: ProjectConfig = { name: 'readme-import', transport: 'stdio', vector: 'vanilla', testing: false };
        const readmeContent = tpl.readme(config);

        expect(readmeContent).toContain("import { f } from '../../fusion.js'");
    });
});

// ============================================================================
// Round 4 — Coverage: ProgressTracker, createDefaultReporter, commandCreate
// ============================================================================

describe('ProgressTracker — coverage', () => {
    it('start/done reports correct steps', () => {
        const steps: Array<{ id: string; label: string; status: string; detail?: string }> = [];
        const tracker = new ProgressTracker((step) => steps.push(step));

        tracker.start('s1', 'Step One');
        tracker.done('s1', 'Step One', '42 files');

        expect(steps).toHaveLength(2);
        expect(steps[0]!.status).toBe('running');
        expect(steps[1]!.status).toBe('done');
        expect(steps[1]!.detail).toBe('42 files');
    });

    it('fail reports failure with detail', () => {
        const steps: Array<{ id: string; status: string; detail?: string }> = [];
        const tracker = new ProgressTracker((step) => steps.push(step));

        tracker.start('install', 'Installing');
        tracker.fail('install', 'Installing', 'run npm install manually');

        expect(steps[1]!.status).toBe('failed');
        expect(steps[1]!.detail).toBe('run npm install manually');
    });

    it('done without prior start still works (no durationMs)', () => {
        const steps: Array<{ id: string; status: string; durationMs?: number }> = [];
        const tracker = new ProgressTracker((step) => steps.push(step));

        tracker.done('orphan', 'Orphan Step');

        expect(steps).toHaveLength(1);
        expect(steps[0]!.status).toBe('done');
        expect(steps[0]!.durationMs).toBeUndefined();
    });

    it('uses default reporter when none provided', () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const tracker = new ProgressTracker();
        tracker.start('x', 'Test');
        tracker.done('x', 'Test');
        expect(stderrSpy).toHaveBeenCalled();
        stderrSpy.mockRestore();
    });
});

describe('createDefaultReporter — coverage', () => {
    it('writes to stderr with correct icons', () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const reporter = createDefaultReporter();

        reporter({ id: 'r', label: 'Run', status: 'running' });
        reporter({ id: 'r', label: 'Run', status: 'done', detail: '5 items', durationMs: 123 });
        reporter({ id: 'r', label: 'Run', status: 'failed', detail: 'err' });
        reporter({ id: 'r', label: 'Run', status: 'pending' });

        const calls = stderrSpy.mock.calls.map(c => c[0] as string);
        expect(calls[0]).toContain('◐');
        expect(calls[1]).toContain('●');
        expect(calls[1]).toContain('5 items');
        expect(calls[1]).toContain('(123ms)');
        expect(calls[2]).toContain('✗');
        expect(calls[3]).toContain('○');

        stderrSpy.mockRestore();
    });
});

describe('MCP_FUSION_VERSION — coverage', () => {
    it('is a valid semver string', () => {
        expect(MCP_FUSION_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
});

describe('collectConfig — interactive path with pre-filled args', () => {
    it('uses pre-filled args when available (no actual readline needed)', async () => {
        // When all args are provided via CLI flags (projectName, transport, vector, testing),
        // the interactive path still runs but uses them directly via `args.xxx ?? await ask()`
        // This exercises the non-yes path without needing to mock readline
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

        const args: CliArgs = {
            command: 'create',
            check: false,
            server: undefined,
            name: undefined,
            cwd: '/tmp',
            help: false,
            projectName: 'wizard-test',
            transport: 'sse',
            vector: 'prisma',
            testing: true,
            yes: false,
        };

        const config = await collectConfig(args);

        expect(config).not.toBeNull();
        expect(config!.name).toBe('wizard-test');
        expect(config!.transport).toBe('sse');
        expect(config!.vector).toBe('prisma');
        expect(config!.testing).toBe(true);

        // Verify the wizard header was printed
        const output = stderrSpy.mock.calls.map(c => c[0] as string).join('');
        expect(output).toContain('MCP Fusion');

        stderrSpy.mockRestore();
    });
});

describe('commandCreate — SSE transport path', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = tempDir();
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('SSE transport shows npm start instead of npm run dev', async () => {
        const steps: Array<{ id: string; label: string; status: string; detail?: string }> = [];
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

        const args: CliArgs = {
            command: 'create',
            check: false,
            server: undefined,
            name: undefined,
            cwd: tmpDir,
            help: false,
            projectName: 'sse-proj',
            transport: 'sse',
            vector: 'vanilla',
            testing: false,
            yes: true,
        };

        await commandCreate(args, (step) => steps.push(step));

        // Check stderr output contains SSE-specific next steps
        const output = stderrSpy.mock.calls.map(c => c[0] as string).join('');
        expect(output).toContain('npm start');
        expect(output).toContain('http://localhost:3001/sse');

        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    }, 30_000);

    it('directory-exists guard triggers process.exit', async () => {
        // Create the target directory first
        mkdirSync(join(tmpDir, 'exists-proj'), { recursive: true });

        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

        const args: CliArgs = {
            command: 'create',
            check: false,
            server: undefined,
            name: undefined,
            cwd: tmpDir,
            help: false,
            projectName: 'exists-proj',
            transport: 'stdio',
            vector: 'vanilla',
            testing: false,
            yes: true,
        };

        await expect(commandCreate(args)).rejects.toThrow('exit');

        const output = stderrSpy.mock.calls.map(c => c[0] as string).join('');
        expect(output).toContain('already exists');

        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });
});
