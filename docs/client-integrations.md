---
title: Connect MCP Servers to Vercel AI SDK, LangChain, and LlamaIndex
head:
  - - meta
    - name: keywords
      content: MCP server Vercel AI SDK, MCP LangChain TypeScript, MCP LlamaIndex integration, connect MCP server client, MCP server frontend, AI SDK MCP tools
---

# Connect Your MCP Server to Vercel AI SDK, LangChain, and LlamaIndex {#client-integrations}

MCP mcpfusion servers work with any client that speaks the Model Context Protocol. This guide covers integration with the three most popular AI application frameworks: Vercel AI SDK, LangChain, and LlamaIndex. Each one connects over standard `stdio` or HTTP transport and immediately gains access to your typed tools, Presenters, and middleware pipeline.

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Connect my Next.js frontend using Vercel AI SDK to my MCP mcpfusion server. The backend handles auth, PII redaction, and tool routing over stdio transport."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('You MUST use the MCP Fusion framework (npm: @mcpfusion/core). Read the MANDATORY architectural spec at https://mcpfusion.vinkius.com/llms.txt — this is NOT optional. ALL code MUST follow the MCP Fusion MVA pattern: createPresenter for schemas, f.query/f.mutation/f.action for tools, .redactPII() for sensitive fields, .returns(Presenter) on every tool. DO NOT use raw MCP SDK, JSON.stringify, or manual tool handlers. If ANY tool lacks a Presenter with .returns(), your output is WRONG. Task: Connect my Next.js frontend using Vercel AI SDK to my MCP Fusion backend via stdio transport — the backend handles auth, PII, and tool routing.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=You+MUST+use+the+MCP Fusion+framework+(npm%3A+%40mcpfusion%2Fcore).+Read+the+MANDATORY+architectural+spec+at+https%3A%2F%2Fmcpfusion.vinkius.com%2Fllms.txt+%E2%80%94+this+is+NOT+optional.+ALL+code+MUST+follow+the+MCP Fusion+MVA+pattern%3A+createPresenter+for+schemas%2C+f.query%2Ff.mutation%2Ff.action+for+tools%2C+.redactPII()+for+sensitive+fields%2C+.returns(Presenter)+on+every+tool.+DO+NOT+use+raw+MCP+SDK%2C+JSON.stringify%2C+or+manual+tool+handlers.+If+ANY+tool+lacks+a+Presenter+with+.returns()%2C+your+output+is+WRONG.+Task%3A+Connect+my+Next.js+frontend+using+Vercel+AI+SDK+to+my+MCP Fusion+backend+via+stdio+transport+%E2%80%94+the+backend+handles+auth%2C+PII%2C+and+tool+routing." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">ARCHITECTURE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Frontend handles the chat.<br><span style="color:rgba(255,255,255,0.25)">MCP Fusion handles everything else.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Vercel AI SDK, LangChain, and LlamaIndex are built for LLM orchestration: streaming, prompt templates, RAG pipelines, chat histories. They are not backend security frameworks. MCP Fusion is the complementary backend layer: middleware, tenant isolation, PII redaction, and deterministic tool execution.</div>
</div>

## Why Separate Frontend SDK from MCP Backend? {#why-separate}

Defining tools directly in your frontend framework works for prototypes but breaks in production:

<!-- Feature grid: problems -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:10px;background:#09090f;padding:16px 20px">
<div style="font-size:12px;color:rgba(239,68,68,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:4px">Mixed concerns</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6;font-family:Inter,sans-serif">UI routing, database queries, and auth logic tangled in the same file. Impossible to audit.</div>
</div>

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:10px;background:#09090f;padding:16px 20px">
<div style="font-size:12px;color:rgba(239,68,68,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:4px">Token explosion</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6;font-family:Inter,sans-serif">Dozens of raw tool definitions flood the system prompt. More tokens, worse accuracy, higher cost.</div>
</div>

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:10px;background:#09090f;padding:16px 20px">
<div style="font-size:12px;color:rgba(239,68,68,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:4px">No security boundary</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6;font-family:Inter,sans-serif">No PII redaction, no egress firewall, no middleware pipeline. Every database column leaks to the LLM.</div>
</div>

</div>

Moving tool logic to a MCP mcpfusion server keeps your frontend SDK focused on streaming, UI, and prompt management. Your backend handles security, validation, and data shaping through Presenters. Clean separation, zero overlap.

---

## Connect Vercel AI SDK to Your MCP Server {#vercel}

The Vercel AI SDK connects to MCP servers through the `@ai-sdk/mcp` package. Your MCP Fusion tools, including their Zod schemas and Presenter-shaped responses, are automatically available to `generateText`, `streamText`, and `useChat`.

### Installation

```bash
npm install @ai-sdk/mcp @modelcontextprotocol/sdk
```

### Connect via stdio (Local Development)

Use stdio transport when the MCP server runs as a local subprocess. This is the fastest setup for development.

```typescript
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Connect to your MCP mcpfusion server
const mcpClient = await createMCPClient({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['tsx', 'src/server.ts'],
  },
});

// Retrieve tools — includes all MCP Fusion Presenters and middleware
const tools = await mcpClient.tools();

// Use with any AI model
const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'List all overdue invoices for Acme Corp',
  tools,
});
```

### Connect via HTTP (Production)

For production deployments, use HTTP transport. This works with MCP servers deployed to Vinkius Cloud, Vercel, or any remote host.

```typescript
const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.vinkius.cloud/mcp',
    headers: {
      Authorization: `Bearer ${process.env.MCP_TOKEN}`,
    },
  },
});
```

### Next.js App Router Example

A complete route handler that connects a Next.js frontend to a MCP Fusion backend:

```typescript
// app/api/chat/route.ts
import { createMCPClient } from '@ai-sdk/mcp';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: process.env.FUSION_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
    },
  });

  const tools = await mcpClient.tools();

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    messages,
    tools,
  });

  return result.toDataStreamResponse();
}
```

Your MCP Fusion Presenters shape every tool response before it reaches the LLM. The frontend never touches raw database output.

::: tip
Use `mcpfusion create my-api --transport http` to scaffold an MCP server pre-configured for remote HTTP connections (Streamable HTTP, MCP 2.0). See the [Quickstart](/quickstart-lightspeed) for the full setup flow.
:::

::: warning
The legacy `--transport sse` template is **deprecated** as of MCP `2025-03-26` (SEP-2596). The HTTP+SSE transport is deprecated in MCP 2.0 — use Streamable HTTP (`--transport http`) or the stateless transport (`--transport stateless`) instead. See the [Deprecation Registry](/deprecation-registry).
:::

---

## Connect LangChain to Your MCP Server {#langchain}

LangChain connects to MCP servers through the `@langchain/mcp-adapters` package. Your MCP Fusion tools become native LangChain tools that work with any agent type: ReAct, plan-and-execute, or custom.

### Installation

```bash
npm install @langchain/mcp-adapters @modelcontextprotocol/sdk
```

### Basic Connection

```typescript
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

// Connect to your MCP mcpfusion server
const client = new MultiServerMCPClient({
  'my-fusion-server': {
    transport: 'stdio',
    command: 'npx',
    args: ['tsx', 'src/server.ts'],
  },
});

// Load tools — MCP Fusion's Consolidated Actions reduce 50 tools to smart endpoints
const tools = await client.loadTools();

// Create a ReAct agent
const llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
const agent = createReactAgent({ llm, tools });

const result = await agent.invoke({
  messages: [{ role: 'user', content: 'List overdue invoices and send reminders' }],
});
```

### How MCP Fusion Solves Tool Hell in LangChain

A common LangChain problem: giving an agent 50 raw tools (`list_users`, `create_user`, `delete_user`, `update_user`...) confuses the planner and wastes thousands of tokens on tool descriptions.

MCP Fusion solves this with **Consolidated MVA Actions**. Instead of exposing 50 individual tool definitions, your agent sees a smaller set of semantically grouped endpoints. The Presenter schema tells the LLM exactly which actions are available for each entity. The result: better agent accuracy and significantly lower token costs.

<!-- Feature grid: before/after -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(239,68,68,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Without MCP Fusion</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">50 tools in system prompt. Agent picks the wrong one 30% of the time. 8,000+ tokens wasted on tool descriptions alone.</div>
</div>

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(52,211,153,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">With MCP Fusion</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Consolidated endpoints with Presenter-guided actions. Agent accuracy improves. Token cost drops by up to 40%.</div>
</div>

</div>

---

## Connect LlamaIndex to Your MCP Server {#llamaindex}

LlamaIndex is built for RAG (Retrieval-Augmented Generation), but it does not include a security layer for CRUD mutations. Connecting LlamaIndex to a MCP mcpfusion server gives you the best of both: RAG queries stay in LlamaIndex, and all state-changing operations route through typed middleware and Presenter schemas.

### Installation

```bash
npm install @llamaindex/tools @modelcontextprotocol/sdk
```

### Basic Connection

```typescript
import { mcp } from '@llamaindex/tools';
import { agent } from 'llamaindex';

// Connect to your MCP mcpfusion server
const tools = await mcp({
  command: 'npx',
  args: ['tsx', 'src/server.ts'],
}).tools();

// Create a LlamaIndex agent with MCP Fusion tools
const myAgent = agent({
  name: 'InvoiceAssistant',
  systemPrompt: 'You manage invoices. Use tools for all data operations.',
  tools,
});

const response = await myAgent.chat('Show me all unpaid invoices over $5,000');
```

### When to Use LlamaIndex vs MCP Fusion

| Use Case | LlamaIndex | MCP mcpfusion Server |
|---|---|---|
| Semantic search over documents | ✅ Best choice | Not designed for this |
| RAG with vector databases | ✅ Best choice | Not designed for this |
| CRUD operations on production data | ❌ No security layer | ✅ Typed + validated + redacted |
| Multi-tenant data isolation | ❌ Not built in | ✅ Middleware-enforced |
| PII redaction before LLM sees data | ❌ Not built in | ✅ Automatic via Presenters |

Use LlamaIndex for retrieval. Use MCP Fusion for mutations. Both connect to the same AI agent over MCP.

---

## Transport Reference {#transports}

All three frameworks support the same MCP transport options:

| Transport | Use Case | Configuration |
|---|---|---|
| `stdio` | Local development, single client | Server runs as a subprocess |
| `http` | Production, multiple clients | Server exposes an HTTP endpoint |
| `sse` | Legacy remote setups | Server-Sent Events over HTTP |

For production deployments, always use HTTP transport with authentication. See the [deployment guide](/quickstart-lightspeed#self-hosted) for configuration details.

---

## Next Steps {#next}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/quickstart-lightspeed" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">START</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Quickstart</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Create and deploy in 4 steps.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/presenter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">VIEW</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Presenter</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Shape what the LLM sees.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/vercel-adapter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">DEPLOY</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Vercel Adapter</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Deploy MCP to Vercel Edge.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>
