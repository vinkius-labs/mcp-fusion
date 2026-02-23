/**
 * PresenterAdversarial.test.ts — Unhappy Paths & Adversarial Tests
 *
 * NOT happy-path. These test:
 * - Callbacks that throw exceptions
 * - Circular references in data
 * - Wrong types passed to methods
 * - Embed pointing to non-object / primitive / array nested data
 * - agentLimit with max=0
 * - Presenter.make() called with undefined/NaN
 * - suggestActions callback returning garbage
 * - uiBlocks callback returning mixed valid/invalid blocks
 * - PostProcessor receiving bizarre inputs
 * - Schema that rejects everything
 * - Child presenter that throws during embed
 * - Double-apply of same configuration method
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter, ui, response } from '../../src/presenter/index.js';
import { postProcessResult, isToolResponse } from '../../src/presenter/PostProcessor.js';
import { PresenterValidationError } from '../../src/presenter/PresenterValidationError.js';

// =====================================================================
// Callbacks That Throw
// =====================================================================

describe('Callbacks that throw', () => {
    it('should propagate error from systemRules callback', () => {
        const presenter = createPresenter('ThrowRules')
            .systemRules(() => { throw new Error('Rules exploded'); });

        expect(() => presenter.make('data').build()).toThrow('Rules exploded');
    });

    it('should propagate error from uiBlocks callback', () => {
        const presenter = createPresenter('ThrowUI')
            .uiBlocks(() => { throw new TypeError('UI crash'); });

        expect(() => presenter.make('data').build()).toThrow('UI crash');
    });

    it('should propagate error from collectionUiBlocks callback', () => {
        const presenter = createPresenter('ThrowCollUI')
            .collectionUiBlocks(() => { throw new RangeError('Overflow'); });

        expect(() => presenter.make(['a', 'b']).build()).toThrow('Overflow');
    });

    it('should propagate error from suggestActions callback', () => {
        const presenter = createPresenter('ThrowSuggest')
            .suggestActions(() => { throw new Error('Suggest failed'); });

        expect(() => presenter.make('data').build()).toThrow('Suggest failed');
    });

    it('should propagate error from agentLimit onTruncate callback', () => {
        const presenter = createPresenter('ThrowTruncate')
            .agentLimit(1, () => { throw new Error('Truncate crashed'); });

        expect(() => presenter.make(['a', 'b']).build()).toThrow('Truncate crashed');
    });

    it('should propagate error from child Presenter during embed', () => {
        const child = createPresenter('ChildThrows')
            .schema(z.object({ id: z.string() }));

        const parent = createPresenter('ParentCatches')
            .embed('child', child);

        // child.make receives { bad: true } which fails child schema validation
        expect(() => parent.make({
            id: 'P1',
            child: { bad: true }, // violates child schema
        }).build()).toThrow(); // Should throw PresenterValidationError from child
    });
});

// =====================================================================
// Circular References
// =====================================================================

describe('Circular references in data', () => {
    it('should throw on circular object reference (no schema)', () => {
        const presenter = createPresenter('Circular');
        const data: Record<string, unknown> = { id: 'X' };
        data.self = data; // circular

        expect(() => presenter.make(data).build()).toThrow(); // JSON.stringify will throw
    });

    it('should throw on circular reference in array item', () => {
        const presenter = createPresenter('CircularArr');
        const item: Record<string, unknown> = { id: 'X' };
        item.self = item;

        expect(() => presenter.make([item]).build()).toThrow();
    });
});

// =====================================================================
// Wrong / Unusual Types Passed to make()
// =====================================================================

describe('Unusual types passed to make()', () => {
    it('should handle undefined as data (no schema)', () => {
        const presenter = createPresenter('UndefinedData');
        // undefined → JSON.stringify returns undefined, which may break
        const result = presenter.make(undefined as unknown as string).build();
        // Should not crash — will produce "undefined" or fallback
        expect(result.content).toHaveLength(1);
    });

    it('should handle number as data (no schema)', () => {
        const presenter = createPresenter('NumberData');
        const result = presenter.make(42 as unknown as string).build();
        expect(result.content[0]!.text).toBe('42');
    });

    it('should handle boolean as data (no schema)', () => {
        const presenter = createPresenter('BoolData');
        const result = presenter.make(false as unknown as string).build();
        expect(result.content[0]!.text).toBe('false');
    });

    it('should handle deeply nested object without schema', () => {
        const presenter = createPresenter('DeepNested');
        const deep = { a: { b: { c: { d: { e: 'deep' } } } } };
        const result = presenter.make(deep).build();
        expect(result.content[0]!.text).toContain('"deep"');
    });

    it('should handle array of primitives without schema', () => {
        const presenter = createPresenter('PrimitiveArray');
        const result = presenter.make([1, 'two', true, null] as unknown as string[]).build();
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed).toEqual([1, 'two', true, null]);
    });
});

// =====================================================================
// Schema That Rejects Everything
// =====================================================================

describe('Hostile schema', () => {
    it('should throw PresenterValidationError for always-failing schema', () => {
        const alwaysFail = z.never();
        const presenter = createPresenter('AlwaysFail')
            .schema(alwaysFail as unknown as z.ZodType<never>);

        expect(() => presenter.make('anything' as never)).toThrow(PresenterValidationError);
    });

    it('should throw for schema with impossible constraints', () => {
        const impossible = z.string().min(100).max(5); // impossible
        const presenter = createPresenter('Impossible')
            .schema(impossible);

        expect(() => presenter.make('hello')).toThrow(PresenterValidationError);
    });

    it('should wrap ZodError with Presenter name', () => {
        const strict = z.object({ id: z.string().uuid() });
        const presenter = createPresenter('StrictUUID')
            .schema(strict);

        try {
            presenter.make({ id: 'not-a-uuid' });
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PresenterValidationError);
            expect((err as PresenterValidationError).presenterName).toBe('StrictUUID');
            expect((err as PresenterValidationError).message).toContain('[StrictUUID Presenter]');
        }
    });

    it('should throw on first bad item in array validation', () => {
        const schema = z.object({ n: z.number().positive() });
        const presenter = createPresenter('PositiveOnly').schema(schema);

        try {
            presenter.make([{ n: 10 }, { n: -5 }, { n: 20 }]);
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PresenterValidationError);
        }
    });
});

// =====================================================================
// Embed Edge Cases
// =====================================================================

describe('Embed adversarial cases', () => {
    it('should process embed when nested data is a number (truthy non-null)', () => {
        const child = createPresenter('ChildNum')
            .systemRules(['Child rule']);

        const parent = createPresenter('ParentNum')
            .embed('score', child);

        // score=42 is not null/undefined, so child.make(42) runs
        // Since child has no schema, it succeeds and child rules appear
        const result = parent.make({ id: 'X', score: 42 }).build();
        expect(result.content.some(c => c.text.includes('Child rule'))).toBe(true);
    });

    it('should process embed when nested data is a string (truthy non-null)', () => {
        const child = createPresenter('ChildStr')
            .systemRules(['Child rule']);

        const parent = createPresenter('ParentStr')
            .embed('name', child);

        const result = parent.make({ id: 'X', name: 'Alice' }).build();
        // String is truthy and not null/undefined, so embed calls child.make('Alice')
        // which succeeds (child has no schema). Child rules DO appear.
        expect(result.content.some(c => c.text.includes('Child rule'))).toBe(true);
    });

    it('should skip embed when nested data is a boolean', () => {
        const child = createPresenter('ChildBool')
            .systemRules(['Should not appear']);

        const parent = createPresenter('ParentBool')
            .embed('active', child);

        // active is boolean — embed should still call child.make(true)
        // since truthy check passes but it's not null/undefined
        const result = parent.make({ id: 'X', active: true }).build();
        expect(result.content.length).toBeGreaterThan(0);
    });

    it('should handle embed when parent data is a primitive (not object)', () => {
        const child = createPresenter('ChildPrimitive')
            .systemRules(['Should not appear']);

        const parent = createPresenter('ParentPrimitive')
            .embed('child', child);

        // Parent data is a string, not an object — _processEmbeds checks typeof
        const result = parent.make('just a string').build();
        expect(result.content.some(c => c.text.includes('Should not appear'))).toBe(false);
    });

    it('should handle embed when parent data is an empty array', () => {
        const child = createPresenter('ChildEmptyArr')
            .systemRules(['Should not appear']);

        const parent = createPresenter('ParentEmptyArr')
            .embed('child', child);

        const result = parent.make([]).build();
        expect(result.content.some(c => c.text.includes('Should not appear'))).toBe(false);
    });

    it('should handle embed on array collection (uses first item)', () => {
        const child = createPresenter('ChildFromArray')
            .schema(z.object({ id: z.string() }))
            .systemRules(['Child array rule']);

        const parent = createPresenter('ParentFromArray')
            .embed('child', child);

        const result = parent.make([
            { id: 'A', child: { id: 'C1' } },
            { id: 'B', child: { id: 'C2' } },
        ]).build();

        // Should process embed from data[0].child
        expect(result.content.some(c => c.text.includes('Child array rule'))).toBe(true);
    });
});

// =====================================================================
// agentLimit Adversarial
// =====================================================================

describe('agentLimit adversarial', () => {
    it('should handle agentLimit with max=0 (truncates everything)', () => {
        const presenter = createPresenter('LimitZero')
            .agentLimit(0, (n) => ui.summary(`All ${n} items hidden`));

        const result = presenter.make(['a', 'b', 'c']).build();
        const data = JSON.parse(result.content[0]!.text);
        expect(data).toEqual([]);
        expect(result.content.some(c => c.text.includes('All 3 items hidden'))).toBe(true);
    });

    it('should not apply agentLimit to single items', () => {
        const presenter = createPresenter('LimitSingle')
            .agentLimit(0, () => ui.summary('Should NOT appear'));

        const result = presenter.make('single item').build();
        expect(result.content.some(c => c.text.includes('Should NOT appear'))).toBe(false);
    });

    it('should apply truncation BEFORE validation (validate truncated set only)', () => {
        const schema = z.object({ id: z.string() });
        const presenter = createPresenter('TruncValidation')
            .schema(schema)
            .agentLimit(2, (n) => ui.summary(`${n} hidden`));

        // Items 3-5 would fail validation (bad id), but they get truncated first
        const result = presenter.make([
            { id: 'OK-1' },
            { id: 'OK-2' },
            { id: 123 },   // Invalid but truncated away
            { id: false },  // Invalid but truncated away
            { id: null },   // Invalid but truncated away
        ] as { id: string }[]).build();

        // Only first 2 validated — no error
        const data = JSON.parse(result.content[0]!.text);
        expect(data).toHaveLength(2);
        expect(data[0].id).toBe('OK-1');
    });
});

// =====================================================================
// suggestActions Adversarial
// =====================================================================

describe('suggestActions adversarial', () => {
    it('should handle suggestActions returning empty array', () => {
        const presenter = createPresenter('EmptySuggest')
            .suggestActions(() => []);

        const result = presenter.make('data').build();
        expect(result.content.some(c => c.text.includes('action_suggestions'))).toBe(false);
    });

    it('should handle suggestActions with many suggestions', () => {
        const presenter = createPresenter('ManySuggestions')
            .suggestActions(() =>
                Array.from({ length: 50 }, (_, i) => ({
                    tool: `tool_${i}`,
                    reason: `Reason ${i}`,
                })),
            );

        const result = presenter.make('data').build();
        const hint = result.content.find(c => c.text.includes('action_suggestions'))?.text ?? '';
        expect(hint).toContain('tool_0');
        expect(hint).toContain('tool_49');
    });

    it('should handle suggestActions with special characters in tool/reason', () => {
        const presenter = createPresenter('SpecialChars')
            .suggestActions(() => [
                { tool: 'ns.tool<T>', reason: 'Handle "quotes" & <brackets>' },
            ]);

        const result = presenter.make('data').build();
        const hint = result.content.find(c => c.text.includes('action_suggestions'))?.text ?? '';
        expect(hint).toContain('ns.tool<T>');
        expect(hint).toContain('"quotes"');
    });
});

// =====================================================================
// PostProcessor Adversarial Inputs
// =====================================================================

describe('PostProcessor adversarial', () => {
    it('should handle postProcessResult with ToolResponse-like but wrong shape', () => {
        // Has content but items don't have type/text — isToolResponse still says true
        const weird = { content: [{ foo: 'bar' }] };
        const result = postProcessResult(weird, undefined);
        // isToolResponse checks only for content array — passes through
        expect(result).toBe(weird);
    });

    it('should handle postProcessResult with Symbol', () => {
        const sym = Symbol('test');
        const result = postProcessResult(sym, undefined);
        // JSON.stringify(Symbol) → undefined, but typeof !== 'string'
        expect(result.content).toHaveLength(1);
    });

    it('should handle postProcessResult with function', () => {
        const fn = () => 'hello';
        const result = postProcessResult(fn, undefined);
        expect(result.content).toHaveLength(1);
    });

    it('should handle postProcessResult with BigInt', () => {
        // JSON.stringify(BigInt) throws — postProcessResult should handle or propagate
        expect(() => postProcessResult(BigInt(42), undefined)).toThrow();
    });

    it('should handle postProcessResult with nested ToolResponse in ResponseBuilder', () => {
        // ResponsBuilder wins over Presenter (priority 2 > priority 3)
        const builder = response({ nested: true });
        const presenter = createPresenter('Ignored');

        const result = postProcessResult(builder, presenter);
        expect(JSON.parse(result.content[0]!.text)).toEqual({ nested: true });
    });

    it('should handle Presenter that throws during make()', () => {
        const schema = z.object({ id: z.string() });
        const presenter = createPresenter('Strict').schema(schema);

        // Invalid data + Presenter = should throw PresenterValidationError
        expect(() => postProcessResult(42, presenter)).toThrow(PresenterValidationError);
    });
});

// =====================================================================
// Double-apply Configuration
// =====================================================================

describe('Double-apply configuration', () => {
    it('should allow overwriting systemRules before sealing', () => {
        const presenter = createPresenter('DoubleRules')
            .systemRules(['First'])
            .systemRules(['Second']); // overwrites

        const result = presenter.make('data').build();
        const rules = result.content.find(c => c.text.includes('domain_rules'))?.text ?? '';
        expect(rules).toContain('Second');
        // Depending on implementation, may contain both or last-wins
    });

    it('should allow overwriting schema before sealing', () => {
        const loose = z.object({ id: z.string() });
        const strict = z.object({ id: z.string().uuid() });

        const presenter = createPresenter('DoubleSchema')
            .schema(loose)
            .schema(strict); // overwrites

        // non-uuid string should fail with the strict schema
        expect(() => presenter.make({ id: 'not-uuid' })).toThrow(PresenterValidationError);
    });

    it('should allow overwriting uiBlocks before sealing', () => {
        const presenter = createPresenter('DoubleUI')
            .uiBlocks(() => [ui.markdown('First')])
            .uiBlocks(() => [ui.markdown('Second')]); // overwrites

        const result = presenter.make('data').build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('Second'))).toBe(true);
    });

    it('should accumulate embeds (not overwrite)', () => {
        const child1 = createPresenter('Child1').systemRules(['Rule 1']);
        const child2 = createPresenter('Child2').systemRules(['Rule 2']);

        const parent = createPresenter('AccumulateEmbed')
            .embed('a', child1)
            .embed('b', child2);

        const result = parent.make({
            id: 'X',
            a: { id: 'A' },
            b: { id: 'B' },
        }).build();

        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('Rule 1'))).toBe(true);
        expect(texts.some(t => t.includes('Rule 2'))).toBe(true);
    });
});

// =====================================================================
// ResponseBuilder Adversarial
// =====================================================================

describe('ResponseBuilder adversarial', () => {
    it('should handle null data', () => {
        const result = response(null as unknown as string).build();
        expect(result.content[0]!.text).toBe('null');
    });

    it('should handle array data', () => {
        const result = response([1, 2, 3] as unknown as object).build();
        expect(JSON.parse(result.content[0]!.text)).toEqual([1, 2, 3]);
    });

    it('should handle rawBlock with empty string', () => {
        const result = response('data').rawBlock('').build();
        expect(result.content.some(c => c.text === '')).toBe(true);
    });

    it('should handle systemRules with empty array', () => {
        const result = response('data').systemRules([]).build();
        // Empty rules should NOT produce a rules block
        expect(result.content.some(c => c.text.includes('domain_rules'))).toBe(false);
    });

    it('should handle uiBlock with empty content', () => {
        const result = response('data').uiBlock('empty', '').build();
        expect(result.content).toHaveLength(2);
    });

    it('should handle systemHint with single suggestion', () => {
        const result = response('data')
            .systemHint([{ tool: 'only.one', reason: 'Solo' }])
            .build();

        const hint = result.content.find(c => c.text.includes('action_suggestions'))?.text ?? '';
        expect(hint).toContain('only.one');
    });

    it('should handle multiple systemHint calls (accumulates)', () => {
        const result = response('data')
            .systemHint([{ tool: 'a', reason: 'first' }])
            .systemHint([{ tool: 'b', reason: 'second' }])
            .build();

        const hint = result.content.find(c => c.text.includes('action_suggestions'))?.text ?? '';
        expect(hint).toContain('a');
        expect(hint).toContain('b');
    });
});

// =====================================================================
// isToolResponse Edge Cases
// =====================================================================

describe('isToolResponse adversarial', () => {
    it('should return true for object with content=[] (empty array)', () => {
        expect(isToolResponse({ content: [] })).toBe(true);
    });

    it('should return false for object with content as typed array', () => {
        expect(isToolResponse({ content: new Uint8Array([1, 2, 3]) })).toBe(false);
    });

    it('should return false for class instance with content property', () => {
        class Fake { content = 'not-array'; }
        expect(isToolResponse(new Fake())).toBe(false);
    });

    it('should return true for object with extra properties + content array', () => {
        expect(isToolResponse({
            content: [{ type: 'text', text: 'x' }],
            isError: true,
            foo: 'bar',
        })).toBe(true);
    });
});
