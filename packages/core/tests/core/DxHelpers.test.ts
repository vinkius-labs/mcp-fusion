/**
 * DX Helpers Tests — Extended UI Helpers + Response Shortcuts + PresenterValidationError
 *
 * Tests for the progressive disclosure DX layer:
 * - ui.table(), ui.list(), ui.json(), ui.summary() — new DX helpers
 * - response.ok(), response.withRules() — convenience shortcuts
 * - PresenterValidationError — domain-aware error wrapping
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ui } from '../../src/presenter/ui.js';
import { response } from '../../src/presenter/ResponseBuilder.js';
import { createPresenter } from '../../src/presenter/Presenter.js';
import { PresenterValidationError } from '../../src/presenter/PresenterValidationError.js';

// ============================================================================
// ui.table() — Markdown Table Generator
// ============================================================================

describe('ui.table()', () => {
    it('should generate a markdown table from headers and rows', () => {
        const block = ui.table(
            ['ID', 'Amount', 'Status'],
            [
                ['INV-001', '$4,500.00', '✅ Paid'],
                ['INV-002', '$1,200.00', '⚠️ Pending'],
            ],
        );

        expect(block.type).toBe('markdown');
        expect(block.content).toContain('| ID | Amount | Status |');
        expect(block.content).toContain('| --- | --- | --- |');
        expect(block.content).toContain('| INV-001 | $4,500.00 | ✅ Paid |');
        expect(block.content).toContain('| INV-002 | $1,200.00 | ⚠️ Pending |');
    });

    it('should handle a single row', () => {
        const block = ui.table(['Name'], [['Alice']]);
        expect(block.content).toContain('| Name |');
        expect(block.content).toContain('| Alice |');
    });

    it('should handle empty rows', () => {
        const block = ui.table(['H1', 'H2'], []);
        expect(block.content).toContain('| H1 | H2 |');
        expect(block.content).toContain('| --- | --- |');
    });
});

// ============================================================================
// ui.list() — Markdown Bullet List
// ============================================================================

describe('ui.list()', () => {
    it('should generate a markdown bullet list', () => {
        const block = ui.list(['Deploy API', 'Run migrations', 'Verify health']);

        expect(block.type).toBe('markdown');
        expect(block.content).toBe(
            '- Deploy API\n- Run migrations\n- Verify health',
        );
    });

    it('should handle single item', () => {
        const block = ui.list(['Only item']);
        expect(block.content).toBe('- Only item');
    });

    it('should handle empty array', () => {
        const block = ui.list([]);
        expect(block.content).toBe('');
    });
});

// ============================================================================
// ui.json() — Fenced JSON Block
// ============================================================================

describe('ui.json()', () => {
    it('should generate a fenced json code block', () => {
        const block = ui.json({ host: 'api.example.com', port: 3000 });

        expect(block.type).toBe('json');
        expect(block.content).toContain('```json');
        expect(block.content).toContain('"host": "api.example.com"');
        expect(block.content).toContain('"port": 3000');
    });

    it('should handle arrays', () => {
        const block = ui.json([1, 2, 3]);
        expect(block.content).toContain('```json');
        expect(block.content).toContain('1');
    });

    it('should handle nested objects', () => {
        const block = ui.json({ a: { b: { c: true } } });
        expect(block.content).toContain('"c": true');
    });

    it('should handle primitives', () => {
        const block = ui.json('hello');
        expect(block.content).toContain('"hello"');
    });
});

// ============================================================================
// ui.summary() — Collection Summary
// ============================================================================

describe('ui.summary()', () => {
    it('should generate a summary block with emoji prefix', () => {
        const block = ui.summary('3 invoices totaling $5,700.00. 2 paid, 1 pending.');

        expect(block.type).toBe('summary');
        expect(block.content).toContain('📊');
        expect(block.content).toContain('**Summary**');
        expect(block.content).toContain('3 invoices');
    });

    it('should handle empty summary', () => {
        const block = ui.summary('');
        expect(block.type).toBe('summary');
        expect(block.content).toContain('📊');
    });
});

// ============================================================================
// response.ok() — Shorthand
// ============================================================================

describe('response.ok()', () => {
    it('should build a complete response from string', () => {
        const result = response.ok('Task created');

        expect(result.content).toHaveLength(1);
        expect(result.content[0].text).toBe('Task created');
        expect(result.isError).toBeUndefined();
    });

    it('should build a complete response from object', () => {
        const data = { id: '123', name: 'Acme' };
        const result = response.ok(data);

        expect(result.content).toHaveLength(1);
        expect(JSON.parse(result.content[0].text)).toEqual(data);
    });

    it('should default empty string to "OK"', () => {
        const result = response.ok('');
        expect(result.content[0].text).toBe('OK');
    });
});

// ============================================================================
// response.withRules() — Shorthand with Rules
// ============================================================================

describe('response.withRules()', () => {
    it('should build a response with domain rules', () => {
        const result = response.withRules({ amount: 4500 }, [
            'Amounts are in CENTS. Divide by 100.',
            'Use $ symbol.',
        ]);

        expect(result.content).toHaveLength(2);

        // Block 1: Data
        expect(JSON.parse(result.content[0].text)).toEqual({ amount: 4500 });

        // Block 2: Rules
        expect(result.content[1].text).toContain('domain_rules');
        expect(result.content[1].text).toContain('CENTS');
        expect(result.content[1].text).toContain('$ symbol');
    });

    it('should handle empty rules array', () => {
        const result = response.withRules('data', []);
        expect(result.content).toHaveLength(1); // No rules block
    });
});

// ============================================================================
// PresenterValidationError — Domain-Aware Errors
// ============================================================================

describe('PresenterValidationError', () => {
    it('should include Presenter name in error message', () => {
        const presenter = createPresenter('Invoice')
            .schema(z.object({ id: z.string() }));

        try {
            presenter.make({ id: 123 });
            expect.unreachable('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(PresenterValidationError);
            const error = err as PresenterValidationError;
            expect(error.presenterName).toBe('Invoice');
            expect(error.message).toContain('[Invoice Presenter]');
            expect(error.message).toContain('Validation failed');
        }
    });

    it('should include field path in error message', () => {
        const presenter = createPresenter('User')
            .schema(z.object({
                name: z.string(),
                age: z.number(),
            }));

        try {
            presenter.make({ name: 123, age: 'not-a-number' });
            expect.unreachable('Should have thrown');
        } catch (err) {
            const error = err as PresenterValidationError;
            expect(error.message).toContain("'name'");
            expect(error.message).toContain("'age'");
        }
    });

    it('should preserve original ZodError as cause', () => {
        const presenter = createPresenter('Task')
            .schema(z.object({ title: z.string() }));

        try {
            presenter.make({ title: 42 });
            expect.unreachable('Should have thrown');
        } catch (err) {
            const error = err as PresenterValidationError;
            expect(error.cause).toBeDefined();
            expect(error.name).toBe('PresenterValidationError');
        }
    });

    it('should work for array validation (each item validated)', () => {
        const presenter = createPresenter('Item')
            .schema(z.object({ id: z.string() }));

        try {
            presenter.make([
                { id: 'valid' },
                { id: 999 },  // Second item invalid
            ]);
            expect.unreachable('Should have thrown');
        } catch (err) {
            const error = err as PresenterValidationError;
            expect(error.presenterName).toBe('Item');
            expect(error.message).toContain('[Item Presenter]');
        }
    });
});
