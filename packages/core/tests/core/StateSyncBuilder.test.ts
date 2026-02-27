import { describe, it, expect } from 'vitest';
import { initFusion } from '../../src/core/initFusion.js';
import { StateSyncLayer } from '../../src/state-sync/StateSyncLayer.js';

describe('StateSyncBuilder', () => {
    const f = initFusion();

    it('should create a StateSyncLayer via f.stateSync()', () => {
        const builder = f.stateSync();
        const layer = builder.build();
        expect(layer).toBeInstanceOf(StateSyncLayer);
    });

    it('should configure global defaults semantically', () => {
        const layer = f.stateSync()
            .defaults(p => p.stale())
            .build();

        const decorated = layer.decorateTools([{ name: 'any', description: 'Any tool' }]);
        expect(decorated[0].description).toContain('[Cache-Control: no-store]');
    });

    it('should configure immutable policies semantically', () => {
        const layer = f.stateSync()
            .policy('countries.*', p => p.cached())
            .build();

        const decorated = layer.decorateTools([
            { name: 'countries.list', description: 'List countries' },
            { name: 'tasks.list', description: 'List tasks' }
        ]);

        expect(decorated[0].description).toContain('[Cache-Control: immutable]');
        expect(decorated[1].description).not.toContain('[Cache-Control: immutable]');
    });

    it('should configure invalidation policies semantically', () => {
        const layer = f.stateSync()
            .policy('tasks.update', p => p.invalidates('tasks.*', 'sprints.*'))
            .build();

        // Testing decoration of result (causal invalidation)
        const result = { content: [{ type: 'text', text: 'Success' }] };
        const decorated = layer.decorateResult('tasks.update', result as any);

        expect(decorated.content[0].text).toContain('<cache_invalidation cause="tasks.update" domains="tasks.*, sprints.*" />');
    });

    it('should combine multiple directives in a single policy', () => {
        const layer = f.stateSync()
            .policy('billing.process', p => p.stale().invalidates('billing.records'))
            .build();

        const tools = layer.decorateTools([{ name: 'billing.process', description: 'Process' }]);
        expect(tools[0].description).toContain('[Cache-Control: no-store]');

        const result = { content: [{ type: 'text', text: 'Done' }] };
        const decorated = layer.decorateResult('billing.process', result as any);
        expect(decorated.content[0].text).toContain('domains="billing.records"');
    });

    it('should support multiple policies in declaration order', () => {
        const layer = f.stateSync()
            .policy('special.tool', p => p.cached())
            .policy('special.*', p => p.stale())
            .build();

        const decorated = layer.decorateTools([
            { name: 'special.tool', description: 'Special' },
            { name: 'special.other', description: 'Other' }
        ]);

        expect(decorated[0].description).toContain('[Cache-Control: immutable]');
        expect(decorated[1].description).toContain('[Cache-Control: no-store]');
    });

    it('should allow building with .layer getter shortcut', () => {
        const layer = f.stateSync()
            .defaults(p => p.stale())
            .layer;

        expect(layer).toBeInstanceOf(StateSyncLayer);
        const decorated = layer.decorateTools([{ name: 'any', description: 'Any tool' }]);
        expect(decorated[0].description).toContain('[Cache-Control: no-store]');
    });
});
