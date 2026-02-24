/**
 * Auth Tool Factory — Pre-built Device Flow Authentication Tool
 *
 * Creates a complete mcp-fusion tool with login, complete, status, and logout actions.
 * Consumers only need to provide their client_id and endpoint URLs.
 *
 * @example
 * ```ts
 * import { createAuthTool } from '@vinkius-core/oauth';
 *
 * const authTool = createAuthTool({
 *     clientId: '9e8d7c6b-5a4f-3e2d-1c0b-a9b8c7d6e5f4',
 *     authorizationEndpoint: 'https://api.example.com/oauth/device/code',
 *     tokenEndpoint: 'https://api.example.com/oauth/device/token',
 *     tokenManager: { configDir: '.myapp', envVar: 'MY_APP_TOKEN' },
 *     onAuthenticated: async (token, ctx) => { ctx.setToken(token); },
 *     getUser: async (ctx) => ({ name: 'John', email: 'john@example.com' }),
 * });
 *
 * registry.register(authTool);
 * ```
 */

import { createTool, success, error as fusionError, type ToolResponse } from '@vinkius-core/mcp-fusion';
import { DeviceAuthenticator } from './DeviceAuthenticator.js';
import type { DeviceCodeResponse, TokenResponse } from './DeviceAuthenticator.js';
import { TokenManager } from './TokenManager.js';
import type { TokenManagerConfig } from './TokenManager.js';

// ============================================================================
// Types
// ============================================================================

export interface AuthToolConfig<TContext = unknown> {
    /** OAuth 2.0 client_id for device flow */
    readonly clientId: string;

    /** Device code request endpoint */
    readonly authorizationEndpoint: string;

    /** Token polling endpoint */
    readonly tokenEndpoint: string;

    /** Custom headers for auth requests */
    readonly headers?: Readonly<Record<string, string>>;

    /** TokenManager configuration */
    readonly tokenManager?: TokenManagerConfig;

    /**
     * Called after successful authentication.
     * Use this to set the token on your API client context.
     */
    readonly onAuthenticated?: (token: string, ctx: TContext) => void | Promise<void>;

    /**
     * Called on logout.
     * Use this to call your API's logout endpoint.
     */
    readonly onLogout?: (ctx: TContext) => void | Promise<void>;

    /**
     * Fetch current user info for status display.
     * Return null if not available.
     */
    readonly getUser?: (ctx: TContext) => Promise<{ name: string; email: string; username?: string } | null>;

    /** Tool name. Default: 'auth' */
    readonly toolName?: string;

    /** Tool description. Default: 'Authentication. Login via browser, check status, logout' */
    readonly description?: string;

    /** Tool tags. Default: ['authentication'] */
    readonly tags?: string[];
}

export interface AuthContext {
    readonly isAuthenticated: boolean;
    readonly tokenSource: 'environment' | 'file' | null;
    readonly user?: { name: string; email: string; username?: string };
}

// ============================================================================
// Response Helpers
// ============================================================================

function ok(data: Record<string, unknown>): ToolResponse {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(data: Record<string, unknown>): ToolResponse {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], isError: true };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a complete authentication tool with Device Flow support.
 *
 * Actions:
 * - `login` — Start browser login, returns verification URL
 * - `complete` — Complete login after browser authorization
 * - `status` — Check authentication status
 * - `logout` — Logout and clear token
 */
export function createAuthTool<TContext>(config: AuthToolConfig<TContext>) {
    const tokenManager = new TokenManager(config.tokenManager);
    const authenticator = new DeviceAuthenticator({
        authorizationEndpoint: config.authorizationEndpoint,
        tokenEndpoint: config.tokenEndpoint,
        ...(config.headers ? { headers: config.headers } : {}),
    });

    return createTool<TContext>(config.toolName ?? 'auth')
        .description(config.description ?? 'Authentication. Login via browser, check status, logout')
        .toonDescription()
        .tags(...(config.tags ?? ['authentication']))
        .annotations({ title: 'Authentication', openWorldHint: true })
        .action({
            name: 'login',
            description: 'Start browser login. Returns URL + code',
            idempotent: true,
            handler: async () => {
                try {
                    const deviceInfo: DeviceCodeResponse = await authenticator.requestDeviceCode({
                        clientId: config.clientId,
                    });
                    tokenManager.savePendingDeviceCode(deviceInfo.device_code, deviceInfo.expires_in);
                    return ok({
                        status: 'pending',
                        verification_url: deviceInfo.verification_uri_complete,
                        expires_in_minutes: Math.round(deviceInfo.expires_in / 60),
                        instructions: [
                            'Open the verification URL in your browser',
                            'Sign in with your account',
                            'Click Authorize',
                            'After authorizing, call auth action=complete',
                        ],
                    });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    let error_type = 'unknown';
                    if (msg.includes('401') || msg.includes('Unauthorized')) error_type = 'unauthorized';
                    else if (msg.includes('Unable to connect') || msg.includes('ECONNREFUSED') || msg.includes('Network')) error_type = 'network';
                    else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) error_type = 'timeout';
                    return fail({ error: error_type, message: msg });
                }
            },
        })
        .action({
            name: 'complete',
            description: 'Complete login after browser auth',
            idempotent: true,
            handler: async (ctx, args) => {
                let deviceCode = args['device_code'] as string | undefined;
                if (!deviceCode) deviceCode = tokenManager.getPendingDeviceCode() ?? undefined;
                if (!deviceCode) {
                    return fail({ error: 'no_pending_auth', message: 'No pending authorization. Run auth action=login first.' });
                }

                try {
                    const result = await authenticator.attemptTokenExchange({ deviceCode });

                    if ('error' in result) {
                        const err = result as { error: string; error_description?: string };
                        if (err.error === 'authorization_pending') {
                            return ok({ status: 'authorization_pending', message: 'User has not yet authorized. Complete authorization in browser, then retry.' });
                        }
                        return fail({ error: err.error, message: err.error_description ?? err.error });
                    }

                    const tokenResponse = result as TokenResponse;
                    tokenManager.clearPendingDeviceCode();
                    tokenManager.saveToken(tokenResponse.access_token);

                    if (config.onAuthenticated) {
                        await config.onAuthenticated(tokenResponse.access_token, ctx);
                    }

                    if (config.getUser) {
                        try {
                            const user = await config.getUser(ctx);
                            if (user) return ok({ status: 'authenticated', user });
                        } catch {
                            // User fetch failed, but auth succeeded
                        }
                    }

                    return ok({ status: 'authenticated' });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('expired')) return fail({ error: 'expired', message: 'Authorization code expired. Run auth action=login for a new code.' });
                    if (msg.includes('denied') || msg.includes('access_denied')) return fail({ error: 'access_denied', message: 'Authorization denied. Run auth action=login to try again.' });
                    return fail({ error: 'auth_failed', message: msg });
                }
            },
        })
        .action({
            name: 'status',
            description: 'Check auth status',
            readOnly: true,
            idempotent: true,
            handler: async (ctx) => {
                const token = tokenManager.getToken();
                const source = tokenManager.getTokenSource();

                if (!token) {
                    return ok({
                        authenticated: false,
                        options: [
                            'Run auth action=login to authenticate via browser',
                            `Set ${config.tokenManager?.envVar ?? 'token'} environment variable`,
                        ],
                    });
                }

                if (config.getUser) {
                    try {
                        const user = await config.getUser(ctx);
                        if (user) return ok({ authenticated: true, user, token_source: source });
                    } catch {
                        return fail({ authenticated: false, error: 'token_invalid', message: 'Token expired or invalid. Run auth action=login to reconnect.' });
                    }
                }

                return ok({ authenticated: true, token_source: source });
            },
        })
        .action({
            name: 'logout',
            description: 'Logout and clear token',
            destructive: true,
            idempotent: true,
            handler: async (ctx) => {
                if (config.onLogout) {
                    try { await config.onLogout(ctx); } catch { /* ignore */ }
                }
                tokenManager.clearToken();
                return ok({ status: 'logged_out' });
            },
        });
}
