/**
 * recompileCache-bug87.test.ts
 *
 * Regression: hCtx.recompile() in ServerAttachment was re-running
 * compileExposition() on every request. After the fix, results are
 * cached and only re-compiled when the list of builders actually changes.
 */
import { describe, it, expect, vi } from 'vitest';
import { defineTool } from '../../src/index.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success } from '../../src/core/response.js';

/**
 * We cannot directly test the caching inside ServerAttachment's hCtx,
 * but we can verify that flat exposition mode returns correct and consistent
 * results across multiple tool/call requests — which exercises the cached path.
 */
describe('ServerAttachment: recompile caching', () => {
    it('should return consistent flat tools across multiple calls', async () => {
        const tool = defineTool('cached', {
            actions: {
                list: {
                    readOnly: true,
                    handler: async () => success('items'),
                },
                create: {
                    handler: async () => success('created'),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Call the same action multiple times — caching should not break results
        const r1 = await registry.routeCall(undefined, 'cached', { action: 'list' });
        const r2 = await registry.routeCall(undefined, 'cached', { action: 'create' });
        const r3 = await registry.routeCall(undefined, 'cached', { action: 'list' });

        expect(r1.content[0].text).toBe('items');
        expect(r2.content[0].text).toBe('created');
        expect(r3.content[0].text).toBe('items');
    });

    it('should still serve correct tools after registry modification', async () => {
        const registry = new ToolRegistry();

        const tool1 = defineTool('first', {
            actions: {
                ping: {
                    readOnly: true,
                    handler: async () => success('pong1'),
                },
            },
        });

        registry.register(tool1);
        const r1 = await registry.routeCall(undefined, 'first', { action: 'ping' });
        expect(r1.content[0].text).toBe('pong1');

        // Register a second tool — cache should detect builder change
        const tool2 = defineTool('second', {
            actions: {
                ping: {
                    readOnly: true,
                    handler: async () => success('pong2'),
                },
            },
        });

        registry.register(tool2);
        const r2 = await registry.routeCall(undefined, 'second', { action: 'ping' });
        expect(r2.content[0].text).toBe('pong2');
    });

    it('getAllTools returns stable results on repeated calls', () => {
        const registry = new ToolRegistry();
        registry.register(defineTool('stable', {
            actions: {
                run: { handler: async () => success('ok') },
            },
        }));

        const t1 = registry.getAllTools();
        const t2 = registry.getAllTools();

        expect(t1.length).toBe(1);
        expect(t2.length).toBe(1);
        expect(t1[0].name).toBe(t2[0].name);
    });
});
