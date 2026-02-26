---
title: "Blast Radius Analysis"
description: "Multi-layer static analysis with entitlement scanning, code evaluation detection, and evasion heuristics for MCP tool handlers."
---

# Blast Radius Analysis

::: tip One-Liner
A tool declared as `readOnly: true` that imports `child_process` is lying. A tool that uses `String.fromCharCode()` to build `"require"` at runtime is hiding. The EntitlementScanner catches both.
:::

---

## Overview

Every MCP tool handler has an implicit **blast radius** — the set of I/O capabilities it *actually* uses, regardless of what it *declares*. A tool declared as read-only that imports `fs.writeFile` can write to disk. A tool described as "query your database" that imports `child_process` can execute arbitrary commands.

**EntitlementScanner** performs multi-layer static analysis of handler source code to detect I/O capabilities, dynamic code evaluation, and evasion techniques — then compares findings against declared claims. When the declared contract says one thing and the code does another, it reports a **violation**. When the code tries to hide its intent, it reports an **evasion indicator**.

---

## Defense in Depth

The scanner uses three complementary detection layers:

| Layer | What It Catches | Examples |
|---|---|---|
| **Pattern Detection** | Known I/O APIs across 5 categories | `fs.writeFile`, `fetch`, `exec`, `eval` |
| **Code Evaluation Detection** | Dynamic code execution vectors | `eval()`, `new Function()`, `vm.runInNewContext`, `process.binding` |
| **Evasion Heuristics** | Techniques that bypass static analysis | `String.fromCharCode()`, `globalThis['ev'+'al']`, `require(variable)` |

The evasion layer does NOT try to determine what obfuscated code does — it flags the *presence of obfuscation itself* as a security concern. Code that hides its intent is inherently untrustworthy.

---

## The Problem

The MCP protocol has no concept of handler capabilities. The `tools/list` response includes a description and an input schema — but nothing about what the handler will actually *do* when invoked. Tool annotations like `readOnlyHint` are advisory:

> Tool annotations are informational and not guaranteed to be complete or correct. They are not enforceable at the protocol level.

This means a server can declare a tool as read-only while the handler writes files, makes network calls, or spawns subprocesses. Without static analysis, there is no mechanism to detect this contract violation.

---

## Entitlement Categories

The scanner detects five categories of capabilities:

| Category | What It Detects | Risk Example |
|---|---|---|
| **filesystem** | `fs.readFile`, `fs.writeFile`, `createWriteStream`, etc. | A "read config" tool that also deletes files |
| **network** | `fetch`, `axios`, `http`, `WebSocket`, `undici`, etc. | A "format text" tool that exfiltrates data |
| **subprocess** | `child_process.exec`, `spawn`, `fork`, `worker_threads` | A "list users" tool that runs shell commands |
| **crypto** | `crypto.createSign`, `createCipher`, `privateEncrypt` | A "hello world" tool that signs arbitrary data |
| **codeEvaluation** | `eval()`, `new Function()`, `vm` module, `process.binding` | Any tool with runtime code execution — blast radius is unbounded |

---

## Quick Start

### Scan Source Code

```typescript
import { scanSource, buildEntitlements } from 'mcp-fusion/introspection';

const source = `
  import { readFile, writeFile } from 'node:fs/promises';
  import { exec } from 'node:child_process';

  export async function handler(input) {
    const config = await readFile('config.json', 'utf8');
    await writeFile('output.json', JSON.stringify(result));
    await exec('notify-admin');
    return config;
  }
`;

const matches = scanSource(source);
// [
//   { category: 'filesystem', identifier: 'fs', line: 2, ... },
//   { category: 'filesystem', identifier: 'readFile', line: 5, ... },
//   { category: 'filesystem', identifier: 'writeFile', line: 6, ... },
//   { category: 'subprocess', identifier: 'child_process', line: 3, ... },
//   { category: 'subprocess', identifier: 'exec', line: 7, ... }
// ]

const entitlements = buildEntitlements(matches);
// {
//   filesystem: true,
//   network: false,
//   subprocess: true,
//   crypto: false,
//   codeEvaluation: false,
//   raw: ['child_process', 'exec', 'fs', 'readFile', 'writeFile']
// }
```

### Validate Against Claims

```typescript
import { validateClaims } from 'mcp-fusion/introspection';

const violations = validateClaims(matches, {
  readOnly: true,   // Declared as read-only
  destructive: false,
});

// [
//   {
//     category: 'filesystem',
//     declared: 'readOnly: true',
//     detected: 'Filesystem write operations: writeFile',
//     severity: 'error',
//     description: 'Tool declares readOnly but handler uses filesystem write APIs: writeFile'
//   },
//   {
//     category: 'subprocess',
//     declared: 'readOnly: true',
//     detected: 'Subprocess APIs detected',
//     severity: 'error',
//     description: 'Tool declares readOnly but handler uses subprocess APIs'
//   }
// ]
```

### Full Report

```typescript
import { scanAndValidate } from 'mcp-fusion/introspection';

const report = scanAndValidate(source, {
  readOnly: true,
  destructive: false,
});

console.log(report.safe);
// false — violations with severity 'error' exist

console.log(report.summary);
// "Entitlements: [filesystem, subprocess] | 2 violation(s) (2 errors) | UNSAFE"
```

### Scan for Evasion

```typescript
import { scanEvasionIndicators } from 'mcp-fusion/introspection';

const suspiciousSource = `
  const m = String.fromCharCode(114, 101, 113, 117, 105, 114, 101);
  const cp = globalThis[m]('child_process');
`;

const indicators = scanEvasionIndicators(suspiciousSource);
// [
//   {
//     type: 'string-construction',
//     confidence: 'high',
//     description: 'String.fromCharCode() can build API names at runtime...',
//     line: 2
//   },
//   {
//     type: 'indirect-access',
//     confidence: 'medium',
//     description: 'Bracket-notation access on global object...',
//     line: 3
//   }
// ]
```

`scanAndValidate()` integrates evasion detection automatically — high-confidence evasion makes the handler `UNSAFE`.

---

## Violation Rules

The violation engine uses a **declarative rule table** instead of imperative branching. Each rule encodes a policy check as pure data:

| Declared | Detected | Severity | Violation |
|---|---|---|---|
| `readOnly: true` | filesystem **write** APIs | `error` | Read-only tool uses write operations |
| `readOnly: true` | subprocess APIs | `error` | Read-only tool can execute commands |
| `readOnly: true` | network APIs | `warning` | Read-only tool makes network calls (possible side effects) |
| `destructive: false` | subprocess APIs | `warning` | Non-destructive tool can execute commands |
| *(any)* | codeEvaluation APIs | `error` | Handler uses dynamic code evaluation — blast radius is unbounded |
| `readOnly: true` + `allowed: ['codeEvaluation']` | codeEvaluation APIs | `error` | Even when allowed, readOnly conflicts with eval |

### Allowed Entitlements

Use the `allowed` claim to explicitly whitelist entitlements that are expected:

```typescript
const violations = validateClaims(matches, {
  readOnly: true,
  allowed: ['network'],  // We know this tool calls an API
});

// Network violations are suppressed — only filesystem/subprocess violations remain
```

::: warning
`codeEvaluation` cannot be safely allowed with `readOnly: true`. Even if you add `'codeEvaluation'` to the `allowed` list, the readOnly + codeEvaluation conflict rule still fires an error. Eval can perform writes.
:::

---

## Evasion Heuristics

The evasion detection layer catches techniques commonly used to bypass regex-based static analysis. These fire **evasion indicators** — separate from entitlement matches — that flag *how* code hides its intent rather than *what* it does.

### Evasion Types

| Type | Confidence | Description |
|---|---|---|
| `string-construction` | high | `String.fromCharCode()` — builds identifiers at runtime |
| `string-construction` | medium | `String.raw` template — encodes obfuscated identifiers |
| `string-construction` | low | `atob()` — base64 decode (common for legitimate use) |
| `string-construction` | low | `Buffer.from(…, 'base64')` — payload decoding |
| `indirect-access` | high | `globalThis['ev' + 'al']` — computed property with concatenation |
| `indirect-access` | medium | `globalThis['eval']` — bracket notation on globals |
| `indirect-access` | high | `process['binding']` — bracket notation on `process` |
| `computed-import` | high | `require(variable)` — non-literal module name |
| `computed-import` | high | `import(variable)` — non-literal dynamic import |
| `encoding-density` | high | High ratio of `\x??`/`\u????` escapes in source |
| `entropy-anomaly` | medium | String literals with Shannon entropy > 5.0 |

### Confidence and Safety

- **High confidence** evasion indicators make the handler `UNSAFE` (same as error-severity violations)
- **Medium/low confidence** indicators are reported but do not alone affect `safe` status
- Indicators are included in `EntitlementReport.evasionIndicators` for programmatic inspection

### Example: Catch What Regex Cannot

A malicious handler can evade the pattern library with string concatenation:

```typescript
// This bypasses ALL regex-based entitlement patterns:
const m = 'child' + '_process';
const cp = require(m);  // ← No static string literal to match
cp.exec('rm -rf /');
```

The evasion heuristic catches `require(m)` as a **computed import** (high confidence) and flags the handler as `UNSAFE`.

---

## Pattern Library

The scanner uses regex-based pattern matching on source text. This is deliberately **conservative** — it may over-report (false positives in comments or strings) but never under-report.

### Filesystem Patterns

```
fs, fs.*, readFile, writeFile, appendFile, unlink, rmdir,
mkdir, rename, copyFile, createReadStream, createWriteStream
```

Matches both CommonJS (`require('fs')`) and ESM (`import from 'fs'`), with optional `node:` prefix and `/promises` subpath.

### Network Patterns

```
fetch, http/https, axios, got, node-fetch, XMLHttpRequest,
WebSocket, net, dgram, undici
```

### Subprocess Patterns

```
child_process, exec, execSync, execFile, spawn, spawnSync,
fork, worker_threads, cluster, Deno.run, Bun.spawn
```

### Crypto Patterns

```
crypto, createSign, createVerify, createCipher, createDecipher,
privateEncrypt, privateDecrypt
```

### Code Evaluation Patterns

```
eval, eval-indirect (0,eval)(), new Function, vm module,
vm.runInNewContext, vm.runInThisContext, vm.compileFunction,
new vm.Script, globalThis.eval, Reflect.construct(Function, ...),
process.binding, process.dlopen
```

---

## Performance

| Operation | Complexity | Notes |
|---|---|---|
| `scanSource()` | $O(n \cdot p)$ | $n$ = source length, $p$ = pattern count |
| Line number resolution | $O(\log L)$ | Binary search over precomputed line offsets |
| `validateClaims()` | $O(r \cdot m)$ | $r$ = rule count (constant), $m$ = match count |

The line number resolver uses an $O(\log n)$ binary search over precomputed line start offsets, replacing the naive $O(n)$ linear scan. For a 10,000-line file, this means ~14 comparisons per match instead of ~5,000.

---

## `EntitlementReport`

```typescript
interface EntitlementReport {
  /** Resolved entitlement flags */
  readonly entitlements: HandlerEntitlements;
  /** All pattern matches with file location */
  readonly matches: readonly EntitlementMatch[];
  /** Policy violations (declared vs detected) */
  readonly violations: readonly EntitlementViolation[];
  /** Evasion indicators — patterns suggesting intentional bypass */
  readonly evasionIndicators: readonly EvasionIndicator[];
  /** true if no error-severity violations AND no high-confidence evasion */
  readonly safe: boolean;
  /** Human-readable summary line */
  readonly summary: string;
}
```

---

## `EntitlementMatch`

```typescript
interface EntitlementMatch {
  /** Which category (filesystem, network, subprocess, crypto, codeEvaluation) */
  readonly category: EntitlementCategory;
  /** Specific API/import name that matched */
  readonly identifier: string;
  /** Regex pattern that triggered the match */
  readonly pattern: string;
  /** Source line context (trimmed) */
  readonly context: string;
  /** Line number in source (1-based) */
  readonly line: number;
}
```

---

## `EvasionIndicator`

```typescript
interface EvasionIndicator {
  /** Evasion technique type */
  readonly type: EvasionType;
  /** Confidence level — high confidence makes handler UNSAFE */
  readonly confidence: 'low' | 'medium' | 'high';
  /** Human-readable description */
  readonly description: string;
  /** Source context around the match */
  readonly context: string;
  /** Line number (1-based) */
  readonly line: number;
}

type EvasionType =
  | 'string-construction'   // Building identifiers at runtime
  | 'indirect-access'       // Bracket notation on globals/process
  | 'computed-import'       // require(variable), import(variable)
  | 'encoding-density'      // High hex/unicode escape ratio
  | 'entropy-anomaly';      // High-entropy string literals
```

---

## Integration With Governance Stack

Entitlement scan results flow into the broader governance system:

```
Handler source → scanAndValidate() → EntitlementReport.entitlements
                                         │
                                         ▼
             ToolContract.entitlements ─────────────────────────┐
                                         │                      │
                                         ▼                      ▼
                            BehaviorDigest                CapabilityLockfile
                  (entitlements component hash)      (entitlements section)
                                         │
                                         ▼
                              ContractDiff
                    (BREAKING if entitlement gained)
```

When a handler gains a new I/O capability:

1. **BehaviorDigest** changes (entitlements component hash differs)
2. **CapabilityLockfile** becomes stale (`fusion lock --check` fails)
3. **ContractDiff** reports a `BREAKING` severity delta: *"Handler gained 'subprocess' entitlement"*

---

## Example: CI Safety Gate

```typescript
import { scanAndValidate } from 'mcp-fusion/introspection';
import { readFileSync } from 'node:fs';

const handlerSource = readFileSync('./src/handlers/invoices.ts', 'utf8');

const report = scanAndValidate(handlerSource, {
  readOnly: false,
  destructive: false,
});

if (!report.safe) {
  console.error('Entitlement violations detected:');
  for (const v of report.violations) {
    console.error(`  [${v.severity}] ${v.category}: ${v.description}`);
  }
  for (const e of report.evasionIndicators) {
    console.error(`  [evasion:${e.confidence}] ${e.type}: ${e.description}`);
  }
  process.exit(1);
}
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **Regex-based pattern detection** | No `typescript` dependency required. Works on any JavaScript/TypeScript source. |
| **Multi-layer defense** | Pattern detection alone is bypassable. Evasion heuristics catch what patterns miss. |
| **Evasion flags intent, not capability** | We don't try to decode what `String.fromCharCode()` builds — we flag the obfuscation itself. |
| **Conservative matching** | May flag patterns in comments/strings. Security analysis should err on the side of caution. |
| **codeEvaluation always error** | `eval()` makes blast radius unbounded. No safe way to use it in a declared-readOnly tool. |
| **Declarative rule table** | Violation rules are pure data, not imperative branches. New rules require only a table entry. |
| **`allowed` whitelist** | Developers can explicitly acknowledge expected entitlements without suppressing the entire scan. |
| **Binary search for line numbers** | $O(\log n)$ instead of $O(n)$ — meaningful for large handler files. |
| **Shannon entropy for obfuscation** | High-entropy string literals (> 5.0 bits) are statistically unlikely in normal code. |
