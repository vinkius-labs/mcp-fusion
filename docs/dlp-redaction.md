---
outline: deep
---

# DLP Compliance Engine — PII Redaction

Every MCP server that touches user data faces a critical risk: if a tool returns raw database records, **Personally Identifiable Information (PII)** flows through JSON-RPC directly to the LLM provider's servers. One leaked field — a Social Security number, a credit card, a medical diagnosis — can trigger **millions in GDPR / LGPD / HIPAA fines**.

MCP Fusion's DLP engine makes data leakage **physically impossible** at the framework level. Sensitive fields are structurally masked before the JSON ever leaves the Presenter — the LLM receives `[REDACTED]` instead of the real value.

> [!IMPORTANT]
> **GDPR / LGPD / HIPAA Compliant by Design.**
> Once `.redactPII()` is configured, it is impossible for a developer to accidentally expose sensitive data through the MCP wire format. The framework guarantees zero-leak at the structural level.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Boot / .redactPII() call                       │
│                                                  │
│  ['*.ssn', 'credit_card.number']                │
│       │                                          │
│       ▼                                          │
│  fast-redact({ paths, censor, serialize: false })│
│       │                                          │
│       ▼                                          │
│  Compiled RedactFn (V8-optimized)               │
│  Cached per Presenter instance                  │
└──────────────────────────────────────────────────┘

     ┌──────────────────────────────────────────┐
     │  Presenter.make() — at response time     │
     │                                          │
     │  Original Data ──► structuredClone() ──► │
     │  Cloned Data ──► RedactFn() ──►         │
     │  Sanitized wireData → ResponseBuilder   │
     │                                          │
     │  UI blocks & rules see FULL data ✔      │
     │  LLM receives REDACTED data ✔           │
     └──────────────────────────────────────────┘
```

### Late Guillotine Pattern

Redaction is applied **after** UI blocks and system rules have been computed from the original, unmasked data. Only the final wire payload — what the LLM actually sees — is sanitized.

This means:
- UI blocks can reference `item.ssn` for formatting decisions without exposing it
- System rules can use full data for business logic
- The LLM never sees the raw value

## Installation

`fast-redact` is an **optional** peer dependency. Install it only on servers that handle PII:

```bash
npm install fast-redact
```

> **Note:** `fast-redact` is the same redaction engine used by [Pino](https://github.com/pinojs/pino), the fastest Node.js logger. It compiles object paths into V8-optimized functions at configuration time, achieving near-zero overhead on the hot path.

If `fast-redact` is not installed, the framework logs a warning and passes data through unmodified — no crashes, no surprises.

## Quick Start

### Fluent API — `.redactPII()`

One method call. The framework compiles the redaction function at configuration time and applies it automatically on every `make()` call:

```typescript
import { createPresenter, t, ui } from '@vinkius-core/mcp-fusion';

export const PatientPresenter = createPresenter('Patient')
    .schema({
        name: t.string,
        ssn: t.string,
        diagnosis: t.string,
        email: t.string,
    })
    .redactPII(['ssn', 'diagnosis', 'email'])
    .ui((item) => [
        ui.markdown(`**Patient:** ${item.name}`),
        // item.ssn is available here for UI logic
        // but the LLM receives { ssn: '[REDACTED]' }
    ]);
```

The LLM receives:

```json
{
    "name": "Alice Johnson",
    "ssn": "[REDACTED]",
    "diagnosis": "[REDACTED]",
    "email": "[REDACTED]"
}
```

### Custom Censor

Replace `[REDACTED]` with a custom mask:

```typescript
// String censor
.redactPII(['credit_card.number'], '****-****-****-****')

// Function censor — partial masking
.redactPII(['credit_card.number'], (value) =>
    '****-' + String(value).slice(-4)
)
// Result: { credit_card: { number: '****-1234' } }
```

### Declarative API — `definePresenter()`

For teams that prefer configuration objects over the fluent chain:

```typescript
import { definePresenter } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const EmployeePresenter = definePresenter({
    name: 'Employee',
    schema: z.object({
        name: z.string(),
        ssn: z.string(),
        salary: z.number(),
    }),
    redactPII: {
        paths: ['ssn', 'salary'],
        censor: '***',
    },
    ui: (item) => [
        { type: 'text', text: `Employee: ${item.name}` },
    ],
});
```

## Path Syntax

Paths follow the [`fast-redact` path syntax](https://github.com/davidmarkclements/fast-redact#paths--array):

| Syntax | Example | Matches |
|---|---|---|
| Dot notation | `'user.ssn'` | `{ user: { ssn: '...' } }` |
| Bracket notation | `'user["ssn"]'` | Same as dot notation |
| Wildcards | `'*.ssn'` | Any object with an `ssn` field |
| Array items | `'patients[*].diagnosis'` | Every item in the `patients` array |
| Array index | `'items[0].secret'` | Specific array index |
| Nested wildcards | `'records[*].contact.email'` | Deep nested fields in arrays |

## Configuration

### `RedactConfig`

```typescript
interface RedactConfig {
    /**
     * Array of object paths to redact.
     * Supports dot notation, bracket notation, wildcards.
     */
    paths: string[];

    /**
     * Replacement value or function.
     * @default '[REDACTED]'
     */
    censor?: string | ((value: unknown) => string);
}
```

### Fluent Methods

```typescript
// Full config
presenter.redactPII(paths: string[], censor?: string | ((v: unknown) => string))

// Alias
presenter.redact(paths: string[], censor?: string | ((v: unknown) => string))
```

Both methods return `this` for chaining.

## Boot-Time Initialization

For maximum performance, pre-load `fast-redact` at application bootstrap:

```typescript
import { initRedactEngine } from '@vinkius-core/mcp-fusion';

// Call once at boot — loads fast-redact into memory
await initRedactEngine();
```

This ensures the dynamic `import('fast-redact')` is resolved before the first request hits, avoiding any first-call latency.

## Standalone Usage

Use `compileRedactor()` directly when you need redaction outside the Presenter pipeline:

```typescript
import { compileRedactor } from '@vinkius-core/mcp-fusion';

const redact = await compileRedactor({
    paths: ['*.password', 'users[*].token'],
    censor: '***',
});

if (redact) {
    const sanitized = redact(sensitiveData);
    // sensitiveData is now mutated — passwords and tokens are '***'
}
```

> **Warning:** Unlike the Presenter integration, `compileRedactor()` mutates the object in-place. Use `structuredClone()` if you need to preserve the original.

## GDPR Compliance Matrix

| Requirement | How MCP Fusion Addresses It |
|---|---|
| **Data Minimization** (Art. 5.1c) | `.redactPII()` ensures only non-sensitive fields reach the LLM |
| **Purpose Limitation** (Art. 5.1b) | Redaction is structural — PII never leaves the server boundary |
| **Security of Processing** (Art. 32) | V8-compiled `fast-redact` operates at the framework level, not application code |
| **Data Protection by Design** (Art. 25) | Zero-leak guarantee — the developer cannot accidentally bypass redaction |
| **Right to Erasure** (Art. 17) | Sensitive data never reaches third-party systems, simplifying deletion obligations |
| **Cross-Border Transfer** (Art. 44-49) | PII stays on-premise — only masked values cross the network boundary |

### LGPD (Brazil)

| Requirement | Coverage |
|---|---|
| **Adequação** (Art. 6.II) | Data processing limited to declared purpose — PII blocked at source |
| **Necessidade** (Art. 6.III) | Minimum data exposed to LLM through structural redaction |
| **Segurança** (Art. 6.VII) | Framework-level enforcement, not developer discipline |
| **Prevenção** (Art. 6.VIII) | Proactive leak prevention by design |

### HIPAA (US Healthcare)

| Requirement | Coverage |
|---|---|
| **Minimum Necessary** (§164.502(b)) | Only non-PHI fields reach the LLM |
| **Access Controls** (§164.312(a)) | PII structurally inaccessible in the wire format |
| **Transmission Security** (§164.312(e)) | Sensitive fields masked before network transmission |

## Integration with Existing Features

### With Sandbox Engine

```typescript
f.query('patients.analyze')
    .sandboxed({ timeout: 3000 })
    .returns(
        createPresenter('PatientAnalysis')
            .schema({ name: t.string, ssn: t.string, riskScore: t.number })
            .redactPII(['ssn'])
    )
    .handle(async (input, ctx) => {
        // The LLM-generated sandbox code sees full data
        // But the Presenter masks SSN before the response
        return patients;
    });
```

### With AOT Serialization

Redaction and AOT serialization compose naturally. The pipeline is:

```
Data → structuredClone → redact → AOT stringify → Wire
```

### With Middleware

```typescript
f.use(async (ctx, next) => {
    // Middleware sees full data
    await next();
    // Response is already redacted by Presenter.make()
});
```

## Best Practices

### 1. Redact at the Presenter Level

Always configure redaction on the Presenter, not in the handler. This ensures redaction is applied consistently across all tool invocations:

```typescript
// ✔ Good — framework-enforced, impossible to forget
const presenter = createPresenter('User')
    .schema({ name: t.string, ssn: t.string })
    .redactPII(['ssn']);

// ✘ Bad — manual, easy to forget in one handler
const data = await db.users.find();
data.forEach(u => u.ssn = '[REDACTED]'); // fragile
```

### 2. Use Wildcards for Cross-Cutting Fields

If multiple objects share a field name (e.g., `email`), use wildcards:

```typescript
.redactPII(['*.email', '*.phone', '*.ssn'])
```

### 3. Pre-Load at Boot

Call `initRedactEngine()` during application startup to avoid first-request latency:

```typescript
import { initFusion, initRedactEngine } from '@vinkius-core/mcp-fusion';

await initRedactEngine();
const server = initFusion({ /* ... */ });
```

### 4. Audit Your Redaction Paths

Maintain a centralized list of PII fields for your organization:

```typescript
// config/pii-fields.ts
export const PII_PATHS = [
    '*.ssn',
    '*.email',
    '*.phone',
    '*.date_of_birth',
    '*.credit_card',
    'patients[*].diagnosis',
    'employees[*].salary',
] as const;

// In your Presenters
import { PII_PATHS } from '../config/pii-fields.js';

createPresenter('Employee')
    .schema(employeeSchema)
    .redactPII([...PII_PATHS]);
```

## API Reference

### `createPresenter().redactPII(paths, censor?)`

```typescript
redactPII(
    paths: string[],
    censor?: string | ((value: unknown) => string)
): this
```

Configures PII redaction for the Presenter. Compiles the redaction function at configuration time using `fast-redact`.

### `createPresenter().redact(paths, censor?)`

Alias for `.redactPII()`.

### `compileRedactor(config)`

```typescript
async function compileRedactor(config: RedactConfig): Promise<RedactFn | undefined>
```

Compiles a standalone redaction function. Returns `undefined` if `fast-redact` is not installed.

### `initRedactEngine()`

```typescript
async function initRedactEngine(): Promise<boolean>
```

Pre-loads the `fast-redact` module into memory. Returns `true` if successful, `false` if the module is not available.

### `RedactConfig`

```typescript
interface RedactConfig {
    paths: string[];
    censor?: string | ((value: unknown) => string);
}
```

### `RedactFn`

```typescript
type RedactFn = (data: Record<string, unknown>) => Record<string, unknown>;
```
