/**
 * @vinkius-core/oauth — OAuth 2.0 Device Authorization Grant for MCP Servers
 *
 * Implements RFC 8628 (Device Authorization Grant) with secure token persistence,
 * automatic polling, and mcp-fusion middleware integration.
 *
 * @example
 * ```ts
 * import { DeviceAuthenticator, TokenManager, requireAuth } from '@vinkius-core/oauth';
 *
 * // Standalone usage
 * const auth = new DeviceAuthenticator({ authorizationEndpoint: 'https://api.example.com/oauth/device/code' });
 * const code = await auth.requestDeviceCode({ clientId: 'my-client-id' });
 * const token = await auth.pollForToken(code);
 *
 * // Middleware integration
 * const projects = createTool('projects')
 *     .use(requireAuth())
 *     .action({ name: 'list', handler: async (ctx) => { ... } });
 * ```
 *
 * @module @vinkius-core/oauth
 * @author Vinkius Labs
 * @license Apache-2.0
 */

export { DeviceAuthenticator } from './DeviceAuthenticator.js';
export type {
    DeviceAuthenticatorConfig,
    DeviceCodeRequest,
    DeviceCodeResponse,
    TokenRequest,
    TokenResponse,
    DeviceFlowError,
} from './DeviceAuthenticator.js';

export { TokenManager } from './TokenManager.js';
export type {
    TokenManagerConfig,
    StoredToken,
    TokenSource,
} from './TokenManager.js';

export { createAuthTool } from './createAuthTool.js';
export type { AuthToolConfig, AuthContext } from './createAuthTool.js';

export { requireAuth } from './middleware.js';
export type { RequireAuthOptions } from './middleware.js';
