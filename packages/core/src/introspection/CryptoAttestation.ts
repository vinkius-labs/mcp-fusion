/**
 * CryptoAttestation — Zero-Trust Runtime Verification
 *
 * **Evolution 1: Zero-Trust Runtime**
 *
 * Provides cryptographic attestation and capability pinning
 * for MCP Fusion tool contracts. This module enables:
 *
 * 1. **Digital Signing**: Sign a `ToolContract` or `ServerDigest`
 *    using HMAC-SHA256 (built-in) or pluggable external signers
 *    (Sigstore, AWS KMS, Azure Key Vault).
 *
 * 2. **Runtime Verification**: At server startup, re-compute the
 *    behavioral digest and compare it against the expected
 *    (signed) digest. If they differ, fail fast with a clear
 *    attestation error.
 *
 * 3. **Capability Pinning**: Expose a `fusionTrust` capability
 *    in the MCP `server.capabilities` that clients can inspect
 *    to verify the server's behavioral identity.
 *
 * **Zero-overhead principle**: When attestation is not configured,
 * no cryptographic operations execute — the attach flow is
 * identical to the default path.
 *
 * @module
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ToolContract } from './ToolContract.js';
import type { ServerDigest, BehaviorDigestResult } from './BehaviorDigest.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for zero-trust attestation.
 *
 * Passed to `AttachOptions.zeroTrust` in ServerAttachment.
 */
export interface ZeroTrustConfig {
    /**
     * The signing strategy to use.
     * - `'hmac'` — HMAC-SHA256 with a shared secret (built-in)
     * - A custom `AttestationSigner` for external KMS integration
     */
    readonly signer: 'hmac' | AttestationSigner;

    /**
     * For `'hmac'` mode: the shared secret.
     * Read from environment in production (never hardcode).
     */
    readonly secret?: string;

    /**
     * Expected server digest hash from a known-good build.
     * When set, runtime verification will fail-fast if the
     * re-computed digest doesn't match.
     */
    readonly expectedDigest?: string;

    /**
     * Whether to fail-fast on attestation failure.
     * Default: `true` in production, `false` in development.
     */
    readonly failOnMismatch?: boolean;

    /**
     * Whether to expose the attestation in MCP capabilities.
     * Default: `true`.
     */
    readonly exposeCapability?: boolean;
}

/**
 * Pluggable signer interface for external KMS integration.
 *
 * Implementations should be stateless and async-safe.
 * The `sign()` method receives the canonical digest string
 * and returns a signature (hex-encoded or base64).
 */
export interface AttestationSigner {
    /** Human-readable name (e.g., 'sigstore', 'aws-kms') */
    readonly name: string;
    /** Sign a digest string */
    sign(digest: string): Promise<string>;
    /** Verify a digest against a signature */
    verify(digest: string, signature: string): Promise<boolean>;
}

/**
 * Result of an attestation operation.
 */
export interface AttestationResult {
    /** Whether the attestation was successful */
    readonly valid: boolean;
    /** The computed digest */
    readonly computedDigest: string;
    /** The expected digest (if configured) */
    readonly expectedDigest: string | null;
    /** The signature (if signing was performed) */
    readonly signature: string | null;
    /** Signer identity */
    readonly signerName: string;
    /** ISO-8601 timestamp of attestation */
    readonly attestedAt: string;
    /** Human-readable error message, if invalid */
    readonly error: string | null;
}

/**
 * Capability structure exposed via MCP `server.capabilities`.
 *
 * Clients can inspect this to verify the server's behavioral
 * identity before trusting tool responses.
 */
export interface FusionTrustCapability {
    /** Current server behavioral digest */
    readonly serverDigest: string;
    /** Attestation signature (if signed) */
    readonly signature: string | null;
    /** Signer identity */
    readonly signerName: string;
    /** ISO-8601 timestamp of last attestation */
    readonly attestedAt: string;
    /** Number of tools covered by the attestation */
    readonly toolCount: number;
    /** Whether the attestation passed verification */
    readonly verified: boolean;
}

// ============================================================================
// HMAC Signer (Built-in)
// ============================================================================

/**
 * Create an HMAC-SHA256 signer from a shared secret.
 *
 * @param secret - The shared secret (should be ≥32 bytes)
 * @returns An `AttestationSigner` using HMAC-SHA256
 */
export function createHmacSigner(secret: string): AttestationSigner {
    return {
        name: 'hmac-sha256',
        async sign(digest: string): Promise<string> {
            return hmacSign(digest, secret);
        },
        async verify(digest: string, signature: string): Promise<boolean> {
            const expected = hmacSign(digest, secret);
            return timingSafeCompare(expected, signature);
        },
    };
}

// ============================================================================
// Attestation Operations
// ============================================================================

/**
 * Sign a server digest and produce an attestation result.
 *
 * @param serverDigest - The server's behavioral digest
 * @param config - Zero-trust configuration
 * @returns Attestation result with signature
 */
export async function attestServerDigest(
    serverDigest: ServerDigest,
    config: ZeroTrustConfig,
): Promise<AttestationResult> {
    const signer = resolveSigner(config);
    const signature = await signer.sign(serverDigest.digest);
    const attestedAt = new Date().toISOString();

    // Verify against expected digest if configured
    if (config.expectedDigest) {
        const matches = serverDigest.digest === config.expectedDigest;
        return {
            valid: matches,
            computedDigest: serverDigest.digest,
            expectedDigest: config.expectedDigest,
            signature,
            signerName: signer.name,
            attestedAt,
            error: matches ? null : `Attestation failed: computed digest ${serverDigest.digest} does not match expected ${config.expectedDigest}`,
        };
    }

    return {
        valid: true,
        computedDigest: serverDigest.digest,
        expectedDigest: null,
        signature,
        signerName: signer.name,
        attestedAt,
        error: null,
    };
}

/**
 * Verify a previously signed attestation.
 *
 * @param serverDigest - The current server digest
 * @param signature - The signature to verify
 * @param config - Zero-trust configuration
 * @returns Attestation result with verification status
 */
export async function verifyAttestation(
    serverDigest: ServerDigest,
    signature: string,
    config: ZeroTrustConfig,
): Promise<AttestationResult> {
    const signer = resolveSigner(config);
    const verified = await signer.verify(serverDigest.digest, signature);
    const attestedAt = new Date().toISOString();

    return {
        valid: verified,
        computedDigest: serverDigest.digest,
        expectedDigest: config.expectedDigest ?? null,
        signature,
        signerName: signer.name,
        attestedAt,
        error: verified ? null : `Signature verification failed for digest ${serverDigest.digest}`,
    };
}

/**
 * Runtime capability pinning — check that the current digest
 * matches what was attested at build time.
 *
 * Designed to be called once at server startup in the `attach()` flow.
 *
 * @param currentDigest - Re-computed server digest
 * @param config - Zero-trust configuration
 * @returns Attestation result
 * @throws If `failOnMismatch` is true and the digest doesn't match
 */
export async function verifyCapabilityPin(
    currentDigest: ServerDigest,
    config: ZeroTrustConfig,
): Promise<AttestationResult> {
    const result = await attestServerDigest(currentDigest, config);

    if (!result.valid && (config.failOnMismatch ?? true)) {
        throw new AttestationError(
            `[MCP Fusion] Zero-Trust attestation failed: ${result.error}`,
            result,
        );
    }

    return result;
}

/**
 * Build the `fusionTrust` capability object for MCP exposure.
 *
 * @param attestation - A completed attestation result
 * @param toolCount - Number of tools in the registry
 * @returns Capability structure for `server.capabilities`
 */
export function buildTrustCapability(
    attestation: AttestationResult,
    toolCount: number,
): FusionTrustCapability {
    return {
        serverDigest: attestation.computedDigest,
        signature: attestation.signature,
        signerName: attestation.signerName,
        attestedAt: attestation.attestedAt,
        toolCount,
        verified: attestation.valid,
    };
}

// ============================================================================
// Attestation Error
// ============================================================================

/**
 * Error thrown when zero-trust attestation fails with failOnMismatch.
 *
 * Carries the full `AttestationResult` for programmatic inspection.
 */
export class AttestationError extends Error {
    readonly attestation: AttestationResult;

    constructor(message: string, attestation: AttestationResult) {
        super(message);
        this.name = 'AttestationError';
        this.attestation = attestation;
    }
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Resolve the signer from config.
 * @internal
 */
function resolveSigner(config: ZeroTrustConfig): AttestationSigner {
    if (config.signer === 'hmac') {
        if (!config.secret) {
            throw new Error('[MCP Fusion] HMAC signer requires a secret. Set zeroTrust.secret or use a custom signer.');
        }
        return createHmacSigner(config.secret);
    }
    return config.signer;
}

/**
 * HMAC-SHA256 sign.
 * @internal
 */
function hmacSign(data: string, secret: string): string {
    return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * @internal
 */
function timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    return timingSafeEqual(bufA, bufB);
}
