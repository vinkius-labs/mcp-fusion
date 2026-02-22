/**
 * GlobMatcher — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { matchGlob } from '../../../src/framework/state-sync/GlobMatcher.js';

describe('GlobMatcher', () => {
    describe('exact match', () => {
        it('matches an exact string', () => {
            expect(matchGlob('sprints.get', 'sprints.get')).toBe(true);
        });

        it('rejects non-matching strings', () => {
            expect(matchGlob('sprints.get', 'sprints.update')).toBe(false);
        });
    });

    describe('* (single segment)', () => {
        it('matches any single segment', () => {
            expect(matchGlob('sprints.*', 'sprints.get')).toBe(true);
            expect(matchGlob('sprints.*', 'sprints.update')).toBe(true);
        });

        it('does not cross segment boundaries', () => {
            expect(matchGlob('sprints.*', 'sprints.tasks.get')).toBe(false);
        });

        it('works at any position', () => {
            expect(matchGlob('*.get', 'sprints.get')).toBe(true);
            expect(matchGlob('*.get', 'tasks.get')).toBe(true);
        });

        it('matches a middle segment', () => {
            expect(matchGlob('sprints.*.get', 'sprints.tasks.get')).toBe(true);
            expect(matchGlob('sprints.*.get', 'sprints.users.get')).toBe(true);
        });
    });

    describe('** (zero or more segments)', () => {
        it('matches zero segments', () => {
            expect(matchGlob('**', '')).toBe(true);
        });

        it('matches any number of segments', () => {
            expect(matchGlob('**', 'sprints')).toBe(true);
            expect(matchGlob('**', 'sprints.get')).toBe(true);
            expect(matchGlob('**', 'a.b.c.d')).toBe(true);
        });

        it('matches as a suffix', () => {
            expect(matchGlob('sprints.**', 'sprints.get')).toBe(true);
            expect(matchGlob('sprints.**', 'sprints.tasks.list')).toBe(true);
        });

        it('matches as a prefix', () => {
            expect(matchGlob('**.get', 'sprints.get')).toBe(true);
            expect(matchGlob('**.get', 'a.b.c.get')).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('single segment pattern against single segment name', () => {
            expect(matchGlob('sprints', 'sprints')).toBe(true);
        });

        it('different length segments do not match without wildcards', () => {
            expect(matchGlob('a.b', 'a.b.c')).toBe(false);
            expect(matchGlob('a.b.c', 'a.b')).toBe(false);
        });

        it('** between segments matches intermediate segments', () => {
            expect(matchGlob('a.**.z', 'a.z')).toBe(true);
            expect(matchGlob('a.**.z', 'a.b.z')).toBe(true);
            expect(matchGlob('a.**.z', 'a.b.c.z')).toBe(true);
        });

        it('multiple consecutive ** collapses correctly', () => {
            expect(matchGlob('**.**', 'a.b')).toBe(true);
            expect(matchGlob('**.**', 'a')).toBe(true);
        });
    });

    describe('security: adversarial patterns', () => {
        it('does NOT hang on deeply nested ** backtracking', () => {
            // This pattern + name would cause O(2^n) in a naive recursive impl.
            // With bounded iteration, it returns false quickly.
            const pattern = '**.**.**.**.**';
            const name = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.no-match';

            const start = performance.now();
            const result = matchGlob(pattern, name);
            const duration = performance.now() - start;

            // Should complete in well under 100ms (bounded iterations)
            expect(duration).toBeLessThan(100);
            // Result doesn't matter — the safety guarantee is it terminates
            expect(typeof result).toBe('boolean');
        });

        it('handles long tool names gracefully', () => {
            const segments = Array.from({ length: 50 }, (_, i) => `seg${i}`);
            const name = segments.join('.');

            expect(matchGlob('**', name)).toBe(true);
            expect(matchGlob('seg0.**', name)).toBe(true);
            expect(matchGlob('nonexistent.**', name)).toBe(false);
        });
    });
});
