/**
 * CryptoAttestation Tests
 *
 * Verifies the zero-trust runtime verification in isolation.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import type { ServerDigest } from '../../src/introspection/BehaviorDigest.js';
import {
    createHmacSigner,
    attestServerDigest,
    verifyAttestation,
    verifyCapabilityPin,
    buildTrustCapability,
    AttestationError,
} from '../../src/introspection/CryptoAttestation.js';

// ============================================================================
// Helpers
// ============================================================================

function mockServerDigest(toolDigests: Record<string, string> = { users: 'abc123' }): ServerDigest {
    const tools: Record<string, { digest: string; components: { surface: string; behavior: string; tokenEconomics: string; entitlements: string }; computedAt: string; toolName: string }> = {};
    for (const [name, digest] of Object.entries(toolDigests)) {
        tools[name] = {
            digest,
            components: { surface: 's', behavior: 'b', tokenEconomics: 't', entitlements: 'e' },
            computedAt: new Date().toISOString(),
            toolName: name,
        };
    }

    return {
        digest: Object.values(toolDigests).join('+'),
        tools,
        computedAt: new Date().toISOString(),
    };
}

// ============================================================================
// CryptoAttestation
// ============================================================================

describe('CryptoAttestation', () => {
    const TEST_SECRET = 'test-signing-secret-at-least-32-bytes!';

    describe('createHmacSigner', () => {
        it('creates a working HMAC signer', async () => {
            const signer = createHmacSigner(TEST_SECRET);
            expect(signer.name).toBe('hmac-sha256');

            const signature = await signer.sign('test-digest');
            expect(signature).toBeTruthy();
            expect(signature.length).toBe(64); // SHA-256 hex
        });

        it('verifies valid signatures', async () => {
            const signer = createHmacSigner(TEST_SECRET);
            const signature = await signer.sign('test-digest');
            const valid = await signer.verify('test-digest', signature);
            expect(valid).toBe(true);
        });

        it('rejects invalid signatures', async () => {
            const signer = createHmacSigner(TEST_SECRET);
            const valid = await signer.verify('test-digest', 'invalid-signature-xxx');
            expect(valid).toBe(false);
        });

        it('produces different signatures for different secrets', async () => {
            const s1 = createHmacSigner('secret-1-at-least-32-bytes-long!!');
            const s2 = createHmacSigner('secret-2-at-least-32-bytes-long!!');

            const sig1 = await s1.sign('same-digest');
            const sig2 = await s2.sign('same-digest');

            expect(sig1).not.toBe(sig2);
        });
    });

    describe('attestServerDigest', () => {
        it('signs a server digest successfully', async () => {
            const digest = mockServerDigest();
            const result = await attestServerDigest(digest, {
                signer: 'hmac',
                secret: TEST_SECRET,
            });

            expect(result.valid).toBe(true);
            expect(result.signature).toBeTruthy();
            expect(result.signerName).toBe('hmac-sha256');
        });

        it('validates against expected digest', async () => {
            const digest = mockServerDigest({ users: 'abc' });
            const result = await attestServerDigest(digest, {
                signer: 'hmac',
                secret: TEST_SECRET,
                expectedDigest: digest.digest, // Matching
            });

            expect(result.valid).toBe(true);
        });

        it('detects digest mismatch', async () => {
            const digest = mockServerDigest({ users: 'abc' });
            const result = await attestServerDigest(digest, {
                signer: 'hmac',
                secret: TEST_SECRET,
                expectedDigest: 'wrong-digest',
            });

            expect(result.valid).toBe(false);
            expect(result.error).toContain('does not match');
        });
    });

    describe('verifyAttestation', () => {
        it('verifies a previously signed digest', async () => {
            const digest = mockServerDigest();
            const signed = await attestServerDigest(digest, {
                signer: 'hmac',
                secret: TEST_SECRET,
            });

            const verified = await verifyAttestation(digest, signed.signature!, {
                signer: 'hmac',
                secret: TEST_SECRET,
            });

            expect(verified.valid).toBe(true);
        });
    });

    describe('verifyCapabilityPin', () => {
        it('passes when digest matches expected', async () => {
            const digest = mockServerDigest();
            const result = await verifyCapabilityPin(digest, {
                signer: 'hmac',
                secret: TEST_SECRET,
                expectedDigest: digest.digest,
                failOnMismatch: false,
            });

            expect(result.valid).toBe(true);
        });

        it('throws AttestationError on mismatch when failOnMismatch is true', async () => {
            const digest = mockServerDigest();

            await expect(
                verifyCapabilityPin(digest, {
                    signer: 'hmac',
                    secret: TEST_SECRET,
                    expectedDigest: 'wrong',
                    failOnMismatch: true,
                }),
            ).rejects.toThrow(AttestationError);
        });
    });

    describe('buildTrustCapability', () => {
        it('builds a capability object from attestation result', async () => {
            const digest = mockServerDigest();
            const attestation = await attestServerDigest(digest, {
                signer: 'hmac',
                secret: TEST_SECRET,
            });

            const capability = buildTrustCapability(attestation, 5);

            expect(capability.serverDigest).toBe(attestation.computedDigest);
            expect(capability.signature).toBe(attestation.signature);
            expect(capability.toolCount).toBe(5);
            expect(capability.verified).toBe(true);
        });
    });
});
