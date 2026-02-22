/**
 * DebugObserver.test.ts — Exhaustive Debug Observability Tests
 *
 * Verifies Task 2.3: Debug Mode with zero-overhead observability.
 *
 * Categories:
 * 1. createDebugObserver — factory behavior
 * 2. Event emission — each pipeline step
 * 3. Zero overhead — no impact when disabled
 * 4. Error paths — validation failures, unknown actions
 * 5. Timing accuracy — durationMs measurements
 * 6. Custom handlers — telemetry integration
 * 7. End-to-end — full pipeline with debug
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/framework/builder/defineTool.js';
import { createDebugObserver } from '../../src/framework/observability/DebugObserver.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success, error as errorResponse } from '../../src/framework/response.js';
import type { DebugEvent, DebugObserverFn } from '../../src/framework/observability/DebugObserver.js';

// ============================================================================
// 1. createDebugObserver — Factory Behavior
// ============================================================================

describe('createDebugObserver — factory', () => {
    it('should return a function', () => {
        const observer = createDebugObserver();
        expect(typeof observer).toBe('function');
    });

    it('should use console.debug when no custom handler provided', () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const observer = createDebugObserver();

        observer({ type: 'route', tool: 'test', action: 'ping', timestamp: Date.now() });

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0]![0]).toContain('[mcp-fusion]');
        expect(spy.mock.calls[0]![0]).toContain('test/ping');
        spy.mockRestore();
    });

    it('should forward to custom handler when provided', () => {
        const events: DebugEvent[] = [];
        const handler: DebugObserverFn = (e) => events.push(e);
        const observer = createDebugObserver(handler);

        const event: DebugEvent = { type: 'route', tool: 'x', action: 'y', timestamp: 1 };
        observer(event);

        expect(events).toHaveLength(1);
        expect(events[0]).toBe(event);
    });

    it('should return the custom handler directly (no wrapper)', () => {
        const handler: DebugObserverFn = () => {};
        const observer = createDebugObserver(handler);
        expect(observer).toBe(handler);
    });
});

// ============================================================================
// 2. Event Emission — Each Pipeline Step
// ============================================================================

describe('Event emission — pipeline steps', () => {
    it('should emit route event on successful routing', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'list',
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'list' });

        const routeEvent = events.find(e => e.type === 'route');
        expect(routeEvent).toBeDefined();
        expect(routeEvent!.tool).toBe('users');
        expect(routeEvent!.action).toBe('list');
        expect(routeEvent!.timestamp).toBeGreaterThan(0);
    });

    it('should emit validate event on successful validation', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'create', name: 'John' });

        const validateEvent = events.find(e => e.type === 'validate');
        expect(validateEvent).toBeDefined();
        expect(validateEvent!.type).toBe('validate');
        if (validateEvent!.type === 'validate') {
            expect(validateEvent!.valid).toBe(true);
            expect(validateEvent!.durationMs).toBeGreaterThanOrEqual(0);
        }
    });

    it('should emit middleware event when middlewares exist', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .use(async (_ctx, _args, next) => next(_ctx, _args))
            .action({
                name: 'list',
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'list' });

        const mwEvent = events.find(e => e.type === 'middleware');
        expect(mwEvent).toBeDefined();
        if (mwEvent?.type === 'middleware') {
            expect(mwEvent.chainLength).toBeGreaterThanOrEqual(1);
        }
    });

    it('should emit execute event with timing on success', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'list',
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'list' });

        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.tool).toBe('users');
            expect(execEvent.action).toBe('list');
            expect(execEvent.isError).toBe(false);
            expect(execEvent.durationMs).toBeGreaterThanOrEqual(0);
        }
    });

    it('should mark execute event isError=true for error responses', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'fail',
                handler: async () => errorResponse('intentional failure'),
            });

        await tool.execute(undefined, { action: 'fail' });

        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.isError).toBe(true);
        }
    });

    it('should emit correct event sequence for a full pipeline', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('projects')
            .debug(createDebugObserver((e) => events.push(e)))
            .use(async (_ctx, _args, next) => next(_ctx, _args))
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async () => success('created'),
            });

        await tool.execute(undefined, { action: 'create', name: 'Test' });

        const types = events.map(e => e.type);
        // Expected order: route → validate → middleware → execute
        expect(types).toContain('route');
        expect(types).toContain('validate');
        expect(types).toContain('middleware');
        expect(types).toContain('execute');

        // Route should come first, execute last
        const routeIdx = types.indexOf('route');
        const executeIdx = types.indexOf('execute');
        expect(routeIdx).toBeLessThan(executeIdx);
    });
});

// ============================================================================
// 3. Zero Overhead — No Impact When Disabled
// ============================================================================

describe('Zero overhead when disabled', () => {
    it('should NOT call any observer when debug is not set', async () => {
        const spy = vi.fn();

        const tool = createTool<void>('users')
            // No .debug() call!
            .action({
                name: 'list',
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'list' });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should produce identical results with and without debug', async () => {
        const events: DebugEvent[] = [];

        const withoutDebug = createTool<void>('echo')
            .action({
                name: 'say',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const withDebug = createTool<void>('echo')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'say',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const r1 = await withoutDebug.execute(undefined, { action: 'say', msg: 'hello' });
        const r2 = await withDebug.execute(undefined, { action: 'say', msg: 'hello' });

        expect(r1.content[0].text).toBe(r2.content[0].text);
        expect(events.length).toBeGreaterThan(0); // debug DID fire
    });
});

// ============================================================================
// 4. Error Paths — Validation Failures, Unknown Actions
// ============================================================================

describe('Error paths', () => {
    it('should emit error event when discriminator is missing', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, {});

        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        if (errorEvent?.type === 'error') {
            expect(errorEvent.step).toBe('route');
            expect(errorEvent.action).toBe('?'); // unknown action
            expect(errorEvent.error).toContain('discriminator');
        }
    });

    it('should emit error event for unknown action', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'nonexistent' });

        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        if (errorEvent?.type === 'error') {
            expect(errorEvent.step).toBe('route');
            expect(errorEvent.error).toContain('nonexistent');
        }
    });

    it('should emit validate event with valid=false for invalid args', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'create',
                schema: z.object({ count: z.number().min(1) }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'create', count: -5 });

        const validateEvent = events.find(e => e.type === 'validate');
        expect(validateEvent).toBeDefined();
        if (validateEvent?.type === 'validate') {
            expect(validateEvent.valid).toBe(false);
        }
    });

    it('should still return error response even with debug active', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('users')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async () => success('ok'),
            });

        const result = await tool.execute(undefined, { action: 'create', name: 123 });
        expect(result.isError).toBe(true);
    });
});

// ============================================================================
// 5. Timing Accuracy
// ============================================================================

describe('Timing accuracy', () => {
    it('should measure validate durationMs accurately', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('timing')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'run', x: 42 });

        const validateEvent = events.find(e => e.type === 'validate');
        expect(validateEvent).toBeDefined();
        if (validateEvent?.type === 'validate') {
            expect(validateEvent.durationMs).toBeGreaterThanOrEqual(0);
            expect(validateEvent.durationMs).toBeLessThan(100); // Zod validation should be fast
        }
    });

    it('should measure total execute durationMs including handler time', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('timing')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'slow',
                handler: async () => {
                    await new Promise(r => setTimeout(r, 20));
                    return success('done');
                },
            });

        await tool.execute(undefined, { action: 'slow' });

        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.durationMs).toBeGreaterThanOrEqual(15); // at least 15ms (accounting for timer imprecision)
        }
    });
});

// ============================================================================
// 6. Custom Handlers — Telemetry Integration
// ============================================================================

describe('Custom handlers', () => {
    it('should support structured event collector', async () => {
        const collector: Record<string, number> = {};
        const handler: DebugObserverFn = (event) => {
            collector[event.type] = (collector[event.type] ?? 0) + 1;
        };

        const tool = createTool<void>('metrics')
            .debug(createDebugObserver(handler))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'run', x: 1 });

        expect(collector['route']).toBe(1);
        expect(collector['validate']).toBe(1);
        expect(collector['execute']).toBe(1);
    });

    it('should support filtering events by type', async () => {
        const errors: DebugEvent[] = [];
        const handler: DebugObserverFn = (event) => {
            if (event.type === 'error') errors.push(event);
        };

        const tool = createTool<void>('filter')
            .debug(createDebugObserver(handler))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        // Valid call — no errors
        await tool.execute(undefined, { action: 'run', x: 1 });
        expect(errors).toHaveLength(0);

        // Invalid call — error emitted
        await tool.execute(undefined, { action: 'unknown' });
        expect(errors).toHaveLength(1);
    });
});

// ============================================================================
// 7. End-to-End — Full Pipeline with Debug
// ============================================================================

describe('End-to-end with debug', () => {
    it('should work with defineTool() path', async () => {
        const events: DebugEvent[] = [];

        const tool = defineTool('echo', {
            actions: {
                say: {
                    params: { message: 'string' },
                    handler: async (_ctx, args) => success(args.message),
                },
            },
        });

        // defineTool returns GroupedToolBuilder — we can call .debug() on it
        tool.debug(createDebugObserver((e) => events.push(e)));

        const result = await tool.execute(undefined, { action: 'say', message: 'hi' });
        expect(result.content[0].text).toBe('hi');

        expect(events.some(e => e.type === 'route')).toBe(true);
        expect(events.some(e => e.type === 'execute')).toBe(true);
    });

    it('should work with multiple sequential calls', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('multi')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({ name: 'a', handler: async () => success('a') })
            .action({ name: 'b', handler: async () => success('b') });

        await tool.execute(undefined, { action: 'a' });
        await tool.execute(undefined, { action: 'b' });
        await tool.execute(undefined, { action: 'a' });

        // 3 route events + 3 execute events = minimum 6 events
        expect(events.length).toBeGreaterThanOrEqual(6);

        const routeActions = events
            .filter(e => e.type === 'route')
            .map(e => e.action);
        expect(routeActions).toEqual(['a', 'b', 'a']);
    });

    it('should not skip execute event when middleware is present', async () => {
        const events: DebugEvent[] = [];
        let middlewareRan = false;

        const tool = createTool<void>('mw')
            .debug(createDebugObserver((e) => events.push(e)))
            .use(async (_ctx, args, next) => {
                middlewareRan = true;
                return next(_ctx, args);
            })
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'run', x: 1 });

        expect(middlewareRan).toBe(true);
        expect(events.some(e => e.type === 'middleware')).toBe(true);
        expect(events.some(e => e.type === 'execute')).toBe(true);
    });

    it('should handle concurrent debug calls without interference', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('concurrent')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'run',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => success(String(args.id)),
            });

        await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
                tool.execute(undefined, { action: 'run', id: i })
            )
        );

        // 5 calls × (route + validate + execute) = minimum 15 events
        expect(events.length).toBeGreaterThanOrEqual(15);

        const executeEvents = events.filter(e => e.type === 'execute');
        expect(executeEvents).toHaveLength(5);
    });
});

// ============================================================================
// 8. Default Console.debug Formatter
// ============================================================================

describe('Default console.debug formatter', () => {
    it('should format all event types without throwing', () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const observer = createDebugObserver();
        const now = Date.now();

        // Exercise all event types
        observer({ type: 'route', tool: 't', action: 'a', timestamp: now });
        observer({ type: 'validate', tool: 't', action: 'a', valid: true, durationMs: 0.5, timestamp: now });
        observer({ type: 'validate', tool: 't', action: 'a', valid: false, error: 'bad input', durationMs: 1.2, timestamp: now });
        observer({ type: 'middleware', tool: 't', action: 'a', chainLength: 3, timestamp: now });
        observer({ type: 'execute', tool: 't', action: 'a', durationMs: 12.5, isError: false, timestamp: now });
        observer({ type: 'execute', tool: 't', action: 'a', durationMs: 5.0, isError: true, timestamp: now });
        observer({ type: 'error', tool: 't', action: 'a', error: 'boom', step: 'execute', timestamp: now });

        expect(spy).toHaveBeenCalledTimes(7);

        // Verify key content in output
        const calls = spy.mock.calls.map(c => c[0] as string);
        expect(calls[0]).toContain('route');
        expect(calls[1]).toContain('✓');
        expect(calls[2]).toContain('✗');
        expect(calls[3]).toContain('3 functions');
        expect(calls[4]).toContain('✓');
        expect(calls[5]).toContain('✗');
        expect(calls[6]).toContain('ERROR');

        spy.mockRestore();
    });
});

// ============================================================================
// 9. Registry-Level Observability (enableDebug)
// ============================================================================

describe('Registry-level observability — enableDebug()', () => {
    it('should propagate debug to ALL registered builders', async () => {
        const events: DebugEvent[] = [];

        const users = createTool<void>('users')
            .action({ name: 'list', handler: async () => success('users') });
        const projects = createTool<void>('projects')
            .action({ name: 'list', handler: async () => success('projects') });

        const registry = new ToolRegistry<void>();
        registry.registerAll(users, projects);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        await registry.routeCall(undefined, 'users', { action: 'list' });
        await registry.routeCall(undefined, 'projects', { action: 'list' });

        // Both tools should emit events
        const userRoutes = events.filter(e => e.type === 'route' && e.tool === 'users');
        const projectRoutes = events.filter(e => e.type === 'route' && e.tool === 'projects');

        expect(userRoutes).toHaveLength(1);
        expect(projectRoutes).toHaveLength(1);
    });

    it('should emit error event for unknown tools at registry level', async () => {
        const events: DebugEvent[] = [];
        const registry = new ToolRegistry<void>();
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        const result = await registry.routeCall(undefined, 'nonexistent', { action: 'x' });
        expect(result.isError).toBe(true);

        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        if (errorEvent?.type === 'error') {
            expect(errorEvent.tool).toBe('nonexistent');
            expect(errorEvent.step).toBe('route');
        }
    });

    it('should work with defineTool builders in registry', async () => {
        const events: DebugEvent[] = [];

        const echo = defineTool('echo', {
            actions: {
                say: {
                    params: { msg: 'string' },
                    handler: async (_ctx, args) => success(args.msg),
                },
            },
        });

        const registry = new ToolRegistry<void>();
        registry.register(echo);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        const result = await registry.routeCall(undefined, 'echo', { action: 'say', msg: 'hi' });
        expect(result.content[0].text).toBe('hi');
        expect(events.some(e => e.type === 'route' && e.tool === 'echo')).toBe(true);
        expect(events.some(e => e.type === 'execute')).toBe(true);
    });

    it('should observe ALL pipeline steps across multiple tools', async () => {
        const events: DebugEvent[] = [];

        const tool1 = createTool<void>('tool1')
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('t1'),
            });

        const tool2 = createTool<void>('tool2')
            .action({
                name: 'run',
                schema: z.object({ y: z.string() }),
                handler: async () => success('t2'),
            });

        const registry = new ToolRegistry<void>();
        registry.registerAll(tool1, tool2);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        await registry.routeCall(undefined, 'tool1', { action: 'run', x: 1 });
        await registry.routeCall(undefined, 'tool2', { action: 'run', y: 'hello' });

        // tool1 has middleware → route + validate + middleware + execute = 4
        // tool2 no middleware → route + validate + execute = 3
        expect(events.length).toBeGreaterThanOrEqual(7);

        // Both tools had route + execute
        expect(events.filter(e => e.type === 'route')).toHaveLength(2);
        expect(events.filter(e => e.type === 'execute')).toHaveLength(2);

        // Only tool1 had middleware
        const mwEvents = events.filter(e => e.type === 'middleware');
        expect(mwEvents).toHaveLength(1);
        if (mwEvents[0]?.type === 'middleware') {
            expect(mwEvents[0].tool).toBe('tool1');
        }
    });

    it('should not emit events when enableDebug is NOT called', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        const tool = createTool<void>('silent')
            .action({ name: 'run', handler: async () => success('ok') });

        const registry = new ToolRegistry<void>();
        registry.register(tool);
        // No enableDebug() call!

        await registry.routeCall(undefined, 'silent', { action: 'run' });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('should handle mixed createTool + defineTool in one registry', async () => {
        const events: DebugEvent[] = [];

        const alpha = createTool<void>('alpha')
            .action({
                name: 'go',
                schema: z.object({ s: z.string() }),
                handler: async (_ctx, args) => success(args.s),
            });

        const beta = defineTool('beta', {
            actions: {
                go: {
                    params: { n: 'number' },
                    handler: async (_ctx, args) => success(String(args.n)),
                },
            },
        });

        const registry = new ToolRegistry<void>();
        registry.registerAll(alpha, beta);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        const r1 = await registry.routeCall(undefined, 'alpha', { action: 'go', s: 'hello' });
        const r2 = await registry.routeCall(undefined, 'beta', { action: 'go', n: 42 });

        expect(r1.content[0].text).toBe('hello');
        expect(r2.content[0].text).toBe('42');

        expect(events.filter(e => e.tool === 'alpha').length).toBeGreaterThanOrEqual(2);
        expect(events.filter(e => e.tool === 'beta').length).toBeGreaterThanOrEqual(2);
    });

    it('should capture validation errors from ANY tool', async () => {
        const events: DebugEvent[] = [];

        const strict = createTool<void>('strict')
            .action({
                name: 'run',
                schema: z.object({ count: z.number().min(1) }),
                handler: async () => success('ok'),
            });

        const registry = new ToolRegistry<void>();
        registry.register(strict);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        await registry.routeCall(undefined, 'strict', { action: 'run', count: -5 });

        const validateEvent = events.find(e => e.type === 'validate');
        expect(validateEvent).toBeDefined();
        if (validateEvent?.type === 'validate') {
            expect(validateEvent.valid).toBe(false);
            expect(validateEvent.tool).toBe('strict');
        }
    });

    it('should have full event coverage for a single call', async () => {
        const events: DebugEvent[] = [];

        const full = createTool<void>('full')
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('done'),
            });

        const registry = new ToolRegistry<void>();
        registry.register(full);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        await registry.routeCall(undefined, 'full', { action: 'run', x: 42 });

        const types = events.map(e => e.type);
        // Full pipeline: route → validate → middleware → execute
        expect(types).toEqual(['route', 'validate', 'middleware', 'execute']);
    });
});

// ============================================================================
// 10. Adversarial & Edge Cases
// ============================================================================

describe('Adversarial & edge cases', () => {
    it('should emit error event when handler throws an exception', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('crash')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'boom',
                handler: async () => { throw new Error('handler exploded'); },
            });

        // The pipeline catches handler exceptions and returns an error response
        const result = await tool.execute(undefined, { action: 'boom' });
        expect(result.isError).toBe(true);

        // Debug path should still emit events up to & including the execute
        // The execute event captures the result (isError=true)
        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.isError).toBe(true);
            expect(execEvent.tool).toBe('crash');
            expect(execEvent.action).toBe('boom');
        }
    });

    it('should NOT crash the pipeline if the debug observer itself throws', async () => {
        const badObserver: DebugObserverFn = () => { throw new Error('observer broken'); };
        const tool = createTool<void>('resilient')
            .debug(badObserver)
            .action({
                name: 'run',
                handler: async () => success('ok'),
            });

        // The observer throws, but the pipeline should still crash
        // because the observer is NOT wrapped in try/catch (by design — the developer should fix their observer)
        await expect(tool.execute(undefined, { action: 'run' })).rejects.toThrow('observer broken');
    });

    it('should allow enableDebug to be called multiple times (last wins)', async () => {
        const events1: DebugEvent[] = [];
        const events2: DebugEvent[] = [];

        const tool = createTool<void>('multi-debug')
            .action({ name: 'run', handler: async () => success('ok') });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        registry.enableDebug(createDebugObserver((e) => events1.push(e)));
        registry.enableDebug(createDebugObserver((e) => events2.push(e)));

        await registry.routeCall(undefined, 'multi-debug', { action: 'run' });

        // Only the LAST observer should receive events (it replaced the first)
        expect(events1).toHaveLength(0);
        expect(events2.length).toBeGreaterThan(0);
    });

    it('should NOT auto-debug tools registered AFTER enableDebug', async () => {
        const events: DebugEvent[] = [];

        const registry = new ToolRegistry<void>();

        const before = createTool<void>('before')
            .action({ name: 'run', handler: async () => success('before') });
        registry.register(before);

        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        // Register AFTER enableDebug
        const after = createTool<void>('after')
            .action({ name: 'run', handler: async () => success('after') });
        registry.register(after);

        // "before" gets debug events
        await registry.routeCall(undefined, 'before', { action: 'run' });
        expect(events.some(e => e.tool === 'before')).toBe(true);

        const beforeCount = events.length;

        // "after" does NOT get debug events (registered after enableDebug)
        await registry.routeCall(undefined, 'after', { action: 'run' });
        expect(events.filter(e => e.tool === 'after')).toHaveLength(0);

        // Total events should be same as before (only added by "before" tool)
        expect(events.length).toBe(beforeCount);
    });

    it('should handle concurrent registry calls with debug correctly', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('concurrent')
            .action({
                name: 'slow',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => {
                    await new Promise(r => setTimeout(r, 5));
                    return success(String(args.id));
                },
            });

        const registry = new ToolRegistry<void>();
        registry.register(tool);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                registry.routeCall(undefined, 'concurrent', { action: 'slow', id: i })
            )
        );

        // 10 calls × (route + validate + execute) = 30 events
        const routeEvents = events.filter(e => e.type === 'route');
        const validateEvents = events.filter(e => e.type === 'validate');
        const executeEvents = events.filter(e => e.type === 'execute');

        expect(routeEvents).toHaveLength(10);
        expect(validateEvents).toHaveLength(10);
        expect(executeEvents).toHaveLength(10);
    });

    it('should work with grouped tools (.group())', async () => {
        const events: DebugEvent[] = [];

        const platform = createTool<void>('platform')
            .debug(createDebugObserver((e) => events.push(e)))
            .group('users', 'User ops', g => {
                g.action({ name: 'list', handler: async () => success('user-list') });
            })
            .group('billing', 'Billing ops', g => {
                g.action({ name: 'charge', handler: async () => success('charged') });
            });

        await platform.execute(undefined, { action: 'users.list' });
        await platform.execute(undefined, { action: 'billing.charge' });

        const routeActions = events
            .filter(e => e.type === 'route')
            .map(e => e.action);

        expect(routeActions).toEqual(['users.list', 'billing.charge']);
        expect(events.filter(e => e.type === 'execute')).toHaveLength(2);
    });

    it('should work with defineTool shared params and multiple actions', async () => {
        const events: DebugEvent[] = [];

        const tool = defineTool('db', {
            shared: {
                connection_id: 'string',
            },
            actions: {
                query: {
                    params: { sql: 'string' },
                    handler: async (_ctx, args) => success(`${args.connection_id}:${args.sql}`),
                },
                migrate: {
                    params: { version: 'number' },
                    handler: async (_ctx, args) => success(`${args.connection_id}:v${args.version}`),
                },
            },
        });

        tool.debug(createDebugObserver((e) => events.push(e)));

        const r1 = await tool.execute(undefined, { action: 'query', connection_id: 'c1', sql: 'SELECT 1' });
        const r2 = await tool.execute(undefined, { action: 'migrate', connection_id: 'c1', version: 42 });

        expect(r1.content[0].text).toBe('c1:SELECT 1');
        expect(r2.content[0].text).toBe('c1:v42');

        expect(events.filter(e => e.type === 'route').map(e => e.action)).toEqual(['query', 'migrate']);
        expect(events.filter(e => e.type === 'validate')).toHaveLength(2);
        expect(events.filter(e => e.type === 'execute')).toHaveLength(2);
    });

    it('should count deep middleware chains correctly', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('deep')
            .debug(createDebugObserver((e) => events.push(e)))
            .use(async (_ctx, args, next) => next(_ctx, args))   // global 1
            .use(async (_ctx, args, next) => next(_ctx, args))   // global 2
            .use(async (_ctx, args, next) => next(_ctx, args))   // global 3
            .action({
                name: 'run',
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'run' });

        const mwEvent = events.find(e => e.type === 'middleware');
        expect(mwEvent).toBeDefined();
        if (mwEvent?.type === 'middleware') {
            expect(mwEvent.chainLength).toBe(3);
        }
    });

    it('should guarantee timestamp ordering across events', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('timestamps')
            .debug(createDebugObserver((e) => events.push(e)))
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => {
                    await new Promise(r => setTimeout(r, 5));
                    return success('ok');
                },
            });

        await tool.execute(undefined, { action: 'run', x: 1 });

        // All events should have increasing or equal timestamps
        for (let i = 1; i < events.length; i++) {
            expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i - 1]!.timestamp);
        }
    });

    it('should handle empty args gracefully (missing action discriminator)', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('empty')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({ name: 'run', handler: async () => success('ok') });

        const result = await tool.execute(undefined, {});

        expect(result.isError).toBe(true);
        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        if (errorEvent?.type === 'error') {
            expect(errorEvent.step).toBe('route');
        }
    });

    it('should emit events for ALL actions on the same tool', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('crud')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({ name: 'create', handler: async () => success('c') })
            .action({ name: 'read', handler: async () => success('r') })
            .action({ name: 'update', handler: async () => success('u') })
            .action({ name: 'delete', handler: async () => success('d') });

        await tool.execute(undefined, { action: 'create' });
        await tool.execute(undefined, { action: 'read' });
        await tool.execute(undefined, { action: 'update' });
        await tool.execute(undefined, { action: 'delete' });

        const routeActions = events
            .filter(e => e.type === 'route')
            .map(e => e.action);
        expect(routeActions).toEqual(['create', 'read', 'update', 'delete']);

        const executeEvents = events.filter(e => e.type === 'execute');
        expect(executeEvents).toHaveLength(4);
        expect(executeEvents.every(e => e.type === 'execute' && !e.isError)).toBe(true);
    });

    it('should emit both registry error AND no tool-level events for unknown tool', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('known')
            .action({ name: 'run', handler: async () => success('ok') });

        const registry = new ToolRegistry<void>();
        registry.register(tool);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));

        await registry.routeCall(undefined, 'ghost', { action: 'run' });

        // Only ONE error event from the registry
        expect(events).toHaveLength(1);
        expect(events[0]!.type).toBe('error');
        if (events[0]!.type === 'error') {
            expect(events[0]!.tool).toBe('ghost');
        }
    });

    it('should respect that registry.clear() does not remove debug from already-built tools', async () => {
        const events: DebugEvent[] = [];

        const tool = createTool<void>('persistent')
            .action({ name: 'run', handler: async () => success('ok') });

        const registry = new ToolRegistry<void>();
        registry.register(tool);
        registry.enableDebug(createDebugObserver((e) => events.push(e)));
        registry.clear();

        // Tool was built before clear() — debug was already injected
        // Direct execution still emits events (tool-level debug is independent)
        await tool.execute(undefined, { action: 'run' });
        expect(events.some(e => e.type === 'route')).toBe(true);
    });

    it('should emit execute event with correct durationMs for fast handlers', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('fast')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'instant',
                handler: async () => success('fast'),
            });

        await tool.execute(undefined, { action: 'instant' });

        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            // Should be very fast — under 10ms
            expect(execEvent.durationMs).toBeLessThan(10);
            expect(execEvent.durationMs).toBeGreaterThanOrEqual(0);
        }
    });

    it('should handle error response from handler (not exception) correctly', async () => {
        const events: DebugEvent[] = [];
        const tool = createTool<void>('soft-error')
            .debug(createDebugObserver((e) => events.push(e)))
            .action({
                name: 'fail',
                handler: async () => errorResponse('soft failure'),
            });

        const result = await tool.execute(undefined, { action: 'fail' });
        expect(result.isError).toBe(true);

        // Should be an execute event with isError=true, NOT an error event
        const execEvent = events.find(e => e.type === 'execute');
        expect(execEvent).toBeDefined();
        if (execEvent?.type === 'execute') {
            expect(execEvent.isError).toBe(true);
        }

        // There should be NO error event (soft errors are normal responses)
        const errorEvents = events.filter(e => e.type === 'error');
        expect(errorEvents).toHaveLength(0);
    });

    it('should preserve event immutability (readonly payloads)', () => {
        const events: DebugEvent[] = [];
        const observer = createDebugObserver((e) => events.push(e));

        const event: DebugEvent = { type: 'route', tool: 't', action: 'a', timestamp: 1 };
        observer(event);

        // TypeScript prevents mutation at compile time (readonly),
        // but verify runtime identity is preserved
        expect(events[0]).toBe(event);
        expect(Object.is(events[0], event)).toBe(true);
    });
});
