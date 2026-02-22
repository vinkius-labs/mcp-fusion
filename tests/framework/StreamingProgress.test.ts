import { describe, it, expect } from 'vitest';
import { progress, isProgressEvent } from '../../src/framework/execution/ProgressHelper.js';
import { success, error } from '../../src/framework/response.js';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/framework/builder/defineTool.js';

// ============================================================================
// ProgressHelper — Unit Tests
// ============================================================================

describe('progress()', () => {
    it('should create a ProgressEvent with brand, percent, and message', () => {
        const event = progress(50, 'Halfway there');
        expect(event.__brand).toBe('ProgressEvent');
        expect(event.percent).toBe(50);
        expect(event.message).toBe('Halfway there');
    });

    it('should handle boundary values 0% and 100%', () => {
        const start = progress(0, 'Starting');
        const end = progress(100, 'Done');
        expect(start.percent).toBe(0);
        expect(end.percent).toBe(100);
    });

    it('should handle negative percent without crashing', () => {
        const event = progress(-10, 'Inverted');
        expect(event.percent).toBe(-10);
        expect(event.__brand).toBe('ProgressEvent');
    });

    it('should handle percent above 100 without crashing', () => {
        const event = progress(999, 'Overflow');
        expect(event.percent).toBe(999);
    });

    it('should handle fractional percent', () => {
        const event = progress(33.33, 'One-third');
        expect(event.percent).toBeCloseTo(33.33);
    });

    it('should handle empty message string', () => {
        const event = progress(50, '');
        expect(event.message).toBe('');
    });

    it('should handle very long message strings', () => {
        const longMsg = 'A'.repeat(10000);
        const event = progress(42, longMsg);
        expect(event.message).toBe(longMsg);
    });

    it('should produce readonly fields (immutability)', () => {
        const event = progress(50, 'Test');
        // TypeScript marks fields as readonly — but we can verify the object shape
        expect(Object.keys(event).sort()).toEqual(['__brand', 'message', 'percent']);
    });

    it('should produce distinct objects (no memoization)', () => {
        const a = progress(50, 'A');
        const b = progress(50, 'A');
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});

// ============================================================================
// isProgressEvent — Type Guard
// ============================================================================

describe('isProgressEvent()', () => {
    it('should return true for a valid ProgressEvent', () => {
        expect(isProgressEvent(progress(10, 'test'))).toBe(true);
    });

    it('should return false for null', () => {
        expect(isProgressEvent(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(isProgressEvent(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
        expect(isProgressEvent('string')).toBe(false);
        expect(isProgressEvent(42)).toBe(false);
        expect(isProgressEvent(true)).toBe(false);
        expect(isProgressEvent(Symbol())).toBe(false);
    });

    it('should return false for plain objects without __brand', () => {
        expect(isProgressEvent({ percent: 50, message: 'test' })).toBe(false);
    });

    it('should return false for objects with wrong __brand', () => {
        expect(isProgressEvent({ __brand: 'Other' })).toBe(false);
        expect(isProgressEvent({ __brand: 'GeneratorResultEnvelope' })).toBe(false);
        expect(isProgressEvent({ __brand: 'MiddlewareDefinition' })).toBe(false);
    });

    it('should return false for arrays', () => {
        expect(isProgressEvent([])).toBe(false);
        expect(isProgressEvent([progress(10, 'test')])).toBe(false);
    });

    it('should return false for functions', () => {
        expect(isProgressEvent(() => {})).toBe(false);
    });

    it('should return true for structurally valid manual ProgressEvent', () => {
        expect(isProgressEvent({ __brand: 'ProgressEvent', percent: 0, message: '' })).toBe(true);
    });
});

// ============================================================================
// Streaming Progress — Generator Handler Integration (createTool)
// ============================================================================

describe('Streaming Progress (generator handlers)', () => {
    it('should drain generator and return final ToolResponse', async () => {
        const tool = createTool('gen_tool').action({
            name: 'deploy',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(10, 'Cloning...');
                yield progress(50, 'Building...');
                yield progress(90, 'Deploying...');
                return success('Deployed successfully');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'deploy' });
        expect(result.content[0].text).toBe('Deployed successfully');
        expect(result.isError).toBeUndefined();
    });

    it('should work with zero yields (immediate return)', async () => {
        const tool = createTool('no_yield').action({
            name: 'fast',
            handler: (async function* (_ctx: any, _args: any) {
                return success('instant');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'fast' });
        expect(result.content[0].text).toBe('instant');
    });

    it('should handle many yields without degradation', async () => {
        const tool = createTool('many_yields').action({
            name: 'bulk',
            handler: (async function* (_ctx: any, _args: any) {
                for (let i = 0; i < 1000; i++) {
                    yield progress(i / 10, `Step ${i}`);
                }
                return success('all done');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'bulk' });
        expect(result.content[0].text).toBe('all done');
    });

    it('should handle non-ProgressEvent yields gracefully', async () => {
        const tool = createTool('mixed').action({
            name: 'run',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(10, 'Real progress');
                yield 'some random string';
                yield 42;
                yield { random: 'object' };
                return success('survived');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'run' });
        expect(result.content[0].text).toBe('survived');
    });

    it('should propagate handler errors mid-stream', async () => {
        const tool = createTool('gen_error').action({
            name: 'fail',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(10, 'Starting...');
                yield progress(50, 'Halfway...');
                throw new Error('Crash at 50%');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'fail' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Crash at 50%');
    });

    it('should return error ToolResponse from generator', async () => {
        const tool = createTool('gen_err_resp').action({
            name: 'check',
            handler: (async function* (_ctx: any, _args: any) {
                yield progress(30, 'Checking...');
                return error('Validation failed');
            }) as any,
        });

        const result = await tool.execute(undefined, { action: 'check' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Validation failed');
    });

    it('should work with regular (non-generator) handlers unchanged', async () => {
        const tool = createTool('regular').action({
            name: 'ping',
            handler: async () => success('pong'),
        });

        const result = await tool.execute(undefined, { action: 'ping' });
        expect(result.content[0].text).toBe('pong');
    });

    it('should coexist: generator + regular actions in same tool', async () => {
        const tool = createTool('mixed_tool')
            .action({
                name: 'sync_action',
                handler: async () => success('sync ok'),
            })
            .action({
                name: 'gen_action',
                handler: (async function* (_ctx: any, _args: any) {
                    yield progress(50, 'Working...');
                    return success('gen ok');
                }) as any,
            });

        const r1 = await tool.execute(undefined, { action: 'sync_action' });
        expect(r1.content[0].text).toBe('sync ok');

        const r2 = await tool.execute(undefined, { action: 'gen_action' });
        expect(r2.content[0].text).toBe('gen ok');
    });
});

// ============================================================================
// Streaming Progress — Middleware Interaction
// ============================================================================

describe('Streaming Progress with Middleware', () => {
    it('should execute middleware before generator handler', async () => {
        const calls: string[] = [];

        const tool = createTool('mw_gen')
            .use(async (_ctx, _args, next) => {
                calls.push('mw:before');
                const result = await next();
                calls.push('mw:after');
                return result;
            })
            .action({
                name: 'run',
                handler: (async function* (_ctx: any, _args: any) {
                    calls.push('handler:start');
                    yield progress(50, 'Working...');
                    calls.push('handler:end');
                    return success('done');
                }) as any,
            });

        const result = await tool.execute(undefined, { action: 'run' });
        expect(result.content[0].text).toBe('done');
        expect(calls).toContain('mw:before');
        expect(calls).toContain('handler:start');
    });

    it('should allow middleware to short-circuit before generator runs', async () => {
        const tool = createTool<Record<string, unknown>>('auth_gen')
            .use(async (ctx, _args, next) => {
                if (!ctx['token']) return error('Unauthorized');
                return next();
            })
            .action({
                name: 'deploy',
                handler: (async function* (_ctx: any, _args: any) {
                    yield progress(100, 'Should not reach');
                    return success('deployed');
                }) as any,
            });

        const fail = await tool.execute({}, { action: 'deploy' });
        expect(fail.isError).toBe(true);
        expect(fail.content[0].text).toBe('Unauthorized');

        const ok = await tool.execute({ token: 'valid' }, { action: 'deploy' });
        expect(ok.content[0].text).toBe('deployed');
    });

    it('should work with multiple stacked middlewares and generator', async () => {
        const order: string[] = [];

        const tool = createTool('stacked_gen')
            .use(async (_ctx, _args, next) => { order.push('mw1'); return next(); })
            .use(async (_ctx, _args, next) => { order.push('mw2'); return next(); })
            .action({
                name: 'go',
                handler: (async function* (_ctx: any, _args: any) {
                    order.push('handler');
                    yield progress(100, 'done');
                    return success('ok');
                }) as any,
            });

        await tool.execute(undefined, { action: 'go' });
        expect(order).toEqual(['mw1', 'mw2', 'handler']);
    });
});

// ============================================================================
// Streaming Progress — defineTool Integration
// ============================================================================

describe('Streaming Progress with defineTool()', () => {
    it('should support async generator handlers in defineTool', async () => {
        const tool = defineTool('gen_dt', {
            actions: {
                process: {
                    handler: (async function* (_ctx: any, _args: any) {
                        yield progress(25, 'Step 1');
                        yield progress(75, 'Step 2');
                        return success('All steps complete');
                    }) as any,
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'process' });
        expect(result.content[0].text).toBe('All steps complete');
    });

    it('should propagate generator errors in defineTool', async () => {
        const tool = defineTool('gen_dt_err', {
            actions: {
                crash: {
                    handler: (async function* (_ctx: any, _args: any) {
                        yield progress(10, 'Starting...');
                        throw new Error('💥 Boom');
                    }) as any,
                },
            },
        });

        const result = await tool.execute(undefined, { action: 'crash' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Boom');
    });

    it('should work with defineTool middleware + generator', async () => {
        const calls: string[] = [];

        const tool = defineTool('dt_mw_gen', {
            middleware: [
                async (_ctx, _args, next) => { calls.push('mw'); return next(); },
            ],
            actions: {
                run: {
                    handler: (async function* (_ctx: any, _args: any) {
                        calls.push('gen');
                        yield progress(100, 'done');
                        return success('ok');
                    }) as any,
                },
            },
        });

        await tool.execute(undefined, { action: 'run' });
        expect(calls).toEqual(['mw', 'gen']);
    });
});
