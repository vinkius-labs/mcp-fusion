/**
 * JWT Verifier — Standards-Compliant Token Verification
 *
 * Verifies JWTs using `jose` when installed, or falls back to
 * native `crypto.subtle` (Web Crypto API) for HS256 verification.
 *
 * Supports:
 * - HS256, RS256, ES256 (via jose)
 * - HS256 native fallback (via crypto.subtle)
 * - JWKS endpoint auto-discovery
 * - Claims validation: `exp`, `nbf`, `iss`, `aud`
 *
 * @example
 * ```ts
 * import { JwtVerifier } from '@vinkius-core/mcp-fusion-jwt';
 *
 * // With symmetric secret (HS256)
 * const verifier = new JwtVerifier({ secret: 'my-secret' });
 *
 * // With JWKS endpoint (RS256, ES256)
 * const verifier = new JwtVerifier({ jwksUri: 'https://auth.example.com/.well-known/jwks.json' });
 *
 * const payload = await verifier.verify(token);
 * if (payload) console.log(payload.sub); // user ID
 * ```
 */

import * as crypto from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

export interface JwtVerifierConfig {
    /** Symmetric secret for HS256. */
    readonly secret?: string;

    /** JWKS endpoint URL for RS256/ES256 key fetching. Requires `jose`. */
    readonly jwksUri?: string;

    /** PEM-encoded public key for RS256/ES256. */
    readonly publicKey?: string;

    /** Expected issuer (`iss` claim). */
    readonly issuer?: string | string[];

    /** Expected audience (`aud` claim). */
    readonly audience?: string | string[];

    /** Clock tolerance in seconds for `exp`/`nbf` checks. Default: 60 */
    readonly clockTolerance?: number;

    /** Required claims that must be present in the payload. */
    readonly requiredClaims?: string[];
}

export interface JwtPayload {
    /** Subject — typically the user ID */
    readonly sub?: string;
    /** Issuer */
    readonly iss?: string;
    /** Audience */
    readonly aud?: string | string[];
    /** Expiration time (Unix seconds) */
    readonly exp?: number;
    /** Not before (Unix seconds) */
    readonly nbf?: number;
    /** Issued at (Unix seconds) */
    readonly iat?: number;
    /** JWT ID */
    readonly jti?: string;
    /** Additional claims */
    readonly [key: string]: unknown;
}

export interface JwtVerifyResult {
    /** Whether the token is valid */
    readonly valid: boolean;
    /** Decoded payload (only present if valid) */
    readonly payload?: JwtPayload;
    /** Error reason (only present if invalid) */
    readonly reason?: string;
}

// ============================================================================
// JwtVerifier
// ============================================================================

export class JwtVerifier {
    private readonly _config: JwtVerifierConfig;
    private readonly _clockTolerance: number;

    // Lazy-loaded jose references
    private _joseLoaded = false;
    private _jwtVerify: ((token: string, key: unknown, options?: unknown) => Promise<{ payload: JwtPayload }>) | null = null;
    private _createRemoteJWKSet: ((url: URL) => unknown) | null = null;
    private _jwks: unknown = null;

    constructor(config: JwtVerifierConfig) {
        if (!config.secret && !config.jwksUri && !config.publicKey) {
            throw new Error('JwtVerifier requires at least one of: secret, jwksUri, publicKey');
        }
        this._config = config;
        this._clockTolerance = config.clockTolerance ?? 60;
    }

    // ── Public API ───────────────────────────────────────

    /**
     * Verify a JWT and return the decoded payload.
     *
     * @param token - Raw JWT string (without "Bearer " prefix)
     * @returns The decoded payload, or `null` if verification fails
     */
    async verify(token: string): Promise<JwtPayload | null> {
        const result = await this.verifyDetailed(token);
        return result.valid ? result.payload! : null;
    }

    /**
     * Verify a JWT with detailed result including error reason.
     *
     * @param token - Raw JWT string
     * @returns Detailed verification result
     */
    async verifyDetailed(token: string): Promise<JwtVerifyResult> {
        if (!token || typeof token !== 'string') {
            return { valid: false, reason: 'Token is empty or not a string' };
        }

        try {
            // Try jose first (supports all algorithms)
            const payload = await this._verifyWithJose(token);
            if (payload !== undefined) {
                return this._validateClaims(payload);
            }

            // Fallback: native HS256 verification (secret only)
            if (this._config.secret) {
                const payload = this._verifyHS256Native(token);
                if (payload) {
                    return this._validateClaims(payload);
                }
                return { valid: false, reason: 'Signature verification failed' };
            }

            return { valid: false, reason: 'No verification method available (install jose for RS256/ES256)' };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { valid: false, reason: message };
        }
    }

    // ── Jose Integration ─────────────────────────────────

    /**
     * Attempt to verify using jose.
     * Returns `undefined` if jose is not installed.
     *
     * @internal
     */
    private async _verifyWithJose(token: string): Promise<JwtPayload | undefined> {
        if (!this._joseLoaded) {
            await this._loadJose();
        }

        if (!this._jwtVerify) return undefined;

        const options: Record<string, unknown> = {};
        if (this._config.issuer) options['issuer'] = this._config.issuer;
        if (this._config.audience) options['audience'] = this._config.audience;
        options['clockTolerance'] = this._clockTolerance;

        let key: unknown;

        if (this._config.jwksUri) {
            if (!this._jwks && this._createRemoteJWKSet) {
                this._jwks = this._createRemoteJWKSet(new URL(this._config.jwksUri));
            }
            key = this._jwks;
        } else if (this._config.publicKey) {
            // jose importSPKI for PEM keys
            const jose = await import('jose');
            key = await jose.importSPKI(this._config.publicKey, 'RS256');
        } else if (this._config.secret) {
            const encoder = new TextEncoder();
            key = encoder.encode(this._config.secret);
        }

        if (!key) return undefined;

        const result = await this._jwtVerify(token, key, options);
        return result.payload as JwtPayload;
    }

    /**
     * Load jose dynamically. Silently fails if not installed.
     * @internal
     */
    private async _loadJose(): Promise<void> {
        this._joseLoaded = true;
        try {
            const jose = await import('jose');
            this._jwtVerify = jose.jwtVerify as unknown as typeof this._jwtVerify;
            this._createRemoteJWKSet = jose.createRemoteJWKSet as unknown as typeof this._createRemoteJWKSet;
        } catch {
            // jose not installed — will use native fallback
        }
    }

    // ── Native HS256 Fallback ────────────────────────────

    /**
     * Verify HS256 JWT using Node.js native crypto.
     * @internal
     */
    private _verifyHS256Native(token: string): JwtPayload | null {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const headerB64 = parts[0]!;
        const payloadB64 = parts[1]!;
        const signatureB64 = parts[2]!;

        // Verify header
        try {
            const header = JSON.parse(Buffer.from(headerB64, 'base64url' as BufferEncoding).toString());
            if (header.alg !== 'HS256') return null; // Only HS256 in native mode
        } catch {
            return null;
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', this._config.secret!)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url' as crypto.BinaryToTextEncoding);

        if (!crypto.timingSafeEqual(
            Buffer.from(signatureB64, 'base64url' as BufferEncoding),
            Buffer.from(expectedSignature, 'base64url' as BufferEncoding),
        )) {
            return null;
        }

        // Decode payload
        try {
            return JSON.parse(Buffer.from(payloadB64, 'base64url' as BufferEncoding).toString()) as JwtPayload;
        } catch {
            return null;
        }
    }

    // ── Claims Validation ────────────────────────────────

    /**
     * Validate claims (exp, nbf, required) on an already signature-verified payload.
     * @internal
     */
    private _validateClaims(payload: JwtPayload): JwtVerifyResult {
        const now = Math.floor(Date.now() / 1000);

        // Check expiration
        if (payload.exp !== undefined) {
            if (now > payload.exp + this._clockTolerance) {
                return { valid: false, reason: 'Token has expired' };
            }
        }

        // Check not-before
        if (payload.nbf !== undefined) {
            if (now < payload.nbf - this._clockTolerance) {
                return { valid: false, reason: 'Token is not yet valid (nbf)' };
            }
        }

        // Check issuer (when not using jose, which validates it internally)
        if (this._config.issuer && !this._jwtVerify) {
            const issuers = Array.isArray(this._config.issuer) ? this._config.issuer : [this._config.issuer];
            if (!payload.iss || !issuers.includes(payload.iss)) {
                return { valid: false, reason: `Invalid issuer: ${payload.iss}` };
            }
        }

        // Check audience (when not using jose)
        if (this._config.audience && !this._jwtVerify) {
            const audiences = Array.isArray(this._config.audience) ? this._config.audience : [this._config.audience];
            const tokenAud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
            if (!tokenAud.some(a => audiences.includes(a))) {
                return { valid: false, reason: `Invalid audience: ${payload.aud}` };
            }
        }

        // Check required claims
        if (this._config.requiredClaims) {
            for (const claim of this._config.requiredClaims) {
                if (payload[claim] === undefined) {
                    return { valid: false, reason: `Missing required claim: ${claim}` };
                }
            }
        }

        return { valid: true, payload };
    }

    // ── Utilities ────────────────────────────────────────

    /**
     * Decode a JWT payload WITHOUT verifying the signature.
     * Useful for inspecting tokens in logging/debugging.
     *
     * ⚠️ Never trust decoded-only payloads for authorization decisions.
     */
    static decode(token: string): JwtPayload | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            return JSON.parse(Buffer.from(parts[1]!, 'base64url' as BufferEncoding).toString()) as JwtPayload;
        } catch {
            return null;
        }
    }

    /**
     * Check if a token is expired without verifying signature.
     * Returns `true` if expired or unparseable.
     */
    static isExpired(token: string, clockTolerance = 60): boolean {
        const payload = JwtVerifier.decode(token);
        if (!payload?.exp) return true;
        return Math.floor(Date.now() / 1000) > payload.exp + clockTolerance;
    }
}
