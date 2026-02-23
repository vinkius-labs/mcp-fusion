/**
 * PromptMessage.fromView() Tests
 *
 * MVA-Driven Prompts: verifies the bridge between the Presenter layer
 * (ResponseBuilder) and the Prompt Engine (PromptMessagePayload[]).
 *
 * Tests XML-tagged semantic blocks, layer isolation, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { PromptMessage } from '../../src/prompt/PromptMessage.js';
import { response } from '../../src/presenter/ResponseBuilder.js';
import { createPresenter, ui } from '../../src/presenter/index.js';
import { z } from 'zod';

describe('PromptMessage.fromView()', () => {
    describe('rules decomposition', () => {
        it('should extract system rules into <domain_rules> XML block', () => {
            const builder = response({ id: '123' })
                .systemRules(['CRITICAL: amounts in CENTS', 'Use $ symbol']);

            const messages = PromptMessage.fromView(builder);

            // First message should be the rules
            expect(messages[0].role).toBe('user'); // MCP system = user role
            expect(messages[0].content).toEqual({
                type: 'text',
                text: '<domain_rules>\n- CRITICAL: amounts in CENTS\n- Use $ symbol\n</domain_rules>',
            });
        });

        it('should skip rules block when no rules are present', () => {
            const builder = response({ id: '123' });
            const messages = PromptMessage.fromView(builder);

            // Should only have data, no rules
            expect(messages).toHaveLength(1);
            const allText = messages.map(m => (m.content as { text: string }).text).join('');
            expect(allText).not.toContain('<domain_rules>');
        });
    });

    describe('data decomposition', () => {
        it('should extract data into <dataset> XML block with JSON fence', () => {
            const data = { id: '123', amount: 4500 };
            const builder = response(data);

            const messages = PromptMessage.fromView(builder);

            expect(messages).toHaveLength(1);
            const text = (messages[0].content as { text: string }).text;
            expect(text).toContain('<dataset>');
            expect(text).toContain('```json');
            expect(text).toContain('"id": "123"');
            expect(text).toContain('"amount": 4500');
            expect(text).toContain('</dataset>');
        });

        it('should handle string data', () => {
            const builder = response('Task created successfully');
            const messages = PromptMessage.fromView(builder);

            expect(messages).toHaveLength(1);
            const text = (messages[0].content as { text: string }).text;
            expect(text).toContain('<dataset>');
            expect(text).toContain('Task created successfully');
        });
    });

    describe('UI blocks decomposition', () => {
        it('should extract UI blocks into <visual_context> XML block', () => {
            const builder = response({ id: '123' })
                .uiBlock(ui.echarts({ series: [{ type: 'gauge', data: [{ value: 45 }] }] }));

            const messages = PromptMessage.fromView(builder);

            expect(messages).toHaveLength(1); // data + UI in same user message
            const text = (messages[0].content as { text: string }).text;
            expect(text).toContain('<dataset>');
            expect(text).toContain('<visual_context>');
            expect(text).toContain('echarts');
            expect(text).toContain('</visual_context>');
        });

        it('should combine multiple UI blocks in one <visual_context> tag', () => {
            const builder = response({ id: '123' })
                .uiBlock(ui.echarts({ series: [] }))
                .uiBlock(ui.markdown('**Summary**: OK'));

            const messages = PromptMessage.fromView(builder);

            const text = (messages[0].content as { text: string }).text;
            // Should be a single <visual_context> with both blocks
            const visualMatches = text.match(/<visual_context>/g);
            expect(visualMatches).toHaveLength(1);
            expect(text).toContain('echarts');
            expect(text).toContain('**Summary**: OK');
        });
    });

    describe('hints & suggestions decomposition', () => {
        it('should extract hints into <system_guidance> XML block', () => {
            const builder = response({ id: '123' })
                .llmHint('Divide amounts by 100 before displaying');

            const messages = PromptMessage.fromView(builder);

            // Data message + guidance message
            expect(messages).toHaveLength(2);
            const guidanceMsg = messages[1];
            const text = (guidanceMsg.content as { text: string }).text;
            expect(text).toContain('<system_guidance>');
            expect(text).toContain('Hint: Divide amounts by 100 before displaying');
            expect(text).toContain('</system_guidance>');
        });

        it('should extract action suggestions into <system_guidance>', () => {
            const builder = response({ id: '123' })
                .systemHint([
                    { tool: 'billing.pay', reason: 'Offer payment' },
                    { tool: 'billing.remind', reason: 'Send reminder' },
                ]);

            const messages = PromptMessage.fromView(builder);

            const guidanceMsg = messages[1];
            const text = (guidanceMsg.content as { text: string }).text;
            expect(text).toContain('Suggested Next Actions:');
            expect(text).toContain('billing.pay (Offer payment)');
            expect(text).toContain('billing.remind (Send reminder)');
        });

        it('should combine hints and suggestions in one block', () => {
            const builder = response({ id: '123' })
                .llmHint('Pay attention')
                .systemHint([{ tool: 'tasks.update', reason: 'Mark as done' }]);

            const messages = PromptMessage.fromView(builder);

            const guidanceMsg = messages[1];
            const text = (guidanceMsg.content as { text: string }).text;
            expect(text).toContain('Hint: Pay attention');
            expect(text).toContain('Suggested Next Actions:');
            expect(text).toContain('tasks.update (Mark as done)');
        });
    });

    describe('full composition', () => {
        it('should decompose all layers in correct order: rules → data+UI → guidance', () => {
            const builder = response({ id: 'INV-001', amount_cents: 150000 })
                .systemRules(['CRITICAL: amounts in CENTS', 'Mask PII for non-admin'])
                .uiBlock(ui.echarts({ series: [{ type: 'bar' }] }))
                .llmHint('Summarize findings')
                .systemHint([{ tool: 'billing.approve', reason: 'Approve invoice' }]);

            const messages = PromptMessage.fromView(builder);

            // Should be 3 messages: rules, data+UI, guidance
            expect(messages).toHaveLength(3);

            // Message 1: Rules (system role → user in MCP)
            const rulesText = (messages[0].content as { text: string }).text;
            expect(rulesText).toMatch(/^<domain_rules>/);
            expect(rulesText).toContain('CRITICAL: amounts in CENTS');

            // Message 2: Data + UI (user role)
            const dataText = (messages[1].content as { text: string }).text;
            expect(dataText).toContain('<dataset>');
            expect(dataText).toContain('"amount_cents": 150000');
            expect(dataText).toContain('<visual_context>');

            // Message 3: Guidance (system role)
            const guidanceText = (messages[2].content as { text: string }).text;
            expect(guidanceText).toContain('<system_guidance>');
            expect(guidanceText).toContain('Hint: Summarize findings');
            expect(guidanceText).toContain('billing.approve');
        });

        it('should be spreadable into a prompt handler result', () => {
            const builder = response({ task: 'done' })
                .systemRules(['Use tables']);

            const result = {
                messages: [
                    PromptMessage.system('You are a Senior Analyst.'),
                    ...PromptMessage.fromView(builder),
                    PromptMessage.user('Analyze the results.'),
                ],
            };

            // 1 system + 2 fromView (rules + data) + 1 user = 4
            expect(result.messages).toHaveLength(4);
            expect((result.messages[0].content as { text: string }).text).toBe('You are a Senior Analyst.');
            expect((result.messages[1].content as { text: string }).text).toContain('<domain_rules>');
            expect((result.messages[2].content as { text: string }).text).toContain('<dataset>');
            expect((result.messages[3].content as { text: string }).text).toBe('Analyze the results.');
        });
    });

    describe('Presenter integration', () => {
        it('should decompose a full Presenter.make() view with rules and UI', () => {
            const InvoicePresenter = createPresenter('Invoice')
                .schema(z.object({
                    id: z.string(),
                    amount_cents: z.number(),
                    status: z.enum(['paid', 'pending']),
                }))
                .systemRules(['CRITICAL: amount_cents is in CENTS. Divide by 100.'])
                .uiBlocks((invoice) => [
                    ui.markdown(`**Invoice ${invoice.id}**: ${invoice.status}`),
                ]);

            const view = InvoicePresenter.make({
                id: 'INV-999',
                amount_cents: 50000,
                status: 'pending',
            });

            const messages = PromptMessage.fromView(view);

            // Should have rules + data with UI blocks
            expect(messages.length).toBeGreaterThanOrEqual(2);

            // Rules should come from the Presenter
            const rulesMsg = messages.find(m =>
                (m.content as { text: string }).text.includes('<domain_rules>'),
            );
            expect(rulesMsg).toBeDefined();
            expect((rulesMsg!.content as { text: string }).text).toContain('CENTS');

            // Data should include the validated fields
            const dataMsg = messages.find(m =>
                (m.content as { text: string }).text.includes('<dataset>'),
            );
            expect(dataMsg).toBeDefined();
            expect((dataMsg!.content as { text: string }).text).toContain('INV-999');
            expect((dataMsg!.content as { text: string }).text).toContain('<visual_context>');
        });
    });

    describe('edge cases', () => {
        it('should handle builder with only data (no rules, no UI, no hints)', () => {
            const builder = response({ simple: true });
            const messages = PromptMessage.fromView(builder);

            expect(messages).toHaveLength(1);
            const text = (messages[0].content as { text: string }).text;
            expect(text).toContain('<dataset>');
            expect(text).not.toContain('<domain_rules>');
            expect(text).not.toContain('<visual_context>');
            expect(text).not.toContain('<system_guidance>');
        });

        it('should handle empty suggestions array (no guidance block)', () => {
            const builder = response({ id: '1' }).systemHint([]);
            const messages = PromptMessage.fromView(builder);

            // Only data, no guidance
            expect(messages).toHaveLength(1);
        });
    });
});
