/**
 * validateArgs-bug86.test.ts
 *
 * Regression: when a tool has NO validation schema, the _select framework field
 * was passed through to the handler unchanged. After the fix, _select is stripped
 * in the no-schema path, while the discriminator is preserved (handlers rely on it).
 */
import { describe, it, expect } from 'vitest';
import { defineTool } from '../../src/index.js';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { success } from '../../src/core/response.js';

describe('validateArgs: strips _select without schema', () => {
    it('should NOT pass _select field to handler', async () => {
        let receivedArgs: Record<string, unknown> | undefined;

        const tool = defineTool('noselectschema', {
            actions: {
                read: {
                    readOnly: true,
                    handler: async (_ctx, args) => {
                        receivedArgs = args;
                        return success('ok');
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        await registry.routeCall(undefined, 'noselectschema', {
            action: 'read',
            _select: ['id', 'name'],
            foo: 'bar',
        });

        expect(receivedArgs).toBeDefined();
        expect(receivedArgs).not.toHaveProperty('_select');
        expect(receivedArgs).toHaveProperty('foo', 'bar');
    });

    it('should preserve discriminator in handler args', async () => {
        let receivedArgs: Record<string, unknown> | undefined;

        const tool = defineTool('keepdisc', {
            actions: {
                run: {
                    handler: async (_ctx, args) => {
                        receivedArgs = args;
                        return success('ok');
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        await registry.routeCall(undefined, 'keepdisc', {
            action: 'run',
            name: 'test',
        });

        expect(receivedArgs).toBeDefined();
        // Discriminator should be present (handlers rely on it)
        expect(receivedArgs).toHaveProperty('action', 'run');
        expect(receivedArgs).toHaveProperty('name', 'test');
    });

    it('should strip _select but keep everything else', async () => {
        let receivedArgs: Record<string, unknown> | undefined;

        const tool = defineTool('stripselect', {
            actions: {
                exec: {
                    handler: async (_ctx, args) => {
                        receivedArgs = args;
                        return success('done');
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        await registry.routeCall(undefined, 'stripselect', {
            action: 'exec',
            _select: ['id'],
            payload: 42,
        });

        expect(receivedArgs).toBeDefined();
        expect(receivedArgs).not.toHaveProperty('_select');
        expect(receivedArgs).toHaveProperty('action', 'exec');
        expect(receivedArgs).toHaveProperty('payload', 42);
    });

    it('should work when _select is not present', async () => {
        let receivedArgs: Record<string, unknown> | undefined;

        const tool = defineTool('noselect', {
            actions: {
                only: {
                    handler: async (_ctx, args) => {
                        receivedArgs = args;
                        return success('ok');
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        await registry.routeCall(undefined, 'noselect', {
            action: 'only',
            data: 'hello',
        });

        expect(receivedArgs).toBeDefined();
        expect(receivedArgs).toHaveProperty('data', 'hello');
        expect(receivedArgs).not.toHaveProperty('_select');
    });
});
