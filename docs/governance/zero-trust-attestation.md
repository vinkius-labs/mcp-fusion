---
title: "Zero-Trust Attestation"
description: "Cryptographic signing, capability pinning, and runtime verification for MCP server behavioral identity."
---

# Zero-Trust Attestation

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Sign the server digest at CI with HMAC-SHA256, pin the expected digest as an env var, and verify at startup with verifyCapabilityPin()."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Sign the server digest at CI with HMAC-SHA256, pin the expected digest as an env var, and verify at startup with verifyCapabilityPin().');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Sign+the+server+digest+at+CI+with+HMAC-SHA256%2C+pin+the+expected+digest+as+an+env+var%2C+and+verify+at+startup+with+verifyCapabilityPin()." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Sign+the+server+digest+at+CI+with+HMAC-SHA256%2C+pin+the+expected+digest+as+an+env+var%2C+and+verify+at+startup+with+verifyCapabilityPin()." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">CRYPTOGRAPHIC TRUST</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Signed at build. Verified at boot.<br><span style="color:rgba(255,255,255,0.25)">Tampered? Server won't start.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Sign the behavioral digest at build time, pin it as a deployment artifact, verify at startup. If the surface doesn't match, the server refuses to start. Supply-chain attacks and runtime mutations caught cold.</div>
</div>


CryptoAttestation closes this gap. Sign the server's behavioral digest at build time. Pin the expected digest as a deployment artifact. Verify it at startup. If the surface doesn't match, the server refuses to start.

When attestation is not configured, no cryptographic operations execute — the server startup path is identical to the default.


## Sign at Build Time {#sign}

```typescript
import {
  computeServerDigest,
  attestServerDigest,
} from 'Vurb.ts/introspection';

const serverDigest = computeServerDigest(contracts);

const attestation = await attestServerDigest(serverDigest, {
  signer: 'hmac',
  secret: process.env.Vurb.ts_SIGNING_SECRET!,
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
} from 'Vurb.ts/introspection';

const currentDigest = computeServerDigest(contracts);

await verifyCapabilityPin(currentDigest, {
  signer: 'hmac',
  secret: process.env.Vurb.ts_SIGNING_SECRET!,
  expectedDigest: process.env.Vurb.ts_EXPECTED_DIGEST!,
  failOnMismatch: true,
});
```

If the behavioral surface changed between build and startup, the server refuses to start:

```text
[Vurb.ts] Zero-Trust attestation failed:
  computed digest 9a8b7c6d... does not match expected a1b2c3d4...
```

This catches supply-chain attacks, dependency mutations, and deploy misconfigurations — anything that alters the tool surface after the CI check passed.


## Custom Signers {#custom-signers}

For compliance requirements or external KMS integration, implement the `AttestationSigner` interface:

```typescript
import type { AttestationSigner } from 'Vurb.ts/introspection';

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
  expectedDigest: process.env.Vurb.ts_EXPECTED_DIGEST!,
};
```

Any provider works — AWS KMS, GCP Cloud KMS, HashiCorp Vault, Sigstore. The interface requires two methods: `sign(digest)` and `verify(digest, signature)`.


## Exposing Trust to MCP Clients {#mcp-capability}

After attestation, the server can expose a `vurbTrust` capability in the MCP `server.capabilities` object. This allows MCP clients to verify the server's behavioral identity before trusting tool responses:

```typescript
import { buildTrustCapability } from 'Vurb.ts/introspection';

const trustCapability = buildTrustCapability(
  attestation,
  Object.keys(contracts).length,
);
```

The resulting `VurbTrustCapability` object:

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
import { AttestationError } from 'Vurb.ts/introspection';

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
import { verifyAttestation } from 'Vurb.ts/introspection';

const result = await verifyAttestation(currentDigest, storedSignature, {
  signer: 'hmac',
  secret: process.env.Vurb.ts_SIGNING_SECRET!,
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
      - run: vurb lock --check --server ./src/server.ts
      - name: Compute behavioral digest
        env:
          Vurb.ts_SIGNING_SECRET: ${{ secrets.Vurb.ts_SIGNING_SECRET }}
        run: |
          DIGEST=$(node -e "
            import('./src/server.ts').then(mod => {
              const { compileContracts, computeServerDigest } = require('Vurb.ts/introspection');
              const contracts = compileContracts([...mod.registry.getBuilders()]);
              console.log(computeServerDigest(contracts).digest);
            });
          ")
          echo "Vurb.ts_EXPECTED_DIGEST=$DIGEST" >> $GITHUB_ENV
```

### Deployment-Time Verification

```yaml
deploy:
  runs-on: ubuntu-latest
  env:
    Vurb.ts_SIGNING_SECRET: ${{ secrets.Vurb.ts_SIGNING_SECRET }}
    Vurb.ts_EXPECTED_DIGEST: ${{ vars.Vurb.ts_EXPECTED_DIGEST }}
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - name: Verify attestation
      run: |
        node -e "
          import { compileContracts, computeServerDigest } from 'Vurb.ts/introspection';
          import { registry } from './src/server.ts';
          const contracts = compileContracts([...registry.getBuilders()]);
          const digest = computeServerDigest(contracts).digest;
          if (digest !== process.env.Vurb.ts_EXPECTED_DIGEST) {
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
