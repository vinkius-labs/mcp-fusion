# Credentials — BYOC (Bring Your Own Credentials)

The Credentials API lets you build **marketplace-publishable MCP servers** that require per-buyer secrets — API keys, tokens, database URIs, OAuth tokens — without ever seeing the raw values in your code.

[[toc]]

## How It Works

```
Buyer configures credentials in Vinkius dashboard
          ↓
Runtime injects them into globalThis.__vinkius_secrets (isolated per request)
          ↓
Your server reads them via requireCredential() — never touches raw values directly
```

Your server declares what it needs. The marketplace prompts the buyer. The runtime delivers secrets. You never write credentials to disk, logs, or env.

## Declaring Credentials

Use `defineCredentials()` to declare your server's requirements. The marketplace reads this at deploy/introspect time:

```typescript
import { defineCredentials } from '@vurb/core'

export const credentials = defineCredentials({
  openai_key: {
    type: 'api_key',
    label: 'OpenAI API Key',
    description: 'Used for GPT-4 completions. Get one at platform.openai.com.',
    required: true,
    sensitive: true,
  },
  database_url: {
    type: 'uri',
    label: 'PostgreSQL Connection URL',
    description: 'postgres://user:pass@host:5432/db',
    required: true,
    sensitive: true,
    validation: {
      pattern: '^postgres(ql)?://',
      message: 'Must be a valid PostgreSQL URI',
    },
  },
  webhook_secret: {
    type: 'token',
    label: 'Webhook Secret (optional)',
    description: 'HMAC secret for verifying incoming webhooks.',
    required: false,
  },
})
```

### Credential Types

| Category | Type | Common use |
|---|---|---|
| **Secrets** | `api_key` | Stripe, SendGrid, Upstash |
| | `token` | OAuth / Bearer — Notion, GitHub, Slack |
| | `password` | MySQL, PostgreSQL, SSH |
| **Connection** | `connection_string` | Structured DB DSN |
| | `uri` | Full URL — `postgres://…`, `redis://…` |
| | `hostname` | Custom domain or IP |
| **Structured** | `json_config` | Service account key, full JSON config |
| | `certificate` | PEM certificates / private keys |
| | `custom` | Anything else |

### Schema Fields

```typescript
interface CredentialSchema {
  type: CredentialType        // One of the 9 types above
  label: string               // Shown in the marketplace UI
  description?: string        // Longer explanation for the buyer
  required?: boolean          // Default: true
  sensitive?: boolean         // Masked in UI and logs — default: true for secrets/connection types
  placeholder?: string        // Example value shown in the input field
  validation?: {
    pattern: string           // Regex pre-check (buyer-side)
    message?: string          // Error shown when pattern fails
  }
}
```

## Reading Credentials at Runtime

Use `requireCredential()` inside your tool handlers:

```typescript
import { requireCredential } from '@vurb/core'
import OpenAI from 'openai'

const summarize = f.action('content.summarize')
  .describe('Summarize text using the buyer's OpenAI key')
  .withString('text', 'Text to summarize')
  .handle(async (input) => {
    const apiKey = requireCredential('openai_key')

    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Summarize: ${input.text}` }],
    })

    return response.choices[0].message.content
  })
```

### Resolution Order

`requireCredential(name)` resolves the credential value in this order:

1. **`globalThis.__vinkius_secrets[name]`** — injected by the runtime on Vinkius Cloud Edge
2. **`process.env[name.toUpperCase()]`** — environment variable fallback (stdio/HTTP local dev)
3. **`options.fallback`** — inline fallback value (testing / mocks)

If a required credential is missing from all three sources, `requireCredential()` throws a descriptive error.

### Options

```typescript
requireCredential(name: string, options?: {
  fallback?: string    // Value used when not found in secrets or env
  required?: boolean   // Default: true — throws when missing; set false to allow undefined
})
```

### Optional Credentials

```typescript
// Returns undefined if not configured — no error thrown
const webhookSecret = requireCredential('webhook_secret', { required: false })

if (webhookSecret) {
  verifyHmac(payload, webhookSecret)
}
```

## Local Development

During local development (`vurb dev`), credentials are read from environment variables. Create a `.env` file:

```dotenv
# maps to credential name 'openai_key'
OPENAI_KEY=sk-proj-...

# maps to 'database_url'
DATABASE_URL=postgres://localhost:5432/mydb
```

> [!TIP]
> Add `.env` to `.gitignore` — never commit real credentials to version control.

Alternatively, pass a `contextFactory` that reads from a secrets manager:

```typescript
registry.attachToServer(server, {
  contextFactory: async () => ({
    // credentials are already injected into globalThis.__vinkius_secrets
    // no extra setup needed for Cloud deployments
  }),
})
```

## Security Architecture

- **Zero-knowledge** — Your seller code never receives raw buyer credentials during marketplace execution. The runtime isolates them.
- **Server-side enforcement** — `vurb deploy` runs a static analysis scan on the bundle. Any attempt to intercept `__vinkius_secrets`, dump `globalThis`, or read `process.env` is rejected with HTTP 422 and a structured violations list.
- **Sensitive by default** — All `api_key`, `token`, `password`, `connection_string`, `uri`, `certificate`, and `json_config` types are `sensitive: true` by default — masked in the UI and excluded from logs.
- **Per-request isolation** — Each runtime request gets its own credential scope. Credentials from one buyer are never visible to another.

> [!CAUTION]
> Never log, return, or embed credential values in tool responses. The runtime will flag this as a security violation.

## Full Example

```typescript
import { defineCredentials, requireCredential, initVurb } from '@vurb/core'
import Stripe from 'stripe'

// 1. Declare what the server needs
export const credentials = defineCredentials({
  stripe_secret_key: {
    type: 'api_key',
    label: 'Stripe Secret Key',
    description: 'Your Stripe secret key (sk_live_... or sk_test_...). Found in the Stripe dashboard.',
    required: true,
    sensitive: true,
    placeholder: 'sk_live_...',
    validation: {
      pattern: '^sk_(live|test)_',
      message: 'Must be a Stripe secret key starting with sk_live_ or sk_test_',
    },
  },
})

const f = initVurb()

// 2. Use the credential inside handlers
const listPayments = f.query('payments.list')
  .describe('List recent Stripe payments')
  .handle(async () => {
    const key = requireCredential('stripe_secret_key')
    const stripe = new Stripe(key)

    const payments = await stripe.paymentIntents.list({ limit: 10 })
    return payments.data.map(p => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
    }))
  })
```

## Publishing to the Marketplace

When you run `vurb deploy`, the introspection system reads `defineCredentials()` and includes the schema in the deploy manifest. The Vinkius marketplace uses this to display a credential configuration form to buyers before activating your server.

Buyers fill in their own secrets → the marketplace stores them encrypted → the runtime injects them on every tool call. Your code stays clean.
