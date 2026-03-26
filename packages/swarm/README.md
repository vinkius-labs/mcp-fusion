<p align="center">
  <h1 align="center">@vurb/swarm</h1>
  <p align="center">
    <strong>MCP Multi-Agent Orchestration for Vurb.ts</strong> — A framework for creating multi-agent MCP server networks<br/>
    Federated Handoff Protocol · Zero-trust HMAC delegation · Namespace isolation · B2BUA gateway · Claude · Cursor · Copilot
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/swarm"><img src="https://img.shields.io/npm/v/@vurb/swarm?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Multi-Agent Orchestration for Vurb.ts** — the Model Context Protocol framework for building production MCP server networks. `@vurb/swarm` lets a single gateway MCP server dynamically hand off an LLM session to a specialist upstream MCP micro-server — and bring it back — without the LLM ever losing context or the conversation thread.

The gateway acts as a **Back-to-Back User Agent (B2BUA)**:

```
LLM (Claude / Cursor / Copilot)
        │   MCP  (tools/list, tools/call)
        ▼
┌──────────────────┐
│  SwarmGateway    │  ← you run this (the "triage" server)
│  (B2BUA / UAS)   │
└────────┬─────────┘
         │  FHP tunnel  (x-vurb-delegation + traceparent)
         ▼
┌──────────────────┐
│  Upstream server │  ← specialist micro-server (finance, devops, hr…)
│  (UAC target)    │
└──────────────────┘
```

The LLM sees one coherent conversation. Internally, the gateway:

1. Detects a `HandoffResponse` from one of your tools.
2. Mints a **short-lived HMAC-SHA256 delegation token** carrying the carry-over context.
3. Opens an MCP tunnel to the upstream micro-server.
4. Proxies all `tools/list` and `tools/call` through that tunnel, with namespace prefixing.
5. Injects a `gateway.return_to_triage` escape tool so the LLM can come back when done.
6. On return, cleanly closes the tunnel and restores the gateway's original tools.

---

## Installation

```bash
npm install @vurb/swarm @vurb/core
```

---

## Quick start

### 1. Gateway server

```typescript
import { ToolRegistry } from '@vurb/core';
import { SwarmGateway } from '@vurb/swarm';

const gateway = new SwarmGateway({
    registry: {
        finance: 'http://finance-agent:8081',
        devops:  'http://devops-agent:8082',
    },
    delegationSecret: process.env.VURB_DELEGATION_SECRET!,
});

const registry = new ToolRegistry<AppContext>();

// A triage tool that decides which specialist to call
registry.define('triage')
    .action('route', z.object({ intent: z.string() }), async ({ intent }, f) => {
        if (intent.includes('invoice'))
            return f.handoff('finance', {
                reason: 'Routing to finance specialist.',
                carryOverState: { originalIntent: intent },
            });
        return f.text('I can help with that directly.');
    });

registry.attachToServer(server, {
    contextFactory: createContext,
    swarmGateway: gateway,
});
```

### 2. Upstream specialist server

The upstream is a regular Vurb server that uses `requireGatewayClearance` middleware:

```typescript
import { ToolRegistry } from '@vurb/core';
import { requireGatewayClearance } from '@vurb/core';

// Attach the zero-trust middleware — rejects any request without a valid token
app.use('/mcp', requireGatewayClearance({
    secret: process.env.VURB_DELEGATION_SECRET!,
}));

const registry = new ToolRegistry<FinanceContext>();

registry.define('invoices')
    .action('list',   z.object({ status: z.string().optional() }), listInvoices)
    .action('refund', z.object({ invoiceId: z.string() }),         refundInvoice);

// The LLM calls these as: finance.invoices_list, finance.invoices_refund
```

---

## How the FHP works

### Activation flow

```
LLM calls triage.route → HandoffResponse detected by ServerAttachment
    → SwarmGateway.activateHandoff()
        → mintDelegationToken(domain, ttl, secret, carryOverState)
        → UpstreamMcpClient.connect()          (async, non-blocking)
    → LLM receives: HANDOFF_CONNECTING (tools reloading…)
    → notifications/tools/list_changed emitted
    → LLM calls tools/list → SwarmGateway.proxyToolsList()
        → upstream tools prefixed as finance.*
        → gateway.return_to_triage injected
```

### Token lifecycle

| Phase | What happens |
|---|---|
| `mintDelegationToken` | HMAC-SHA256 signed payload: `iss`, `sub`, `iat`, `exp`, `tid`, optional `traceparent` |
| State > 2 KB | Claim-Check: state stored in `HandoffStateStore`, only UUID key in token |
| `requireGatewayClearance` | Verifies HMAC, checks expiry, hydrates carry-over state one-shot |
| Replay or expired | → `EXPIRED_DELEGATION_TOKEN` — explicit rejection, no silent failure |

### Namespace isolation

Every tool from the upstream is automatically prefixed with its domain:

```
upstream: listInvoices  →  gateway exposes: finance.listInvoices
upstream: refund        →  gateway exposes: finance.refund
```

The gateway strips the prefix before forwarding. If a call arrives with a mismatched prefix: `HANDOFF_NAMESPACE_MISMATCH`.

### Return trip

The LLM always sees `gateway.return_to_triage` in the upstream tools list. Calling it:

1. Closes the upstream tunnel.
2. Notifies the gateway to emit `notifications/tools/list_changed`.
3. LLM re-fetches tools and sees the original gateway tools again.

The summary provided by the LLM is **anti-IPI sanitised** before being returned:

- HTML-escaped `<`, `>`, `&`
- `[SYSTEM]` / `[SISTEMA]` patterns blocked
- Hard-truncated at 2000 characters
- Wrapped in `<upstream_report source="finance" trusted="false">` XML envelope

---

## Configuration

```typescript
const gateway = new SwarmGateway({
    // Required
    registry: {
        finance: 'http://finance-agent:8081',
        devops:  'http://devops-agent:8082',
    },
    delegationSecret: process.env.VURB_DELEGATION_SECRET!,

    // Optional
    stateStore:        myRedisStore,      // custom HandoffStateStore (default: in-memory)
    connectTimeoutMs:  5_000,             // upstream connection timeout (default: 5 s)
    idleTimeoutMs:     300_000,           // idle tunnel timeout (default: 5 min)
    tokenTtlSeconds:   60,                // delegation token TTL (default: 60 s)
    upstreamTransport: 'auto',            // 'auto' | 'sse' | 'http' (default: 'auto')
    gatewayName:       'gateway',         // prefix for return_to_triage (default: 'gateway')
    maxSessions:       100,               // concurrent session limit (default: 100)
});
```

### `upstreamTransport`

| Value | Transport | Use when |
|---|---|---|
| `'auto'` | SSE on Node.js, HTTP on edge | Default — works everywhere |
| `'sse'` | SSE (persistent connection) | Long-running sessions, streaming |
| `'http'` | Streamable HTTP (stateless) | Cloudflare Workers, Vercel Edge |

### Custom state store

For Claim-Check tokens (carry-over state > 2 KB) the in-memory default is not suitable for distributed deployments. Implement `HandoffStateStore`:

```typescript
import type { HandoffStateStore } from '@vurb/core';

const redisStore: HandoffStateStore = {
    async set(id, state, ttlSeconds) {
        await redis.set(`vurb:state:${id}`, JSON.stringify(state), { EX: ttlSeconds });
    },
    // Atomic: read + delete in one operation — prevents replay under concurrency
    async getAndDelete(id) {
        const raw = await redis.getdel(`vurb:state:${id}`);
        return raw ? JSON.parse(raw) : undefined;
    },
};

const gateway = new SwarmGateway({
    registry: { finance: '...' },
    delegationSecret: process.env.VURB_DELEGATION_SECRET!,
    stateStore: redisStore,
});
```

> **Important:** External stores must use a native atomic `getAndDelete` (e.g. Redis `GETDEL`) to enforce the one-shot guarantee under high concurrency. Separate `get` + `delete` operations have a race window where two simultaneous verifications of the same token can both succeed.

---

## Security properties

| Property | How it's enforced |
|---|---|
| **Zero-trust upstream** | Every request carries a short-lived HMAC-SHA256 token |
| **One-shot state** | Claim-Check state is atomically deleted on first read |
| **Replay protection** | Expired or consumed `state_id` → `EXPIRED_DELEGATION_TOKEN` |
| **Session isolation** | Each session has its own `UpstreamMcpClient` instance |
| **Session limit** | `maxSessions` prevents resource exhaustion |
| **Zombie prevention** | Idle timeout + AbortSignal cascade close orphan tunnels |
| **IPI mitigation** | Return summaries sanitised + wrapped in `trusted="false"` XML |
| **Namespace enforcement** | Prefix mismatch → `HANDOFF_NAMESPACE_MISMATCH`, never silently routed |
| **Distributed tracing** | W3C `traceparent` generated per handoff, propagated to upstream |

---

## Distributed tracing

Every handoff generates a W3C `traceparent` (`00-{traceId}-{spanId}-01`) that is:

- Embedded in the delegation token as a claim.
- Sent to the upstream via the `traceparent` HTTP header.
- Accessible on the upstream via `ctx.traceparent` (from `requireGatewayClearance`).

This allows you to correlate gateway ↔ upstream spans in any OpenTelemetry-compatible backend.

---

## Lifecycle & cleanup

```typescript
// Graceful shutdown — closes all active tunnels
await gateway.dispose();

// Inspection (useful in tests and monitoring)
gateway.sessionCount;    // total sessions (connecting + active)
gateway.connectingCount; // sessions still establishing connection
gateway.hasActiveHandoff(sessionId);
gateway.isConnecting(sessionId);
```

---

## Target resolution

The `target` in `f.handoff(target, ...)` supports two formats:

```typescript
// Direct registry key (recommended)
f.handoff('finance', { reason: '...' })

// MCP URI (hostname subdomain is matched against registry)
f.handoff('mcp://finance-agent.internal:8080', { reason: '...' })
f.handoff('mcps://finance-agent.internal', { reason: '...' })  // secure
```

---

## Error codes

| Code | When |
|---|---|
| `HANDOFF_CONNECTING` | Upstream is still establishing — retry |
| `HANDOFF_UPSTREAM_UNAVAILABLE` | Upstream dropped mid-session |
| `HANDOFF_NAMESPACE_MISMATCH` | Tool prefix doesn't match active domain |
| `SESSION_LIMIT_EXCEEDED` | `maxSessions` cap reached |
| `REGISTRY_LOOKUP_FAILED` | Unknown `target` in registry |
| `REGISTRY_INVALID_URI` | Registry entry has empty URI |
| `UPSTREAM_CONNECT_TIMEOUT` | Upstream didn't respond within `connectTimeoutMs` |
| `EXPIRED_DELEGATION_TOKEN` | Token expired or Claim-Check state already consumed |

---

## Package layout

| File | Responsibility |
|---|---|
| `SwarmGateway.ts` | B2BUA orchestrator — session lifecycle, proxy routing |
| `UpstreamMcpClient.ts` | Outbound MCP client (SSE/HTTP), idle timer, signal cascade |
| `NamespaceRewriter.ts` | Tool name prefix/unprefix, `NamespaceError` |
| `ReturnTripInjector.ts` | `gateway.return_to_triage` injection + anti-IPI sanitiser |

---

## License

Apache-2.0 © Vinkius
