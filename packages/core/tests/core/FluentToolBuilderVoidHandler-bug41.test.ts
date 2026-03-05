/**
 * Bug #41 Regression: Auto-wrap `success(undefined)` produces malformed ToolResponse
 *
 * BUG: When a handler returns void (no explicit return), `result` is `undefined`.
 * The duck-type ToolResponse check fails (undefined is not an object), and
 * `success(undefined as string | object)` is called. Since `typeof undefined !== 'string'`,
 * the JSON path runs: `JSON.stringify(undefined)` returns JS `undefined` (not a string),
 * producing `{ content: [{ type: 'text', text: undefined }] }`.
 * This violates the MCP contract where `text` must be a string.
 *
 * WHY EXISTING TESTS MISSED IT:
 * All FluentApi tests returned either explicit data (objects/arrays/strings) or
 * explicit `success()` calls. Zero tests covered the fire-and-forget pattern
 * where a handler returns `void` (no return statement).
 *
 * FIX: Guard `if (result === undefined || result === null) return success('OK');`
 * before the duck-type check.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { initFusion } from '../../src/core/initFusion.js';
import { success } from '../../src/core/response.js';

// ── Test Context ──
interface TestCtx { userId: string }
const ctx: TestCtx = { userId: 'u-1' };

describe('Bug #41 Regression: void/null handler result → valid ToolResponse', () => {

    it('handler returning void → text is "OK" (not undefined)', async () => {
        const f = initFusion<TestCtx>();

        const tool = f.action('fire.forget')
            .describe('Fire and forget')
            .handle(async (_input, _ctx) => {
                // No return statement → result is undefined
            });

        const result = await tool.execute(ctx, { action: 'forget' });

        expect(result.content).toBeDefined();
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        // CRITICAL: text must be a string, never undefined
        expect(typeof result.content[0].text).toBe('string');
        expect(result.content[0].text).toBe('OK');
        expect(result.isError).toBeUndefined();
    });

    it('handler explicitly returning undefined → text is "OK"', async () => {
        const f = initFusion<TestCtx>();

        const tool = f.action('explicit.undef')
            .handle(async () => {
                return undefined as unknown;
            });

        const result = await tool.execute(ctx, { action: 'undef' });

        expect(typeof result.content[0].text).toBe('string');
        expect(result.content[0].text).toBe('OK');
    });

    it('handler explicitly returning null → text is "OK"', async () => {
        const f = initFusion<TestCtx>();

        const tool = f.action('explicit.null')
            .handle(async () => {
                return null as unknown;
            });

        const result = await tool.execute(ctx, { action: 'null' });

        expect(typeof result.content[0].text).toBe('string');
        expect(result.content[0].text).toBe('OK');
    });

    it('handler returning empty string → text is "OK" (empty string fallback in success())', async () => {
        const f = initFusion<TestCtx>();

        const tool = f.action('empty.string')
            .handle(async () => '');

        const result = await tool.execute(ctx, { action: 'string' });

        // success('') normalizes to 'OK' since (data || 'OK') handles empty string
        expect(result.content[0].text).toBe('OK');
    });

    it('handler returning valid object → normal JSON serialization (unchanged behavior)', async () => {
        const f = initFusion<TestCtx>();

        const tool = f.action('valid.obj')
            .handle(async () => ({ id: 1, name: 'Alice' }));

        const result = await tool.execute(ctx, { action: 'obj' });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual({ id: 1, name: 'Alice' });
    });

    it('handler returning explicit success() → passthrough (unchanged behavior)', async () => {
        const f = initFusion<TestCtx>();

        const tool = f.action('explicit.success')
            .handle(async () => success('manual'));

        const result = await tool.execute(ctx, { action: 'success' });

        expect(result.content[0].text).toBe('manual');
    });

    it('MCP contract: text field is ALWAYS a string in every scenario', async () => {
        const f = initFusion<TestCtx>();

        // Test multiple return types that could produce undefined text
        const scenarios: Array<{ name: string; handler: () => Promise<unknown> }> = [
            { name: 'void', handler: async () => {} },
            { name: 'undefined', handler: async () => undefined },
            { name: 'null', handler: async () => null },
            { name: 'string', handler: async () => 'hello' },
            { name: 'object', handler: async () => ({ x: 1 }) },
            { name: 'number', handler: async () => 42 },
        ];

        for (const scenario of scenarios) {
            const tool = f.action(`contract.${scenario.name}`)
                .handle(scenario.handler as never);

            const result = await tool.execute(ctx, { action: scenario.name });

            expect(typeof result.content[0].text).toBe('string');
            expect(result.content[0].text).not.toBeUndefined();
            expect(result.content[0].text).not.toBeNull();
        }
    });
});
