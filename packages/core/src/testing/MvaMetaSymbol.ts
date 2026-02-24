/**
 * MVA Meta Symbol — In-Memory Backdoor for the Testing Package
 *
 * A global Symbol attached to every `ToolResponse` produced by
 * `ResponseBuilder.build()`. Carries the structured MVA layers
 * (data, systemRules, uiBlocks) as live JS objects.
 *
 * **Invisible to the MCP protocol**: `Symbol` keys are ignored by
 * `JSON.stringify`, so the transport layer never sees this property.
 * But the FusionTester reads it in RAM for zero-regex assertion.
 *
 * @example
 * ```typescript
 * import { MVA_META_SYMBOL, type MvaMeta } from '@vinkius-core/mcp-fusion';
 *
 * const response = await registry.routeCall(ctx, 'users', { action: 'list' });
 * const meta = (response as any)[MVA_META_SYMBOL] as MvaMeta | undefined;
 * if (meta) {
 *     console.log(meta.data);        // Validated object (post-Zod)
 *     console.log(meta.systemRules); // ['Rule 1', 'Rule 2']
 *     console.log(meta.uiBlocks);    // [{ type: 'echarts', content: '...' }]
 * }
 * ```
 *
 * @module
 */

/**
 * Global Symbol for attaching MVA metadata to ToolResponse objects.
 *
 * Uses `Symbol.for()` to ensure cross-package identity — the testing
 * package references the same Symbol without importing the core.
 */
export const MVA_META_SYMBOL = Symbol.for('mcp-fusion.mva-meta');

/**
 * Structured MVA metadata attached to ToolResponse via Symbol.
 */
export interface MvaMeta {
    /** Validated data after Egress Firewall (Presenter Zod schema) */
    readonly data: unknown;
    /** JIT system rules from Presenter */
    readonly systemRules: readonly string[];
    /** SSR UI blocks (echarts, markdown, summary) */
    readonly uiBlocks: readonly unknown[];
}
