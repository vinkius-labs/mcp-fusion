/**
 * CausalEngine — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { resolveInvalidations } from '../../src/state-sync/CausalEngine.js';

describe('CausalEngine', () => {
    it('returns invalidation patterns on success', () => {
        const policy = { invalidates: ['sprints.*', 'tasks.*'] };
        expect(resolveInvalidations(policy, false)).toEqual(['sprints.*', 'tasks.*']);
    });

    it('returns empty array on error (isError guard)', () => {
        const policy = { invalidates: ['sprints.*'] };
        expect(resolveInvalidations(policy, true)).toEqual([]);
    });

    it('returns empty array when policy has no invalidates', () => {
        const policy = { cacheControl: 'no-store' as const };
        expect(resolveInvalidations(policy, false)).toEqual([]);
    });

    it('returns empty array when policy is null', () => {
        expect(resolveInvalidations(null, false)).toEqual([]);
    });

    it('returns empty array when policy is null and isError is true', () => {
        expect(resolveInvalidations(null, true)).toEqual([]);
    });
});
