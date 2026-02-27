/**
 * suggest() — Fluent Action Suggestion Helper
 *
 * Replaces `{ tool: '...', reason: '...' }` config objects with a
 * clean function call that reads like English.
 *
 * @example
 * ```typescript
 * import { suggest } from '@vinkius-core/mcp-fusion';
 *
 * .suggest((invoice) => [
 *     suggest('invoices.get', 'View invoice details'),
 *     invoice.status === 'overdue'
 *         ? suggest('billing.remind', 'Send collection reminder')
 *         : null,
 * ])
 * ```
 *
 * @module
 */
import { type ActionSuggestion } from './Presenter.js';

/**
 * Create an action suggestion for HATEOAS-style agent guidance.
 *
 * Fluent alternative to `{ tool: '...', reason: '...' }` config objects.
 * Reads like `suggest(what, why)` — zero ceremony.
 *
 * @param tool - Tool name to suggest (e.g. `'billing.pay'`)
 * @param reason - Human-readable reason for the suggestion
 * @returns An {@link ActionSuggestion} object
 *
 * @example
 * ```typescript
 * suggest('projects.archive', 'Archive this inactive project')
 * // → { tool: 'projects.archive', reason: 'Archive this inactive project' }
 * ```
 */
export function suggest(tool: string, reason: string): ActionSuggestion {
    return { tool, reason };
}
