/**
 * ResponseDecorator — Causal Invalidation Signal Injection
 *
 * Pure function. Single responsibility: prepend a `[System: ...]`
 * content block to a tool call result when causal invalidation
 * is triggered.
 *
 * The system block goes at **index 0** — a deliberate design choice:
 * it survives response truncation and appears before the developer's
 * payload, maximizing LLM attention.
 *
 * @example
 * ```
 * Before: [{ type: 'text', text: '{"ok": true}' }]
 * After:  [
 *   { type: 'text', text: '[System: Cache invalidated for sprints.* — caused by sprints.update]' },
 *   { type: 'text', text: '{"ok": true}' },
 * ]
 * ```
 *
 * @module
 */
import type { ToolResponse } from '../core/response.js';

/**
 * Prepend a System invalidation content block to a tool call response.
 *
 * @param result    - The original tool call result (developer's response)
 * @param patterns  - Domain patterns that were invalidated (e.g. `['sprints.*']`)
 * @param causedBy  - The tool name that caused the invalidation
 * @returns A new result with the System block at index 0
 */
export function decorateResponse(
    result: ToolResponse,
    patterns: readonly string[],
    causedBy: string,
): ToolResponse {
    const domains = patterns.join(', ');

    return {
        ...result,
        content: [
            { type: 'text' as const, text: `<cache_invalidation cause="${causedBy}" domains="${domains}" />` },
            ...result.content,
        ],
    };
}
