---
title: "Zero-Trust Attestation"
description: "Cryptographic signing, capability pinning, and runtime verification for MCP server behavioral identity."
---

# Zero-Trust Attestation

The [Capability Lockfile](/governance/capability-lockfile) captures the behavioral surface in version control. But what happens after deployment? A compromised dependency, a runtime mutation, or a misconfigured deploy could alter the tool surface between the lockfile check and the actual server startup.

CryptoAttestation closes this gap. Sign the server's behavioral digest at build time. Pin the expected digest as a deployment artifact. Verify it at startup. If the surface doesn't match, the server refuses to start.

When attestation is not configured, no cryptographic operations execute — the server startup path is identical to the default.


## Sign at Build Time {#sign}

```typescript
import {
  computeServerDigest,
  attestServerDigest,
} from '@vinkius-core/mcp-fusion/introspection';

const serverDigest = computeServerDigest(contracts);

const attestation = await attestServerDigest(serverDigest, {
  signer: 'hmac',
  secret: process.env.FUSION_SIGNING_SECRET!,
});

console.log(attestation.signature);
// "a1b2c3d4e5f6..." (HMAC-SHA256 hex)
console.log(attestation.computedDigest);
// "7890abcdef12..."
```

The built-in signer uses HMAC-SHA256 with a shared secret. This is sufficient for most production deployments — the secret never leaves your CI environment, and the signature proves the digest wasn't tampered with between build and deploy.


## Verify at Startup {#verify}

Store the computed digest from CI as an environment variable, then verify at startup:

```typescript
import {
  computeServerDigest,
  verifyCapabilityPin,
} from '@vinkius-core/mcp-fusion/introspection';

const currentDigest = computeServerDigest(contracts);

await verifyCapabilityPin(currentDigest, {
  signer: 'hmac',
  secret: process.env.FUSION_SIGNING_SECRET!,
  expectedDigest: process.env.FUSION_EXPECTED_DIGEST!,
  failOnMismatch: true,
});
```

If the behavioral surface changed between build and startup, the server refuses to start:

```text
[MCP Fusion] Zero-Trust attestation failed:
  computed digest 9a8b7c6d... does not match expected a1b2c3d4...
```

This catches supply-chain attacks, dependency mutations, and deploy misconfigurations — anything that alters the tool surface after the CI check passed.


## Custom Signers {#custom-signers}

For compliance requirements or external KMS integration, implement the `AttestationSigner` interface:

```typescript
import type { AttestationSigner } from '@vinkius-core/mcp-fusion/introspection';

const kmsSigner: AttestationSigner = {
  name: 'aws-kms',

  async sign(digest: string): Promise<string> {
    const { Signature } = await kmsClient.sign({
      KeyId: process.env.KMS_KEY_ID!,
      Message: Buffer.from(digest),
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    });
    return Buffer.from(Signature!).toString('hex');
  },

  async verify(digest: string, signature: string): Promise<boolean> {
    const { SignatureValid } = await kmsClient.verify({
      KeyId: process.env.KMS_KEY_ID!,
      Message: Buffer.from(digest),
      Signature: Buffer.from(signature, 'hex'),
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    });
    return SignatureValid!;
  },
};
```

Pass the signer instead of `'hmac'`:

```typescript
const config: ZeroTrustConfig = {
  signer: kmsSigner,
  expectedDigest: process.env.FUSION_EXPECTED_DIGEST!,
};
```

Any provider works — AWS KMS, GCP Cloud KMS, HashiCorp Vault, Sigstore. The interface requires two methods: `sign(digest)` and `verify(digest, signature)`.


## Exposing Trust to MCP Clients {#mcp-capability}

After attestation, the server can expose a `fusionTrust` capability in the MCP `server.capabilities` object. This allows MCP clients to verify the server's behavioral identity before trusting tool responses:

```typescript
import { buildTrustCapability } from '@vinkius-core/mcp-fusion/introspection';

const trustCapability = buildTrustCapability(
  attestation,
  Object.keys(contracts).length,
);
```

The resulting `FusionTrustCapability` object:

```typescript
{
  serverDigest: "a1b2c3d4e5f6...",   // SHA-256 behavioral identity
  signature: "7890abcdef12...",       // cryptographic signature
  signerName: "hmac-sha256",          // signer identity
  attestedAt: "2026-02-26T12:00:00Z", // ISO-8601 timestamp
  toolCount: 12,                      // tools covered
  verified: true                      // attestation passed
}
```

A client receiving this capability can verify that the server's behavioral surface matches what was signed at build time — before trusting any tool response.


## Handling Attestation Failures {#errors}

When `failOnMismatch` is `true` and the digest doesn't match, `verifyCapabilityPin()` throws an `AttestationError`:

```typescript
import { AttestationError } from '@vinkius-core/mcp-fusion/introspection';

try {
  await verifyCapabilityPin(currentDigest, config);
} catch (err) {
  if (err instanceof AttestationError) {
    console.error('Computed:', err.attestation.computedDigest);
    console.error('Expected:', err.attestation.expectedDigest);
    console.error('Error:', err.attestation.error);
    process.exit(1);
  }
}
```

For standalone signature verification without capability pinning:

```typescript
import { verifyAttestation } from '@vinkius-core/mcp-fusion/introspection';

const result = await verifyAttestation(currentDigest, storedSignature, {
  signer: 'hmac',
  secret: process.env.FUSION_SIGNING_SECRET!,
});

if (!result.valid) {
  console.error(`Signature verification failed: ${result.error}`);
}
```

All signature comparisons use timing-safe equality to prevent timing attacks.


## Full CI/CD Pipeline {#ci}

### GitHub Actions

```yaml
name: Capability Governance
on: [pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npx fusion lock --check --server ./src/server.ts
      - name: Compute behavioral digest
        env:
          FUSION_SIGNING_SECRET: ${{ secrets.FUSION_SIGNING_SECRET }}
        run: |
          DIGEST=$(node -e "
            import('./src/server.ts').then(mod => {
              const { compileContracts, computeServerDigest } = require('@vinkius-core/mcp-fusion/introspection');
              const contracts = compileContracts([...mod.registry.getBuilders()]);
              console.log(computeServerDigest(contracts).digest);
            });
          ")
          echo "FUSION_EXPECTED_DIGEST=$DIGEST" >> $GITHUB_ENV
```

### Deployment-Time Verification

```yaml
deploy:
  runs-on: ubuntu-latest
  env:
    FUSION_SIGNING_SECRET: ${{ secrets.FUSION_SIGNING_SECRET }}
    FUSION_EXPECTED_DIGEST: ${{ vars.FUSION_EXPECTED_DIGEST }}
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - name: Verify attestation
      run: |
        node -e "
          import { compileContracts, computeServerDigest } from '@vinkius-core/mcp-fusion/introspection';
          import { registry } from './src/server.ts';
          const contracts = compileContracts([...registry.getBuilders()]);
          const digest = computeServerDigest(contracts).digest;
          if (digest !== process.env.FUSION_EXPECTED_DIGEST) {
            console.error('Digest mismatch'); process.exit(1);
          }
          console.log('Attestation verified:', digest);
        "
```


## Security Model {#security}

| Threat | Mitigation |
|---|---|
| Secret compromise | Use short-lived secrets or external KMS with key rotation |
| Supply chain attack | Attestation detects if the behavioral surface changed post-build |
| Runtime tampering | `verifyCapabilityPin()` at startup compares against the pinned digest |
| Timing attacks | `timingSafeEqual` for all signature comparisons |
| Replay attacks | Timestamp in attestation + digest uniqueness prevent replay |

Never hardcode signing secrets. Always read them from environment variables or your platform's secret management (Vault, AWS Secrets Manager, etc.).
