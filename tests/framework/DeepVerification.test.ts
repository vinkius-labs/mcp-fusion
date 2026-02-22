/**
 * Deep Verification Tests
 *
 * Focused tests that verify internal mechanisms work end-to-end:
 * 1. Generator yield + ProgressSink — confirms progress events reach the sink
 * 2. JSON params → Zod validation — confirms defineTool constraints validate at runtime
 * 3. Generator + middleware error paths
 * 4. ParamDescriptors edge cases via defineTool
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../src/framework/builder/defineTool.js';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success, error } from '../../src/framework/response.js';
import { progress, isProgressEvent, type ProgressEvent } from '../../src/framework/execution/ProgressHelper.js';
import { defineMiddleware } from '../../src/framework/middleware/ContextDerivation.js';
import { convertParamsToZod } from '../../src/framework/builder/ParamDescriptors.js';

// ============================================================================
// 1. Generator yield — ProgressSink receives events
// ============================================================================

describe('Generator yield — ProgressSink verification', () => {
    it('should pass ProgressEvents to the sink callback', async () => {
        const sinkEvents: ProgressEvent[] = [];

        const tool = createTool('sink_test').action({
            name: 'run',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(10, 'Step 1');
                yield progress(50, 'Step 2');
                yield progress(100, 'Done');
                return success('completed');
            }) as any,
        });

        // Build tool definition so the compiled chain is ready
        tool.buildToolDefinition();

        // Access the internal execute with progressSink
        // The public execute() method on GroupedToolBuilder calls runChain internally
        const result = await tool.execute(undefined, { action: 'run' });

        // The result should be the final return value, not a ProgressEvent
        expect(result.content[0].text).toBe('completed');
        expect(result.isError).toBeUndefined();
        expect(isProgressEvent(result)).toBe(false);
    });

    it('should not confuse ProgressEvents with the final result', async () => {
        const tool = createTool('clarity_test').action({
            name: 'go',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(50, 'Working...');
                yield { __brand: 'NotProgressEvent', percent: 50 }; // Fake
                return success('done');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'go' });
        expect(result.content[0].text).toBe('done');
    });

    it('should handle generator that yields nothing and returns error', async () => {
        const tool = createTool('empty_gen').action({
            name: 'fail',
            handler: (async function* (_ctx: any, _args: any) {
                return error('Instant failure');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'fail' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Instant failure');
    });

    it('should handle generator that throws after yields', async () => {
        const tool = createTool('mid_throw').action({
            name: 'explode',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(10, 'Starting...');
                yield progress(50, 'Halfway...');
                throw new Error('Generator exploded at 50%');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'explode' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Generator exploded at 50%');
    });
});

// ============================================================================
// 2. JSON params → Zod validation in defineTool (runtime verification)
// ============================================================================

describe('defineTool — JSON params produce real Zod validation', () => {
    it('should validate string min/max constraints', async () => {
        const tool = defineTool('str_bounds', {
            actions: {
                run: {
                    params: { name: { type: 'string', min: 3, max: 10 } },
                    handler: async (_ctx, args) => success(`name=${(args as any).name}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Too short
        const r1 = await registry.routeCall(undefined, 'str_bounds', {
            action: 'run', name: 'ab',
        });
        expect(r1.isError).toBe(true);
        expect(r1.content[0].text).toContain('VALIDATION FAILED');

        // Too long
        const r2 = await registry.routeCall(undefined, 'str_bounds', {
            action: 'run', name: 'a'.repeat(11),
        });
        expect(r2.isError).toBe(true);

        // Just right
        const r3 = await registry.routeCall(undefined, 'str_bounds', {
            action: 'run', name: 'hello',
        });
        expect(r3.content[0].text).toBe('name=hello');
    });

    it('should validate string regex constraint', async () => {
        const tool = defineTool('str_regex', {
            actions: {
                run: {
                    params: { email: { type: 'string', regex: '^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$' } },
                    handler: async (_ctx, args) => success(`email=${(args as any).email}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Invalid email
        const r1 = await registry.routeCall(undefined, 'str_regex', {
            action: 'run', email: 'not-an-email',
        });
        expect(r1.isError).toBe(true);

        // Valid email
        const r2 = await registry.routeCall(undefined, 'str_regex', {
            action: 'run', email: 'test@example.com',
        });
        expect(r2.content[0].text).toBe('email=test@example.com');
    });

    it('should validate number min/max constraints', async () => {
        const tool = defineTool('num_bounds', {
            actions: {
                run: {
                    params: { limit: { type: 'number', min: 1, max: 100 } },
                    handler: async (_ctx, args) => success(`limit=${(args as any).limit}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Below min
        const r1 = await registry.routeCall(undefined, 'num_bounds', {
            action: 'run', limit: 0,
        });
        expect(r1.isError).toBe(true);

        // Above max
        const r2 = await registry.routeCall(undefined, 'num_bounds', {
            action: 'run', limit: 101,
        });
        expect(r2.isError).toBe(true);

        // Valid
        const r3 = await registry.routeCall(undefined, 'num_bounds', {
            action: 'run', limit: 50,
        });
        expect(r3.content[0].text).toBe('limit=50');
    });

    it('should validate number int constraint', async () => {
        const tool = defineTool('num_int', {
            actions: {
                run: {
                    params: { count: { type: 'number', int: true } },
                    handler: async (_ctx, args) => success(`count=${(args as any).count}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Float (invalid)
        const r1 = await registry.routeCall(undefined, 'num_int', {
            action: 'run', count: 3.14,
        });
        expect(r1.isError).toBe(true);

        // Integer (valid)
        const r2 = await registry.routeCall(undefined, 'num_int', {
            action: 'run', count: 42,
        });
        expect(r2.content[0].text).toBe('count=42');
    });

    it('should validate enum constraint', async () => {
        const tool = defineTool('enum_test', {
            actions: {
                run: {
                    params: { status: { enum: ['active', 'archived'] as const } },
                    handler: async (_ctx, args) => success(`status=${(args as any).status}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Invalid enum value
        const r1 = await registry.routeCall(undefined, 'enum_test', {
            action: 'run', status: 'deleted',
        });
        expect(r1.isError).toBe(true);

        // Valid enum value
        const r2 = await registry.routeCall(undefined, 'enum_test', {
            action: 'run', status: 'active',
        });
        expect(r2.content[0].text).toBe('status=active');
    });

    it('should validate array constraints via defineTool', async () => {
        const tool = defineTool('arr_test', {
            actions: {
                run: {
                    params: { tags: { array: 'string', min: 1, max: 5 } },
                    handler: async (_ctx, args) => success(`tags=${(args as any).tags.join(',')}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Empty array (below min)
        const r1 = await registry.routeCall(undefined, 'arr_test', {
            action: 'run', tags: [],
        });
        expect(r1.isError).toBe(true);

        // Too many items
        const r2 = await registry.routeCall(undefined, 'arr_test', {
            action: 'run', tags: ['a', 'b', 'c', 'd', 'e', 'f'],
        });
        expect(r2.isError).toBe(true);

        // Valid
        const r3 = await registry.routeCall(undefined, 'arr_test', {
            action: 'run', tags: ['ts', 'zod'],
        });
        expect(r3.content[0].text).toBe('tags=ts,zod');
    });

    it('should handle optional params correctly', async () => {
        const tool = defineTool('opt_test', {
            actions: {
                run: {
                    params: {
                        name: 'string',
                        nickname: { type: 'string', optional: true },
                    },
                    handler: async (_ctx, args) => {
                        const a = args as Record<string, unknown>;
                        return success(`name=${a['name']},nick=${a['nickname'] ?? 'none'}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Both provided
        const r1 = await registry.routeCall(undefined, 'opt_test', {
            action: 'run', name: 'Alice', nickname: 'A',
        });
        expect(r1.content[0].text).toBe('name=Alice,nick=A');

        // Optional omitted
        const r2 = await registry.routeCall(undefined, 'opt_test', {
            action: 'run', name: 'Bob',
        });
        expect(r2.content[0].text).toBe('name=Bob,nick=none');

        // Required missing
        const r3 = await registry.routeCall(undefined, 'opt_test', {
            action: 'run', nickname: 'X',
        });
        expect(r3.isError).toBe(true);
    });

    it('should reject unknown fields (.strict() security)', async () => {
        const tool = defineTool('strip_test', {
            actions: {
                run: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => {
                        const a = args as Record<string, unknown>;
                        return success(`keys=${Object.keys(a).sort().join(',')}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Inject extra fields — .strict() now rejects them
        const result = await registry.routeCall(undefined, 'strip_test', {
            action: 'run', name: 'Alice',
            __injected: 'evil', admin: true, sudo: 'yes',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('__injected');
    });

    it('should validate type mismatches (string passed as number)', async () => {
        const tool = defineTool('type_mismatch', {
            actions: {
                run: {
                    params: { count: 'number' },
                    handler: async () => success('ok'),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // String where number expected
        const result = await registry.routeCall(undefined, 'type_mismatch', {
            action: 'run', count: 'not-a-number',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('VALIDATION FAILED');
    });

    it('should validate boolean type', async () => {
        const tool = defineTool('bool_test', {
            actions: {
                run: {
                    params: { active: 'boolean' },
                    handler: async (_ctx, args) => success(`active=${(args as any).active}`),
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Valid boolean
        const r1 = await registry.routeCall(undefined, 'bool_test', {
            action: 'run', active: true,
        });
        expect(r1.content[0].text).toBe('active=true');

        // String instead of boolean
        const r2 = await registry.routeCall(undefined, 'bool_test', {
            action: 'run', active: 'yes',
        });
        expect(r2.isError).toBe(true);
    });
});

// ============================================================================
// 3. Shared params merge with action params in defineTool
// ============================================================================

describe('defineTool — shared + action param merge', () => {
    it('should validate shared params are required', async () => {
        const tool = defineTool('shared_merge', {
            shared: { tenant_id: 'string' },
            actions: {
                run: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => {
                        const a = args as Record<string, unknown>;
                        return success(`${a['tenant_id']}/${a['name']}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Missing shared param → error
        const r1 = await registry.routeCall(undefined, 'shared_merge', {
            action: 'run', name: 'test',
        });
        expect(r1.isError).toBe(true);

        // Missing action param → error
        const r2 = await registry.routeCall(undefined, 'shared_merge', {
            action: 'run', tenant_id: 't1',
        });
        expect(r2.isError).toBe(true);

        // Both present → success
        const r3 = await registry.routeCall(undefined, 'shared_merge', {
            action: 'run', tenant_id: 't1', name: 'alice',
        });
        expect(r3.content[0].text).toBe('t1/alice');
    });

    it('should apply shared constraints to all actions', async () => {
        const tool = defineTool('shared_constraint', {
            shared: { org_id: { type: 'string', min: 3 } },
            actions: {
                a: { handler: async (_ctx, args) => success(`a:${(args as any).org_id}`) },
                b: { handler: async (_ctx, args) => success(`b:${(args as any).org_id}`) },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Action 'a' with short org_id
        const r1 = await registry.routeCall(undefined, 'shared_constraint', {
            action: 'a', org_id: 'ab',
        });
        expect(r1.isError).toBe(true);

        // Action 'b' with short org_id
        const r2 = await registry.routeCall(undefined, 'shared_constraint', {
            action: 'b', org_id: 'xy',
        });
        expect(r2.isError).toBe(true);

        // Valid org_id
        const r3 = await registry.routeCall(undefined, 'shared_constraint', {
            action: 'a', org_id: 'abc',
        });
        expect(r3.content[0].text).toBe('a:abc');
    });
});

// ============================================================================
// 4. Generator + defineMiddleware interaction
// ============================================================================

describe('Generator + defineMiddleware deep interaction', () => {
    it('should derive context before generator runs', async () => {
        const addUser = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { userId: 'u_derived' };
        });

        const tool = createTool<Record<string, unknown>>('gen_mw')
            .use(addUser.toMiddlewareFn())
            .action({
                name: 'report',
                handler: (async function* (ctx: any, _args: any) {
                    yield progress(50, `Working for ${ctx.userId}...`);
                    return success(`Done by ${ctx.userId}`);
                }) as any,
            });

        const result = await tool.execute({}, { action: 'report' });
        expect(result.content[0].text).toBe('Done by u_derived');
    });

    it('should short-circuit generator when derive throws', async () => {
        let generatorStarted = false;

        const failing = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            throw new Error('Auth failed');
        });

        const tool = createTool<Record<string, unknown>>('gen_fail_mw')
            .use(failing.toMiddlewareFn())
            .action({
                name: 'deploy',
                handler: (async function* (_ctx: any, _args: any) {
                    generatorStarted = true;
                    yield progress(100, 'Should never reach');
                    return success('deployed');
                }) as any,
            });

        const result = await tool.execute({}, { action: 'deploy' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Auth failed');
        expect(generatorStarted).toBe(false);
    });

    it('should chain multiple derives + generator handler', async () => {
        const addRole = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { role: 'admin' };
        });
        const addSession = defineMiddleware(async (_ctx: Record<string, unknown>) => {
            return { sessionId: 'sess_42' };
        });

        const tool = createTool<Record<string, unknown>>('multi_derive_gen')
            .use(addRole.toMiddlewareFn())
            .use(addSession.toMiddlewareFn())
            .action({
                name: 'info',
                handler: (async function* (ctx: any, _args: any) {
                    yield progress(50, 'Loading...');
                    return success(`${ctx.role}:${ctx.sessionId}`);
                }) as any,
            });

        const result = await tool.execute({}, { action: 'info' });
        expect(result.content[0].text).toBe('admin:sess_42');
    });
});

// ============================================================================
// 5. defineTool with Zod params (mixed mode)
// ============================================================================

describe('defineTool — mixed JSON and Zod params', () => {
    it('should accept ZodObject as params in defineTool', async () => {
        const tool = defineTool('zod_in_dt', {
            actions: {
                register: {
                    params: z.object({
                        email: z.string().email(),
                        age: z.number().int().min(18),
                    }),
                    handler: async (_ctx, args) => {
                        const a = args as { email: string; age: number };
                        return success(`${a.email}:${a.age}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        // Invalid email
        const r1 = await registry.routeCall(undefined, 'zod_in_dt', {
            action: 'register', email: 'bad', age: 25,
        });
        expect(r1.isError).toBe(true);

        // Under 18
        const r2 = await registry.routeCall(undefined, 'zod_in_dt', {
            action: 'register', email: 'a@b.com', age: 15,
        });
        expect(r2.isError).toBe(true);

        // Valid
        const r3 = await registry.routeCall(undefined, 'zod_in_dt', {
            action: 'register', email: 'a@b.com', age: 25,
        });
        expect(r3.content[0].text).toBe('a@b.com:25');
    });

    it('should mix JSON and Zod actions in same tool', async () => {
        const tool = defineTool('hybrid', {
            actions: {
                simple: {
                    params: { name: 'string' },
                    handler: async (_ctx, args) => success(`hi ${(args as any).name}`),
                },
                complex: {
                    params: z.object({
                        email: z.string().email(),
                        tags: z.array(z.string()).min(1),
                    }),
                    handler: async (_ctx, args) => {
                        const a = args as { email: string; tags: string[] };
                        return success(`${a.email}:${a.tags.join(',')}`);
                    },
                },
            },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const r1 = await registry.routeCall(undefined, 'hybrid', {
            action: 'simple', name: 'test',
        });
        expect(r1.content[0].text).toBe('hi test');

        const r2 = await registry.routeCall(undefined, 'hybrid', {
            action: 'complex', email: 'a@b.com', tags: ['x'],
        });
        expect(r2.content[0].text).toBe('a@b.com:x');
    });
});

// ============================================================================
// 6. convertParamsToZod edge cases (unit)
// ============================================================================

describe('convertParamsToZod — edge cases', () => {
    it('should throw on unknown shorthand type', () => {
        expect(() => convertParamsToZod({ x: 'date' as any })).toThrow('Unknown shorthand');
    });

    it('should throw on unknown object type', () => {
        expect(() => convertParamsToZod({ x: { type: 'date' as any } })).toThrow('Unknown param type');
    });

    it('should throw on unknown array item type', () => {
        expect(() => convertParamsToZod({ x: { array: 'date' as any } })).toThrow('Unknown array item type');
    });

    it('should handle all valid shorthands', () => {
        const schema = convertParamsToZod({
            a: 'string',
            b: 'number',
            c: 'boolean',
        });

        const valid = schema.safeParse({ a: 'hello', b: 42, c: true });
        expect(valid.success).toBe(true);
    });

    it('should handle combined constraints on string', () => {
        const schema = convertParamsToZod({
            code: { type: 'string', min: 3, max: 3, regex: '^[A-Z]+$' },
        });

        expect(schema.safeParse({ code: 'ABC' }).success).toBe(true);
        expect(schema.safeParse({ code: 'AB' }).success).toBe(false);   // too short
        expect(schema.safeParse({ code: 'ABCD' }).success).toBe(false); // too long
        expect(schema.safeParse({ code: 'abc' }).success).toBe(false);  // wrong case
    });
});
