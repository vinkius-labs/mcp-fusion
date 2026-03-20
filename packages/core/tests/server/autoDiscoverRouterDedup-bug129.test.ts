/**
 * Bug #129 — autoDiscover must register ALL actions from a router file
 *
 * When a single file exports multiple action builders that share the
 * same router name (e.g., `issues.query('list')`, `issues.mutation('ignore')`),
 * autoDiscover must register all of them — not just the first one.
 *
 * Root cause: The dedup logic used `getName()` (which returns the router
 * name, e.g., "my_router") to skip "duplicates". Since all actions from
 * the same router return the same name, only the first was registered.
 *
 * Fix: Changed dedup from name-based to reference-based (object identity).
 *
 * @module
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { autoDiscover } from '../../src/server/autoDiscover.js';

describe('Bug #129 — autoDiscover router action dedup', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = join(tmpdir(), `vurb-dedup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('registers all exported builders from a file with the same getName()', async () => {
        // Simulate a router file that exports 3 action builders, all returning
        // the same getName() value (as routers do in Vurb.ts)
        const fileContent = `
            const builder1 = { getName() { return 'my_router'; }, id: 1 };
            const builder2 = { getName() { return 'my_router'; }, id: 2 };
            const builder3 = { getName() { return 'my_router'; }, id: 3 };
            export { builder1, builder2, builder3 };
        `;

        await fs.writeFile(join(tempDir, 'my_router.tool.mjs'), fileContent);

        const registered: unknown[] = [];
        const registry = { register: vi.fn((b: unknown) => registered.push(b)) };

        await autoDiscover(registry, tempDir);

        // All 3 builders must be registered (not just the first one)
        expect(registry.register).toHaveBeenCalledTimes(3);
    });

    it('still deduplicates the same builder object exported under multiple names', async () => {
        // If the EXACT SAME object is exported under two names, it should
        // only be registered once (reference-based dedup)
        const fileContent = `
            const sharedBuilder = { getName() { return 'shared'; } };
            export const a = sharedBuilder;
            export const b = sharedBuilder;
        `;

        await fs.writeFile(join(tempDir, 'shared.tool.mjs'), fileContent);

        const registry = { register: vi.fn() };

        await autoDiscover(registry, tempDir);

        // Same reference exported twice → register only once
        expect(registry.register).toHaveBeenCalledTimes(1);
    });

    it('registers builders from different files with the same getName()', async () => {
        // Two separate files, each exporting a builder with the same router name
        // This simulates split-file router patterns (e.g., issues/queries.ts + issues/mutations.ts)
        const queryFile = `
            export const tool = { getName() { return 'issues'; }, type: 'query' };
        `;
        const mutationFile = `
            export const tool = { getName() { return 'issues'; }, type: 'mutation' };
        `;

        await fs.writeFile(join(tempDir, 'issues_queries.tool.mjs'), queryFile);
        await fs.writeFile(join(tempDir, 'issues_mutations.tool.mjs'), mutationFile);

        const registry = { register: vi.fn() };

        await autoDiscover(registry, tempDir);

        // Both must be registered — ToolRegistry.register() handles the merge
        expect(registry.register).toHaveBeenCalledTimes(2);
    });
});
