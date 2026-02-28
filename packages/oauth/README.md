<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-oauth</h1>
  <p align="center">
    <strong>OAuth 2.0 Device Flow</strong> — Browser-based authentication for MCP Fusion servers (RFC 8628)
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-oauth"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-oauth?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> OAuth 2.0 Device Authorization Grant (RFC 8628) for MCP servers built with MCP Fusion. Secure token storage, pre-built auth tool, and `requireAuth()` middleware with self-healing error hints.

## Quick Start

```typescript
import { createAuthTool, TokenManager } from '@vinkius-core/mcp-fusion-oauth';
import { ToolRegistry, createTool } from '@vinkius-core/mcp-fusion';

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
import { requireAuth } from '@vinkius-core/mcp-fusion-oauth';

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
npm install @vinkius-core/mcp-fusion-oauth
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
