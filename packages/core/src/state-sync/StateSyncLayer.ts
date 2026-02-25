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
import type { ToolResponse } from '../core/response.js';
import type { StateSyncConfig, InvalidationEvent, ResourceNotification } from './types.js';
import { PolicyEngine } from './PolicyEngine.js';
import { decorateDescription } from './DescriptionDecorator.js';
import { resolveInvalidations } from './CausalEngine.js';
import { decorateResponse } from './ResponseDecorator.js';

export class StateSyncLayer {
    private readonly _engine: PolicyEngine;
    private readonly _onInvalidation?: (event: InvalidationEvent) => void;
    private readonly _notificationSink?: (notification: ResourceNotification) => void | Promise<void>;

    /**
     * Per-tool-name cache of decorated McpTool objects.
     *
     * Since tool descriptions are stable between `tools/list` calls,
     * we cache the decorated version per tool name. This avoids
     * re-running the regex match, string concatenation, and object spread
     * on every `tools/list` request — which is the hottest path since
     * it runs at the start of every LLM conversation.
     *
     * The cache key is the tool name — tool definitions are immutable
     * after registration, so the name alone is sufficient.
     * Cache hit rate approaches 100%.
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
        this._onInvalidation = config.onInvalidation;
        this._notificationSink = config.notificationSink;
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
            // Fire observability hook (sync, fire-and-forget)
            if (this._onInvalidation) {
                const event: InvalidationEvent = {
                    causedBy: toolName,
                    patterns: invalidations,
                    timestamp: new Date().toISOString(),
                };
                try { this._onInvalidation(event); } catch { /* observer must not break the pipeline */ }
            }

            // Emit protocol-level notifications (fire-and-forget, safe for async sinks)
            if (this._notificationSink) {
                for (const pattern of invalidations) {
                    const notification: ResourceNotification = {
                        method: 'notifications/resources/updated',
                        params: { uri: `fusion://stale/${pattern}` },
                    };
                    try {
                        const maybePromise = this._notificationSink(notification);
                        if (maybePromise instanceof Promise) {
                            maybePromise.catch(() => { /* swallow async errors — best-effort */ });
                        }
                    } catch { /* swallow sync errors — best-effort */ }
                }
            }

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
