/**
 * @vinkius-core/mcp-fusion-jwt — JWT Verification for MCP Servers
 *
 * Standards-compliant JWT verification with jose integration,
 * native HS256 fallback, and mcp-fusion middleware.
 *
 * @example
 * ```ts
 * import { JwtVerifier, requireJwt, createJwtAuthTool } from '@vinkius-core/mcp-fusion-jwt';
 *
 * // Middleware
 * const projects = createTool('projects')
 *     .use(requireJwt({ secret: 'my-secret' }))
 *     .action({ name: 'list', handler: async () => success([]) });
 *
 * // Standalone
 * const verifier = new JwtVerifier({ secret: 'my-secret' });
 * const payload = await verifier.verify(token);
 * ```
 *
 * @module @vinkius-core/mcp-fusion-jwt
 * @author Vinkius Labs
 * @license Apache-2.0
 */

export { JwtVerifier } from './JwtVerifier.js';
export type {
    JwtVerifierConfig,
    JwtPayload,
    JwtVerifyResult,
} from './JwtVerifier.js';

export { createJwtAuthTool } from './createJwtAuthTool.js';
export type { JwtAuthToolConfig } from './createJwtAuthTool.js';

export { requireJwt } from './middleware.js';
export type { RequireJwtOptions } from './middleware.js';
