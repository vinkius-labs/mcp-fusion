/**
 * PolicyValidator — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { validatePolicies, validateDefaults } from '../../../src/framework/state-sync/PolicyValidator.js';

describe('PolicyValidator', () => {
    describe('validatePolicies', () => {
        it('accepts valid policies', () => {
            expect(() => validatePolicies([
                { match: 'sprints.*', cacheControl: 'no-store' },
                { match: 'tasks.update', invalidates: ['tasks.*'] },
                { match: 'countries.*', cacheControl: 'immutable' },
            ])).not.toThrow();
        });

        it('accepts policies without cacheControl or invalidates', () => {
            expect(() => validatePolicies([
                { match: 'sprints.*' },
            ])).not.toThrow();
        });

        it('rejects empty match', () => {
            expect(() => validatePolicies([
                { match: '' },
            ])).toThrow('must be a non-empty string');
        });

        it('rejects invalid glob segments', () => {
            expect(() => validatePolicies([
                { match: 'sprints.***' },
            ])).toThrow('invalid segment');
        });

        it('rejects invalid cacheControl values', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => validatePolicies([
                { match: 'sprints.*', cacheControl: 'max-age=60' as any },
            ])).toThrow('invalid cacheControl');
        });

        it('rejects non-array invalidates', () => {
            expect(() => validatePolicies([
                { match: 'sprints.*', invalidates: 'not-an-array' as unknown as string[] },
            ])).toThrow('must be an array');
        });

        it('rejects empty string in invalidates', () => {
            expect(() => validatePolicies([
                { match: 'sprints.*', invalidates: ['valid.*', ''] },
            ])).toThrow('non-empty strings');
        });

        it('rejects invalid glob segments in invalidates', () => {
            expect(() => validatePolicies([
                { match: 'sprints.update', invalidates: ['sprints.***'] },
            ])).toThrow('invalid segment');
        });
    });

    describe('validateDefaults', () => {
        it('accepts valid defaults', () => {
            expect(() => validateDefaults({ cacheControl: 'no-store' })).not.toThrow();
            expect(() => validateDefaults({ cacheControl: 'immutable' })).not.toThrow();
        });

        it('accepts undefined defaults', () => {
            expect(() => validateDefaults()).not.toThrow();
            expect(() => validateDefaults(undefined)).not.toThrow();
        });

        it('rejects invalid default cacheControl', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => validateDefaults({ cacheControl: 'public' as any })).toThrow('invalid');
        });
    });
});
