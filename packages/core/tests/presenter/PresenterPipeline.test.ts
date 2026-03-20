/**
 * PresenterPipeline — Unit Tests
 *
 * Covers the pure step functions extracted from `Presenter.make()`:
 *   - stepValidate: Zod schema validation (single + array)
 *   - stepRedact: DLP redaction (single + array, lazy compile, passthrough)
 *   - stepTruncate: agentLimit cognitive guardrail
 *   - stepRules: static + dynamic rule resolution
 *   - executePipeline: orchestrator contract
 *
 * Each step is tested in isolation — no Presenter instance required.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    stepValidate,
    stepRedact,
    stepTruncate,
    stepRules,
    executePipeline,
    type PresenterSnapshot,
} from '../../src/presenter/PresenterPipeline.js';
import { PresenterValidationError } from '../../src/presenter/PresenterValidationError.js';
import { ResponseBuilder } from '../../src/presenter/ResponseBuilder.js';

// ── Snapshot factory ──────────────────────────────────────────────────────────

function makeSnapshot<T>(overrides: Partial<PresenterSnapshot<T>> = {}): PresenterSnapshot<T> {
    return {
        name:                  'TestPresenter',
        schema:                undefined,
        rules:                 [],
        collectionRules:       [],
        embeds:                [],
        ...overrides,
    };
}

// =============================================================================
// stepValidate — Zod schema validation
// =============================================================================

describe('stepValidate — single item', () => {
    const schema = z.object({ id: z.string(), count: z.number() });

    it('should return data unchanged when no schema is configured', () => {
        const raw = { id: 'x', count: 1, extra: true };
        const snapshot = makeSnapshot();
        const result = stepValidate(raw, false, snapshot);
        expect(result).toBe(raw);
    });

    it('should parse and return the validated object', () => {
        const snapshot = makeSnapshot({ schema });
        const result = stepValidate({ id: 'a1', count: 5 }, false, snapshot);
        expect(result).toEqual({ id: 'a1', count: 5 });
    });

    it('should throw PresenterValidationError on schema mismatch', () => {
        const snapshot = makeSnapshot({ schema });
        expect(() =>
            stepValidate({ id: 123, count: 'wrong' }, false, snapshot),
        ).toThrow(PresenterValidationError);
    });
});

describe('stepValidate — array (pre-allocated)', () => {
    const schema = z.object({ id: z.string() });

    it('should validate each item independently', () => {
        const snapshot = makeSnapshot({ schema });
        const input = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const result = stepValidate(input, true, snapshot) as typeof input;

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ id: 'a' });
        expect(result[2]).toEqual({ id: 'c' });
    });

    it('should return a new pre-allocated array (not the same reference)', () => {
        const snapshot = makeSnapshot({ schema });
        const input = [{ id: 'x' }, { id: 'y' }];
        const result = stepValidate(input, true, snapshot);

        // New array — not mutated in place
        expect(result).not.toBe(input);
        expect(Array.isArray(result)).toBe(true);
        expect((result as typeof input).length).toBe(2);
    });

    it('should throw PresenterValidationError when any item fails validation', () => {
        const snapshot = makeSnapshot({ schema });
        const input = [{ id: 'ok' }, { id: 99 as unknown as string }];

        expect(() => stepValidate(input, true, snapshot)).toThrow(PresenterValidationError);
    });

    it('should handle large arrays without re-allocation overhead', () => {
        const snapshot = makeSnapshot({ schema });
        const input = Array.from({ length: 500 }, (_, i) => ({ id: `item-${i}` }));
        const result = stepValidate(input, true, snapshot) as typeof input;

        expect(result).toHaveLength(500);
        expect(result[499]).toEqual({ id: 'item-499' });
    });

    it('should handle empty array', () => {
        const snapshot = makeSnapshot({ schema });
        const result = stepValidate([], true, snapshot);
        expect(result).toEqual([]);
    });
});

// =============================================================================
// stepRedact — DLP redaction
// =============================================================================

describe('stepRedact — passthrough', () => {
    it('should return data unchanged when no redactor is configured', () => {
        const data = { email: 'user@example.com', name: 'Alice' };
        const snapshot = makeSnapshot<typeof data>();
        const result = stepRedact(data, false, snapshot);
        expect(result).toBe(data);
    });

    it('should return array unchanged when no redactor is configured', () => {
        const data = [{ email: 'a@b.com' }, { email: 'c@d.com' }];
        const snapshot = makeSnapshot<typeof data[0]>();
        const result = stepRedact(data, true, snapshot);
        expect(result).toBe(data);
    });
});

describe('stepRedact — with compiled redactor', () => {
    type Item = { name: string; email: string };

    function makeRedactorSnapshot(items?: Item[]): PresenterSnapshot<Item> {
        // Provide a simple mock redactor that masks the email field
        const mockRedactor = (obj: unknown) => {
            const item = obj as Item;
            return { ...item, email: '***' };
        };

        return makeSnapshot<Item>({
            compiledRedactor: mockRedactor as any,
        });
    }

    it('should apply redactor to a single item', () => {
        const snapshot = makeRedactorSnapshot();
        const result = stepRedact(
            { name: 'Alice', email: 'alice@example.com' },
            false,
            snapshot,
        ) as Item;

        expect(result.email).toBe('***');
        expect(result.name).toBe('Alice');
    });

    it('should apply redactor to each item in an array (pre-allocated)', () => {
        const snapshot = makeRedactorSnapshot();
        const input: Item[] = [
            { name: 'Alice', email: 'alice@a.com' },
            { name: 'Bob',   email: 'bob@b.com' },
            { name: 'Carol', email: 'carol@c.com' },
        ];

        const result = stepRedact(input, true, snapshot) as Item[];

        expect(result).toHaveLength(3);
        expect(result[0]!.email).toBe('***');
        expect(result[1]!.email).toBe('***');
        expect(result[2]!.email).toBe('***');
        // Names preserved
        expect(result[0]!.name).toBe('Alice');
    });

    it('should return a new array (not mutate in place)', () => {
        const snapshot = makeRedactorSnapshot();
        const input: Item[] = [{ name: 'X', email: 'x@x.com' }];
        const result = stepRedact(input, true, snapshot);

        expect(result).not.toBe(input);
    });

    it('should handle large arrays without incremental re-allocation', () => {
        const snapshot = makeRedactorSnapshot();
        const input: Item[] = Array.from({ length: 500 }, (_, i) => ({
            name:  `User${i}`,
            email: `user${i}@example.com`,
        }));

        const result = stepRedact(input, true, snapshot) as Item[];
        expect(result).toHaveLength(500);
        expect(result[499]!.email).toBe('***');
        expect(result[0]!.name).toBe('User0');
    });
});

// =============================================================================
// stepTruncate — agentLimit cognitive guardrail
// =============================================================================

describe('stepTruncate — agentLimit', () => {
    it('should return data unchanged when agentLimit is not configured', () => {
        const data = [1, 2, 3, 4, 5];
        const snapshot = makeSnapshot<number>();
        const { data: result, truncationBlock } = stepTruncate(data, true, snapshot);

        expect(result).toBe(data);
        expect(truncationBlock).toBeUndefined();
    });

    it('should return data unchanged when array is within limit', () => {
        const data = [1, 2, 3];
        const snapshot = makeSnapshot<number>({
            agentLimit: { max: 5, onTruncate: () => ({ type: 'summary', content: 'hidden' }) },
        });
        const { data: result, truncationBlock } = stepTruncate(data, true, snapshot);

        expect(result).toEqual([1, 2, 3]);
        expect(truncationBlock).toBeUndefined();
    });

    it('should truncate array and return a truncation block', () => {
        const data = [1, 2, 3, 4, 5];
        const snapshot = makeSnapshot<number>({
            agentLimit: {
                max: 2,
                onTruncate: (n) => ({ type: 'summary', content: `${n} hidden` }),
            },
        });

        const { data: result, truncationBlock } = stepTruncate(data, true, snapshot);

        expect(result).toEqual([1, 2]);
        expect(truncationBlock).toEqual({ type: 'summary', content: '3 hidden' });
    });

    it('should not truncate single items', () => {
        const snapshot = makeSnapshot<number>({
            agentLimit: { max: 1, onTruncate: () => ({ type: 'summary', content: 'hidden' }) },
        });

        const { data: result, truncationBlock } = stepTruncate(42, false, snapshot);
        expect(result).toBe(42);
        expect(truncationBlock).toBeUndefined();
    });
});

// =============================================================================
// stepRules — static vs dynamic rule resolution
// =============================================================================

describe('stepRules — static rules', () => {
    it('should attach static rules to the builder', () => {
        const builder = new ResponseBuilder({}, undefined);
        const snapshot = makeSnapshot<object>({ rules: ['Rule A', 'Rule B'] });

        stepRules(builder, {}, false, snapshot);
        const output = builder.build();
        const text = output.content.map(c => c.text).join('\n');

        expect(text).toContain('Rule A');
        expect(text).toContain('Rule B');
    });

    it('should not attach empty static rules', () => {
        const builder = new ResponseBuilder({}, undefined);
        const attachSpy = vi.spyOn(builder, 'systemRules');
        const snapshot = makeSnapshot<object>({ rules: [] });

        stepRules(builder, {}, false, snapshot);
        expect(attachSpy).not.toHaveBeenCalled();
    });
});

describe('stepRules — dynamic rules', () => {
    it('should call the dynamic rules function with (data, ctx)', () => {
        const rulesFn = vi.fn(() => ['Dynamic Rule']);
        const builder = new ResponseBuilder({}, undefined);
        const snapshot = makeSnapshot<{ status: string }>({ rules: rulesFn });

        stepRules(builder, { status: 'active' }, false, snapshot, { role: 'admin' });

        expect(rulesFn).toHaveBeenCalledWith({ status: 'active' }, { role: 'admin' });
        const text = builder.build().content.map(c => c.text).join('\n');
        expect(text).toContain('Dynamic Rule');
    });

    it('should filter null values from dynamic rules', () => {
        const builder = new ResponseBuilder({}, undefined);
        const snapshot = makeSnapshot<object>({
            rules: (_data, ctx) => [
                (ctx as { admin?: boolean })?.admin ? 'Admin Rule' : null,
            ],
        });

        stepRules(builder, {}, false, snapshot, { admin: false });
        const text = builder.build().content.map(c => c.text).join('\n');
        expect(text).not.toContain('Admin Rule');
    });
});

// =============================================================================
// executePipeline — orchestrator contract
// =============================================================================

describe('executePipeline — orchestrator', () => {
    it('should produce a ResponseBuilder with data as first block', () => {
        const snapshot = makeSnapshot<{ id: string }>();
        const builder = executePipeline({ id: 'x1' }, snapshot);

        expect(builder).toBeInstanceOf(ResponseBuilder);
        const text = builder.build().content[0]?.text ?? '';
        expect(text).toContain('x1');
    });

    it('should run validate → redact → rules in order', () => {
        const schema = z.object({ count: z.number() });
        const calls: string[] = [];

        const snapshot = makeSnapshot<{ count: number }>({
            schema,
            rules: (data) => {
                calls.push(`rules:${data.count}`);
                return [];
            },
        });

        executePipeline({ count: 3 }, snapshot);
        expect(calls).toContain('rules:3');
    });

    it('should apply agentLimit truncation before all other steps', () => {
        const schema = z.object({ id: z.number() });
        const snapshot = makeSnapshot<{ id: number }>({
            schema,
            agentLimit: {
                max: 2,
                onTruncate: (n) => ({ type: 'summary', content: `${n} items hidden` }),
            },
        });

        const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const builder = executePipeline(items, snapshot);
        const text = builder.build().content.map(c => c.text).join('\n');

        expect(text).toContain('2 items hidden');
        // Only first 2 items in the data block
        expect(text).toContain('"id": 1');
        expect(text).toContain('"id": 2');
        expect(text).not.toContain('"id": 3');
    });

    it('should apply selectFields (Late Guillotine) to wire-facing data', () => {
        const schema = z.object({ id: z.string(), secret: z.string() });
        const snapshot = makeSnapshot<{ id: string; secret: string }>({ schema });

        const builder = executePipeline(
            { id: 'a1', secret: 'TOP_SECRET' },
            snapshot,
            undefined,
            ['id'],
        );

        const text = builder.build().content[0]?.text ?? '';
        expect(text).toContain('a1');
        expect(text).not.toContain('TOP_SECRET');
    });
});
