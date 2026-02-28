/**
 * JWT Auth Tool Factory — Pre-built JWT Verification Tool
 *
 * Creates a complete mcp-fusion tool with verify and status actions.
 * Consumers only need to provide their JWT verification config.
 *
 * @example
 * ```ts
 * import { createJwtAuthTool } from '@vinkius-core/mcp-fusion-jwt';
 *
 * const jwtTool = createJwtAuthTool({
 *     secret: process.env.JWT_SECRET!,
 *     toolName: 'jwt_auth',
 * });
 * ```
 */

import { createTool, success, toolError } from '@vinkius-core/mcp-fusion';
import type { ToolResponse } from '@vinkius-core/mcp-fusion';
import { JwtVerifier } from './JwtVerifier.js';
import type { JwtVerifierConfig, JwtPayload } from './JwtVerifier.js';

// ============================================================================
// Types
// ============================================================================

export interface JwtAuthToolConfig<TContext = unknown> extends JwtVerifierConfig {
    /** Tool name in MCP. Default: 'jwt_auth' */
    readonly toolName?: string;

    /** Tool description for the LLM. */
    readonly description?: string;

    /** Tags for selective tool exposure. */
    readonly tags?: string[];

    /**
     * Extracts the JWT from the context.
     * Required for the `status` action.
     */
    readonly extractToken?: (ctx: TContext) => string | null | undefined;
}

// ============================================================================
// Response Helpers
// ============================================================================

function ok(data: Record<string, unknown>): ToolResponse {
    return success(data);
}

function fail(data: Record<string, unknown>): ToolResponse {
    return toolError('JWT_ERROR', data);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a complete JWT auth tool with verify and status actions.
 *
 * Actions:
 * - `verify` — Verify a JWT and return decoded claims
 * - `status` — Check if JWT is present/valid/expired
 */
export function createJwtAuthTool<TContext = unknown>(config: JwtAuthToolConfig<TContext>) {
    const verifier = new JwtVerifier(config);
    const toolName = config.toolName ?? 'jwt_auth';
    const description = config.description ?? 'JWT authentication — verify tokens and check status';
    const extractToken = config.extractToken;

    const tool = createTool<TContext>(toolName);

    if (config.tags?.length) {
        tool.tags(...config.tags);
    }

    return tool
        .action({
            name: 'verify',
            description: 'Verify a JWT and return decoded claims',
            schema: {
                token: {
                    type: 'string' as const,
                    description: 'JWT to verify',
                    required: true as const,
                },
            },
            handler: async (_ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> => {
                const token = args['token'] as string | undefined;
                if (!token) {
                    return fail({ message: 'Token is required' });
                }

                const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token;
                const result = await verifier.verifyDetailed(rawToken);

                if (!result.valid) {
                    return fail({
                        message: `Verification failed: ${result.reason}`,
                        valid: false,
                    });
                }

                return ok({
                    valid: true,
                    payload: result.payload as Record<string, unknown>,
                    claims: {
                        sub: result.payload?.sub,
                        iss: result.payload?.iss,
                        aud: result.payload?.aud,
                        exp: result.payload?.exp,
                        iat: result.payload?.iat,
                    },
                });
            },
        })
        .action({
            name: 'status',
            description: 'Check JWT authentication status from context',
            handler: async (ctx: TContext): Promise<ToolResponse> => {
                if (!extractToken) {
                    return ok({
                        available: false,
                        reason: 'No token extractor configured',
                    });
                }

                const raw = extractToken(ctx);
                if (!raw) {
                    return ok({
                        authenticated: false,
                        reason: 'No JWT found in context',
                    });
                }

                const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;

                // Decode without verification for status info
                const decoded = JwtVerifier.decode(token as string);
                const isExpired = JwtVerifier.isExpired(token as string, config.clockTolerance);

                // Full verification
                const result = await verifier.verifyDetailed(token as string);

                return ok({
                    authenticated: result.valid,
                    expired: isExpired,
                    valid: result.valid,
                    reason: result.reason,
                    claims: decoded ? {
                        sub: decoded.sub,
                        iss: decoded.iss,
                        exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : undefined,
                        iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : undefined,
                    } : undefined,
                });
            },
        });
}
