---
title: "Blast Radius Analysis"
description: "Multi-layer static analysis with entitlement scanning, code evaluation detection, and evasion heuristics for MCP tool handlers."
---

# Blast Radius Analysis

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Scan my handler source code with EntitlementScanner, validate against readOnly:true claims, and add a CI gate that blocks PRs with error-severity violations."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Scan my handler source code with EntitlementScanner, validate against readOnly:true claims, and add a CI gate that blocks PRs with error-severity violations.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Scan+my+handler+source+code+with+EntitlementScanner%2C+validate+against+readOnly%3Atrue+claims%2C+and+add+a+CI+gate+that+blocks+PRs+with+error-severity+violations." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Scan+my+handler+source+code+with+EntitlementScanner%2C+validate+against+readOnly%3Atrue+claims%2C+and+add+a+CI+gate+that+blocks+PRs+with+error-severity+violations." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">ENTITLEMENT SCANNING</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">readOnly says one thing.<br><span style="color:rgba(255,255,255,0.25)">child_process says another.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Pattern detection for I/O APIs, code evaluation detection for eval() vectors, and evasion heuristics for obfuscation. When declared contracts diverge from actual code, it reports a violation.</div>
</div>


The MCP protocol has no mechanism to enforce this. Tool annotations like `readOnlyHint` are advisory — the spec itself says they are "not guaranteed to be complete or correct" and "not enforceable at the protocol level."

`EntitlementScanner` closes this gap with three complementary layers: pattern detection for known I/O APIs, code evaluation detection for `eval()`/`new Function()` vectors, and evasion heuristics for techniques that bypass static analysis. When the declared contract says one thing and the code does another, it reports a violation. When the code tries to hide its intent, it flags the **Phantom Capability** as an evasion indicator, guaranteeing enterprise security.


## Scanning Source Code {#scan}

```typescript
import { scanSource, buildEntitlements } from 'Vurb.ts/introspection';

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
import { validateClaims } from 'Vurb.ts/introspection';

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
import { scanAndValidate } from 'Vurb.ts/introspection';

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
import { scanEvasionIndicators } from 'Vurb.ts/introspection';

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
- **CapabilityLockfile** — `Vurb.ts lock --check` fails if the lockfile's entitlements section is stale
- **ContractDiff** — reports a `BREAKING` severity delta when a handler gains a new I/O capability (e.g., "Handler gained 'subprocess' entitlement")

This means adding a single `import { exec } from 'child_process'` to a read-only handler will cascade through the entire governance pipeline — the lockfile becomes stale, the diff reports a breaking change, and the CI gate blocks the PR.


## CI Safety Gate {#ci}

```typescript
import { scanAndValidate } from 'Vurb.ts/introspection';
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
