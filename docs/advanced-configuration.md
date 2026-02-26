# Advanced Configuration

## TOON Token Compression

Fusion generates Markdown descriptions for tool actions by default. `.toonDescription()` switches to [Token-Oriented Object Notation (TOON)](https://github.com/toon-format/toon) — a pipe-delimited table format that preserves LLM structural perception at roughly half the tokens:

```typescript
const admin = createTool<AppContext>('admin')
  .toonDescription()
  .action({ name: 'provision_user', handler: myHandler })
  .action({ name: 'deprovision_user', handler: myHandler2 });
```

A 40-action tool in Markdown can consume 2000+ tokens of system prompt. TOON compresses the same routing information into a single dense table.

## Tag-Based Filtering

Assign tags to classify tools, then filter which ones appear in `tools/list`:

```typescript
const github = createTool<AppContext>('github')
  .tags('public', 'dev', 'repo');

const billing = createTool<AppContext>('billing')
  .tags('internal', 'payments');
```

```typescript
import { attachToServer } from '@vinkius-core/mcp-fusion';

attachToServer(server, registry, {
  filter: {
    tags: ['public'],        // AND — tool must have ALL these tags
    anyTag: ['dev', 'repo'], // OR  — tool must have ANY of these tags
    exclude: ['payments'],   // NOT — exclude tools with ANY of these tags
  },
});
```

A public chat assistant never sees the `billing` tool. The LLM can't call what it doesn't know exists. Filters compose: a tool must pass `tags` AND `anyTag`, then survive `exclude`.

## Custom Discriminator

The default routing field is `"action"`. Some domains have their own vocabulary:

```typescript
const storage = createTool<AppContext>('storage')
  .discriminator('operation')
  .action({ name: 'upload', handler: uploadHandler })
  .action({ name: 'download', handler: downloadHandler });
```

The LLM now sends `{ "operation": "upload", ... }`. The compiled schema, description, and validation all reflect the new field name.

## MCP Annotations

The MCP specification defines [Annotations](https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations) — UI hints for AI clients like Claude Desktop and Cursor.

Fusion infers `readOnlyHint` and `destructiveHint` from action declarations. Override explicitly at the tool level:

```typescript
const database = createTool<AppContext>('database')
  .annotations({
    readOnlyHint: true,
    openWorldHint: true,
  })
  .action({ name: 'query', handler: queryHandler });
```

Available annotations: `readOnlyHint` (no state modification), `destructiveHint` (irreversible changes), `idempotentHint` (safe to repeat), `openWorldHint` (interacts with external systems).
