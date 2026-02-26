/**
 * OAuth Vector — Device Flow Authentication templates
 * @module
 */

import type { ProjectConfig } from '../../types.js';

/** Generate `src/auth.ts` — OAuth Device Flow setup */
export function oauthSetupTs(config: ProjectConfig): string {
    return `/**
 * OAuth Setup — Device Flow Authentication (RFC 8628)
 *
 * Pre-configured \`createAuthTool()\` with login, complete, status, logout actions.
 * The \`requireAuth()\` middleware protects any tool with one line.
 *
 * 1. Set CLIENT_ID and AUTH endpoints in .env
 * 2. Register the auth tool in server.ts
 * 3. Use \`requireAuth()\` on protected tools
 */
import { createAuthTool, TokenManager } from '@vinkius-core/mcp-fusion-oauth';
import type { ToolRegistry } from '@vinkius-core/mcp-fusion';

export function registerAuth<TContext>(registry: ToolRegistry<TContext>): void {
    const clientId = process.env['OAUTH_CLIENT_ID'];
    const authEndpoint = process.env['OAUTH_AUTH_ENDPOINT'];
    const tokenEndpoint = process.env['OAUTH_TOKEN_ENDPOINT'];

    if (!clientId || !authEndpoint || !tokenEndpoint) {
        console.error('⚠️  OAUTH_CLIENT_ID, OAUTH_AUTH_ENDPOINT, OAUTH_TOKEN_ENDPOINT are required in .env');
        return;
    }

    const auth = createAuthTool({
        clientId,
        authorizationEndpoint: authEndpoint,
        tokenEndpoint,
        tokenManager: {
            configDir: '.${config.name}',
            envVar: '${config.name.toUpperCase().replace(/-/g, '_')}_TOKEN',
        },
    });

    registry.register(auth);
    console.error('🔐 OAuth Device Flow registered (auth.login → auth.complete → auth.status)');
}
`;
}

/** Generate `src/middleware/auth.ts` — requireAuth middleware */
export function oauthMiddlewareTs(): string {
    return `/**
 * Auth Middleware — Protect tools with requireAuth()
 *
 * @example
 * \`\`\`ts
 * import { withAuth } from '../middleware/auth.js';
 *
 * export default f.tool({
 *     name: 'projects.list',
 *     middleware: [withAuth],
 *     handler: async ({ ctx }) => { /* authenticated */ },
 * });
 * \`\`\`
 */
import { requireAuth } from '@vinkius-core/mcp-fusion-oauth';

/**
 * Pre-configured auth middleware.
 * Rejects unauthenticated requests with \`AUTH_REQUIRED\` + self-healing hints.
 */
export const withAuth = requireAuth({
    extractToken: (ctx: unknown) => {
        const obj = ctx as Record<string, unknown>;
        return typeof obj['token'] === 'string' ? obj['token'] : null;
    },
    recoveryHint: 'Call auth action=login to authenticate via browser',
    recoveryAction: 'auth',
});
`;
}
