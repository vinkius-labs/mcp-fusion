#!/usr/bin/env node
/**
 * Prisma Generator Entry Point — vinkius-prisma-gen
 *
 * Intercepts `npx prisma generate` and emits MCP Fusion Presenters
 * and ToolBuilders with field-level security, tenant isolation, and
 * OOM protection.
 *
 * Usage in schema.prisma:
 * ```prisma
 * generator mcp {
 *   provider = "vinkius-prisma-gen"
 *   output   = "../src/tools/database"
 * }
 * ```
 *
 * @module
 */
import { generatorHandler } from '@prisma/generator-helper';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseAnnotations } from './parser/AnnotationParser.js';
import { emitPresenter } from './emitter/PresenterEmitter.js';
import { emitTool } from './emitter/ToolEmitter.js';

import type { DMMFModel } from './parser/AnnotationParser.js';

// ── Generator Handler ────────────────────────────────────

generatorHandler({
    onManifest() {
        return {
            prettyName: 'MCP Fusion Prisma Generator',
            defaultOutput: './generated',
        };
    },

    async onGenerate(options) {
        const outputDir = resolve(
            options.generator.output?.value ?? './generated',
        );
        mkdirSync(outputDir, { recursive: true });

        const models = options.dmmf.datamodel.models as unknown as DMMFModel[];
        const generatedNames: string[] = [];

        for (const model of models) {
            const annotations = parseAnnotations(model);

            // Emit Presenter (MVA View Layer — Egress Firewall)
            const presenterFile = emitPresenter(model, annotations);
            const presenterPath = join(outputDir, presenterFile.path);
            writeFileSync(presenterPath, presenterFile.content, 'utf-8');

            // Emit Tool (MVA Agent Layer — CRUD with tenant isolation)
            const toolFile = emitTool(model, annotations);
            const toolPath = join(outputDir, toolFile.path);
            writeFileSync(toolPath, toolFile.content, 'utf-8');

            generatedNames.push(model.name);

            console.log(`  📄 ${presenterFile.path}`);
            console.log(`  📄 ${toolFile.path}`);
        }

        // Emit barrel index.ts
        const barrelFile = emitBarrel(generatedNames);
        const barrelPath = join(outputDir, barrelFile.path);
        writeFileSync(barrelPath, barrelFile.content, 'utf-8');
        console.log(`  📄 ${barrelFile.path}`);

        console.log(`\n🎉 Generated ${models.length * 2 + 1} files in ${outputDir}`);
    },
});

// ── Barrel Emitter ───────────────────────────────────────

function emitBarrel(modelNames: string[]): { path: string; content: string } {
    const lines: string[] = [];
    lines.push(`/**`);
    lines.push(` * Generated barrel export — vinkius-prisma-gen`);
    lines.push(` * @generated`);
    lines.push(` */`);

    let isFirst = true;
    for (const name of modelNames) {
        const prismaModel = name.charAt(0).toLowerCase() + name.slice(1);
        lines.push(`export { ${name}Presenter, ${name}ResponseSchema } from './${prismaModel}Presenter.js';`);
        lines.push(`export { ${prismaModel}Tools } from './${prismaModel}Tools.js';`);
        // Export PrismaFusionContext only from the first model to avoid duplicate identifiers
        if (isFirst) {
            lines.push(`export type { PrismaFusionContext } from './${prismaModel}Tools.js';`);
            isFirst = false;
        }
    }

    lines.push(``);

    return { path: 'index.ts', content: lines.join('\n') };
}
