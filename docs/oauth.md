---
title: OAuth — Device Authorization Grant
description: Drop-in OAuth 2.0 Device Flow (RFC 8628) for MCP servers built with Vurb.ts.
---
<a href="https://www.npmjs.com/package/@vurb/oauth"><img src="https://img.shields.io/npm/v/@vurb/oauth?color=blue" alt="npm" /></a>

# OAuth — Device Authorization Grant

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add OAuth device flow authentication to my MCP server using @vurb/oauth — with automatic token refresh, persistent storage, and an auth tool for the AI agent."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add OAuth device flow authentication to my MCP server using @vurb/oauth — with automatic token refresh, persistent storage, and an auth tool for the AI agent.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+OAuth+device+flow+authentication+to+my+MCP+server+using+%40vurb%2Foauth+%E2%80%94+with+automatic+token+refresh%2C+persistent+storage%2C+and+an+auth+tool+for+the+AI+agent." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+OAuth+device+flow+authentication+to+my+MCP+server+using+%40vurb%2Foauth+%E2%80%94+with+automatic+token+refresh%2C+persistent+storage%2C+and+an+auth+tool+for+the+AI+agent." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">DEVICE FLOW</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">No redirect URIs. No browsers.<br><span style="color:rgba(255,255,255,0.25)">RFC 8628 for MCP servers.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">OAuth 2.0 Device Authorization Grant for headless MCP servers. The server requests a device code, the user authorizes in a browser, and the token is stored for future sessions.</div>
</div>


```bash
npm install @vurb/oauth
```

Peer dependency: `Vurb.ts ^2.0.0`

## Create the Auth Tool

```typescript
import { createAuthTool } from '@vurb/oauth';
import { ToolRegistry } from '@vurb/core';

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

## Protect Tools with Middleware

```typescript
import { requireAuth } from '@vurb/oauth';
import { createTool, success } from '@vurb/core';

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

`DeviceAuthenticator` and `TokenManager` work independently of Vurb.ts:

```typescript
import { DeviceAuthenticator, TokenManager } from '@vurb/oauth';

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

Returns a Vurb.ts middleware function.

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

## Other Authentication Methods {#other-auth}

| Method | Guide |
|---|---|
| JWT bearer token verification | [JWT Verification](/jwt) |
| Static API key validation | [API Key Validation](/api-key) |
| Security overview — all layers | [Security](/security/) |
