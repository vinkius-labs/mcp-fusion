# Capability Lockfile

- [Introduction](#introduction)
- [Why a Lockfile?](#why)
- [Generating with the CLI](#generating)
- [Verifying in CI](#ci)
- [Registry API](#registry)

## Introduction {#introduction}

A Capability Lockfile is a **snapshot of your MCP server's behavioral surface** — every tool, its parameters, annotations, prompts, and an integrity digest — frozen in `mcp-fusion.lock`. It serves as the single source of truth for what your server exposes.

This is the MCP equivalent of `package-lock.json` — it ensures that your tool surface doesn't change unexpectedly between deploys.

## Why a Lockfile? {#why}

| Change | Breaking? | Why |
|---|---|---|
| Rename a tool | ✅ Yes | Agent calls the old name |
| Remove a tool | ✅ Yes | Agent calls a tool that doesn't exist |
| Remove a parameter | ✅ Yes | Agent sends a parameter that gets rejected |
| Add a required parameter | ✅ Yes | Agent doesn't know to send it |
| Add an optional parameter | ❌ No | Old calls still work |
| Add a new tool | ❌ No | Agent simply gains a new capability |

## Generating with the CLI {#generating}

Use the built-in `fusion lock` command. It loads your server entrypoint, compiles tool contracts, discovers prompts, computes behavioral digests, and writes `mcp-fusion.lock`:

```bash
fusion lock --server ./src/server.ts
```

Output:

```text
  fusion lock — Generating mcp-fusion.lock

  ● Resolving server entrypoint — my-mcp-server (42ms)
  ● Compiling tool contracts — 18 tools (15ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Computing behavioral digests (8ms)
  ● Writing mcp-fusion.lock (3ms)

✓ mcp-fusion.lock generated (18 tools, 3 prompts).
  Integrity: sha256-abc123...
```

Options:

| Flag | Description |
|---|---|
| `--server, -s <path>` | Path to server entrypoint (required) |
| `--name, -n <name>` | Server name for lockfile header |
| `--cwd <dir>` | Project root directory |

The CLI auto-discovers the `ToolRegistry` from your module. It supports common export patterns:

```typescript
// All of these are auto-detected:
export const registry = new ToolRegistry();
export const fusion = initFusion();
export default { registry };
```

## Verifying in CI {#ci}

Use `--check` to verify the lockfile matches the current server. Exits `0` if up-to-date, `1` if stale:

```bash
fusion lock --check --server ./src/server.ts
```

If the tool surface has changed:

```text
  fusion lock — Verifying mcp-fusion.lock

  ● Resolving server entrypoint — my-mcp-server
  ● Compiling tool contracts — 18 tools
  ● Discovering prompts — 3 prompts
  ✗ Verifying integrity — stale

✗ Lockfile is stale.
  + Tools added: projects.archive
  - Tools removed: users.deactivate
  ~ Tools changed: billing.charge
```

Add to your CI pipeline:

```yaml
# .github/workflows/lockfile.yml
name: Lockfile Check
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx fusion lock --check --server ./src/server.ts
```

> [!TIP]
> Commit `mcp-fusion.lock` to version control. After a deliberate breaking change, regenerate the lockfile with `fusion lock --server ./src/server.ts` and commit it.

## Registry API {#registry}

For programmatic access (admin dashboards, test harnesses), use the `ToolRegistry` directly:

```typescript
const registry = new ToolRegistry<AppContext>();
registry.registerAll(...tools);

// All compiled MCP tool definitions
const allTools = registry.getAllTools();

// Filtered by tags
const publicTools = registry.getTools({ tags: ['public'] });
const nonAdminTools = registry.getTools({ exclude: ['admin'] });

// Check if a tool exists
registry.has('projects');  // true

// Count registered tools
registry.size;             // 42

// Iterate over raw builders
for (const builder of registry.getBuilders()) {
  console.log(builder.getName(), builder.getTags());
}
```
