# Deprecation Registry — MCP 2.0 (2026-07-28) Compliance

MCP Fusion tracks the [MCP specification's feature lifecycle and deprecation policy](https://modelcontextprotocol.io/specification/2026-07-28/deprecated). This page is the authoritative registry of features deprecated by **MCP 2.0** (`2026-07-28` revision) and how MCP Fusion handles each one.

> **MCP 2.0 is the law.** MCP Fusion is fully compatible with MCP 2.0. Everything deprecated in MCP 2.0 is deprecated in MCP Fusion. Deprecated features remain functional during the migration window (earliest removal: **2027-07-28**), but new implementations **SHOULD NOT** adopt them.

## Protocol Version

MCP Fusion defaults to protocol version **`2026-07-28`** (MCP 2.0) in all server metadata, including the [Server Card](/introspection) (`/.well-known/mcp/server-card.json`) and introspection manifest. The previous default (`2025-06-18`) is no longer used for new servers.

## Deprecated Features

| Feature | Deprecated in | SEP | Migration path | Earliest removal | MCP Fusion status |
|---|---|---|---|---|---|
| [Roots](#roots) | `2026-07-28` | [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577) | Pass directories/files via tool parameters, resource URIs, or server configuration | 2027-07-28 | `@deprecated` — not implemented as a first-class API |
| [Sampling](#sampling) | `2026-07-28` | [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577) | Integrate directly with LLM provider APIs | 2027-07-28 | `@deprecated` in YAML capabilities schema |
| [Logging](#logging) | `2026-07-28` | [SEP-2577](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577) | Log to `stderr` for stdio; use [OpenTelemetry](/observability) for observability | 2027-07-28 | Superseded by `TelemetrySink` / `DebugObserver` |
| [Dynamic Client Registration](#dynamic-client-registration) | `2026-07-28` | [PR #2858](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2858) | [Client ID Metadata Documents](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration#client-id-metadata-documents) | 2027-07-28 | Handled by MCP SDK / OAuth package |
| [HTTP+SSE transport](#httpsse-transport) | `2025-03-26` | [SEP-2596](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2596) | [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) | 3 months after SEP-2596 Final | `@deprecated` — use `transport: 'http'` or `'stateless'` |
| [`includeContext` values](#includecontext-values) | `2025-11-25` | [SEP-2596](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2596) | Omit the field or use `"none"` | Follows Sampling | N/A — not exposed by MCP Fusion |

## Removed Features

MCP Fusion 5.0 already **removed** the imperative `ask()` elicitation API (callable form `await ask(...)`) because it depended on the persistent server→client request channel that the MCP 2.0 stateless protocol removes. The `ask.*` field descriptor namespace remains as the supported path for `requireInput.elicit()`.

| Feature | Removed in | Replacement |
|---|---|---|
| Imperative `ask()` callable | MCP Fusion 5.0 (MCP `2026-07-28`) | `requireInput()` + `readInput()` + `ask.*` descriptors |

---

## Details

### Roots

> **Deprecated** as of MCP `2026-07-28` (SEP-2577).

Roots allowed clients to expose filesystem boundaries to servers. MCP 2.0 deprecates this feature — servers should receive directories and files via tool parameters, resource URIs, or server configuration instead.

**MCP Fusion status:** Roots is a client-side feature. MCP Fusion (a server framework) never implemented a first-class Roots API. The `@mcpfusion/yaml` capabilities schema does not expose a `roots` flag. No migration action required for MCP Fusion users.

### Sampling

> **Deprecated** as of MCP `2026-07-28` (SEP-2577).

Sampling allowed servers to request LLM completions from the client. MCP 2.0 deprecates this feature — servers should integrate directly with LLM provider APIs.

**MCP Fusion status:** The `@mcpfusion/yaml` capabilities schema accepts a `sampling: boolean` flag. This flag is now marked `@deprecated` in both the TypeScript types (`YamlCapabilities.sampling`) and the Zod schema (`CapabilitiesSchema`). Existing YAML files with `sampling: true` continue to validate during the migration window. New servers **SHOULD NOT** set this flag — integrate directly with your LLM provider (OpenAI, Anthropic, Google) inside tool handlers instead.

```yaml
# ❌ Deprecated — do not use in new servers
server:
  capabilities:
    sampling: true

# ✅ Recommended — call LLM providers directly in handlers
tools:
  - name: summarize
    execute:
      inline: |
        const resp = await fetch('https://api.openai.com/v1/chat/completions', { ... });
        return await resp.json();
```

### Logging

> **Deprecated** as of MCP `2026-07-28` (SEP-2577).

The MCP `notifications/message` logging utility (server-emitted log levels via `logging/setLevel`) is deprecated. Servers should log to `stderr` for stdio transports and use OpenTelemetry for observability.

**MCP Fusion status:** MCP Fusion never implemented the MCP `notifications/message` logging utility as a first-class API. The framework's observability layer — [`TelemetrySink`](/observability), [`DebugObserver`](/observability), and [OpenTelemetry-compatible tracing](/tracing) — is the recommended migration path and already aligns with MCP 2.0's guidance. No action required.

### Dynamic Client Registration

> **Deprecated** as of MCP `2026-07-28` (PR #2858).

Dynamic Client Registration (RFC 7591) for OAuth is deprecated in favor of Client ID Metadata Documents.

**MCP Fusion status:** OAuth client registration is handled by the `@mcpfusion/oauth` package and the underlying MCP SDK. The framework defers to the SDK's OAuth implementation. No first-class API is exposed for Dynamic Client Registration. Users relying on OAuth should follow the MCP SDK's migration guidance.

### HTTP+SSE transport

> **Deprecated** as of `2025-03-26` (SEP-2596).

The legacy HTTP+SSE transport (separate `/sse` endpoint for streaming) is deprecated in favor of Streamable HTTP.

**MCP Fusion status:** MCP Fusion uses Streamable HTTP (`transport: 'http'`) and the MCP 2.0 stateless transport (`transport: 'stateless'`) via `startServer()`. The legacy `--transport sse` CLI template has been updated to use `startServer({ transport: 'http' })`. Users should migrate from any raw SSE setup to Streamable HTTP.

```typescript
// ✅ MCP 2.0 — Streamable HTTP (stateful sessions)
await startServer({ name: 'api', registry, transport: 'http' });

// ✅ MCP 2.0 — Stateless (per-request, no sessions)
await startServer({ name: 'api', registry, transport: 'stateless' });

// ❌ Deprecated — legacy HTTP+SSE
// Do not use raw SSEServerTransport directly.
```

### includeContext values

> **Deprecated** as of `2025-11-25` (SEP-2596).

The `includeContext: "thisServer"` and `includeContext: "allServers"` values in sampling requests are deprecated. Servers should omit the field or use `"none"`.

**MCP Fusion status:** MCP Fusion does not expose `includeContext` in any API. No action required.

---

## New Features Compliance (MCP 2.0 Additions)

MCP 2.0 (`2026-07-28`) introduced several new features beyond deprecations. The table below tracks MCP Fusion's support for each.

| Feature | MCP 2.0 Status | MCP Fusion Status | Details |
|---|---|---|---|
| **Structured Content** (`structuredContent`) | `MAY` — servers may return structured output | ✅ **Supported** | `successStructured()` helper + `structuredContent` field on `ToolResponse` |
| **Output Schema** (`outputSchema`) | `MAY` — tools may declare output schema | ✅ **Supported** | `outputSchema` in `compileToolDefinition()` wire format; `Tool.outputSchema` domain field |
| **`resultType`** (`"complete"` / `"input_required"`) | `MUST` — all results include `resultType` | ✅ **Via SDK** | MCP SDK v2 Server injects `resultType` automatically; `requireInput()` emits `input_required` |
| **Multi Round-Trip Requests** (MRTR) | `MUST` — replaces server-initiated requests | ✅ **Supported** | `requireInput()` + `readInput()` + `requestState` sealing (SEP-2322) |
| **`server/discover`** | `MUST` — servers must implement (replaces `initialize`) | ✅ **Via SDK** | MCP SDK v2 Server handles `server/discover` automatically |
| **Per-request `_meta` fields** | `MUST` — `io.modelcontextprotocol/*` on every request | ✅ **Via SDK** | MCP SDK v2 Server handles per-request protocol fields |
| **Pagination** (`cursor` / `nextCursor`) | `SHOULD` — list operations should support pagination | ✅ **Supported** | `PromptRegistry.listPrompts()` supports `cursor` / `nextCursor` |
| **List Caching** (`ttlMs` / `cacheScope`) | `MAY` — list responses may include cache hints | ✅ **Supported** | `listCacheTtlMs` / `listCacheScope` in `AttachOptions` (SEP-2549) |
| **`title`** on tools/resources/prompts | `MAY` — optional human-readable display name | ✅ **Supported** | `Tool.title`, `BaseModel.title`, prompt `title` field |
| **`icons`** on tools/resources/prompts | `MAY` — optional visual identifiers | ✅ **Supported** | `Icon` domain model, `createIcon()`, prompt `icons` field |
| **`resource_link`** content type | `MAY` — tool results may link to resources | ✅ **Via SDK** | MCP SDK v2 `ToolResourceLink` type available; referenced in `PromptContentBlock` |
| **`x-mcp-header`** tool parameter annotation | `MAY` — parameters mirrored to HTTP headers | ✅ **Supported** | `.withHeaderParam()` on `FluentToolBuilder` injects `x-mcp-header` into `inputSchema` properties |
| **`resources/templates/list`** | `SHOULD` — resource templates with pagination | ✅ **Supported** | `ResourceRegistry.listResourceTemplates()` + `resources/templates/list` handler in `ServerAttachment` |
| **`subscriptions/listen`** | `SHOULD` — new subscription pattern (replaces `resources/subscribe`) | ✅ **Supported** | `subscriptions/listen` handler in `ServerAttachment` + `SubscriptionManager.registerStream()` with filter-aware routing + `notifications/subscriptions/acknowledged` |
| **JSON Schema 2020-12** default dialect | `MUST` — default dialect when no `$schema` | ✅ **Via SDK** | MCP SDK v2 enforces 2020-12 default; framework schemas are 2020-12 compatible |
| **Error codes** (`-32020` to `-32022`) | `MUST` — new MCP-defined error codes | ✅ **Via SDK** | MCP SDK v2 defines `HeaderMismatch`, `MissingRequiredClientCapability`, `UnsupportedProtocolVersion` |

### Tracked Gaps (Backlog)

**None.** All MCP 2.0 (`2026-07-28`) features are implemented. MCP Fusion is 100% compliant.

---

## Compliance Statement

MCP Fusion is **100% compatible with MCP 2.0** (`2026-07-28`):

1. **Stateless protocol** — `transport: 'stateless'` implements per-request serving with no sessions, no `initialize` handshake, and `Mcp-Method`/`Mcp-Name` header routing.
2. **Return-based elicitation** — `requireInput()` + `readInput()` implements the MCP 2.0 `InputRequiredResult` / `resultType: "input_required"` native model (MRTR pattern).
3. **Request State Sealing** — `requestStateKey` implements SEP-2322 HMAC-sealed state for multi-round elicitation.
4. **List cache hints** — `listCacheTtlMs` / `listCacheScope` implements SEP-2549 `ttlMs` / `cacheScope` directly on result root (MCP 2.0 placement, not inside `_meta`).
5. **Per-request protocol fields** — `_meta.io.modelcontextprotocol/*` fields are handled by the MCP SDK v2 Server.
6. **Structured Content** — `successStructured()` + `structuredContent` on `ToolResponse` (MCP 2.0 structured tool outputs).
7. **Output Schema** — `outputSchema` in `compileToolDefinition()` wire format for schema-validated structured results.
8. **Pagination** — `cursor` / `nextCursor` support on `prompts/list` (extensible to other list operations).
9. **Icons & Titles** — `Icon` domain model, `title` field on tools/resources/prompts.
10. **Deprecated features** — all MCP 2.0 deprecations are mirrored in MCP Fusion with `@deprecated` markers and migration guidance. No deprecated feature is adopted as a first-class API in new code.
11. **Protocol version** — defaults to `2026-07-28` in all server metadata (Server Card, introspection manifest).
12. **`x-mcp-header`** — `.withHeaderParam()` on `FluentToolBuilder` marks parameters for HTTP header mirroring on Streamable HTTP transport.
13. **`resources/templates/list`** — `ResourceRegistry.listResourceTemplates()` + handler registration for URI template resources with pagination.
14. **`subscriptions/listen`** — MCP 2.0 stream-based subscription pattern with `SubscriptionFilter` (toolsListChanged, promptsListChanged, resourcesListChanged, resourceSubscriptions), `notifications/subscriptions/acknowledged`, and per-stream `subscriptionId` correlation.

**Zero tracked gaps. 100% MCP 2.0 compliance.**