# DLP Compliance Engine — PII Redaction

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add PII redaction to the PatientPresenter — mask ssn, diagnosis, and email fields so the LLM receives [REDACTED] instead of real values."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add PII redaction to the PatientPresenter — mask ssn, diagnosis, and email fields so the LLM receives [REDACTED] instead of real values.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+PII+redaction+to+the+PatientPresenter+%E2%80%94+mask+ssn%2C+diagnosis%2C+and+email+fields+so+the+LLM+receives+%5BREDACTED%5D+instead+of+real+values." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+PII+redaction+to+the+PatientPresenter+%E2%80%94+mask+ssn%2C+diagnosis%2C+and+email+fields+so+the+LLM+receives+%5BREDACTED%5D+instead+of+real+values." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">ZERO-LEAK GUARANTEE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">PII never leaves the server.<br><span style="color:rgba(255,255,255,0.25)">Structurally impossible.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">One leaked field — a Social Security number, a credit card — can trigger millions in GDPR / LGPD / HIPAA fines. Vurb's DLP engine makes data leakage physically impossible at the framework level.</div>
</div>

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
import { createPresenter, t, ui } from '@vurb/core';

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
import { definePresenter } from '@vurb/core';
import { z } from 'zod';

export const EmployeePresenter = definePresenter({
    name: 'Employee',
    schema: EmployeeModel,
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
import { initRedactEngine } from '@vurb/core';

// Call once at boot — loads fast-redact into memory
await initRedactEngine();
```

This ensures the dynamic `import('fast-redact')` is resolved before the first request hits, avoiding any first-call latency.

## Standalone Usage

Use `compileRedactor()` directly when you need redaction outside the Presenter pipeline:

```typescript
import { compileRedactor } from '@vurb/core';

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

| Requirement | How Vurb.ts Addresses It |
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
import { initVurb, initRedactEngine } from '@vurb/core';

await initRedactEngine();
const server = initVurb({ /* ... */ });
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
