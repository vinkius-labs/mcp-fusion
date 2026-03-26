<p align="center">
  <h1 align="center">@vurb/api-key</h1>
  <p align="center">
    <strong>MCP API Key Authentication for Vurb.ts</strong> — A framework for creating secure MCP servers<br/>
    Timing-safe API key validation · SHA-256 hashing · Async validators · Self-healing error responses
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/api-key"><img src="https://img.shields.io/npm/v/@vurb/api-key?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP API Key Authentication for Vurb.ts** — the Model Context Protocol framework for building production MCP servers. Timing-safe key comparison, SHA-256 hashing, async validators, and self-healing error responses.

## Quick Start

```typescript
import { initVurb } from '@vurb/core';
import { apiKeyGuard } from '@vurb/api-key';

const f = initVurb<AppContext>();

const withApiKey = apiKeyGuard({
    keys: [process.env.API_KEY!],
    header: 'x-api-key',
});

export default f.query('data.export')
    .use(withApiKey)
    .handle(async (input, ctx) => {
        return db.records.findMany();
    });
```

## Features

| Feature | Description |
|---------|-------------|
| **Timing-Safe** | Constant-time key comparison prevents timing attacks |
| **SHA-256 Hashing** | Store hashed keys instead of plaintext |
| **Async Validators** | Validate keys against a database or external service |
| **Self-Healing** | Missing/invalid keys return actionable hints to the LLM agent |
| **Key Rotation** | Support multiple keys for seamless rotation |

## SHA-256 Hashed Keys

```typescript
const withApiKey = apiKeyGuard({
    hashedKeys: ['a1b2c3...'], // SHA-256 hash of the actual key
    algorithm: 'sha256',
});
```

## Async Validator

```typescript
const withApiKey = apiKeyGuard({
    validate: async (key) => {
        const record = await db.apiKeys.findUnique({ where: { key } });
        return record !== null && record.revokedAt === null;
    },
});
```

## Installation

```bash
npm install @vurb/api-key
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **Vurb.ts** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
