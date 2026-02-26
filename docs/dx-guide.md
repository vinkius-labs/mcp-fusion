# Developer Experience Guide

`initFusion()` for type inference, JSON descriptors instead of Zod imports, `autoDiscover()` for file-based routing, `createDevServer()` for hot reload, and Standard Schema support for any validator.

## `initFusion()` — Define Context Once {#init-fusion}

Define your context type once. Every `f.tool()`, `f.presenter()`, `f.middleware()`, `f.prompt()` inherits it.

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

`f.tool()`, `f.presenter()`, `f.middleware()`, `f.prompt()`, `f.registry()`, `f.defineTool()` — all inherit `AppContext`. Add a property to the context interface and every handler sees it. Remove one and TypeScript flags every handler that references it.

The handler receives `{ input, ctx }` — a destructured object (tRPC v11 pattern). Hover over `input.id` and the IDE shows the Zod-inferred type.

## JSON Descriptors — No Zod Required {#json-descriptors}

For simple inputs — strings, numbers, enums — plain JSON descriptors replace Zod. Converted to Zod internally at runtime. Same validation, same error messages, zero imports.

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

For constraints, use an object:

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

JSON descriptors don't support transforms, custom refinements, or deeply nested objects. Use Zod for those tools — both can coexist in the same project.

## File-Based Routing — `autoDiscover()` {#file-based-routing-autodiscover}

Scans a directory and registers all exported builders automatically.

```typescript
import { autoDiscover } from '@vinkius-core/mcp-fusion';

const registry = f.registry();
await autoDiscover(registry, './src/tools');
```

```text
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    ├── list.ts         → users.list
    └── ban.ts          → users.ban
```

Each file exports a tool builder. `autoDiscover()` checks in order: default export, named `tool` export, any value with `.getName()` and `.buildToolDefinition()`. Add a file → registered on next start. Delete → gone.

```typescript
await autoDiscover(registry, './src/tools', {
  pattern: /\.tool\.ts$/,  // Only files matching this regex (default: /\.(ts|js|mjs|mts)$/)
  recursive: true,         // Scan subdirectories (default: true)
  loader: 'esm',           // 'esm' (default) or 'cjs'
  resolve: (mod) => {      // Custom export resolver — return one builder or an array
    return mod.myCustomExport;
  },
});
```

## HMR Dev Server — `createDevServer()` {#hmr-dev-server-createdevserver}

File changes hot-reload tools without dropping the MCP connection. No restart, no reconnect.

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

On save: detect change (300ms debounce) → clear ESM cache → re-register tools → send `notifications/tools/list_changed` → client picks up new definitions.

| Option | Default | Description |
|---|---|---|
| `dir` | _(required)_ | Directory to watch |
| `extensions` | `['.ts', '.js', '.mjs', '.mts']` | File extensions to watch |
| `debounce` | `300` | Debounce interval in ms |
| `setup` | _(required)_ | Callback to re-register tools |
| `onReload` | — | Callback on each reload |
| `server` | — | MCP server for change notifications |

```typescript
await dev.start();   // Start watching + initial load
await dev.reload();  // Force manual reload
dev.stop();          // Stop watcher and clean up
```

## Standard Schema — Decouple from Zod {#standard-schema-decouple-from-zod}

Any validator implementing [Standard Schema v1](https://github.com/standard-schema/standard-schema) works: Valibot, ArkType, TypeBox.

```typescript
import * as v from 'valibot';
import { toStandardValidator } from '@vinkius-core/mcp-fusion/schema';

const schema = v.object({ name: v.string(), age: v.number() });
const validator = toStandardValidator(schema);
const result = validator.validate({ name: 'Alice', age: 30 });
```

`autoValidator()` detects the schema type automatically — Standard Schema v1 first (checks `~standard`), then Zod-like (checks `.safeParse()`):

```typescript
import { autoValidator } from '@vinkius-core/mcp-fusion/schema';
const validator = autoValidator(anySchema); // Valibot, Zod, ArkType — all work
```

`isStandardSchema(schema)` — type guard returning `true` for any Standard Schema v1 object.

## Subpath Exports {#subpath-exports}

Each subpath is independently tree-shakeable:

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

## Prompt Args — Same No-Zod Power {#prompt-args}

Prompt arguments use the same JSON descriptor syntax. Only flat primitives (no arrays, no nested objects) — MCP clients render them as form fields.

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

Add `as const` to the `args` object when using JSON descriptors — without it, TypeScript widens `{ enum: ['a', 'b'] }` to `{ enum: string[] }` and literal type inference is lost.
