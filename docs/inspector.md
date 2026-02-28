---
title: Inspector — Real-Time Dashboard
description: Zero-overhead real-time terminal dashboard for MCP Fusion servers. Connects via Shadow Socket (IPC) — no stdio interference, no port conflicts, no agent disruption.
---

# Inspector — Real-Time Dashboard

[![npm](https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-inspector?color=blue)](https://www.npmjs.com/package/@vinkius-core/mcp-fusion-inspector) ![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

> Zero-overhead observability for MCP Fusion servers. Connects via **Shadow Socket** (IPC) — no stdio interference, no port conflicts, no agent disruption.

## Why Inspector?

MCP servers communicate over **stdio**, which means traditional debugging tools (`console.log`, debuggers, DevTools) are off-limits — any stdout output corrupts the protocol stream. The Inspector solves this by opening an **out-of-band Shadow Socket** that streams real-time telemetry without touching stdio.

```
┌─────────────────────────────────────────────┐
│  MCP Client (Claude, Cursor, VS Code, etc.) │
│         ↕ stdio (MCP protocol)              │
│  MCP Fusion Server                          │
│         ↕ Shadow Socket (IPC)               │
│  Inspector TUI / stderr logger              │
└─────────────────────────────────────────────┘
```

**Shadow Socket** uses Named Pipes on Windows (`\\.\pipe\mcp-fusion-{hash}`) and Unix Domain Sockets on macOS/Linux (`/tmp/mcp-fusion-{hash}.sock`). The socket path is **deterministic** — derived from a SHA-256 hash of the server's working directory — so the same project always gets the same pipe, even across restarts.

## Quick Start

```bash
# Launch interactive TUI (auto-discovers running server)
npx fusion inspect

# Short alias
npx fusion insp

# Built-in simulator (no server needed — great for demos)
npx fusion insp --demo

# Headless stderr output (ECS / K8s / CI)
npx fusion insp --out stderr

# Connect to a specific server PID
npx fusion insp --pid 12345
```

::: tip Zero Configuration
When launched without flags, the Inspector **auto-discovers** running servers. It first tries the deterministic path for the current working directory, then scans the registry for any available server. If no server is found, it polls every 2 seconds until one appears.
:::

## Connection Modes

| Mode | Command | Use Case |
|------|---------|----------|
| **Auto-discover** | `fusion inspect` | Default — finds the server automatically |
| **By PID** | `fusion insp --pid 12345` | Connect to a specific server process |
| **By path** | `fusion insp --path /tmp/my.sock` | Custom IPC socket/pipe path |
| **Demo** | `fusion insp --demo` | Built-in simulator, no server needed |

### Auto-Discovery Strategy

The Inspector uses a **hybrid discovery** approach:

1. **Local match** — Computes the deterministic socket path from the current working directory and checks if a server is listening there.
2. **Registry scan** — If no local match, scans the registry (`$TMPDIR/mcp-fusion-registry/`) for any available server and connects to the first one found.
3. **Polling** — If no server exists, polls every 2 seconds. When the connection drops, it auto-reconnects transparently.

This design ensures the Inspector works even when your terminal's working directory differs from the server's working directory (e.g., when the IDE launches the server from a different path).

## Dashboard Layout

The TUI is divided into four areas:

```
┌─────────────────────────────────────────────────────┐
│  HEADER BAR: Server name · PID · RAM · Uptime · RPS │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│  TOOL LIST               │  X-RAY INSPECTOR        │
│  Live registry of all    │  Deep inspection of the │
│  registered tools with   │  selected tool's last   │
│  status, latency, type   │  execution              │
│                          │                          │
├──────────────────────────┴──────────────────────────┤
│  TRAFFIC LOG: Real-time color-coded event stream    │
├─────────────────────────────────────────────────────┤
│  STATUS BAR: Keyboard legend                        │
└─────────────────────────────────────────────────────┘
```

### Header Bar

Displays server vitals updated every 5 seconds via heartbeat events:

| Metric | Description |
|--------|-------------|
| **PID** | Server process ID |
| **REQ/S** | Requests per second (rolling average) |
| **RAM** | Heap usage with visual bar (`[█████░░░░░]`) |
| **DLP** | Active DLP redaction count |
| **QUEUE** | Pipeline queue depth / max |
| **ACTIVE** | Active concurrent executions / max |
| **UP** | Server uptime (HH:MM:SS) |

### Tool List

Live tool registry showing every registered tool and action:

| Column | Description |
|--------|-------------|
| **Status** | `✓` ok, `✗` error, `⋯` pending |
| **Tool / Action** | `group.action` qualified name |
| **Type** | `R/O` read-only, `W` write, `🔒` sandboxed, `◆FSM` state-gated |
| **Latency** | Last execution time in ms |

Use `↑↓` or `j/k` to navigate the list. The X-RAY panel updates in real-time to show the selected tool's details.

### Traffic Log

Real-time color-coded event stream — every pipeline stage appears as it happens:

```
19:32:01  ROUTE   billing.createInvoice
19:32:01  ZOD     ✓ 2ms
19:32:01  MW      chain(2)
19:32:01  EXEC    ✓ 45ms
19:32:01  SLICE   4.2KB → 1.1KB (73.8% saved)
19:32:01  DLP     ✖ $.user.email → [REDACTED]
```

## X-RAY Inspector

The right panel provides deep inspection of the selected tool's last execution. Sections appear dynamically based on available data.

### Error Autopsy

When a tool errors, the X-RAY shows:

- **Pipeline stage** where the error occurred (`VALIDATE`, `MIDDLEWARE`, `EXECUTE`)
- **Error message** and stack trace
- **Self-healing hints** (if the server provides them)
- **Last input** — The Zod-validated arguments (pretty-printed JSON)

### Late Guillotine

Token economy metrics from the Presenter's `_select` filtering and data transformation:

```
 LATE GUILLOTINE:
  DB Raw     : 4.2KB
  LLM Wire   : 1.1KB
  SAVINGS    : ████████████████░░░░ 73.8%
```

This section only appears when the action uses a **Presenter** (via `.returns()`). It shows how much data was cut before sending to the AI agent — the "guillotine" that trims raw database data to only what the agent needs.

### Select Reflection

Shows which fields the AI agent requested via `_select`:

```
 SELECT REFLECTION:
  Fields: name, email, role  (3 of 12)
```

### Cognitive Guardrails

When `agentLimit()` truncates large arrays:

```
 [LIM] COGNITIVE GUARDRAIL (Agent Limit):
  Array truncated: 500 -> 50 items
  ↳ Hint: "Results truncated by agentLimit. Use pagination or filters."
```

### DLP Redactions

PII paths masked by the DLP engine:

```
 DLP REDACTIONS:
  x $.user.email -> [REDACTED]
  x $.user.phone -> [REDACTED]
  x $.billing.card_number -> [REDACTED]
```

### Cognitive Rules

System rules injected by the Presenter into the response:

```
 COGNITIVE RULES:
  › Currency values are in cents — divide by 100 for display
  › Dates are in UTC ISO 8601 format
```

### Call History

Rolling log of recent invocations with latency, status, and summary per call.

## Headless Mode (stderr)

For non-TTY environments like containers, CI/CD pipelines, and log aggregation systems, use the `--out stderr` flag:

```bash
# Color-coded stderr stream
fusion insp --out stderr

# Pipe to file
fusion insp --out stderr 2> telemetry.log

# Demo mode with stderr output
fusion insp --out stderr --demo
```

Headless mode outputs structured event logs to stderr with color-coded prefixes. Respects the `NO_COLOR` environment variable.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `k` | Navigate up in tool list |
| `↓` / `j` | Navigate down in tool list |
| `q` / `Ctrl+C` | Exit Inspector |

## Telemetry Events

The Inspector processes all events emitted by the MCP Fusion pipeline:

| Event | Source | Description |
|-------|--------|-------------|
| `topology` | `startServer()` | Tool registry snapshot (initial + hot-reload) |
| `heartbeat` | `startServer()` | PID, heap, uptime (every 5s) |
| `route` | Pipeline | Action routing resolution |
| `validate` | Pipeline | Zod validation result + duration |
| `middleware` | Pipeline | Middleware chain length |
| `execute` | Pipeline | Handler execution result + duration |
| `error` | Pipeline | Exception with recovery hints |
| `presenter.slice` | Presenter | Raw bytes vs. wire bytes (token savings) |
| `presenter.rules` | Presenter | Injected system rules |
| `dlp.redact` | DLP | PII redaction paths |
| `fsm.transition` | FSM Gate | State machine transition (from → to) |
| `sandbox.exec` | Sandbox | Sandboxed execution metrics |
| `governance` | Governance | Policy enforcement events |

## Programmatic API

```typescript
import {
    commandTop,
    streamToStderr,
    startSimulator,
} from '@vinkius-core/mcp-fusion-inspector';

// Launch the interactive TUI
await commandTop({ pid: 12345 });

// Launch the headless stderr logger
await streamToStderr({ pid: 12345 });

// Start the built-in simulator (returns a TelemetryBus)
const bus = await startSimulator({ rps: 5 });
// ... use bus.path to connect TUI or logger
await bus.close();
```

## Enabling Telemetry on Your Server

The Inspector requires telemetry to be enabled on your MCP Fusion server. There are two ways:

### Via `startServer`

```typescript
import { startServer, createToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = createToolRegistry();
// ... register tools ...

const server = await startServer(registry, {
  telemetry: true, // Enables Shadow Socket telemetry
});
```

### Via `createTelemetryBus` (Advanced)

For custom setups, create the telemetry bus manually:

```typescript
import { createTelemetryBus } from '@vinkius-core/mcp-fusion/observability';

const bus = await createTelemetryBus();

// Pass the emit function to your server attachment
registry.attachToServer(server, {
    contextFactory: createContext,
    telemetry: bus.emit,
});

// Cleanup on shutdown
await bus.close();
```

## Troubleshooting

### Inspector doesn't connect

1. **Check if the server is running** with telemetry enabled (`telemetry: true`).
2. **Try specifying the PID** directly: `fusion insp --pid <server-pid>`.
3. **Check for orphan processes** — old server instances may hold stale pipes:
   ```bash
   # List registry entries
   ls $TMPDIR/mcp-fusion-registry/   # macOS/Linux
   dir $env:TEMP\mcp-fusion-registry  # Windows PowerShell
   ```

### Orphan processes

If the IDE closes without killing the server process, orphan servers may remain. Clean them up:

```bash
# Find orphan node processes (look for your server script)
# macOS/Linux
ps aux | grep mcp-fusion

# Windows PowerShell
Get-Process node | Where-Object { $_.MainWindowTitle -eq '' }
```

### Named Pipes vs Unix Sockets

| Platform | Socket Type | Path Pattern |
|----------|-------------|-------------|
| **Windows** | Named Pipe | `\\.\pipe\mcp-fusion-{hash}` |
| **macOS** | Unix Domain Socket | `/tmp/mcp-fusion-{hash}.sock` |
| **Linux** | Unix Domain Socket | `/tmp/mcp-fusion-{hash}.sock` |

The `{hash}` is a deterministic SHA-256 fingerprint of the server's working directory, ensuring each project gets a unique, stable pipe name.

## Installation

```bash
npm install @vinkius-core/mcp-fusion-inspector
```

### Peer Dependency

Requires `@vinkius-core/mcp-fusion` ≥ 3.0.0 (provides `TelemetryEvent` types and `TelemetryBus`).

## Requirements

- **Node.js** ≥ 18.0.0
- **Interactive terminal** (for TUI mode) — use `--out stderr` for non-TTY environments
- **MCP Fusion** ≥ 3.0.0 (peer dependency)
