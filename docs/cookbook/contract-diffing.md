# Contract Diffing

- [Introduction](#introduction)
- [What Changes Break Agents?](#breaking)
- [Using fusion lock --check](#using)
- [CI Integration](#ci)
- [Reading the Diff Output](#reading)

## Introduction {#introduction}

When you rename a tool, change a parameter, or modify a Presenter schema, existing agent workflows can break silently. The `fusion lock --check` command detects these changes by comparing the current server against the committed [lockfile](/cookbook/capability-lockfile) — so you catch breaking changes before deployment.

## What Changes Break Agents? {#breaking}

| Change | Breaking? | Why |
|---|---|---|
| Rename a tool | ✅ Yes | Agent calls the old name |
| Remove a tool | ✅ Yes | Agent calls a tool that doesn't exist |
| Remove a parameter | ✅ Yes | Agent sends a parameter that gets rejected |
| Add a required parameter | ✅ Yes | Agent doesn't know to send it |
| Add an optional parameter | ❌ No | Old calls still work |
| Add a new tool | ❌ No | Agent simply gains a new capability |
| Change Presenter schema | ⚠️ Maybe | If agent logic depends on specific fields |

## Using fusion lock --check {#using}

After committing a `mcp-fusion.lock`, use `--check` to verify the current server matches:

```bash
fusion lock --check --server ./src/server.ts
```

If the tool surface has drifted, the CLI reports exactly what changed:

```text
✗ Lockfile is stale.
  + Tools added: projects.archive
  - Tools removed: users.deactivate
  ~ Tools changed: billing.charge
  + Prompts added: sprint-plan
  - Prompts removed: legacy-review
  ~ Prompts changed: code-review
```

The exit code is `1` when stale, making it a perfect CI gate.

## CI Integration {#ci}

Add lockfile verification to your CI pipeline:

```yaml
# .github/workflows/contract.yml
name: Contract Check
on: [pull_request]

jobs:
  contract-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx fusion lock --check --server ./src/server.ts
```

If the check fails, the developer knows they changed the tool surface and must:

1. Review the changes to ensure they're intentional
2. Regenerate the lockfile: `fusion lock --server ./src/server.ts`
3. Commit the updated `mcp-fusion.lock`

## Reading the Diff Output {#reading}

The diff output uses three prefixes:

| Prefix | Meaning |
|---|---|
| `+` | Added — new tool or prompt appeared |
| `-` | Removed — tool or prompt was deleted |
| `~` | Changed — existing tool/prompt had its contract modified |

The check compiles behavioral contracts from each tool builder and compares their digests against the lockfile. A `~` changed entry means the tool's schema, annotations, or presenter configuration has been modified — even if the tool name stayed the same.

> [!IMPORTANT]
> After a deliberate breaking change, regenerate the lockfile: `fusion lock --server ./src/server.ts`. Commit the updated `mcp-fusion.lock` so future checks compare against the new baseline.
