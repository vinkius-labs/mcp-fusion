# Advanced Configuration

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [TOON Token Compression](#toon)
- [Tag-Based Filtering](#tag-filtering)
- [Custom Discriminator](#discriminator)
- [MCP Annotations](#annotations)

## TOON Token Compression {#toon}

Fusion generates Markdown descriptions for tool actions by default. `.toonDescription()` switches to [Token-Oriented Object Notation (TOON)](https://github.com/toon-format/toon) — a pipe-delimited table format that preserves LLM structural perception at roughly half the tokens:

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const adminUsers = f.query('admin.list_users')
  .describe('List all platform users')
  .toonDescription()
  .handle(async (input, ctx) => { /* ... */ });

const adminProvision = f.action('admin.provision_user')
  .describe('Provision a new user')
  .toonDescription()
  .withString('email', 'User email')
  .handle(async (input, ctx) => { /* ... */ });
```

A 40-action tool in Markdown can consume 2000+ tokens of system prompt. TOON compresses the same routing information into a single dense table.

## Tag-Based Filtering {#tag-filtering}

Assign tags to classify tools, then filter which ones appear in `tools/list`:

```typescript
const githubTool = f.query('github.list_repos')
  .describe('List GitHub repositories')
  .tags('public', 'dev', 'repo')
  .handle(async (input, ctx) => { /* ... */ });

const billingTool = f.query('billing.list_invoices')
  .describe('List invoices')
  .tags('internal', 'payments')
  .handle(async (input, ctx) => { /* ... */ });
```

```typescript
registry.attachToServer(server, {
  contextFactory: createAppContext,
  filter: {
    tags: ['public'],        // AND — tool must have ALL these tags
    anyTag: ['dev', 'repo'], // OR  — tool must have ANY of these tags
    exclude: ['payments'],   // NOT — exclude tools with ANY of these tags
  },
});
```

A public chat assistant never sees the `billing` tool. The LLM can't call what it doesn't know exists. Filters compose: a tool must pass `tags` AND `anyTag`, then survive `exclude`.

## Custom Discriminator {#discriminator}

The default routing field is `"action"`. Some domains have their own vocabulary. Use `createTool()` to set a custom discriminator at the group level:

```typescript
import { createTool } from '@vinkius-core/mcp-fusion';

const storage = createTool<AppContext>('storage')
  .discriminator('operation')
  .action({ name: 'upload', handler: uploadHandler })
  .action({ name: 'download', handler: downloadHandler });
```

The LLM now sends `{ "operation": "upload", ... }`. The compiled schema, description, and validation all reflect the new field name.

> [!NOTE]
> Custom discriminators apply to the grouped tool pattern. With the Fluent API's flat approach (`f.query('storage.upload')`), each action is its own tool — no discriminator needed.

## MCP Annotations {#annotations}

The MCP specification defines [Annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations) — UI hints for AI clients like Claude Desktop and Cursor.

Fusion infers `readOnlyHint` and `destructiveHint` from semantic verbs automatically. Override explicitly on any tool:

```typescript
const database = f.query('database.query')
  .describe('Run a database query')
  .annotations({
    readOnlyHint: true,
    openWorldHint: true,
  })
  .withString('sql', 'SQL query')
  .handle(async (input, ctx) => { /* ... */ });
```

Available annotations: `readOnlyHint` (no state modification), `destructiveHint` (irreversible changes), `idempotentHint` (safe to repeat), `openWorldHint` (interacts with external systems).

> [!TIP]
> You rarely need to set annotations manually — `f.query()` sets `readOnlyHint: true`, `f.mutation()` sets `destructiveHint: true`. Use `.annotations()` for `openWorldHint` or when a semantic verbs default doesn't match your use case.
