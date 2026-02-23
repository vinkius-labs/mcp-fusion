/**
 * PromptExecutionPipeline — Unit Tests
 *
 * Covers: assertFlatSchema, coercePromptArgs, executePromptPipeline.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    assertFlatSchema,
    coercePromptArgs,
    executePromptPipeline,
} from '../../src/prompt/PromptExecutionPipeline.js';
import type { PromptResult } from '../../src/prompt/types.js';

// ── Helpers ──────────────────────────────────────────────

function makeResult(text: string): PromptResult {
    return {
        messages: [{
            role: 'user',
            content: { type: 'text', text },
        }],
    };
}

// ── assertFlatSchema ─────────────────────────────────────

describe('assertFlatSchema', () => {
    it('accepts flat primitives', () => {
        const schema = z.object({
            name: z.string(),
            count: z.number(),
            active: z.boolean(),
        });
        expect(() => assertFlatSchema(schema)).not.toThrow();
    });

    it('accepts enums', () => {
        const schema = z.object({
            status: z.enum(['active', 'archived']),
        });
        expect(() => assertFlatSchema(schema)).not.toThrow();
    });

    it('accepts optional primitives', () => {
        const schema = z.object({
            name: z.string().optional(),
            count: z.number().default(10),
            active: z.boolean().nullable(),
        });
        expect(() => assertFlatSchema(schema)).not.toThrow();
    });

    it('rejects arrays', () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });
        expect(() => assertFlatSchema(schema)).toThrow('tags');
        expect(() => assertFlatSchema(schema)).toThrow('ZodArray');
    });

    it('rejects nested objects', () => {
        const schema = z.object({
            meta: z.object({ key: z.string() }),
        });
        expect(() => assertFlatSchema(schema)).toThrow('meta');
        expect(() => assertFlatSchema(schema)).toThrow('ZodObject');
    });

    it('rejects tuples', () => {
        const schema = z.object({
            pair: z.tuple([z.string(), z.number()]),
        });
        expect(() => assertFlatSchema(schema)).toThrow('pair');
    });

    it('rejects records', () => {
        const schema = z.object({
            data: z.record(z.string()),
        });
        expect(() => assertFlatSchema(schema)).toThrow('data');
    });

    it('rejects maps', () => {
        const schema = z.object({
            lookup: z.map(z.string(), z.number()),
        });
        expect(() => assertFlatSchema(schema)).toThrow('lookup');
    });

    it('rejects sets', () => {
        const schema = z.object({
            unique: z.set(z.string()),
        });
        expect(() => assertFlatSchema(schema)).toThrow('unique');
    });

    it('rejects optional arrays (unwraps wrappers)', () => {
        const schema = z.object({
            tags: z.array(z.string()).optional(),
        });
        expect(() => assertFlatSchema(schema)).toThrow('tags');
    });
});

// ── coercePromptArgs ─────────────────────────────────────

describe('coercePromptArgs', () => {
    const schema = z.object({
        name: z.string(),
        count: z.number(),
        active: z.boolean(),
        status: z.enum(['on', 'off']),
    });

    it('coerces string to number', () => {
        const result = coercePromptArgs({ count: '42' }, schema);
        expect(result.count).toBe(42);
    });

    it('coerces "true" to boolean true', () => {
        const result = coercePromptArgs({ active: 'true' }, schema);
        expect(result.active).toBe(true);
    });

    it('coerces "false" to boolean false', () => {
        const result = coercePromptArgs({ active: 'false' }, schema);
        expect(result.active).toBe(false);
    });

    it('passes strings through unchanged', () => {
        const result = coercePromptArgs({ name: 'Alice' }, schema);
        expect(result.name).toBe('Alice');
    });

    it('passes enums through unchanged', () => {
        const result = coercePromptArgs({ status: 'on' }, schema);
        expect(result.status).toBe('on');
    });

    it('passes unknown fields through (for Zod strict rejection)', () => {
        const result = coercePromptArgs({ unknown_field: 'val' }, schema);
        expect(result.unknown_field).toBe('val');
    });

    it('handles multiple args simultaneously', () => {
        const result = coercePromptArgs(
            { name: 'Bob', count: '7', active: 'true', status: 'off' },
            schema,
        );
        expect(result).toEqual({ name: 'Bob', count: 7, active: true, status: 'off' });
    });

    it('coerces optional number fields', () => {
        const optSchema = z.object({ limit: z.number().optional() });
        const result = coercePromptArgs({ limit: '50' }, optSchema);
        expect(result.limit).toBe(50);
    });
});

// ── executePromptPipeline ────────────────────────────────

describe('executePromptPipeline', () => {
    const schema = z.object({
        name: z.string().min(1),
        count: z.number().int().positive(),
    });

    const handler = vi.fn(async (_ctx: void, args: Record<string, unknown>) =>
        makeResult(`Hello ${args.name} x${args.count}`),
    );

    it('coerces, validates, and executes handler', async () => {
        handler.mockClear();
        const result = await executePromptPipeline(
            undefined as void, { name: 'Alice', count: '3' },
            schema, [], handler,
        );
        expect(handler).toHaveBeenCalledOnce();
        expect(result.messages[0]!.content).toEqual({
            type: 'text', text: 'Hello Alice x3',
        });
    });

    it('returns validation error for invalid args', async () => {
        handler.mockClear();
        const result = await executePromptPipeline(
            undefined as void, { name: '', count: '-1' },
            schema, [], handler,
        );
        expect(handler).not.toHaveBeenCalled();
        expect(result.messages[0]!.content).toHaveProperty('type', 'text');
        const text = (result.messages[0]!.content as { type: 'text'; text: string }).text;
        expect(text).toContain('validation_error');
    });

    it('rejects unknown fields via strict mode', async () => {
        handler.mockClear();
        const result = await executePromptPipeline(
            undefined as void, { name: 'Alice', count: '3', extra: 'nope' },
            schema, [], handler,
        );
        expect(handler).not.toHaveBeenCalled();
        const text = (result.messages[0]!.content as { type: 'text'; text: string }).text;
        expect(text).toContain('validation_error');
    });

    it('works without schema (passthrough)', async () => {
        handler.mockClear();
        const noSchemaHandler = vi.fn(async (_ctx: void, args: Record<string, unknown>) =>
            makeResult(`raw: ${JSON.stringify(args)}`),
        );
        const result = await executePromptPipeline(
            undefined as void, { anything: 'goes' },
            undefined, [], noSchemaHandler,
        );
        expect(noSchemaHandler).toHaveBeenCalledOnce();
        expect(result.messages[0]!.content).toEqual({
            type: 'text', text: 'raw: {"anything":"goes"}',
        });
    });

    it('executes middleware chain in order', async () => {
        const calls: string[] = [];

        const mw1 = async (_ctx: void, _args: Record<string, unknown>, next: () => Promise<unknown>) => {
            calls.push('mw1-before');
            const result = await next();
            calls.push('mw1-after');
            return result;
        };

        const mw2 = async (_ctx: void, _args: Record<string, unknown>, next: () => Promise<unknown>) => {
            calls.push('mw2-before');
            const result = await next();
            calls.push('mw2-after');
            return result;
        };

        const trackedHandler = vi.fn(async (_ctx: void, _args: Record<string, unknown>) => {
            calls.push('handler');
            return makeResult('done');
        });

        await executePromptPipeline(
            undefined as void, { name: 'Test', count: '1' },
            schema, [mw1, mw2], trackedHandler,
        );

        expect(calls).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
    });

    it('middleware can short-circuit', async () => {
        const blockingMw = async (_ctx: void, _args: Record<string, unknown>, _next: () => Promise<unknown>) => {
            return makeResult('BLOCKED');
        };

        handler.mockClear();
        const result = await executePromptPipeline(
            undefined as void, { name: 'Test', count: '1' },
            schema, [blockingMw], handler,
        );

        expect(handler).not.toHaveBeenCalled();
        expect((result.messages[0]!.content as { text: string }).text).toBe('BLOCKED');
    });
});
