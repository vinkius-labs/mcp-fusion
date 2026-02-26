# Advanced Configuration

Beyond simple actions and Zod schemas, MCP Fusion exports configuration methods that control how LLMs perceive and interact with your tools at the wire level.

---

## 1. TOON Token Compression

By default, Fusion generates visually descriptive, Markdown-based workflow descriptions for your tool operations. While highly readable, Markdown consumes higher token counts.

When exposing a massive API surface to an LLM, enable TOON compression.

::: code-group
```typescript [f.tool() — Recommended ✨]
const f = initFusion<AppContext>();

// TOON is configured at the builder level:
const admin = f.defineTool('admin', {})
    .toonDescription()
    .action({ name: 'provision_user', handler: myHandler });
```
```typescript [defineTool]
const admin = defineTool('admin', {
    toonDescription: true,  // Engages the TOON compiler engine
    actions: {
        provision_user: { handler: myHandler },
    },
});
```
```typescript [createTool]
const admin = createTool('admin')
    .toonDescription() // Engages the TOON compiler engine
    .action({ 
        name: 'provision_user', 
        handler: myHandler 
    });
```
:::

**How it works:**
The framework intercepts the internal compiler and switches from Markdown to Token-Oriented Object Notation ([TOON](https://github.com/toon-format/toon)). The metadata for all actions within the tool is structured into a dense, pipe-delimited data table with no JSON repetition. This preserves the LLM's structural perception while reducing description token consumption.

---

## 2. Dynamic Tag Routing

In high-scale architectures, you should not expose every tool to the LLM on every session. Injecting irrelevant tools saturates context and dilutes reasoning.

Fusion provides a native tags parameter to classify tools internally:

::: code-group
```typescript [f.tool() — Recommended ✨]
const f = initFusion<AppContext>();

// Tags are configured at the builder level:
const github = f.defineTool('github', {}).tags('public', 'dev', 'repo');
const billing = f.defineTool('billing', {}).tags('internal', 'payments');
```
```typescript [defineTool]
const github = defineTool('github', { tags: ['public', 'dev', 'repo'], actions: { /* ... */ } });
const billing = defineTool('billing', { tags: ['internal', 'payments'], actions: { /* ... */ } });
```
```typescript [createTool]
const github = createTool('github').tags('public', 'dev', 'repo');
const billing = createTool('billing').tags('internal', 'payments');
```
:::

When attaching your `ToolRegistry` to the MCP Server, use the tag filter to prune the payload sent to `tools/list` on connection:

```typescript
registry.attachToServer(server, {
    filter: {
        tags: ['public'],       // Explicitly only include tools with this tag
        exclude: ['payments']   // Hard-exclude any tool mapping this tag
    }
});
```

This guarantees that an AI assistant deployed in a public chat interface never even sees the `billing` tool definition in its `tools/list` RPC payload.

---

## 3. Custom Discriminators

When combining multiple operations into a single endpoint via Namespaces, the default routing payload schema instructs the LLM to pass its target designation under the `action` JSON property.

You can override this string to fit specific domain workflows:

::: code-group
```typescript [f.tool() — Recommended ✨]
const f = initFusion<AppContext>();

// Discriminator is configured at the builder level:
const storage = f.defineTool('storage', {})
    .discriminator('operation')
    .action({ name: 'upload', handler: myUploadHandler });
```
```typescript [defineTool]
const storage = defineTool('storage', {
    discriminator: 'operation',
    actions: {
        upload: { handler: myUploadHandler },
    },
});
```
```typescript [createTool]
const storage = createTool('storage')
    .discriminator('operation')
    .action({ name: 'upload', handler: myUploadHandler })
```
:::

The LLM is now structurally compiled and constrained to send:
`{ "operation": "upload", ... }`

---

## 4. Native MCP Annotations

Model Context Protocol offers native UI hints via [Annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations). These flags let the AI client (such as Claude Desktop or Cursor) adjust its behavior natively to prompt the human user in different ways.

While Fusion automatically detects and flags standard mutations (via `readOnly` or `destructive` arguments inside your actions), you can inject arbitrary MCP Annotations across an entire Tool boundary:

::: code-group
```typescript [f.tool() — Recommended ✨]
const f = initFusion<AppContext>();

// Annotations are configured at the builder level:
const database = f.defineTool('database', {})
    .annotations({ readOnlyHint: true, openWorldHint: true });
```
```typescript [defineTool]
const database = defineTool('database', {
    annotations: {
        readOnlyHint: true,
        openWorldHint: true,
    },
    actions: { /* ... */ },
});
```
```typescript [createTool]
const database = createTool('database')
    .annotations({
        readOnlyHint: true,
        openWorldHint: true
    })
```
:::

All annotations injected this way are passed down the pipeline directly to the `@modelcontextprotocol/sdk` instance.
