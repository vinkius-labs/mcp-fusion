/**
 * Device Authorization Flow — RFC 8628
 *
 * Portable OAuth 2.0 Device Authorization Grant implementation.
 * Framework-agnostic: works with any OAuth 2.0 provider that supports device flow.
 *
 * @example
 * ```ts
 * const auth = new DeviceAuthenticator({
 *     authorizationEndpoint: 'https://api.example.com/oauth/device/code',
 *     tokenEndpoint: 'https://api.example.com/oauth/device/token',
 * });
 *
 * const code = await auth.requestDeviceCode({ clientId: 'my-client-id' });
 * console.log(`Open: ${code.verification_uri_complete}`);
 *
 * const token = await auth.pollForToken(code);
 * console.log(`Authenticated: ${token.access_token}`);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface DeviceAuthenticatorConfig {
    /** Device code request endpoint */
    readonly authorizationEndpoint: string;
    /** Token polling endpoint */
    readonly tokenEndpoint: string;
    /** Custom headers sent with every request */
    readonly headers?: Readonly<Record<string, string>>;
    /** Custom fetch implementation (for testing or proxied environments) */
    readonly fetch?: typeof globalThis.fetch;
}

export interface DeviceCodeRequest {
    /** OAuth 2.0 client_id */
    readonly clientId: string;
    /** OAuth 2.0 scope (space-separated) */
    readonly scope?: string;
}

export interface DeviceCodeResponse {
    readonly device_code: string;
    readonly user_code: string;
    readonly verification_uri: string;
    readonly verification_uri_complete: string;
    readonly expires_in: number;
    readonly interval: number;
}

export interface TokenRequest {
    readonly deviceCode: string;
    readonly grantType?: string;
}

export interface TokenResponse {
    readonly access_token: string;
    readonly token_type: string;
    readonly expires_in: number;
    readonly scope?: string;
    readonly refresh_token?: string;
}

export interface DeviceFlowError {
    readonly error: string;
    readonly error_description?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const PENDING_ERRORS = new Set(['authorization_pending', 'slow_down']);

// ============================================================================
// DeviceAuthenticator
// ============================================================================

/**
 * Implements RFC 8628 Device Authorization Grant.
 *
 * Two-phase flow:
 * 1. `requestDeviceCode()` — get device_code + verification URL
 * 2. `pollForToken()` — poll until user authorizes (or timeout/error)
 *
 * Stateless: each method call is independent.
 * Portable: works with any provider (GitScrum, GitHub, Google, etc.)
 */
export class DeviceAuthenticator {
    private readonly config: DeviceAuthenticatorConfig;
    private readonly _fetch: typeof globalThis.fetch;

    constructor(config: DeviceAuthenticatorConfig) {
        this.config = config;
        this._fetch = config.fetch ?? globalThis.fetch;
    }

    /**
     * Phase 1: Request a device code from the authorization server.
     *
     * @throws {Error} Network or server error
     */
    async requestDeviceCode(request: DeviceCodeRequest): Promise<DeviceCodeResponse> {
        const response = await this._fetch(this.config.authorizationEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...this.config.headers,
            },
            body: JSON.stringify({
                client_id: request.clientId,
                ...(request.scope ? { scope: request.scope } : {}),
            }),
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({})) as DeviceFlowError;
            throw new Error(
                body.error_description ?? `Device code request failed: ${response.status} ${response.statusText}`,
            );
        }

        return response.json() as Promise<DeviceCodeResponse>;
    }

    /**
     * Phase 2: Poll for the access token.
     *
     * Automatically respects the `interval` from the device code response.
     * Polls until success, terminal error, or expiration.
     *
     * @param codeResponse - Response from `requestDeviceCode()`
     * @param signal - Optional AbortSignal for cancellation
     * @returns Token response on success
     * @throws {Error} Terminal error (expired, access_denied, etc.)
     */
    async pollForToken(
        codeResponse: DeviceCodeResponse,
        signal?: AbortSignal,
    ): Promise<TokenResponse> {
        const expiresAt = Date.now() + (codeResponse.expires_in * 1000);
        let interval = (codeResponse.interval || 5) * 1000;

        while (Date.now() < expiresAt) {
            signal?.throwIfAborted();

            await sleep(interval, signal);

            const result = await this.attemptTokenExchange({
                deviceCode: codeResponse.device_code,
            });

            if ('access_token' in result) {
                return result as TokenResponse;
            }

            const err = result as DeviceFlowError;

            if (err.error === 'slow_down') {
                interval += 5000; // RFC 8628 §3.5: increase by 5 seconds
                continue;
            }

            if (err.error === 'authorization_pending') {
                continue;
            }

            // Terminal error
            throw new Error(err.error_description ?? err.error);
        }

        throw new Error('Device authorization expired. Start a new flow.');
    }

    /**
     * Single token exchange attempt. Returns TokenResponse or DeviceFlowError.
     *
     * Useful when you want to control polling externally instead of using `pollForToken()`.
     */
    async attemptTokenExchange(
        request: TokenRequest,
    ): Promise<TokenResponse | DeviceFlowError> {
        const response = await this._fetch(this.config.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...this.config.headers,
            },
            body: JSON.stringify({
                device_code: request.deviceCode,
                grant_type: request.grantType ?? DEFAULT_GRANT_TYPE,
            }),
        });

        if (response.ok) {
            return response.json() as Promise<TokenResponse>;
        }

        const body = await response.json().catch(() => ({
            error: 'unknown_error',
            error_description: `Token exchange failed: ${response.status}`,
        })) as DeviceFlowError;

        // Return pending/slow_down as non-throwing responses
        if (PENDING_ERRORS.has(body.error)) {
            return body;
        }

        // Return terminal errors as non-throwing too (let caller decide)
        return body;
    }
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}
