/**
 * DescriptionDecorator — Cache-Control Directive Injection
 *
 * Pure function. Single responsibility: append a `[Cache-Control: X]`
 * suffix to a tool's description based on its resolved policy.
 *
 * Idempotent: if the description already ends with a Cache-Control
 * directive, it is replaced (not duplicated).
 *
 * @example
 * ```
 * Before: "Manage sprints."
 * After:  "Manage sprints. [Cache-Control: no-store]"
 * ```
 *
 * @module
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedPolicy } from './types.js';

/** Regex to detect an existing Cache-Control directive at the end of a description. */
const CACHE_CONTROL_PATTERN = /\s*\[Cache-Control:\s*\w[^\]]*\]$/;

/**
 * Decorate a tool's description with its Cache-Control directive.
 *
 * Returns a shallow copy with the decorated description.
 * If the policy has no `cacheControl`, returns the tool unchanged.
 *
 * @param tool   - Original MCP tool definition
 * @param policy - Resolved policy for this tool (may be null)
 * @returns The tool with an appended `[Cache-Control: X]` suffix, or unchanged
 */
export function decorateDescription(
    tool: McpTool,
    policy: ResolvedPolicy | null,
): McpTool {
    if (!policy?.cacheControl) return tool;

    const suffix = ` [Cache-Control: ${policy.cacheControl}]`;
    const base = (tool.description ?? '').replace(CACHE_CONTROL_PATTERN, '');

    return { ...tool, description: base + suffix };
}
