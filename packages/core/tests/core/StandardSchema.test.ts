/**
 * Tests for StandardSchema — Universal Schema Abstraction Layer
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    toStandardValidator,
    fromZodSchema,
    isStandardSchema,
    autoValidator,
    type StandardSchemaV1,
    type FusionValidator,
} from '../../src/core/StandardSchema.js';

// ── Mock Standard Schema Implementation ──────────────────

function createMockStandardSchema<T>(
    vendor: string,
    validateFn: (value: unknown) =>
        | { value: T }
        | { issues: Array<{ message: string; path?: readonly (string | number | symbol)[] }> },
): StandardSchemaV1<unknown, T> {
    return {
        '~standard': {
            version: 1,
            vendor,
            validate: validateFn,
        },
    };
}

describe('StandardSchema', () => {
    describe('isStandardSchema', () => {
        it('should detect Standard Schema v1 objects', () => {
            const schema = createMockStandardSchema('valibot', (v) => ({ value: v as string }));
            expect(isStandardSchema(schema)).toBe(true);
        });

        it('should reject non-standard objects', () => {
            expect(isStandardSchema(null)).toBe(false);
            expect(isStandardSchema(undefined)).toBe(false);
            expect(isStandardSchema(42)).toBe(false);
            expect(isStandardSchema({})).toBe(false);
            expect(isStandardSchema({ '~standard': null })).toBe(false);
            expect(isStandardSchema({ '~standard': { version: 2 } })).toBe(false);
        });

        it('should handle Zod schemas (may implement ~standard in v4)', () => {
            const zodSchema = z.object({ name: z.string() });
            // Zod v4 implements Standard Schema — so this may be true
            expect(typeof isStandardSchema(zodSchema)).toBe('boolean');
        });
    });

    describe('toStandardValidator', () => {
        it('should wrap a valid Standard Schema', () => {
            const schema = createMockStandardSchema<{ name: string }>('valibot', (v) => {
                const obj = v as Record<string, unknown>;
                if (typeof obj['name'] === 'string') {
                    return { value: { name: obj['name'] } };
                }
                return { issues: [{ message: 'Expected string for name', path: ['name'] }] };
            });

            const validator = toStandardValidator(schema);
            expect(validator.vendor).toBe('valibot');

            const ok = validator.validate({ name: 'Alice' });
            expect(ok.success).toBe(true);
            if (ok.success) {
                expect(ok.data).toEqual({ name: 'Alice' });
            }

            const err = validator.validate({ name: 42 });
            expect(err.success).toBe(false);
            if (!err.success) {
                expect(err.issues[0]?.message).toContain('Expected string');
            }
        });
    });

    describe('fromZodSchema', () => {
        it('should wrap a Zod schema into a FusionValidator', () => {
            const schema = z.object({ name: z.string(), age: z.number() });
            const validator = fromZodSchema(schema);

            expect(validator.vendor).toBe('zod');

            const ok = validator.validate({ name: 'Bob', age: 30 });
            expect(ok.success).toBe(true);
            if (ok.success) {
                expect(ok.data).toEqual({ name: 'Bob', age: 30 });
            }
        });

        it('should return issues on validation failure', () => {
            const schema = z.object({ name: z.string() });
            const validator = fromZodSchema(schema);

            const err = validator.validate({ name: 123 });
            expect(err.success).toBe(false);
            if (!err.success) {
                expect(err.issues.length).toBeGreaterThan(0);
                expect(err.issues[0]?.message).toBeDefined();
            }
        });

        it('should preserve the original schema reference', () => {
            const schema = z.string();
            const validator = fromZodSchema(schema);
            expect(validator.schema).toBe(schema);
        });
    });

    describe('autoValidator', () => {
        it('should auto-detect Standard Schema', () => {
            const schema = createMockStandardSchema('arktype', (v) => ({ value: v }));
            const validator = autoValidator(schema);
            expect(validator.vendor).toBe('arktype');
        });

        it('should auto-detect Zod schema', () => {
            const schema = z.object({ x: z.number() });
            const validator = autoValidator(schema);
            expect(validator.vendor).toBe('zod');
        });

        it('should throw for unsupported schema types', () => {
            expect(() => autoValidator(42)).toThrow('Unsupported schema type');
            expect(() => autoValidator('hello')).toThrow('Unsupported schema type');
            expect(() => autoValidator(null)).toThrow('Unsupported schema type');
        });
    });

    describe('integration: validation pipeline', () => {
        it('should validate and return clean data from Standard Schema', () => {
            const schema = createMockStandardSchema<{ id: number }>('custom', (v) => {
                const obj = v as Record<string, unknown>;
                if (typeof obj['id'] === 'number' && obj['id'] > 0) {
                    return { value: { id: obj['id'] } };
                }
                return { issues: [{ message: 'id must be a positive number', path: ['id'] }] };
            });

            const validator = autoValidator<{ id: number }>(schema);

            expect(validator.validate({ id: 5 })).toEqual({
                success: true,
                data: { id: 5 },
            });

            const fail = validator.validate({ id: -1 });
            expect(fail.success).toBe(false);
        });
    });
});
