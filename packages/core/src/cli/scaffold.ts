/**
 * Scaffold Engine — Project Directory Builder
 *
 * Receives a `ProjectConfig` from the CLI wizard, builds the
 * complete file list (including vector-specific files), and
 * writes everything to disk in one pass.
 *
 * @module
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ProjectConfig } from './types.js';
import * as tpl from './templates/index.js';

// ── Types ────────────────────────────────────────────────

interface ScaffoldFile {
    readonly path: string;
    readonly content: string;
}

// ── Public API ───────────────────────────────────────────

/**
 * Write all project files to the target directory.
 *
 * @param targetDir - Absolute path to the project directory
 * @param config - Wizard configuration
 * @returns Array of relative file paths written
 */
export function scaffold(targetDir: string, config: ProjectConfig): string[] {
    const files = config.target === 'vercel'
        ? buildVercelFileList(config)
        : config.target === 'cloudflare'
            ? buildCloudflareFileList(config)
            : buildFileList(config);

    try {
        for (const file of files) {
            const fullPath = join(targetDir, file.path);
            const dir = dirname(fullPath);
            mkdirSync(dir, { recursive: true });
            writeFileSync(fullPath, file.content, 'utf-8');
        }
    } catch (err) {
        // Clean up partially-written project to avoid orphaned files
        try { rmSync(targetDir, { recursive: true, force: true }); } catch { /* best effort */ }
        throw err;
    }

    return files.map(f => f.path);
}

// ── File List Builder ────────────────────────────────────

function buildFileList(config: ProjectConfig): ScaffoldFile[] {
    const files: ScaffoldFile[] = [];

    // ── Root config ──────────────────────────────────────
    files.push({ path: 'package.json', content: tpl.packageJson(config) });
    files.push({ path: 'tsconfig.json', content: tpl.tsconfig() });
    files.push({ path: '.gitignore', content: tpl.gitignore() });
    files.push({ path: '.env.example', content: tpl.envExample(config) });
    files.push({ path: 'README.md', content: tpl.readme(config) });

    // ── Zero-click editor integration ─────────────────────
    files.push({ path: '.cursor/mcp.json', content: tpl.cursorMcpJson(config) });
    files.push({ path: '.vscode/mcp.json', content: tpl.cursorMcpJson(config) });

    // ── Testing config ───────────────────────────────────
    if (config.testing) {
        files.push({ path: 'vitest.config.ts', content: tpl.vitestConfig() });
    }

    // ── Core source ──────────────────────────────────────
    files.push({ path: 'src/vurb.ts', content: tpl.vurbTs() });
    files.push({ path: 'src/context.ts', content: tpl.contextTs() });
    files.push({ path: 'src/server.ts', content: tpl.serverTs(config) });

    // ── Tools ────────────────────────────────────────────
    files.push({ path: 'src/tools/system/health.ts', content: tpl.healthToolTs() });
    files.push({ path: 'src/tools/system/echo.ts', content: tpl.echoToolTs() });

    // ── Model ─────────────────────────────────────────────
    files.push({ path: 'src/models/SystemModel.ts', content: tpl.systemModelTs() });

    // ── Presenter ────────────────────────────────────────
    files.push({ path: 'src/presenters/SystemPresenter.ts', content: tpl.systemPresenterTs() });

    // ── Prompts ──────────────────────────────────────────
    files.push({ path: 'src/prompts/greet.ts', content: tpl.greetPromptTs() });

    // ── Middleware ────────────────────────────────────────
    if (config.vector !== 'oauth') {
        files.push({ path: 'src/middleware/auth.ts', content: tpl.authMiddlewareTs() });
    }

    // ── Testing ──────────────────────────────────────────
    if (config.testing) {
        files.push({ path: 'tests/setup.ts', content: tpl.testSetupTs() });
        files.push({ path: 'tests/system.test.ts', content: tpl.systemTestTs() });
    }

    // ── Vector-specific files ────────────────────────────
    addVectorFiles(files, config);

    return files;
}

// ── Vector-Specific Files ────────────────────────────────

function addVectorFiles(files: ScaffoldFile[], config: ProjectConfig): void {
    switch (config.vector) {
        case 'prisma':
            files.push({ path: 'prisma/schema.prisma', content: tpl.prismaSchema() });
            files.push({ path: 'src/tools/db/users.ts', content: tpl.dbUsersToolTs() });
            break;

        case 'n8n':
            files.push({ path: 'src/n8n.ts', content: tpl.n8nConnectorTs() });
            break;

        case 'openapi':
            files.push({ path: 'openapi.yaml', content: tpl.openapiYaml(config) });
            files.push({ path: 'SETUP.md', content: tpl.openapiSetupMd() });
            break;

        case 'oauth':
            files.push({ path: 'src/auth.ts', content: tpl.oauthSetupTs(config) });
            files.push({ path: 'src/middleware/auth.ts', content: tpl.oauthMiddlewareTs() });
            break;

        case 'vanilla':
        default:
            // No extra files for vanilla (autoDiscover handles everything)
            break;
    }
}

// ── Vercel File List Builder ────────────────────────────

function buildVercelFileList(config: ProjectConfig): ScaffoldFile[] {
    const files: ScaffoldFile[] = [];

    // ── Root config ──
    files.push({ path: 'package.json', content: tpl.vercelPackageJson(config) });
    files.push({ path: 'tsconfig.json', content: tpl.vercelTsconfig() });
    files.push({ path: 'next.config.ts', content: tpl.vercelNextConfig() });
    files.push({ path: '.gitignore', content: tpl.vercelGitignore() });
    files.push({ path: '.env.example', content: tpl.vercelEnvExample(config) });
    files.push({ path: 'README.md', content: tpl.vercelReadme(config) });

    // ── Next.js route handler ──
    files.push({ path: 'app/api/mcp/route.ts', content: tpl.vercelRouteTs(config) });

    // ── MCP source (under src/mcp/) ──
    files.push({ path: 'src/mcp/vurb.ts', content: tpl.vercelVurbTs() });
    files.push({ path: 'src/mcp/context.ts', content: tpl.vercelContextTs() });
    files.push({ path: 'src/mcp/registry.ts', content: tpl.vercelRegistryTs() });

    // ── Tools ──
    files.push({ path: 'src/mcp/tools/system/health.ts', content: tpl.healthToolTs() });
    files.push({ path: 'src/mcp/tools/system/echo.ts', content: tpl.echoToolTs() });

    // ── Model + Presenter ──
    files.push({ path: 'src/mcp/models/SystemModel.ts', content: tpl.systemModelTs() });
    files.push({ path: 'src/mcp/presenters/SystemPresenter.ts', content: tpl.systemPresenterTs() });

    // ── Testing ──
    if (config.testing) {
        files.push({ path: 'vitest.config.ts', content: tpl.vitestConfig() });
        files.push({ path: 'tests/setup.ts', content: tpl.testSetupTs() });
        files.push({ path: 'tests/system.test.ts', content: tpl.systemTestTs() });
    }

    // ── Vector-specific ──
    addVectorFiles(files, config);

    return files;
}

// ── Cloudflare File List Builder ─────────────────────────

function buildCloudflareFileList(config: ProjectConfig): ScaffoldFile[] {
    const files: ScaffoldFile[] = [];

    // ── Root config ──
    files.push({ path: 'package.json', content: tpl.cloudflarePackageJson(config) });
    files.push({ path: 'tsconfig.json', content: tpl.cloudflareTsconfig() });
    files.push({ path: 'wrangler.toml', content: tpl.cloudflareWranglerToml(config) });
    files.push({ path: '.gitignore', content: tpl.cloudflareGitignore() });
    files.push({ path: '.env.example', content: tpl.cloudflareEnvExample(config) });
    files.push({ path: 'README.md', content: tpl.cloudflareReadme(config) });

    // ── Worker entry point ──
    files.push({ path: 'src/worker.ts', content: tpl.cloudflareWorkerTs(config) });

    // ── MCP source ──
    files.push({ path: 'src/vurb.ts', content: tpl.cloudflareVurbTs() });
    files.push({ path: 'src/context.ts', content: tpl.cloudflareContextTs() });
    files.push({ path: 'src/registry.ts', content: tpl.cloudflareRegistryTs() });

    // ── Tools ──
    files.push({ path: 'src/tools/system/health.ts', content: tpl.healthToolTs() });
    files.push({ path: 'src/tools/system/echo.ts', content: tpl.echoToolTs() });

    // ── Model + Presenter ──
    files.push({ path: 'src/models/SystemModel.ts', content: tpl.systemModelTs() });
    files.push({ path: 'src/presenters/SystemPresenter.ts', content: tpl.systemPresenterTs() });

    // ── Testing ──
    if (config.testing) {
        files.push({ path: 'vitest.config.ts', content: tpl.vitestConfig() });
        files.push({ path: 'tests/setup.ts', content: tpl.testSetupTs() });
        files.push({ path: 'tests/system.test.ts', content: tpl.systemTestTs() });
    }

    // ── Vector-specific ──
    addVectorFiles(files, config);

    return files;
}
