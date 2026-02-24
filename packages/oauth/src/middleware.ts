/**
 * Auth Middleware — requireAuth()
 *
 * mcp-fusion middleware that ensures requests are authenticated
 * by checking the context for a valid token via TokenManager.
 *
 * @example
 * ```ts
 * import { requireAuth } from '@vinkius-core/oauth';
 * import { createTool } from '@vinkius-core/mcp-fusion';
 *
 * const projects = createTool<AppContext>('projects')
 *     .use(requireAuth())
 *     .action({ name: 'list', handler: async (ctx) => { ... } });
 * ```
 */

import { toolError } from '@vinkius-core/mcp-fusion';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';

// ============================================================================
// Types
// ============================================================================

export interface RequireAuthOptions {
    /**
     * Function that extracts the auth token from the context.
     * Should return the token string or null/undefined if not authenticated.
     */
    readonly extractToken: (ctx: unknown) => string | null | undefined;

    /**
     * Error code used in toolError response. Default: 'AUTH_REQUIRED'
     */
    readonly errorCode?: string;

    /**
     * Recovery hint for the LLM. Default: 'Use auth action=login to authenticate'
     */
    readonly recoveryHint?: string;

    /**
     * Recovery action name. Default: 'auth'
     */
    readonly recoveryAction?: string;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Creates a mcp-fusion middleware that rejects unauthenticated requests.
 *
 * Returns a `toolError('AUTH_REQUIRED')` with self-healing hints
 * when no valid token is found.
 */
export function requireAuth(options?: RequireAuthOptions) {
    const extractToken = options?.extractToken ?? defaultExtractToken;
    const errorCode = options?.errorCode ?? 'AUTH_REQUIRED';
    const recoveryHint = options?.recoveryHint ?? 'Use auth action=login to authenticate';
    const recoveryAction = options?.recoveryAction ?? 'auth';

    return async (ctx: unknown, args: Record<string, unknown>, next: () => Promise<ToolResponse>): Promise<ToolResponse> => {
        const token = extractToken(ctx);

        if (!token) {
            return toolError(errorCode, {
                message: 'Authentication required',
                suggestion: recoveryHint,
                availableActions: [recoveryAction],
            });
        }

        return next();
    };
}

// ============================================================================
// Default Extractor
// ============================================================================

/**
 * Default token extractor — checks common patterns:
 * - `ctx.token`
 * - `ctx.isAuthenticated()` (method)
 * - `ctx.getToken()` (method)
 */
function defaultExtractToken(ctx: unknown): string | null {
    if (!ctx || typeof ctx !== 'object') return null;

    const obj = ctx as Record<string, unknown>;

    // Direct token property
    if (typeof obj['token'] === 'string' && obj['token']) {
        return obj['token'] as string;
    }

    // isAuthenticated() method
    if (typeof obj['isAuthenticated'] === 'function') {
        return (obj['isAuthenticated'] as () => boolean)() ? 'authenticated' : null;
    }

    // getToken() method
    if (typeof obj['getToken'] === 'function') {
        const token = (obj['getToken'] as () => string | null)();
        return typeof token === 'string' ? token : null;
    }

    return null;
}
