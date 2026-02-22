/**
 * ResponseBuilder Tests
 *
 * Unit tests for the standalone response builder, covering:
 * - Single-block data responses
 * - Multi-block composition (data + UI + hints + rules)
 * - Branded type detection for pipeline auto-build
 */
import { describe, it, expect } from 'vitest';
import { response, ResponseBuilder, isResponseBuilder } from '../../src/framework/presenter/ResponseBuilder.js';

describe('ResponseBuilder', () => {
    describe('response() factory', () => {
        it('should create a ResponseBuilder from a string', () => {
            const builder = response('hello world');
            expect(builder).toBeInstanceOf(ResponseBuilder);
        });

        it('should create a ResponseBuilder from an object', () => {
            const builder = response({ id: '123', amount: 4500 });
            expect(builder).toBeInstanceOf(ResponseBuilder);
        });
    });

    describe('.build() — single block', () => {
        it('should produce a ToolResponse with one content block for string data', () => {
            const result = response('hello world').build();
            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({ type: 'text', text: 'hello world' });
            expect(result.isError).toBeUndefined();
        });

        it('should produce a ToolResponse with JSON-serialized object data', () => {
            const data = { id: '123', amount: 4500 };
            const result = response(data).build();
            expect(result.content).toHaveLength(1);
            expect(result.content[0].type).toBe('text');
            expect(JSON.parse(result.content[0].text)).toEqual(data);
        });

        it('should default to "OK" for empty string data', () => {
            const result = response('').build();
            expect(result.content[0].text).toBe('OK');
        });
    });

    describe('.uiBlock() — UI block composition', () => {
        it('should append a separate content block with system instruction', () => {
            const result = response('data')
                .uiBlock('echarts', '```echarts\n{}\n```')
                .build();

            expect(result.content).toHaveLength(2);
            expect(result.content[0].text).toBe('data');
            expect(result.content[1].text).toContain('```echarts');
            expect(result.content[1].text).toContain('[SYSTEM]');
            expect(result.content[1].text).toContain('echarts');
        });

        it('should support multiple UI blocks', () => {
            const result = response('data')
                .uiBlock('echarts', '```echarts\n{}\n```')
                .uiBlock('mermaid', '```mermaid\ngraph TD\n```')
                .build();

            expect(result.content).toHaveLength(3);
            expect(result.content[1].text).toContain('echarts');
            expect(result.content[2].text).toContain('mermaid');
        });
    });

    describe('.llmHint() — LLM directives', () => {
        it('should append hints as a separate content block', () => {
            const result = response('data')
                .llmHint('Divide amounts by 100')
                .build();

            expect(result.content).toHaveLength(2);
            expect(result.content[1].text).toContain('💡');
            expect(result.content[1].text).toContain('Divide amounts by 100');
        });

        it('should combine multiple hints in one block', () => {
            const result = response('data')
                .llmHint('Hint 1')
                .llmHint('Hint 2')
                .build();

            expect(result.content).toHaveLength(2);
            expect(result.content[1].text).toContain('Hint 1');
            expect(result.content[1].text).toContain('Hint 2');
        });
    });

    describe('.systemRules() — domain rules', () => {
        it('should append rules as a [DOMAIN RULES] content block', () => {
            const result = response('data')
                .systemRules(['Use emojis: ✅ Paid', 'Format: $XX,XXX.00'])
                .build();

            expect(result.content).toHaveLength(2);
            expect(result.content[1].text).toContain('[DOMAIN RULES]');
            expect(result.content[1].text).toContain('Use emojis: ✅ Paid');
            expect(result.content[1].text).toContain('Format: $XX,XXX.00');
        });
    });

    describe('full composition — all layers', () => {
        it('should produce 4 content blocks in correct order: data, UI, hints, rules', () => {
            const result = response({ id: '123' })
                .uiBlock('echarts', '```echarts\n{"chart":"gauge"}\n```')
                .llmHint('Pay attention to this value')
                .systemRules(['CRITICAL: amounts are in CENTS'])
                .build();

            expect(result.content).toHaveLength(4);

            // Block 1: Data
            expect(JSON.parse(result.content[0].text)).toEqual({ id: '123' });

            // Block 2: UI
            expect(result.content[1].text).toContain('echarts');
            expect(result.content[1].text).toContain('[SYSTEM]');

            // Block 3: Hints
            expect(result.content[2].text).toContain('💡');

            // Block 4: Rules
            expect(result.content[3].text).toContain('[DOMAIN RULES]');
        });
    });

    describe('isResponseBuilder() — branded type detection', () => {
        it('should detect ResponseBuilder instances', () => {
            const builder = response('data');
            expect(isResponseBuilder(builder)).toBe(true);
        });

        it('should reject plain objects', () => {
            expect(isResponseBuilder({ content: [] })).toBe(false);
            expect(isResponseBuilder({})).toBe(false);
            expect(isResponseBuilder(null)).toBe(false);
            expect(isResponseBuilder(undefined)).toBe(false);
            expect(isResponseBuilder('string')).toBe(false);
        });

        it('should reject ToolResponse objects', () => {
            const toolResponse = { content: [{ type: 'text', text: 'hello' }] };
            expect(isResponseBuilder(toolResponse)).toBe(false);
        });
    });
});
