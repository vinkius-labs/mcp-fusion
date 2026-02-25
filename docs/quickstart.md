# Quickstart

Let's build your very first **MCP Fusion** server in less than 5 minutes. We will create a simple "Calculator" tool that an AI can use to add or subtract numbers.

---

## 1. Installation

First, install `mcp-fusion`, the official `@modelcontextprotocol/sdk`, and `zod` into your Node.js project.

::: code-group
```bash [npm]
npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [pnpm]
pnpm add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
```bash [yarn]
yarn add @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod
```
:::

::: tip Zod is Optional
Since v2.7, MCP Fusion supports any [Standard Schema v1](https://github.com/standard-schema/standard-schema) validator — Valibot, ArkType, TypeBox. Zod remains the recommended default. See [Standard Schema](/dx-guide#standard-schema-decouple-from-zod).
:::

---

## 2. Write the Server

Create an `index.ts` file. **MCP Fusion** offers **three API styles** — choose the one that fits your team:

::: code-group
```typescript [initFusion — No Zod 🚀]
// index.ts — ZERO Zod imports!
import { initFusion, ToolRegistry } from '@vinkius-core/mcp-fusion';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 1. Initialize Fusion — define context type ONCE
const f = initFusion<void>();

// 2. Define tools with plain JSON descriptors — no Zod needed!
const add = f.tool({
    name: 'calculator.add',
    description: 'Adds two numbers together',
    input: {
        a: { type: 'number', description: 'The first number' },
        b: { type: 'number', description: 'The second number' },
    },
    handler: async ({ input }) => {
        return { result: input.a + input.b };
    },
});

const subtract = f.tool({
    name: 'calculator.subtract',
    description: 'Subtracts the second number from the first',
    input: { a: 'number', b: 'number' },
    handler: async ({ input }) => {
        return { result: input.a - input.b };
    },
});

// 3. Register and start
const registry = f.registry();
registry.register(add);
registry.register(subtract);

async function start() {
    const server = new Server(
        { name: 'my-calculator', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );
    registry.attachToServer(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Calculator Server is running!');
}

start();
```
```typescript [initFusion — Zod]
// index.ts
import { initFusion } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 1. Initialize Fusion — define context type ONCE
const f = initFusion<void>();

// 2. Define tools with f.tool() — zero generics, { input, ctx } handler
const add = f.tool({
    name: 'calculator.add',
    description: 'Adds two numbers together',
    input: z.object({
        a: z.number().describe('The first number'),
        b: z.number().describe('The second number'),
    }),
    handler: async ({ input }) => {
        return { result: input.a + input.b };
    },
});

const subtract = f.tool({
    name: 'calculator.subtract',
    description: 'Subtracts the second number from the first',
    input: z.object({ a: z.number(), b: z.number() }),
    handler: async ({ input }) => {
        return { result: input.a - input.b };
    },
});

// 3. Register and start
const registry = f.registry();
registry.register(add);
registry.register(subtract);

async function start() {
    const server = new Server(
        { name: 'my-calculator', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );
    registry.attachToServer(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Calculator Server is running!');
}

start();
```
```typescript [defineTool — No Zod]
// index.ts
import { defineTool, ToolRegistry, success } from '@vinkius-core/mcp-fusion';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 1. Define a tool with plain JSON descriptors — no Zod needed!
const calculatorTool = defineTool<void>('calculator', {
    description: 'A basic calculator tool for math operations',
    actions: {
        add: {
            description: 'Adds two numbers together',
            params: {
                a: { type: 'number', description: 'The first number' },
                b: { type: 'number', description: 'The second number' },
            },
            handler: async (ctx, args) => {
                const total = args.a + args.b;
                return success({ result: total });
            },
        },
        subtract: {
            description: 'Subtracts the second number from the first',
            params: { a: 'number', b: 'number' },
            handler: async (ctx, args) => {
                const total = args.a - args.b;
                return success({ result: total });
            },
        },
    },
});

// 2. Register and start
const registry = new ToolRegistry<void>();
registry.register(calculatorTool);

async function start() {
    const server = new Server(
        { name: 'my-calculator', version: '1.0.0' }, 
        { capabilities: { tools: {} } }
    );
    registry.attachToServer(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Calculator Server is running!');
}

start();
```
```typescript [createTool — Full Zod]
// index.ts
import { createTool, ToolRegistry, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 1. Create a tool group with Zod schemas
const calculatorTool = createTool<void>('calculator')
    .description('A basic calculator tool for math operations')
    .action({
        name: 'add',
        description: 'Adds two numbers together',
        schema: z.object({
            a: z.number().describe('The first number'),
            b: z.number().describe('The second number'),
        }),
        handler: async (ctx, args) => {
            const total = args.a + args.b;
            return success({ result: total });
        }
    })
    .action({
        name: 'subtract',
        description: 'Subtracts the second number from the first',
        schema: z.object({
            a: z.number(),
            b: z.number(),
        }),
        handler: async (ctx, args) => {
            const total = args.a - args.b;
            return success({ result: total });
        }
    });

// 2. Register and start
const registry = new ToolRegistry<void>();
registry.register(calculatorTool);

async function start() {
    const server = new Server(
        { name: 'my-calculator', version: '1.0.0' }, 
        { capabilities: { tools: {} } }
    );
    registry.attachToServer(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Calculator Server is running!');
}

start();
```
:::

---

## 3. What just happened?

If you were interacting directly with the native MCP SDK, you would have had to manually write JSON logic, create switch statements, manually check if `a` and `b` existed, and handle errors.

With **MCP Fusion**:
1. You just passed simple descriptors (`'number'`, `{ type: 'number', description: '...' }`).
2. If the LLM tries to call your `add` tool and forgets to send `b`, Fusion instantly catches it and tells the LLM `"Error: b is required"` without your handler code ever running.
3. **No Hallucinations:** If the LLM tries to send a `c` value, Fusion rejects it with an actionable error telling the LLM exactly which fields are valid. Your handler is perfectly safe.

::: tip JSON Descriptors or Zod — Your Choice
You can use plain JSON descriptors (`'string'`, `{ type: 'number' }`, `{ enum: [...] }`) or Zod schemas. MCP Fusion internally converts JSON descriptors to Zod at runtime — you get the same validation guarantees either way. Use what feels natural.
:::

::: tip initFusion() Pattern
Notice how `initFusion()` eliminates the `<void>` generic parameter — you define the context type once and every `f.tool()`, `f.presenter()`, and `f.registry()` inherits it automatically. When your context grows to include `db`, `user`, etc., you change it in exactly **one place**.
:::

---

## 3b. Add a Prompt <Badge type="tip" text="NEW v2.7" />

Tools do work. **Prompts** are reusable templates that pre-fill context for the LLM. Use `f.prompt()` to define prompts the same way you define tools:

::: code-group
```typescript [f.prompt() — No Zod 🚀]
import { PromptMessage } from '@vinkius-core/mcp-fusion';

const codeReview = f.prompt({
    name: 'code-review',
    description: 'Review code and suggest improvements',
    args: {
        language: { enum: ['typescript', 'python', 'go'] as const },
        focus: {
            type: 'string',
            description: 'Area to focus on (e.g., performance, security)',
            optional: true,
        },
    } as const,
    handler: async ({ args }) => {
        const focusHint = args.focus ? ` Focus on ${args.focus}.` : '';
        return [
            PromptMessage.user(
                `Review the following ${args.language} code.${focusHint} ` +
                `Suggest concrete improvements with code examples.`
            ),
        ];
    },
});

// Register it alongside your tools
const registry = f.registry();
registry.registerPrompt(codeReview);
```
```typescript [f.prompt() — Zod]
import { z } from 'zod';
import { PromptMessage } from '@vinkius-core/mcp-fusion';

const codeReview = f.prompt({
    name: 'code-review',
    description: 'Review code and suggest improvements',
    args: z.object({
        language: z.enum(['typescript', 'python', 'go']),
        focus: z.string().describe('Area to focus on').optional(),
    }),
    handler: async ({ args }) => {
        const focusHint = args.focus ? ` Focus on ${args.focus}.` : '';
        return [
            PromptMessage.user(
                `Review the following ${args.language} code.${focusHint} ` +
                `Suggest concrete improvements with code examples.`
            ),
        ];
    },
});
```
:::

::: info Prompts vs Tools
| | Tools | Prompts |
|---|---|---|
| **Purpose** | Execute actions | Provide context templates |
| **Input** | `input:` (supports arrays) | `args:` (form-friendly, no arrays) |
| **Returns** | `{ result }` or `{ error }` | `PromptMessage[]` |
| **When** | LLM calls them | User selects from a menu |
:::

### How the LLM sees it
Because of Fusion's structured builder, the AI automatically sees a perfectly condensed tool definition like this:

```json
{
  "name": "calculator",
  "description": "A basic calculator tool for math operations. Actions: add, subtract",
  "inputSchema": {
    "properties": {
      "action": { "type": "string", "enum": ["add", "subtract"] },
      "a": { "type": "number", "description": "The first number. Required for: add, subtract" },
      "b": { "type": "number", "description": "The second number. Required for: add, subtract" }
    }
  }
}
```

The AI just sets `"action": "add"` and passes the numbers. It's that easy.

---

## 4. Scale with File-Based Routing <Badge type="tip" text="NEW v2.7" />

As your project grows, use `autoDiscover()` instead of manually importing every tool:

```typescript
import { initFusion, autoDiscover } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();
const registry = f.registry();

// Scan src/tools/ and auto-register everything
await autoDiscover(registry, './src/tools');
```

File structure becomes your routing table:
```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    ├── list.ts         → users.list
    └── ban.ts          → users.ban
```

→ [File-Based Routing Guide](/dx-guide#file-based-routing-autodiscover)

---

## 5. Enable HMR for Development <Badge type="tip" text="NEW v2.7" />

Stop restarting your LLM client every time you change a tool:

```typescript
import { createDevServer, autoDiscover } from '@vinkius-core/mcp-fusion/dev';

const devServer = createDevServer({
    dir: './src/tools',
    setup: async (registry) => await autoDiscover(registry, './src/tools'),
    onReload: (file) => console.log(`♻️ Reloaded: ${file}`),
    server: mcpServer,
});
await devServer.start();
```

→ [HMR Dev Server Guide](/dx-guide#hmr-dev-server-createdevserver)

---

## Next Steps

<div class="next-steps">

- [**DX Guide →**](/dx-guide) — `initFusion()`, `definePresenter()`, `autoDiscover()`, Standard Schema
- [**Namespaces & Routing →**](/routing) — Structure real-world APIs using groups
- [**Presenter →**](/presenter) — Add domain rules, UI blocks, and agent affordances
- [**Building Tools →**](/building-tools) — `defineTool()`, `createTool()`, and `f.tool()` in depth

</div>
