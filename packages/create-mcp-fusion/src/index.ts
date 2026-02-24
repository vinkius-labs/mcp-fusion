#!/usr/bin/env node
/**
 * create-mcp-fusion — Interactive CLI Wizard
 *
 * Scaffolds a new MCP Fusion project with the MVA architecture.
 * Uses @clack/prompts for a premium terminal experience.
 *
 * Usage:
 *   npx create-mcp-fusion
 *   npx create-mcp-fusion my-agent
 *
 * @module
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { ProjectConfig, IngestionVector, TransportLayer, ToolExposition } from './types.js';
import { scaffold } from './scaffold.js';

// ── Entrypoint ───────────────────────────────────────────

async function main(): Promise<void> {
    console.clear();

    p.intro(pc.bgCyan(pc.black(' MCP Fusion ')));

    // ── 1. Project Name ──────────────────────────────────

    const args = process.argv.slice(2);

    const name = (args[0] && args[0] !== '.') ? args[0] : await p.text({
        message: 'What is your project named?',
        placeholder: 'my-mcp-server',
        defaultValue: 'my-mcp-server',
        validate: (val) => {
            if (!val) return 'Project name is required';
            if (!/^[a-z0-9-]+$/.test(val)) return 'Only lowercase letters, numbers, and hyphens are allowed';
            return undefined;
        },
    });

    if (p.isCancel(name)) { p.cancel('Operation cancelled.'); process.exit(0); }

    // ── 2. Tool Exposition Strategy ──────────────────────────

    const exposition = await p.select({
        message: 'Tool Exposition Strategy on the MCP Wire?',
        options: [
            {
                value: 'flat' as ToolExposition,
                label: 'Flat (Recommended)',
                hint: 'Each action is an independent MCP tool (e.g., projects_list, projects_create)',
            },
            {
                value: 'grouped' as ToolExposition,
                label: 'Grouped',
                hint: 'Actions are grouped behind a discriminator enum within a single tool',
            },
        ],
    });

    if (p.isCancel(exposition)) { p.cancel('Operation cancelled.'); process.exit(0); }

    // ── 3. Ingestion Vector ──────────────────────────────

    const vector = await p.select({
        message: 'Select your primary ingestion vector:',
        options: [
            {
                value: 'blank' as IngestionVector,
                label: 'Blank Canvas',
                hint: 'Core MVA, Zod, and Routing',
            },
            {
                value: 'database' as IngestionVector,
                label: 'Database-Driven',
                hint: 'Includes Prisma ORM setup',
            },
            {
                value: 'workflow' as IngestionVector,
                label: 'Workflow Automation',
                hint: 'Includes n8n bridge setup',
            },
            {
                value: 'openapi' as IngestionVector,
                label: 'Legacy API Proxy',
                hint: 'Includes OpenAPI generator setup',
            },
        ],
    });

    if (p.isCancel(vector)) { p.cancel('Operation cancelled.'); process.exit(0); }

    // ── 4. Transport Layer ───────────────────────────────

    const transport = await p.select({
        message: 'Which transport layer?',
        options: [
            {
                value: 'stdio' as TransportLayer,
                label: 'stdio',
                hint: 'Standard — Best for Claude Desktop / Cursor',
            },
            {
                value: 'sse' as TransportLayer,
                label: 'SSE',
                hint: 'Server-Sent Events — Best for Cloud/Remote Hosting',
            },
        ],
    });

    if (p.isCancel(transport)) { p.cancel('Operation cancelled.'); process.exit(0); }

    // ── 5. Testing Suite ─────────────────────────────────

    const testing = await p.confirm({
        message: 'Include Testing Suite (Vitest + In-Memory MVA Emulator)?',
        initialValue: true,
    });

    if (p.isCancel(testing)) { p.cancel('Operation cancelled.'); process.exit(0); }

    // ── Build Config ─────────────────────────────────────

    const config: ProjectConfig = {
        name: (typeof name === 'string' ? name : 'my-mcp-server'),
        exposition,
        vector,
        transport,
        testing,
    };

    const targetDir = resolve(process.cwd(), config.name);

    // ── Guard: directory exists ──────────────────────────

    if (existsSync(targetDir)) {
        p.cancel(`Directory "${config.name}" already exists.`);
        process.exit(1);
    }

    // ── 6. Scaffold ──────────────────────────────────────

    const s = p.spinner();

    s.start('Scaffolding your MCP Server...');
    scaffold(targetDir, config);
    s.stop('📁 Project scaffolded.');

    // ── 7. Install Dependencies ──────────────────────────

    s.start('📦 Installing dependencies (npm)...');
    try {
        execSync('npm install', {
            cwd: targetDir,
            stdio: 'ignore',
            timeout: 120_000,
        });
        s.stop('📦 Dependencies installed.');
    } catch {
        s.stop('⚠️  npm install failed — run it manually.');
    }

    // ── 8. Done ──────────────────────────────────────────

    const nextSteps = [
        `cd ${config.name}`,
        `npm run dev`,
    ];

    if (config.testing) {
        nextSteps.push('npm test');
    }

    p.note(nextSteps.join('\n'), 'Next steps');

    p.outro(
        `${pc.green('✅ Done!')} The environment for your MCP server is ready.\n` +
        `   ${pc.dim('Documentation:')} ${pc.cyan('https://vinkius-labs.github.io/mcp-fusion/')}`,
    );
}

// ── Run ──────────────────────────────────────────────────

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
