---
title: OAuth — Device Authorization Grant
description: Drop-in OAuth 2.0 Device Flow (RFC 8628) for MCP servers built with mcp-fusion.
---

# OAuth — Device Authorization Grant

<Badge type="info" text="@vinkius-core/mcp-fusion-oauth" />

OAuth 2.0 Device Authorization Grant ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) for MCP servers built with mcp-fusion.

## Why Device Flow?

MCP servers run as CLI tools, IDE extensions, or background services — environments where browser redirects don't work. The Device Authorization Grant solves this:

1. Server requests a **device code** + **verification URL**
2. User opens the URL in a browser and authorizes
3. Server polls until authorization completes
4. Token is stored securely for future sessions

No redirect URIs. No embedded browsers. Works with any OAuth 2.0 provider.

## Installation

```bash
npm install @vinkius-core/mcp-fusion-oauth
```

Peer dependency: `@vinkius-core/mcp-fusion ^2.0.0`

## Quick Start

### 1. Create the auth tool

```typescript
import { createAuthTool } from '@vinkius-core/mcp-fusion-oauth';
import { ToolRegistry } from '@vinkius-core/mcp-fusion';

const auth = createAuthTool<AppContext>({
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
    tokenManager: {
        configDir: '.myapp',
        tokenFile: 'mcp-token.json',
        envVar: 'MY_APP_TOKEN',
    },
    onAuthenticated: (token, ctx) => {
        ctx.client.setToken(token);
    },
    getUser: async (ctx) => {
        const user = await ctx.client.getMe();
        return { name: user.name, email: user.email };
    },
});

const registry = new ToolRegistry<AppContext>();
registry.register(auth);
```

The auth tool exposes 4 actions:

| Action | Description |
|--------|-------------|
| `login` | Initiates Device Flow — returns verification URL + user code |
| `complete` | Polls until the user authorizes in the browser |
| `status` | Checks current authentication state |
| `logout` | Clears the stored token |

### 2. Protect tools with middleware

```typescript
import { requireAuth } from '@vinkius-core/mcp-fusion-oauth';
import { createTool, success } from '@vinkius-core/mcp-fusion';

const projects = createTool<AppContext>('projects')
    .use(requireAuth({
        extractToken: (ctx) => {
            if (ctx.client.isAuthenticated()) return 'authenticated';
            return null;
        },
        recoveryHint: 'Run auth action=login to authenticate',
        recoveryAction: 'auth',
    }))
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx) => success(await ctx.client.getProjects()),
    });
```

When no token is found, `requireAuth()` returns a structured `toolError('AUTH_REQUIRED')` with recovery hints — enabling the LLM to self-heal by calling the auth tool automatically.

## Standalone Usage

`DeviceAuthenticator` and `TokenManager` work independently of mcp-fusion:

```typescript
import { DeviceAuthenticator, TokenManager } from '@vinkius-core/mcp-fusion-oauth';

const authenticator = new DeviceAuthenticator({
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
});

// Phase 1: Get device code
const code = await authenticator.requestDeviceCode({
    clientId: 'my-client-id',
});
console.log(`Open: ${code.verification_uri_complete}`);
console.log(`Code: ${code.user_code}`);

// Phase 2: Poll until authorized
const token = await authenticator.pollForToken(code);

// Store securely
const manager = new TokenManager({ configDir: '.myapp' });
manager.saveToken(token.access_token);
```

## Token Storage

`TokenManager` stores tokens securely:

- **File location**: `~/.{configDir}/token.json`
- **File permissions**: `0o600` (owner read/write only)
- **Resolution order**: Environment variable → File → `null`
- **Pending codes**: Stored separately with TTL, surviving process restarts

```typescript
const manager = new TokenManager({
    configDir: '.myapp',
    tokenFile: 'mcp-token.json',      // default: 'token.json'
    pendingAuthFile: 'pending.json',   // default: 'pending-auth.json'
    envVar: 'MY_APP_TOKEN',            // optional: env var override
});

// Token lifecycle
const token = manager.getToken();         // env var > file > null
const source = manager.getTokenSource();  // 'environment' | 'file' | null
manager.saveToken('eyJhbGc...');
manager.clearToken();

// Pending device code (survives restarts)
manager.savePendingDeviceCode(codeResponse, 900); // TTL in seconds
const pending = manager.getPendingDeviceCode();    // null if expired
```

## API Reference

### `DeviceAuthenticator`

| Method | Returns | Description |
|--------|---------|-------------|
| `requestDeviceCode(request)` | `DeviceCodeResponse` | Phase 1: Get device code + verification URL |
| `pollForToken(codeResponse, signal?)` | `TokenResponse` | Phase 2: Poll until authorized (respects `slow_down`) |
| `attemptTokenExchange(request)` | `TokenResponse` | Single exchange attempt (manual polling) |

### `TokenManager`

| Method | Returns | Description |
|--------|---------|-------------|
| `getToken()` | `string \| null` | Get token (env var > file) |
| `getTokenSource()` | `'environment' \| 'file' \| null` | Token origin |
| `saveToken(token)` | `void` | Save to `~/{configDir}/token.json` (0o600) |
| `clearToken()` | `void` | Remove saved token |
| `savePendingDeviceCode(code, ttl)` | `void` | Store pending auth state |
| `getPendingDeviceCode()` | `DeviceCodeResponse \| null` | Get pending code (auto-expired) |

### `createAuthTool<TContext>(config)`

Returns a `GroupedToolBuilder` with actions: `login`, `complete`, `status`, `logout`.

**Config:**

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | `string` | OAuth 2.0 client ID |
| `authorizationEndpoint` | `string` | Device authorization URL |
| `tokenEndpoint` | `string` | Token exchange URL |
| `headers?` | `Record<string, string>` | Extra headers for requests |
| `tokenManager` | `TokenManagerConfig` | Storage configuration |
| `onAuthenticated` | `(token, ctx) => void` | Called after successful auth |
| `onLogout?` | `(ctx) => void` | Called on logout |
| `getUser?` | `(ctx) => Promise<UserInfo>` | Fetch user info for status |

### `requireAuth(options?)`

Returns a mcp-fusion middleware function.

**Options:**

| Field | Type | Description |
|-------|------|-------------|
| `extractToken` | `(ctx) => string \| null` | Token extraction function |
| `recoveryHint?` | `string` | Hint for the LLM to self-heal |
| `recoveryAction?` | `string` | Tool name to suggest |

## Types

```typescript
interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
}

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
}

interface TokenManagerConfig {
    configDir: string;
    tokenFile?: string;
    pendingAuthFile?: string;
    envVar?: string;
}

type TokenSource = 'environment' | 'file' | null;
```
