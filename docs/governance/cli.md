---
title: "CLI Reference"
description: "The fusion CLI — generate, verify, and manage capability lockfiles from the command line."
---

# CLI Reference

::: tip One-Liner
`fusion lock` captures the behavioral surface. `fusion lock --check` gates the CI build.
:::

---

## Installation

The CLI is included in `@vinkius-core/mcp-fusion` and available as `fusion` via npx:

```bash
npx fusion lock --server ./src/server.ts
```

Or install globally:

```bash
npm install -g @vinkius-core/mcp-fusion
fusion lock --server ./src/server.ts
```

---

## Commands

### `fusion lock`

Generate or update `mcp-fusion.lock` — a deterministic, git-diffable snapshot of the server's complete behavioral surface.

```bash
fusion lock --server ./src/server.ts
```

Output:

```
  fusion lock — Generating mcp-fusion.lock

  ● Resolving server entrypoint — payments-api (12ms)
  ● Compiling tool contracts — 8 tools (45ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Computing behavioral digests (120ms)
  ● Writing mcp-fusion.lock (5ms)

✓ mcp-fusion.lock generated (8 tools, 3 prompts).
  Integrity: sha256:a1b2c3d4e5f6...
```

### `fusion lock --check`

Verify the lockfile matches the current server surface. Exits with code 0 if up-to-date, code 1 if stale. Designed for CI gates.

```bash
fusion lock --check --server ./src/server.ts
```

When stale:

```
  fusion lock — Verifying mcp-fusion.lock

  ● Resolving server entrypoint — payments-api (12ms)
  ● Compiling tool contracts — 8 tools (45ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Reading existing lockfile (3ms)
  ✗ Verifying integrity — stale (1ms)

✗ Lockfile is out of date.
  + Tools added: webhooks
  ~ Tools changed: invoices
  - Prompts removed: legacy-greeting
```

---

## Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | — | Path to server entrypoint. **Required.** |
| `--name <name>` | `-n` | Auto-detected | Server name for the lockfile header. Falls back to the export name or `mcp-fusion-server`. |
| `--cwd <dir>` | — | `process.cwd()` | Project root directory. The lockfile is written to / read from this directory. |
| `--check` | — | — | Verify mode: compare the lockfile to the live surface without writing. |
| `--help` | `-h` | — | Show help message. |

---

## Registry Auto-Discovery

The CLI needs to resolve a `ToolRegistry` from your server entrypoint. It supports three export patterns, tried in order:

### 1. Named `registry` Export

```typescript
// src/server.ts
export const registry = new ToolRegistry();
export const serverName = 'payments-api';
```

### 2. Named `fusion` Export (initFusion Pattern)

```typescript
// src/server.ts
export const fusion = initFusion({
    name: 'payments-api',
    registry,
});
```

### 3. Default Export

```typescript
// src/server.ts
export default { registry, serverName: 'payments-api' };
```

If none of these patterns match, the CLI exits with a descriptive error explaining the expected export shapes.

---

## Prompt Discovery

The CLI also discovers prompt registries for inclusion in the lockfile. It looks for these exports in the same entrypoint:

- `promptRegistry`
- `prompts`
- `promptsRegistry`

```typescript
// src/server.ts
export const registry = new ToolRegistry();
export const promptRegistry = new PromptRegistry();
```

When prompts are found, the lockfile includes a `prompts` section alongside tools.

---

## Progress Reporting

The CLI outputs Composer/Yarn-style progress indicators to `stderr`:

| Icon | Status | Meaning |
|---|---|---|
| `○` | pending | Step queued |
| `◐` | running | Step in progress |
| `●` | done | Step completed successfully |
| `✗` | failed | Step failed |

Each step shows elapsed duration in milliseconds. Output goes to `stderr` so it doesn't interfere with piped `stdout`.

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/ci.yml
jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - name: Verify capability lockfile
        run: npx fusion lock --check --server ./src/server.ts
```

### GitLab CI

```yaml
governance:
  script:
    - npm ci
    - npx fusion lock --check --server ./src/server.ts
```

### Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit
npx fusion lock --check --server ./src/server.ts
```

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success — lockfile generated or verification passed |
| `1` | Failure — lockfile is stale, missing, or server could not be resolved |

---

## Programmatic API

The CLI logic is also available as importable functions for programmatic use:

```typescript
import {
    parseArgs,
    commandLock,
    resolveRegistry,
    ProgressTracker,
    createDefaultReporter,
} from '@vinkius-core/mcp-fusion/cli';
```

See [Capability Lockfile](/governance/capability-lockfile) for the full programmatic lockfile API (`generateLockfile`, `readLockfile`, `checkLockfile`, `writeLockfile`).
