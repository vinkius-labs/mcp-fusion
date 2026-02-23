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
} as const;
