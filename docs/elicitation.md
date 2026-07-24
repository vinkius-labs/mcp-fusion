# Elicitation — Human-in-the-Loop

LLMs can't ask follow-up questions. When a tool needs user confirmation, a deployment region, or an OAuth token, the handler is stuck — guess, fail, or hard-code.

MCP Elicitation fixes this. MCP Fusion wraps it in a zero-boilerplate DSL: **one import, one call, full type inference**.

> [!IMPORTANT]
> **The first MCP framework where tools can pause, ask the human, and resume — with zero context injection.**
> No `ctx.ask()`. No `request.elicit()`. Just `await ask(...)`, anywhere.

> [!WARNING]
> **`ask()` is deprecated as of the MCP `2026-07-28` protocol revision.** The stateless
> protocol removes the server→client request channel that the imperative `await ask(...)`
> relies on. Use the return-based [`requireInput()` + `readInput()`](#require-input) model
> instead — it is stateless, works on both protocol eras, and runs on serverless/edge.
> `ask()` keeps working on 2025-era and streaming (stdio / sessionful HTTP) connections
> during the deprecation window, so existing code does not break.

- [Quick Start](#quick-start)
- [Return-Based Elicitation (2026-native)](#require-input)
- [How It Works](#how-it-works)
- [The `ask` DSL](#ask-dsl)
- [Field Types](#field-types)
- [Multi-Step Wizards](#wizards)
- [URL Mode (OAuth / Sensitive Data)](#url-mode)
- [Handling Responses](#responses)
- [Transport Compatibility](#transport)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

## Quick Start {#quick-start}

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @mcpfusion/core @modelcontextprotocol/sdk` — or scaffold a project with [`mcpfusion create`](/quickstart-lightspeed).
:::

### Step 1 — Mark the tool as interactive

```typescript
import { initMCPFusion, ask } from '@mcpfusion/core';

interface AppContext { db: PrismaClient; userId: string }
const f = initMCPFusion<AppContext>();

const deploy = f.mutation('infra.deploy')
    .describe('Deploy an application to production')
    .withString('app_id', 'Application ID')
    .interactive()  // ← enables elicitation
    .handle(async (input, ctx) => {
        const prefs = await ask('Confirm deployment settings:', {
            region:  ask.enum(['us-east-1', 'eu-west-1', 'ap-south-1'] as const, 'Region'),
            confirm: ask.boolean('I confirm this deployment'),
        });

        if (prefs.declined) {
            return f.error('CANCELLED', 'Deployment aborted by user.');
        }

        await ctx.db.deployments.create({
            data: { appId: input.app_id, region: prefs.data.region },
        });

        return { deployed: true, region: prefs.data.region };
    });
```

### Step 2 — Register and attach

```typescript
const registry = f.registry();
registry.register(deploy);

registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
```

That's it. When the LLM calls `infra.deploy`, the handler **pauses**, the MCP client renders a form to the user, and the handler **resumes** with the user's response. Zero configuration. Zero context injection.

> [!TIP]
> The MCP client must declare `{ capabilities: { elicitation: {} } }` during initialization. Major clients (Claude Desktop, Cursor, VS Code Copilot) already support this.

## Return-Based Elicitation (2026-native) {#require-input}

The MCP `2026-07-28` protocol is **stateless** — there is no persistent server→client
channel to `await` mid-handler. The 2026-native model is *return-based*: a handler
**returns** `requireInput({...})` to declare the input it needs, and on the client's retry
the handler reads the answers with `readInput()`. The same handler runs on both protocol
eras — on 2025-era connections the framework drives the round-trip for you; on 2026-era
connections the client/SDK drives it.

The field DSL is the **same `ask.*` descriptors** — nothing new to learn.

```typescript
import { initMCPFusion, ask, requireInput, readInput } from '@mcpfusion/core';

interface AppContext { db: PrismaClient; userId: string }
const f = initMCPFusion<AppContext>();

const deploy = f.mutation('infra.deploy')
    .describe('Deploy an application to production')
    .withString('app_id', 'Application ID')
    .interactive()  // ← still opts the tool into elicitation
    .handle(async (input, ctx) => {
        // Read answers from the (possible) retry. `undefined` on the first call.
        const answers = readInput<{ region: string; confirm: boolean }>('deploy');

        if (!answers) {
            // First call — declare the input and return. No `await`, no blocking.
            return requireInput({
                inputRequests: {
                    deploy: requireInput.elicit('Confirm deployment settings:', {
                        region:  ask.enum(['us-east-1', 'eu-west-1', 'ap-south-1'] as const, 'Region'),
                        confirm: ask.boolean('I confirm this deployment'),
                    }),
                },
            });
        }

        // Re-entry — answers are present.
        if (!answers.confirm) return f.error('CANCELLED', 'Deployment aborted by user.');

        await ctx.db.deployments.create({
            data: { appId: input.app_id, region: answers.region },
        });
        return { deployed: true, region: answers.region };
    });
```

### Reading answers

| Reader | Returns |
|---|---|
| `readInput<T>(key)` | The accepted content `T`, or `undefined` when missing / declined / cancelled |
| `inputResponse(key)` | Discriminated view: `{ kind: 'missing' }` or `{ kind: 'elicit', action, content? }` — use for decline/cancel detection |
| `readRequestState<T>()` | The opaque continuation token echoed on the retry (for multi-round flows) |

### Multi-round flows

Because each retry carries only the current round's answers, thread everything you've
learned through `requestState` and switch on it — an explicit state machine, exactly as
the 2026 spec prescribes:

```typescript
const brainstorm = f.action('ideas.brainstorm')
    .interactive()
    .handle(async () => {
        const state = readRequestState<{ step: 'topic' | 'count'; topic?: string }>();

        if (!state) {
            return requireInput({
                inputRequests: { topic: requireInput.elicit('Pick a topic:', { topic: ask.string('Topic') }) },
                requestState: JSON.stringify({ step: 'topic' }),
            });
        }
        if (state.step === 'topic') {
            const topic = readInput<{ topic: string }>('topic')?.topic;
            return requireInput({
                inputRequests: { count: requireInput.elicit('How many ideas?', { count: ask.number('Count').min(1).max(20) }) },
                requestState: JSON.stringify({ step: 'count', topic }),
            });
        }
        const count = readInput<{ count: number }>('count')?.count ?? 3;
        return { topic: state.topic, count };
    });
```

> [!TIP]
> On serverless/edge (stateless JSON HTTP), `requireInput()` is the **only** elicitation
> model that works — the deprecated `await ask(...)` needs a live streaming session. If a
> handler returns `requireInput()` on a connection with no channel to collect input, the
> framework returns a clean `ELICITATION_UNSUPPORTED` error instead of hanging.

### URL mode

```typescript
return requireInput({
    inputRequests: {
        auth: requireInput.url('Authenticate with GitHub to continue:', oauthUrl),
    },
});
// On re-entry:
const view = inputResponse('auth');
if (view.kind === 'elicit' && view.action === 'accept') { /* authenticated */ }
```

## How It Works {#how-it-works}

```
Developer writes:    await ask('message', { name: ask.string() })
                          │
                          ▼
ask.ts               ← Reads transport from AsyncLocalStorage
                          │
                          ▼
ServerAttachment      ← _elicitStore.run(sink, handler)
                          │
                          ▼
MCP SDK               ← extra.sendRequest({ method: 'elicitation/create', ... })
                          │
                          ▼
MCP Client             ← Renders form → User fills → Returns response
                          │
                          ▼
Handler resumes        ← AskResponse<T> with typed .data
```

### Zero-Overhead Architecture

`ask` uses `AsyncLocalStorage` — the same mechanism Node.js uses for `cls-hooked`, Fastify's request context, and OpenTelemetry propagation. The transport is bound once per request in `ServerAttachment` and read by `ask()` anywhere in the call stack.

- **No context pollution**: handlers, middleware, and utilities call `ask()` without any `ctx` parameter.
- **No overhead when unused**: if `.interactive()` is not called, no `AsyncLocalStorage` context is created.
- **Transport-agnostic**: works identically on stdio, SSE, and Streamable HTTP.

## The `ask` DSL {#ask-dsl}

`ask` is a **Callable Namespace** — it's both a function and an object with factory methods:

```typescript
import { ask } from '@mcpfusion/core';

// As a function — send a form to the user
const result = await ask('Choose your preferences:', {
    name:   ask.string('Full name'),
    plan:   ask.enum(['free', 'pro', 'enterprise'] as const, 'Plan'),
    age:    ask.number('Age').min(18).max(120),
    notify: ask.boolean('Enable notifications').default(true),
});

// As a namespace — access field factories
ask.string()     // → AskStringField
ask.number()     // → AskNumberField
ask.boolean()    // → AskBooleanField
ask.enum()       // → AskEnumField

// URL mode — for OAuth/sensitive data
await ask.redirect('Authenticate with GitHub:', 'https://github.com/login/oauth');
```

### Full Type Inference

The return type of `ask()` is **fully inferred** from the field descriptors — no manual generics:

```typescript
const result = await ask('Setup:', {
    name: ask.string(),                          // string
    plan: ask.enum(['free', 'pro'] as const),    // 'free' | 'pro'
    age:  ask.number(),                          // number
    ok:   ask.boolean(),                         // boolean
});

// result.data is { name: string; plan: 'free' | 'pro'; age: number; ok: boolean }
// ↑ fully typed — zero manual annotations
```

## Field Types {#field-types}

### `ask.string(description?)`

```typescript
ask.string()                           // plain string
ask.string('Your full name')           // with label
ask.string('Email').default('a@b.com') // with default
```

### `ask.number(description?)`

```typescript
ask.number()                      // numeric input
ask.number('Age').min(0).max(150) // with constraints
ask.number('Score').default(50)   // with default
```

### `ask.boolean(description?)`

```typescript
ask.boolean()                        // checkbox
ask.boolean('Accept terms')          // with label
ask.boolean('Subscribe').default(true) // pre-checked
```

### `ask.enum(values, description?)`

```typescript
ask.enum(['us', 'eu', 'ap'] as const)           // dropdown
ask.enum(['free', 'pro'] as const, 'Plan')       // with label
ask.enum(['light', 'dark'] as const).default('dark') // with default
```

> [!TIP]
> Always use `as const` with enum arrays — it enables literal type inference (`'free' | 'pro'` instead of `string`).

### Chaining

All field types support `.describe()` and `.default()`:

```typescript
ask.number()
    .describe('Team size')
    .min(1)
    .max(100)
    .default(5)
```

## Multi-Step Wizards {#wizards}

Sequential `ask()` calls create wizard flows — each step can use data from previous steps:

```typescript
const onboard = f.action('user.onboard')
    .interactive()
    .handle(async () => {
        // Step 1 — Basic info
        const step1 = await ask('Welcome! Tell us about yourself:', {
            name:  ask.string('Full name'),
            role:  ask.enum(['developer', 'designer', 'manager'] as const, 'Role'),
        });
        if (step1.declined) return f.error('CANCELLED', 'Onboarding aborted.');

        // Step 2 — Role-specific preferences (uses step1 data)
        const step2 = await ask(`Great, ${step1.data.name}! One more thing:`, {
            theme: ask.enum(['light', 'dark'] as const, 'Preferred theme'),
            newsletter: ask.boolean('Subscribe to newsletter').default(true),
        });
        if (step2.declined) return f.error('CANCELLED', 'Onboarding aborted.');

        return {
            name: step1.data.name,
            role: step1.data.role,
            theme: step2.data.theme,
            newsletter: step2.data.newsletter,
        };
    });
```

Each `await ask(...)` pauses the handler and returns when the user submits. The MCP connection stays alive throughout.

## URL Mode (OAuth / Sensitive Data) {#url-mode}

For authentication flows or sensitive data (passwords, tokens, API keys), use `ask.redirect()`:

```typescript
const connectGithub = f.action('auth.connect_github')
    .interactive()
    .handle(async () => {
        const result = await ask.redirect(
            'Authenticate with GitHub to continue:',
            'https://github.com/login/oauth/authorize?scope=repo',
        );

        if (result.declined) {
            return f.error('AUTH_REQUIRED', 'GitHub authentication is required.');
        }

        return { connected: true };
    });
```

> [!WARNING]
> **Never use `ask()` form fields for passwords, tokens, or secrets.** Form-mode data is JSON and may be logged. Use `ask.redirect()` to send users to a secure HTTPS endpoint instead.

## Handling Responses {#responses}

`ask()` returns an `AskResponse<T>` with boolean guards:

```typescript
const result = await ask('Confirm:', {
    name: ask.string('Name'),
});

// Boolean guards — no string comparisons needed
result.accepted   // true when the user submitted the form
result.declined   // true when the user explicitly refused
result.cancelled  // true when the user dismissed without choosing

// Typed data access
result.data       // { name: string } — only safe when accepted
result.action     // raw string: 'accept' | 'decline' | 'cancel'
```

### Fail-Fast `.data`

Accessing `.data` on a declined or cancelled response **throws** `ElicitationDeclinedError`:

```typescript
// ✘ Dangerous — will throw if user declined
const name = result.data.name;

// ✔ Safe — check first, then access
if (result.declined) {
    return f.error('CANCELLED', 'User declined.');
}
const name = result.data.name; // ← safe
```

This prevents silent `undefined` propagation — a common bug in manual elicitation implementations.

## Transport Compatibility {#transport}

| Transport | Elicitation Support | Notes |
|---|---|---|
| **stdio** | ✅ | Bidirectional by nature |
| **SSE** | ✅ | Requires MCP SDK with `sendRequest` |
| **Streamable HTTP** | ✅ | Per-request `AsyncLocalStorage` — perfect isolation |

`ask()` is transport-agnostic. The `AsyncLocalStorage` context is bound per-request, so concurrent HTTP requests never interfere with each other.

## Testing {#testing}

Test elicitation flows by injecting a mock transport via `_elicitStore`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { _elicitStore } from '@mcpfusion/core/elicitation';
import { ask } from '@mcpfusion/core';

describe('deploy tool — elicitation', () => {
    it('deploys to user-selected region', async () => {
        const mockTransport = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { region: 'eu-west-1', confirm: true },
        });

        const result = await _elicitStore.run(mockTransport, () =>
            registry.routeCall(ctx, 'infra', { action: 'deploy', app_id: 'app_1' }),
        );

        expect(result.isError).toBeFalsy();
        expect(mockTransport).toHaveBeenCalledOnce();

        const call = mockTransport.mock.calls[0][0];
        expect(call.method).toBe('elicitation/create');
    });

    it('handles user decline gracefully', async () => {
        const mockTransport = vi.fn().mockResolvedValue({
            action: 'decline',
        });

        const result = await _elicitStore.run(mockTransport, () =>
            registry.routeCall(ctx, 'infra', { action: 'deploy', app_id: 'app_1' }),
        );

        expect(result.isError).toBe(true);
    });
});
```

## API Reference {#api-reference}

### `ask(message, fields)`

```typescript
function ask<T extends Record<string, AskField<any>>>(
    message: string,
    fields: T,
): Promise<AskResponse<InferAskFields<T>>>
```

| Parameter | Type | Description |
|---|---|---|
| `message` | `string` | Prompt message shown to the user |
| `fields` | `Record<string, AskField>` | Field descriptors defining the form |

Returns `AskResponse<T>` where `T` is inferred from the fields.

### `ask.redirect(message, url)`

```typescript
function redirect(
    message: string,
    url: string,
): Promise<AskResponse<void>>
```

| Parameter | Type | Description |
|---|---|---|
| `message` | `string` | Prompt message shown to the user |
| `url` | `string` | HTTPS URL to redirect the user to |

### `AskResponse<T>`

| Property | Type | Description |
|---|---|---|
| `action` | `ElicitationAction` | Raw action string |
| `accepted` | `boolean` | User submitted the form |
| `declined` | `boolean` | User explicitly refused |
| `cancelled` | `boolean` | User dismissed without choosing |
| `data` | `T` | Submitted data (throws if not accepted) |

### `.interactive()`

```typescript
.interactive(): this
```

Call on any `FluentToolBuilder` or `FluentRouter` to enable elicitation for the tool (or all tools in the router):

```typescript
// Single tool
f.mutation('deploy.start').interactive();

// All tools in a router
f.router('admin').interactive();
```

### Error Classes

| Class | Thrown When |
|---|---|
| `ElicitationUnsupportedError` | `ask()` called outside `.interactive()` handler or client lacks support |
| `ElicitationDeclinedError` | `.data` accessed on a declined/cancelled response |

## Best Practices {#best-practices}

### 1. Always Check Before Accessing `.data`

```typescript
// ✘ Will throw on decline
const name = (await ask('Name?', { name: ask.string() })).data.name;

// ✔ Check the guard first
const result = await ask('Name?', { name: ask.string() });
if (!result.accepted) return f.error('CANCELLED', 'User cancelled.');
const name = result.data.name;
```

### 2. Use `.interactive()` on Routers for Consistent UX

```typescript
// ✔ All admin tools can ask for confirmation
const admin = f.router('admin').interactive();
```

### 3. Keep Forms Small

LLM clients render these forms in a constrained UI. Keep them to 2-4 fields maximum:

```typescript
// ✔ Focused — one question per step
await ask('Choose region:', { region: ask.enum(['us', 'eu'] as const) });

// ✘ Overwhelming — too many fields
await ask('Configure everything:', {
    region: ask.enum([...]),
    theme: ask.enum([...]),
    language: ask.enum([...]),
    timezone: ask.enum([...]),
    currency: ask.enum([...]),
    notifications: ask.boolean(),
    newsletter: ask.boolean(),
});
```

### 4. Never Elicit Sensitive Data via Forms

```typescript
// ✘ Dangerous — API key in JSON form data
await ask('Enter token:', { token: ask.string('API Token') });

// ✔ Secure — redirect to HTTPS endpoint
await ask.redirect('Authenticate:', 'https://auth.example.com/token');
```

### 5. Provide Defaults for Optional Preferences

```typescript
await ask('Preferences:', {
    theme:    ask.enum(['light', 'dark'] as const).default('dark'),
    fontSize: ask.number('Font size').min(10).max(24).default(14),
});
```
