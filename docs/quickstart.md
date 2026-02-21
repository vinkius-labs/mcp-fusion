# Quickstart

Let's build your very first MCP Fusion server in less than 5 minutes. We will create a simple "Calculator" tool that an AI can use to add or subtract numbers.

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

---

## 2. Write the Server

Create an `index.ts` file. In MCP Fusion, you build tools by creating a `GroupedToolBuilder` and attaching `.action()` endpoints to it.

```typescript
// index.ts
import { createTool, ToolRegistry, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// 1. Create a tool group called "calculator"
const calculatorTool = createTool<void>('calculator')
    .description('A basic calculator tool for math operations')
    
    // 2. Add our first operation (an action)
    .action({
        name: 'add',
        description: 'Adds two numbers together',
        schema: z.object({
            a: z.number().describe('The first number'),
            b: z.number().describe('The second number'),
        }),
        handler: async (ctx, args) => {
            // Because of Zod, TypeScript KNOWS args.a and args.b are numbers!
            const total = args.a + args.b;
            return success({ result: total });
        }
    })
    
    // 3. Add our second operation
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

// 4. Register the tool on our framework
const registry = new ToolRegistry<void>();
registry.register(calculatorTool);

// 5. Initialize the official MCP Server and connect them
async function start() {
    const server = new Server(
        { name: 'my-calculator', version: '1.0.0' }, 
        { capabilities: { tools: {} } }
    );

    // This wires our tools seamlessly into the MCP protocol!
    registry.attachToServer(server);

    // Connect via standard input/output (the default for MCP)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Calculator Server is running!');
}

start();
```

---

## 3. What just happened?

If you were interacting directly with the native MCP SDK, you would have had to manually write JSON logic, create switch statements, manually check if `a` and `b` existed, and handle errors.

With **MCP Fusion**:
1. You just passed simple Zod objects (`z.number()`).
2. If the LLM tries to call your `add` tool and forgets to send `b`, Fusion instantly catches it and tells the LLM `"Error: b is required"` without your handler code ever running.
3. **No Hallucinations:** If the LLM tries to send a `c` value, Fusion silently strips it away. Your handler is perfectly safe.

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

Now that you have your first tool running, let's explore how to structure real-world APIs using [Namespaces & Routing](/routing).
