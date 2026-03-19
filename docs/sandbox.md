# Zero-Trust Sandbox Engine

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add a sandboxed computation tool that lets the LLM send JavaScript filter functions to execute on server-side data inside a sealed V8 isolate."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Add a sandboxed computation tool that lets the LLM send JavaScript filter functions to execute on server-side data inside a sealed V8 isolate.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+a+sandboxed+computation+tool+that+lets+the+LLM+send+JavaScript+filter+functions+to+execute+on+server-side+data+inside+a+sealed+V8+isolate." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Add+a+sandboxed+computation+tool+that+lets+the+LLM+send+JavaScript+filter+functions+to+execute+on+server-side+data+inside+a+sealed+V8+isolate." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">COMPUTATION DELEGATION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Data stays on your machine.<br><span style="color:rgba(255,255,255,0.25)">Only the result crosses the boundary.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The LLM sends JavaScript logic to your server. It runs inside a sealed V8 isolate — zero access to <code style="font-size:12px;color:rgba(239,68,68,0.6)">process</code>, <code style="font-size:12px;color:rgba(239,68,68,0.6)">fs</code>, <code style="font-size:12px;color:rgba(239,68,68,0.6)">net</code>. Powered by isolated-vm.</div>
</div>

## The Problem

Every MCP server faces the same tension when an LLM needs to compute over large datasets:

| Approach | Risk |
|---|---|
| Ship raw data to the model | Token cost explosion, data residency violations, context window overflow |
| `eval()` LLM-generated code | Remote code execution — the worst vulnerability class in server security |
| Pre-build every possible filter | Infinite surface area, can't anticipate every LLM reasoning path |

Vurb.ts eliminates all three with **Computation Delegation**: the LLM sends a function, the framework executes it in a sealed V8 isolate, and returns only the result.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  LLM sends:  (data) => data.filter(d => d.risk > 90)              │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Abort?   │──▸│ Guard    │──▸│ Compile  │──▸│ Execute      │    │
│  │ (signal) │   │ (syntax) │   │ (V8)     │   │ (sealed+kill)│    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────┘    │
│                                                                     │
│  ✘ No process  ✘ No require  ✘ No fs  ✘ No net  ✘ No eval escape  │
│  ✔ Timeout kill  ✔ Memory cap  ✔ Output limit  ✔ Isolate recovery  │
│  ✔ AbortSignal kill-switch (Connection Watchdog)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **Pre-flight Abort Check** — if an `AbortSignal` is already aborted (client disconnected), the engine skips all V8 allocation and returns `ABORTED` immediately.
2. **SandboxGuard** — fail-fast syntax check. Rejects non-function code and flags suspicious patterns (`require`, `import`, `process`). This is a speed optimization, not a security boundary.
3. **Compile** — `isolate.compileScript()` parses the code into V8 bytecode.
4. **Execute** — `script.run(context, { timeout })` runs the function asynchronously in a **pristine, empty Context** with no dangerous globals. An abort listener is wired to `isolate.dispose()` — if the signal fires mid-execution, the V8 C++ threads are killed instantly.
5. **Result** — the raw return value is serialized to JSON and size-checked before leaving the isolate.

## Installation

`isolated-vm` is an **optional** peer dependency. Install it only on servers that need sandbox capability:

```bash
npm install isolated-vm
```

> **Note:** `isolated-vm` requires a C++ compiler toolchain (node-gyp). On most systems this is already available. See [isolated-vm installation](https://github.com/nicknisi/isolated-vm#requirements) for platform-specific instructions.

## Quick Start

### Fluent API — `.sandboxed()`

The simplest integration. One method call enables sandboxing on any tool and auto-injects HATEOAS instructions into the tool description, teaching the LLM how to format its code:

```typescript
import { f } from './vurb.js';

export default f.query('data.compute')
    .describe('Run a computation on server-side data')
    .sandboxed({ timeout: 3000, memoryLimit: 64 })
    .withString('expression', 'JavaScript arrow function: (data) => result')
    .handle(async (input, ctx) => {
        const records = await ctx.db.records.findMany();

        const engine = f.sandbox({ timeout: 3000, memoryLimit: 64 });
        try {
            const result = await engine.execute(input.expression, records);

            if (!result.ok) {
                return f.error('VALIDATION_ERROR', result.error)
                    .suggest('Fix the JavaScript expression and retry.')
                    .details({ code: result.code });
            }

            return result.value;
        } finally {
            engine.dispose();
        }
    });
```

When `.sandboxed()` is called, the framework appends a system instruction to the tool description — the LLM receives explicit guidance on how to format its JavaScript function, what restrictions apply, and what return format is expected. This is [HATEOAS auto-prompting](/mva/affordances).

### Standalone Engine

For advanced use cases where you need direct control over the engine lifecycle:

```typescript
import { SandboxEngine } from '@vurb/core';

const engine = new SandboxEngine({
    timeout: 5000,        // Kill after 5 seconds
    memoryLimit: 128,     // 128MB per V8 isolate
    maxOutputBytes: 1_048_576, // 1MB max result
});

try {
    const result = await engine.execute(
        '(data) => data.filter(d => d.risk > 90).map(d => d.name)',
        records,
    );

    if (result.ok) {
        console.log(result.value);       // ['Critical Server A', 'DB Prod']
        console.log(result.executionMs); // 0.42
    } else {
        console.log(result.code);  // 'TIMEOUT' | 'MEMORY' | 'RUNTIME' | ...
        console.log(result.error); // Human-readable explanation
    }
} finally {
    engine.dispose(); // MANDATORY — releases native C++ memory
}
```

### Factory Method — `f.sandbox()`

Create engines from the `initVurb()` instance:

```typescript
const sandbox = f.sandbox({ timeout: 3000, memoryLimit: 64 });
const result = await sandbox.execute('(data) => data.length', [1, 2, 3]);
sandbox.dispose();
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `timeout` | `number` | `5000` | Maximum execution time in milliseconds |
| `memoryLimit` | `number` | `128` | V8 isolate memory limit in MB |
| `maxOutputBytes` | `number` | `1_048_576` | Maximum serialized output size in bytes (1MB) |

## Result Type

Every `execute()` call returns a discriminated union:

```typescript
type SandboxResult<T = unknown> =
    | { ok: true;  value: T;     executionMs: number }
    | { ok: false; error: string; code: SandboxErrorCode };
```

### Error Codes

| Code | Cause | Recovery |
|---|---|---|
| `TIMEOUT` | Script exceeded `timeout` limit | Simplify computation or increase timeout |
| `MEMORY` | V8 isolate ran out of memory | Reduce data size or increase `memoryLimit` |
| `SYNTAX` | JavaScript syntax error in the code | Fix the function expression |
| `RUNTIME` | Script threw during execution (ReferenceError, TypeError, etc.) | Fix the logic or data access |
| `OUTPUT_TOO_LARGE` | Serialized result exceeds `maxOutputBytes` | Use more selective filters |
| `INVALID_CODE` | Failed the SandboxGuard check | Must be a function expression |
| `UNAVAILABLE` | `isolated-vm` not installed or engine disposed | Install the package or create a new engine |
| `ABORTED` | Execution cancelled via `AbortSignal` (client disconnect) | Automatic — no action needed |

## V8 Engineering Rules

These are not guidelines — they are **invariants enforced at the framework level**:

### 1. One Isolate, New Context Per Call

A single V8 `Isolate` is created per `SandboxEngine` instance (~5-10ms boot cost) and reused across all `execute()` calls. Each call creates a **new, pristine `Context`** (~0.1ms) with an empty global scope.

This means:
- No state leaks between executions
- No globals from previous calls
- No prototype pollution persistence

### 2. Mandatory C++ Pointer Release

The bridge between Node.js and the V8 isolate uses native C++ objects (`ExternalCopy`, `Script`, `Context`) that are **not managed by Node's garbage collector**. If a script times out or throws, and the code path skips cleanup, the native memory stays allocated until the process dies.

Vurb.ts enforces cleanup via `try/finally` on **every** code path:

```typescript
let inputCopy, context, script;
try {
    context = await isolate.createContext();
    inputCopy = new ivm.ExternalCopy(data);
    await context.global.set('__input__', inputCopy.copyInto());
    script = await isolate.compileScript(wrappedCode);
    const result = await script.run(context, { timeout });
    // ... process result
} finally {
    // MANDATORY — releases C++ memory regardless of outcome
    try { inputCopy?.release(); } catch { /* isolate may be dead */ }
    try { script?.release(); }    catch { /* isolate may be dead */ }
    try { context?.release(); }   catch { /* isolate may be dead */ }
}
```

### 3. Async-Only Execution

The engine uses `script.run()` (async), never `runSync()`. Even if a sandboxed function runs for the full timeout window (e.g., 5 seconds of computation), the Node.js event loop remains free to handle other requests.

### 4. Automatic Isolate Recovery

If a script triggers an Out-Of-Memory kill, the V8 isolate is destroyed by the engine. On the next `execute()` call, `SandboxEngine` detects `isolate.isDisposed`, discards the dead reference, and creates a fresh Isolate. Zero manual intervention, zero downtime.

## Security Model

The sandbox's security comes from **what's absent**, not what's present:

| Node.js Global | Available in Sandbox? |
|---|---|
| `process` | ✘ |
| `require()` | ✘ |
| `import()` | ✘ |
| `fs` / `net` / `http` | ✘ |
| `child_process` | ✘ |
| `globalThis` (host) | ✘ (isolated `globalThis`) |
| `setTimeout` / `setInterval` | ✘ |
| `Buffer` | ✘ |
| `fetch` | ✘ |

The Context is created empty. No references to the host environment are injected. The only value available to the sandboxed function is `__input__` — a deep-copied snapshot of the data provided by the handler.

### Known Attack Vectors — Mitigated

| Vector | Status | Explanation |
|---|---|---|
| Prototype pollution (`__proto__`) | ✔ Contained | Pollution stays inside the Context, destroyed after execution |
| `constructor.constructor` → `Function` | ✔ Blocked | `Function` exists but `process` doesn't — no escape route |
| `new Function('return process')()` | ✔ Blocked | `process` is `undefined` in the isolate |
| Proxy-based traps | ✔ Contained | Proxy works but can only access isolate-scoped objects |
| `arguments.callee` | ✔ Blocked | Strict mode throws `TypeError` |
| Error stack leakage | ✔ Clean | V8 stack traces contain only isolate-internal references |
| CVE-2022-39266 (CachedData) | ✔ Not applicable | Vurb.ts never uses `CachedDataOptions` |

## SandboxGuard

Before code reaches the V8 isolate, `validateSandboxCode()` performs a fast structural check:

```typescript
import { validateSandboxCode } from '@vurb/core';

const guard = validateSandboxCode('(data) => data.filter(d => d.risk > 90)');
// { ok: true }

const bad = validateSandboxCode('require("fs").readFileSync("/etc/passwd")');
// { ok: false, violation: 'Code contains suspicious pattern: require(...)' }
```

The guard checks:
- Code must be a function expression (arrow or `function`)
- Flags `require()`, `import`, `process`, `eval`, `Function()` patterns
- Rejects non-function statements

> **Important:** The SandboxGuard is a fail-fast optimization, not a security boundary. Security is enforced by the empty V8 Context.

## HATEOAS Auto-Prompting

When `.sandboxed()` is called on a `FluentToolBuilder`, the framework injects a system instruction into the tool's description:

```
[SANDBOX] This tool supports Computation Delegation.
You may send a JavaScript arrow function as a string.
The function receives the data as its only argument.
It executes in a sealed V8 isolate (no process, require, fs, net).

Format: (data) => expression
Do NOT wrap in markdown code blocks.
Return JSON-serializable values only.
```

This follows the HATEOAS principle — the tool's description teaches the LLM what it can do, eliminating the need for global system prompt instructions.

## Best Practices

### Reuse Engines for Hot Paths

Creating an `Isolate` costs ~5-10ms. For endpoints that are called frequently, keep the engine alive:

```typescript
// Module-level — shared across requests
const engine = new SandboxEngine({ timeout: 3000, memoryLimit: 64 });

// In your handler
const result = await engine.execute(input.expression, data);

// Dispose only on server shutdown
process.on('SIGTERM', () => engine.dispose());
```

### Size-Limit Your Data

Transfer all data through `ExternalCopy` (deep clone into V8 heap). Sending 100MB of data will copy 100MB into the isolate. Filter or paginate before sandboxing:

```typescript
// ✘ Bad — 100k records copied into isolate
const all = await ctx.db.records.findMany();
engine.execute(input.fn, all);

// ✔ Good — pre-filter, send only what's needed
const relevant = await ctx.db.records.findMany({
    where: { category: input.category },
    take: 1000,
});
engine.execute(input.fn, relevant);
```

### Handle Errors Structurally

Use the `SandboxResult` discriminated union with `f.error()` for LLM-friendly feedback:

```typescript
const result = await engine.execute(input.expression, data);

if (!result.ok) {
    return f.error('VALIDATION_ERROR', result.error)
        .suggest(result.code === 'TIMEOUT'
            ? 'Simplify the computation or use fewer records.'
            : 'Fix the JavaScript expression and retry.')
        .details({ code: result.code })
        .retryAfter(result.code === 'TIMEOUT' ? 5 : 0);
}

return result.value;
```

## API Reference

### `SandboxEngine`

```typescript
class SandboxEngine {
    constructor(config?: SandboxConfig);
    execute<T>(code: string, data: unknown, options?: { signal?: AbortSignal }): Promise<SandboxResult<T>>;
    dispose(): void;
    get isDisposed(): boolean;
}
```

### `SandboxConfig`

```typescript
interface SandboxConfig {
    timeout?: number;        // default: 5000ms
    memoryLimit?: number;    // default: 128 MB
    maxOutputBytes?: number; // default: 1_048_576 (1MB)
}
```

### `validateSandboxCode(code: string): GuardResult`

```typescript
type GuardResult =
    | { ok: true }
    | { ok: false; violation: string };
```

### `FluentToolBuilder.sandboxed(config?)`

```typescript
f.query('name')
    .sandboxed(config?: SandboxConfig)  // enables sandbox + HATEOAS prompting
    .handle(...)
```

### `f.sandbox(config?)`

```typescript
const engine = f.sandbox({ timeout: 3000 });
// Returns a SandboxEngine instance
```

## Connection Watchdog

When a user closes their MCP client (e.g., Claude Desktop) mid-request, the TCP connection dies — but Node.js doesn't know. The sandbox keeps running an expensive computation that nobody will ever read, leaking CPU cycles and native memory until the timeout fires.

The Connection Watchdog solves this with a **kill-switch**: the MCP SDK propagates an `AbortSignal` through the entire execution pipeline. When the framework detects disconnection, the signal fires and the sandbox calls `isolate.dispose()` — killing the V8 C++ threads **instantly**.

### How It Works

```
┌──────────────┐     AbortSignal      ┌─────────────────┐
│  MCP Client  │────── fires ────────▸│  SandboxEngine   │
│  disconnects │                       │                  │
└──────────────┘                       │  isolate.dispose()│
                                       │  ↓ kills C++ V8  │
                                       │  ↓ returns ABORTED│
                                       │  ↓ auto-recovers │
                                       └─────────────────┘
```

1. **Pre-flight check** — if the signal is already aborted before `execute()` starts, all V8 allocation is skipped entirely. Zero overhead.
2. **Mid-execution kill** — an abort listener calls `isolate.dispose()` during V8 execution. The C++ threads die immediately, the `script.run()` promise rejects, and the engine classifies it as `ABORTED` (not `MEMORY`).
3. **Auto-recovery** — `_ensureIsolate()` detects the dead isolate on the next `execute()` call and creates a fresh one. No manual intervention.
4. **Listener cleanup** — the abort listener is removed in a `finally` block to prevent memory leaks when execution completes normally.

### Usage

```typescript
// The AbortSignal comes from the MCP SDK via the execution context.
// In a handler, it's available on the meta.signal property.
const result = await engine.execute(
    input.expression,
    records,
    { signal: meta.signal }, // Pass the AbortSignal
);
```

Without a signal, `execute()` behaves exactly as before — full backward compatibility.

### Error Classification

The engine distinguishes abort from other failures:

```typescript
const result = await engine.execute(code, data, { signal });

if (!result.ok) {
    switch (result.code) {
        case 'ABORTED':   // Client disconnected — no action needed
            break;
        case 'TIMEOUT':   // Script was too slow
        case 'MEMORY':    // Isolate OOM
            // Genuine resource exhaustion — log for monitoring
            break;
    }
}
```

### Guarantees

| Scenario | Behavior |
|---|---|
| Signal already aborted before `execute()` | Returns `ABORTED` immediately, zero V8 allocation |
| Signal fires during V8 execution | Calls `isolate.dispose()`, returns `ABORTED` |
| Signal fires after execution completes | No-op — listener already removed |
| Multiple aborts on same controller | Idempotent — `dispose()` tolerates double calls |
| Engine auto-recovery after abort | Next `execute()` creates a fresh isolate |
| C++ pointer cleanup after abort | `ExternalCopy`, `Script`, `Context` released in `finally` |
