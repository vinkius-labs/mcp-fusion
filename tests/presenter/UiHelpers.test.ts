/**
 * UI Helpers Tests
 *
 * Unit tests for the Core 4 UI block helpers:
 * ui.echarts(), ui.mermaid(), ui.markdown(), ui.codeBlock()
 */
import { describe, it, expect } from 'vitest';
import { ui } from '../../src/presenter/ui.js';

describe('UI Helpers', () => {
    describe('ui.echarts()', () => {
        it('should produce a fenced echarts code block', () => {
            const block = ui.echarts({ title: { text: 'Burndown' } });
            expect(block.type).toBe('echarts');
            expect(block.content).toContain('```echarts');
            expect(block.content).toContain('```');
            expect(block.content).toContain('"title"');
            expect(block.content).toContain('"Burndown"');
        });

        it('should pretty-print the JSON config', () => {
            const block = ui.echarts({ a: 1 });
            expect(block.content).toContain('  "a": 1');
        });

        it('should handle empty config', () => {
            const block = ui.echarts({});
            expect(block.type).toBe('echarts');
            expect(block.content).toContain('{}');
        });

        it('should handle complex nested config', () => {
            const config = {
                xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
                series: [{ type: 'bar', data: [120, 200, 150] }],
            };
            const block = ui.echarts(config);
            expect(block.content).toContain('Mon');
            expect(block.content).toContain('bar');
        });
    });

    describe('ui.mermaid()', () => {
        it('should produce a fenced mermaid code block', () => {
            const block = ui.mermaid('graph TD; A-->B');
            expect(block.type).toBe('mermaid');
            expect(block.content).toContain('```mermaid');
            expect(block.content).toContain('graph TD; A-->B');
        });

        it('should handle multiline diagrams', () => {
            const diagram = 'graph TD\n    A["Start"] --> B["Process"]\n    B --> C["End"]';
            const block = ui.mermaid(diagram);
            expect(block.content).toContain('Start');
            expect(block.content).toContain('End');
        });
    });

    describe('ui.markdown()', () => {
        it('should return raw markdown without fencing', () => {
            const block = ui.markdown('| Col | Val |\n|---|---|\n| A | 1 |');
            expect(block.type).toBe('markdown');
            expect(block.content).not.toContain('```');
            expect(block.content).toContain('| Col | Val |');
        });

        it('should handle empty string', () => {
            const block = ui.markdown('');
            expect(block.type).toBe('markdown');
            expect(block.content).toBe('');
        });
    });

    describe('ui.codeBlock()', () => {
        it('should produce a generic fenced code block', () => {
            const block = ui.codeBlock('json', '{"key": "value"}');
            expect(block.type).toBe('json');
            expect(block.content).toContain('```json');
            expect(block.content).toContain('{"key": "value"}');
        });

        it('should support any language identifier', () => {
            const block = ui.codeBlock('xml', '<root><item>value</item></root>');
            expect(block.type).toBe('xml');
            expect(block.content).toContain('```xml');
        });
    });

    describe('UiBlock shape contract', () => {
        it('should always return objects with type and content', () => {
            const blocks = [
                ui.echarts({ a: 1 }),
                ui.mermaid('graph TD'),
                ui.markdown('text'),
                ui.codeBlock('json', '{}'),
            ];

            for (const block of blocks) {
                expect(block).toHaveProperty('type');
                expect(block).toHaveProperty('content');
                expect(typeof block.type).toBe('string');
                expect(typeof block.content).toBe('string');
            }
        });
    });
});
