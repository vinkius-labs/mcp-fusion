---
title: "Zero-Trust Attestation"
description: "Cryptographic signing, capability pinning, and runtime verification for MCP server behavioral identity."
---

# Zero-Trust Attestation

::: tip One-Liner
Sign the behavioral digest at build time. Verify it at startup. Fail fast if the surface was tampered with.
:::

---

## Overview

The [Capability Lockfile](/governance/capability-lockfile) captures the behavioral surface in version control. But what happens **after deployment**? A compromised dependency, a runtime mutation, or a misconfigured deploy could alter the tool surface between the lockfile check and the actual server startup.

**CryptoAttestation** closes this gap. It provides:

1. **Digital Signing** — Sign the server's behavioral digest using HMAC-SHA256 (built-in) or pluggable external signers (KMS, Sigstore, etc.)
2. **Capability Pinning** — Store the expected digest as a build artifact and verify it at server startup
3. **Runtime MCP Exposure** — Expose a `fusionTrust` capability that MCP clients can inspect to verify the server's behavioral identity

---

## Zero-Overhead Principle

When attestation is not configured, **no cryptographic operations execute**. The server startup path is identical to the default. Attestation is opt-in and pay-for-what-you-use.

---

## Quick Start

### 1. Sign at Build Time

```typescript
import {
  computeServerDigest,
  attestServerDigest,
} from 'mcp-fusion/introspection';

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

### 2. Pin the Expected Digest

Store the computed digest from the CI build as an environment variable or build artifact:

```bash
# In your CI/CD pipeline — compute the digest programmatically
node -e "
  import { compileContracts } from 'mcp-fusion/introspection';
  import { computeServerDigest } from 'mcp-fusion/introspection';
  // Load your registry and compute the digest
  const digest = computeServerDigest(contracts);
  console.log(digest);
" > /tmp/digest.txt
export FUSION_EXPECTED_DIGEST=$(cat /tmp/digest.txt)
```

### 3. Verify at Startup

```typescript
import {
  computeServerDigest,
  verifyCapabilityPin,
} from 'mcp-fusion/introspection';

const currentDigest = computeServerDigest(contracts);

// This will throw AttestationError if the digest doesn't match
await verifyCapabilityPin(currentDigest, {
  signer: 'hmac',
  secret: process.env.FUSION_SIGNING_SECRET!,
  expectedDigest: process.env.FUSION_EXPECTED_DIGEST!,
  failOnMismatch: true,  // default in production
});

// Server starts only if the surface matches
```

If the behavioral surface changed between build time and startup time, the server refuses to start with a clear error:

```
[MCP Fusion] Zero-Trust attestation failed:
  computed digest 9a8b7c6d... does not match expected a1b2c3d4...
```

---

## Signing Strategies

### Built-in: HMAC-SHA256

The default signer uses HMAC-SHA256 with a shared secret. Suitable for most production deployments.

```typescript
const config: ZeroTrustConfig = {
  signer: 'hmac',
  secret: process.env.FUSION_SIGNING_SECRET!, // ≥32 bytes recommended
};
```

::: warning Never hardcode secrets
Always read the signing secret from environment variables. Use your platform's secret management (Vault, AWS Secrets Manager, etc.).
:::

### Custom Signers

For compliance requirements or external KMS integration, implement the `AttestationSigner` interface:

```typescript
import type { AttestationSigner } from 'mcp-fusion/introspection';

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

const config: ZeroTrustConfig = {
  signer: kmsSigner,
  expectedDigest: process.env.FUSION_EXPECTED_DIGEST!,
};
```

---

## MCP Capability Exposure

After attestation, the server can expose a `fusionTrust` capability in the MCP `server.capabilities` object. This allows MCP clients to **verify the server's behavioral identity before trusting tool responses**.

```typescript
import { buildTrustCapability } from 'mcp-fusion/introspection';

const trustCapability = buildTrustCapability(
  attestation,
  Object.keys(contracts).length,
);

// Result:
// {
//   serverDigest: "a1b2c3d4e5f6...",
//   signature: "7890abcdef12...",
//   signerName: "hmac-sha256",
//   attestedAt: "2026-02-26T12:00:00.000Z",
//   toolCount: 12,
//   verified: true
// }
```

### `FusionTrustCapability`

| Field | Type | Description |
|---|---|---|
| `serverDigest` | `string` | SHA-256 behavioral identity hash |
| `signature` | `string \| null` | Cryptographic signature of the digest |
| `signerName` | `string` | Identity of the signer (e.g., `"hmac-sha256"`, `"aws-kms"`) |
| `attestedAt` | `string` | ISO-8601 timestamp of attestation |
| `toolCount` | `number` | Number of tools covered |
| `verified` | `boolean` | Whether the attestation passed verification |

---

## Verification Flow

```typescript
import { verifyAttestation } from 'mcp-fusion/introspection';

const result = await verifyAttestation(
  currentDigest,
  storedSignature,
  {
    signer: 'hmac',
    secret: process.env.FUSION_SIGNING_SECRET!,
  },
);

if (!result.valid) {
  console.error(`Signature verification failed: ${result.error}`);
}
```

`verifyAttestation` uses **timing-safe comparison** to prevent timing attacks. The comparison runs in constant time regardless of how many bytes match.

---

## `AttestationError`

When `failOnMismatch` is `true` and the digest doesn't match, `verifyCapabilityPin()` throws an `AttestationError`:

```typescript
import { AttestationError } from 'mcp-fusion/introspection';

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

---

## Architecture

```
Build Time                          Runtime
──────────                          ───────

┌──────────────────┐
│ computeServer    │
│ Digest()         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────────────┐
│ attestServer     │     │ Server Startup                │
│ Digest()         │     │                               │
│  sign(digest)    │     │  computeServerDigest()        │
└────────┬─────────┘     │         │                     │
         │               │         ▼                     │
         │               │  verifyCapabilityPin()        │
    ┌────▼────┐           │    compare(expected, actual) │
    │ Store   │           │         │                     │
    │ digest  │──────────▶│    ┌────▼────┐               │
    │ + sig   │           │    │ Match?  │               │
    └─────────┘           │    └────┬────┘               │
                          │    yes ╱ ╲ no                 │
                          │      ╱   ╲                   │
                          │  ┌──▼┐  ┌▼──────────────┐    │
                          │  │ OK│  │AttestationError│    │
                          │  │   │  │  fail fast     │    │
                          │  └───┘  └───────────────┘    │
                          └──────────────────────────────┘
```

---

## CI/CD Pipeline

### Full Governance Pipeline

```yaml
# .github/workflows/governance.yml
name: Capability Governance
on: [pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci

      # Step 1: Verify lockfile is up to date
      - run: npx fusion lock --check --server ./src/server.ts

      # Step 2: Compute and store the digest for deployment
      - name: Compute behavioral digest
        run: |
          DIGEST=$(node -e "
            import('./src/server.ts').then(mod => {
              const { compileContracts } = require('mcp-fusion/introspection');
              const { computeServerDigest } = require('mcp-fusion/introspection');
              const contracts = compileContracts([...mod.registry.getBuilders()]);
              console.log(computeServerDigest(contracts));
            });
          ")
          echo "FUSION_EXPECTED_DIGEST=$DIGEST" >> $GITHUB_ENV
```

### Deployment-Time Verification

```yaml
# .github/workflows/deploy.yml
deploy:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - name: Verify attestation
      env:
        FUSION_SIGNING_SECRET: ${{ secrets.FUSION_SIGNING_SECRET }}
        FUSION_EXPECTED_DIGEST: ${{ vars.FUSION_EXPECTED_DIGEST }}
      run: |
        node -e "
          import { compileContracts, computeServerDigest, verifyCapabilityPin } from 'mcp-fusion/introspection';
          import { registry } from './src/server.ts';
          const contracts = compileContracts([...registry.getBuilders()]);
          const digest = computeServerDigest(contracts);
          const expected = process.env.FUSION_EXPECTED_DIGEST;
          if (digest !== expected) { console.error('Digest mismatch'); process.exit(1); }
          console.log('Attestation verified:', digest);
        "
```

---

## `ZeroTrustConfig` Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `signer` | `'hmac' \| AttestationSigner` | — | Signing strategy |
| `secret` | `string` | — | HMAC secret (required for `'hmac'` signer) |
| `expectedDigest` | `string` | — | Known-good digest from build time |
| `failOnMismatch` | `boolean` | `true` in production | Throw on digest mismatch |
| `exposeCapability` | `boolean` | `true` | Expose `fusionTrust` in MCP capabilities |

---

## Security Model

| Threat | Mitigation |
|---|---|
| Secret compromise | Use short-lived secrets or external KMS with key rotation |
| Dependency supply chain attack | Attestation detects if the behavioral surface changed post-build |
| Runtime tampering | `verifyCapabilityPin()` at startup compares against pinned digest |
| Timing attacks | `timingSafeEqual` for all signature comparisons |
| Replay attacks | Timestamp in attestation + digest uniqueness prevent replay |
