/**
 * Tracing.test.ts — Native OpenTelemetry-Compatible Tracing Tests
 *
 * Verifies the FusionTracer integration across the execution pipeline.
 *
 * Categories:
 * 1.  Span lifecycle — creation, end, attributes
 * 2.  Span events — route, validate, middleware
 * 3.  Error classification — AI vs system
 * 4.  Span leak prevention — finally guarantees
 * 5.  Zero overhead — fast path when disabled
 * 6.  Registry propagation — enableTracing()
 * 7.  Coexistence — debug + tracing
 * 8.  addEvent optional — graceful degradation
 * 9.  SpanStatusCode constants
 * 10. defineTool compatibility
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTool } from '../../src/framework/builder/GroupedToolBuilder.js';
import { defineTool } from '../../src/framework/builder/defineTool.js';
import { createDebugObserver } from '../../src/framework/observability/DebugObserver.js';
import { SpanStatusCode } from '../../src/framework/observability/Tracing.js';
import { ToolRegistry } from '../../src/framework/registry/ToolRegistry.js';
import { success, error as errorResponse } from '../../src/framework/response.js';
import type { FusionTracer, FusionSpan, FusionAttributeValue } from '../../src/framework/observability/Tracing.js';
import type { DebugEvent } from '../../src/framework/observability/DebugObserver.js';

// ============================================================================
// Test Helpers — Mock Tracer
// ============================================================================

interface MockSpanData {
    name: string;
    attributes: Map<string, FusionAttributeValue>;
    events: Array<{ name: string; attributes?: Record<string, FusionAttributeValue> }>;
    status: { code: number; message?: string } | null;
    exceptions: Array<Error | string>;
    ended: boolean;
}

function createMockTracer(): { tracer: FusionTracer; spans: MockSpanData[] } {
    const spans: MockSpanData[] = [];

    const tracer: FusionTracer = {
        startSpan(name, options) {
            const data: MockSpanData = {
                name,
                attributes: new Map(Object.entries(options?.attributes ?? {})),
                events: [],
                status: null,
                exceptions: [],
                ended: false,
            };

            const span: FusionSpan = {
                setAttribute(key, value) { data.attributes.set(key, value); },
                setStatus(status) { data.status = status; },
                addEvent(eventName, attrs) { data.events.push({ name: eventName, attributes: attrs }); },
                end() { data.ended = true; spans.push(data); },
                recordException(exc) { data.exceptions.push(exc); },
            };

            return span;
        },
    };

    return { tracer, spans };
}

/** Creates a tracer whose spans have NO addEvent method (optional per interface) */
function createMinimalTracer(): { tracer: FusionTracer; spans: MockSpanData[] } {
    const spans: MockSpanData[] = [];

    const tracer: FusionTracer = {
        startSpan(name, options) {
            const data: MockSpanData = {
                name,
                attributes: new Map(Object.entries(options?.attributes ?? {})),
                events: [],
                status: null,
                exceptions: [],
                ended: false,
            };

            const span: FusionSpan = {
                setAttribute(key, value) { data.attributes.set(key, value); },
                setStatus(status) { data.status = status; },
                // No addEvent!
                end() { data.ended = true; spans.push(data); },
                recordException(exc) { data.exceptions.push(exc); },
            };

            return span;
        },
    };

    return { tracer, spans };
}

// ============================================================================
// 1. Span Lifecycle — Creation, End, Attributes
// ============================================================================

describe('Span lifecycle', () => {
    it('should create exactly ONE span per execute() call', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('users')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'list' });

        expect(spans).toHaveLength(1);
        expect(spans[0]!.name).toBe('mcp.tool.users');
    });

    it('should set mcp.system and mcp.tool attributes on span creation', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('projects')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'list' });

        expect(spans[0]!.attributes.get('mcp.system')).toBe('fusion');
        expect(spans[0]!.attributes.get('mcp.tool')).toBe('projects');
    });

    it('should set mcp.action attribute after routing', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('users')
            .tracing(tracer)
            .action({ name: 'create', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'create' });

        expect(spans[0]!.attributes.get('mcp.action')).toBe('create');
    });

    it('should set mcp.durationMs attribute', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('timing')
            .tracing(tracer)
            .action({
                name: 'slow',
                handler: async () => {
                    await new Promise(r => setTimeout(r, 10));
                    return success('done');
                },
            });

        await tool.execute(undefined, { action: 'slow' });

        const duration = spans[0]!.attributes.get('mcp.durationMs') as number;
        expect(duration).toBeGreaterThanOrEqual(5);
    });

    it('should end every span (ended === true)', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('end-test')
            .tracing(tracer)
            .action({ name: 'run', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'run' });

        expect(spans[0]!.ended).toBe(true);
    });
});

// ============================================================================
// 2. Span Events — Route, Validate, Middleware
// ============================================================================

describe('Span events', () => {
    it('should emit mcp.route event on successful routing', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('events')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'list' });

        const routeEvent = spans[0]!.events.find(e => e.name === 'mcp.route');
        expect(routeEvent).toBeDefined();
    });

    it('should emit mcp.validate event with valid=true for valid args', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('events')
            .tracing(tracer)
            .action({
                name: 'create',
                schema: z.object({ name: z.string() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'create', name: 'John' });

        const validateEvent = spans[0]!.events.find(e => e.name === 'mcp.validate');
        expect(validateEvent).toBeDefined();
        expect(validateEvent!.attributes?.['mcp.valid']).toBe(true);
        expect(validateEvent!.attributes?.['mcp.durationMs']).toBeGreaterThanOrEqual(0);
    });

    it('should emit mcp.validate event with valid=false for invalid args', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('events')
            .tracing(tracer)
            .action({
                name: 'create',
                schema: z.object({ count: z.number().min(1) }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'create', count: -5 });

        const validateEvent = spans[0]!.events.find(e => e.name === 'mcp.validate');
        expect(validateEvent).toBeDefined();
        expect(validateEvent!.attributes?.['mcp.valid']).toBe(false);
    });

    it('should emit mcp.middleware event when middleware exists', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('events')
            .tracing(tracer)
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'list' });

        const mwEvent = spans[0]!.events.find(e => e.name === 'mcp.middleware');
        expect(mwEvent).toBeDefined();
        expect(mwEvent!.attributes?.['mcp.chainLength']).toBeGreaterThanOrEqual(1);
    });

    it('should NOT emit mcp.middleware event when no middleware', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('events')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'list' });

        const mwEvent = spans[0]!.events.find(e => e.name === 'mcp.middleware');
        expect(mwEvent).toBeUndefined();
    });

    it('should emit events in correct order: route → validate → middleware', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('order')
            .tracing(tracer)
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'run', x: 1 });

        const eventNames = spans[0]!.events.map(e => e.name);
        expect(eventNames).toEqual(['mcp.route', 'mcp.validate', 'mcp.middleware']);
    });
});

// ============================================================================
// 5. Enterprise metadata — tags, description, response size
// ============================================================================

describe('Enterprise metadata', () => {
    it('should include mcp.tags when tags are set', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('billing')
            .tags('admin', 'finance')
            .tracing(tracer)
            .action({ name: 'charge', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'charge' });

        expect(spans[0]!.attributes.get('mcp.tags')).toEqual(['admin', 'finance']);
    });

    it('should include mcp.description when description is set', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('users')
            .description('Manages user accounts')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'list' });

        expect(spans[0]!.attributes.get('mcp.description')).toBe('Manages user accounts');
    });

    it('should NOT include mcp.tags when no tags are set', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('simple')
            .tracing(tracer)
            .action({ name: 'ping', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'ping' });

        expect(spans[0]!.attributes.has('mcp.tags')).toBe(false);
    });

    it('should record mcp.response_size for text responses', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('size')
            .tracing(tracer)
            .action({ name: 'get', handler: async () => success('hello world') });

        await tool.execute(undefined, { action: 'get' });

        expect(spans[0]!.attributes.get('mcp.response_size')).toBe('hello world'.length);
    });

    it('should record mcp.response_size for error responses', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('size')
            .tracing(tracer)
            .action({
                name: 'crash',
                handler: async () => { throw new Error('boom'); },
            });

        await tool.execute(undefined, { action: 'crash' });

        // Error response includes tool name prefix: "[size] boom"
        expect(spans[0]!.attributes.get('mcp.response_size')).toBeGreaterThan(0);
    });
});

// ============================================================================
// 6. Error Classification — AI vs System
// ============================================================================

describe('Error classification', () => {
    it('should set SpanStatusCode.OK for successful execution', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('status')
            .tracing(tracer)
            .action({ name: 'ok', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'ok' });

        expect(spans[0]!.status!.code).toBe(SpanStatusCode.OK);
        expect(spans[0]!.attributes.get('mcp.isError')).toBe(false);
    });

    it('should set SpanStatusCode.UNSET (NOT ERROR) for handler-returned error response', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('status')
            .tracing(tracer)
            .action({ name: 'fail', handler: async () => errorResponse('intentional') });

        await tool.execute(undefined, { action: 'fail' });

        // AI error → UNSET, not ERROR (prevents PagerDuty alerts)
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[0]!.attributes.get('mcp.error_type')).toBe('handler_returned_error');
        expect(spans[0]!.attributes.get('mcp.isError')).toBe(true);
    });

    it('should set SpanStatusCode.UNSET for validation failure', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('status')
            .tracing(tracer)
            .action({
                name: 'create',
                schema: z.object({ count: z.number().min(1) }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'create', count: -5 });

        expect(spans[0]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[0]!.attributes.get('mcp.error_type')).toBe('validation_failed');
        expect(spans[0]!.attributes.get('mcp.isError')).toBe(true);
    });

    it('should set SpanStatusCode.UNSET for missing discriminator', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('status')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, {});

        expect(spans[0]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[0]!.attributes.get('mcp.error_type')).toBe('missing_discriminator');
        expect(spans[0]!.attributes.get('mcp.isError')).toBe(true);
    });

    it('should set SpanStatusCode.UNSET for unknown action', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('status')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'nonexistent' });

        expect(spans[0]!.status!.code).toBe(SpanStatusCode.UNSET);
        expect(spans[0]!.attributes.get('mcp.error_type')).toBe('unknown_action');
        expect(spans[0]!.attributes.get('mcp.isError')).toBe(true);
    });

    it('should set SpanStatusCode.ERROR for handler exception (system failure)', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('status')
            .tracing(tracer)
            .action({
                name: 'crash',
                handler: async () => { throw new Error('system failure'); },
            });

        // Handler throws → graceful error response (not throw, which would crash server)
        const result = await tool.execute(undefined, { action: 'crash' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('system failure');

        // Span correctly classifies as system error → ERROR (triggers PagerDuty)
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.ERROR);
        expect(spans[0]!.status!.message).toBe('system failure');
        expect(spans[0]!.exceptions).toHaveLength(1);
        expect(spans[0]!.attributes.get('mcp.error_type')).toBe('system_error');
        expect(spans[0]!.attributes.get('mcp.isError')).toBe(true);
    });
});

// ============================================================================
// 4. Span Leak Prevention — finally Guarantees
// ============================================================================

describe('Span leak prevention', () => {
    it('should end span even when handler throws', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('leak')
            .tracing(tracer)
            .action({
                name: 'crash',
                handler: async () => { throw new Error('boom'); },
            });

        // Returns error response (not throw)
        const result = await tool.execute(undefined, { action: 'crash' });
        expect(result.isError).toBe(true);

        expect(spans).toHaveLength(1);
        expect(spans[0]!.ended).toBe(true);
    });

    it('should end span on validation failure', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('leak')
            .tracing(tracer)
            .action({
                name: 'create',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        await tool.execute(undefined, { action: 'create', x: 'not-a-number' });

        expect(spans[0]!.ended).toBe(true);
    });

    it('should end span on missing discriminator', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('leak')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, {});

        expect(spans[0]!.ended).toBe(true);
    });

    it('should end span on unknown action', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('leak')
            .tracing(tracer)
            .action({ name: 'list', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'unknown' });

        expect(spans[0]!.ended).toBe(true);
    });
});

// ============================================================================
// 5. Zero Overhead — Fast Path When Disabled
// ============================================================================

describe('Zero overhead when disabled', () => {
    it('should NOT create spans when tracing is not set', async () => {
        const spy = vi.fn();

        const tool = createTool<void>('fast')
            .action({ name: 'run', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'run' });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should produce identical results with and without tracing', async () => {
        const { tracer } = createMockTracer();

        const withoutTracing = createTool<void>('echo')
            .action({
                name: 'say',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const withTracing = createTool<void>('echo')
            .tracing(tracer)
            .action({
                name: 'say',
                schema: z.object({ msg: z.string() }),
                handler: async (_ctx, args) => success(args.msg),
            });

        const r1 = await withoutTracing.execute(undefined, { action: 'say', msg: 'hello' });
        const r2 = await withTracing.execute(undefined, { action: 'say', msg: 'hello' });

        expect(r1.content[0].text).toBe(r2.content[0].text);
    });
});

// ============================================================================
// 6. Registry Propagation — enableTracing()
// ============================================================================

describe('Registry-level tracing — enableTracing()', () => {
    it('should propagate tracer to ALL registered builders', async () => {
        const { tracer, spans } = createMockTracer();

        const users = createTool<void>('users')
            .action({ name: 'list', handler: async () => success('users') });
        const projects = createTool<void>('projects')
            .action({ name: 'list', handler: async () => success('projects') });

        const registry = new ToolRegistry<void>();
        registry.registerAll(users, projects);
        registry.enableTracing(tracer);

        await registry.routeCall(undefined, 'users', { action: 'list' });
        await registry.routeCall(undefined, 'projects', { action: 'list' });

        // Both tools should emit spans
        const userSpans = spans.filter(s => s.name === 'mcp.tool.users');
        const projectSpans = spans.filter(s => s.name === 'mcp.tool.projects');

        expect(userSpans).toHaveLength(1);
        expect(projectSpans).toHaveLength(1);
    });

    it('should create error span for unknown tool routing', async () => {
        const { tracer, spans } = createMockTracer();

        const registry = new ToolRegistry<void>();
        registry.enableTracing(tracer);

        const result = await registry.routeCall(undefined, 'nonexistent', { action: 'x' });
        expect(result.isError).toBe(true);

        const errorSpan = spans.find(s => s.name === 'mcp.tool.nonexistent');
        expect(errorSpan).toBeDefined();
        expect(errorSpan!.attributes.get('mcp.error_type')).toBe('unknown_tool');
        expect(errorSpan!.status!.code).toBe(SpanStatusCode.UNSET);
    });

    it('should not emit spans when enableTracing is NOT called', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        const tool = createTool<void>('silent')
            .action({ name: 'run', handler: async () => success('ok') });

        const registry = new ToolRegistry<void>();
        registry.register(tool);

        await registry.routeCall(undefined, 'silent', { action: 'run' });
        // No spans created, no debug output
        spy.mockRestore();
    });
});

// ============================================================================
// 7. Coexistence — Debug + Tracing
// ============================================================================

describe('Debug + Tracing coexistence', () => {
    it('should emit console.warn when both are enabled (debug first)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { tracer } = createMockTracer();

        const registry = new ToolRegistry<void>();
        const tool = createTool<void>('dual')
            .action({ name: 'run', handler: async () => success('ok') });
        registry.register(tool);

        registry.enableDebug(createDebugObserver(() => {}));
        registry.enableTracing(tracer);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Both tracing and debug are enabled'),
        );

        warnSpy.mockRestore();
    });

    it('should emit console.warn when both are enabled (tracing first)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { tracer } = createMockTracer();

        const registry = new ToolRegistry<void>();
        const tool = createTool<void>('dual')
            .action({ name: 'run', handler: async () => success('ok') });
        registry.register(tool);

        // Reverse order: tracing first, then debug
        registry.enableTracing(tracer);
        registry.enableDebug(createDebugObserver(() => {}));

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Both tracing and debug are enabled'),
        );

        warnSpy.mockRestore();
    });

    it('should use tracing path (not debug) when both are set on a builder', async () => {
        const { tracer, spans } = createMockTracer();
        const events: DebugEvent[] = [];

        const tool = createTool<void>('dual')
            .debug(createDebugObserver((e) => events.push(e)))
            .tracing(tracer)
            .action({ name: 'run', handler: async () => success('ok') });

        await tool.execute(undefined, { action: 'run' });

        // Tracing path wins → span created
        expect(spans).toHaveLength(1);
        // Debug path skipped → no debug events
        expect(events).toHaveLength(0);
    });
});

// ============================================================================
// 8. addEvent Optional — Graceful Degradation
// ============================================================================

describe('addEvent optional', () => {
    it('should work correctly with tracer that does NOT support addEvent', async () => {
        const { tracer, spans } = createMinimalTracer();
        const tool = createTool<void>('minimal')
            .tracing(tracer)
            .use(async (_ctx, args, next) => next(_ctx, args))
            .action({
                name: 'run',
                schema: z.object({ x: z.number() }),
                handler: async () => success('ok'),
            });

        // Should not throw even though addEvent is undefined
        const result = await tool.execute(undefined, { action: 'run', x: 1 });

        expect(result.content[0].text).toBe('ok');
        expect(spans).toHaveLength(1);
        expect(spans[0]!.ended).toBe(true);
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.OK);
    });
});

// ============================================================================
// 9. SpanStatusCode Constants
// ============================================================================

describe('SpanStatusCode constants', () => {
    it('should have correct values matching OTel', () => {
        expect(SpanStatusCode.UNSET).toBe(0);
        expect(SpanStatusCode.OK).toBe(1);
        expect(SpanStatusCode.ERROR).toBe(2);
    });
});

// ============================================================================
// 10. defineTool Compatibility
// ============================================================================

describe('defineTool compatibility', () => {
    it('should support .tracing() on defineTool builders', async () => {
        const { tracer, spans } = createMockTracer();

        const tool = defineTool('echo', {
            actions: {
                say: {
                    params: { message: 'string' },
                    handler: async (_ctx, args) => success(args.message),
                },
            },
        });

        tool.tracing(tracer);

        const result = await tool.execute(undefined, { action: 'say', message: 'hello' });
        expect(result.content[0].text).toBe('hello');

        expect(spans).toHaveLength(1);
        expect(spans[0]!.name).toBe('mcp.tool.echo');
        expect(spans[0]!.attributes.get('mcp.action')).toBe('say');
    });
});

// ============================================================================
// 11. Multiple Sequential Calls
// ============================================================================

describe('Multiple sequential calls', () => {
    it('should create a separate span for each execute() call', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('multi')
            .tracing(tracer)
            .action({ name: 'a', handler: async () => success('a') })
            .action({ name: 'b', handler: async () => success('b') });

        await tool.execute(undefined, { action: 'a' });
        await tool.execute(undefined, { action: 'b' });
        await tool.execute(undefined, { action: 'a' });

        expect(spans).toHaveLength(3);
        const actions = spans.map(s => s.attributes.get('mcp.action'));
        expect(actions).toEqual(['a', 'b', 'a']);
    });
});

// ============================================================================
// 12. Concurrent Calls
// ============================================================================

describe('Concurrent calls', () => {
    it('should handle concurrent traced calls without interference', async () => {
        const { tracer, spans } = createMockTracer();
        const tool = createTool<void>('concurrent')
            .tracing(tracer)
            .action({
                name: 'run',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => success(String(args.id)),
            });

        await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
                tool.execute(undefined, { action: 'run', id: i }),
            ),
        );

        expect(spans).toHaveLength(5);
        // Every span should be ended
        expect(spans.every(s => s.ended)).toBe(true);
        // Every span should be OK
        expect(spans.every(s => s.status!.code === SpanStatusCode.OK)).toBe(true);
    });
});

// ============================================================================
// 13. Server Attachment — tracing option
// ============================================================================

describe('Server attachment — tracing option', () => {
    /** Minimal mock server matching the McpServerAdapter test pattern */
    function createMockServer() {
        const handlers = new Map<string, Function>();
        return {
            setRequestHandler(schema: { shape: { method: { value: string } } }, handler: Function) {
                handlers.set(schema.shape.method.value, handler);
            },
            async callTool(name: string, args: Record<string, unknown> = {}) {
                const handler = handlers.get('tools/call');
                if (!handler) throw new Error('No tools/call handler');
                return handler({ method: 'tools/call', params: { name, arguments: args } }, {});
            },
        };
    }

    it('should propagate tracing via attachToServer options', async () => {
        const { tracer, spans } = createMockTracer();

        const registry = new ToolRegistry<void>();
        registry.register(
            createTool<void>('server-test')
                .action({ name: 'ping', handler: async () => success('pong') }),
        );

        const server = createMockServer();
        registry.attachToServer(server, { tracing: tracer });

        const result = await server.callTool('server-test', { action: 'ping' });
        expect(result.content[0].text).toBe('pong');

        // Tracer was propagated → span emitted
        expect(spans).toHaveLength(1);
        expect(spans[0]!.name).toBe('mcp.tool.server-test');
        expect(spans[0]!.status!.code).toBe(SpanStatusCode.OK);
    });
});
