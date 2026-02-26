---
title: "Capability Lockfile"
description: "Generate, verify, and integrate mcp-fusion.lock into CI/CD. A deterministic, git-diffable snapshot of the behavioral surface."
---

# Capability Lockfile

::: tip One-Liner
`fusion lock` captures the behavioral surface. `fusion lock --check` fails the build when someone changes it.
:::

---

## Overview

`mcp-fusion.lock` is a deterministic, canonical JSON file that captures the complete behavioral surface of your MCP server at a point in time. It is the behavioral equivalent of `package-lock.json` or `Cargo.lock` — except instead of pinning dependency versions, it pins **tool contracts, prompt definitions, cognitive guardrails, entitlements, and token economics**.

---

## Why a Lockfile?

The MCP protocol provides `tools/list` and `prompts/list` — which return the **current** surfaces. It provides `notifications/tools/list_changed` and `notifications/prompts/list_changed` — which signal that **something** changed. Neither provides:

1. A durable artifact that can be stored in version control
2. A mechanism to compare the surface against a known-good baseline
3. A way to detect changes at the behavioral level (system rules, middleware, affordances)

The lockfile fills all three gaps:

```
Developer builds server → fusion lock → mcp-fusion.lock → git commit

CI runs build → fusion lock --check → compares live surface to committed lockfile

If stale → CI fails → reviewer inspects the git diff before merge
```

---

## Generating The Lockfile

### CLI

```bash
# Generate or update the lockfile
npx fusion lock --server ./src/server.ts

# Verify the lockfile matches the current surface (CI gate)
npx fusion lock --check --server ./src/server.ts
```

### Programmatic API

```typescript
import {
  generateLockfile,
  serializeLockfile,
  checkLockfile,
  writeLockfile,
  readLockfile,
  parseLockfile,
} from 'mcp-fusion/introspection';

// Build your contracts (usually from tool builders)
const contracts = materializeAllContracts(server.tools);

// Generate the lockfile — pure function
// Optionally include prompt builders for prompt snapshot
const lockfile = generateLockfile('payments-api', contracts, '1.1.0', {
  prompts: promptRegistry.getBuilders?.() ?? [],
});

// Write to disk (side-effectful, clearly separated)
await writeLockfile(lockfile, process.cwd());
```

---

## Lockfile Structure

A minimal lockfile looks like this:

```json
{
  "lockfileVersion": 1,
  "serverName": "payments-api",
  "fusionVersion": "1.1.0",
  "generatedAt": "2026-02-26T12:00:00.000Z",
  "integrityDigest": "sha256:a1b2c3...",
  "capabilities": {
    "tools": {
      "invoices": {
        "integrityDigest": "sha256:f6e5d4...",
        "surface": { ... },
        "behavior": { ... },
        "tokenEconomics": { ... },
        "entitlements": { ... }
      }
    },
    "prompts": {
      "billing-summary": {
        "integrityDigest": "sha256:9a8b7c...",
        "description": "Summarize billing data",
        "title": "Billing Summary",
        "tags": ["billing", "finance"],
        "arguments": [
          { "name": "account_id", "description": null, "required": true },
          { "name": "month", "description": "Month in YYYY-MM", "required": true }
        ],
        "argumentsDigest": "sha256:d4e5f6...",
        "hasMiddleware": false,
        "hydrationTimeout": null
      }
    }
  }
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `lockfileVersion` | `1` | Format version for forward-compatible parsing |
| `serverName` | `string` | MCP server name from `ServerBuilder` |
| `fusionVersion` | `string` | Framework version at generation time |
| `generatedAt` | `string` (ISO-8601) | Timestamp — excluded from integrity computation |
| `integrityDigest` | `string` | SHA-256 over all tool + prompt digests |
| `capabilities.tools` | `Record<string, LockfileTool>` | Per-tool snapshots, **sorted by name** |
| `capabilities.prompts` | `Record<string, LockfilePrompt>` | Per-prompt snapshots, **sorted by name** (optional) |

### Per-Tool Sections

Each tool entry has four sections:

::: code-group

```json [surface]
{
  "description": "Manage invoices",
  "actions": ["create", "list", "void"],
  "inputSchemaDigest": "sha256:...",
  "tags": ["billing"]
}
```

```json [behavior]
{
  "egressSchemaDigest": "sha256:...",
  "systemRulesFingerprint": "static:abc123",
  "destructiveActions": ["void"],
  "readOnlyActions": ["list"],
  "middlewareChain": ["auth:mw"],
  "affordanceTopology": ["payments.refund"],
  "cognitiveGuardrails": {
    "agentLimitMax": 50,
    "egressMaxBytes": null
  }
}
```

```json [tokenEconomics]
{
  "inflationRisk": "low",
  "schemaFieldCount": 5,
  "unboundedCollection": false
}
```

```json [entitlements]
{
  "filesystem": false,
  "network": true,
  "subprocess": false,
  "crypto": false
}
```

:::

### Per-Prompt Sections

Each prompt entry captures the declarative surface that MCP clients rely on to offer slash-command palettes. The `prompts` section is optional — when no `PromptRegistry` is provided, it is omitted from the lockfile.

```json
{
  "integrityDigest": "sha256:9a8b7c...",
  "description": "Summarize billing data for a given month",
  "title": "Billing Summary",
  "tags": ["billing", "finance"],
  "arguments": [
    { "name": "account_id", "description": null, "required": true },
    { "name": "month", "description": "Month in YYYY-MM format", "required": true }
  ],
  "argumentsDigest": "sha256:d4e5f6...",
  "hasMiddleware": false,
  "hydrationTimeout": null
}
```

| Field | Type | Description |
|---|---|---|
| `integrityDigest` | `string` | SHA-256 over all declarative fields |
| `description` | `string \| null` | Human-readable description |
| `title` | `string \| null` | Display title (MCP `BaseMetadata.title`) |
| `tags` | `string[]` | Sorted capability tags for RBAC |
| `arguments` | `LockfilePromptArgument[]` | Argument definitions, sorted by name |
| `argumentsDigest` | `string` | SHA-256 of canonical arguments JSON |
| `hasMiddleware` | `boolean` | Whether middleware is attached |
| `hydrationTimeout` | `number \| null` | Deadline in ms, or null if unlimited |

---

## Canonical Serialization

The lockfile is **canonical** — given the same inputs, it always produces the same byte output. This is achieved by:

1. **Sorted object keys**: All JSON objects are serialized with keys in lexicographic order
2. **Deterministic arrays**: Actions, tags, and middleware are sorted before serialization
3. **Trailing newline**: The file always ends with `\n` for POSIX compliance
4. **Two-space indentation**: Optimized for readability in pull request diffs

This means `git diff` works correctly: identical surfaces produce identical files, and changes are always semantically meaningful.

```typescript
import { serializeLockfile } from 'mcp-fusion/introspection';

const json = serializeLockfile(lockfile);
// Deterministic JSON with sorted keys + trailing newline
```

---

## Verification (CI Gate)

The primary CI integration is `checkLockfile()`:

```typescript
import {
  readLockfile,
  checkLockfile,
} from 'mcp-fusion/introspection';

const lockfile = await readLockfile(process.cwd());
if (!lockfile) {
  console.error('No lockfile found. Run `fusion lock` first.');
  process.exit(1);
}

// Pass prompt builders for prompt-aware verification
const result = checkLockfile(lockfile, contracts, {
  prompts: promptRegistry.getBuilders?.() ?? [],
});

if (!result.ok) {
  console.error(result.message);
  // "Lockfile is stale. tools changed: [invoices]; prompts added: [billing-summary]."
  process.exit(1);
}
```

### `LockfileCheckResult`

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | `true` if lockfile matches the current surface |
| `message` | `string` | Human-readable status |
| `added` | `string[]` | Tools present in code but missing from the lockfile |
| `removed` | `string[]` | Tools in the lockfile but missing from code |
| `changed` | `string[]` | Tools whose behavioral digest changed |
| `unchanged` | `string[]` | Tools that match exactly |
| `addedPrompts` | `string[]` | Prompts present in code but missing from the lockfile |
| `removedPrompts` | `string[]` | Prompts in the lockfile but missing from code |
| `changedPrompts` | `string[]` | Prompts whose declarative digest changed |
| `unchangedPrompts` | `string[]` | Prompts that match exactly |

### Fast Path

When the server-level `integrityDigest` matches, verification completes in $O(1)$ — a single string comparison. Per-tool and per-prompt comparison only runs when the digest differs.

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/governance.yml
name: Capability Governance
on: [pull_request]

jobs:
  lockfile-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npx fusion lock --check --server ./src/server.ts
```

### GitLab CI

```yaml
# .gitlab-ci.yml
governance:lockfile:
  stage: test
  script:
    - npm ci
    - npx fusion lock --check --server ./src/server.ts
  rules:
    - if: $CI_MERGE_REQUEST_ID
```

---

## Reviewing Lockfile Diffs

When someone changes a tool's behavioral surface, the pull request diff shows exactly what changed:

```diff
  "invoices": {
-   "integrityDigest": "sha256:f6e5d4c3b2a1...",
+   "integrityDigest": "sha256:9a8b7c6d5e4f...",
    "surface": {
      "description": "Manage invoices",
-     "actions": ["create", "list", "void"],
+     "actions": ["create", "list", "void", "delete"],
    },
    "behavior": {
-     "destructiveActions": ["void"],
+     "destructiveActions": ["void", "delete"],
      "readOnlyActions": ["list"],
    }
  }
```

The reviewer can immediately see:

1. A new action `delete` was added
2. It was marked as destructive
3. The integrity digest changed accordingly

Without the lockfile, this change would be invisible at the protocol level — the MCP client would discover the new action only at runtime, with no audit trail.

### Prompt Diffs

Prompt changes are equally visible:

```diff
  "billing-summary": {
-   "integrityDigest": "sha256:aabbcc...",
+   "integrityDigest": "sha256:ddeeff...",
-   "description": "Summarize billing data",
+   "description": "Summarize billing and compliance data",
-   "tags": ["billing"],
+   "tags": ["billing", "compliance"],
    "arguments": [
      { "name": "account_id", "description": null, "required": true },
-     { "name": "month", "description": "Month in YYYY-MM", "required": true }
+     { "name": "month", "description": "Month in YYYY-MM", "required": true },
+     { "name": "format", "description": "Output format", "required": false }
    ]
  }
```

The reviewer sees that the prompt now covers compliance, added a new argument, and changed its description — all of which affect how the LLM invokes it.

---

## Parsing and Validation

```typescript
import { parseLockfile } from 'mcp-fusion/introspection';

const lockfile = parseLockfile(rawJson);

if (!lockfile) {
  // Invalid format, wrong version, or missing required fields
  throw new Error('Invalid lockfile');
}
```

`parseLockfile` validates:

- `lockfileVersion` equals the current version (`1`)
- `serverName`, `fusionVersion`, `generatedAt`, `integrityDigest` are present strings
- `capabilities.tools` exists and is an object

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   CapabilityLockfile                      │
│                                                          │
│  ┌──────────────────┐   ┌────────────────────────────┐   │
│  │ generateLockfile  │   │  checkLockfile              │   │
│  │ (contracts,       │   │  (lockfile, contracts,      │   │
│  │  options.prompts) │   │   options.prompts)          │   │
│  │ pure function     │   │  pure function              │   │
│  └────────┬─────────┘   └──────────┬─────────────────┘   │
│           │                        │                      │
│     ┌─────┴─────┐           ┌──────┴──────┐              │
│     ▼           ▼           ▼             ▼              │
│  ┌────────┐ ┌────────┐  ┌─────────┐ ┌──────────┐        │
│  │snapshot │ │snapshot │  │ Tool    │ │ Prompt   │        │
│  │Tool()   │ │Prompt()│  │ digest  │ │ digest   │        │
│  └────────┘ └────────┘  │ compare │ │ compare  │        │
│                          └─────────┘ └──────────┘        │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────┐   ┌────────────────────────────┐   │
│  │ serialize         │   │  writeLockfile / readLock   │   │
│  │ Lockfile()        │   │  file()                    │   │
│  │ canonical JSON    │   │  side-effectful I/O        │   │
│  └──────────────────┘   └────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

| Function | Purity | Purpose |
|---|---|---|
| `generateLockfile()` | Pure | Materialize lockfile from tool contracts + prompt builders |
| `serializeLockfile()` | Pure | Deterministic JSON serialization |
| `checkLockfile()` | Pure | Verify lockfile against live contracts and prompts |
| `parseLockfile()` | Pure | Parse and validate lockfile JSON |
| `writeLockfile()` | Side-effectful | Write to filesystem |
| `readLockfile()` | Side-effectful | Read from filesystem |

---

## Best Practices

::: warning Always commit the lockfile
`mcp-fusion.lock` belongs in version control — like `package-lock.json`. Add it to `.gitignore` only if you don't want governance (not recommended).
:::

1. **Generate on feature branches**: Run `fusion lock` after changing tool builders, Presenters, prompt definitions, middleware, or system rules
2. **Check on CI**: Always run `fusion lock --check` in your CI pipeline
3. **Review the diff**: Train your team to review lockfile diffs in pull requests — especially changes to `systemRulesFingerprint`, `destructiveActions`, `entitlements`, and prompt `arguments`
4. **Pair with attestation**: Use [Zero-Trust Attestation](/governance/zero-trust-attestation) to cryptographically sign the lockfile digest at build time
