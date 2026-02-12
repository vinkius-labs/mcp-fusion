import { describe, it, expect } from 'vitest';
import { success, error, required, toonSuccess } from '../../src/framework/ResponseHelper.js';
import { decode } from '@toon-format/toon';

describe('ResponseHelper', () => {
    describe('success()', () => {
        it('should return correct MCP response format', () => {
            const result = success('hello world');
            expect(result).toEqual({
                content: [{ type: 'text', text: 'hello world' }],
            });
        });

        it('should not set isError', () => {
            const result = success('ok');
            expect(result.isError).toBeUndefined();
        });
    });

    describe('error()', () => {
        it('should return correct format with isError true', () => {
            const result = error('something went wrong');
            expect(result).toEqual({
                content: [{ type: 'text', text: 'something went wrong' }],
                isError: true,
            });
        });
    });

    describe('required()', () => {
        it('should format field name in error message', () => {
            const result = required('title');
            expect(result.content[0].text).toBe('Error: title required');
            expect(result.isError).toBe(true);
        });
    });

    describe('toonSuccess()', () => {
        it('should return valid MCP ToolResponse', () => {
            const result = toonSuccess({ name: 'test' });
            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect(typeof result.content[0].text).toBe('string');
            expect(result.isError).toBeUndefined();
        });

        it('should encode array of objects in pipe-delimited TOON', () => {
            const data = [
                { id: 1, name: 'Alice', role: 'admin' },
                { id: 2, name: 'Bob', role: 'editor' },
            ];
            const result = toonSuccess(data);
            const text = result.content[0].text;

            // TOON header should show field names
            expect(text).toContain('id');
            expect(text).toContain('name');
            expect(text).toContain('role');
            expect(text).toContain('Alice');
            expect(text).toContain('Bob');

            // Should be decodable back
            const decoded = decode(text);
            expect(decoded).toEqual(data);
        });

        it('should be significantly shorter than JSON.stringify for tabular data', () => {
            const users = Array.from({length: 20}, (_, i) => ({
                id: i + 1,
                name: `User ${i + 1}`,
                email: `user${i + 1}@company.com`,
                role: ['admin', 'editor', 'viewer'][i % 3],
                status: i % 2 === 0 ? 'active' : 'inactive',
            }));

            const toonResult = toonSuccess(users);
            const jsonStr = JSON.stringify(users);
            const toonStr = toonResult.content[0].text;

            const savings = ((1 - toonStr.length / jsonStr.length) * 100);

            // TOON should save at least 30% on tabular data
            expect(savings).toBeGreaterThan(30);
        });

        it('should handle a single object', () => {
            const result = toonSuccess({ id: 1, title: 'Test', done: false });
            const decoded = decode(result.content[0].text);
            expect(decoded).toEqual({ id: 1, title: 'Test', done: false });
        });

        it('should handle primitive values', () => {
            expect(toonSuccess(42).content[0].text).toBeTruthy();
            expect(toonSuccess('hello').content[0].text).toBeTruthy();
            expect(toonSuccess(true).content[0].text).toBeTruthy();
        });

        it('should handle empty arrays', () => {
            const result = toonSuccess([]);
            expect(result.content[0].text).toBeDefined();
        });

        it('should accept custom encode options', () => {
            const data = [{ a: 1, b: 2 }];
            const pipeResult = toonSuccess(data);
            const commaResult = toonSuccess(data, { delimiter: ',' });

            // Both should produce valid TOON
            expect(pipeResult.content[0].text).toContain('|');
            expect(commaResult.content[0].text).toContain(',');
        });

        it('should handle nested objects', () => {
            const data = {
                user: { name: 'Alice' },
                settings: { theme: 'dark', lang: 'pt' },
            };
            const result = toonSuccess(data);
            const decoded = decode(result.content[0].text);
            expect(decoded).toEqual(data);
        });
    });

    describe('toonSuccess() — edge cases & error paths', () => {
        it('should handle null', () => {
            const result = toonSuccess(null);
            expect(result.content[0].text).toBeDefined();
            expect(result.isError).toBeUndefined();
        });

        it('should handle undefined', () => {
            const result = toonSuccess(undefined);
            expect(result.content[0].text).toBeDefined();
        });

        it('should handle empty object', () => {
            const result = toonSuccess({});
            expect(result.content[0].text).toBeDefined();
            expect(result.isError).toBeUndefined();
        });

        it('should handle NaN and Infinity gracefully', () => {
            // NaN and Infinity are not valid JSON — TOON should handle them
            expect(() => toonSuccess({ value: NaN })).not.toThrow();
            expect(() => toonSuccess({ value: Infinity })).not.toThrow();
            expect(() => toonSuccess({ value: -Infinity })).not.toThrow();
        });

        it('should handle data with pipe characters in values', () => {
            const data = [
                { name: 'pipe|in|name', description: 'a|b|c' },
                { name: 'normal', description: 'clean' },
            ];
            const result = toonSuccess(data);
            // TOON must quote/escape values that contain the delimiter
            const decoded = decode(result.content[0].text);
            expect(decoded).toEqual(data);
        });

        it('should handle strings with special characters', () => {
            const data = {
                quote: 'He said "hello"',
                newline: 'line1\nline2',
                tab: 'col1\tcol2',
                emoji: '🚀✅',
                unicode: 'São Paulo — café',
            };
            const result = toonSuccess(data);
            expect(result.content[0].text).toBeTruthy();
            const decoded = decode(result.content[0].text);
            expect(decoded).toEqual(data);
        });

        it('should handle deeply nested structures (5 levels)', () => {
            const deep = { a: { b: { c: { d: { e: 'leaf' } } } } };
            const result = toonSuccess(deep);
            const decoded = decode(result.content[0].text);
            expect(decoded).toEqual(deep);
        });

        it('should handle arrays with mixed-type objects (sparse keys)', () => {
            const data = [
                { id: 1, name: 'Alice', role: 'admin' },
                { id: 2, name: 'Bob' },  // missing 'role'
                { id: 3, extra: 'field' }, // different keys
            ];
            // Should not throw — TOON handles non-uniform arrays
            expect(() => toonSuccess(data)).not.toThrow();
        });

        it('should handle large payload (1000 rows) without error', () => {
            const rows = Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                name: `User_${i}`,
                email: `u${i}@test.com`,
                active: i % 2 === 0,
            }));
            const result = toonSuccess(rows);
            expect(result.content[0].text.length).toBeGreaterThan(0);

            // Verify savings hold at scale
            const jsonLen = JSON.stringify(rows).length;
            const toonLen = result.content[0].text.length;
            const savings = (1 - toonLen / jsonLen) * 100;
            expect(savings).toBeGreaterThan(30);
        });

        it('should handle arrays containing null elements', () => {
            const data = [null, { id: 1 }, null];
            expect(() => toonSuccess(data)).not.toThrow();
        });

        it('should handle object with numeric keys', () => {
            const data = { 0: 'zero', 1: 'one', 2: 'two' };
            expect(() => toonSuccess(data)).not.toThrow();
        });

        it('should always return standard ToolResponse shape', () => {
            // Regardless of input, the shape must be valid MCP response
            const inputs = [null, undefined, '', 0, false, [], {}, [{}]];
            for (const input of inputs) {
                const r = toonSuccess(input);
                expect(r).toHaveProperty('content');
                expect(Array.isArray(r.content)).toBe(true);
                expect(r.content.length).toBeGreaterThanOrEqual(1);
                expect(r.content[0]).toHaveProperty('type', 'text');
                expect(r.content[0]).toHaveProperty('text');
                expect(r.isError).toBeUndefined();
            }
        });
    });
});
