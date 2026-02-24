# @vinkius-core/mcp-fusion-oauth

OAuth 2.0 Device Authorization Grant (RFC 8628) for MCP servers built with [mcp-fusion](https://github.com/vinkius-labs/mcp-fusion).

## Features

- **Device Flow (RFC 8628)** — Browser-based authentication for CLI/MCP tools
- **Secure Token Storage** — 0o600 permissions, env-var priority
- **Pre-built Auth Tool** — Drop-in `createAuthTool()` with login, complete, status, logout
- **Middleware** — `requireAuth()` guard with self-healing error hints
- **Provider Agnostic** — Works with any OAuth 2.0 server that supports device flow

## Quick Start

```ts
import { createAuthTool, TokenManager } from '@vinkius-core/mcp-fusion-oauth';
import { ToolRegistry, createTool } from '@vinkius-core/mcp-fusion';

// 1. Create auth tool
const auth = createAuthTool({
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
    tokenManager: { configDir: '.myapp', envVar: 'MY_APP_TOKEN' },
    onAuthenticated: (token, ctx) => ctx.setToken(token),
    getUser: async (ctx) => ctx.getMe(),
});

// 2. Register
const registry = new ToolRegistry();
registry.register(auth);
```

## requireAuth Middleware

```ts
import { requireAuth } from '@vinkius-core/mcp-fusion-oauth';

const projects = createTool('projects')
    .use(requireAuth({
        extractToken: (ctx) => ctx.token,
    }))
    .action({ name: 'list', handler: async (ctx) => { ... } });
```

## Standalone Usage

```ts
import { DeviceAuthenticator, TokenManager } from '@vinkius-core/mcp-fusion-oauth';

const auth = new DeviceAuthenticator({
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
});

const code = await auth.requestDeviceCode({ clientId: 'my-client-id' });
console.log(`Open: ${code.verification_uri_complete}`);

const token = await auth.pollForToken(code);
new TokenManager({ configDir: '.myapp' }).saveToken(token.access_token);
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
| `savePendingDeviceCode(code, ttl)` | Store pending auth state |
| `getPendingDeviceCode()` | Get pending code (auto-expired) |

### `createAuthTool(config)`

Returns a `GroupedToolBuilder` with 4 actions: `login`, `complete`, `status`, `logout`.

### `requireAuth(options?)`

Returns a mcp-fusion middleware function that rejects unauthenticated requests with `toolError('AUTH_REQUIRED')`.

## License

Apache-2.0 — Vinkius Labs
