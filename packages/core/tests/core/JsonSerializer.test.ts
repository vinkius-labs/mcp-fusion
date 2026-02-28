/**
 * JsonSerializer — AOT Serialization Engine Tests
 *
 * Validates:
 * - Schema compilation (Zod → fast-json-stringify)
 * - Output correctness (equivalent to JSON.stringify for same data)
 * - WeakMap caching (same schema → same function reference)
 * - Fallback behavior (graceful degradation)
 * - Complex schemas (nested objects, arrays, optionals, enums)
 * - Edge cases (empty objects, nulls, large payloads)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { createSerializer, defaultSerializer } from '../../src/core/serialization/JsonSerializer.js';

// ── Bootstrap: ensure fjs is loaded ─────────────────────

describe('JsonSerializer', () => {

    // Pre-load fast-json-stringify for synchronous compile calls
    beforeAll(async () => {
        await defaultSerializer.init();
    });

    // ── Compilation ─────────────────────────────────────

    describe('compile()', () => {
        it('compiles a simple object schema', () => {
            const schema = z.object({
                id: z.string(),
                name: z.string(),
            });

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();
            expect(typeof stringify).toBe('function');
        });

        it('compiles a schema with numbers and booleans', () => {
            const schema = z.object({
                count: z.number(),
                active: z.boolean(),
            });

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();
        });

        it('compiles an array schema', () => {
            const schema = z.array(z.object({
                id: z.string(),
                value: z.number(),
            }));

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();
        });

        it('compiles a schema with optional fields', () => {
            const schema = z.object({
                id: z.string(),
                name: z.string().optional(),
                age: z.number().optional(),
            });

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();
        });

        it('compiles a schema with enums', () => {
            const schema = z.object({
                status: z.enum(['active', 'inactive', 'pending']),
                type: z.string(),
            });

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();
        });

        it('returns undefined for non-schema values', () => {
            const stringify = defaultSerializer.compile('not a schema');
            expect(stringify).toBeUndefined();
        });
    });

    // ── Correctness ─────────────────────────────────────

    describe('output correctness', () => {
        it('produces valid JSON for a simple object', () => {
            const schema = z.object({
                id: z.string(),
                name: z.string(),
                count: z.number(),
            });

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();

            const data = { id: '123', name: 'Alice', count: 42 };
            const result = stringify!(data);

            // Must be valid JSON
            const parsed = JSON.parse(result);
            expect(parsed.id).toBe('123');
            expect(parsed.name).toBe('Alice');
            expect(parsed.count).toBe(42);
        });

        it('preserves nested objects', () => {
            const schema = z.object({
                user: z.object({
                    name: z.string(),
                    address: z.object({
                        city: z.string(),
                    }),
                }),
            });

            const stringify = defaultSerializer.compile(schema);
            const data = { user: { name: 'Bob', address: { city: 'NYC' } } };
            const parsed = JSON.parse(stringify!(data));

            expect(parsed.user.name).toBe('Bob');
            expect(parsed.user.address.city).toBe('NYC');
        });

        it('handles arrays correctly', () => {
            const schema = z.array(z.object({
                id: z.number(),
            }));

            const stringify = defaultSerializer.compile(schema);
            const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
            const parsed = JSON.parse(stringify!(data));

            expect(parsed).toHaveLength(3);
            expect(parsed[0].id).toBe(1);
            expect(parsed[2].id).toBe(3);
        });

        it('produces minified JSON (no indentation)', () => {
            const schema = z.object({
                a: z.string(),
                b: z.number(),
            });

            const stringify = defaultSerializer.compile(schema);
            const result = stringify!({ a: 'hello', b: 42 });

            // Should NOT contain newlines or extra spaces (minified)
            expect(result).not.toContain('\n');
            expect(result).not.toContain('  ');
        });
    });

    // ── Caching ─────────────────────────────────────────

    describe('WeakMap caching', () => {
        it('returns the same function for the same schema reference', () => {
            const schema = z.object({ x: z.number() });

            const fn1 = defaultSerializer.compile(schema);
            const fn2 = defaultSerializer.compile(schema);

            expect(fn1).toBe(fn2); // exact same reference
        });

        it('returns different functions for different schemas', () => {
            const schemaA = z.object({ a: z.string() });
            const schemaB = z.object({ b: z.number() });

            const fnA = defaultSerializer.compile(schemaA);
            const fnB = defaultSerializer.compile(schemaB);

            expect(fnA).not.toBe(fnB);
        });
    });

    // ── stringify() fallback ────────────────────────────

    describe('stringify()', () => {
        it('uses compiled function when provided', () => {
            const schema = z.object({ id: z.string() });
            const compiled = defaultSerializer.compile(schema);

            const result = defaultSerializer.stringify({ id: 'test' }, compiled);
            const parsed = JSON.parse(result);
            expect(parsed.id).toBe('test');
        });

        it('falls back to native JSON.stringify when no compiled fn', () => {
            const data = { key: 'value', num: 123 };
            const result = defaultSerializer.stringify(data);

            expect(result).toBe(JSON.stringify(data));
        });
    });

    // ── createSerializer() factory ──────────────────────

    describe('createSerializer()', () => {
        it('creates an independent serializer instance', () => {
            const serializer = createSerializer();
            expect(serializer).toBeDefined();
            expect(typeof serializer.compile).toBe('function');
            expect(typeof serializer.stringify).toBe('function');
            expect(typeof serializer.init).toBe('function');
        });
    });

    // ── Complex / Edge Cases ────────────────────────────

    describe('edge cases', () => {
        it('handles empty objects', () => {
            const schema = z.object({});
            const stringify = defaultSerializer.compile(schema);

            if (stringify) {
                const result = stringify({});
                expect(JSON.parse(result)).toEqual({});
            }
        });

        it('handles nullable fields', () => {
            const schema = z.object({
                name: z.string().nullable(),
            });

            const stringify = defaultSerializer.compile(schema);
            expect(stringify).toBeDefined();

            if (stringify) {
                const result = stringify({ name: null });
                const parsed = JSON.parse(result);
                expect(parsed.name).toBeNull();
            }
        });

        it('handles large payloads', () => {
            const schema = z.array(z.object({
                id: z.number(),
                label: z.string(),
                value: z.number(),
            }));

            const stringify = defaultSerializer.compile(schema);
            // Generate 1000 items
            const data = Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                label: `item-${i}`,
                value: Math.random() * 100,
            }));

            const result = stringify!(data);
            const parsed = JSON.parse(result);
            expect(parsed).toHaveLength(1000);
            expect(parsed[0].id).toBe(0);
            expect(parsed[999].id).toBe(999);
        });
    });
});
