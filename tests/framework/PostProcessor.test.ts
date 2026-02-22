/**
 * PostProcessor.test.ts — Unit Tests for MVA Response Post-Processing
 *
 * Tests the 4-priority hierarchy:
 * 1. ToolResponse → pass through
 * 2. ResponseBuilder → auto-build
 * 3. Raw data + Presenter → pipe through MVA
 * 4. Raw data without Presenter → fallback
 *
 * Also tests context injection into Presenters.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { postProcessResult, isToolResponse } from '../../src/framework/presenter/PostProcessor.js';
import { response } from '../../src/framework/presenter/ResponseBuilder.js';
import { createPresenter, ui } from '../../src/framework/presenter/index.js';

// =====================================================================
// isToolResponse() — Type Guard
// =====================================================================

describe('isToolResponse()', () => {
    it('should detect valid ToolResponse with content array', () => {
        expect(isToolResponse({ content: [{ type: 'text', text: 'hi' }] })).toBe(true);
    });

    it('should detect ToolResponse with empty content array', () => {
        expect(isToolResponse({ content: [] })).toBe(true);
    });

    it('should reject null', () => {
        expect(isToolResponse(null)).toBe(false);
    });

    it('should reject undefined', () => {
        expect(isToolResponse(undefined)).toBe(false);
    });

    it('should reject primitives', () => {
        expect(isToolResponse('string')).toBe(false);
        expect(isToolResponse(42)).toBe(false);
        expect(isToolResponse(true)).toBe(false);
    });

    it('should reject objects without content', () => {
        expect(isToolResponse({})).toBe(false);
        expect(isToolResponse({ data: 'hello' })).toBe(false);
    });

    it('should reject objects with non-array content', () => {
        expect(isToolResponse({ content: 'not-array' })).toBe(false);
        expect(isToolResponse({ content: {} })).toBe(false);
        expect(isToolResponse({ content: 42 })).toBe(false);
    });
});

// =====================================================================
// postProcessResult() — Priority 1: ToolResponse Pass-Through
// =====================================================================

describe('postProcessResult() — Priority 1: ToolResponse', () => {
    it('should pass through a valid ToolResponse unchanged', () => {
        const toolResponse = { content: [{ type: 'text' as const, text: 'hello' }] };
        const result = postProcessResult(toolResponse, undefined);
        expect(result).toBe(toolResponse); // Exact same reference
    });

    it('should pass through even if a Presenter is provided', () => {
        const presenter = createPresenter('Ignored').systemRules(['Rule']);
        const toolResponse = { content: [{ type: 'text' as const, text: 'data' }] };
        const result = postProcessResult(toolResponse, presenter);
        expect(result).toBe(toolResponse); // ToolResponse takes priority
    });

    it('should pass through ToolResponse with isError flag', () => {
        const errorResponse = { content: [{ type: 'text' as const, text: 'error!' }], isError: true };
        const result = postProcessResult(errorResponse, undefined);
        expect(result).toBe(errorResponse);
    });
});

// =====================================================================
// postProcessResult() — Priority 2: ResponseBuilder Auto-Build
// =====================================================================

describe('postProcessResult() — Priority 2: ResponseBuilder', () => {
    it('should auto-call .build() on a ResponseBuilder', () => {
        const builder = response('hello from builder');
        const result = postProcessResult(builder, undefined);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]!.text).toBe('hello from builder');
    });

    it('should auto-build even if a Presenter is provided', () => {
        const presenter = createPresenter('Ignored');
        const builder = response('builder wins').systemRules(['rule']);
        const result = postProcessResult(builder, presenter);
        expect(result.content[0]!.text).toBe('builder wins');
        expect(result.content[1]!.text).toContain('[DOMAIN RULES]');
    });

    it('should auto-build with all layers (UI, hints, rules)', () => {
        const builder = response('data')
            .uiBlock('markdown', '**bold**')
            .llmHint('Pay attention')
            .systemRules(['Rule 1']);

        const result = postProcessResult(builder, undefined);
        expect(result.content).toHaveLength(4);
    });
});

// =====================================================================
// postProcessResult() — Priority 3: Raw Data + Presenter
// =====================================================================

describe('postProcessResult() — Priority 3: Raw Data + Presenter', () => {
    it('should pipe raw object through Presenter.make().build()', () => {
        const schema = z.object({ id: z.string(), name: z.string() });
        const presenter = createPresenter('User')
            .schema(schema)
            .systemRules(['Format name in bold']);

        const result = postProcessResult(
            { id: 'U1', name: 'Alice', extra: 'stripped' },
            presenter,
        );

        const data = JSON.parse(result.content[0]!.text);
        expect(data.id).toBe('U1');
        expect(data.name).toBe('Alice');
        expect(data.extra).toBeUndefined(); // Schema strips it
        expect(result.content[1]!.text).toContain('Format name in bold');
    });

    it('should pipe raw array through Presenter with collectionUiBlocks', () => {
        const schema = z.object({ id: z.string() });
        const presenter = createPresenter('Item')
            .schema(schema)
            .collectionUiBlocks((items: { id: string }[]) => [
                ui.summary(`Found ${items.length} items`),
            ]);

        const result = postProcessResult(
            [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
            presenter,
        );

        const data = JSON.parse(result.content[0]!.text);
        expect(data).toHaveLength(3);
        expect(result.content.some(c => c.text.includes('Found 3 items'))).toBe(true);
    });

    it('should pass context to Presenter when provided', () => {
        const presenter = createPresenter('CtxTest')
            .systemRules((_data: unknown, ctx?: unknown) => {
                const c = ctx as { locale: string } | undefined;
                return [`Locale: ${c?.locale ?? 'default'}`];
            });

        const result = postProcessResult('data', presenter, { locale: 'pt-BR' });
        expect(result.content.some(c => c.text.includes('Locale: pt-BR'))).toBe(true);
    });

    it('should work without context (backward compat)', () => {
        const presenter = createPresenter('NoCtx')
            .systemRules(['Static rule']);

        const result = postProcessResult('data', presenter);
        expect(result.content.some(c => c.text.includes('Static rule'))).toBe(true);
    });
});

// =====================================================================
// postProcessResult() — Priority 4: Raw Data Without Presenter
// =====================================================================

describe('postProcessResult() — Priority 4: Raw Data Fallback', () => {
    it('should wrap a string in a ToolResponse', () => {
        const result = postProcessResult('hello world', undefined);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]!.text).toBe('hello world');
    });

    it('should default to "OK" for empty string', () => {
        const result = postProcessResult('', undefined);
        expect(result.content[0]!.text).toBe('OK');
    });

    it('should JSON-serialize objects', () => {
        const result = postProcessResult({ key: 'value', num: 42 }, undefined);
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed.key).toBe('value');
        expect(parsed.num).toBe(42);
    });

    it('should JSON-serialize arrays', () => {
        const result = postProcessResult([1, 2, 3], undefined);
        const parsed = JSON.parse(result.content[0]!.text);
        expect(parsed).toEqual([1, 2, 3]);
    });

    it('should JSON-serialize null', () => {
        const result = postProcessResult(null, undefined);
        expect(result.content[0]!.text).toBe('null');
    });

    it('should handle numbers', () => {
        const result = postProcessResult(42, undefined);
        expect(result.content[0]!.text).toBe('42');
    });

    it('should handle booleans', () => {
        const result = postProcessResult(true, undefined);
        expect(result.content[0]!.text).toBe('true');
    });
});
