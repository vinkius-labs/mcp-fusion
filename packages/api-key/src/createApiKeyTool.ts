/**
 * API Key Auth Tool Factory — Pre-built API Key Validation Tool
 *
 * Creates a complete mcp-fusion tool with validate and status actions.
 *
 * @example
 * ```ts
 * import { createApiKeyTool } from '@vinkius-core/mcp-fusion-api-key';
 *
 * const apiKeyTool = createApiKeyTool({
 *     keys: ['sk_live_abc123'],
 * });
 * ```
 */

import { createTool, success, toolError } from '@vinkius-core/mcp-fusion';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { ApiKeyManager } from './ApiKeyManager.js';
import type { ApiKeyManagerConfig } from './ApiKeyManager.js';

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyToolConfig<TContext = unknown> extends ApiKeyManagerConfig {
    /** Tool name in MCP. Default: 'api_key_auth' */
    readonly toolName?: string;

    /** Tool description for the LLM. */
    readonly description?: string;

    /** Tags for selective tool exposure. */
    readonly tags?: string[];

    /** Extract API key from context for the `status` action. */
    readonly extractKey?: (ctx: TContext) => string | null | undefined;
}

// ============================================================================
// Response Helpers
// ============================================================================

function ok(data: Record<string, unknown>): ToolResponse {
    return success(data);
}

function fail(data: Record<string, unknown>): ToolResponse {
    return toolError('APIKEY_ERROR', data);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a complete API key auth tool with validate and status actions.
 *
 * Actions:
 * - `validate` — Validate an API key and return metadata
 * - `status` — Check if API key is present/valid
 */
export function createApiKeyTool<TContext = unknown>(config: ApiKeyToolConfig<TContext>) {
    const manager = new ApiKeyManager(config);
    const toolName = config.toolName ?? 'api_key_auth';
    const description = config.description ?? 'API key authentication — validate keys and check status';
    const extractKey = config.extractKey;

    const tool = createTool<TContext>(toolName);

    if (config.tags?.length) {
        tool.tags(...config.tags);
    }

    return tool
        .action({
            name: 'validate',
            description: 'Validate an API key',
            schema: {
                key: {
                    type: 'string' as const,
                    description: 'API key to validate',
                    required: true as const,
                },
            },
            handler: async (_ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> => {
                const key = args['key'] as string | undefined;
                if (!key) {
                    return fail({ message: 'API key is required' });
                }

                const result = await manager.validate(key);

                if (!result.valid) {
                    return fail({
                        message: `Validation failed: ${result.reason}`,
                        valid: false,
                    });
                }

                return ok({
                    valid: true,
                    metadata: result.metadata,
                });
            },
        })
        .action({
            name: 'status',
            description: 'Check API key authentication status from context',
            handler: async (ctx: TContext): Promise<ToolResponse> => {
                if (!extractKey) {
                    return ok({
                        available: false,
                        reason: 'No key extractor configured',
                    });
                }

                const key = extractKey(ctx);
                if (!key) {
                    return ok({
                        authenticated: false,
                        reason: 'No API key found in context',
                    });
                }

                const result = await manager.validate(key);

                return ok({
                    authenticated: result.valid,
                    valid: result.valid,
                    reason: result.reason,
                    metadata: result.metadata,
                });
            },
        });
}
