# Developer Experience Guide

MCP Fusion provides a set of DX features that eliminate boilerplate and shorten the feedback loop. This page covers the features that make daily development faster — `initFusion()` for type inference, JSON descriptors to skip Zod imports, `autoDiscover()` for file-based routing, `createDevServer()` for hot reload, and Standard Schema support to use any validator.

---

## `initFusion()` — Define Context Once {#init-fusion}

The single biggest source of friction in a growing MCP server: passing a generic to every `createTool<AppContext>()`, `defineTool<AppContext>()`, and `definePresenter<AppContext>()`. With `initFusion()`, you define the type once.

```typescript
// src/fusion.ts
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string };
}

export const f = initFusion<AppContext>();
```

Every tool file becomes generic-free:

```typescript
// src/tools/billing.ts
import { f } from '../fusion';
import { z } from 'zod';

export const getInvoice = f.tool({
  name: 'billing.get_invoice',
  input: z.object({ id: z.string() }),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    // ctx is AppContext — typed automatically
    return ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```

`f.tool()`, `f.presenter()`, `f.middleware()`, `f.prompt()`, `f.registry()`, `f.defineTool()` — all inherit `AppContext`. When you add a new property to the context interface (say, `logger`), every handler in the project sees it. When you remove one, TypeScript flags every handler that still references it.

The handler receives `{ input, ctx }` — a destructured object instead of positional `(ctx, args)`. This is the tRPC v11 pattern. Hover over `input.id` and the IDE shows the Zod-inferred type. Hover over `ctx.db` and it shows `PrismaClient`.

---

## JSON Descriptors — No Zod Required {#json-descriptors}

Zod is powerful but not always necessary. For tools with simple inputs — strings, numbers, enums — MCP Fusion accepts plain JSON descriptors. The framework converts them to Zod internally at runtime. Same validation, same error messages, zero imports.

```typescript
export const getInvoice = f.tool({
  name: 'billing.get_invoice',
  input: { id: 'string' },
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```

The shorthand `'string'` is equivalent to `z.string()`. For constraints, use an object:

```typescript
input: {
  name: { type: 'string', min: 1, max: 100, description: 'Full name' },
  email: { type: 'string', regex: '^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
  role: { enum: ['user', 'admin'] as const },
  age: { type: 'number', min: 18, int: true, optional: true },
  tags: { array: 'string', min: 1, max: 10 },
}
```

### Descriptor Reference {#descriptor-reference}

| Descriptor | Zod Equivalent |
|---|---|
| `'string'` | `z.string()` |
| `'number'` | `z.number()` |
| `'boolean'` | `z.boolean()` |
| `{ type: 'string', min: 1, max: 100 }` | `z.string().min(1).max(100)` |
| `{ type: 'string', regex: '^\\d+$' }` | `z.string().regex(/^\d+$/)` |
| `{ type: 'number', min: 0, int: true }` | `z.number().min(0).int()` |
| `{ enum: ['a', 'b'] as const }` | `z.enum(['a', 'b'])` |
| `{ array: 'string', min: 1 }` | `z.array(z.string()).min(1)` |
| `{ ..., optional: true }` | `.optional()` |
| `{ ..., description: 'text' }` | `.describe('text')` |

### When to Switch to Zod {#when-zod}

JSON descriptors don't support transforms (`z.string().transform(s => s.trim())`), custom refinements (`z.number().refine(n => n % 2 === 0)`), or deeply nested objects. If you need any of these, use Zod for that tool. You can mix both in the same project — `f.tool()` accepts either.

---

## File-Based Routing — `autoDiscover()` {#file-based-routing-autodiscover}

Instead of manually importing every tool file and calling `registry.register()`, `autoDiscover()` scans a directory and registers all exported builders automatically.

```typescript
import { autoDiscover } from '@vinkius-core/mcp-fusion';

const registry = f.registry();
await autoDiscover(registry, './src/tools');
```

The file structure becomes your routing table:

```text
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    ├── list.ts         → users.list
    └── ban.ts          → users.ban
```

Each file exports a tool builder. `autoDiscover()` checks three things in order:

1. **Default export** — `export default f.tool({ ... })`
2. **Named `tool` export** — `export const tool = f.tool({ ... })`
3. **Any exported builder** — any value with `.getName()` and `.buildToolDefinition()`

Add a new file, export a tool from it — it's registered on the next server start. Delete a file — it's gone. No import lists to maintain.

### Options {#autodiscover-options}

```typescript
await autoDiscover(registry, './src/tools', {
  pattern: /\.tool\.ts$/,  // Only files matching this regex (default: /\.(ts|js|mjs|mts)$/)
  recursive: true,         // Scan subdirectories (default: true)
  loader: 'esm',           // 'esm' (default) or 'cjs'
  resolve: (mod) => {      // Custom export resolver
    return mod.myCustomExport;
  },
});
```

The `resolve` option lets you use any export convention. Return a single builder or an array of builders.

---

## HMR Dev Server — `createDevServer()` {#hmr-dev-server-createdevserver}

The problem: you change a handler, save, and need to restart the MCP server _and_ reconnect the LLM client (Claude Desktop, Cursor). With `createDevServer()`, file changes hot-reload tools without dropping the connection.

```typescript
import { createDevServer, autoDiscover } from '@vinkius-core/mcp-fusion/dev';

const devServer = createDevServer({
  dir: './src/tools',
  setup: async (registry) => {
    await autoDiscover(registry, './src/tools');
  },
  onReload: (file) => console.log(`Reloaded: ${file}`),
  server: mcpServer,
});

await devServer.start();
```

When you save a file, the dev server:

1. Detects the change (debounced at 300ms by default)
2. Clears the ESM module cache via URL cache-busting
3. Calls `setup()` to re-register tools on a fresh registry
4. Sends `notifications/tools/list_changed` to the MCP client
5. The client picks up new tool definitions — zero restart

### Configuration {#devserver-config}

| Option | Default | Description |
|---|---|---|
| `dir` | _(required)_ | Directory to watch |
| `extensions` | `['.ts', '.js', '.mjs', '.mts']` | File extensions to watch |
| `debounce` | `300` | Debounce interval in ms |
| `setup` | _(required)_ | Callback to re-register tools |
| `onReload` | — | Callback on each reload |
| `server` | — | MCP server for change notifications |

### API {#devserver-api}

```typescript
const dev = createDevServer({ /* config */ });

await dev.start();   // Start watching + initial load
await dev.reload();  // Force manual reload
dev.stop();          // Stop watcher and clean up
```

---

## Standard Schema — Decouple from Zod {#standard-schema-decouple-from-zod}

MCP Fusion accepts any validator that implements the [Standard Schema v1](https://github.com/standard-schema/standard-schema) specification. Zod is the recommended default, but Valibot, ArkType, and TypeBox work identically.

| Library | Size (min) | Standard Schema |
|---|---|---|
| **Zod** v4 | ~14kb | Native |
| **Valibot** | ~1kb | Native |
| **ArkType** | ~5kb | Native |
| **TypeBox** | ~4kb | v0.34+ |

### Using Valibot {#valibot}

```typescript
import * as v from 'valibot';
import { toStandardValidator } from '@vinkius-core/mcp-fusion/schema';

const schema = v.object({ name: v.string(), age: v.number() });
const validator = toStandardValidator(schema);

const result = validator.validate({ name: 'Alice', age: 30 });
// { success: true, data: { name: 'Alice', age: 30 } }
```

### Auto-Detection {#auto-detection}

`autoValidator()` detects the schema type automatically — Standard Schema v1 first (checks for `~standard` property), then Zod-like (checks for `.safeParse()` method):

```typescript
import { autoValidator } from '@vinkius-core/mcp-fusion/schema';

const validator = autoValidator(anySchema); // Valibot, Zod, ArkType — all work
const result = validator.validate(input);
```

### Type Guard {#type-guard}

```typescript
import { isStandardSchema } from '@vinkius-core/mcp-fusion/schema';

isStandardSchema(valibotSchema); // true
isStandardSchema(zodV4Schema);   // true
isStandardSchema({ random: 1 }); // false
```

---

## Subpath Exports {#subpath-exports}

Import only what you use. Each subpath is independently tree-shakeable:

```typescript
import { initFusion, defineTool }    from '@vinkius-core/mcp-fusion';           // full framework
import { createFusionClient }        from '@vinkius-core/mcp-fusion/client';     // ~2kb
import { ui }                        from '@vinkius-core/mcp-fusion/ui';         // ~1kb
import { definePresenter }           from '@vinkius-core/mcp-fusion/presenter';  // ~4kb
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion/prompt';   // ~3kb
import { autoValidator }             from '@vinkius-core/mcp-fusion/schema';     // ~2kb
import { createDebugObserver }       from '@vinkius-core/mcp-fusion/observability';
import { autoDiscover, createDevServer } from '@vinkius-core/mcp-fusion/dev';
import { StateSyncLayer }            from '@vinkius-core/mcp-fusion/state-sync';
import { createFusionTester }        from '@vinkius-core/mcp-fusion/testing';
```

For client-only code (calling MCP servers from your app), `mcp-fusion/client` ships at ~2kb — no server-side code included.

---

## Prompt Args — Same No-Zod Power {#prompt-args}

Prompt arguments use the same JSON descriptor syntax as tool inputs, with one constraint: only flat primitives (no arrays, no nested objects) because MCP clients render them as form fields.

```typescript
const MeetingPrompt = f.prompt('meeting_prep', {
  title: 'Meeting Preparation',
  description: 'Prepare context for a meeting.',
  args: {
    meetingType: { enum: ['standup', '1on1', 'retro', 'planning'] as const },
    teamSize: { type: 'number', min: 1, max: 50 },
    projectName: { type: 'string', description: 'Project to discuss' },
    includeMetrics: 'boolean',
    focusArea: { type: 'string', optional: true },
  } as const,
  handler: async (ctx, args) => ({
    messages: [
      PromptMessage.system(`You are preparing a ${args.meetingType} for ${args.teamSize} people.`),
      PromptMessage.user(`Project: ${args.projectName}`),
    ],
  }),
});
```

::: tip
Always add `as const` to the `args` object when using JSON descriptors. Without it, TypeScript widens `{ enum: ['a', 'b'] }` to `{ enum: string[] }` and you lose literal type inference in the handler.
:::

---

## Where to Go Next {#next-steps}

- [Building Tools](/building-tools) — `f.tool()`, `defineTool()`, `createTool()`, annotations, error handling
- [Presenter Guide](/presenter) — `definePresenter()`, rules, UI blocks, affordances, embeds
- [Prompt Engine](/prompts) — prompts, `fromView()`, middleware on prompts
- [Middleware](/middleware) — context derivation, composition, auth patterns
