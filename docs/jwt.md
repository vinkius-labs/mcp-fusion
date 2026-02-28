---
title: JWT Verification — Standards-Compliant Token Validation
description: Drop-in JWT verification middleware for MCP servers built with mcp-fusion. HS256 native fallback, jose integration for RS256/ES256/JWKS, claims validation, and self-healing errors.
---

# JWT Verification

Standards-compliant JWT verification for MCP servers. Verifies tokens using [jose](https://github.com/panva/jose) when installed, or falls back to native Node.js `crypto` for HS256. Supports JWKS auto-discovery, RS256, ES256, and full claims validation (`exp`, `nbf`, `iss`, `aud`, `requiredClaims`).

```bash
npm install @vinkius-core/mcp-fusion-jwt
```

Peer dependencies: `@vinkius-core/mcp-fusion ^2.0.0`, `jose ^5.0.0` (optional)

## Architecture

```
Request → Token Extraction → Signature Verification → Claims Validation → Handler
                                  │                          │
                            ┌─────┴─────┐            ┌──────┴──────┐
                            │   jose    │            │    exp      │
                            │ RS256/ES256│           │    nbf      │
                            │   JWKS    │            │    iss      │
                            ├───────────┤            │    aud      │
                            │  Native   │            │ required    │
                            │  HS256    │            │  claims     │
                            │  crypto   │            └─────────────┘
                            └───────────┘
                          (auto-selected)
```

## Protect Tools with Middleware

```typescript
import { requireJwt } from '@vinkius-core/mcp-fusion-jwt';
import { createTool, success } from '@vinkius-core/mcp-fusion';

const projects = createTool<AppContext>('projects')
    .use(requireJwt({
        secret: process.env.JWT_SECRET!,
        issuer: 'my-app',
        audience: 'my-api',
        onVerified: (ctx, payload) => {
            (ctx as any).userId = payload.sub;
        },
    }))
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx) => success(await ctx.db.getProjects(ctx.userId)),
    });
```

When no valid JWT is found, `requireJwt()` returns a structured `toolError('JWT_INVALID')` with recovery hints — enabling the LLM to self-heal by requesting authentication.

## Create the JWT Auth Tool

```typescript
import { createJwtAuthTool } from '@vinkius-core/mcp-fusion-jwt';

const jwtTool = createJwtAuthTool<AppContext>({
    secret: process.env.JWT_SECRET!,
    issuer: 'my-app',
    toolName: 'jwt_auth',
    extractToken: (ctx) => ctx.headers?.authorization,
});
```

The JWT auth tool exposes 2 actions:

| Action | Description |
|--------|-------------|
| `verify` | Verify a JWT and return decoded claims |
| `status` | Check JWT authentication status from context |

## Standalone Usage

`JwtVerifier` works independently of mcp-fusion:

```typescript
import { JwtVerifier } from '@vinkius-core/mcp-fusion-jwt';

// With symmetric secret (HS256)
const verifier = new JwtVerifier({ secret: 'my-secret' });

// With JWKS endpoint (RS256, ES256 — requires jose)
const verifier = new JwtVerifier({
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    audience: 'my-api',
});

// Verify
const payload = await verifier.verify(token);
if (payload) {
    console.log(payload.sub); // user ID
}

// Verify with details
const result = await verifier.verifyDetailed(token);
if (!result.valid) {
    console.error(result.reason); // e.g. "Token has expired"
}
```

## Verification Strategies

### HS256 — Symmetric Secret

Works out of the box with zero dependencies. Uses native `crypto.createHmac` + `crypto.timingSafeEqual`:

```typescript
const verifier = new JwtVerifier({ secret: process.env.JWT_SECRET! });
```

### RS256/ES256 — Public Key

Requires `jose`. Supply a PEM-encoded public key:

```typescript
const verifier = new JwtVerifier({
    publicKey: fs.readFileSync('./public.pem', 'utf8'),
});
```

### JWKS — Auto-Discovery

Requires `jose`. Automatically fetches and caches signing keys:

```typescript
const verifier = new JwtVerifier({
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    issuer: 'https://auth.example.com',
    audience: 'my-api',
});
```

## Claims Validation

All claims are validated after signature verification:

| Claim | Behavior |
|-------|----------|
| `exp` | Rejects expired tokens (with `clockTolerance`, default 60s) |
| `nbf` | Rejects not-yet-valid tokens (with `clockTolerance`) |
| `iss` | Must match `issuer` config (string or array) |
| `aud` | Must match `audience` config (string or array) |
| `requiredClaims` | Custom claims that must be present |

```typescript
const verifier = new JwtVerifier({
    secret: 'my-secret',
    issuer: ['app-a', 'app-b'],     // accept multiple issuers
    audience: 'my-api',
    clockTolerance: 120,             // 2 minutes tolerance
    requiredClaims: ['email', 'sub'], // must have these claims
});
```

## Static Utilities

```typescript
import { JwtVerifier } from '@vinkius-core/mcp-fusion-jwt';

// Decode without verification (for logging/debugging)
const payload = JwtVerifier.decode(token);
// ⚠️ Never trust decoded-only payloads for authorization

// Quick expiration check
const expired = JwtVerifier.isExpired(token, 60);
```

## API Reference

### `JwtVerifier`

| Method | Returns | Description |
|--------|---------|-------------|
| `verify(token)` | `JwtPayload \| null` | Verify and return payload, or `null` |
| `verifyDetailed(token)` | `JwtVerifyResult` | Verify with error reason |
| `JwtVerifier.decode(token)` | `JwtPayload \| null` | Decode without verification |
| `JwtVerifier.isExpired(token)` | `boolean` | Quick expiration check |

### `requireJwt(options)`

Returns a mcp-fusion middleware function.

**Options:**

| Field | Type | Description |
|-------|------|-------------|
| `secret` | `string` | Symmetric secret (HS256) |
| `jwksUri` | `string` | JWKS endpoint URL (requires jose) |
| `publicKey` | `string` | PEM-encoded public key |
| `issuer` | `string \| string[]` | Expected issuer claim |
| `audience` | `string \| string[]` | Expected audience claim |
| `clockTolerance` | `number` | Seconds tolerance for exp/nbf (default: 60) |
| `requiredClaims` | `string[]` | Claims that must be present |
| `extractToken` | `(ctx) => string \| null` | Custom token extraction |
| `onVerified` | `(ctx, payload) => void` | Callback after successful verification |
| `errorCode` | `string` | Custom error code (default: `JWT_INVALID`) |
| `recoveryHint` | `string` | Hint for LLM self-healing |
| `recoveryAction` | `string` | Tool name to suggest |

### `createJwtAuthTool<TContext>(config)`

Returns a `GroupedToolBuilder` with actions: `verify`, `status`.

**Config:** Extends `requireJwt` options plus:

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | `string` | Tool name in MCP (default: `jwt_auth`) |
| `description` | `string` | Tool description for the LLM |
| `tags` | `string[]` | Tags for selective tool exposure |

## Types

```typescript
interface JwtPayload {
    sub?: string;           // Subject (user ID)
    iss?: string;           // Issuer
    aud?: string | string[];// Audience
    exp?: number;           // Expiration (Unix seconds)
    nbf?: number;           // Not before (Unix seconds)
    iat?: number;           // Issued at (Unix seconds)
    jti?: string;           // JWT ID
    [key: string]: unknown; // Additional claims
}

interface JwtVerifyResult {
    valid: boolean;
    payload?: JwtPayload;   // Only when valid
    reason?: string;        // Only when invalid
}

interface JwtVerifierConfig {
    secret?: string;
    jwksUri?: string;
    publicKey?: string;
    issuer?: string | string[];
    audience?: string | string[];
    clockTolerance?: number;     // default: 60
    requiredClaims?: string[];
}
```
