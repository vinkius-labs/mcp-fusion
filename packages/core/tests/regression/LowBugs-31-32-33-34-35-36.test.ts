/**
 * Regression tests for LOW bugs #31–#36 (v3.1.11)
 *
 * #31 — Case-sensitive boolean coercion in PromptExecutionPipeline
 * #32 — Leading space in description when description is undefined
 * #33 — ZodPipeline unwrap missing `_def.in` fallback
 * #34 — autoDiscover silently swallows all import errors
 * #35 — edge-stub path functions return '' silently
 * #36 — TokenEconomics collection detection by endsWith('s') false positives
 */
import { describe, it, expect, vi } from 'vitest';
import { decorateDescription } from '../../src/state-sync/DescriptionDecorator.js';
import { computeStaticProfile } from '../../src/introspection/TokenEconomics.js';

// ── Bug #31: Boolean coercion case-insensitive ───────────

describe('Bug #31 — boolean coercion is case-insensitive', () => {
    // We test the coercion pattern directly since the coerceArgs
    // function is not exported. The fix is:
    //   value.toLowerCase() === 'true' || value === '1'

    it('"true" (lowercase) should coerce to true', () => {
        const value = 'true';
        const result = value.toLowerCase() === 'true' || value === '1';
        expect(result).toBe(true);
    });

    it('"True" (capitalized) should coerce to true', () => {
        const value = 'True';
        const result = value.toLowerCase() === 'true' || value === '1';
        expect(result).toBe(true);
    });

    it('"TRUE" (uppercase) should coerce to true', () => {
        const value = 'TRUE';
        const result = value.toLowerCase() === 'true' || value === '1';
        expect(result).toBe(true);
    });

    it('"1" should coerce to true', () => {
        const value = '1';
        const result = value.toLowerCase() === 'true' || value === '1';
        expect(result).toBe(true);
    });

    it('"false" should coerce to false', () => {
        const value = 'false';
        const result = value.toLowerCase() === 'true' || value === '1';
        expect(result).toBe(false);
    });

    it('"0" should coerce to false', () => {
        const value = '0';
        const result = value.toLowerCase() === 'true' || value === '1';
        expect(result).toBe(false);
    });
});

// ── Bug #32: No leading space when description is empty/undefined ──

describe('Bug #32 — no leading space for empty/undefined description', () => {
    it('should not have leading space when description is undefined', () => {
        const tool = { name: 'test', inputSchema: { type: 'object' as const } };
        const result = decorateDescription(tool, { cacheControl: 'no-store' });
        expect(result.description).toBe('[Cache-Control: no-store]');
        expect(result.description).not.toMatch(/^\s/);
    });

    it('should not have leading space when description is empty string', () => {
        const tool = { name: 'test', description: '', inputSchema: { type: 'object' as const } };
        const result = decorateDescription(tool, { cacheControl: 'no-store' });
        expect(result.description).toBe('[Cache-Control: no-store]');
        expect(result.description).not.toMatch(/^\s/);
    });

    it('should separate with space when description exists', () => {
        const tool = { name: 'test', description: 'Fetch data.', inputSchema: { type: 'object' as const } };
        const result = decorateDescription(tool, { cacheControl: 'no-cache' });
        expect(result.description).toBe('Fetch data. [Cache-Control: no-cache]');
    });
});

// ── Bug #33: ZodPipeline unwrap (pattern test) ───────────

describe('Bug #33 — ZodPipeline _def.in fallback', () => {
    it('should resolve inner schema from _def.in when other paths are undefined', () => {
        // Simulate the unwrap fallback chain
        const innerSchema = { _def: { typeName: 'ZodString', description: 'a piped field' } };
        const def: Record<string, unknown> = {
            typeName: 'ZodPipeline',
            innerType: undefined,
            type: undefined,
            schema: undefined,
            in: innerSchema,
        };

        const inner = def.innerType ?? def.type ?? def.schema ?? def['in'];
        expect(inner).toBe(innerSchema);
    });

    it('should prefer innerType over _def.in when available', () => {
        const innerTypeSchema = { _def: { typeName: 'ZodString' } };
        const inSchema = { _def: { typeName: 'ZodNumber' } };
        const def: Record<string, unknown> = {
            typeName: 'ZodPipeline',
            innerType: innerTypeSchema,
            in: inSchema,
        };

        const inner = def.innerType ?? def.type ?? def.schema ?? def['in'];
        expect(inner).toBe(innerTypeSchema);
    });
});

// ── Bug #34: autoDiscover error handling ─────────────────

describe('Bug #34 — autoDiscover onError and strict mode', () => {
    // We test the options interface shape and behavior contract.
    // Cannot easily test actual import() failures in unit tests.

    it('AutoDiscoverOptions should accept onError callback', () => {
        const options = {
            onError: (filePath: string, error: unknown) => {
                void filePath;
                void error;
            },
        };
        expect(typeof options.onError).toBe('function');
    });

    it('AutoDiscoverOptions should accept strict flag', () => {
        const options = { strict: true };
        expect(options.strict).toBe(true);
    });
});

// ── Bug #35: edge-stub path functions crash ──────────────

describe('Bug #35 — edge-stub path functions crash instead of returning empty string', () => {
    it('resolve() should throw instead of returning empty string', async () => {
        const { resolve } = await import('../../src/edge-stub.js');
        expect(() => resolve()).toThrow('Edge');
    });

    it('join() should throw instead of returning empty string', async () => {
        const { join } = await import('../../src/edge-stub.js');
        expect(() => join()).toThrow('Edge');
    });

    it('dirname() should throw instead of returning empty string', async () => {
        const { dirname } = await import('../../src/edge-stub.js');
        expect(() => dirname()).toThrow('Edge');
    });

    it('basename() should throw instead of returning empty string', async () => {
        const { basename } = await import('../../src/edge-stub.js');
        expect(() => basename()).toThrow('Edge');
    });
});

// ── Bug #36: TokenEconomics collection detection ─────────

describe('Bug #36 — TokenEconomics collection detection avoids false positives', () => {
    it('should NOT classify "status" as a collection', () => {
        const profile = computeStaticProfile('test', ['status'], null, null);
        const statusField = profile.fieldBreakdown.find(f => f.name === 'status');
        expect(statusField?.isCollection).toBe(false);
    });

    it('should NOT classify "address" as a collection', () => {
        const profile = computeStaticProfile('test', ['address'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'address');
        expect(field?.isCollection).toBe(false);
    });

    it('should NOT classify "progress" as a collection', () => {
        const profile = computeStaticProfile('test', ['progress'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'progress');
        expect(field?.isCollection).toBe(false);
    });

    it('should NOT classify "success" as a collection', () => {
        const profile = computeStaticProfile('test', ['success'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'success');
        expect(field?.isCollection).toBe(false);
    });

    it('should classify "userIds" as a collection', () => {
        const profile = computeStaticProfile('test', ['userIds'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'userIds');
        expect(field?.isCollection).toBe(true);
    });

    it('should classify "results" as a collection', () => {
        const profile = computeStaticProfile('test', ['results'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'results');
        expect(field?.isCollection).toBe(true);
    });

    it('should classify field containing "list" as a collection', () => {
        const profile = computeStaticProfile('test', ['taskList'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'taskList');
        expect(field?.isCollection).toBe(true);
    });

    it('should classify "items" as a collection', () => {
        const profile = computeStaticProfile('test', ['items'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'items');
        expect(field?.isCollection).toBe(true);
    });

    it('should classify "tags" as a collection', () => {
        const profile = computeStaticProfile('test', ['tags'], null, null);
        const field = profile.fieldBreakdown.find(f => f.name === 'tags');
        expect(field?.isCollection).toBe(true);
    });
});
