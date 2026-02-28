/**
 * API Key Auth Middleware — requireApiKey()
 *
 * mcp-fusion middleware that ensures requests carry a valid API key.
 * Extracts the key, validates it via ApiKeyManager, and rejects
 * invalid/missing keys with self-healing error responses.
 *
 * @example
 * ```ts
 * import { requireApiKey } from '@vinkius-core/mcp-fusion-api-key';
 *
 * const projects = createTool('projects')
 *     .use(requireApiKey({ keys: ['sk_live_abc123'] }))
 *     .action({ name: 'list', handler: async (ctx) => { ... } });
 * ```
 */

import { toolError } from '@vinkius-core/mcp-fusion';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { ApiKeyManager } from './ApiKeyManager.js';
import type { ApiKeyManagerConfig } from './ApiKeyManager.js';

// ============================================================================
// Types
// ============================================================================

export interface RequireApiKeyOptions extends ApiKeyManagerConfig {
    /**
     * Custom function to extract the API key from the context.
     * Default: checks `ctx.apiKey`, `ctx.headers['x-api-key']`,
     * `ctx.headers.authorization` (ApiKey/Bearer prefix).
     */
    readonly extractKey?: (ctx: unknown) => string | null | undefined;

    /**
     * Callback invoked after successful validation.
     * Use this to inject key metadata into the context.
     */
    readonly onValidated?: (ctx: unknown, metadata?: Record<string, unknown>) => void;

    /** Error code for toolError response. Default: 'APIKEY_INVALID' */
    readonly errorCode?: string;

    /** Recovery hint for the LLM. Default: 'Provide a valid API key' */
    readonly recoveryHint?: string;

    /** Recovery action name. Default: 'auth' */
    readonly recoveryAction?: string;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Creates a mcp-fusion middleware that validates API keys.
 *
 * Returns `toolError('APIKEY_INVALID')` with self-healing hints
 * when no valid key is found.
 */
export function requireApiKey(options: RequireApiKeyOptions) {
    const manager = new ApiKeyManager(options);
    const extractKey = options.extractKey ?? defaultExtractKey;
    const errorCode = options.errorCode ?? 'APIKEY_INVALID';
    const recoveryHint = options.recoveryHint ?? 'Provide a valid API key';
    const recoveryAction = options.recoveryAction ?? 'auth';
    const onValidated = options.onValidated;

    return async (ctx: unknown, _args: Record<string, unknown>, next: () => Promise<ToolResponse>): Promise<ToolResponse> => {
        const raw = extractKey(ctx);

        if (!raw) {
            return toolError(errorCode, {
                message: 'API key authentication required',
                suggestion: recoveryHint,
                availableActions: [recoveryAction],
            });
        }

        const result = await manager.validate(raw);

        if (!result.valid) {
            return toolError(errorCode, {
                message: `API key validation failed: ${result.reason}`,
                suggestion: recoveryHint,
                availableActions: [recoveryAction],
            });
        }

        if (onValidated) {
            onValidated(ctx, result.metadata);
        }

        return next();
    };
}

// ============================================================================
// Default Key Extractor
// ============================================================================

/**
 * Default API key extractor — checks common patterns:
 * - `ctx.apiKey`
 * - `ctx.headers['x-api-key']`
 * - `ctx.headers.authorization` with `ApiKey ` or `Bearer ` prefix
 */
function defaultExtractKey(ctx: unknown): string | null {
    if (!ctx || typeof ctx !== 'object') return null;

    const obj = ctx as Record<string, unknown>;

    // Direct apiKey property
    if (typeof obj['apiKey'] === 'string' && obj['apiKey']) {
        return obj['apiKey'] as string;
    }

    // Headers
    const headers = obj['headers'] as Record<string, unknown> | undefined;
    if (headers) {
        // x-api-key header
        if (typeof headers['x-api-key'] === 'string' && headers['x-api-key']) {
            return headers['x-api-key'] as string;
        }

        // Authorization header with ApiKey or Bearer prefix
        const auth = headers['authorization'];
        if (typeof auth === 'string' && auth) {
            if (auth.startsWith('ApiKey ')) return auth.slice(7);
            if (auth.startsWith('Bearer ')) return auth.slice(7);
            return auth;
        }
    }

    return null;
}
