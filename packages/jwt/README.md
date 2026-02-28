<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-jwt</h1>
  <p align="center">
    <strong>JWT Verification Middleware</strong> — Standards-compliant token validation for MCP Fusion servers
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-jwt"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-jwt?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> JWT verification middleware for MCP servers built with MCP Fusion. Timing-safe validation with `jose`, JWKS auto-discovery, and self-healing error responses.

## Quick Start

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { jwtGuard } from '@vinkius-core/mcp-fusion-jwt';

const f = initFusion<AppContext>();

const withJwt = jwtGuard({
    secret: process.env.JWT_SECRET!,
    algorithms: ['HS256'],
});

export default f.query('billing.invoices')
    .use(withJwt)
    .handle(async (input, ctx) => {
        // ctx.jwt contains the decoded payload
        return db.invoices.findMany({ where: { tenantId: ctx.jwt.sub } });
    });
```

## Features

| Feature | Description |
|---------|-------------|
| **Algorithms** | HS256, RS256, ES256 — all standard algorithms via `jose` |
| **JWKS** | Auto-discovery from `/.well-known/jwks.json` with key rotation |
| **Self-Healing** | Expired/invalid tokens return actionable hints to the LLM agent |
| **Timing-Safe** | Constant-time signature verification |
| **Zero Config** | Works with Auth0, Clerk, Supabase, Firebase, any OIDC provider |

## JWKS Auto-Discovery

```typescript
const withJwt = jwtGuard({
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    issuer: 'https://auth.example.com/',
    audience: 'my-mcp-server',
});
```

## Installation

```bash
npm install @vinkius-core/mcp-fusion-jwt jose
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |
| `jose` | `^5.0.0` (optional) |

## Requirements

- **Node.js** ≥ 18.0.0
- **MCP Fusion** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE)
