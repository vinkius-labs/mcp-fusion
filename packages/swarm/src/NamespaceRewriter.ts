/**
 * Federated Handoff Protocol — Namespace Rewriter
 *
 * Prefixes upstream tool names with the gateway domain to avoid
 * collisions when multiple upstream servers are active.
 *
 * @example
 * Upstream tool `refund` → exposed as `finance.refund`
 *
 * @module
 */
import type { Tool as McpTool } from "@modelcontextprotocol/server";

/** Thrown when a tool call prefix does not match the active upstream domain. */
export class NamespaceError extends Error {
    constructor(
        public readonly toolName: string,
        public readonly expectedPrefix: string,
    ) {
        super(
            `[mcpfusion/swarm] Tool "${toolName}" does not match active upstream prefix "${expectedPrefix}". ` +
            'This may indicate a stale tools/list cache on the client side.',
        );
        this.name = 'NamespaceError';
    }
}

/**
 * Rewrites tool names and descriptions with a domain prefix.
 *
 * Applied by the SwarmGateway to the upstream's tools/list response
 * before delivering it to the LLM, and reversed before forwarding
 * a tools/call to the upstream.
 */
export class NamespaceRewriter {
    /**
     * Prefix every tool name and description with `${prefix}.`.
     *
     * @param tools  - Raw tools from the upstream server
     * @param prefix - Domain prefix (e.g. `'finance'`)
     * @returns New array with rewritten names and descriptions
     */
    rewriteList(tools: McpTool[], prefix: string): McpTool[] {
        return tools.map(tool => {
            const rewritten: McpTool = {
                ...tool,
                name: `${prefix}.${tool.name}`,
                description: tool.description
                    ? `[${prefix}] ${tool.description}`
                    : `[${prefix}]`,
                // deep-clone the inputSchema so mutations to the rewritten
                // tool's properties do not propagate back to the upstream's original object.
                // The `{ ...tool }` spread above is shallow: inputSchema would otherwise
                // be a shared reference between the original and the rewritten copy.
                inputSchema: structuredClone(tool.inputSchema) as McpTool['inputSchema'],
            };
            // also prefix the `title` field if present.
            // Some MCP-compatible UIs render `title` as the human-readable tool name
            // alongside `name`. Without prefixing it, the display would show
            // "finance.refund" as the name but "Refund Invoice" as the title —
            // losing the domain context that the prefix provides.
            const rawTool = tool as Record<string, unknown>;
            if (typeof rawTool['title'] === 'string') {
                (rewritten as Record<string, unknown>)['title'] = `[${prefix}] ${rawTool['title']}`;
            }
            return rewritten;
        });
    }

    /**
     * Strip the `${prefix}.` from a tool name before forwarding to the upstream.
     *
     * @param toolName - Prefixed tool name (e.g. `'finance.refund'`)
     * @param prefix   - Expected domain prefix (e.g. `'finance'`)
     * @returns Unprefixed tool name (e.g. `'refund'`)
     * @throws {@link NamespaceError} if the prefix does not match
     */
    stripPrefix(toolName: string, prefix: string): string {
        const expected = `${prefix}.`;
        if (!toolName.startsWith(expected)) {
            throw new NamespaceError(toolName, prefix);
        }
        return toolName.slice(expected.length);
    }
}
