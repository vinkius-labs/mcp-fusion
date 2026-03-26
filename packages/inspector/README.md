<p align="center">
  <h1 align="center">@vurb/inspector</h1>
  <p align="center">
    <strong>MCP Inspector for Vurb.ts</strong> — A framework for creating MCP servers<br/>
    Real-time interactive terminal dashboard for MCP servers · Zero stdio interference · Shadow Socket IPC
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/inspector"><img src="https://img.shields.io/npm/v/@vurb/inspector?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP Inspector for Vurb.ts** — the Model Context Protocol framework for building production MCP servers. Zero-overhead observability: connects via **Shadow Socket** (IPC) — no stdio interference, no port conflicts, no agent disruption.

## Why Inspector?

MCP servers communicate over stdio, which means traditional debugging tools (`console.log`, debuggers) are off-limits. The Inspector solves this by opening an **out-of-band Shadow Socket** (Named Pipe on Windows / Unix Domain Socket on Linux/macOS) that streams real-time telemetry without touching stdio.

```
┌─────────────────────────────────────────────┐
│  MCP Client (Claude, Cursor, etc.)         │
│         ↕ stdio (MCP protocol)             │
│  Vurb.ts Server                         │
│         ↕ Shadow Socket (IPC)              │
│  Inspector TUI / stderr logger              │
└─────────────────────────────────────────────┘
```

## Quick Start

```bash
# Launch interactive TUI (auto-discovers running server)
vurb inspect

# Short alias
vurb insp

# Built-in simulator (no server needed — great for demos)
vurb insp --demo

# Headless stderr output (ECS / K8s / CI)
vurb insp --out stderr

# Connect to a specific server PID
vurb insp --pid 12345
```

## Dashboard Panels

### Topology

Live tool registry showing every registered tool and action with:

| Column | Description |
|--------|-------------|
| Status | `✓` ok, `✗` error, `⋯` pending |
| Tool | `group.action` qualified name |
| Type | `R/O` read-only, `W` write, `🔒` sandboxed, `◆FSM` state-gated |
| Latency | Last execution time in ms |
| Calls | Total invocation count |
| Middleware | Chain length per action |

Tabs: **Tools** · **Prompts** · **Resources**

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

### X-Ray Inspector

Select any tool in the list to see deep inspection in the right panel:

- **Error Autopsy** — Full exception with pipeline stage (`VALIDATE`, `MIDDLEWARE`, `EXECUTE`), self-healing recovery hints
- **Last Input** — Zod-validated arguments (pretty-printed JSON)
- **Select Reflection** — Which fields the AI chose via `_select` (e.g. "3 of 12 fields")
- **Late Guillotine** — Token economy: raw DB bytes vs. wire bytes with savings percentage bar
- **Cognitive Guardrails** — Array truncation from `agentLimit()` (e.g. "500 → 50 items")
- **DLP Redactions** — Masked PII paths (`$.user.email → [REDACTED]`)
- **Cognitive Rules** — System rules injected by the Presenter
- **Call History** — Rolling log with latency, status, and summary per call

### Header Bar

Server name · PID · Heap usage · Uptime · Requests/second

## Telemetry Events

The Inspector processes all events emitted by the Vurb.ts pipeline:

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

## Output Modes

### Interactive TUI (default)

Full-screen terminal dashboard with keyboard navigation.

```bash
Vurb.ts inspect
Vurb.ts insp --demo
```

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `↑` `↓` / `j` `k` | Navigate tool list |
| `q` / `Ctrl+C` | Exit |

### Headless (stderr)

Structured log output for non-TTY environments. Ideal for containers, CI/CD, and log aggregation.

```bash
# Color-coded stderr
Vurb.ts insp --out stderr

# NDJSON format (set env var)
Vurb.ts_LOG_FORMAT=json Vurb.ts insp --out stderr

# Pipe to file
Vurb.ts insp --out stderr | tee telemetry.log
```

Respects `NO_COLOR` environment variable.

## Programmatic API

```typescript
import {
    commandTop,
    streamToStderr,
    startSimulator,
} from '@vurb/inspector';

// Launch the interactive TUI
await commandTop({ pid: 12345 });

// Launch the headless stderr logger
await streamToStderr({ pid: 12345 });

// Start the built-in simulator (returns a TelemetryBus)
const bus = await startSimulator({ rps: 5 });
// ... use bus.path to connect TUI or logger
await bus.close();
```

### Rendering Utilities

Low-level ANSI primitives exported for custom TUI implementations:

```typescript
import {
    ansi,
    ScreenManager,
    box,
    hline,
    pad,
    truncate,
    progressBar,
    stringWidth,
    RingBuffer,
} from '@vurb/inspector';
```

## Installation

```bash
npm install @vurb/inspector
```

### Peer Dependency

Requires `Vurb.ts` ≥ 3.0.0 (provides `TelemetryEvent` types and `TelemetryBus`).

## How It Works

1. **Server side** — `startServer({ telemetry: true })` creates a Shadow Socket (Named Pipe / UDS) and streams `TelemetryEvent` objects as newline-delimited JSON.

2. **Client side** — The Inspector connects to the Shadow Socket, parses events, and updates the TUI state at 15 fps (throttled to prevent flicker).

3. **Auto-discovery** — When no `--pid` or `--path` is specified, the Inspector scans for the well-known IPC path pattern and auto-connects. If no server is found, it polls every 2 seconds. If the connection drops, it auto-reconnects.

## Requirements

- **Node.js** ≥ 18.0.0
- **Interactive terminal** (for TUI mode) — `--out stderr` for non-TTY environments
- **Vurb.ts** ≥ 3.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
