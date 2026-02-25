import { describe, it, expect, vi } from 'vitest';
import {
    createFusionClient,
    FusionClientError,
    type FusionTransport,
    type ClientMiddleware,
} from '../../src/client/FusionClient.js';
import { success, error, toolError } from '../../src/core/response.js';
import { type ToolResponse } from '../../src/core/response.js';

// ============================================================================
// Mock Transport Helper
// ============================================================================

function createMockTransport(): FusionTransport & {
    calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    return {
        calls,
        async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
            calls.push({ name, args });
            return success(`${name}:${JSON.stringify(args)}`);
        },
    };
}

// ============================================================================
// Client Middleware Pipeline
// ============================================================================

describe('FusionClient — Client Middleware', () => {
    it('should execute middleware in registration order', async () => {
        const order: string[] = [];

        const mw1: ClientMiddleware = async (action, args, next) => {
            order.push('mw1-before');
            const result = await next(action, args);
            order.push('mw1-after');
            return result;
        };

        const mw2: ClientMiddleware = async (action, args, next) => {
            order.push('mw2-before');
            const result = await next(action, args);
            order.push('mw2-after');
            return result;
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [mw1, mw2] });

        await client.execute('tool.action', {});

        expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
    });

    it('should allow middleware to modify args', async () => {
        const authMiddleware: ClientMiddleware = async (action, args, next) => {
            return next(action, { ...args, _token: 'secret123' });
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [authMiddleware] });

        await client.execute('tool.action', { name: 'test' });

        expect(transport.calls[0].args).toEqual({
            action: 'action',
            name: 'test',
            _token: 'secret123',
        });
    });

    it('should allow middleware to short-circuit', async () => {
        const blockMiddleware: ClientMiddleware = async () => {
            return error('Blocked by client middleware');
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [blockMiddleware] });

        const result = await client.execute('tool.action', {});

        expect(result.isError).toBe(true);
        expect(transport.calls).toHaveLength(0); // never reached transport
    });

    it('should work with no middleware', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [] });

        await client.execute('tool.action', {});

        expect(transport.calls).toHaveLength(1);
    });

    it('should propagate middleware exceptions', async () => {
        const brokenMw: ClientMiddleware = async () => {
            throw new Error('Middleware kaboom');
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [brokenMw] });

        await expect(client.execute('tool.action', {})).rejects.toThrow('Middleware kaboom');
        expect(transport.calls).toHaveLength(0);
    });

    it('should compile middleware chain once (O(1) per call)', async () => {
        let constructionCount = 0;

        const mw: ClientMiddleware = async (action, args, next) => {
            constructionCount++;
            return next(action, args);
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [mw] });

        await client.execute('a.one', {});
        await client.execute('b.two', {});
        await client.execute('c.three', {});

        // Each call invokes the middleware once
        expect(constructionCount).toBe(3);
        expect(transport.calls).toHaveLength(3);
    });
});

// ============================================================================
// throwOnError + Structured Error Parsing
// ============================================================================

describe('FusionClient — throwOnError', () => {
    it('should throw FusionClientError for error responses', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return toolError('NOT_FOUND', {
                    message: 'Invoice inv_123 not found.',
                    suggestion: 'Call billing.list first.',
                    availableActions: ['billing.list'],
                });
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });

        try {
            await client.execute('billing.get', { id: 'inv_123' });
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(FusionClientError);
            const e = err as FusionClientError;
            expect(e.code).toBe('NOT_FOUND');
            expect(e.message).toBe('Invoice inv_123 not found.');
            expect(e.recovery).toBe('Call billing.list first.');
            expect(e.availableActions).toContain('billing.list');
            expect(e.severity).toBe('error');
            expect(e.raw.isError).toBe(true);
        }
    });

    it('should NOT throw for success responses', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return success('All good');
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });
        const result = await client.execute('tool.action', {});

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('All good');
    });

    it('should parse basic error() responses without code', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return error('Generic error');
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });

        try {
            await client.execute('tool.action', {});
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(FusionClientError);
            const e = err as FusionClientError;
            expect(e.message).toBe('Generic error');
        }
    });

    it('should NOT throw when throwOnError is false', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return toolError('FAIL', { message: 'Error' });
            },
        };

        const client = createFusionClient(transport); // default: throwOnError=false
        const result = await client.execute('tool.action', {});

        expect(result.isError).toBe(true); // returned, not thrown
    });

    it('should throw plain FusionClientError for non-XML error text', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return {
                    content: [{ type: 'text' as const, text: 'Something went wrong' }],
                    isError: true,
                };
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });

        try {
            await client.execute('tool.action', {});
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(FusionClientError);
            const e = err as FusionClientError;
            expect(e.message).toBe('Something went wrong');
            expect(e.code).toBe('UNKNOWN');
        }
    });

    it('should correctly unescape XML entities in parsed error fields', async () => {
        const transport: FusionTransport = {
            async callTool() {
                return toolError('VALIDATION_ERROR', {
                    message: 'Value must be < 100 & > 0',
                    suggestion: 'Use a value between 1 & 99',
                    availableActions: ['items.validate'],
                });
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });

        try {
            await client.execute('tool.action', {});
            expect.fail('Should have thrown');
        } catch (err) {
            const e = err as FusionClientError;
            expect(e.message).toBe('Value must be < 100 & > 0');
            expect(e.recovery).toBe('Use a value between 1 & 99');
        }
    });
});

// ============================================================================
// executeBatch
// ============================================================================

describe('FusionClient — executeBatch', () => {
    it('should execute multiple calls in parallel', async () => {
        const startTimes: number[] = [];

        const transport: FusionTransport = {
            async callTool(name) {
                startTimes.push(Date.now());
                await new Promise(r => setTimeout(r, 50));
                return success(`${name} done`);
            },
        };

        const client = createFusionClient(transport);

        const results = await client.executeBatch([
            { action: 'a.one', args: {} },
            { action: 'b.two', args: {} },
            { action: 'c.three', args: {} },
        ]);

        expect(results).toHaveLength(3);
        results.forEach(r => expect(r.isError).toBeUndefined());

        // All 3 should start roughly at the same time (parallel)
        const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
        expect(maxDiff).toBeLessThan(40); // less than one full delay
    });

    it('should execute sequentially when sequential: true', async () => {
        const timestamps: number[] = [];

        const transport: FusionTransport = {
            async callTool(name) {
                timestamps.push(Date.now());
                await new Promise(r => setTimeout(r, 30));
                return success(`${name} done`);
            },
        };

        const client = createFusionClient(transport);

        const results = await client.executeBatch(
            [
                { action: 'a.one', args: {} },
                { action: 'b.two', args: {} },
            ],
            { sequential: true },
        );

        expect(results).toHaveLength(2);

        // Second call should start significantly after first
        const diff = timestamps[1]! - timestamps[0]!;
        expect(diff).toBeGreaterThanOrEqual(20);
    });

    it('should apply throwOnError in batch mode', async () => {
        const transport: FusionTransport = {
            async callTool(name) {
                if (name === 'b') return toolError('FAIL', { message: 'Boom' });
                return success('ok');
            },
        };

        const client = createFusionClient(transport, { throwOnError: true });

        await expect(
            client.executeBatch([
                { action: 'a.one', args: {} },
                { action: 'b.two', args: {} },
            ]),
        ).rejects.toThrow(FusionClientError);
    });

    it('should apply client middleware in batch mode', async () => {
        let mwCallCount = 0;

        const countMw: ClientMiddleware = async (action, args, next) => {
            mwCallCount++;
            return next(action, args);
        };

        const transport = createMockTransport();
        const client = createFusionClient(transport, { middleware: [countMw] });

        await client.executeBatch([
            { action: 'a.one', args: {} },
            { action: 'b.two', args: {} },
            { action: 'c.three', args: {} },
        ]);

        expect(mwCallCount).toBe(3);
    });

    it('should return empty array for empty batch', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        const results = await client.executeBatch([]);
        expect(results).toEqual([]);
        expect(transport.calls).toHaveLength(0);
    });
});

// ============================================================================
// Backward Compatibility
// ============================================================================

describe('FusionClient — Backward Compatibility', () => {
    it('should work without options (backward-compatible signature)', () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);
        expect(typeof client.execute).toBe('function');
        expect(typeof client.executeBatch).toBe('function');
    });

    it('should split dotted action path exactly like before', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('projects.create', { name: 'V2' } as any);

        expect(transport.calls[0].name).toBe('projects');
        expect(transport.calls[0].args['action']).toBe('create');
    });

    it('should handle simple (non-dotted) action names', async () => {
        const transport = createMockTransport();
        const client = createFusionClient(transport);

        await client.execute('ping', {} as any);

        expect(transport.calls[0].name).toBe('ping');
    });
});
