/**
 * EdgeCases.test.ts — Tests for uncovered branches, error paths, and edge cases
 *
 * Targets:
 * - GroupedToolBuilder: getActionMetadata(), group middleware, frozen guards
 * - ResponseHelper: empty string fallback
 * - MiddlewareCompiler: per-action/group middleware chains
 * - ConverterBase: null/undefined filtering in batch operations
 * - Misc: boundary conditions and defensive code paths
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    GroupedToolBuilder,
    ActionGroupBuilder,
    success,
    error,
} from '../../src/framework/index.js';
import type { ToolResponse } from '../../src/framework/index.js';
import { success as successHelper } from '../../src/framework/ResponseHelper.js';
import { ToolConverterBase } from '../../src/converters/ToolConverter.js';
import { Tool } from '../../src/Tool.js';

// ── Helpers ──────────────────────────────────────────────

const dummyHandler = async (_ctx: unknown, _args: Record<string, unknown>): Promise<ToolResponse> =>
    success('ok');

// ============================================================================
// GroupedToolBuilder — getActionMetadata()
// ============================================================================

describe('GroupedToolBuilder — getActionMetadata()', () => {
    it('should return metadata for flat actions', () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'list',
                description: 'List items',
                readOnly: true,
                idempotent: true,
                handler: dummyHandler,
            })
            .action({
                name: 'create',
                description: 'Create an item',
                destructive: false,
                schema: z.object({ title: z.string() }),
                handler: dummyHandler,
            });

        builder.buildToolDefinition();
        const metadata = builder.getActionMetadata();

        expect(metadata).toHaveLength(2);

        // First action
        expect(metadata[0]?.key).toBe('list');
        expect(metadata[0]?.actionName).toBe('list');
        expect(metadata[0]?.groupName).toBeUndefined();
        expect(metadata[0]?.description).toBe('List items');
        expect(metadata[0]?.readOnly).toBe(true);
        expect(metadata[0]?.idempotent).toBe(true);
        expect(metadata[0]?.destructive).toBe(false);
        expect(metadata[0]?.requiredFields).toEqual([]);
        expect(metadata[0]?.hasMiddleware).toBe(false);

        // Second action
        expect(metadata[1]?.key).toBe('create');
        expect(metadata[1]?.description).toBe('Create an item');
        expect(metadata[1]?.requiredFields).toEqual(['title']);
        expect(metadata[1]?.destructive).toBe(false);
    });

    it('should return metadata for grouped actions with middleware', () => {
        const builder = new GroupedToolBuilder('test')
            .group('admin', 'Admin operations', g => g
                .use(async (_ctx, _args, next) => next())
                .action({
                    name: 'delete',
                    description: 'Delete permanently',
                    destructive: true,
                    schema: z.object({ id: z.string() }),
                    handler: dummyHandler,
                })
            );

        builder.buildToolDefinition();
        const metadata = builder.getActionMetadata();

        expect(metadata).toHaveLength(1);
        expect(metadata[0]?.key).toBe('admin.delete');
        expect(metadata[0]?.actionName).toBe('delete');
        expect(metadata[0]?.groupName).toBe('admin');
        expect(metadata[0]?.destructive).toBe(true);
        expect(metadata[0]?.hasMiddleware).toBe(true);
        expect(metadata[0]?.requiredFields).toEqual(['id']);
    });

    it('should default destructive/idempotent/readOnly to false when undefined', () => {
        const builder = new GroupedToolBuilder('test')
            .action({ name: 'do_something', handler: dummyHandler });

        builder.buildToolDefinition();
        const metadata = builder.getActionMetadata();

        expect(metadata[0]?.destructive).toBe(false);
        expect(metadata[0]?.idempotent).toBe(false);
        expect(metadata[0]?.readOnly).toBe(false);
    });
});

// ============================================================================
// GroupedToolBuilder — Group Middleware Chain
// ============================================================================

describe('GroupedToolBuilder — Group-Level Middleware', () => {
    it('should run group middleware before action handler', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder('test')
            .group('admin', g => g
                .use(async (_ctx, _args, next) => {
                    log.push('group-mw');
                    return next();
                })
                .action({
                    name: 'delete',
                    handler: async () => {
                        log.push('handler');
                        return success('deleted');
                    },
                })
            );

        builder.buildToolDefinition();
        await builder.execute(undefined, { action: 'admin.delete' });

        expect(log).toEqual(['group-mw', 'handler']);
    });

    it('should run global middleware BEFORE group middleware', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder('test')
            .use(async (_ctx, _args, next) => {
                log.push('global-mw');
                return next();
            })
            .group('admin', g => g
                .use(async (_ctx, _args, next) => {
                    log.push('group-mw');
                    return next();
                })
                .action({
                    name: 'delete',
                    handler: async () => {
                        log.push('handler');
                        return success('deleted');
                    },
                })
            );

        builder.buildToolDefinition();
        await builder.execute(undefined, { action: 'admin.delete' });

        expect(log).toEqual(['global-mw', 'group-mw', 'handler']);
    });

    it('should allow group middleware to short-circuit', async () => {
        const builder = new GroupedToolBuilder('test')
            .group('admin', g => g
                .use(async (_ctx, _args, _next) => {
                    return error('forbidden');
                })
                .action({
                    name: 'delete',
                    handler: async () => success('should not reach'),
                })
            );

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, { action: 'admin.delete' });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toBe('forbidden');
    });

    it('should support multiple group middlewares in order', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder('test')
            .group('admin', g => g
                .use(async (_ctx, _args, next) => {
                    log.push('group-mw-1');
                    return next();
                })
                .use(async (_ctx, _args, next) => {
                    log.push('group-mw-2');
                    return next();
                })
                .action({
                    name: 'list',
                    handler: async () => {
                        log.push('handler');
                        return success('ok');
                    },
                })
            );

        builder.buildToolDefinition();
        await builder.execute(undefined, { action: 'admin.list' });

        expect(log).toEqual(['group-mw-1', 'group-mw-2', 'handler']);
    });

    it('should isolate group middleware — other groups unaffected', async () => {
        const log: string[] = [];

        const builder = new GroupedToolBuilder('test')
            .group('admin', g => g
                .use(async (_ctx, _args, next) => {
                    log.push('admin-mw');
                    return next();
                })
                .action({ name: 'delete', handler: async () => { log.push('admin-handler'); return success('ok'); } })
            )
            .group('public', g => g
                .action({ name: 'list', handler: async () => { log.push('public-handler'); return success('ok'); } })
            );

        builder.buildToolDefinition();

        // Execute public action — should NOT trigger admin middleware
        await builder.execute(undefined, { action: 'public.list' });
        expect(log).toEqual(['public-handler']);

        log.length = 0;

        // Execute admin action — should trigger admin middleware
        await builder.execute(undefined, { action: 'admin.delete' });
        expect(log).toEqual(['admin-mw', 'admin-handler']);
    });
});

// ============================================================================
// GroupedToolBuilder — Frozen Guard (all config methods)
// ============================================================================

describe('GroupedToolBuilder — Frozen Guard', () => {
    const frozenBuilder = () => {
        const b = new GroupedToolBuilder('test')
            .action({ name: 'list', handler: dummyHandler });
        b.buildToolDefinition();
        return b;
    };

    it('should reject .description() after freeze', () => {
        expect(() => frozenBuilder().description('new')).toThrow('frozen');
    });

    it('should reject .discriminator() after freeze', () => {
        expect(() => frozenBuilder().discriminator('method')).toThrow('frozen');
    });

    it('should reject .annotations() after freeze', () => {
        expect(() => frozenBuilder().annotations({})).toThrow('frozen');
    });

    it('should reject .tags() after freeze', () => {
        expect(() => frozenBuilder().tags('public')).toThrow('frozen');
    });

    it('should reject .commonSchema() after freeze', () => {
        expect(() => frozenBuilder().commonSchema(z.object({}))).toThrow('frozen');
    });

    it('should reject .use() after freeze', () => {
        expect(() => frozenBuilder().use(async (_c, _a, n) => n())).toThrow('frozen');
    });

    it('should reject .toonDescription() after freeze', () => {
        expect(() => frozenBuilder().toonDescription()).toThrow('frozen');
    });

    it('should reject .group() after freeze', () => {
        // Need a group-based builder
        const b = new GroupedToolBuilder('test')
            .group('g', g => g.action({ name: 'a', handler: dummyHandler }));
        b.buildToolDefinition();
        expect(() => b.group('g2', g => g.action({ name: 'b', handler: dummyHandler }))).toThrow('frozen');
    });
});

// ============================================================================
// GroupedToolBuilder — Error Paths
// ============================================================================

describe('GroupedToolBuilder — Error Paths', () => {
    it('should reject flat action names with dots', () => {
        const builder = new GroupedToolBuilder('test');
        expect(() => {
            builder.action({ name: 'v2.list', handler: dummyHandler });
        }).toThrow('must not contain dots');
    });

    it('should reject group without configure callback', () => {
        const builder = new GroupedToolBuilder('test');
        expect(() => {
            // @ts-expect-error — intentionally missing callback
            builder.group('core', 'Description');
        }).toThrow('requires a configure callback');
    });

    it('should handle handler throwing non-Error non-string', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'crash',
                handler: async () => { throw 42; },
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, { action: 'crash' });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toBe('[test/crash] 42');
    });

    it('should handle handler throwing undefined', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'crash',
                handler: async () => { throw undefined; },
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, { action: 'crash' });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toBe('[test/crash] undefined');
    });

    it('should handle middleware throwing errors', async () => {
        const builder = new GroupedToolBuilder('test')
            .use(async () => { throw new Error('middleware-boom'); })
            .action({ name: 'list', handler: dummyHandler });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, { action: 'list' });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('middleware-boom');
    });
});

// ============================================================================
// ResponseHelper — Edge Cases
// ============================================================================

describe('ResponseHelper — Edge Cases', () => {
    it('should return "OK" for empty string input', () => {
        const result = successHelper('');
        expect(result.content[0]?.text).toBe('OK');
        expect(result.isError).toBeUndefined();
    });

    it('should return text as-is for non-empty string', () => {
        const result = successHelper('hello');
        expect(result.content[0]?.text).toBe('hello');
    });

    it('should JSON.stringify objects', () => {
        const result = successHelper({ key: 'value' });
        const parsed = JSON.parse(result.content[0]?.text ?? '');
        expect(parsed).toEqual({ key: 'value' });
    });

    it('should handle object with special values', () => {
        const result = successHelper({ a: null, b: 0, c: false, d: '' });
        const parsed = JSON.parse(result.content[0]?.text ?? '');
        expect(parsed.a).toBeNull();
        expect(parsed.b).toBe(0);
        expect(parsed.c).toBe(false);
        expect(parsed.d).toBe('');
    });
});

// ============================================================================
// ConverterBase — Null Filtering in Batch Operations
// ============================================================================

describe('ConverterBase — Null Filtering', () => {
    class NullableToolConverter extends ToolConverterBase<{ name: string } | null> {
        convertFrom(tool: Tool): { name: string } | null {
            if (tool.name === 'skip') return null;
            return { name: tool.name };
        }
        convertTo(dto: { name: string } | null): Tool {
            return new Tool(dto?.name ?? 'default');
        }
    }

    const converter = new NullableToolConverter();

    it('should filter null results from convertFromBatch', () => {
        const tools = [new Tool('keep'), new Tool('skip'), new Tool('also-keep')];
        const results = converter.convertFromBatch(tools);

        expect(results).toHaveLength(2);
        expect(results[0]?.name).toBe('keep');
        expect(results[1]?.name).toBe('also-keep');
    });

    it('should handle empty batch', () => {
        expect(converter.convertFromBatch([])).toEqual([]);
        expect(converter.convertToBatch([])).toEqual([]);
    });

    it('should handle batch where all items are null', () => {
        const tools = [new Tool('skip'), new Tool('skip')];
        const results = converter.convertFromBatch(tools);
        expect(results).toEqual([]);
    });
});

// ============================================================================
// ActionGroupBuilder — Direct Construction Edge Cases
// ============================================================================

describe('ActionGroupBuilder — Edge Cases', () => {
    it('should work without a description', () => {
        const groupBuilder = new ActionGroupBuilder('test');
        groupBuilder.action({ name: 'list', handler: dummyHandler });

        expect(groupBuilder._actions).toHaveLength(1);
        expect(groupBuilder._actions[0]?.key).toBe('test.list');
        expect(groupBuilder._actions[0]?.groupDescription).toBe('');
    });

    it('should chain .use() and .action() fluently', () => {
        const groupBuilder = new ActionGroupBuilder('test', 'Test Group');
        const result = groupBuilder
            .use(async (_ctx, _args, next) => next())
            .action({ name: 'a', handler: dummyHandler })
            .action({ name: 'b', handler: dummyHandler });

        expect(result).toBe(groupBuilder); // Fluent chaining
        expect(groupBuilder._actions).toHaveLength(2);
    });

    it('should reject action names with dots in group builder', () => {
        const groupBuilder = new ActionGroupBuilder('test');
        expect(() => {
            groupBuilder.action({ name: 'x.y', handler: dummyHandler });
        }).toThrow('must not contain dots');
    });
});

// ============================================================================
// GroupedToolBuilder — Custom Discriminator Execution
// ============================================================================

describe('GroupedToolBuilder — Custom Discriminator', () => {
    it('should route using custom discriminator field', async () => {
        const builder = new GroupedToolBuilder('test')
            .discriminator('method')
            .action({
                name: 'get',
                handler: async () => success('got it'),
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, { method: 'get' });

        expect(result.isError).toBeUndefined();
        expect(result.content[0]?.text).toBe('got it');
    });

    it('should error when custom discriminator is missing', async () => {
        const builder = new GroupedToolBuilder('test')
            .discriminator('operation')
            .action({ name: 'list', handler: dummyHandler });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, { action: 'list' });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('operation is required');
    });
});

// ============================================================================
// GroupedToolBuilder — No Schema Actions (zero-validation path)
// ============================================================================

describe('GroupedToolBuilder — No Schema Actions', () => {
    it('should execute action without any schema (no validation step)', async () => {
        const builder = new GroupedToolBuilder('test')
            .action({
                name: 'ping',
                handler: async (_ctx, args) => success(`pong: ${JSON.stringify(args)}`),
            });

        builder.buildToolDefinition();
        const result = await builder.execute(undefined, {
            action: 'ping',
            anything: 'goes',
            extra: 42,
        });

        expect(result.isError).toBeUndefined();
        // Without schema, raw args pass through (including discriminator)
        const text = result.content[0]?.text ?? '';
        expect(text).toContain('anything');
        expect(text).toContain('goes');
    });
});

// ============================================================================
// GroupedToolBuilder — Description Generator Edge Cases
// ============================================================================

describe('GroupedToolBuilder — Description Edge Cases', () => {
    it('should skip workflow for actions without description, required fields, or destructive flag', () => {
        const builder = new GroupedToolBuilder('test')
            .description('Test tool')
            .action({ name: 'simple', handler: dummyHandler });

        const tool = builder.buildToolDefinition();
        // Simple action with no description/schema/destructive → no workflow section
        expect(tool.description).not.toContain('Workflow:');
    });

    it('should show workflow for action with only description (no required, not destructive)', () => {
        const builder = new GroupedToolBuilder('test')
            .description('Test tool')
            .action({ name: 'info', description: 'Get info', handler: dummyHandler });

        const tool = builder.buildToolDefinition();
        expect(tool.description).toContain('Workflow:');
        expect(tool.description).toContain("'info': Get info");
    });

    it('should show description + requires + destructive all in one line', () => {
        const builder = new GroupedToolBuilder('test')
            .description('Test tool')
            .action({
                name: 'nuke',
                description: 'Destroy everything',
                destructive: true,
                schema: z.object({ target: z.string() }),
                handler: dummyHandler,
            });

        const tool = builder.buildToolDefinition();
        expect(tool.description).toContain("'nuke': Destroy everything. Requires: target ⚠️ DESTRUCTIVE");
    });
});
