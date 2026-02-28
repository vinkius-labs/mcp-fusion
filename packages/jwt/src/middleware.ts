/**
 * JWT Auth Middleware — requireJwt()
 *
 * mcp-fusion middleware that ensures requests carry a valid JWT.
 * Extracts the token, verifies it via JwtVerifier, and rejects
 * invalid/expired/missing tokens with self-healing error responses.
 *
 * @example
 * ```ts
 * import { requireJwt } from '@vinkius-core/mcp-fusion-jwt';
 *
 * const projects = createTool('projects')
 *     .use(requireJwt({ secret: process.env.JWT_SECRET! }))
 *     .action({ name: 'list', handler: async (ctx) => { ... } });
 * ```
 */

import { toolError } from '@vinkius-core/mcp-fusion';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { JwtVerifier } from './JwtVerifier.js';
import type { JwtVerifierConfig, JwtPayload } from './JwtVerifier.js';

// ============================================================================
// Types
// ============================================================================

export interface RequireJwtOptions extends JwtVerifierConfig {
    /**
     * Custom function to extract the JWT from the context.
     * Default: checks `ctx.token`, `ctx.jwt`, `ctx.headers.authorization` (Bearer).
     */
    readonly extractToken?: (ctx: unknown) => string | null | undefined;

    /**
     * Callback invoked after successful verification.
     * Use this to inject the decoded payload into the context.
     *
     * @example
     * ```ts
     * requireJwt({
     *     secret: 'my-secret',
     *     onVerified: (ctx, payload) => {
     *         (ctx as any).userId = payload.sub;
     *     },
     * });
     * ```
     */
    readonly onVerified?: (ctx: unknown, payload: JwtPayload) => void;

    /** Error code for toolError response. Default: 'JWT_INVALID' */
    readonly errorCode?: string;

    /** Recovery hint for the LLM. Default: 'Provide a valid JWT in the authorization context' */
    readonly recoveryHint?: string;

    /** Recovery action name. Default: 'auth' */
    readonly recoveryAction?: string;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Creates a mcp-fusion middleware that verifies JWTs.
 *
 * Returns `toolError('JWT_INVALID')` with self-healing hints
 * when no valid JWT is found.
 */
export function requireJwt(options: RequireJwtOptions) {
    const verifier = new JwtVerifier(options);
    const extractToken = options.extractToken ?? defaultExtractToken;
    const errorCode = options.errorCode ?? 'JWT_INVALID';
    const recoveryHint = options.recoveryHint ?? 'Provide a valid JWT in the authorization context';
    const recoveryAction = options.recoveryAction ?? 'auth';
    const onVerified = options.onVerified;

    return async (ctx: unknown, _args: Record<string, unknown>, next: () => Promise<ToolResponse>): Promise<ToolResponse> => {
        const raw = extractToken(ctx);

        if (!raw) {
            return toolError(errorCode, {
                message: 'JWT authentication required',
                suggestion: recoveryHint,
                availableActions: [recoveryAction],
            });
        }

        // Strip "Bearer " prefix if present
        const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;

        const result = await verifier.verifyDetailed(token);

        if (!result.valid) {
            return toolError(errorCode, {
                message: `JWT verification failed: ${result.reason}`,
                suggestion: recoveryHint,
                availableActions: [recoveryAction],
            });
        }

        if (onVerified && result.payload) {
            onVerified(ctx, result.payload);
        }

        return next();
    };
}

// ============================================================================
// Default Token Extractor
// ============================================================================

/**
 * Default JWT extractor — checks common patterns:
 * - `ctx.token`
 * - `ctx.jwt`
 * - `ctx.headers.authorization` (Bearer prefix)
 */
function defaultExtractToken(ctx: unknown): string | null {
    if (!ctx || typeof ctx !== 'object') return null;

    const obj = ctx as Record<string, unknown>;

    // Direct token property
    if (typeof obj['token'] === 'string' && obj['token']) {
        return obj['token'] as string;
    }

    // JWT property
    if (typeof obj['jwt'] === 'string' && obj['jwt']) {
        return obj['jwt'] as string;
    }

    // Authorization header
    const headers = obj['headers'] as Record<string, unknown> | undefined;
    if (headers) {
        const auth = headers['authorization'];
        if (typeof auth === 'string' && auth) {
            return auth;
        }
    }

    return null;
}
