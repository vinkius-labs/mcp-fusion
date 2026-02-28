---
title: API Key Validation — Timing-Safe Key Management
description: Drop-in API key validation middleware for MCP servers built with mcp-fusion. SHA-256 hashing, timing-safe comparison, async validators, and self-healing errors. Zero external dependencies.
---

# API Key Validation

Timing-safe API key validation for MCP servers. Supports static key sets, SHA-256 hash comparison, and async validators (database lookup). All comparisons use `crypto.timingSafeEqual` to prevent timing attacks. **Zero external dependencies** — uses native Node.js `crypto`.

```bash
npm install @vinkius-core/mcp-fusion-api-key
```

Peer dependency: `@vinkius-core/mcp-fusion ^2.0.0`

## Architecture

```
Request → Key Extraction → Format Checks → Validation Strategy → Handler
                              │                    │
                        ┌─────┴─────┐       ┌──────┴──────┐
                        │  prefix?  │       │  Static Set  │
                        │ minLength │       │  (hashed)    │
                        └───────────┘       ├──────────────┤
                                            │  Hash-Based  │
                                            │  (SHA-256)   │
                                            ├──────────────┤
                                            │    Async     │
                                            │  Validator   │
                                            │  (DB lookup) │
                                            └──────────────┘
                                           timing-safe comparison
```

## Protect Tools with Middleware

```typescript
import { requireApiKey } from '@vinkius-core/mcp-fusion-api-key';
import { createTool, success } from '@vinkius-core/mcp-fusion';

const projects = createTool<AppContext>('projects')
    .use(requireApiKey({
        keys: [process.env.API_KEY!],
        prefix: 'sk_live_',
        onValidated: (ctx, metadata) => {
            (ctx as any).keyOwner = metadata?.userId;
        },
    }))
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx) => success(await ctx.db.getProjects()),
    });
```

When no valid key is found, `requireApiKey()` returns a structured `toolError('APIKEY_INVALID')` with recovery hints — enabling the LLM to self-heal by requesting an API key.

## Create the API Key Auth Tool

```typescript
import { createApiKeyTool } from '@vinkius-core/mcp-fusion-api-key';

const apiKeyTool = createApiKeyTool<AppContext>({
    keys: [process.env.API_KEY!],
    toolName: 'api_key_auth',
    extractKey: (ctx) => ctx.headers?.['x-api-key'],
});
```

The API key auth tool exposes 2 actions:

| Action | Description |
|--------|-------------|
| `validate` | Validate an API key and return metadata |
| `status` | Check API key authentication status from context |

## Validation Strategies

### Static Key Set

Plaintext keys are pre-hashed at construction time. Validation uses timing-safe SHA-256 comparison:

```typescript
import { ApiKeyManager } from '@vinkius-core/mcp-fusion-api-key';

const manager = new ApiKeyManager({
    keys: ['sk_live_abc123def456', 'sk_live_xyz789uvw012'],
});

const result = await manager.validate('sk_live_abc123def456');
// { valid: true }
```

### Hash-Based (Safe Storage)

Store SHA-256 hashes in your database instead of plaintext keys:

```typescript
// Generate hash for storage
const hash = ApiKeyManager.hashKey('sk_live_abc123def456');
// Store hash in database: 'a1b2c3d4...' (64 hex chars)

// Validate against stored hashes
const manager = new ApiKeyManager({
    hashedKeys: [hash],
});
```

### Async Validator (Database Lookup)

For dynamic key validation — database lookups, rate limiting, scope checking:

```typescript
const manager = new ApiKeyManager({
    validator: async (key) => {
        const record = await db.apiKeys.findByHash(
            ApiKeyManager.hashKey(key)
        );
        if (!record) return { valid: false, reason: 'Unknown key' };
        if (record.revokedAt) return { valid: false, reason: 'Key revoked' };
        return {
            valid: true,
            metadata: {
                userId: record.userId,
                scopes: record.scopes,
                tier: record.tier,
            },
        };
    },
});
```

## Key Management Utilities

```typescript
import { ApiKeyManager } from '@vinkius-core/mcp-fusion-api-key';

// Generate random API key
const key = ApiKeyManager.generateKey({ prefix: 'sk_live_', length: 32 });
// 'sk_live_a1B2c3D4e5F6g7H8i9J0...'

// Hash for safe storage
const hash = ApiKeyManager.hashKey(key);
// '8f14e45fceea167a5a36dedd...' (SHA-256 hex, 64 chars)

// Timing-safe comparison
const matches = ApiKeyManager.matchKey(key, hash);
// true
```

## Prefix & Length Validation

Enforce key format before validation:

```typescript
const manager = new ApiKeyManager({
    keys: ['sk_live_abc123def456ghi7'],
    prefix: 'sk_live_',  // reject keys without this prefix
    minLength: 20,         // reject keys shorter than 20 chars (default: 16)
});
```

## Key Extraction

The `requireApiKey()` middleware checks these locations (in order):

1. `ctx.apiKey` — direct property
2. `ctx.headers['x-api-key']` — standard header
3. `ctx.headers.authorization` — with `ApiKey` or `Bearer` prefix

Custom extraction:

```typescript
requireApiKey({
    keys: ['sk_live_abc123def456ghi7'],
    extractKey: (ctx) => ctx.myCustomField,
});
```

## API Reference

### `ApiKeyManager`

| Method | Returns | Description |
|--------|---------|-------------|
| `validate(key)` | `ApiKeyValidationResult` | Validate with detailed result |
| `isValid(key)` | `boolean` | Quick boolean check |
| `ApiKeyManager.hashKey(key)` | `string` | SHA-256 hex hash |
| `ApiKeyManager.matchKey(key, hash)` | `boolean` | Timing-safe match |
| `ApiKeyManager.generateKey(opts?)` | `string` | Generate random key |

### `requireApiKey(options)`

Returns a mcp-fusion middleware function.

**Options:**

| Field | Type | Description |
|-------|------|-------------|
| `keys` | `string[]` | Static set of valid API keys |
| `hashedKeys` | `string[]` | Pre-hashed keys (SHA-256 hex) |
| `validator` | `(key) => Promise<Result>` | Async validation function |
| `prefix` | `string` | Required key prefix |
| `minLength` | `number` | Minimum key length (default: 16) |
| `extractKey` | `(ctx) => string \| null` | Custom key extraction |
| `onValidated` | `(ctx, metadata?) => void` | Callback after validation |
| `errorCode` | `string` | Custom error code (default: `APIKEY_INVALID`) |
| `recoveryHint` | `string` | Hint for LLM self-healing |
| `recoveryAction` | `string` | Tool name to suggest |

### `createApiKeyTool<TContext>(config)`

Returns a `GroupedToolBuilder` with actions: `validate`, `status`.

**Config:** Extends `requireApiKey` options plus:

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | `string` | Tool name in MCP (default: `api_key_auth`) |
| `description` | `string` | Tool description for the LLM |
| `tags` | `string[]` | Tags for selective tool exposure |

## Types

```typescript
interface ApiKeyValidationResult {
    valid: boolean;
    metadata?: Record<string, unknown>;  // userId, scopes, etc.
    reason?: string;                     // Only when invalid
}

interface ApiKeyManagerConfig {
    keys?: string[];
    hashedKeys?: string[];
    validator?: (key: string) => Promise<ApiKeyValidationResult>;
    prefix?: string;
    minLength?: number;        // default: 16
}
```
