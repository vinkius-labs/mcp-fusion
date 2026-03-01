# MCP Fusion — E-Commerce Example

Full-featured MCP server built with **MCP Fusion** showcasing the complete pipeline — tools, Presenters, middleware, prompts — plus the **Inspector TUI** for real-time observability.

## What's Inside

| Module | Description | Inspector Visibility |
|--------|-------------|-------------------:|
| **User Tools** | CRUD (list, get, create, update, delete) | Validate, Execute, Presenter events |
| **Order Tools** | Workflow (pending → confirmed → shipped → cancelled) | suggestActions flow |
| **Product Tools** | Catalog with inventory management | Schema validation |
| **System Tools** | Health check and diagnostics | Read-only badge |
| **Presenters** | UserPresenter, OrderPresenter, ProductPresenter, SystemPresenter | Late Guillotine (raw → wire bytes savings) |
| **Middleware** | `withAuth` — RBAC guard that blocks GUEST | Middleware chain count |
| **Prompts** | `GreetPrompt` — interactive prompt | Prompt topology tab |
| **Agent Limit** | UserListPresenter caps at 50 results | Cognitive Guardrail in X-Ray |

---

## Step 1 — Install Dependencies

```bash
cd examples/e-commerce
npm install
```

---

## Step 2 — Configure your IDE

### VS Code (GitHub Copilot)

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

1. Open `examples/e-commerce/` in VS Code
2. Open **Copilot Chat** (`Ctrl+Shift+I`)
3. Click **🔧 (tools)** → enable the `e-commerce` server
4. Start chatting: `"List all users"`, `"Create an order for user u1"`

### Cursor

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
2. **Settings → MCP Servers** → enable `e-commerce`

---

## Step 3 — Inspector TUI (Real-Time Dashboard)

The **Inspector** is the interactive terminal dashboard that connects to your server via **Shadow Socket** — zero stdio interference, no port conflicts.

### Demo Mode (no server needed)

```bash
npx fusion insp --demo
```

Launches a built-in simulator that emits realistic events so you can explore the TUI immediately.

### Live Mode (connects to your running server)

```bash
# Terminal 1 — Start the e-commerce server
npm start

# Terminal 2 — Launch Inspector
npx fusion inspect
```

### Headless Mode (CI / ECS / K8s)

```bash
# Colored stderr output
npx fusion insp --out stderr --demo

# NDJSON (for log aggregation)
FUSION_LOG_FORMAT=json npx fusion insp --out stderr
```

### What You See in the Inspector

When you invoke tools from Copilot/Cursor, the Inspector shows the **full pipeline** in real time:

```
Topology Panel                      X-Ray Inspector (press Enter)
┌────────────────────────────┐     ┌──────────────────────────────────┐
│ ✓ users.list      12ms R/O│     │ LAST INPUT (Zod Validated):      │
│ ✓ users.get        8ms R/O│     │   { "id": "u1" }                 │
│ ✗ orders.create  112ms W  │     │                                  │
│ ⋯ products.list   --ms R/O│     │ LATE GUILLOTINE:                 │
│ ✓ system.health    2ms R/O│     │   DB Raw     : 4.2 KB            │
└────────────────────────────┘     │   LLM Wire   : 1.1 KB            │
                                   │   SAVINGS    : ████████░░ 73.8%  │
Traffic Log                        │                                  │
┌────────────────────────────┐     │ COGNITIVE RULES:                 │
│ ROUTE  users.list          │     │   1. "Never expose emails"       │
│ ZOD    ✓ 1ms               │     │   2. "Format dates as ISO 8601"  │
│ MW     chain(1)            │     │                                  │
│ EXEC   ✓ 12ms              │     │ CALL HISTORY (last 5):           │
│ SLICE  4.2KB → 1.1KB       │     │   19:32:01  12ms  ✓  list users │
│ RULES  2 rules injected    │     │   19:31:58   8ms  ✓  get user   │
└────────────────────────────┘     └──────────────────────────────────┘
```

| Inspector Panel | What This Example Triggers |
|---------------|---------------------------|
| **Zod Validation** | Every tool has schemas — validation time appears on every call |
| **Middleware Chain** | `withAuth` adds chain(1) visible in traffic log |
| **Late Guillotine** | Presenters filter raw DB data → smaller wire payload (savings %) |
| **Cognitive Rules** | UserPresenter: "Never expose emails"; OrderPresenter: "Display $ prefix" |
| **Cognitive Guardrails** | `UserListPresenter.agentLimit(50)` — truncation appears in X-Ray |
| **suggestActions** | OrderPresenter suggests `confirm` / `ship` / `cancel` based on status |
| **Error Autopsy** | Invalid inputs or business logic errors show full exception + recovery |

---

## Test Prompts

Try these in Copilot/Cursor Chat to see the Inspector light up:

```
List all users
```
```
Create a user with name "John" email "john@test.com" and role "ADMIN"
```
```
Create an order for user "u1" with product "p1" quantity 2
```
```
Confirm order "o1"
```
```
Show system health
```

---

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the MCP server (stdio) |
| `fusion dev` | Start HMR dev server with auto-reload |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type-check without compiling |
| `npm test` | Run tests |
| `npx fusion insp --demo` | Inspector TUI with simulator |
| `npx fusion inspect` | Inspector TUI connected to server |

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
