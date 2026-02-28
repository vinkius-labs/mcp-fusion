# MCP Fusion — E-Commerce Example

Full-featured MCP server built with **MCP Fusion** showcasing tools, presenters, prompts, and middleware in an e-commerce domain.

## What's Inside

| Module | Description |
|--------|-------------|
| **User Tools** | Full CRUD (list, get, create, update, delete) with auth middleware |
| **Order Tools** | Workflow with stock validation, status transitions (pending → confirmed → shipped) |
| **Product Tools** | Catalog with inventory management |
| **System Tools** | Health check and diagnostics |
| **Presenters** | UserPresenter, OrderPresenter, ProductPresenter, SystemPresenter |
| **Middleware** | `withAuth` — RBAC guard that blocks GUEST |
| **Prompts** | `GreetPrompt` — interactive prompt |

---

## Step 1 — Install Dependencies

```bash
cd examples/e-commerce
npm install
```

---

## Step 2 — Configure in VS Code (Copilot / MCP)

The `.vscode/mcp.json` file is already configured:

```json
{
    "servers": {
        "e-commerce": {
            "type": "stdio",
            "command": "npx",
            "args": ["tsx", "src/server.ts"],
            "cwd": "${workspaceFolder}"
        }
    }
}
```

### How to activate:

1. **Open the `examples/e-commerce/` folder in VS Code** (the folder containing `package.json`)
2. Open **Copilot Chat** (`Ctrl+Shift+I` or click the Copilot icon)
3. In Copilot Chat, click the **🔧 (tools)** icon at the bottom
4. The `e-commerce` server should appear in the list — enable it
5. Now Copilot can use all tools automatically

### Test in Copilot Chat:

```
List all users
```
```
Create a user with name "John" email "john@test.com" and role "ADMIN"
```
```
Create an order for user "u1" with product "p1" quantity 2
```

---

## Alternative — Configure in Cursor

The `.cursor/mcp.json` file is already configured:

```json
{
    "mcpServers": {
        "e-commerce": {
            "command": "npx",
            "args": ["tsx", "src/server.ts"]
        }
    }
}
```

1. Open the folder in Cursor
2. Go to **Settings → MCP Servers**
3. The `e-commerce` server appears automatically — enable it

---

## Step 3 — Davinci TUI (Terminal Dashboard)

**Davinci** is the real-time interactive dashboard for MCP Fusion. It shows requests, latency, errors, and live metrics.

### Demo Mode (with built-in simulator — no server needed):

```bash
npx fusion dv --demo
```

### TUI Mode (connects to a running server):

```bash
# Terminal 1 — Start the server
npm start

# Terminal 2 — Launch the Davinci TUI
npx fusion davinci
```

### Headless Mode (stderr — for CI/ECS/K8s logs):

```bash
npx fusion dv --out stderr --demo
```

### Connect to a specific PID:

```bash
npx fusion dv --pid <SERVER_PID>
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the MCP server (stdio) |
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without compiling |
| `npm test` | Run tests |
| `npx fusion dv --demo` | TUI dashboard with simulator |
| `npx fusion davinci` | TUI dashboard connected to server |

---

## Structure

```
e-commerce/
├── src/
│   ├── server.ts          # Bootstrap — startServer() + autoDiscover
│   ├── fusion.ts          # initFusion<AppContext>()
│   ├── context.ts         # AppContext type
│   ├── db.ts              # In-memory database
│   ├── middleware/
│   │   └── auth.ts        # withAuth — RBAC guard
│   ├── tools/
│   │   ├── user/          # CRUD users
│   │   ├── order/         # Order workflow
│   │   ├── product/       # Product catalog
│   │   └── system/        # Health check
│   ├── presenters/        # MVA Presenters (schema + rules + UI)
│   └── prompts/           # Interactive prompts
├── .vscode/mcp.json       # VS Code MCP config
├── .cursor/mcp.json       # Cursor MCP config
└── package.json
```
