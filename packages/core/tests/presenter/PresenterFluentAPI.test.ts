/**
 * Presenter Fluent API Tests — Ultra-Robust
 *
 * Comprehensive tests for the fluent API enhancements:
 * - `t` namespace (type helpers) — Zod-backed schema definitions
 * - `suggest()` helper — fluent action suggestions
 * - `.limit()` — cognitive guardrail shorthand
 * - `.suggest()` — alias for `.suggestActions()`
 * - `.rules()` — alias for `.systemRules()`
 * - `.ui()` — alias for `.uiBlocks()`
 * - `.schema()` object shape overload — accepts `{ key: t.type }` directly
 *
 * Tests cover:
 * - Happy path
 * - Edge cases
 * - Semantic errors a developer might commit
 * - Backward compatibility with raw Zod
 * - Mixing t.* with raw Zod schemas
 * - Type safety verification at runtime
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter, isPresenter } from '../../src/presenter/Presenter.js';
import { isResponseBuilder } from '../../src/presenter/ResponseBuilder.js';
import { t } from '../../src/presenter/typeHelpers.js';
import { suggest } from '../../src/presenter/suggest.js';
import { ui } from '../../src/presenter/ui.js';

// ── t Namespace ──────────────────────────────────────────

describe('t namespace (typeHelpers)', () => {
    describe('primitive types', () => {
        it('t.string should be a ZodString', () => {
            expect(t.string.parse('hello')).toBe('hello');
        });

        it('t.number should be a ZodNumber', () => {
            expect(t.number.parse(42)).toBe(42);
        });

        it('t.boolean should be a ZodBoolean', () => {
            expect(t.boolean.parse(true)).toBe(true);
        });

        it('t.date should be a ZodDate', () => {
            const now = new Date();
            expect(t.date.parse(now)).toEqual(now);
        });

        it('t.string should reject non-strings', () => {
            expect(() => t.string.parse(123)).toThrow();
        });

        it('t.number should reject non-numbers', () => {
            expect(() => t.number.parse('not-a-number')).toThrow();
        });

        it('t.boolean should reject non-booleans', () => {
            expect(() => t.boolean.parse('yes')).toThrow();
        });

        it('t.date should reject non-dates', () => {
            expect(() => t.date.parse('2026-01-01')).toThrow();
        });
    });

    describe('composite types', () => {
        it('t.enum should create a ZodEnum', () => {
            const status = t.enum('active', 'archived');
            expect(status.parse('active')).toBe('active');
            expect(status.parse('archived')).toBe('archived');
            expect(() => status.parse('invalid')).toThrow();
        });

        it('t.enum with no matching value should throw on parse', () => {
            const status = t.enum('active');
            // Parsing a value not in the enum should throw
            expect(() => status.parse('nonexistent')).toThrow();
        });

        it('t.array should create a ZodArray', () => {
            const arr = t.array(t.string);
            expect(arr.parse(['a', 'b'])).toEqual(['a', 'b']);
            expect(() => arr.parse([1, 2])).toThrow();
        });

        it('t.array of t.number should reject strings', () => {
            const arr = t.array(t.number);
            expect(() => arr.parse(['a', 'b'])).toThrow();
        });

        it('t.object should create a ZodObject', () => {
            const obj = t.object({ name: t.string, age: t.number });
            expect(obj.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
        });

        it('t.object should reject missing required fields', () => {
            const obj = t.object({ name: t.string, age: t.number });
            expect(() => obj.parse({ name: 'Alice' })).toThrow();
        });

        it('t.record should create a ZodRecord', () => {
            const rec = t.record(t.string);
            expect(rec.parse({ key1: 'val1' })).toEqual({ key1: 'val1' });
            expect(() => rec.parse({ key1: 42 })).toThrow();
        });
    });

    describe('modifiers', () => {
        it('t.optional should make a type optional', () => {
            const opt = t.optional(t.string);
            expect(opt.parse('hello')).toBe('hello');
            expect(opt.parse(undefined)).toBeUndefined();
        });

        it('t.nullable should make a type nullable', () => {
            const nul = t.nullable(t.string);
            expect(nul.parse('hello')).toBe('hello');
            expect(nul.parse(null)).toBeNull();
            expect(() => nul.parse(undefined)).toThrow();
        });
    });

    describe('chaining with .describe()', () => {
        it('t.string.describe() should work (Zod native)', () => {
            const described = t.string.describe('A user ID');
            expect(described.parse('usr_123')).toBe('usr_123');
            expect(described.description).toBe('A user ID');
        });

        it('t.number.describe() should work', () => {
            const described = t.number.describe('Amount in cents');
            expect(described.description).toBe('Amount in cents');
        });
    });

    describe('escape hatch', () => {
        it('t.zod should be the raw Zod namespace', () => {
            expect(t.zod.string).toBeDefined();
            expect(t.zod.object).toBeDefined();

            // Use advanced Zod features through escape hatch
            const email = t.zod.string().email();
            expect(email.parse('user@example.com')).toBe('user@example.com');
            expect(() => email.parse('not-an-email')).toThrow();
        });
    });

    describe('interoperability with raw Zod', () => {
        it('t.* types should be mixable with z.* types in z.object()', () => {
            const schema = z.object({
                id: t.string,
                email: z.string().email(),
                age: t.number,
            });
            const result = schema.parse({ id: 'usr_1', email: 'a@b.com', age: 25 });
            expect(result.id).toBe('usr_1');
            expect(result.email).toBe('a@b.com');
            expect(result.age).toBe(25);
        });

        it('t.array should accept z.* items', () => {
            const arr = t.array(z.string().email());
            expect(arr.parse(['a@b.com'])).toEqual(['a@b.com']);
            expect(() => arr.parse(['not-email'])).toThrow();
        });
    });
});

// ── suggest() helper ─────────────────────────────────────

describe('suggest() helper', () => {
    it('should create an ActionSuggestion', () => {
        const s = suggest('billing.pay', 'Offer payment');
        expect(s).toEqual({ tool: 'billing.pay', reason: 'Offer payment' });
    });

    it('should create multiple suggestions', () => {
        const suggestions = [
            suggest('invoices.get', 'View details'),
            suggest('billing.remind', 'Send reminder'),
        ];
        expect(suggestions).toHaveLength(2);
        expect(suggestions[0].tool).toBe('invoices.get');
        expect(suggestions[1].reason).toBe('Send reminder');
    });

    it('should handle empty reason string', () => {
        const s = suggest('tool.name', '');
        expect(s.reason).toBe('');
    });

    it('should handle dotted tool names', () => {
        const s = suggest('admin.billing.refund', 'Process refund');
        expect(s.tool).toBe('admin.billing.refund');
    });

    it('should be usable in a conditional array pattern', () => {
        const status = 'overdue';
        const suggestions = [
            suggest('invoices.get', 'View'),
            status === 'overdue' ? suggest('billing.remind', 'Remind') : null,
            status === 'paid' ? suggest('billing.receipt', 'Receipt') : null,
        ].filter(Boolean);

        expect(suggestions).toHaveLength(2);
    });
});

// ── .schema() object shape overload ──────────────────────

describe('Presenter .schema() with object shape (t.* namespace)', () => {
    it('should accept a plain object of t.* types', () => {
        const presenter = createPresenter('Project')
            .schema({
                id: t.string,
                name: t.string,
                stars: t.number,
            });

        const result = presenter.make({ id: 'P1', name: 'Fusion', stars: 100 });
        expect(isResponseBuilder(result)).toBe(true);

        const built = result.build();
        const parsed = JSON.parse(built.content[0].text);
        expect(parsed.id).toBe('P1');
        expect(parsed.name).toBe('Fusion');
        expect(parsed.stars).toBe(100);
    });

    it('should validate data through the wrapped z.object()', () => {
        const presenter = createPresenter('User')
            .schema({
                name: t.string,
                age: t.number,
            });

        // Invalid: missing required field
        expect(() => presenter.make({ name: 'Alice' })).toThrow();

        // Invalid: wrong type
        expect(() => presenter.make({ name: 'Alice', age: 'thirty' })).toThrow();
    });

    it('should strip unknown fields', () => {
        const presenter = createPresenter('Item')
            .schema({ id: t.string, label: t.string });

        const result = presenter.make({
            id: 'I1',
            label: 'Test',
            secretField: 'should be stripped',
        });

        const built = result.build();
        const parsed = JSON.parse(built.content[0].text);
        expect(parsed.id).toBe('I1');
        expect(parsed.secretField).toBeUndefined();
    });

    it('should support t.enum in object shape', () => {
        const presenter = createPresenter('Task')
            .schema({
                id: t.string,
                status: t.enum('active', 'done', 'archived'),
            });

        const result = presenter.make({ id: 'T1', status: 'active' });
        const parsed = JSON.parse(result.build().content[0].text);
        expect(parsed.status).toBe('active');

        expect(() => presenter.make({ id: 'T2', status: 'invalid' })).toThrow();
    });

    it('should support t.optional in object shape', () => {
        const presenter = createPresenter('Profile')
            .schema({
                name: t.string,
                bio: t.optional(t.string),
            });

        // With optional field present
        const r1 = presenter.make({ name: 'Alice', bio: 'Dev' });
        const p1 = JSON.parse(r1.build().content[0].text);
        expect(p1.bio).toBe('Dev');

        // With optional field absent
        const r2 = presenter.make({ name: 'Bob' });
        const p2 = JSON.parse(r2.build().content[0].text);
        expect(p2.name).toBe('Bob');
    });

    it('should support t.array in object shape', () => {
        const presenter = createPresenter('Team')
            .schema({
                name: t.string,
                members: t.array(t.string),
            });

        const r = presenter.make({ name: 'Core', members: ['Alice', 'Bob'] });
        const parsed = JSON.parse(r.build().content[0].text);
        expect(parsed.members).toEqual(['Alice', 'Bob']);
    });

    it('should support nested t.object in object shape', () => {
        const presenter = createPresenter('Company')
            .schema({
                name: t.string,
                address: t.object({
                    city: t.string,
                    country: t.string,
                }),
            });

        const r = presenter.make({
            name: 'ACME',
            address: { city: 'Lisbon', country: 'PT' },
        });
        const parsed = JSON.parse(r.build().content[0].text);
        expect(parsed.address.city).toBe('Lisbon');
    });

    it('should support mixing t.* with raw Zod in same schema', () => {
        const presenter = createPresenter('Account')
            .schema({
                id: t.string,
                email: z.string().email(),       // Raw Zod for advanced validation
                score: t.number,
            });

        const r = presenter.make({ id: 'A1', email: 'test@example.com', score: 95 });
        const parsed = JSON.parse(r.build().content[0].text);
        expect(parsed.email).toBe('test@example.com');

        // Raw Zod should still validate
        expect(() => presenter.make({ id: 'A2', email: 'not-email', score: 50 })).toThrow();
    });

    it('should remain backward compatible with raw Zod schema', () => {
        const presenter = createPresenter('Legacy')
            .schema(z.object({
                id: z.string(),
                amount: z.number(),
            }));

        const result = presenter.make({ id: 'L1', amount: 42 });
        const parsed = JSON.parse(result.build().content[0].text);
        expect(parsed.id).toBe('L1');
        expect(parsed.amount).toBe(42);
    });

    it('should support t.record in object shape', () => {
        const presenter = createPresenter('Config')
            .schema({
                name: t.string,
                metadata: t.record(t.string),
            });

        const r = presenter.make({
            name: 'settings',
            metadata: { theme: 'dark', lang: 'pt-BR' },
        });
        const parsed = JSON.parse(r.build().content[0].text);
        expect(parsed.metadata.theme).toBe('dark');
    });

    it('should support t.nullable in object shape', () => {
        const presenter = createPresenter('Entry')
            .schema({
                id: t.string,
                deletedAt: t.nullable(t.string),
            });

        const r1 = presenter.make({ id: 'E1', deletedAt: null });
        const p1 = JSON.parse(r1.build().content[0].text);
        expect(p1.deletedAt).toBeNull();

        const r2 = presenter.make({ id: 'E2', deletedAt: '2026-01-01' });
        const p2 = JSON.parse(r2.build().content[0].text);
        expect(p2.deletedAt).toBe('2026-01-01');
    });
});

// ── .suggest() alias ─────────────────────────────────────

describe('Presenter .suggest() alias', () => {
    it('should work identically to .suggestActions()', () => {
        const presenterA = createPresenter('A')
            .suggestActions(() => [{ tool: 'a.get', reason: 'Get' }]);

        const presenterB = createPresenter('B')
            .suggest(() => [{ tool: 'b.get', reason: 'Get' }]);

        const resultA = presenterA.make({ id: '1' }).build();
        const resultB = presenterB.make({ id: '1' }).build();

        // Both should have suggest blocks
        expect(resultA.content.length).toBe(resultB.content.length);
    });

    it('should work with suggest() helper', () => {
        const presenter = createPresenter('Invoice')
            .schema({ id: t.string, status: t.enum('draft', 'paid', 'overdue') })
            .suggest((inv: { id: string; status: string }) => [
                suggest('invoices.get', 'View details'),
                inv.status === 'overdue'
                    ? suggest('billing.remind', 'Send reminder')
                    : null,
            ].filter((s): s is NonNullable<typeof s> => s !== null));

        const result = presenter.make({ id: 'INV-1', status: 'overdue' }).build();
        const blocks = result.content;
        const suggestionsBlock = blocks.find(b => b.text.includes('suggest'));
        expect(suggestionsBlock).toBeDefined();
        expect(suggestionsBlock!.text).toContain('billing.remind');
    });

    it('should handle suggest returning empty array', () => {
        const presenter = createPresenter('Empty')
            .suggest(() => []);

        const result = presenter.make({ id: '1' }).build();
        // Should not crash, no suggestions block when empty
        expect(result.content.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle suggest filtering nulls before returning', () => {
        // SuggestActionsFn requires ActionSuggestion[], so devs must filter nulls
        const presenter = createPresenter('FilterNull')
            .suggest(() => {
                const raw = [null, null, null];
                return raw.filter((s): s is NonNullable<typeof s> => s !== null);
            });

        const result = presenter.make({ id: '1' }).build();
        expect(result.content.length).toBeGreaterThanOrEqual(1);
    });

    it('should return `this` for chaining', () => {
        const presenter = createPresenter('Chainable');
        const result = presenter.suggest(() => []);
        expect(result).toBe(presenter);
    });
});

// ── .rules() alias ───────────────────────────────────────

describe('Presenter .rules() alias', () => {
    it('should work with static rules array (same as .systemRules())', () => {
        const presenter = createPresenter('Billing')
            .rules(['CRITICAL: amounts in CENTS', 'Format: $XX,XXX.00']);

        const result = presenter.make({ id: '1' }).build();
        expect(result.content.length).toBe(2); // Data + Rules
        expect(result.content[1].text).toContain('CENTS');
        expect(result.content[1].text).toContain('$XX,XXX.00');
    });

    it('should work with dynamic rules function', () => {
        const presenter = createPresenter('Dynamic')
            .schema({ id: t.string, status: t.enum('active', 'archived') })
            .rules((item: { id: string; status: string }) => [
                item.status === 'archived'
                    ? '⚠️ ARCHIVED. Cannot edit.'
                    : null,
                'Format dates as ISO 8601',
            ]);

        const r1 = presenter.make({ id: 'D1', status: 'archived' }).build();
        expect(r1.content[1].text).toContain('ARCHIVED');

        const r2 = presenter.make({ id: 'D2', status: 'active' }).build();
        expect(r2.content[1].text).toContain('ISO 8601');
        // null rule should be filtered out
        expect(r2.content[1].text).not.toContain('ARCHIVED');
    });

    it('should return `this` for chaining', () => {
        const presenter = createPresenter('Chain');
        const result = presenter.rules(['rule']);
        expect(result).toBe(presenter);
    });
});

// ── .ui() alias ──────────────────────────────────────────

describe('Presenter .ui() alias', () => {
    it('should work identically to .uiBlocks()', () => {
        const presenter = createPresenter('Chart')
            .schema({ id: t.string, amount: t.number })
            .ui((item: { id: string; amount: number }) => [
                ui.echarts({ series: [{ type: 'gauge', data: [{ value: item.amount }] }] }),
            ]);

        const result = presenter.make({ id: 'C1', amount: 42 }).build();
        expect(result.content.length).toBe(2); // Data + UI
        expect(result.content[1].text).toContain('echarts');
        expect(result.content[1].text).toContain('42');
    });

    it('should handle conditional UI blocks', () => {
        const presenter = createPresenter('Conditional')
            .ui((item: { status?: string }) => [
                item.status === 'critical'
                    ? ui.markdown('🚨 **CRITICAL**')
                    : null,
            ]);

        // When condition does NOT match, UI block is null and should be filtered
        const r1 = presenter.make({ status: 'normal' }).build();
        expect(r1.content.length).toBe(1); // Data only

        // When condition DOES match
        const r2 = presenter.make({ status: 'critical' }).build();
        expect(r2.content.length).toBe(2);
        expect(r2.content[1].text).toContain('CRITICAL');
    });

    it('should return `this` for chaining', () => {
        const presenter = createPresenter('UiChain');
        const result = presenter.ui(() => []);
        expect(result).toBe(presenter);
    });
});

// ── .limit() shorthand ───────────────────────────────────

describe('Presenter .limit() shorthand', () => {
    it('should truncate arrays exceeding the limit', () => {
        const presenter = createPresenter('Paginated')
            .schema({ id: t.string })
            .limit(3);

        const data = [
            { id: 'A' }, { id: 'B' }, { id: 'C' },
            { id: 'D' }, { id: 'E' },
        ];

        const result = presenter.make(data).build();
        const dataBlock = JSON.parse(result.content[0].text);

        // Should only keep 3 items
        expect(dataBlock).toHaveLength(3);
        expect(dataBlock[0].id).toBe('A');
        expect(dataBlock[2].id).toBe('C');
    });

    it('should inject an auto-generated truncation message', () => {
        const presenter = createPresenter('Limited')
            .schema({ id: t.string })
            .limit(2);

        const data = [
            { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' },
        ];

        const result = presenter.make(data).build();
        // Should have a summary/truncation block
        const blocks = result.content;
        const truncBlock = blocks.find(b => b.text.includes('truncated'));
        expect(truncBlock).toBeDefined();
        expect(truncBlock!.text).toContain('2 shown');
        expect(truncBlock!.text).toContain('3 hidden');
    });

    it('should NOT truncate arrays within the limit', () => {
        const presenter = createPresenter('Within')
            .schema({ id: t.string })
            .limit(10);

        const data = [{ id: '1' }, { id: '2' }, { id: '3' }];
        const result = presenter.make(data).build();
        const dataBlock = JSON.parse(result.content[0].text);
        expect(dataBlock).toHaveLength(3);
    });

    it('should handle limit(1)', () => {
        const presenter = createPresenter('One')
            .schema({ id: t.string })
            .limit(1);

        const data = [{ id: 'A' }, { id: 'B' }];
        const result = presenter.make(data).build();
        const dataBlock = JSON.parse(result.content[0].text);
        expect(dataBlock).toHaveLength(1);
        expect(dataBlock[0].id).toBe('A');
    });

    it('should return `this` for chaining', () => {
        const presenter = createPresenter('LimitChain');
        const result = presenter.limit(50);
        expect(result).toBe(presenter);
    });
});

// ── Full fluent chain showcase ───────────────────────────

describe('Full fluent Presenter chain — end-to-end', () => {
    it('should work with all fluent methods chained together', () => {
        const presenter = createPresenter('Invoice')
            .schema({
                id: t.string,
                amount_cents: t.number,
                status: t.enum('draft', 'paid', 'overdue'),
            })
            .rules((inv: { status: string }) => [
                inv.status === 'overdue' ? '⚠️ OVERDUE' : null,
            ])
            .ui((inv: { amount_cents: number }) => [
                ui.echarts({
                    series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }],
                }),
            ])
            .suggest((inv: { id: string; status: string }) => [
                suggest('invoices.get', 'View details'),
                inv.status === 'overdue'
                    ? suggest('billing.remind', 'Send reminder')
                    : null,
            ].filter((s): s is NonNullable<typeof s> => s !== null))
            .limit(50);

        expect(isPresenter(presenter)).toBe(true);

        const result = presenter.make({
            id: 'INV-001',
            amount_cents: 42000,
            status: 'overdue',
        }).build();

        // Should have: Data + UI + Rules + Suggestions
        expect(result.content.length).toBeGreaterThanOrEqual(3);

        // Data block
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('INV-001');
        expect(parsed.amount_cents).toBe(42000);

        // Should contain overdue rule
        const rulesBlock = result.content.find(b => b.text.includes('OVERDUE'));
        expect(rulesBlock).toBeDefined();

        // Should contain chart
        const chartBlock = result.content.find(b => b.text.includes('echarts'));
        expect(chartBlock).toBeDefined();

        // Should contain suggestions
        const suggestBlock = result.content.find(b => b.text.includes('billing.remind'));
        expect(suggestBlock).toBeDefined();
    });

    it('should validate, strip, and present with t.* schema', () => {
        const presenter = createPresenter('Secure')
            .schema({
                id: t.string,
                name: t.string,
            })
            .rules(['Do not expose internal IDs']);

        // Valid data with extra fields
        const result = presenter.make({
            id: 'S1',
            name: 'Safe',
            password: 'should-be-stripped',
            internalTenantId: 'tid_123',
        }).build();

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe('S1');
        expect(parsed.name).toBe('Safe');
        expect(parsed.password).toBeUndefined();
        expect(parsed.internalTenantId).toBeUndefined();
    });
});

// ── Semantic errors developers might commit ──────────────

describe('Developer semantic errors', () => {
    it('should throw when passing non-ZodType object without valid shape', () => {
        // Developer accidentally passes a non-schema object
        // This should still work as a raw z.object() — empty fields just won't validate
        const presenter = createPresenter('Mistake')
            .schema({ id: t.string });

        // Missing required field
        expect(() => presenter.make({})).toThrow();
    });

    it('should handle t.enum with single value', () => {
        const singleEnum = t.enum('only');
        expect(singleEnum.parse('only')).toBe('only');
        expect(() => singleEnum.parse('other')).toThrow();
    });

    it('should handle t.array with empty array', () => {
        const arr = t.array(t.string);
        expect(arr.parse([])).toEqual([]);
    });

    it('should handle t.record with empty object', () => {
        const rec = t.record(t.number);
        expect(rec.parse({})).toEqual({});
    });

    it('using .limit() and then .agentLimit() should override', () => {
        const presenter = createPresenter('Override')
            .schema({ id: t.string })
            .limit(10)
            .agentLimit(5, () => ui.markdown('Custom'));

        const data = Array.from({ length: 8 }, (_, i) => ({ id: `${i}` }));
        const result = presenter.make(data).build();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(5); // agentLimit(5) should override limit(10)
    });

    it('should handle .suggest() with object literals (backward compat)', () => {
        const presenter = createPresenter('ObjectSuggest')
            .suggest(() => [
                { tool: 'legacy.action', reason: 'Still works' },
            ]);

        const result = presenter.make({ id: '1' }).build();
        const suggestBlock = result.content.find(b => b.text.includes('legacy.action'));
        expect(suggestBlock).toBeDefined();
    });

    it('should handle double .schema() call (last one wins)', () => {
        const presenter = createPresenter('Double')
            .schema({ id: t.string, name: t.string })
            .schema({ id: t.number }); // Override

        // First schema required name, second does not
        const result = presenter.make({ id: 42 });
        const parsed = JSON.parse(result.build().content[0].text);
        expect(parsed.id).toBe(42);
    });

    it('should handle arrays through validated schema', () => {
        const presenter = createPresenter('ArrayValidation')
            .schema({
                id: t.string,
                tags: t.array(t.string),
            });

        // Wrong type in array
        expect(() => presenter.make({
            id: 'A1',
            tags: [1, 2, 3],  // should be strings
        })).toThrow();
    });
});
