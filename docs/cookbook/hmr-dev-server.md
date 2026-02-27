# HMR Dev Server

- [Introduction](#introduction)
- [CLI Usage](#cli)
- [Programmatic API](#api)
- [Configuration](#config)
- [How It Works](#how)

## Introduction {#introduction}

The HMR (Hot Module Replacement) dev server is the **killer feature** for MCP development. Change a tool file, save, and the running MCP server reloads instantly — no restart, no reconnect. The connected LLM client receives a `notifications/tools/list_changed` notification and automatically refreshes its tool list.

## CLI Usage {#cli}

The fastest way to start:

```bash
fusion dev
```

The CLI auto-detects your server entrypoint by probing common paths: `src/server.ts`, `src/index.ts`, `server.ts`, `index.ts` (and `.js` variants).

For explicit control:

```bash
fusion dev --server ./src/server.ts --dir ./src/tools
```

Options:

| Flag | Description |
|---|---|
| `--server, -s <path>` | Path to server entrypoint (default: auto-detect) |
| `--dir, -d <path>` | Directory to watch for changes (default: auto-detect from server path) |

The CLI auto-detects the watch directory from your `--server` path. If the server is at `src/server.ts`, it watches `src/`. You can override with `--dir`.

Add to `package.json` for convenience:

```json
{
  "scripts": {
    "dev": "fusion dev"
  }
}
```

## Programmatic API {#api}

For more control, use `createDevServer()` directly:

```typescript
import { createDevServer, autoDiscover, ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();

const devServer = createDevServer({
  dir: './src/tools',
  setup: async (reg) => {
    reg.clear?.();
    await autoDiscover(reg, './src/tools');
  },
  onReload: (file) => console.log(`[HMR] Reloaded: ${file}`),
});

await devServer.start();
```

## Configuration {#config}

The `DevServerConfig` interface:

| Option | Type | Default | Description |
|---|---|---|---|
| `dir` | `string` | — | Directory to watch for changes |
| `extensions` | `string[]` | `['.ts', '.js', '.mjs', '.mts']` | File extensions to watch |
| `debounce` | `number` | `300` | Milliseconds to debounce file changes |
| `setup` | `(registry) => void` | — | Reload callback — re-register tools |
| `onReload` | `(changedFile) => void` | — | Optional notification when a file reloads |
| `server` | `McpServer` | — | Optional MCP server for tool list change notifications |

When `server` is provided, the dev server sends `notifications/tools/list_changed` after each reload — the connected LLM client auto-refreshes its tool list.

## How It Works {#how}

```text
1. fusion dev
    ↓
2. Auto-detect src/server.ts (or --server flag)
    ↓
3. Resolve ToolRegistry from entrypoint
    ↓
4. Initial setup() → register all tools
    ↓
5. Watch dir/ for changes (.ts, .js, .mjs, .mts)
    ↓
[file saved]
    ↓
6. Debounce (300ms)
    ↓
7. Invalidate Node.js module cache
    ↓
8. Re-run setup() → re-register tools
    ↓
9. Send notifications/tools/list_changed → LLM refreshes
```

The dev server invalidates the Node.js ESM module cache using a timestamp cache-busting trick, forcing re-evaluation of changed modules. For CJS, it clears `require.cache`.

> [!TIP]
> The dev server exposes a `reload(reason?)` method for manual reloads and a `stop()` for clean shutdown. The CLI handles `SIGINT` (Ctrl+C) automatically.