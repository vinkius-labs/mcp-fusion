/**
 * PresenterRobustness.test.ts — Edge Cases & Boundary Tests for Presenter
 *
 * Ultra-robust coverage for:
 * - Sealing behavior
 * - Empty data / empty arrays
 * - Null filtering in callbacks
 * - Dynamic rules with missing context
 * - agentLimit boundary conditions
 * - suggestActions on collections
 * - Multiple embeds
 * - Deeply nested embed chains
 * - PresenterValidationError in arrays
 * - uiBlocks + collectionUiBlocks interaction
 * - ResponseBuilder new methods (.systemHint, .rawBlock)
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createPresenter, ui, response } from '../../src/framework/presenter/index.js';
import { PresenterValidationError } from '../../src/framework/presenter/PresenterValidationError.js';

// ── Schemas ──────────────────────────────────────────────

const itemSchema = z.object({ id: z.string(), value: z.number() });
type Item = z.infer<typeof itemSchema>;

const clientSchema = z.object({ id: z.string(), company: z.string() });
const addressSchema = z.object({ city: z.string(), country: z.string() });

// =====================================================================
// Sealing Behavior
// =====================================================================

describe('Presenter Sealing', () => {
    it('should seal after first .make() call', () => {
        const presenter = createPresenter('Sealable');
        presenter.make('data'); // first call — seals

        expect(() => presenter.systemRules(['Rule'])).toThrow(/sealed/);
    });

    it('should prevent .schema() after sealing', () => {
        const presenter = createPresenter('SealSchema');
        presenter.make('data');

        expect(() => presenter.schema(z.object({ id: z.string() }))).toThrow(/sealed/);
    });

    it('should prevent .uiBlocks() after sealing', () => {
        const presenter = createPresenter('SealUI');
        presenter.make('data');

        expect(() => presenter.uiBlocks(() => [ui.markdown('x')])).toThrow(/sealed/);
    });

    it('should prevent .collectionUiBlocks() after sealing', () => {
        const presenter = createPresenter('SealCollection');
        presenter.make('data');

        expect(() => presenter.collectionUiBlocks(() => [ui.markdown('x')])).toThrow(/sealed/);
    });

    it('should prevent .agentLimit() after sealing', () => {
        const presenter = createPresenter('SealLimit');
        presenter.make('data');

        expect(() => presenter.agentLimit(10, () => ui.summary('x'))).toThrow(/sealed/);
    });

    it('should prevent .suggestActions() after sealing', () => {
        const presenter = createPresenter('SealSuggest');
        presenter.make('data');

        expect(() => presenter.suggestActions(() => [])).toThrow(/sealed/);
    });

    it('should prevent .embed() after sealing', () => {
        const presenter = createPresenter('SealEmbed');
        presenter.make('data');
        const child = createPresenter('Child');

        expect(() => presenter.embed('child', child)).toThrow(/sealed/);
    });

    it('should allow multiple .make() calls (sealed but still executable)', () => {
        const presenter = createPresenter('MultiMake')
            .systemRules(['Rule']);

        const r1 = presenter.make('first').build();
        const r2 = presenter.make('second').build();

        expect(r1.content[0]!.text).toBe('first');
        expect(r2.content[0]!.text).toBe('second');
    });
});

// =====================================================================
// Empty Data & Arrays
// =====================================================================

describe('Empty Data Edge Cases', () => {
    it('should handle empty array with schema', () => {
        const presenter = createPresenter('EmptyArray')
            .schema(itemSchema)
            .collectionUiBlocks((items: Item[]) => [
                ui.summary(`${items.length} items`),
            ]);

        const result = presenter.make([]).build();
        const data = JSON.parse(result.content[0]!.text);
        expect(data).toEqual([]);
        // collectionUiBlocks should still be called with []
        expect(result.content.some(c => c.text.includes('0 items'))).toBe(true);
    });

    it('should handle null data without schema', () => {
        const presenter = createPresenter('NullData');
        const result = presenter.make(null as unknown as string).build();
        expect(result.content[0]!.text).toBe('null');
    });

    it('should handle empty string', () => {
        const presenter = createPresenter('EmptyStr');
        const result = presenter.make('').build();
        expect(result.content[0]!.text).toBe('OK');
    });

    it('should handle agentLimit on empty array', () => {
        const presenter = createPresenter('LimitEmpty')
            .agentLimit(5, (n) => ui.summary(`${n} hidden`));

        const result = presenter.make([]).build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('hidden'))).toBe(false);
    });

    it('should handle suggestActions with empty array (no first item)', () => {
        const presenter = createPresenter('SuggestEmpty')
            .suggestActions(() => [{ tool: 'test', reason: 'test' }]);

        const result = presenter.make([]).build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('[SYSTEM HINT]'))).toBe(false);
    });
});

// =====================================================================
// Null Filtering in Callbacks
// =====================================================================

describe('Null Filtering', () => {
    it('should filter null from dynamic systemRules', () => {
        const presenter = createPresenter('NullRules')
            .systemRules(() => [null, 'Valid rule', null, null]);

        const result = presenter.make('data').build();
        const rules = result.content.find(c => c.text.includes('[DOMAIN RULES]'))?.text ?? '';
        expect(rules).toContain('Valid rule');
        expect(rules.split('\n').filter(l => l.startsWith('-'))).toHaveLength(1);
    });

    it('should filter null from uiBlocks', () => {
        const presenter = createPresenter('NullUI')
            .uiBlocks(() => [null, ui.markdown('Visible'), null]);

        const result = presenter.make('data').build();
        // data + 1 UI block (nulls filtered)
        const uiBlocks = result.content.filter(c => c.text.includes('[SYSTEM]'));
        expect(uiBlocks).toHaveLength(1);
    });

    it('should filter null from collectionUiBlocks', () => {
        const presenter = createPresenter('NullCollectionUI')
            .collectionUiBlocks(() => [null, ui.markdown('Summary'), null, null]);

        const result = presenter.make(['a', 'b']).build();
        const uiBlocks = result.content.filter(c => c.text.includes('[SYSTEM]'));
        expect(uiBlocks).toHaveLength(1);
    });

    it('should produce no rules block when all dynamic rules are null', () => {
        const presenter = createPresenter('AllNullRules')
            .systemRules(() => [null, null, null]);

        const result = presenter.make('data').build();
        expect(result.content.some(c => c.text.includes('[DOMAIN RULES]'))).toBe(false);
    });

    it('should produce no UI when all blocks are null', () => {
        const presenter = createPresenter('AllNullUI')
            .uiBlocks(() => [null, null]);

        const result = presenter.make('data').build();
        expect(result.content.filter(c => c.text.includes('[SYSTEM]'))).toHaveLength(0);
    });
});

// =====================================================================
// Dynamic Rules Without Context
// =====================================================================

describe('Dynamic Rules Without Context', () => {
    it('should receive undefined ctx when called without context', () => {
        const presenter = createPresenter('NoCtxRules')
            .systemRules((_data: unknown, ctx?: unknown) => [
                ctx === undefined ? 'No context provided' : 'Has context',
            ]);

        const result = presenter.make('data').build();
        const rules = result.content.find(c => c.text.includes('[DOMAIN RULES]'))?.text ?? '';
        expect(rules).toContain('No context provided');
    });

    it('should skip dynamic rules when data array is empty (no first item)', () => {
        const presenter = createPresenter('EmptyArrayRules')
            .systemRules((_data: unknown) => ['Should not appear']);

        const result = presenter.make([]).build();
        // With empty array, singleData is undefined, so dynamic rules are skipped
        expect(result.content.some(c => c.text.includes('Should not appear'))).toBe(false);
    });
});

// =====================================================================
// agentLimit Boundary Conditions
// =====================================================================

describe('agentLimit Boundaries', () => {
    const makeItems = (n: number) => Array.from({ length: n }, (_, i) => ({
        id: `ITEM-${i}`, value: i * 100,
    }));

    it('should not truncate when exactly at the limit', () => {
        const presenter = createPresenter('ExactLimit')
            .schema(itemSchema)
            .agentLimit(5, (n) => ui.summary(`${n} hidden`));

        const result = presenter.make(makeItems(5)).build();
        const data = JSON.parse(result.content[0]!.text);
        expect(data).toHaveLength(5);
        expect(result.content.some(c => c.text.includes('hidden'))).toBe(false);
    });

    it('should truncate when one over the limit', () => {
        const presenter = createPresenter('OneOver')
            .schema(itemSchema)
            .agentLimit(5, (n) => ui.summary(`${n} hidden`));

        const result = presenter.make(makeItems(6)).build();
        const data = JSON.parse(result.content[0]!.text);
        expect(data).toHaveLength(5);
        expect(result.content.some(c => c.text.includes('1 hidden'))).toBe(true);
    });

    it('should handle agentLimit of 1', () => {
        const presenter = createPresenter('LimitOne')
            .schema(itemSchema)
            .agentLimit(1, (n) => ui.summary(`${n} hidden`));

        const result = presenter.make(makeItems(100)).build();
        const data = JSON.parse(result.content[0]!.text);
        expect(data).toHaveLength(1);
        expect(result.content.some(c => c.text.includes('99 hidden'))).toBe(true);
    });

    it('should place truncation warning before other UI blocks', () => {
        const presenter = createPresenter('TruncOrder')
            .schema(itemSchema)
            .agentLimit(2, (n) => ui.summary(`⚠️ ${n} hidden`))
            .collectionUiBlocks(() => [ui.markdown('Collection view')]);

        const result = presenter.make(makeItems(5)).build();
        // Find the truncation and collection blocks
        const systemBlocks = result.content.filter(c => c.text.includes('[SYSTEM]'));
        // First UI block should be truncation warning
        expect(systemBlocks[0]!.text).toContain('hidden');
        expect(systemBlocks[1]!.text).toContain('Collection view');
    });
});

// =====================================================================
// suggestActions on Collections
// =====================================================================

describe('suggestActions on Collections', () => {
    it('should evaluate suggestions on the first item of a collection', () => {
        const presenter = createPresenter('SuggestCollection')
            .schema(itemSchema)
            .suggestActions((item: Item) => {
                if (item.value > 500) {
                    return [{ tool: 'items.flag', reason: 'High value item' }];
                }
                return [];
            });

        // First item has value 0 → no suggestions
        const r1 = presenter.make([
            { id: 'A', value: 100 },
            { id: 'B', value: 9999 },
        ]).build();
        expect(r1.content.some(c => c.text.includes('[SYSTEM HINT]'))).toBe(false);
    });
});

// =====================================================================
// Multiple Embeds
// =====================================================================

describe('Multiple Embeds', () => {
    it('should process multiple embedded Presenters', () => {
        const ClientPresenter = createPresenter('ClientMulti')
            .schema(clientSchema)
            .systemRules(['Show company name prominently.']);

        const AddressPresenter = createPresenter('AddressMulti')
            .schema(addressSchema)
            .systemRules(['Format address for local postal service.']);

        const OrderPresenter = createPresenter('OrderMulti')
            .systemRules(['Order rule'])
            .embed('client', ClientPresenter)
            .embed('address', AddressPresenter);

        const result = OrderPresenter.make({
            id: 'ORD-1',
            client: { id: 'C1', company: 'Acme' },
            address: { city: 'São Paulo', country: 'Brazil' },
        }).build();

        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('Order rule'))).toBe(true);
        expect(texts.some(t => t.includes('company name prominently'))).toBe(true);
        expect(texts.some(t => t.includes('postal service'))).toBe(true);
    });

    it('should skip embeds with null nested data', () => {
        const ClientPresenter = createPresenter('ClientNull')
            .schema(clientSchema)
            .systemRules(['Should not appear']);

        const OrderPresenter = createPresenter('OrderNull')
            .embed('client', ClientPresenter);

        const result = OrderPresenter.make({
            id: 'ORD-1',
            client: null,
        }).build();

        expect(result.content.some(c => c.text.includes('Should not appear'))).toBe(false);
    });
});

// =====================================================================
// PresenterValidationError in Arrays
// =====================================================================

describe('PresenterValidationError in Arrays', () => {
    it('should throw PresenterValidationError when an item in array fails validation', () => {
        const presenter = createPresenter('ArrayValidation')
            .schema(itemSchema);

        try {
            presenter.make([
                { id: 'A', value: 100 },
                { id: 123, value: 'bad' }, // invalid
            ]);
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PresenterValidationError);
            const pve = err as PresenterValidationError;
            expect(pve.presenterName).toBe('ArrayValidation');
            expect(pve.message).toContain('[ArrayValidation Presenter]');
        }
    });

    it('should throw for single invalid item', () => {
        const presenter = createPresenter('SingleValidation')
            .schema(itemSchema);

        try {
            presenter.make({ id: 42, value: 'bad' });
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PresenterValidationError);
        }
    });
});

// =====================================================================
// uiBlocks vs collectionUiBlocks Mutual Exclusion
// =====================================================================

describe('uiBlocks vs collectionUiBlocks', () => {
    it('should use collectionUiBlocks for arrays (not itemUiBlocks)', () => {
        const presenter = createPresenter('MutexUI')
            .uiBlocks(() => [ui.markdown('SINGLE')])
            .collectionUiBlocks(() => [ui.markdown('COLLECTION')]);

        const result = presenter.make(['a', 'b']).build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('COLLECTION'))).toBe(true);
        expect(texts.some(t => t.includes('SINGLE'))).toBe(false);
    });

    it('should use uiBlocks for single items (not collectionUiBlocks)', () => {
        const presenter = createPresenter('MutexSingle')
            .uiBlocks(() => [ui.markdown('SINGLE')])
            .collectionUiBlocks(() => [ui.markdown('COLLECTION')]);

        const result = presenter.make('item').build();
        const texts = result.content.map(c => c.text);
        expect(texts.some(t => t.includes('SINGLE'))).toBe(true);
        expect(texts.some(t => t.includes('COLLECTION'))).toBe(false);
    });
});

// =====================================================================
// ResponseBuilder — New Methods (.systemHint, .rawBlock)
// =====================================================================

describe('ResponseBuilder — systemHint()', () => {
    it('should generate [SYSTEM HINT] block with action suggestions', () => {
        const result = response('data')
            .systemHint([
                { tool: 'billing.pay', reason: 'Offer payment' },
                { tool: 'billing.remind', reason: 'Send reminder' },
            ])
            .build();

        const hintBlock = result.content.find(c => c.text.includes('[SYSTEM HINT]'))?.text ?? '';
        expect(hintBlock).toContain('billing.pay');
        expect(hintBlock).toContain('Offer payment');
        expect(hintBlock).toContain('billing.remind');
        expect(hintBlock).toContain('→'); // arrow prefix
    });

    it('should not generate block for empty suggestions', () => {
        const result = response('data').systemHint([]).build();
        expect(result.content.some(c => c.text.includes('[SYSTEM HINT]'))).toBe(false);
    });

    it('should place suggestions after rules in block order', () => {
        const result = response('data')
            .systemRules(['Rule 1'])
            .systemHint([{ tool: 'test', reason: 'Test' }])
            .build();

        const rulesIdx = result.content.findIndex(c => c.text.includes('[DOMAIN RULES]'));
        const hintIdx = result.content.findIndex(c => c.text.includes('[SYSTEM HINT]'));
        expect(rulesIdx).toBeLessThan(hintIdx);
    });
});

describe('ResponseBuilder — rawBlock()', () => {
    it('should append raw text as a content block', () => {
        const result = response('data')
            .rawBlock('Merged from child')
            .build();

        expect(result.content.some(c => c.text === 'Merged from child')).toBe(true);
    });

    it('should support multiple raw blocks', () => {
        const result = response('data')
            .rawBlock('Block 1')
            .rawBlock('Block 2')
            .build();

        expect(result.content.filter(c => c.text === 'Block 1' || c.text === 'Block 2')).toHaveLength(2);
    });

    it('should place raw blocks after UI blocks and before hints', () => {
        const result = response('data')
            .uiBlock('markdown', '**bold**')
            .rawBlock('Raw content')
            .llmHint('Hint text')
            .build();

        const uiIdx = result.content.findIndex(c => c.text.includes('[SYSTEM]'));
        const rawIdx = result.content.findIndex(c => c.text === 'Raw content');
        const hintIdx = result.content.findIndex(c => c.text.includes('💡'));

        expect(uiIdx).toBeLessThan(rawIdx);
        expect(rawIdx).toBeLessThan(hintIdx);
    });
});

// =====================================================================
// Full Block Order Verification
// =====================================================================

describe('ResponseBuilder — Full Block Order', () => {
    it('should produce blocks in order: data, UI, raw, hints, rules, suggestions', () => {
        const result = response({ id: '123' })
            .uiBlock('echarts', '```echarts\n{}\n```')
            .rawBlock('From child presenter')
            .llmHint('Pay attention')
            .systemRules(['Rule 1'])
            .systemHint([{ tool: 'next.action', reason: 'Do this next' }])
            .build();

        expect(result.content).toHaveLength(6);

        // 1. Data
        expect(JSON.parse(result.content[0]!.text)).toEqual({ id: '123' });
        // 2. UI
        expect(result.content[1]!.text).toContain('[SYSTEM]');
        // 3. Raw
        expect(result.content[2]!.text).toBe('From child presenter');
        // 4. Hints
        expect(result.content[3]!.text).toContain('💡');
        // 5. Rules
        expect(result.content[4]!.text).toContain('[DOMAIN RULES]');
        // 6. Suggestions
        expect(result.content[5]!.text).toContain('[SYSTEM HINT]');
    });
});

// =====================================================================
// Presenter Configuration Chaining
// =====================================================================

describe('Presenter — Fluent Chaining', () => {
    it('should support full chaining of all configuration methods', () => {
        const child = createPresenter('Child')
            .systemRules(['Child rule']);

        const presenter = createPresenter('FullChain')
            .schema(itemSchema)
            .systemRules(['Rule'])
            .uiBlocks(() => [ui.markdown('UI')])
            .collectionUiBlocks(() => [ui.markdown('Collection')])
            .agentLimit(10, (n) => ui.summary(`${n} hidden`))
            .suggestActions(() => [{ tool: 'test', reason: 'test' }])
            .embed('child', child);

        // Should not throw — all methods chainable
        const result = presenter.make({ id: 'X', value: 1 }).build();
        expect(result.content.length).toBeGreaterThan(0);
    });
});
