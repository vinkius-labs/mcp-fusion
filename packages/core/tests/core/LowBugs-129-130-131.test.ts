/**
 * Regression tests for BUGS-v4 low-severity bugs #129, #130, #131.
 *
 * Bug #129 — autoDiscover barrel export deduplication
 * Bug #130 — VurbClient proxy doesn't guard inspection props
 * Bug #131 — ExpositionCompiler console.warn in production
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { autoDiscover } from '../../src/server/autoDiscover.js';
import { createVurbClient, type VurbTransport } from '../../src/client/VurbClient.js';
import { success } from '../../src/core/response.js';
import type { ToolResponse } from '../../src/core/response.js';
import { z } from 'zod';
import { compileExposition } from '../../src/exposition/ExpositionCompiler.js';
import { GroupedToolBuilder } from '../../src/core/builder/GroupedToolBuilder.js';

// ── Helpers ──────────────────────────────────────────────

function createMockTransport(): VurbTransport & {
    calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    return {
        calls,
        async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
            calls.push({ name, args });
            return success(`${name}:${JSON.stringify(args)}`);
        },
    };
}

const handler = async (): Promise<ToolResponse> => success('ok');

// ── Bug #129 — autoDiscover barrel export deduplication ──

describe('Bug #129 — autoDiscover deduplicates by tool name', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = join(tmpdir(), `vurb-dedup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('registers both builders when two files export builders with the same getName()', async () => {
        // Create two files that export different builder objects with the same getName()
        // Both should be registered — ToolRegistry.register() handles merging
        await fs.writeFile(
            join(tempDir, 'billing.js'),
            `exports.tool = { getName() { return 'billing'; } };`,
        );
        await fs.writeFile(
            join(tempDir, 'billing-barrel.js'),
            `exports.tool = { getName() { return 'billing'; } };`,
        );

        const registered: unknown[] = [];
        const registry = { register: (b: unknown) => registered.push(b) };

        await autoDiscover(registry, tempDir, { loader: 'cjs' });

        // Both different objects are registered — ToolRegistry handles merge
        expect(registered).toHaveLength(2);
    });

    it('registers both builders when tool names are different', async () => {
        await fs.writeFile(
            join(tempDir, 'billing.js'),
            `exports.tool = { getName() { return 'billing'; } };`,
        );
        await fs.writeFile(
            join(tempDir, 'users.js'),
            `exports.tool = { getName() { return 'users'; } };`,
        );

        const registered: unknown[] = [];
        const registry = { register: (b: unknown) => registered.push(b) };

        await autoDiscover(registry, tempDir, { loader: 'cjs' });

        expect(registered).toHaveLength(2);
    });

    it('registers builders from subdirectories with the same getName()', async () => {
        const subDir = join(tempDir, 'sub');
        await fs.mkdir(subDir, { recursive: true });

        await fs.writeFile(
            join(tempDir, 'tools.js'),
            `exports.tool = { getName() { return 'shared'; } };`,
        );
        await fs.writeFile(
            join(subDir, 'index.js'),
            `exports.tool = { getName() { return 'shared'; } };`,
        );

        const registered: unknown[] = [];
        const registry = { register: (b: unknown) => registered.push(b) };

        await autoDiscover(registry, tempDir, { loader: 'cjs' });

        // Both are different objects — both registered, ToolRegistry handles merge
        expect(registered).toHaveLength(2);
    });

    it('registers all exports from a single file with the same getName()', async () => {
        // A file exporting two different builder objects with the same name
        // This is the router pattern: multiple actions share one router name
        await fs.writeFile(
            join(tempDir, 'dup.js'),
            `
            const a = { getName() { return 'dup-tool'; } };
            const b = { getName() { return 'dup-tool'; } };
            exports.a = a;
            exports.b = b;
            `,
        );

        const registered: unknown[] = [];
        const registry = { register: (b: unknown) => registered.push(b) };

        await autoDiscover(registry, tempDir, { loader: 'cjs' });

        // Both different objects are registered — ToolRegistry.mergeActions() handles merge
        expect(registered).toHaveLength(2);
    });
});

// ── Bug #130 — VurbClient proxy guards inspection symbols ──

describe('Bug #130 — VurbClient proxy guards inspection props', () => {
    it('Symbol.toPrimitive returns undefined (no crash)', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        expect(proxy[Symbol.toPrimitive]).toBeUndefined();
    });

    it('Symbol.toStringTag returns undefined', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        expect(proxy[Symbol.toStringTag]).toBeUndefined();
    });

    it('Symbol.iterator returns undefined', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        expect(proxy[Symbol.iterator]).toBeUndefined();
    });

    it('Symbol.asyncIterator returns undefined', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        expect(proxy[Symbol.asyncIterator]).toBeUndefined();
    });

    it('Symbol.hasInstance returns undefined', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        expect(proxy[Symbol.hasInstance]).toBeUndefined();
    });

    it('nodejs.util.inspect.custom returns undefined', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        const inspectSymbol = Symbol.for('nodejs.util.inspect.custom');
        expect(proxy[inspectSymbol]).toBeUndefined();
    });

    it('nested proxy nodes also guard inspection symbols', () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const projects = (client.proxy as any).projects;

        expect(projects[Symbol.toPrimitive]).toBeUndefined();
        expect(projects[Symbol.toStringTag]).toBeUndefined();
        expect(projects[Symbol.iterator]).toBeUndefined();
    });

    it('proxy still works for normal string props after symbol access', async () => {
        const transport = createMockTransport();
        const client = createVurbClient(transport);
        const proxy = client.proxy as any;

        // Access symbol first (shouldn't break anything)
        const _ = proxy[Symbol.toPrimitive];

        // Then normal operation
        await proxy.projects.create({ name: 'V2' });

        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0].name).toBe('projects');
    });
});

// ── Bug #131 — ExpositionCompiler console.warn in production ──

describe('Bug #131 — ExpositionCompiler routes warnings through onWarn', () => {
    it('does NOT call console.warn when no onWarn provided', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const builder = new GroupedToolBuilder<void>('test')
                .description('Test tool')
                .commonSchema(z.object({ id: z.string() }))
                .action({
                    name: 'create',
                    description: 'Create',
                    schema: z.object({ id: z.string() }),
                    handler,
                });

            // No onWarn → should NOT pollute console
            compileExposition([builder]);

            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('calls onWarn callback when provided and fields overlap', () => {
        const warnings: string[] = [];
        const onWarn = (msg: string) => warnings.push(msg);

        const builder = new GroupedToolBuilder<void>('test')
            .description('Test tool')
            .commonSchema(z.object({ id: z.string() }))
            .action({
                name: 'create',
                description: 'Create',
                schema: z.object({ id: z.string() }),
                handler,
            });

        compileExposition([builder], 'flat', '_', onWarn);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("'id'");
        expect(warnings[0]).toContain('overwrites common schema');
    });

    it('onWarn is NOT called when fields do not overlap', () => {
        const warnings: string[] = [];
        const onWarn = (msg: string) => warnings.push(msg);

        const builder = new GroupedToolBuilder<void>('clean')
            .description('Clean tool')
            .commonSchema(z.object({ orgId: z.string() }))
            .action({
                name: 'run',
                description: 'Run',
                schema: z.object({ target: z.string() }),
                handler,
            });

        compileExposition([builder], 'flat', '_', onWarn);

        expect(warnings).toHaveLength(0);
    });

    it('grouped exposition does NOT trigger warnings', () => {
        const warnings: string[] = [];
        const onWarn = (msg: string) => warnings.push(msg);

        const builder = new GroupedToolBuilder<void>('grouped')
            .description('Grouped tool')
            .commonSchema(z.object({ id: z.string() }))
            .action({
                name: 'overlap',
                description: 'Overlap',
                schema: z.object({ id: z.string() }),
                handler,
            });

        compileExposition([builder], 'grouped', '_', onWarn);

        // Grouped strategy doesn't decompose schemas → no overlap check
        expect(warnings).toHaveLength(0);
    });
});
