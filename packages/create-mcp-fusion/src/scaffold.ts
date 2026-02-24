/**
 * create-mcp-fusion — Scaffold Engine
 *
 * Receives the wizard configuration and writes the full
 * project directory tree to disk.
 *
 * @module
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectConfig } from './types.js';
import * as tpl from './templates.js';

// ── File Entry ───────────────────────────────────────────

interface FileEntry {
    readonly path: string;
    readonly content: string;
}

// ── Scaffold ─────────────────────────────────────────────

/**
 * Write all project files to the target directory.
 *
 * @param targetDir - Absolute path to the project directory
 * @param config - Wizard configuration
 */
export function scaffold(targetDir: string, config: ProjectConfig): void {
    const files = buildFileList(config);

    for (const file of files) {
        const fullPath = join(targetDir, file.path);
        const dir = join(fullPath, '..');
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, file.content, 'utf-8');
    }
}

// ── File List Builder ────────────────────────────────────

function buildFileList(config: ProjectConfig): FileEntry[] {
    const files: FileEntry[] = [];

    // ── Root files ───────────────────────────────────────
    files.push({ path: 'package.json', content: tpl.packageJson(config) });
    files.push({ path: 'tsconfig.json', content: tpl.tsconfig() });
    files.push({ path: '.gitignore', content: tpl.gitignore() });

    if (config.testing) {
        files.push({ path: 'vitest.config.ts', content: tpl.vitestConfig() });
    }

    // ── Server + Registry ────────────────────────────────
    files.push({ path: 'src/server.ts', content: tpl.serverTs(config) });
    files.push({ path: 'src/registry.ts', content: tpl.registryTs() });

    // ── MVA Structure (Standardized) ─────────────────────
    files.push({ path: 'src/models/system.schema.ts', content: tpl.systemSchemaTs() });
    files.push({ path: 'src/views/SystemPresenter.ts', content: tpl.systemPresenterTs() });
    files.push({ path: 'src/agents/systemTools.ts', content: tpl.systemToolsTs() });

    // ── Middleware ───────────────────────────────────────
    files.push({ path: 'src/middleware/AuthGuard.ts', content: tpl.authGuardTs() });

    // ── Testing ──────────────────────────────────────────
    if (config.testing) {
        files.push({ path: 'tests/setup.ts', content: tpl.testSetupTs(config) });
        files.push({ path: 'tests/firewall/system.firewall.test.ts', content: tpl.systemFirewallTestTs() });
    }

    // ── Vector-specific README ───────────────────────────
    const vectorReadme = tpl.vectorReadme(config);
    if (vectorReadme) {
        files.push({ path: 'SETUP.md', content: vectorReadme });
    }

    return files;
}
