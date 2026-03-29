/**
 * Credentials — BYOC (Bring Your Own Credentials) System
 *
 * Provides two primitives for marketplace-publishable MCP servers:
 *
 *   defineCredentials() — declare what credentials your server needs.
 *     The Vinkius marketplace reads this at deploy/introspect time and
 *     prompts the buyer to configure credentials before activation.
 *
 *   requireCredential() — read a credential at runtime.
 *     On Vinkius Cloud Edge, secrets are injected into
 *     globalThis.__vinkius_secrets by the runtime before the first tool
 *     call. Locally (stdio/http), populate the same global or use env vars
 *     via a contextFactory.
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/** Type descriptor for a single credential field. */
export type CredentialType =
    // ── Secrets (masked in UI and logs) ──────────────────────────────────
    | 'api_key'           // API/secret keys          → Stripe, SendGrid, Upstash
    | 'token'             // OAuth / Bearer tokens    → Notion, GitHub, Slack, Trello
    | 'password'          // Passwords                → MySQL, PostgreSQL, SSH

    // ── Connection (structured or full URI) ───────────────────────────────
    | 'url'               // HTTP/HTTPS endpoint URL  → Upstash REST URL, webhooks
    | 'connection_string' // Full DB/broker URI      → mysql://user:pass@host/db

    // ── Scalars (visible, validated) ─────────────────────────────────────
    | 'string'            // Arbitrary visible text   → org ID, bucket name, region
    | 'number'            // Numeric input            → port (3306), timeout, limit
    | 'email'             // E-mail address           → Mailchimp sender, admin email
    | 'boolean'           // Toggle (on/off)          → SSL enabled, sandbox mode

    // ── Enum (fixed choices, rendered as <select>) ────────────────────────
    | 'select'            // One of allowed[]         → AWS region, environment tier

    // ── OAuth 2.0 BYOA (platform-managed token lifecycle) ────────────────
    | 'oauth2';           // OAuth token (BYOA)       → Calendly, Salesforce, Zoom


/**
 * OAuth 2.0 BYOA configuration.
 *
 * Attached to a credential field with `type: 'oauth2'`. Instructs the Vinkius
 * Cloud how to orchestrate the OAuth flow using the buyer's own Client ID +
 * Client Secret.
 *
 * Supports two grant types:
 *   - `'authorization_code'` (default): Browser redirect → consent → code → token
 *   - `'client_credentials'`: Direct server-side exchange → token (no browser)
 */
export interface OAuthConfig {
    /** Provider display name, used in "Connect with {provider}" button text. */
    readonly provider: string;

    /**
     * OAuth grant type.
     *
     * - `'authorization_code'`: Buyer is redirected to provider's consent screen.
     *   Requires `authorize_url`. Results in `access_token` + `refresh_token`.
     *
     * - `'client_credentials'`: No browser redirect. Platform exchanges
     *   `client_id` + `client_secret` directly at `token_url` for an `access_token`.
     *   No `refresh_token` — re-exchange when expired.
     *
     * @default 'authorization_code'
     */
    readonly grant_type?: 'authorization_code' | 'client_credentials';

    /**
     * Provider's OAuth authorization endpoint (browser redirect URL).
     *
     * Required for `'authorization_code'` grant type.
     * Not used for `'client_credentials'` (no browser redirect).
     *
     * @example 'https://auth.calendly.com/oauth/authorize'
     */
    readonly authorize_url?: string;

    /** Provider's OAuth token exchange endpoint. Required for all grant types. */
    readonly token_url: string;

    /**
     * Required OAuth scopes.
     * For `'client_credentials'`, may be empty if scopes are configured on the app.
     */
    readonly scopes: readonly string[];

    /**
     * Key in the same `defineCredentials()` map that holds the buyer's Client ID.
     * @example 'CALENDLY_CLIENT_ID'
     */
    readonly client_id_field: string;

    /**
     * Key in the same `defineCredentials()` map that holds the buyer's Client Secret.
     * @example 'CALENDLY_CLIENT_SECRET'
     */
    readonly client_secret_field: string;

    /**
     * Endpoint to fetch user info after token exchange.
     * Used to display "Connected as {email}" in the UI.
     * @example 'https://api.calendly.com/users/me'
     */
    readonly user_info_url?: string;

    /**
     * JSON path (dot notation) to extract email from `user_info_url` response.
     * @example 'resource.email'
     */
    readonly user_info_email_path?: string;

    /**
     * Fallback token expiration in seconds when the provider doesn't return `expires_in`.
     * @default 3600
     */
    readonly token_expires_in?: number;

    /**
     * Whether this provider returns a `refresh_token`.
     *
     * - For `'authorization_code'`: defaults to `true`
     * - For `'client_credentials'`: always `false` (re-exchange instead)
     *
     * @default true (for authorization_code)
     */
    readonly supports_refresh?: boolean;

    /**
     * Extra static parameters appended to the token request body.
     *
     * Keys ending in `_field` are resolved from the buyer's credentials at runtime.
     * Keys without `_field` are sent as literal values.
     *
     * @example
     * ```ts
     * // Zoom Server-to-Server OAuth
     * extra_params: {
     *   grant_type: 'account_credentials',
     *   account_id_field: 'ZOOM_ACCOUNT_ID',
     * }
     * ```
     */
    readonly extra_params?: Record<string, string>;
}

/** Declaration of a single marketplace credential. */
export interface CredentialDef {
    /** Human-readable label shown in the marketplace UI. */
    readonly label: string;

    /**
     * Short description of where the user can obtain this value.
     * Displayed as helper text beneath the input field.
     */
    readonly description: string;

    /**
     * Placeholder text shown inside the empty input field.
     * @example 'https://xxxx-xxxx-xxxx.upstash.io'
     */
    readonly placeholder?: string;

    /**
     * Input type — controls masking and validation in the marketplace UI.
     * @default 'string'
     */
    readonly type?: CredentialType;

    /**
     * Whether the marketplace must require this credential before activation.
     * @default true
     */
    readonly required?: boolean;

    /**
     * Whether the value is sensitive (masked in logs and inspector TUI).
     * Always `true` for `api_key` and `password` types.
     * @default false
     */
    readonly sensitive?: boolean;

    /**
     * Display group name for grouping related credentials in the UI.
     * @example 'Upstash Connection'
     */
    readonly group?: string;

    /**
     * URL to documentation for obtaining this credential.
     * @example 'https://docs.upstash.com/redis/howto/connectwithupstashdataapi'
     */
    readonly docs_url?: string;

    /**
     * Allowed values when `type` is `'select'`.
     * The marketplace renders this as a `<select>` dropdown.
     *
     * @example
     * ```ts
     * { type: 'select', allowed: ['us-east-1', 'eu-west-1', 'ap-southeast-1'] }
     * ```
     */
    readonly allowed?: readonly string[];

    /**
     * Default value pre-filled in the marketplace form.
     * For `'boolean'` use `'true'` or `'false'` (strings).
     * For `'number'` use the value as a string, e.g. `'3306'`.
     *
     * @example
     * ```ts
     * { type: 'number', default_value: '3306' }   // MySQL default port
     * { type: 'boolean', default_value: 'false' }  // SSL disabled by default
     * ```
     */
    readonly default_value?: string;

    /**
     * OAuth 2.0 BYOA configuration. Only valid when `type` is `'oauth2'`.
     *
     * Instructs the Vinkius Cloud how to orchestrate the OAuth flow using
     * the buyer's own Client ID + Client Secret. The platform handles
     * token exchange, storage, refresh — the MCP server just calls
     * `requireCredential()` and receives a valid Bearer token.
     */
    readonly oauth?: OAuthConfig;
}

/** A named map of credential declarations. Keys become the env variable names. */
export type CredentialsMap = Record<string, CredentialDef>;

// ============================================================================
// Error
// ============================================================================

/**
 * Thrown by `requireCredential()` when a required credential is missing
 * or empty at tool invocation time.
 */
export class CredentialMissingError extends Error {
    readonly credentialKey: string;

    constructor(key: string, hint?: string) {
        const hintText = hint ? ` ${hint}` : '';
        super(
            `[Vurb] Required credential "${key}" is not configured.${hintText}\n` +
            `If running locally, set globalThis.__vinkius_secrets = { "${key}": "..." } ` +
            `before starting the server, or use a contextFactory to read from process.env.`,
        );
        this.name = 'CredentialMissingError';
        this.credentialKey = key;
    }
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Declare the credentials your marketplace server requires.
 *
 * This is a typed identity function — it returns the same map you pass in,
 * providing full TypeScript inference while serving as the introspection
 * anchor read by the Vinkius platform at deploy time.
 *
 * @example
 * ```ts
 * export const credentials = defineCredentials({
 *   REDIS_URL: {
 *     label: 'Redis URL',
 *     description: 'Your Upstash Redis REST URL.',
 *     type: 'url',
 *     required: true,
 *     sensitive: false,
 *   },
 *   REDIS_TOKEN: {
 *     label: 'Redis Token',
 *     description: 'Your Upstash Redis REST Token.',
 *     type: 'api_key',
 *     required: true,
 *     sensitive: true,
 *   },
 * });
 * ```
 */
export function defineCredentials<T extends CredentialsMap>(map: T): T {
    return map;
}

/**
 * Read a credential at runtime.
 *
 * On Vinkius Cloud Edge, the runtime injects secrets into
 * `globalThis.__vinkius_secrets` before the first tool call.
 *
 * @param key   - The credential key as declared in `defineCredentials()`.
 * @param hint  - Optional hint shown in the error message (e.g., where to find the value).
 * @throws {CredentialMissingError} when the credential is absent or empty.
 *
 * @example
 * ```ts
 * function getRedis() {
 *   const url   = requireCredential('REDIS_URL', 'Found in your Upstash console.');
 *   const token = requireCredential('REDIS_TOKEN', 'Found in your Upstash console.');
 *   return new Redis({ url, token });
 * }
 * ```
 */
export function requireCredential(key: string, hint?: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secrets = (globalThis as any).__vinkius_secrets as Record<string, unknown> | undefined;
    const value = secrets?.[key];

    if (typeof value !== 'string' || value.trim() === '') {
        throw new CredentialMissingError(key, hint);
    }

    return value;
}
