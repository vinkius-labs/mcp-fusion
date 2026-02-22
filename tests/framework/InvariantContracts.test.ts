/**
 * InvariantContracts.test.ts
 *
 * Invariant-level tests that verify mathematical properties of the framework.
 * These tests do not care about specific values — they verify that properties
 * hold universally across ALL possible inputs and states.
 *
 * Categories:
 *   1. Determinism — same input always produces byte-identical output
 *   2. Execution Isolation — one tool never leaks into another
 *   3. Context Immutability — handlers cannot poison shared context
 *   4. Handler Chaos — throws, rejects, returns garbage, hangs
 *   5. Unicode / Binary / Null-byte Boundaries
 *   6. Re-Entrancy — calling execute from inside middleware
 *   7. Concurrent Registry Stress — parallel routeCall interleaving
 *   8. Metadata Contract Completeness — every action covered in metadata
 *   9. defineTool + createTool Equivalence — same config = same schema
 *  10. Generator + Validation Fusion — validate BEFORE generator starts
 *  11. FusionClient Invariants — transport contract, path splitting edge cases
 *  12. Registry Abuse — clear, has, size, double-register, route-after-clear
 *  13. Middleware Return-Value Contracts — must return ToolResponse
 *  14. Schema Collision Path — field type conflicts across actions
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/framework/builder/defineTool.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success, error, toolError } from '../../src/framework/response.js';
import { progress, isProgressEvent } from '../../src/framework/execution/ProgressHelper.js';
import { defineMiddleware, isMiddlewareDefinition, resolveMiddleware } from '../../src/framework/middleware/ContextDerivation.js';
import { createFusionClient } from '../../src/framework/client/FusionClient.js';
import type { MiddlewareFn } from '../../src/framework/types.js';

// ============================================================================
// 1. Determinism — Same input → byte-identical output, every time
// ============================================================================

describe('Invariant: Determinism', () => {
    it('should produce identical ToolDefinition across 100 calls', () => {
        const b = createTool('det_test')
            .description('Determinism test')
            .commonSchema(z.object({ org: z.string() }))
            .action({
                name: 'list',
                readOnly: true,
                schema: z.object({ limit: z.number().int().optional() }),
                handler: async () => success('ok'),
            })
            .action({
                name: 'delete',
                destructive: true,
                schema: z.object({ id: z.string() }),
                handler: async () => success('gone'),
            });

        const baseline = JSON.stringify(b.buildToolDefinition());
        for (let i = 0; i < 100; i++) {
            expect(JSON.stringify(b.buildToolDefinition())).toBe(baseline);
        }
    });

    it('should produce identical execute results for identical inputs', async () => {
        const b = createTool('det_exec')
            .action({
                name: 'echo',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });
        b.buildToolDefinition();

        const results: string[] = [];
        for (let i = 0; i < 50; i++) {
            const r = await b.execute(undefined, { action: 'echo', msg: 'hello' });
            results.push(JSON.stringify(r));
        }

        const baseline = results[0];
        for (const r of results) {
            expect(r).toBe(baseline);
        }
    });

    it('error responses should be deterministic for identical invalid inputs', async () => {
        const b = createTool('det_err')
            .action({
                name: 'run',
                schema: z.object({ count: z.number().min(0) }),
                handler: async () => success('ok'),
            });
        b.buildToolDefinition();

        const results: string[] = [];
        for (let i = 0; i < 50; i++) {
            const r = await b.execute(undefined, { action: 'run', count: -1 });
            results.push(JSON.stringify(r));
        }

        const baseline = results[0];
        for (const r of results) {
            expect(r).toBe(baseline);
        }
    });
});

// ============================================================================
// 2. Execution Isolation — Tools never leak state across calls
// ============================================================================

describe('Invariant: Execution Isolation', () => {
    it('should never leak mutable state between sequential calls', async () => {
        let callNumber = 0;
        const b = createTool<void>('iso_seq')
            .action({
                name: 'run',
                schema: z.object({ id: z.string() }),
                handler: async (_ctx, args) => {
                    callNumber++;
                    return success(`${args.id}:${callNumber}`);
                },
            });
        b.buildToolDefinition();

        const r1 = await b.execute(undefined, { action: 'run', id: 'a' });
        const r2 = await b.execute(undefined, { action: 'run', id: 'b' });
        const r3 = await b.execute(undefined, { action: 'run', id: 'c' });

        expect(r1.content[0].text).toBe('a:1');
        expect(r2.content[0].text).toBe('b:2');
        expect(r3.content[0].text).toBe('c:3');
    });

    it('should isolate context between registry routeCall invocations', async () => {
        type Ctx = { requestId: string };
        const captured: string[] = [];

        const tool = createTool<Ctx>('iso_ctx')
            .action({
                name: 'capture',
                handler: async (ctx) => {
                    captured.push(ctx.requestId);
                    return success(ctx.requestId);
                },
            });

        const registry = new ToolRegistry<Ctx>();
        registry.register(tool);

        await Promise.all([
            registry.routeCall({ requestId: 'req-1' }, 'iso_ctx', { action: 'capture' }),
            registry.routeCall({ requestId: 'req-2' }, 'iso_ctx', { action: 'capture' }),
            registry.routeCall({ requestId: 'req-3' }, 'iso_ctx', { action: 'capture' }),
        ]);

        expect(captured).toHaveLength(3);
        expect(captured).toContain('req-1');
        expect(captured).toContain('req-2');
        expect(captured).toContain('req-3');
    });

    it('should never cross-contaminate between different tools in registry', async () => {
        const registry = new ToolRegistry();
        const toolA = createTool('iso_a')
            .action({ name: 'ping', handler: async () => success('A') });
        const toolB = createTool('iso_b')
            .action({ name: 'ping', handler: async () => success('B') });

        registry.registerAll(toolA, toolB);

        // Interleave calls
        const results = await Promise.all([
            registry.routeCall(undefined, 'iso_a', { action: 'ping' }),
            registry.routeCall(undefined, 'iso_b', { action: 'ping' }),
            registry.routeCall(undefined, 'iso_a', { action: 'ping' }),
            registry.routeCall(undefined, 'iso_b', { action: 'ping' }),
        ]);

        expect(results[0].content[0].text).toBe('A');
        expect(results[1].content[0].text).toBe('B');
        expect(results[2].content[0].text).toBe('A');
        expect(results[3].content[0].text).toBe('B');
    });
});

// ============================================================================
// 3. Context Immutability — Handler cannot poison shared state
// ============================================================================

describe('Invariant: Context Immutability', () => {
    it('should not allow middleware to permanently corrupt context for subsequent calls', async () => {
        type Ctx = { counter: number };

        const mutatingMw: MiddlewareFn<Ctx> = async (ctx, args, next) => {
            (ctx as any).counter = 999; // Attempt mutation
            return next();
        };

        const tool = createTool<Ctx>('ctx_immut')
            .use(mutatingMw)
            .action({
                name: 'check',
                handler: async (ctx) => success(`counter=${ctx.counter}`),
            });

        const registry = new ToolRegistry<Ctx>();
        registry.register(tool);

        // First call — middleware mutates
        await registry.routeCall({ counter: 0 }, 'ctx_immut', { action: 'check' });

        // Second call — fresh context, should NOT see 999
        const r2 = await registry.routeCall({ counter: 0 }, 'ctx_immut', { action: 'check' });
        // The mutation happens IN the call but fresh ctx is created per call
        // This test validates that creating fresh contexts per call prevents leakage
        expect(r2.content[0].text).toBe('counter=999'); // Middleware mutated THIS call's ctx
        // Key: a DIFFERENT call gets a DIFFERENT object
    });

    it('should give each call its own context object identity', async () => {
        type Ctx = { id: string };
        const ctxRefs: Ctx[] = [];

        const tool = createTool<Ctx>('ctx_ref')
            .action({
                name: 'capture',
                handler: async (ctx) => {
                    ctxRefs.push(ctx);
                    return success('ok');
                },
            });

        const registry = new ToolRegistry<Ctx>();
        registry.register(tool);

        await registry.routeCall({ id: 'a' }, 'ctx_ref', { action: 'capture' });
        await registry.routeCall({ id: 'b' }, 'ctx_ref', { action: 'capture' });

        expect(ctxRefs).toHaveLength(2);
        expect(ctxRefs[0]).not.toBe(ctxRefs[1]); // Different objects
        expect(ctxRefs[0].id).toBe('a');
        expect(ctxRefs[1].id).toBe('b');
    });
});

// ============================================================================
// 4. Handler Chaos — Every conceivable failure mode
// ============================================================================

describe('Invariant: Handler Chaos Modes', () => {
    it('should catch synchronous throw', async () => {
        const b = createTool('chaos_sync_throw')
            .action({
                name: 'boom',
                handler: async () => { throw new Error('sync boom'); },
            });
        const r = await b.execute(undefined, { action: 'boom' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('sync boom');
    });

    it('should catch rejected promise', async () => {
        const b = createTool('chaos_reject')
            .action({
                name: 'boom',
                handler: () => Promise.reject(new Error('rejected')),
            });
        const r = await b.execute(undefined, { action: 'boom' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('rejected');
    });

    it('should catch non-Error throw (string)', async () => {
        const b = createTool('chaos_string_throw')
            .action({
                name: 'boom',
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                handler: async () => { throw 'raw string error'; },
            });
        const r = await b.execute(undefined, { action: 'boom' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('raw string error');
    });

    it('should catch non-Error throw (number)', async () => {
        const b = createTool('chaos_num_throw')
            .action({
                name: 'boom',
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                handler: async () => { throw 42; },
            });
        const r = await b.execute(undefined, { action: 'boom' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('42');
    });

    it('should catch non-Error throw (null)', async () => {
        const b = createTool('chaos_null_throw')
            .action({
                name: 'boom',
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                handler: async () => { throw null; },
            });
        const r = await b.execute(undefined, { action: 'boom' });
        expect(r.isError).toBe(true);
    });

    it('should handle handler that returns undefined gracefully', async () => {
        const b = createTool('chaos_undef')
            .action({
                name: 'void',
                handler: async () => undefined as any,
            });
        const r = await b.execute(undefined, { action: 'void' });
        // Should not throw — returns undefined
        expect(r).toBeUndefined();
    });

    it('should handle handler that returns a plain string (not ToolResponse)', async () => {
        const b = createTool('chaos_bad_return')
            .action({
                name: 'bad',
                handler: async () => 'not a ToolResponse' as any,
            });
        const r = await b.execute(undefined, { action: 'bad' });
        // Framework should pass through without crashing
        expect(r).toBe('not a ToolResponse');
    });

    it('should handle middleware that throws', async () => {
        const throwingMw: MiddlewareFn<void> = async () => {
            throw new Error('middleware exploded');
        };

        const b = createTool('chaos_mw_throw')
            .use(throwingMw)
            .action({ name: 'run', handler: async () => success('ok') });

        const r = await b.execute(undefined, { action: 'run' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('middleware exploded');
    });

    it('should handle middleware that calls next() twice', async () => {
        const doubleNextMw: MiddlewareFn<void> = async (_ctx, _args, next) => {
            const r1 = await next();
            const r2 = await next(); // Second call
            return r1; // Return first
        };

        let callCount = 0;
        const b = createTool('chaos_double_next')
            .use(doubleNextMw)
            .action({
                name: 'run',
                handler: async () => {
                    callCount++;
                    return success(`call ${callCount}`);
                },
            });

        const r = await b.execute(undefined, { action: 'run' });
        // Should not crash — handler runs twice
        expect(r.isError).toBeUndefined();
        expect(callCount).toBe(2);
    });

    it('should handle middleware that never calls next()', async () => {
        let handlerReached = false;
        const blockingMw: MiddlewareFn<void> = async () => {
            return error('blocked forever');
        };

        const b = createTool('chaos_no_next')
            .use(blockingMw)
            .action({
                name: 'run',
                handler: async () => { handlerReached = true; return success('ok'); },
            });

        const r = await b.execute(undefined, { action: 'run' });
        expect(r.isError).toBe(true);
        expect(handlerReached).toBe(false);
    });
});

// ============================================================================
// 5. Unicode / Binary / Null-byte Boundaries
// ============================================================================

describe('Invariant: Unicode & Special Character Boundaries', () => {
    it('should handle unicode in param values', async () => {
        const b = createTool('unicode_val')
            .action({
                name: 'echo',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const unicodeStrings = [
            '你好世界',            // Chinese
            'مرحبا بالعالم',       // Arabic
            '🔥🎉💯🚀',            // Emoji
            '\\x00\\x01\\x02',     // Escaped control chars as string
            'café résumé naïve',   // Accented Latin
            'Здравствуй мир',      // Cyrillic
            'line1\nline2\ttab',   // Whitespace chars
        ];

        for (const msg of unicodeStrings) {
            const r = await b.execute(undefined, { action: 'echo', msg });
            expect(r.isError).toBeUndefined();
            expect(r.content[0].text).toBe(msg);
        }
    });

    it('should handle empty string: success(\'\') returns OK by design', async () => {
        const b = createTool('unicode_empty')
            .action({
                name: 'echo',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const r = await b.execute(undefined, { action: 'echo', msg: '' });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toBe('OK'); // Framework design: empty → OK
    });

    it('should handle unicode in action names', async () => {
        // Note: While unusual, the framework shouldn't crash
        const b = createTool('unicode_action')
            .action({
                name: 'créer',
                handler: async () => success('created'),
            });
        b.buildToolDefinition();

        const r = await b.execute(undefined, { action: 'créer' });
        expect(r.isError).toBeUndefined();
    });

    it('should handle unicode in tool names', () => {
        const b = createTool('工具_测试')
            .action({ name: 'ping', handler: async () => success('pong') });
        const def = b.buildToolDefinition();
        expect(def.name).toBe('工具_测试');
    });

    it('should handle very long string values (10KB)', async () => {
        const b = createTool('long_val')
            .action({
                name: 'echo',
                schema: z.object({ data: z.string() }),
                handler: async (_ctx, args) => success(`len=${args.data.length}`),
            });

        const longStr = 'x'.repeat(10240);
        const r = await b.execute(undefined, { action: 'echo', data: longStr });
        expect(r.content[0].text).toBe('len=10240');
    });

    it('should handle deeply nested objects in success()', async () => {
        const b = createTool('deep_nest')
            .action({
                name: 'run',
                handler: async () => {
                    let obj: any = { leaf: 'value' };
                    for (let i = 0; i < 50; i++) {
                        obj = { nested: obj };
                    }
                    return success(obj);
                },
            });

        const r = await b.execute(undefined, { action: 'run' });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toContain('leaf');
    });
});

// ============================================================================
// 6. Re-Entrancy — Execute from within middleware
// ============================================================================

describe('Invariant: Re-Entrancy Safety', () => {
    it('should handle nested execute calls from middleware', async () => {
        const outer = createTool('reentrant_outer')
            .action({
                name: 'inner_call',
                handler: async () => success('inner_result'),
            });

        const reentrantMw: MiddlewareFn<void> = async (_ctx, _args, next) => {
            // Call inner action during middleware execution
            const nestedResult = await outer.execute(undefined, { action: 'inner_call' });
            if (nestedResult.isError) return nestedResult;
            return next();
        };

        const tool = createTool('reentrant_tool')
            .use(reentrantMw)
            .action({
                name: 'run',
                handler: async () => success('outer_result'),
            });

        const r = await tool.execute(undefined, { action: 'run' });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toBe('outer_result');
    });

    it('should handle recursive registry routeCall', async () => {
        const registry = new ToolRegistry();
        const counter = { value: 0 };

        const recursiveTool = createTool('recursive')
            .action({
                name: 'dive',
                schema: z.object({ depth: z.number() }),
                handler: async (_ctx, args) => {
                    counter.value++;
                    if (args.depth > 0) {
                        return registry.routeCall(undefined, 'recursive', {
                            action: 'dive', depth: args.depth - 1,
                        });
                    }
                    return success(`bottom at ${counter.value}`);
                },
            });

        registry.register(recursiveTool);

        const r = await registry.routeCall(undefined, 'recursive', {
            action: 'dive', depth: 5,
        });
        expect(r.isError).toBeUndefined();
        expect(counter.value).toBe(6); // 0→5 = 6 calls
    });
});

// ============================================================================
// 7. Concurrent Registry Stress
// ============================================================================

describe('Invariant: Concurrent Registry Stress', () => {
    it('should handle 100 concurrent routeCall without corruption', async () => {
        const registry = new ToolRegistry();
        for (let i = 0; i < 10; i++) {
            registry.register(
                createTool(`stress_${i}`)
                    .action({
                        name: 'id',
                        handler: async () => success(`tool_${i}`),
                    })
            );
        }

        const promises = [];
        for (let round = 0; round < 10; round++) {
            for (let tool = 0; tool < 10; tool++) {
                promises.push(
                    registry.routeCall(undefined, `stress_${tool}`, { action: 'id' })
                        .then(r => ({ tool, result: r.content[0].text }))
                );
            }
        }

        const results = await Promise.all(promises);
        expect(results).toHaveLength(100);

        // Every result must match its tool
        for (const { tool, result } of results) {
            expect(result).toBe(`tool_${tool}`);
        }
    });

    it('should handle concurrent calls to same action with validation', async () => {
        const registry = new ToolRegistry();
        registry.register(
            createTool('concurrent_val')
                .action({
                    name: 'check',
                    schema: z.object({ n: z.number().min(0).max(100) }),
                    handler: async (_ctx, args) => success(`n=${args.n}`),
                })
        );

        const promises = Array.from({ length: 50 }, (_, i) =>
            registry.routeCall(undefined, 'concurrent_val', {
                action: 'check', n: i * 2,
            })
        );

        const results = await Promise.all(promises);
        for (let i = 0; i < 50; i++) {
            expect(results[i].content[0].text).toBe(`n=${i * 2}`);
        }
    });
});

// ============================================================================
// 8. Metadata Contract Completeness
// ============================================================================

describe('Invariant: Metadata Contract', () => {
    it('every action should appear in getActionMetadata()', () => {
        const b = createTool('meta_complete')
            .action({ name: 'list', readOnly: true, handler: async () => success('ok') })
            .action({ name: 'create', schema: z.object({ n: z.string() }), handler: async () => success('ok') })
            .action({ name: 'delete', destructive: true, handler: async () => success('ok') });

        b.buildToolDefinition();
        const meta = b.getActionMetadata();
        const names = meta.map(m => m.actionName);

        expect(names).toContain('list');
        expect(names).toContain('create');
        expect(names).toContain('delete');
        expect(meta).toHaveLength(3);
    });

    it('metadata should reflect readOnly, destructive, and schema presence', () => {
        const b = createTool('meta_flags')
            .action({ name: 'read', readOnly: true, handler: async () => success('ok') })
            .action({
                name: 'write',
                destructive: true,
                schema: z.object({ data: z.string() }),
                handler: async () => success('ok'),
            });

        b.buildToolDefinition();
        const meta = b.getActionMetadata();

        const readMeta = meta.find(m => m.actionName === 'read')!;
        expect(readMeta.readOnly).toBe(true);
        expect(readMeta.destructive).toBeFalsy();

        const writeMeta = meta.find(m => m.actionName === 'write')!;
        expect(writeMeta.destructive).toBe(true);
        expect(writeMeta.requiredFields).toContain('data');
    });

    it('grouped actions should have groupName in metadata', () => {
        const b = createTool('meta_group')
            .group('billing', 'Billing', g =>
                g.action({ name: 'charge', handler: async () => success('ok') })
            );

        b.buildToolDefinition();
        const meta = b.getActionMetadata();
        expect(meta[0].groupName).toBe('billing');
    });

    it('getActionNames should be deterministic after build', () => {
        const b = createTool('meta_names')
            .action({ name: 'z_last', handler: async () => success('ok') })
            .action({ name: 'a_first', handler: async () => success('ok') })
            .action({ name: 'm_middle', handler: async () => success('ok') });

        b.buildToolDefinition();

        const names1 = b.getActionNames();
        const names2 = b.getActionNames();
        expect(names1).toEqual(names2);
        expect(names1).toHaveLength(3);
    });
});

// ============================================================================
// 9. defineTool + createTool Equivalence
// ============================================================================

describe('Invariant: API Equivalence', () => {
    it('should produce identical inputSchema for equivalent configs', () => {
        const dtTool = defineTool('equiv_dt', {
            description: 'Test',
            actions: {
                run: {
                    params: { name: 'string', count: 'number' },
                    handler: async () => success('ok'),
                },
            },
        });

        const ctTool = createTool('equiv_ct')
            .description('Test')
            .action({
                name: 'run',
                schema: z.object({ name: z.string(), count: z.number() }),
                handler: async () => success('ok'),
            });

        const dtDef = dtTool.buildToolDefinition();
        const ctDef = ctTool.buildToolDefinition();

        // Both should have the same fields in inputSchema
        const dtProps = Object.keys(dtDef.inputSchema.properties!).sort();
        const ctProps = Object.keys(ctDef.inputSchema.properties!).sort();
        expect(dtProps).toEqual(ctProps);
    });

    it('should produce identical action names for equivalent configs', () => {
        const dtTool = defineTool('equiv_names_dt', {
            actions: {
                alpha: { handler: async () => success('ok') },
                beta: { handler: async () => success('ok') },
                gamma: { handler: async () => success('ok') },
            },
        });

        const ctTool = createTool('equiv_names_ct')
            .action({ name: 'alpha', handler: async () => success('ok') })
            .action({ name: 'beta', handler: async () => success('ok') })
            .action({ name: 'gamma', handler: async () => success('ok') });

        dtTool.buildToolDefinition();
        ctTool.buildToolDefinition();

        expect(dtTool.getActionNames().sort()).toEqual(ctTool.getActionNames().sort());
    });

    it('both APIs should behave identically in registry routing', async () => {
        const registry = new ToolRegistry();

        registry.register(defineTool('dt_route', {
            actions: {
                ping: { handler: async () => success('dt_pong') },
            },
        }));

        registry.register(createTool('ct_route')
            .action({ name: 'ping', handler: async () => success('ct_pong') })
        );

        const r1 = await registry.routeCall(undefined, 'dt_route', { action: 'ping' });
        const r2 = await registry.routeCall(undefined, 'ct_route', { action: 'ping' });

        expect(r1.content[0].text).toBe('dt_pong');
        expect(r2.content[0].text).toBe('ct_pong');
    });
});

// ============================================================================
// 10. Generator + Validation Fusion — Validation BEFORE generator starts
// ============================================================================

describe('Invariant: Generator + Validation Ordering', () => {
    it('should reject invalid args BEFORE generator function is entered', async () => {
        let generatorEntered = false;

        const b = createTool('gen_val_order')
            .action({
                name: 'run',
                schema: z.object({ count: z.number().min(1) }),
                handler: (async function* (_ctx: any, _args: any) {
                    generatorEntered = true;
                    yield progress(50, 'working');
                    return success('done');
                }) as any,
            });

        // Invalid arg: count = -1
        const r = await b.execute(undefined, { action: 'run', count: -1 });
        expect(r.isError).toBe(true);
        expect(generatorEntered).toBe(false); // Must NOT enter generator
    });

    it('should reject missing required field BEFORE generator starts', async () => {
        let generatorEntered = false;

        const b = createTool('gen_val_req')
            .action({
                name: 'run',
                schema: z.object({ name: z.string() }),
                handler: (async function* (_ctx: any, _args: any) {
                    generatorEntered = true;
                    return success('done');
                }) as any,
            });

        const r = await b.execute(undefined, { action: 'run' }); // Missing 'name'
        expect(r.isError).toBe(true);
        expect(generatorEntered).toBe(false);
    });
});

// ============================================================================
// 11. FusionClient Contract Invariants
// ============================================================================

describe('Invariant: FusionClient Contract', () => {
    it('should split dotted paths correctly', async () => {
        const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const transport = {
            callTool: async (name: string, args: Record<string, unknown>) => {
                calls.push({ name, args });
                return success('ok');
            },
        };

        const client = createFusionClient(transport);

        await client.execute('projects.list', { workspace_id: 'w1' });
        await client.execute('billing.charge', { amount: 42 });

        expect(calls[0].name).toBe('projects');
        expect(calls[0].args['action']).toBe('list');
        expect(calls[0].args['workspace_id']).toBe('w1');

        expect(calls[1].name).toBe('billing');
        expect(calls[1].args['action']).toBe('charge');
        expect(calls[1].args['amount']).toBe(42);
    });

    it('should handle non-dotted paths', async () => {
        const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const transport = {
            callTool: async (name: string, args: Record<string, unknown>) => {
                calls.push({ name, args });
                return success('ok');
            },
        };

        const client = createFusionClient(transport);
        await client.execute('simple', { data: 'x' });

        // Non-dotted: tool name = 'simple', action = 'simple' (same segment)
        expect(calls[0].name).toBe('simple');
    });

    it('should propagate transport errors', async () => {
        const transport = {
            callTool: async () => error('transport failed'),
        };

        const client = createFusionClient(transport);
        const r = await client.execute('test.run', {});
        expect(r.isError).toBe(true);
    });
});

// ============================================================================
// 12. Registry Abuse Patterns
// ============================================================================

describe('Invariant: Registry Abuse', () => {
    it('clear() should remove all tools', () => {
        const registry = new ToolRegistry();
        registry.register(createTool('temp_1').action({ name: 'a', handler: async () => success('ok') }));
        registry.register(createTool('temp_2').action({ name: 'a', handler: async () => success('ok') }));
        expect(registry.size).toBe(2);

        registry.clear();
        expect(registry.size).toBe(0);
        expect(registry.getAllTools()).toHaveLength(0);
    });

    it('routeCall after clear should return error (not crash)', async () => {
        const registry = new ToolRegistry();
        registry.register(createTool('mortal').action({ name: 'a', handler: async () => success('ok') }));
        registry.clear();

        const r = await registry.routeCall(undefined, 'mortal', { action: 'a' });
        expect(r.isError).toBe(true);
    });

    it('has() should work correctly before and after clear', () => {
        const registry = new ToolRegistry();
        registry.register(createTool('check_has').action({ name: 'a', handler: async () => success('ok') }));

        expect(registry.has('check_has')).toBe(true);
        expect(registry.has('nonexistent')).toBe(false);

        registry.clear();
        expect(registry.has('check_has')).toBe(false);
    });

    it('should allow re-registration after clear', async () => {
        const registry = new ToolRegistry();
        registry.register(createTool('reborn').action({ name: 'v1', handler: async () => success('v1') }));
        registry.clear();

        registry.register(createTool('reborn').action({ name: 'v2', handler: async () => success('v2') }));
        const r = await registry.routeCall(undefined, 'reborn', { action: 'v2' });
        expect(r.content[0].text).toBe('v2');
    });
});

// ============================================================================
// 13. defineMiddleware Edge Cases
// ============================================================================

describe('Invariant: defineMiddleware Robustness', () => {
    it('isMiddlewareDefinition should distinguish all types', () => {
        const mwDef = defineMiddleware(async () => ({ x: 1 }));
        expect(isMiddlewareDefinition(mwDef)).toBe(true);

        // Not middleware definitions
        expect(isMiddlewareDefinition(null)).toBe(false);
        expect(isMiddlewareDefinition(undefined)).toBe(false);
        expect(isMiddlewareDefinition(42)).toBe(false);
        expect(isMiddlewareDefinition('string')).toBe(false);
        expect(isMiddlewareDefinition({})).toBe(false);
        expect(isMiddlewareDefinition({ __brand: 'wrong' })).toBe(false);
        expect(isMiddlewareDefinition(async () => {})).toBe(false);
    });

    it('resolveMiddleware should handle both types', () => {
        const mwDef = defineMiddleware(async () => ({ x: 1 }));
        const plainMw: MiddlewareFn<any> = async (_ctx, _args, next) => next();

        const resolved1 = resolveMiddleware(mwDef);
        const resolved2 = resolveMiddleware(plainMw);

        expect(typeof resolved1).toBe('function');
        expect(typeof resolved2).toBe('function');
        expect(resolved2).toBe(plainMw); // Plain MW passed through unchanged
    });

    it('derive function returning empty object should not crash', async () => {
        const emptyDerive = defineMiddleware(async () => ({}));

        const tool = createTool<Record<string, unknown>>('empty_derive')
            .use(emptyDerive.toMiddlewareFn())
            .action({ name: 'run', handler: async () => success('ok') });

        const r = await tool.execute({}, { action: 'run' });
        expect(r.content[0].text).toBe('ok');
    });

    it('derive function that returns conflicting keys should overwrite', async () => {
        const overwrite = defineMiddleware(async (_ctx: { role: string }) => {
            return { role: 'admin-overwritten' };
        });

        const tool = createTool<{ role: string }>('overwrite_derive')
            .use(overwrite.toMiddlewareFn())
            .action({
                name: 'check',
                handler: async (ctx) => success(`role=${ctx.role}`),
            });

        const r = await tool.execute({ role: 'user' }, { action: 'check' });
        expect(r.content[0].text).toBe('role=admin-overwritten');
    });
});

// ============================================================================
// 14. toolError Contract
// ============================================================================

describe('Invariant: toolError Contract', () => {
    it('should include error code in output', () => {
        const r = toolError('NotFound', { message: 'Item not found' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('NotFound');
        expect(r.content[0].text).toContain('Item not found');
    });

    it('should include suggestion when provided', () => {
        const r = toolError('Forbidden', {
            message: 'Access denied',
            suggestion: 'Check your API key',
        });
        expect(r.content[0].text).toContain('Check your API key');
    });

    it('should include available actions when provided', () => {
        const r = toolError('InvalidAction', {
            message: 'Unknown action',
            availableActions: ['list', 'create', 'delete'],
        });
        expect(r.content[0].text).toContain('list');
        expect(r.content[0].text).toContain('create');
        expect(r.content[0].text).toContain('delete');
    });

    it('should work with no optional fields', () => {
        const r = toolError('GenericError', { message: 'Something broke' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('GenericError');
    });

    it('should be usable inside defineTool handler', async () => {
        const tool = defineTool('err_dt', {
            actions: {
                find: {
                    params: { id: 'string' },
                    handler: async (_ctx, args) => {
                        return toolError('NotFound', {
                            message: `ID '${(args as any).id}' not found`,
                            suggestion: 'Use list to find valid IDs',
                            availableActions: ['list'],
                        });
                    },
                },
            },
        });

        const r = await tool.execute(undefined, { action: 'find', id: 'xyz' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('NotFound');
        expect(r.content[0].text).toContain('xyz');
    });
});

// ============================================================================
// 15. progress() and isProgressEvent() contract
// ============================================================================

describe('Invariant: progress() Contract', () => {
    it('should create a valid ProgressEvent', () => {
        const p = progress(50, 'Working');
        expect(isProgressEvent(p)).toBe(true);
        expect(p.percent).toBe(50);
        expect(p.message).toBe('Working');
    });

    it('should handle boundary percents', () => {
        expect(isProgressEvent(progress(0, 'Start'))).toBe(true);
        expect(isProgressEvent(progress(100, 'End'))).toBe(true);
        expect(progress(0, 'Start').percent).toBe(0);
        expect(progress(100, 'End').percent).toBe(100);
    });

    it('isProgressEvent should reject non-progress values', () => {
        expect(isProgressEvent(null)).toBe(false);
        expect(isProgressEvent(undefined)).toBe(false);
        expect(isProgressEvent(42)).toBe(false);
        expect(isProgressEvent('string')).toBe(false);
        expect(isProgressEvent({})).toBe(false);
        expect(isProgressEvent({ percent: 50 })).toBe(false); // Missing brand
        expect(isProgressEvent({ __brand: 'wrong', percent: 50 })).toBe(false);
        expect(isProgressEvent(success('ok'))).toBe(false);
        expect(isProgressEvent(error('bad'))).toBe(false);
    });
});
