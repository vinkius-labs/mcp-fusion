import { describe, it, expect } from 'vitest';
import { succeed, fail, type Result } from '../../src/core/result.js';
import { error, required } from '../../src/core/response.js';

// ============================================================================
// Result Monad Tests
// ============================================================================

describe('Result Monad', () => {
    describe('succeed()', () => {
        it('should create a Success with ok: true', () => {
            const result = succeed(42);
            expect(result.ok).toBe(true);
            expect(result.value).toBe(42);
        });

        it('should work with string values', () => {
            const result = succeed('hello');
            expect(result.ok).toBe(true);
            expect(result.value).toBe('hello');
        });

        it('should work with object values', () => {
            const obj = { id: 1, name: 'Alice' };
            const result = succeed(obj);
            expect(result.ok).toBe(true);
            expect(result.value).toEqual(obj);
        });

        it('should work with array values', () => {
            const arr = [1, 2, 3];
            const result = succeed(arr);
            expect(result.ok).toBe(true);
            expect(result.value).toEqual([1, 2, 3]);
        });

        it('should work with undefined', () => {
            const result = succeed(undefined);
            expect(result.ok).toBe(true);
            expect(result.value).toBeUndefined();
        });

        it('should work with null', () => {
            const result = succeed(null);
            expect(result.ok).toBe(true);
            expect(result.value).toBeNull();
        });
    });

    describe('fail()', () => {
        it('should create a Failure with ok: false', () => {
            const result = fail(error('Something went wrong'));
            expect(result.ok).toBe(false);
            expect(result.response.isError).toBe(true);
            expect(result.response.content[0].text).toContain('Something went wrong');
        });

        it('should work with required() helper', () => {
            const result = fail(required('email'));
            expect(result.ok).toBe(false);
            expect(result.response.isError).toBe(true);
            expect(result.response.content[0].text).toContain('email');
        });
    });

    describe('Type narrowing', () => {
        function parsePositiveInt(input: string): Result<number> {
            const n = parseInt(input, 10);
            if (isNaN(n)) return fail(error('Not a number'));
            if (n <= 0) return fail(error('Must be positive'));
            return succeed(n);
        }

        it('should narrow to Success on ok: true', () => {
            const result = parsePositiveInt('42');
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(42);
            }
        });

        it('should narrow to Failure on ok: false for NaN', () => {
            const result = parsePositiveInt('abc');
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.response.content[0].text).toContain('Not a number');
            }
        });

        it('should narrow to Failure on ok: false for negative', () => {
            const result = parsePositiveInt('-5');
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.response.content[0].text).toContain('Must be positive');
            }
        });
    });

    describe('Pipeline pattern', () => {
        function step1(input: string): Result<number> {
            const n = parseInt(input, 10);
            return isNaN(n) ? fail(error('Invalid input')) : succeed(n);
        }

        function step2(n: number): Result<number> {
            return n > 100 ? fail(error('Too large')) : succeed(n * 2);
        }

        function step3(n: number): Result<string> {
            return succeed(`Result: ${n}`);
        }

        it('should chain successfully through all steps', () => {
            const r1 = step1('25');
            if (!r1.ok) throw new Error('Expected success');

            const r2 = step2(r1.value);
            if (!r2.ok) throw new Error('Expected success');

            const r3 = step3(r2.value);
            if (!r3.ok) throw new Error('Expected success');

            expect(r3.value).toBe('Result: 50');
        });

        it('should short-circuit on first failure', () => {
            const r1 = step1('abc');
            expect(r1.ok).toBe(false);
            if (!r1.ok) {
                expect(r1.response.content[0].text).toContain('Invalid input');
            }
        });

        it('should short-circuit on middle failure', () => {
            const r1 = step1('200');
            if (!r1.ok) throw new Error('Expected success');

            const r2 = step2(r1.value);
            expect(r2.ok).toBe(false);
            if (!r2.ok) {
                expect(r2.response.content[0].text).toContain('Too large');
            }
        });
    });
});
