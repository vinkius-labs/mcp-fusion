import { describe, it, expect } from 'vitest';
import { convertParamsToZod } from '../../src/framework/builder/ParamDescriptors.js';

// ============================================================================
// ParamDescriptors — JSON-to-Zod Converter Tests
// ============================================================================

describe('convertParamsToZod()', () => {
    // ── String Shorthand ──

    it('should convert "string" shorthand to z.string()', () => {
        const schema = convertParamsToZod({ name: 'string' });
        expect(schema.parse({ name: 'Alice' })).toEqual({ name: 'Alice' });
    });

    it('should convert "number" shorthand to z.number()', () => {
        const schema = convertParamsToZod({ count: 'number' });
        expect(schema.parse({ count: 42 })).toEqual({ count: 42 });
    });

    it('should convert "boolean" shorthand to z.boolean()', () => {
        const schema = convertParamsToZod({ active: 'boolean' });
        expect(schema.parse({ active: true })).toEqual({ active: true });
    });

    it('should reject invalid values for shorthands', () => {
        const schema = convertParamsToZod({ name: 'string' });
        expect(() => schema.parse({ name: 123 })).toThrow();
    });

    // ── Object Descriptor: String ──

    it('should convert string descriptor', () => {
        const schema = convertParamsToZod({
            name: { type: 'string' },
        });
        expect(schema.parse({ name: 'test' })).toEqual({ name: 'test' });
    });

    it('should apply min/max constraints', () => {
        const schema = convertParamsToZod({
            name: { type: 'string', min: 3, max: 10 },
        });
        expect(() => schema.parse({ name: 'AB' })).toThrow();
        expect(schema.parse({ name: 'ABC' })).toEqual({ name: 'ABC' });
        expect(() => schema.parse({ name: 'A'.repeat(11) })).toThrow();
    });

    it('should apply regex constraint', () => {
        const schema = convertParamsToZod({
            slug: { type: 'string', regex: '^[a-z-]+$' },
        });
        expect(schema.parse({ slug: 'my-slug' })).toEqual({ slug: 'my-slug' });
        expect(() => schema.parse({ slug: 'UPPERCASE' })).toThrow();
    });

    it('should handle optional string', () => {
        const schema = convertParamsToZod({
            bio: { type: 'string', optional: true },
        });
        expect(schema.parse({})).toEqual({});
        expect(schema.parse({ bio: 'Hello' })).toEqual({ bio: 'Hello' });
    });

    // ── Object Descriptor: Number ──

    it('should convert number descriptor with constraints', () => {
        const schema = convertParamsToZod({
            age: { type: 'number', min: 0, max: 150, int: true },
        });
        expect(schema.parse({ age: 25 })).toEqual({ age: 25 });
        expect(() => schema.parse({ age: -1 })).toThrow();
        expect(() => schema.parse({ age: 25.5 })).toThrow();
    });

    // ── Object Descriptor: Boolean ──

    it('should convert boolean descriptor', () => {
        const schema = convertParamsToZod({
            active: { type: 'boolean' },
        });
        expect(schema.parse({ active: false })).toEqual({ active: false });
    });

    // ── Enum ──

    it('should convert enum descriptor', () => {
        const schema = convertParamsToZod({
            status: { enum: ['active', 'archived'] as const },
        });
        expect(schema.parse({ status: 'active' })).toEqual({ status: 'active' });
        expect(() => schema.parse({ status: 'deleted' })).toThrow();
    });

    it('should handle optional enum', () => {
        const schema = convertParamsToZod({
            role: { enum: ['admin', 'user'] as const, optional: true },
        });
        expect(schema.parse({})).toEqual({});
        expect(schema.parse({ role: 'admin' })).toEqual({ role: 'admin' });
    });

    // ── Array ──

    it('should convert array descriptor', () => {
        const schema = convertParamsToZod({
            tags: { array: 'string' },
        });
        expect(schema.parse({ tags: ['a', 'b'] })).toEqual({ tags: ['a', 'b'] });
    });

    it('should apply array max constraint', () => {
        const schema = convertParamsToZod({
            ids: { array: 'number', max: 3 },
        });
        expect(() => schema.parse({ ids: [1, 2, 3, 4] })).toThrow();
    });

    it('should handle optional array', () => {
        const schema = convertParamsToZod({
            tags: { array: 'string', optional: true },
        });
        expect(schema.parse({})).toEqual({});
    });

    // ── Description & Examples ──

    it('should set description on fields', () => {
        const schema = convertParamsToZod({
            name: { type: 'string', description: 'User name' },
        });
        const field = schema.shape['name'];
        expect(field.description).toContain('User name');
    });

    it('should inject examples into description', () => {
        const schema = convertParamsToZod({
            cron: {
                type: 'string',
                description: 'CRON schedule',
                examples: ['0 12 * * *', '*/5 * * * *'],
            },
        });
        const field = schema.shape['cron'];
        expect(field.description).toContain('0 12 * * *');
        expect(field.description).toContain('*/5 * * * *');
    });

    it('should inject examples without base description', () => {
        const schema = convertParamsToZod({
            date: { type: 'string', examples: ['2025-01-01'] },
        });
        const field = schema.shape['date'];
        expect(field.description).toContain('2025-01-01');
    });

    // ── Empty Params ──

    it('should handle empty params map', () => {
        const schema = convertParamsToZod({});
        expect(schema.parse({})).toEqual({});
    });

    // ── Error Cases ──

    it('should throw on unknown shorthand type', () => {
        expect(() => {
            // @ts-expect-error — testing runtime error
            convertParamsToZod({ x: 'date' });
        }).toThrow('Unknown shorthand type');
    });

    it('should throw on unknown object type', () => {
        expect(() => {
            // @ts-expect-error — testing runtime error
            convertParamsToZod({ x: { type: 'date' } });
        }).toThrow('Unknown param type');
    });

    it('should throw on unknown array item type', () => {
        expect(() => {
            // @ts-expect-error — testing runtime error
            convertParamsToZod({ x: { array: 'date' } });
        }).toThrow('Unknown array item type');
    });

    // ── Combined ──

    it('should handle mixed param types in one schema', () => {
        const schema = convertParamsToZod({
            name: 'string',
            age: { type: 'number', min: 0 },
            role: { enum: ['admin', 'user'] as const },
            tags: { array: 'string', optional: true },
            active: 'boolean',
        });

        const result = schema.parse({
            name: 'Alice',
            age: 30,
            role: 'admin',
            active: true,
        });

        expect(result).toEqual({
            name: 'Alice',
            age: 30,
            role: 'admin',
            active: true,
        });
    });
});
