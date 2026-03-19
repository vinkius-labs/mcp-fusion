# Audit Trail

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add audit trail middleware to all billing tools with SHA-256 argument hashing, identity extraction from ctx.user, and a sink that writes to Prisma."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add audit trail middleware to all billing tools with SHA-256 argument hashing, identity extraction from ctx.user, and a sink that writes to Prisma.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+audit+trail+middleware+to+all+billing+tools+with+SHA-256+argument+hashing%2C+identity+extraction+from+ctx.user%2C+and+a+sink+that+writes+to+Prisma." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+audit+trail+middleware+to+all+billing+tools+with+SHA-256+argument+hashing%2C+identity+extraction+from+ctx.user%2C+and+a+sink+that+writes+to+Prisma." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">COMPLIANCE EVIDENCE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Who called what. When. Why.<br><span style="color:rgba(255,255,255,0.25)">SOC2 and GDPR — automatic.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Every tool call is logged with identity, hashed arguments, outcome, and duration. Arguments are SHA-256 hashed — never persisted raw. SOC2 and GDPR evidence, automatically.</div>
</div>

The Audit Trail middleware wraps every tool call with compliance-ready logging. It captures who called what, when, with what arguments (hashed), and what happened — without leaking sensitive data.


## Why Audit Trails Matter {#why}

When an AI agent performs actions on behalf of users, you need answers to six questions:

1. **Who** initiated the action? (identity)
2. **What** action was performed? (tool + action name)
3. **When** did it happen? (timestamp)
4. **What arguments** were passed? (hashed for privacy)
5. **What was the outcome?** (success, error, blocked, rate-limited)
6. **How long** did it take? (performance)

SOC2 auditors ask these questions. GDPR regulators ask these questions. Your incident response team asks these questions at 3 AM. The Audit Trail answers all six automatically.


## How It Works {#how-it-works}

The `auditTrail()` function returns a middleware that wraps the handler execution:

```text
Tool call ──▶ AuditTrail (start) ──▶ Handler ──▶ AuditTrail (end) ──▶ Response
                    │                                   │
                    └─── Extract identity ───────────────┘
                    └─── Hash arguments ─────────────────┘
                    └─── Detect status ──────────────────┘
                    └─── Emit event ─────────────────────┘
```

```typescript
import { auditTrail } from '@vurb/core';

const billing = createTool('billing')
    .use(auditTrail({
        sink: (event) => myAuditStore.append(event),
        extractIdentity: (ctx) => ({
            userId: ctx.userId,
            tenantId: ctx.tenantId,
        }),
    }))
    .action({ name: 'create', handler: async (ctx, args) => { /* ... */ } });
```


## Configuration {#configuration}

```typescript
interface AuditTrailConfig {
    /** Event sink — receives every audit event */
    readonly sink: (event: SecurityAuditEvent) => void | Promise<void>;

    /** Extract identity from context */
    readonly extractIdentity?: (ctx: any) => Record<string, string>;

    /** Hash function override (default: SHA-256) */
    readonly hashFn?: (input: string) => Promise<string>;
}
```

### Minimal Configuration

```typescript
auditTrail({
    sink: (event) => console.log(JSON.stringify(event)),
})
```

### Production Configuration

```typescript
auditTrail({
    sink: async (event) => {
        await prisma.auditLog.create({ data: event });
    },
    extractIdentity: (ctx) => ({
        userId: ctx.user.id,
        tenantId: ctx.user.tenantId,
        role: ctx.user.role,
        ip: ctx.remoteAddress,
    }),
})
```


## Audit Event Structure {#event-structure}

Every tool call produces a `SecurityAuditEvent`:

```typescript
interface SecurityAuditEvent {
    /** Tool name */
    readonly tool: string;

    /** Action name */
    readonly action: string;

    /** ISO 8601 timestamp */
    readonly timestamp: string;

    /** SHA-256 hash of serialized arguments */
    readonly argsHash: string;

    /** Resolved identity from extractIdentity() */
    readonly identity: Record<string, string>;

    /** Outcome: success, error, firewall_blocked, rate_limited */
    readonly status: AuditStatus;

    /** Execution time in milliseconds */
    readonly durationMs: number;
}
```


## SHA-256 Argument Hashing {#hashing}

Arguments are serialized to JSON and hashed with SHA-256. The hash is included in the audit event — **never the raw arguments**:

```typescript
// Input: { userId: "u_42", amount: 5000 }
// Hash:  "a7f5c3d..."
```

This ensures:

- **Privacy** — Raw arguments are never persisted in audit logs
- **Integrity** — The hash proves arguments were not tampered with
- **Forensics** — Given the same arguments, you can verify the hash matches

The default implementation uses the Web Crypto API (`crypto.subtle.digest`). For environments without Web Crypto, provide a custom `hashFn`.


## Identity Extraction {#identity}

The `extractIdentity` function receives the full context and returns a flat record:

```typescript
extractIdentity: (ctx) => ({
    userId: ctx.user.id,
    tenantId: ctx.user.tenantId,
    role: ctx.user.role,
    sessionId: ctx.sessionId,
})
```

When not provided, the identity defaults to `{}`. The function runs before the handler — errors in identity extraction do not block the tool call.


## Status Detection {#status-detection}

The middleware automatically classifies the outcome:

| Status | Condition |
|--------|-----------|
| `success` | Handler returned without `isError` |
| `error` | Handler returned with `isError: true` |
| `firewall_blocked` | Previous middleware returned security error |
| `rate_limited` | Previous middleware returned rate-limit error |

Detection works by inspecting the response metadata after the handler completes.


## SOC2 Mapping {#soc2}

| SOC2 Control | Audit Trail Feature |
|-------|---------------------|
| CC6.1 — Logical Access | `identity` field tracks who accessed what |
| CC6.3 — Access Monitoring | Every tool call is logged with outcome |
| CC7.2 — System Monitoring | `durationMs` tracks performance anomalies |
| CC7.3 — Change Monitoring | `argsHash` provides integrity verification |

The Audit Trail generates the evidence your SOC2 auditor needs — automatically, for every tool call, without developer opt-in per action.


## GDPR Mapping {#gdpr}

| GDPR Article | Audit Trail Feature |
|------|---------------------|
| Art. 5(1)(c) — Data Minimization | Arguments are hashed, not stored raw |
| Art. 25 — Data Protection by Design | PII never leaves the hashing boundary |
| Art. 30 — Records of Processing | Every processing operation is logged |
| Art. 32 — Security of Processing | SHA-256 ensures integrity verification |


## API Reference {#api}

### `auditTrail(config)`

Returns a `MiddlewareFn` that can be applied with `.use()`:

```typescript
const middleware = auditTrail({
    sink: (event) => store.append(event),
    extractIdentity: (ctx) => ({ userId: ctx.userId }),
});

const tool = createTool('billing').use(middleware);
```

### `SecurityAuditEvent`

```typescript
interface SecurityAuditEvent {
    readonly tool: string;
    readonly action: string;
    readonly timestamp: string;
    readonly argsHash: string;
    readonly identity: Record<string, string>;
    readonly status: 'success' | 'error' | 'firewall_blocked' | 'rate_limited';
    readonly durationMs: number;
}
```

### `sha256Hex(input: string): Promise<string>`

Default hashing function using the Web Crypto API. Returns the hex-encoded SHA-256 digest.
