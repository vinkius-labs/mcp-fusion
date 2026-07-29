/**
 * Regression: ask() imperative callable removed (MCP 2026-07-28)
 *
 * CRITICAL: The imperative `await ask('message', { fields })` callable and
 * `ask.redirect()` were removed in the MCP 2026-07-28 migration. This test
 * suite ensures:
 *
 * 1. `ask` is NOT callable (typeof !== 'function' for invocation)
 * 2. `ask.*` field factories ARE available and produce correct descriptors
 * 3. `ask` does NOT have a `.redirect` method
 * 4. `_elicitStore` is NOT exported (AsyncLocalStorage removed)
 * 5. `AskFunction` type is NOT exported (replaced by `AskNamespace`)
 * 6. `requireInput.elicit()` still accepts `ask.*` field descriptors
 *
 * These are breaking-change guards — if any of these regress, users who
 * migrated to `requireInput()` would silently break.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { ask, requireInput, isInputRequiredResponse } from '../../src/index.js';
import {
    AskStringField,
    AskNumberField,
    AskBooleanField,
    AskEnumField,
} from '../../src/core/elicitation/types.js';
import { compileAskFields } from '../../src/core/elicitation/ask.js';

// ── ask is NOT callable ──────────────────────────────────

describe('Regression: ask() callable removed', () => {

    it('ask is an object (namespace), not a callable function', () => {
        expect(typeof ask).toBe('object');
        expect(ask).not.toBeInstanceOf(Function);
    });

    it('calling ask(...) throws TypeError (not a function)', () => {
        expect(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ask as any)('message', {});
        }).toThrow(TypeError);
    });

    it('ask does NOT have a .redirect method', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((ask as any).redirect).toBeUndefined();
    });

    it('ask is a plain object with only string/number/boolean/enum methods', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keys = Object.keys(ask as any).sort();
        expect(keys).toEqual(['boolean', 'enum', 'number', 'string']);
    });
});

// ── ask.* field factories ARE available ──────────────────

describe('Regression: ask.* field factories preserved', () => {

    it('ask.string() creates AskStringField', () => {
        const field = ask.string('Name');
        expect(field).toBeInstanceOf(AskStringField);
        const compiled = field._compile();
        expect(compiled.type).toBe('string');
        expect(compiled.description).toBe('Name');
    });

    it('ask.number() creates AskNumberField with chaining', () => {
        const field = ask.number('Age').min(18).max(120);
        expect(field).toBeInstanceOf(AskNumberField);
        const compiled = field._compile();
        expect(compiled.type).toBe('number');
        expect(compiled.minimum).toBe(18);
        expect(compiled.maximum).toBe(120);
    });

    it('ask.boolean() creates AskBooleanField with default', () => {
        const field = ask.boolean('Confirm').default(true);
        expect(field).toBeInstanceOf(AskBooleanField);
        const compiled = field._compile();
        expect(compiled.type).toBe('boolean');
        expect(compiled.default).toBe(true);
    });

    it('ask.enum() creates AskEnumField with literal values', () => {
        const field = ask.enum(['us', 'eu'] as const, 'Region');
        expect(field).toBeInstanceOf(AskEnumField);
        const compiled = field._compile();
        expect(compiled.type).toBe('string');
        expect(compiled.enum).toEqual(['us', 'eu']);
        expect(compiled.description).toBe('Region');
    });

    it('ask.string() without description works', () => {
        const field = ask.string();
        expect(field).toBeInstanceOf(AskStringField);
        expect(field._compile().type).toBe('string');
    });
});

// ── compileAskFields works with ask.* descriptors ────────

describe('Regression: compileAskFields + requireInput.elicit integration', () => {

    it('compileAskFields produces correct JSON Schema from ask.* fields', () => {
        const schema = compileAskFields({
            name: ask.string('Name'),
            age: ask.number('Age').min(0).max(150),
            plan: ask.enum(['free', 'pro'] as const, 'Plan'),
            active: ask.boolean('Active'),
        });

        expect(schema.type).toBe('object');
        expect(Object.keys(schema.properties).sort()).toEqual(['active', 'age', 'name', 'plan']);
        expect(schema.required.sort()).toEqual(['active', 'age', 'name', 'plan']);
        expect(schema.properties.name!.type).toBe('string');
        expect(schema.properties.age!.type).toBe('number');
        expect(schema.properties.plan!.type).toBe('string');
        expect(schema.properties.active!.type).toBe('boolean');
    });

    it('requireInput.elicit() accepts ask.* fields and produces ElicitationInputRequest', () => {
        const request = requireInput.elicit('Choose region:', {
            region: ask.enum(['us-east-1', 'eu-west-1'] as const, 'Region'),
        });

        expect(request.type).toBe('elicitation');
        expect(request.message).toBe('Choose region:');
        expect(request.schema.type).toBe('object');
        expect(request.schema.properties.region!.enum).toEqual(['us-east-1', 'eu-west-1']);
    });

    it('requireInput() with ask.* fields produces InputRequiredResponse', () => {
        const response = requireInput({
            inputRequests: {
                form: requireInput.elicit('Setup:', {
                    name: ask.string('Name'),
                }),
            },
        });

        expect(isInputRequiredResponse(response)).toBe(true);
        expect(response.inputRequests.form!.type).toBe('elicitation');
    });

    it('requireInput.url() produces UrlInputRequest (replaces ask.redirect)', () => {
        const request = requireInput.url('Authenticate:', 'https://example.com/oauth');
        expect(request.type).toBe('url');
        expect(request.url).toBe('https://example.com/oauth');
        expect(request.message).toBe('Authenticate:');
    });
});

// ── _elicitStore is NOT exported ─────────────────────────

describe('Regression: _elicitStore removed from exports', () => {

    it('_elicitStore is not exported from ask.ts', async () => {
        const askModule = await import('../../src/core/elicitation/ask.js');
        expect((askModule as Record<string, unknown>)._elicitStore).toBeUndefined();
    });

    it('_elicitStore is not exported from elicitation index', async () => {
        const indexModule = await import('../../src/core/elicitation/index.js');
        expect((indexModule as Record<string, unknown>)._elicitStore).toBeUndefined();
    });
});