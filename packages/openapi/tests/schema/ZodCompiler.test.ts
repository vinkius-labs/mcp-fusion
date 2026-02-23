import { describe, it, expect } from 'vitest';
import { compileZod, compileInputSchema, compileResponseSchema } from '../../src/schema/ZodCompiler.js';
import type { SchemaNode } from '../../src/parser/types.js';

// ============================================================================
// ZodCompiler Tests
// ============================================================================

describe('ZodCompiler', () => {
    // ── Primitive Types ──

    describe('Primitive Types', () => {
        it('should compile string schema', () => {
            const code = compileZod({ type: 'string' });
            expect(code).toBe('z.string()');
        });

        it('should compile integer schema', () => {
            const code = compileZod({ type: 'integer' });
            expect(code).toBe('z.number().int()');
        });

        it('should compile number schema', () => {
            const code = compileZod({ type: 'number' });
            expect(code).toBe('z.number()');
        });

        it('should compile boolean schema', () => {
            const code = compileZod({ type: 'boolean' });
            expect(code).toBe('z.boolean()');
        });

        it('should compile unknown type as z.unknown()', () => {
            const code = compileZod({ type: 'anything_else' });
            expect(code).toBe('z.unknown()');
        });
    });

    // ── Coercion ──

    describe('Coercion (path/query params)', () => {
        it('should coerce string for path params', () => {
            const code = compileZod({ type: 'string' }, true);
            expect(code).toBe('z.coerce.string()');
        });

        it('should coerce integer for query params', () => {
            const code = compileZod({ type: 'integer' }, true);
            expect(code).toBe('z.coerce.number().int()');
        });

        it('should coerce number for query params', () => {
            const code = compileZod({ type: 'number' }, true);
            expect(code).toBe('z.coerce.number()');
        });

        it('should coerce boolean for query params', () => {
            const code = compileZod({ type: 'boolean' }, true);
            expect(code).toBe('z.coerce.boolean()');
        });

        it('should NOT coerce when coerce=false (body params)', () => {
            const code = compileZod({ type: 'integer' }, false);
            expect(code).toBe('z.number().int()');
        });
    });

    // ── String Formats ──

    describe('String Formats', () => {
        it('should compile uuid format', () => {
            const code = compileZod({ type: 'string', format: 'uuid' });
            expect(code).toBe('z.string().uuid()');
        });

        it('should compile email format', () => {
            const code = compileZod({ type: 'string', format: 'email' });
            expect(code).toBe('z.string().email()');
        });

        it('should compile url format', () => {
            const code = compileZod({ type: 'string', format: 'url' });
            expect(code).toBe('z.string().url()');
        });

        it('should compile uri format', () => {
            const code = compileZod({ type: 'string', format: 'uri' });
            expect(code).toBe('z.string().url()');
        });

        it('should compile date-time format', () => {
            const code = compileZod({ type: 'string', format: 'date-time' });
            expect(code).toBe('z.string().datetime()');
        });
    });

    // ── Constraints ──

    describe('Constraints', () => {
        it('should compile string with minLength/maxLength', () => {
            const code = compileZod({ type: 'string', minLength: 3, maxLength: 100 });
            expect(code).toBe('z.string().min(3).max(100)');
        });

        it('should compile string with pattern', () => {
            const code = compileZod({ type: 'string', pattern: '^[a-z]+$' });
            expect(code).toBe('z.string().regex(/^[a-z]+$/)');
        });

        it('should compile integer with min/max', () => {
            const code = compileZod({ type: 'integer', minimum: 1, maximum: 100 });
            expect(code).toBe('z.number().int().min(1).max(100)');
        });

        it('should compile number with min/max', () => {
            const code = compileZod({ type: 'number', minimum: 0.1, maximum: 99.9 });
            expect(code).toBe('z.number().min(0.1).max(99.9)');
        });
    });

    // ── Enum ──

    describe('Enum', () => {
        it('should compile string enum', () => {
            const code = compileZod({ enum: ['available', 'pending', 'sold'] });
            expect(code).toBe("z.enum(['available', 'pending', 'sold'])");
        });

        it('should escape single quotes in enum values', () => {
            const code = compileZod({ enum: ["it's", "that's"] });
            expect(code).toContain("\\'");
        });
    });

    // ── Arrays ──

    describe('Arrays', () => {
        it('should compile array of strings', () => {
            const code = compileZod({ type: 'array', items: { type: 'string' } });
            expect(code).toBe('z.array(z.string())');
        });

        it('should compile array with min/max length', () => {
            const code = compileZod({ type: 'array', items: { type: 'integer' }, minLength: 1, maxLength: 10 });
            expect(code).toBe('z.array(z.number().int()).min(1).max(10)');
        });

        it('should compile array without items as z.unknown()', () => {
            const code = compileZod({ type: 'array' });
            expect(code).toBe('z.array(z.unknown())');
        });
    });

    // ── Objects ──

    describe('Objects', () => {
        it('should compile object with properties', () => {
            const code = compileZod({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'integer' },
                },
                required: ['name'],
            });
            expect(code).toContain('z.object(');
            expect(code).toContain('name: z.string()');
            expect(code).toContain('age: z.number().int().optional()');
        });

        it('should add .describe() on properties with description', () => {
            const code = compileZod({
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'Unique identifier' },
                },
                required: ['id'],
            });
            expect(code).toContain(".describe('Unique identifier')");
        });

        it('should emit z.record(z.unknown()) for empty object', () => {
            const code = compileZod({ type: 'object' });
            expect(code).toBe('z.record(z.unknown())');
        });

        it('should quote unsafe property names', () => {
            const code = compileZod({
                type: 'object',
                properties: {
                    'X-Api-Key': { type: 'string' },
                },
            });
            expect(code).toContain("'X-Api-Key':");
        });
    });

    // ── Composition ──

    describe('Composition (allOf / oneOf / anyOf)', () => {
        it('should merge allOf schemas into single object', () => {
            const schema: SchemaNode = {
                allOf: [
                    { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
                    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
                ],
            };
            const code = compileZod(schema);
            expect(code).toContain('id: z.number().int()');
            expect(code).toContain('name: z.string()');
        });

        it('should compile oneOf as z.union()', () => {
            const schema: SchemaNode = {
                oneOf: [
                    { type: 'string' },
                    { type: 'integer' },
                ],
            };
            const code = compileZod(schema);
            expect(code).toBe('z.union([z.string(), z.number().int()])');
        });

        it('should compile anyOf as z.union()', () => {
            const schema: SchemaNode = {
                anyOf: [
                    { type: 'boolean' },
                    { type: 'number' },
                ],
            };
            const code = compileZod(schema);
            expect(code).toBe('z.union([z.boolean(), z.number()])');
        });

        it('should unwrap single-element oneOf', () => {
            const schema: SchemaNode = {
                oneOf: [{ type: 'string' }],
            };
            const code = compileZod(schema);
            expect(code).toBe('z.string()');
        });
    });

    // ── compileInputSchema ──

    describe('compileInputSchema()', () => {
        it('should compile path + query params with coercion', () => {
            const code = compileInputSchema([
                { name: 'petId', source: 'path', required: true, schema: { type: 'integer' } },
                { name: 'status', source: 'query', required: false, schema: { type: 'string' } },
            ]);
            expect(code).toContain('petId: z.coerce.number().int()');
            expect(code).toContain('status: z.coerce.string().optional()');
        });

        it('should flatten body object properties', () => {
            const code = compileInputSchema([], {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    status: { type: 'string' },
                },
                required: ['name'],
            });
            expect(code).toContain('name: z.string()');
            expect(code).toContain('status: z.string().optional()');
        });

        it('should wrap non-object body as "body" param', () => {
            const code = compileInputSchema([], { type: 'string' });
            expect(code).toContain('body: z.string()');
        });

        it('should add .describe() from param description', () => {
            const code = compileInputSchema([
                { name: 'limit', source: 'query', required: false, schema: { type: 'integer' }, description: 'Max results' },
            ]);
            expect(code).toContain(".describe('Max results')");
        });

        it('should return empty z.object({}) for no params', () => {
            const code = compileInputSchema([]);
            expect(code).toBe('z.object({})');
        });
    });

    // ── compileResponseSchema ──

    describe('compileResponseSchema()', () => {
        it('should compile response schema without coercion', () => {
            const code = compileResponseSchema({
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                },
                required: ['id', 'name'],
            });
            expect(code).toContain('z.object(');
            expect(code).toContain('id: z.number().int()');
            expect(code).toContain('name: z.string()');
            // Response schemas should NOT use z.coerce
            expect(code).not.toContain('z.coerce');
        });
    });
});
