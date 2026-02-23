/**
 * PromptMessage — Factory Helpers for Prompt Messages
 *
 * Provides ergonomic factory methods for creating `PromptMessagePayload`
 * objects used in `PromptResult.messages`.
 *
 * These helpers encode the MCP wire format so developers never deal
 * with `{ role: 'user', content: { type: 'text', text: '...' } }`
 * manually.
 *
 * @example
 * ```typescript
 * import { PromptMessage } from '@vinkius-core/mcp-fusion';
 *
 * return {
 *     messages: [
 *         PromptMessage.system('You are a Senior Auditor.'),
 *         PromptMessage.user('Begin the audit.'),
 *         PromptMessage.assistant('Analyzing invoices...'),
 *     ],
 * };
 * ```
 *
 * @module
 */
import { type PromptMessagePayload } from './PromptTypes.js';
import { type ResponseBuilder } from '../presenter/ResponseBuilder.js';

/**
 * Factory for creating MCP prompt messages.
 *
 * **Note on `system()`:** The MCP protocol only supports `user` and
 * `assistant` roles in `PromptMessage`. System instructions are encoded
 * as a `user` message (the first message) by convention — the MCP client
 * prepends it to the conversation context.
 */
export const PromptMessage = {
    /**
     * Create a system instruction message.
     *
     * Encoded as `role: 'user'` per MCP spec (MCP does not have
     * a `system` role in PromptMessage — system instructions are
     * conveyed as the first `user` message by convention).
     *
     * @param text - System instruction text
     */
    system(text: string): PromptMessagePayload {
        return { role: 'user', content: { type: 'text', text } };
    },

    /**
     * Create a user message.
     *
     * @param text - User message text
     */
    user(text: string): PromptMessagePayload {
        return { role: 'user', content: { type: 'text', text } };
    },

    /**
     * Create an assistant message (for multi-turn seeding).
     *
     * Use this to pre-seed the assistant's initial response,
     * guiding the LLM's first reasoning step.
     *
     * @param text - Assistant message text
     */
    assistant(text: string): PromptMessagePayload {
        return { role: 'assistant', content: { type: 'text', text } };
    },

    /**
     * Create a message with an embedded image.
     *
     * @param role - Message role ('user' or 'assistant')
     * @param data - Base64-encoded image data
     * @param mimeType - MIME type (e.g., 'image/png', 'image/jpeg')
     */
    image(role: 'user' | 'assistant', data: string, mimeType: string): PromptMessagePayload {
        return { role, content: { type: 'image', data, mimeType } };
    },

    /**
     * Create a message with embedded audio.
     *
     * @param role - Message role ('user' or 'assistant')
     * @param data - Base64-encoded audio data
     * @param mimeType - MIME type (e.g., 'audio/wav', 'audio/mp3')
     */
    audio(role: 'user' | 'assistant', data: string, mimeType: string): PromptMessagePayload {
        return { role, content: { type: 'audio', data, mimeType } };
    },

    /**
     * Create a message with an embedded resource reference.
     *
     * @param role - Message role ('user' or 'assistant')
     * @param uri - Resource URI
     * @param options - Optional mime type, text, or blob data
     */
    resource(
        role: 'user' | 'assistant',
        uri: string,
        options?: { mimeType?: string; text?: string; blob?: string },
    ): PromptMessagePayload {
        return {
            role,
            content: {
                type: 'resource',
                resource: { uri, ...options },
            },
        };
    },

    /**
     * Decompose a Presenter view into prompt messages.
     *
     * MVA-Driven Prompts — the bridge between the Presenter layer
     * (MVA View for Tools) and the Prompt Engine. Extracts system rules,
     * data, UI blocks, and action suggestions from a `ResponseBuilder`
     * into composable `PromptMessagePayload[]` messages.
     *
     * Uses XML-tagged semantic blocks (`<domain_rules>`, `<dataset>`,
     * `<visual_context>`, `<system_guidance>`) optimized for frontier
     * LLM context handling — prevents context leakage between layers.
     *
     * **Single Source of Truth**: If a Presenter's `systemRules()` change,
     * both Tools and Prompts update automatically — zero duplication.
     *
     * @param builder - A `ResponseBuilder` from `Presenter.make()` or `response()`
     * @returns Array of prompt messages, ready to spread into `messages: [...]`
     *
     * @example
     * ```typescript
     * import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';
     * import { InvoicePresenter } from './presenters';
     *
     * const AuditPrompt = definePrompt<AppContext>('audit', {
     *     args: { invoiceId: 'string' } as const,
     *     handler: async (ctx, { invoiceId }) => {
     *         const invoice = await ctx.db.getInvoice(invoiceId);
     *         return {
     *             messages: [
     *                 PromptMessage.system('You are a Senior Financial Auditor.'),
     *                 ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
     *                 PromptMessage.user('Begin the audit for this invoice.'),
     *             ],
     *         };
     *     },
     * });
     * ```
     *
     * @see {@link Presenter} for the MVA View layer
     * @see {@link ResponseBuilder} for the data source
     */
    fromView(builder: ResponseBuilder): PromptMessagePayload[] {
        const messages: PromptMessagePayload[] = [];

        // 1. RULES → SYSTEM ROLE (domain directives travel with the data)
        const rules = builder.getRules();
        if (rules.length > 0) {
            messages.push(PromptMessage.system(
                `<domain_rules>\n${rules.map(r => `- ${r}`).join('\n')}\n</domain_rules>`,
            ));
        }

        // 2. DATA & UI BLOCKS → USER ROLE (context for the LLM)
        const data = builder.getData();
        const uiBlocks = builder.getUiBlocks();

        let userContent = '';
        if (data) {
            userContent += `<dataset>\n\`\`\`json\n${data}\n\`\`\`\n</dataset>\n\n`;
        }
        if (uiBlocks.length > 0) {
            userContent += `<visual_context>\n${uiBlocks.map(b => b.content).join('\n\n')}\n</visual_context>\n\n`;
        }

        if (userContent.trim()) {
            messages.push(PromptMessage.user(userContent.trim()));
        }

        // 3. AFFORDANCES → SYSTEM ROLE (hints + HATEOAS suggestions)
        const hints = builder.getHints();
        const suggestions = builder.getSuggestions();
        if (hints.length > 0 || suggestions.length > 0) {
            let guidance = '<system_guidance>\n';
            if (hints.length > 0) {
                guidance += hints.map(h => `Hint: ${h}`).join('\n') + '\n';
            }
            if (suggestions.length > 0) {
                guidance += `Suggested Next Actions: ${suggestions.map(s => `${s.tool} (${s.reason})`).join(', ')}\n`;
            }
            guidance += '</system_guidance>';
            messages.push(PromptMessage.system(guidance));
        }

        return messages;
    },
} as const;

