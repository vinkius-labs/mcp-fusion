import { describe, it, expect } from 'vitest';
import { defineTool } from '../../src/framework/builder/defineTool.js';
import { success, error, toolError } from '../../src/framework/response.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { type MiddlewareFn } from '../../src/framework/types.js';

// ============================================================================
// defineTool() Tests
// ============================================================================

describe('defineTool()', () => {
    // ── Basic Creation ──

    it('should create a tool with a name', () => {
        const tool = defineTool('echo', {
            actions: {
                say: {
                    handler: async (_ctx, _args) => success('hello'),
                },
            },
        });
        expect(tool.getName()).toBe('echo');
    });

    it('should set description', () => {
        const tool = defineTool('test', {
            description: 'A test tool',
            actions: {
                run: { handler: async () => success('ok') },
            },
        });
        const def = tool.buildToolDefinition();
        expect(def.description).toContain('A test tool');
    });

    it('should set tags', () => {
        const tool = defineTool('tagged', {
            tags: ['core', 'v2'],
            actions: {
                run: { handler: async () => success('ok') },
            },
        });
        expect(tool.getTags()).toEqual(['core', 'v2']);
    });

    // ── String Shorthand Params ──

    it('should handle string shorthand params', async () => {
        const tool = defineTool('echo', {
            actions: {
                say: {
                    params: { message: 'string' },
                    handler: async (_ctx, args) => success((args as Record<string, unknown>)['message'] as string),
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'say', message: 'hello' });
        expect(result.content[0].text).toBe('hello');
    });

    it('should validate string shorthand params', async () => {
        const tool = defineTool('strict', {
            actions: {
                run: {
                    params: { count: 'number' },
                    handler: async () => success('ok'),
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'run', count: 'not_a_number' });
        expect(result.isError).toBe(true);
    });

    // ── Object Descriptor Params ──

    it('should handle object descriptor with constraints', async () => {
        const tool = defineTool('constrained', {
            actions: {
                create: {
                    params: {
                        name: { type: 'string', min: 3, max: 100 },
                    },
                    handler: async (_ctx, args) => success((args as Record<string, unknown>)['name'] as string),
                },
            },
        });

        // Valid
        const ok = await tool.execute(undefined, { action: 'create', name: 'Alice' });
        expect(ok.isError).toBeUndefined();

        // Too short
        const fail = await tool.execute(undefined, { action: 'create', name: 'AB' });
        expect(fail.isError).toBe(true);
    });

    it('should handle enum params', async () => {
        const tool = defineTool('filtered', {
            actions: {
                list: {
                    params: {
                        status: { enum: ['active', 'archived'] as const },
                    },
                    handler: async (_ctx, args) => success((args as Record<string, unknown>)['status'] as string),
                },
            },
        });

        const ok = await tool.execute(undefined, { action: 'list', status: 'active' });
        expect(ok.content[0].text).toBe('active');

        const fail = await tool.execute(undefined, { action: 'list', status: 'invalid' });
        expect(fail.isError).toBe(true);
    });

    it('should handle optional params', async () => {
        const tool = defineTool('optional', {
            actions: {
                list: {
                    params: {
                        limit: { type: 'number', optional: true },
                    },
                    handler: async (_ctx, args) => {
                        const limit = (args as Record<string, unknown>)['limit'];
                        return success(String(limit ?? 'default'));
                    },
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'list' });
        expect(result.content[0].text).toBe('default');
    });

    it('should handle array params', async () => {
        const tool = defineTool('arrays', {
            actions: {
                process: {
                    params: {
                        tags: { array: 'string', max: 5 },
                    },
                    handler: async (_ctx, args) => {
                        const tags = (args as Record<string, unknown>)['tags'] as string[];
                        return success(tags.join(','));
                    },
                },
            },
        });

        const ok = await tool.execute(undefined, { action: 'process', tags: ['a', 'b'] });
        expect(ok.content[0].text).toBe('a,b');

        const fail = await tool.execute(undefined, { action: 'process', tags: ['1', '2', '3', '4', '5', '6'] });
        expect(fail.isError).toBe(true);
    });

    // ── Shared Params ──

    it('should merge shared params into all actions', async () => {
        const tool = defineTool('shared', {
            shared: {
                workspace_id: 'string',
            },
            actions: {
                list: {
                    handler: async (_ctx, args) => success((args as Record<string, unknown>)['workspace_id'] as string),
                },
                create: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => {
                        const a = args as Record<string, unknown>;
                        return success(`${a['workspace_id']}:${a['name']}`);
                    },
                },
            },
        });

        const r1 = await tool.execute(undefined, { action: 'list', workspace_id: 'ws_1' });
        expect(r1.content[0].text).toBe('ws_1');

        const r2 = await tool.execute(undefined, { action: 'create', workspace_id: 'ws_2', name: 'Test' });
        expect(r2.content[0].text).toBe('ws_2:Test');
    });

    // ── Groups ──

    it('should support hierarchical groups', async () => {
        const tool = defineTool('platform', {
            groups: {
                users: {
                    description: 'User management',
                    actions: {
                        list: {
                            readOnly: true,
                            handler: async () => success('user list'),
                        },
                    },
                },
                billing: {
                    description: 'Billing',
                    actions: {
                        status: {
                            handler: async () => success('billing ok'),
                        },
                    },
                },
            },
        });

        const r1 = await tool.execute(undefined, { action: 'users.list' });
        expect(r1.content[0].text).toBe('user list');

        const r2 = await tool.execute(undefined, { action: 'billing.status' });
        expect(r2.content[0].text).toBe('billing ok');
    });

    // ── Middleware ──

    it('should apply global middleware', async () => {
        const calls: string[] = [];

        const logger: MiddlewareFn<void> = async (_ctx, _args, next) => {
            calls.push('middleware');
            return next();
        };

        const tool = defineTool('mw', {
            middleware: [logger],
            actions: {
                run: {
                    handler: async () => {
                        calls.push('handler');
                        return success('done');
                    },
                },
            },
        });

        await tool.execute(undefined, { action: 'run' });
        expect(calls).toEqual(['middleware', 'handler']);
    });

    it('should apply group-level middleware', async () => {
        const calls: string[] = [];

        const groupMw: MiddlewareFn<void> = async (_ctx, _args, next) => {
            calls.push('group-mw');
            return next();
        };

        const tool = defineTool('grouped_mw', {
            groups: {
                admin: {
                    description: 'Admin',
                    middleware: [groupMw],
                    actions: {
                        reset: {
                            handler: async () => {
                                calls.push('handler');
                                return success('reset');
                            },
                        },
                    },
                },
            },
        });

        await tool.execute(undefined, { action: 'admin.reset' });
        expect(calls).toEqual(['group-mw', 'handler']);
    });

    // ── Action Metadata ──

    it('should preserve readOnly / destructive flags', () => {
        const tool = defineTool('flagged', {
            actions: {
                read: { readOnly: true, handler: async () => success('ok') },
                delete: { destructive: true, handler: async () => success('ok') },
            },
        });

        const meta = tool.getActionMetadata();
        const readAction = meta.find(m => m.key === 'read');
        const deleteAction = meta.find(m => m.key === 'delete');

        expect(readAction?.readOnly).toBe(true);
        expect(deleteAction?.destructive).toBe(true);
    });

    // ── Error Handling ──

    it('should return error for unknown actions', async () => {
        const tool = defineTool('strict', {
            actions: {
                only: { handler: async () => success('ok') },
            },
        });

        const result = await tool.execute(undefined, { action: 'nonexistent' });
        expect(result.isError).toBe(true);
    });

    // ── Registry Compatibility ──

    it('should be registrable in ToolRegistry', async () => {
        const tool = defineTool('registerable', {
            actions: {
                ping: { handler: async () => success('pong') },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const tools = registry.getAllTools();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('registerable');
    });

    // ── Coexistence with createTool ──

    it('should coexist with createTool in the same registry', async () => {
        const { createTool } = await import('../../src/framework/builder/GroupedToolBuilder.js');

        const toolA = defineTool('tool_a', {
            actions: { ping: { handler: async () => success('a') } },
        });

        const toolB = createTool('tool_b').action({
            name: 'ping',
            handler: async () => success('b'),
        });

        const registry = new ToolRegistry();
        registry.register(toolA);
        registry.register(toolB);

        const tools = registry.getAllTools();
        expect(tools).toHaveLength(2);

        const resultA = await registry.routeCall(undefined, 'tool_a', { action: 'ping' });
        const resultB = await registry.routeCall(undefined, 'tool_b', { action: 'ping' });
        expect(resultA.content[0].text).toBe('a');
        expect(resultB.content[0].text).toBe('b');
    });

    // ── Typed Context ──

    it('should support typed context', async () => {
        interface Ctx { userId: string }

        const tool = defineTool<Ctx>('ctx_tool', {
            actions: {
                whoami: {
                    handler: async (ctx) => success(ctx.userId),
                },
            },
        });

        const result = await tool.execute({ userId: 'u42' }, { action: 'whoami' });
        expect(result.content[0].text).toBe('u42');
    });

    // ── Custom Discriminator ──

    it('should support custom discriminator', async () => {
        const tool = defineTool('custom_disc', {
            discriminator: 'operation',
            actions: {
                ping: { handler: async () => success('pong') },
            },
        });

        const result = await tool.execute(undefined, { operation: 'ping' });
        expect(result.content[0].text).toBe('pong');
    });

    // ── TOON Description ──

    it('should support toonDescription', () => {
        const tool = defineTool('toon', {
            toonDescription: true,
            actions: {
                run: { handler: async () => success('ok') },
            },
        });

        const def = tool.buildToolDefinition();
        expect(def.description).toBeDefined();
    });

    // ── Examples in Params ──

    it('should inject examples into schema description', () => {
        const tool = defineTool('examples', {
            actions: {
                schedule: {
                    params: {
                        cron: {
                            type: 'string',
                            description: 'CRON expression',
                            examples: ['0 12 * * *', '*/5 * * * *'],
                        },
                    },
                    handler: async () => success('ok'),
                },
            },
        });

        const def = tool.buildToolDefinition();
        expect(def.inputSchema).toBeDefined();
    });
});

// ============================================================================
// toolError() Tests
// ============================================================================

describe('toolError()', () => {
    it('should create structured error with code and message', () => {
        const result = toolError('NotFound', { message: 'Item not found' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('[NotFound]');
        expect(result.content[0].text).toContain('Item not found');
    });

    it('should include suggestion when provided', () => {
        const result = toolError('NotFound', {
            message: 'Project not found',
            suggestion: 'Call projects.list first',
        });
        expect(result.content[0].text).toContain('💡 Suggestion: Call projects.list first');
    });

    it('should include available actions when provided', () => {
        const result = toolError('NotFound', {
            message: 'Not found',
            availableActions: ['projects.list', 'projects.search'],
        });
        expect(result.content[0].text).toContain('📋 Try: projects.list, projects.search');
    });

    it('should format full self-healing response', () => {
        const result = toolError('ProjectNotFound', {
            message: "Project 'xyz' does not exist.",
            suggestion: 'Call projects.list to get valid IDs.',
            availableActions: ['projects.list'],
        });

        const text = result.content[0].text;
        expect(text).toContain("[ProjectNotFound] Project 'xyz' does not exist.");
        expect(text).toContain('💡 Suggestion:');
        expect(text).toContain('📋 Try: projects.list');
        expect(result.isError).toBe(true);
    });

    it('should work with minimal options (message only)', () => {
        const result = toolError('RateLimited', {
            message: 'Too many requests',
        });
        expect(result.content[0].text).toBe('[RateLimited] Too many requests');
        expect(result.isError).toBe(true);
    });
});
