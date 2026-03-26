<p align="center">
  <h1 align="center">@vurb/oauth</h1>
  <p align="center">
    <strong>MCP OAuth 2.0 Authentication for Vurb.ts</strong> — A framework for creating secure MCP servers<br/>
    RFC 8628 Device Flow · Secure token storage · Drop-in auth tool · Provider-agnostic
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/oauth"><img src="https://img.shields.io/npm/v/@vurb/oauth?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP OAuth 2.0 Authentication for Vurb.ts** — the Model Context Protocol framework for building production MCP servers. RFC 8628 Device Authorization Grant, secure token storage (0o600 permissions), pre-built auth tool, and `requireAuth()` middleware with self-healing error hints.

## Quick Start

```typescript
import { createAuthTool, TokenManager } from '@vurb/oauth';
import { ToolRegistry, createTool } from '@vurb/core';

const auth = createAuthTool({
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
    tokenManager: { configDir: '.myapp', envVar: 'MY_APP_TOKEN' },
    onAuthenticated: (token, ctx) => ctx.setToken(token),
    getUser: async (ctx) => ctx.getMe(),
});

const registry = new ToolRegistry();
registry.register(auth);
```

## Features

| Feature | Description |
|---------|-------------|
| **Device Flow (RFC 8628)** | Browser-based authentication for CLI/MCP tools |
| **Secure Token Storage** | 0o600 permissions, env-var priority |
| **Pre-built Auth Tool** | Drop-in `createAuthTool()` with login, complete, status, logout |
| **requireAuth Middleware** | Guard with self-healing error hints |
| **Provider Agnostic** | Works with any OAuth 2.0 server supporting device flow |

## requireAuth Middleware

```typescript
import { requireAuth } from '@vurb/oauth';

const projects = createTool('projects')
    .use(requireAuth({
        extractToken: (ctx) => ctx.token,
    }))
    .action({ name: 'list', handler: async (ctx) => { ... } });
```

## API

### `DeviceAuthenticator`

| Method | Description |
|--------|-------------|
| `requestDeviceCode(request)` | Phase 1: Get device code + verification URL |
| `pollForToken(codeResponse, signal?)` | Phase 2: Poll until authorized (with `slow_down` respect) |
| `attemptTokenExchange(request)` | Single exchange attempt (manual polling) |

### `TokenManager`

| Method | Description |
|--------|-------------|
| `getToken()` | Get token (env var > file) |
| `getTokenSource()` | Returns `'environment'`, `'file'`, or `null` |
| `saveToken(token)` | Save to `~/{configDir}/token.json` (0o600) |
| `clearToken()` | Remove saved token |

### `createAuthTool(config)`

Returns a `GroupedToolBuilder` with 4 actions: `login`, `complete`, `status`, `logout`.

## Installation

```bash
npm install @vurb/oauth
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
