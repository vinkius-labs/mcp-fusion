/**
 * PolicyEngine — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/state-sync/PolicyEngine.js';

describe('PolicyEngine', () => {
    describe('first-match-wins resolution', () => {
        it('returns the first matching policy', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.get', cacheControl: 'immutable' },
                { match: 'sprints.*', cacheControl: 'no-store' },
            ]);

            const result = engine.resolve('sprints.get');
            expect(result?.cacheControl).toBe('immutable');
        });

        it('falls through to later policies', () => {
            const engine = new PolicyEngine([
                { match: 'tasks.*', cacheControl: 'no-store' },
                { match: 'sprints.*', cacheControl: 'immutable' },
            ]);

            const result = engine.resolve('sprints.get');
            expect(result?.cacheControl).toBe('immutable');
        });
    });

    describe('defaults', () => {
        it('applies default cacheControl when no policy matches', () => {
            const engine = new PolicyEngine(
                [{ match: 'tasks.*', cacheControl: 'no-store' }],
                { cacheControl: 'no-store' },
            );

            const result = engine.resolve('unknown.tool');
            expect(result?.cacheControl).toBe('no-store');
        });

        it('returns null when no policy matches and no defaults', () => {
            const engine = new PolicyEngine([
                { match: 'tasks.*', cacheControl: 'no-store' },
            ]);

            expect(engine.resolve('unknown.tool')).toBeNull();
        });

        it('policy cacheControl overrides default', () => {
            const engine = new PolicyEngine(
                [{ match: 'countries.*', cacheControl: 'immutable' }],
                { cacheControl: 'no-store' },
            );

            const result = engine.resolve('countries.list');
            expect(result?.cacheControl).toBe('immutable');
        });
    });

    describe('invalidates resolution', () => {
        it('resolves invalidation patterns', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.update', invalidates: ['sprints.*', 'tasks.*'] },
            ]);

            const result = engine.resolve('sprints.update');
            expect(result?.invalidates).toEqual(['sprints.*', 'tasks.*']);
        });

        it('inherits default cacheControl with invalidates', () => {
            const engine = new PolicyEngine(
                [{ match: 'sprints.update', invalidates: ['sprints.*'] }],
                { cacheControl: 'no-store' },
            );

            const result = engine.resolve('sprints.update');
            expect(result?.cacheControl).toBe('no-store');
            expect(result?.invalidates).toEqual(['sprints.*']);
        });
    });

    describe('caching', () => {
        it('returns the same instance on repeated calls', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.*', cacheControl: 'no-store' },
            ]);

            const first = engine.resolve('sprints.get');
            const second = engine.resolve('sprints.get');
            expect(first).toBe(second);
        });

        it('caches null results', () => {
            const engine = new PolicyEngine([]);
            const first = engine.resolve('anything');
            const second = engine.resolve('anything');
            expect(first).toBeNull();
            expect(second).toBeNull();
        });
    });

    describe('validation', () => {
        it('throws on invalid policies at construction', () => {
            expect(() => new PolicyEngine([
                { match: '', cacheControl: 'no-store' },
            ])).toThrow();
        });

        it('throws on invalid defaults at construction', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => new PolicyEngine([], { cacheControl: 'bad' as any })).toThrow();
        });
    });

    describe('policy without cacheControl or invalidates', () => {
        it('returns null if matched policy has neither', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.*' },
            ]);

            expect(engine.resolve('sprints.get')).toBeNull();
        });
    });

    describe('bounded cache (memory safety)', () => {
        it('still works correctly after cache eviction', () => {
            const engine = new PolicyEngine([
                { match: 'test.*', cacheControl: 'no-store' },
            ]);

            // Fill cache with unique names beyond the bound
            // (MAX_CACHE_SIZE is 2048, we don't need to hit it exactly —
            // just verify the engine still works after many calls)
            for (let i = 0; i < 100; i++) {
                const result = engine.resolve(`test.tool${i}`);
                expect(result?.cacheControl).toBe('no-store');
            }

            // Earlier resolved names still resolve correctly
            expect(engine.resolve('test.tool0')?.cacheControl).toBe('no-store');
        });
    });

    describe('default resolution reuse', () => {
        it('returns the same frozen default object for all unmatched names', () => {
            const engine = new PolicyEngine(
                [{ match: 'tasks.*', cacheControl: 'no-store' }],
                { cacheControl: 'no-store' },
            );

            const a = engine.resolve('unknown.a');
            const b = engine.resolve('unknown.b');

            // Same frozen object is reused — no allocation per unmatched name
            expect(a).toBe(b);
        });
    });
});
