/**
 * StateSyncStaleness.test.ts — Description-based cache invalidation
 *
 * Validates that `StateSyncLayer.decorateTools()` correctly invalidates
 * cached decorated tools when a tool's source description changes.
 * This supports dynamic tool registration and hot-reload scenarios
 * where tool metadata is updated between `tools/list` calls.
 */
import { describe, it, expect } from 'vitest';
import { StateSyncLayer } from '../../src/state-sync/StateSyncLayer.js';
import type { Tool as McpTool } from "@modelcontextprotocol/server";

const makeTool = (name: string, description: string): McpTool => ({
    name,
    description,
    inputSchema: { type: 'object' },
});

describe('StateSyncLayer — description-based cache invalidation', () => {
    const layer = new StateSyncLayer({
        defaults: { cacheControl: 'no-store' },
        policies: [],
    });

    it('should return cached decoration when description is stable', () => {
        const tool = makeTool('billing.get', 'Retrieve invoice');

        const first = layer.decorateTools([tool]);
        const second = layer.decorateTools([tool]);

        // Same description → cache hit → same decorated description string
        expect(first[0]!.description).toBe(second[0]!.description);
    });

    it('should invalidate cache when description changes (dynamic registration)', () => {
        const v1 = makeTool('billing.get', 'Retrieve invoice');
        const v2 = makeTool('billing.get', 'Retrieve invoice (includes line items)');

        const decorated1 = layer.decorateTools([v1]);
        const decorated2 = layer.decorateTools([v2]);

        // Cache evicted: new description → re-decorated
        expect(decorated1[0]!.description).toContain('Retrieve invoice');
        expect(decorated2[0]!.description).toContain('includes line items');
        expect(decorated2[0]!.description).not.toBe(decorated1[0]!.description);
    });

    it('should handle rapid description changes (hot-reload)', () => {
        const versions = ['v1: original', 'v2: updated schema', 'v3: added pagination'];
        const results: string[] = [];

        for (const desc of versions) {
            const tool = makeTool('hot.reload', desc);
            const [decorated] = layer.decorateTools([tool]);
            results.push(decorated!.description!);
        }

        // Each version should produce a unique decoration
        expect(new Set(results).size).toBe(3);
    });

    it('should preserve cache for unchanged tools alongside invalidated ones', () => {
        const stable = makeTool('stable.tool', 'This never changes');
        const dynamicV1 = makeTool('dynamic.tool', 'Version A');
        const dynamicV2 = makeTool('dynamic.tool', 'Version B');

        // First call caches both
        layer.decorateTools([stable, dynamicV1]);

        // Second call: stable unchanged, dynamic changed
        const [stableResult, dynamicResult] = layer.decorateTools([stable, dynamicV2]);

        expect(stableResult!.description).toContain('This never changes');
        expect(dynamicResult!.description).toContain('Version B');
    });
});
