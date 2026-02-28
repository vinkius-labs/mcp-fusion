<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-api-key</h1>
  <p align="center">
    <strong>API Key Validation Middleware</strong> — Timing-safe key authentication for MCP Fusion servers
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-api-key"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-api-key?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> API key validation middleware for MCP servers built with MCP Fusion. Timing-safe comparison, SHA-256 hashing, async validators, and self-healing error responses.

## Quick Start

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { apiKeyGuard } from '@vinkius-core/mcp-fusion-api-key';

const f = initFusion<AppContext>();

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
npm install @vinkius-core/mcp-fusion-api-key
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |

## Requirements

- **Node.js** ≥ 18.0.0
- **MCP Fusion** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE)
