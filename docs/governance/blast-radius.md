---
title: "Blast Radius Analysis"
description: "Multi-layer static analysis with entitlement scanning, code evaluation detection, and evasion heuristics for MCP tool handlers."
---

# Blast Radius Analysis

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Scanning Source Code](#scan)
- [Validating Against Claims](#validate)
- [The Full Report](#report)
- [Evasion Detection](#evasion)
- [Integration With the Governance Stack](#integration)
- [CI Safety Gate](#ci)
- [Pattern Detection](#patterns)
- [Performance](#performance)

Every MCP tool handler has an implicit blast radius — the set of I/O capabilities it *actually* uses, regardless of what it *declares*. A tool declared as read-only that imports `fs.writeFile` can write to disk. A tool described as "query your database" that imports `child_process` can execute arbitrary commands.

The MCP protocol has no mechanism to enforce this. Tool annotations like `readOnlyHint` are advisory — the spec itself says they are "not guaranteed to be complete or correct" and "not enforceable at the protocol level."

`EntitlementScanner` closes this gap with three complementary layers: pattern detection for known I/O APIs, code evaluation detection for `eval()`/`new Function()` vectors, and evasion heuristics for techniques that bypass static analysis. When the declared contract says one thing and the code does another, it reports a violation. When the code tries to hide its intent, it reports an evasion indicator.


## Scanning Source Code {#scan}

```typescript
import { scanSource, buildEntitlements } from '@vinkius-core/mcp-fusion/introspection';

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
```

`scanSource()` returns every detected I/O API with its category, identifier, line number, and the surrounding source context. Each match maps to one of five entitlement categories:

| Category | What It Detects | Why It Matters |
|---|---|---|
| `filesystem` | `fs.readFile`, `writeFile`, `unlink`, `createWriteStream` | A "read config" tool that also deletes files |
| `network` | `fetch`, `axios`, `http`, `WebSocket`, `undici` | A "format text" tool that exfiltrates data |
| `subprocess` | `child_process.exec`, `spawn`, `fork`, `worker_threads` | A "list users" tool that runs shell commands |
| `crypto` | `crypto.createSign`, `createCipher`, `privateEncrypt` | A "hello world" tool that signs arbitrary data |
| `codeEvaluation` | `eval()`, `new Function()`, `vm` module, `process.binding` | Blast radius is unbounded — anything is possible |

From matches, `buildEntitlements()` produces the summary:

```typescript
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

The `raw` array preserves every specific identifier that triggered a match — useful for audit logs where you need to know exactly which APIs were found, not just which categories.


## Validating Against Claims {#validate}

Detecting capabilities alone isn't enough. The value is in comparing what the code *does* against what it *claims* to do:

```typescript
import { validateClaims } from '@vinkius-core/mcp-fusion/introspection';

const violations = validateClaims(matches, {
  readOnly: true,
  destructive: false,
});
```

This returns a violation for every mismatch. The handler above declared `readOnly: true` but uses `writeFile` (filesystem write) and `exec` (subprocess) — both are `error`-severity violations.

The violation engine uses a declarative rule table:

| Declared | Detected | Severity | Why |
|---|---|---|---|
| `readOnly: true` | filesystem **write** APIs | `error` | Contradicts the read-only claim |
| `readOnly: true` | subprocess APIs | `error` | Subprocess can write, delete, anything |
| `readOnly: true` | network APIs | `warning` | Network calls may have side effects |
| `destructive: false` | subprocess APIs | `warning` | Subprocess can be destructive |
| *(any)* | codeEvaluation APIs | `error` | `eval()` makes blast radius unbounded |

If a tool legitimately needs network access but is otherwise read-only, use the `allowed` whitelist:

```typescript
const violations = validateClaims(matches, {
  readOnly: true,
  allowed: ['network'],
});
// Network violations suppressed — filesystem/subprocess violations remain
```

One exception: `codeEvaluation` cannot be safely allowed with `readOnly: true`. Even if you add it to the `allowed` list, the readOnly + codeEvaluation conflict still fires an error — `eval()` can perform writes.


## The Full Report {#report}

`scanAndValidate()` combines scanning, validation, and evasion detection into a single call:

```typescript
import { scanAndValidate } from '@vinkius-core/mcp-fusion/introspection';

const report = scanAndValidate(source, {
  readOnly: true,
  destructive: false,
});

console.log(report.safe);
// false — error-severity violations exist

console.log(report.summary);
// "Entitlements: [filesystem, subprocess] | 2 violation(s) (2 errors) | UNSAFE"
```

The `safe` flag is `false` when *any* error-severity violation exists OR when *any* high-confidence evasion indicator is found. This is what CI gates should check.

The `EntitlementReport` contains everything:

```typescript
interface EntitlementReport {
  readonly entitlements: HandlerEntitlements;
  readonly matches: readonly EntitlementMatch[];
  readonly violations: readonly EntitlementViolation[];
  readonly evasionIndicators: readonly EvasionIndicator[];
  readonly safe: boolean;
  readonly summary: string;
}
```


## Evasion Detection {#evasion}

Pattern matching catches known APIs. But a malicious handler can bypass every regex:

```typescript
const m = 'child' + '_process';
const cp = require(m);
cp.exec('rm -rf /');
```

No static string literal matches `child_process` — the pattern library sees nothing. This is where evasion heuristics take over:

```typescript
import { scanEvasionIndicators } from '@vinkius-core/mcp-fusion/introspection';

const indicators = scanEvasionIndicators(suspiciousSource);
// [
//   {
//     type: 'computed-import',
//     confidence: 'high',
//     description: 'Non-literal argument to require()...',
//     line: 2
//   }
// ]
```

The evasion layer doesn't try to determine *what* obfuscated code does — it flags the *presence of obfuscation itself*. Code that hides its intent is inherently untrustworthy.

Five evasion types are detected:

| Type | Example | Confidence |
|---|---|---|
| `string-construction` | `String.fromCharCode(114, 101, 113...)` | high |
| `string-construction` | `atob('cmVxdWlyZQ==')` | low |
| `indirect-access` | `globalThis['ev' + 'al']` | high |
| `indirect-access` | `process['binding']` | high |
| `computed-import` | `require(variable)`, `import(variable)` | high |
| `encoding-density` | High ratio of `\x??`/`\u????` escapes | high |
| `entropy-anomaly` | String literals with Shannon entropy > 5.0 | medium |

High-confidence indicators make the handler `UNSAFE` — same effect as error-severity violations. Medium and low-confidence indicators are reported but don't alone affect the `safe` flag.

`scanAndValidate()` integrates evasion detection automatically — you don't need to call `scanEvasionIndicators()` separately unless you want the raw indicators without the full validation pipeline.


## Integration With the Governance Stack {#integration}

Entitlement scan results don't exist in isolation. They flow into the broader contract system:

The `EntitlementReport.entitlements` become the `entitlements` section of the `ToolContract`. From there, they affect every other governance module:

- **BehaviorDigest** — the entitlements component hash changes when capabilities change
- **CapabilityLockfile** — `fusion lock --check` fails if the lockfile's entitlements section is stale
- **ContractDiff** — reports a `BREAKING` severity delta when a handler gains a new I/O capability (e.g., "Handler gained 'subprocess' entitlement")

This means adding a single `import { exec } from 'child_process'` to a read-only handler will cascade through the entire governance pipeline — the lockfile becomes stale, the diff reports a breaking change, and the CI gate blocks the PR.


## CI Safety Gate {#ci}

```typescript
import { scanAndValidate } from '@vinkius-core/mcp-fusion/introspection';
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


## Pattern Detection {#patterns}

The scanner uses regex-based pattern matching on source text. This is deliberately conservative — it may over-report (false positives in comments or strings) but never under-report. Security analysis should err on the side of caution.

The patterns cover:

- **Filesystem** — `fs`, `readFile`, `writeFile`, `appendFile`, `unlink`, `rmdir`, `mkdir`, `rename`, `copyFile`, `createReadStream`, `createWriteStream`. Matches CommonJS and ESM, with optional `node:` prefix and `/promises` subpath.
- **Network** — `fetch`, `http`/`https`, `axios`, `got`, `node-fetch`, `XMLHttpRequest`, `WebSocket`, `net`, `dgram`, `undici`.
- **Subprocess** — `child_process`, `exec`, `execSync`, `execFile`, `spawn`, `spawnSync`, `fork`, `worker_threads`, `cluster`, `Deno.run`, `Bun.spawn`.
- **Crypto** — `crypto`, `createSign`, `createVerify`, `createCipher`, `createDecipher`, `privateEncrypt`, `privateDecrypt`.
- **Code Evaluation** — `eval`, indirect eval `(0,eval)()`, `new Function`, `vm` module and its methods, `Reflect.construct(Function, ...)`, `process.binding`, `process.dlopen`.

No `typescript` dependency is required. The scanner works on any JavaScript or TypeScript source text.


## Performance {#performance}

| Operation | Complexity | Notes |
|---|---|---|
| `scanSource()` | $O(n \cdot p)$ | $n$ = source length, $p$ = pattern count |
| Line number resolution | $O(\log L)$ | Binary search over precomputed line offsets |
| `validateClaims()` | $O(r \cdot m)$ | $r$ = rule count (constant), $m$ = match count |

The line number resolver uses binary search over precomputed line start offsets. For a 10,000-line file, this means ~14 comparisons per match instead of ~5,000 with a linear scan.
