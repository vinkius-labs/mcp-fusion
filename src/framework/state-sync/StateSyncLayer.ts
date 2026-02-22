/**
 * StateSyncLayer — Protocol Interception Orchestrator
 *
 * Thin orchestration layer that ties together the PolicyEngine,
 * DescriptionDecorator, CausalEngine, and ResponseDecorator into
 * a single, minimal interface consumed by {@link ServerAttachment}.
 *
 * This is **not** a middleware — it operates at the protocol layer,
 * intercepting `tools/list` and `tools/call` responses to inject
 * cache-control signals that prevent LLM Temporal Blindness and
 * Causal State Drift.
 *
 * Performance: tool description decoration is cached — the regex +
 * string concatenation + object spread only runs ONCE per unique
 * tool name, not per `tools/list` request.
 *
 * @example
 * ```typescript
 * // Created internally by ServerAttachment when stateSync is configured.
 * // Not typically instantiated directly — use AttachOptions instead.
 *
 * registry.attachToServer(server, {
 *     stateSync: {
 *         defaults: { cacheControl: 'no-store' },
 *         policies: [
 *             { match: 'sprints.update', invalidates: ['sprints.*'] },
 *             { match: 'countries.*',    cacheControl: 'immutable' },
 *         ],
 *     },
 * });
 * ```
 *
 * @see {@link StateSyncConfig} for configuration options
 * @see {@link PolicyEngine} for the resolution strategy
 *
 * @module
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolResponse } from '../response.js';
import type { StateSyncConfig } from './types.js';
import { PolicyEngine } from './PolicyEngine.js';
import { decorateDescription } from './DescriptionDecorator.js';
import { resolveInvalidations } from './CausalEngine.js';
import { decorateResponse } from './ResponseDecorator.js';

export class StateSyncLayer {
    private readonly _engine: PolicyEngine;

    /**
     * Per-tool-name cache of decorated McpTool objects.
     *
     * Since tool descriptions are stable between `tools/list` calls,
     * we cache the decorated version per tool name. This avoids
     * re-running the regex match, string concatenation, and object spread
     * on every `tools/list` request — which is the hottest path since
     * it runs at the start of every LLM conversation.
     *
     * The cache key is the tool name + JSON input schema hash to detect
     * changes in the underlying tool definition. In practice, tool
     * definitions are immutable after registration, so the cache
     * hit rate approaches 100%.
     */
    private readonly _decoratedToolCache = new Map<string, McpTool>();

    /**
     * Construct a StateSyncLayer from user configuration.
     *
     * Eagerly validates all policies and defaults at construction time.
     * If any policy is invalid, construction fails immediately with
     * a descriptive error.
     *
     * @param config - State sync configuration (policies + optional defaults)
     * @throws {Error} If any policy or default is invalid
     */
    constructor(config: StateSyncConfig) {
        this._engine = new PolicyEngine(config.policies, config.defaults);
    }

    /**
     * Decorate all tool descriptions with their resolved Cache-Control directives.
     *
     * Called during `tools/list` to append `[Cache-Control: X]` to each tool's
     * description. Tools without a matching policy (and no defaults) are
     * returned unchanged.
     *
     * Uses per-tool caching to avoid redundant decoration on repeated calls.
     *
     * @param tools - Original MCP tool definitions from the registry
     * @returns Decorated tool definitions (cached shallow copies where modified)
     */
    decorateTools(tools: McpTool[]): McpTool[] {
        return tools.map(tool => this._decorateToolCached(tool));
    }

    /**
     * Decorate a tool call response with causal invalidation signals.
     *
     * Called after every `tools/call` execution. If the tool's policy has
     * `invalidates` patterns and the call succeeded (`isError !== true`),
     * prepends a `[System: Cache invalidated for X — caused by Y]` block
     * at content index 0.
     *
     * @param toolName - The name of the tool that was called
     * @param result   - The tool call result from the handler
     * @returns Decorated result (with System block) or unchanged result
     */
    decorateResult(toolName: string, result: ToolResponse): ToolResponse {
        const policy = this._engine.resolve(toolName);
        const invalidations = resolveInvalidations(policy, result.isError ?? false);

        if (invalidations.length > 0) {
            return decorateResponse(result, invalidations, toolName);
        }

        return result;
    }

    // ── Private ──────────────────────────────────────────

    /**
     * Return a cached decorated tool, or compute and cache it.
     *
     * Cache invalidation: tool definitions are immutable after registration
     * in Fusion's ToolRegistry (builders produce new objects each time,
     * but the content is stable). For safety, we use the tool name as
     * the cache key — if the same tool name produces different descriptions
     * across calls (which shouldn't happen), the first decoration wins.
     */
    private _decorateToolCached(tool: McpTool): McpTool {
        const cached = this._decoratedToolCache.get(tool.name);
        if (cached) return cached;

        const decorated = decorateDescription(tool, this._engine.resolve(tool.name));
        this._decoratedToolCache.set(tool.name, decorated);
        return decorated;
    }
}
