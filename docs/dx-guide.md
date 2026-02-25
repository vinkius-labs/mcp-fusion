# Developer Experience (DX) Guide

MCP Fusion v2.7.0 introduces a complete DX overhaul — 8 new APIs designed to eliminate boilerplate, enable instant autocomplete, and make the framework feel as effortless as tRPC or Hono.

---

## Part 1: Zero-Friction DX

### `initFusion()` — Define Context Once, Inherit Everywhere

The single biggest friction in pre-2.7 Fusion: passing `<AppContext>` as a generic to every `createTool<AppContext>()`, `defineTool<AppContext>()`, and `createPresenter<AppContext>()`. With `initFusion()`, you define the type **once** and every factory method inherits it automatically.

```typescript
// src/fusion.ts — ONE file, defined once for the entire project
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string };
}

export const f = initFusion<AppContext>();
```

Now every tool file is generic-free:

::: code-group
```typescript [f.tool() — No Zod 🚀]
// src/tools/billing.ts — ZERO imports from 'zod'
import { f } from '../fusion';

export const getInvoice = f.tool({
  name: 'billing.get_invoice',
  input: { id: 'string' },
  readOnly: true,
  handler: async ({ input, ctx }) => {
    // input.id → string, ctx → AppContext — fully typed!
    return await ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```
```typescript [f.tool() — Zod]
// src/tools/billing.ts
import { f } from '../fusion';
import { z } from 'zod';

export const getInvoice = f.tool({
  name: 'billing.get_invoice',
  input: z.object({ id: z.string() }),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    // ctx is fully typed as AppContext — zero annotations
    return await ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```
:::

::: tip Zod is 100% Optional
MCP Fusion's `input` field accepts **both** Zod schemas and plain JSON descriptors. When you pass `{ id: 'string' }`, the framework internally converts it to `z.object({ id: z.string() })` — same validation, same strict rejection of hallucinated params, zero import overhead.
:::

#### `f.tool()` — Handler receives `{ input, ctx }`

The `handler` receives a destructured object instead of positional `(ctx, args)`. This is the tRPC v11 pattern — more readable, better autocomplete on hover.

::: code-group
```typescript [No Zod — Plain Descriptors]
const createUser = f.tool({
  name: 'users.create',
  description: 'Create a new user',
  input: {
    name: { type: 'string', min: 1, max: 100, description: 'Full name' },
    email: { type: 'string', regex: '^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
    role: { enum: ['user', 'admin'] as const },
    age: { type: 'number', min: 18, int: true, optional: true },
  },
  handler: async ({ input, ctx }) => {
    return await ctx.db.users.create({ data: input });
  },
});
```
```typescript [Zod — Full Power]
const createUser = f.tool({
  name: 'users.create',
  description: 'Create a new user',
  input: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['user', 'admin']),
    age: z.number().min(18).int().optional(),
  }),
  handler: async ({ input, ctx }) => {
    return await ctx.db.users.create({ data: input });
  },
});
```
:::

**Naming convention:** `'domain.action'` is automatically split — `billing.get_invoice` creates a tool named `billing` with action `get_invoice`.

#### JSON Param Descriptors — Full Reference

When you pass plain objects to `input` or `params`, MCP Fusion converts them to Zod schemas internally. Here's every supported descriptor:

```typescript
f.tool({
  name: 'demo.full',
  input: {
    // String shorthand — just the type name
    name: 'string',
    count: 'number',
    active: 'boolean',

    // String with constraints
    email: { type: 'string', regex: '^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
    title: { type: 'string', min: 1, max: 200, description: 'Project title' },
    cron: { type: 'string', examples: ['0 12 * * *'] },

    // Number with constraints
    amount: { type: 'number', min: 0, description: 'Amount in cents' },
    quantity: { type: 'number', min: 1, max: 999, int: true },

    // Enum — use `as const` for literal type inference
    status: { enum: ['active', 'archived', 'draft'] as const },
    priority: { enum: ['low', 'medium', 'high', 'critical'] as const },

    // Array — element type as string
    tags: { array: 'string', min: 1, max: 10 },
    scores: { array: 'number' },

    // Optional fields
    notes: { type: 'string', optional: true },
    limit: { type: 'number', min: 1, max: 100, optional: true },
    format: { enum: ['json', 'csv'] as const, optional: true },
  },
  handler: async ({ input }) => { /* ... */ },
});
```

::: info Conversion Table
| JSON Descriptor | Internal Zod Equivalent |
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
:::

#### `f.presenter()` — Context-Typed Presenter

```typescript
const InvoicePresenter = f.presenter({
  name: 'Invoice',
  schema: invoiceSchema,
  rules: ['CRITICAL: amount_cents is in CENTS. Divide by 100.'],
  ui: (inv) => [ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] })],
});
```

#### `f.prompt()` — Context-Typed Prompts

Prompts are **server-side templates** that prepare LLM context — think "SOPs as Code." MCP clients render them as slash commands with visual forms. MCP Fusion's Prompt Engine handles coercion, validation, middleware, and lifecycle sync.

**Prompt args are always flat primitives** — because MCP clients render them as form fields (text inputs, dropdowns, toggles). No arrays, no nested objects. The framework enforces this at definition time.

::: code-group
```typescript [No Zod — Recommended 🚀]
const ReviewPrompt = f.prompt('code_review', {
  title: 'Code Review',
  description: 'Review code with a specific focus and strictness level.',
  args: {
    language: { enum: ['typescript', 'python', 'go', 'rust'] as const },
    strictness: { type: 'number', min: 1, max: 10, description: 'Review strictness (1-10)' },
    focus: { type: 'string', optional: true, description: 'Specific area to focus on' },
    includeTests: 'boolean',
  } as const,
  handler: async (ctx, { language, strictness, focus, includeTests }) => {
    const rules = await ctx.db.codeRules.findMany({ where: { language } });
    return {
      messages: [
        PromptMessage.system(`You are a Senior ${language} Engineer. Strictness: ${strictness}/10.`),
        PromptMessage.user([
          `Review the following ${language} code.`,
          focus ? `Focus on: ${focus}` : '',
          includeTests ? 'Include test suggestions.' : '',
          `\nRules:\n${rules.map(r => `- ${r.text}`).join('\n')}`,
        ].filter(Boolean).join('\n')),
      ],
    };
  },
});
```
```typescript [Zod Args]
const ReviewPrompt = f.prompt('code_review', {
  title: 'Code Review',
  description: 'Review code with a specific focus and strictness level.',
  args: z.object({
    language: z.enum(['typescript', 'python', 'go', 'rust']),
    strictness: z.number().min(1).max(10),
    focus: z.string().optional(),
    includeTests: z.boolean(),
  }),
  handler: async (ctx, { language, strictness, focus, includeTests }) => {
    const rules = await ctx.db.codeRules.findMany({ where: { language } });
    return {
      messages: [
        PromptMessage.system(`You are a Senior ${language} Engineer. Strictness: ${strictness}/10.`),
        PromptMessage.user(`Review the following ${language} code.`),
      ],
    };
  },
});
```
:::

##### MVA-Driven Prompts — `fromView()`

Bridge your Presenter layer into Prompts with zero duplication:

```typescript
const AuditPrompt = f.prompt('financial_audit', {
  description: 'Audit an invoice with full MVA context.',
  args: {
    invoiceId: 'string',
    depth: { enum: ['quick', 'thorough'] as const },
  } as const,
  handler: async (ctx, { invoiceId, depth }) => {
    const invoice = await ctx.db.invoices.get(invoiceId);
    return {
      messages: [
        PromptMessage.system('You are a Senior Financial Auditor.'),
        // fromView() decomposes the Presenter into XML-tagged messages
        // — domain rules, UI blocks, and suggestions are included automatically
        ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
        PromptMessage.user(`Perform a ${depth} audit on this invoice.`),
      ],
    };
  },
});
```

##### Prompt with Middleware

```typescript
const SecurePrompt = f.prompt('admin_report', {
  description: 'Generate admin-only financial report.',
  args: { quarter: { enum: ['Q1', 'Q2', 'Q3', 'Q4'] as const } } as const,
  middleware: [requireAuth, requireRole('admin')],
  handler: async (ctx, { quarter }) => {
    const data = await ctx.db.reports.getQuarterly(quarter);
    return {
      messages: [
        PromptMessage.system('You are a CFO preparing a board presentation.'),
        PromptMessage.user(`Summarize ${quarter} financial performance:\n${JSON.stringify(data)}`),
      ],
    };
  },
});
```

→ [Full Prompt Engine docs](/prompts)

#### `f.middleware()` — Context Derivation

```typescript
const withUser = f.middleware(async (ctx) => ({
  user: await ctx.db.users.findUnique({ where: { id: ctx.userId } }),
}));
```

#### `f.registry()` — Pre-Typed Registry

```typescript
const registry = f.registry();
registry.register(getInvoice);
registry.register(createUser);
```

#### `f.defineTool()` — Full ToolConfig Power

For complex tools that need groups, shared params, or hierarchical actions:

```typescript
const platform = f.defineTool('platform', {
  shared: { workspace_id: 'string' },
  groups: {
    users: {
      actions: {
        list: { readOnly: true, handler: listUsers },
        ban: { destructive: true, handler: banUser },
      },
    },
  },
});
```

---

### `definePresenter()` — Object Config Instead of Builder

Replace the fluent builder chain with a single object literal. TypeScript infers the schema type — zero generic noise, instant Ctrl+Space.

::: code-group
```typescript [definePresenter — New ✨]
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const InvoicePresenter = definePresenter({
  name: 'Invoice',
  schema: z.object({
    id: z.string(),
    amount_cents: z.number().describe('CRITICAL: in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending', 'overdue']),
  }),
  rules: ['CRITICAL: Divide amount_cents by 100 before displaying.'],
  ui: (inv) => [
    ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
  ],
  collectionUi: (invoices) => [
    ui.echarts({
      series: [{ type: 'pie', data: invoices.map(i => ({ name: i.id, value: i.amount_cents })) }],
    }),
  ],
  agentLimit: {
    max: 50,
    onTruncate: (omitted) => ui.summary(`50 shown, ${omitted} hidden. Use filters.`),
  },
  suggestActions: (inv) =>
    inv.status === 'pending'
      ? [{ tool: 'billing.pay', reason: 'Process payment' }]
      : [],
  embeds: [
    { key: 'client', presenter: ClientPresenter },
    { key: 'lineItems', presenter: LineItemPresenter },
  ],
});
```
```typescript [createPresenter — Classic]
export const InvoicePresenter = createPresenter('Invoice')
  .schema(z.object({
    id: z.string(),
    amount_cents: z.number(),
    status: z.enum(['paid', 'pending', 'overdue']),
  }))
  .systemRules(['CRITICAL: Divide amount_cents by 100.'])
  .uiBlocks((inv) => [ui.echarts({ ... })])
  .agentLimit(50, (omitted) => ui.summary(`50 shown, ${omitted} hidden.`))
  .suggestActions((inv) => inv.status === 'pending' ? [{ tool: 'billing.pay' }] : [])
  .embed('client', ClientPresenter)
  .embed('lineItems', LineItemPresenter);
```
:::

Both APIs produce the exact same `Presenter<T>` — interchangeable anywhere.

#### Auto-Rules from Zod `.describe()`

When `autoRules` is `true` (default), `definePresenter()` scans the Zod schema for `.describe()` annotations and auto-merges them with explicit `rules`:

```typescript
const schema = z.object({
  amount_cents: z.number().describe('CRITICAL: in CENTS. Divide by 100.'),
  email: z.string().email().describe('PII: mask in public-facing contexts.'),
});

const P = definePresenter({ name: 'Payment', schema });
// Automatic system rules:
// ["amount_cents: CRITICAL: in CENTS. Divide by 100.",
//  "email: PII: mask in public-facing contexts."]
```

Set `autoRules: false` to disable this behavior.

---

### File-Based Routing — `autoDiscover()`

Drop a file → it's a tool. No more central `index.ts` with 50 imports.

```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    ├── list.ts         → users.list
    └── ban.ts          → users.ban
```

Each file exports a tool builder as `default` or named `tool`:

::: code-group
```typescript [No Zod 🚀]
// src/tools/billing/get_invoice.ts
import { f } from '../../fusion';

export default f.tool({
  name: 'billing.get_invoice',
  input: { id: 'string' },
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return await ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```
```typescript [Zod]
// src/tools/billing/get_invoice.ts
import { f } from '../../fusion';
import { z } from 'zod';

export default f.tool({
  name: 'billing.get_invoice',
  input: z.object({ id: z.string() }),
  readOnly: true,
  handler: async ({ input, ctx }) => {
    return await ctx.db.invoices.findUnique({ where: { id: input.id } });
  },
});
```
:::

Register everything in one line:

```typescript
import { autoDiscover, ToolRegistry } from '@vinkius-core/mcp-fusion';

const registry = new ToolRegistry<AppContext>();
await autoDiscover(registry, './src/tools');
```

#### Options

```typescript
await autoDiscover(registry, './src/tools', {
  pattern: /\.tool\.ts$/,     // Only files matching this regex
  recursive: true,            // Scan subdirectories (default: true)
  loader: 'esm',              // 'esm' (default) or 'cjs'
  resolve: (mod) => {         // Custom export resolver
    return mod.myCustomExport;
  },
});
```

#### How Resolution Works

1. **Default export** — `export default f.tool({ ... })`
2. **Named `tool` export** — `export const tool = f.tool({ ... })`
3. **First ToolBuilder** — any exported value with `.getName()` and `.buildToolDefinition()`

---

### HMR Dev Server — `createDevServer()`

The killer DX feature: file changes reload tools **without** restarting the LLM client (Claude Desktop, Cursor, etc.).

```typescript
import { createDevServer, autoDiscover } from '@vinkius-core/mcp-fusion/dev';

const devServer = createDevServer({
  dir: './src/tools',
  setup: async (registry) => {
    await autoDiscover(registry, './src/tools');
  },
  onReload: (file) => console.log(`♻️ Reloaded: ${file}`),
  server: mcpServer, // sends notifications/tools/list_changed
});

await devServer.start();
```

#### How It Works

1. Starts watching `dir` for `.ts`/`.js`/`.mjs`/`.mts` changes
2. On file change, clears ESM module cache via URL cache-busting
3. Calls `setup()` callback to re-register tools on a fresh registry
4. Sends `notifications/tools/list_changed` to the MCP client
5. The LLM client picks up new tool definitions — **zero restart**

#### Configuration

| Option | Default | Description |
|---|---|---|
| `dir` | (required) | Directory to watch |
| `extensions` | `['.ts', '.js', '.mjs', '.mts']` | File extensions to watch |
| `debounce` | `300` | Debounce interval in ms |
| `setup` | (required) | Callback to re-register tools |
| `onReload` | — | Callback on each reload |
| `server` | — | MCP server for change notifications |

#### API

```typescript
const dev = createDevServer({ /* ... */ });

await dev.start();      // Start watching + initial load
await dev.reload();     // Force manual reload
dev.stop();             // Stop watcher and clean up
```

---

## Part 2: Smaller Code

### `createGroup()` — Functional Alternative to GroupedToolBuilder

Closure-based, minifies 30–40% better than class methods, zero `this` binding issues, Edge Runtime compatible.

```typescript
import { createGroup, success } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const billing = createGroup({
  name: 'billing',
  description: 'Invoice management',
  middleware: [requireAuth],
  actions: {
    get_invoice: {
      schema: z.object({ id: z.string() }),
      readOnly: true,
      handler: async (ctx, args) => success(await ctx.db.invoices.get(args.id)),
    },
    pay: {
      schema: z.object({ invoice_id: z.string(), amount: z.number() }),
      destructive: true,
      handler: async (ctx, args) => success(await ctx.db.payments.create(args)),
    },
  },
});

// Usage:
await billing.execute(ctx, 'get_invoice', { id: '123' });
billing.actionNames; // ['get_invoice', 'pay']
billing.getAction('pay'); // { schema, destructive: true, handler, ... }
```

#### Why Functional?

| Aspect | `GroupedToolBuilder` (class) | `createGroup()` (closure) |
|---|---|---|
| Minification | Class/prototype names preserved | Local vars fully renamed |
| Bundle size | Full prototype chain shipped | Closures tree-shake to essentials |
| `this` binding | Requires `bind()` in callbacks | No `this` — pure functions |
| Middleware | Runtime composition on each call | **Pre-composed at creation** (O(1)) |
| Mutation safety | Manual `.freeze()` | **Frozen by default** |
| Edge Runtimes | Prototype inspection varies | Cloudflare Workers / Deno Deploy safe |

#### Pre-Composed Middleware

`createGroup()` composes the middleware chain at creation time — not on each request:

```typescript
const billing = createGroup({
  middleware: [logMiddleware, rateLimitMiddleware],
  actions: {
    pay: {
      middleware: [requireAdmin], // per-action middleware
      handler: payHandler,
    },
  },
});

// The chain for `pay` is:
// logMiddleware → rateLimitMiddleware → requireAdmin → payHandler
// Pre-composed once. O(1) dispatch on every call.
```

---

### Standard Schema — Decouple from Zod

Support **any** validator that implements the [Standard Schema v1](https://github.com/standard-schema/standard-schema) specification. Zod is no longer mandatory.

```typescript
import { autoValidator, toStandardValidator, fromZodSchema } from '@vinkius-core/mcp-fusion/schema';
```

#### Supported Libraries

| Library | Size (min) | Speed | Standard Schema |
|---|---|---|---|
| **Zod** v4 | ~14kb | ●●○ | ✅ Native |
| **Valibot** | ~1kb | ●●● | ✅ Native |
| **ArkType** | ~5kb | ●●● | ✅ Native |
| **TypeBox** | ~4kb | ●●○ | ✅ v0.34+ |

#### Usage with Valibot

```typescript
import * as v from 'valibot';
import { toStandardValidator } from '@vinkius-core/mcp-fusion/schema';

const schema = v.object({ name: v.string(), age: v.number() });
const validator = toStandardValidator(schema);

const result = validator.validate({ name: 'Alice', age: 30 });
// { success: true, data: { name: 'Alice', age: 30 } }
```

#### Usage with Zod

```typescript
import { z } from 'zod';
import { fromZodSchema } from '@vinkius-core/mcp-fusion/schema';

const schema = z.object({ name: z.string() });
const validator = fromZodSchema(schema);

const result = validator.validate({ name: 'Alice' });
// { success: true, data: { name: 'Alice' } }
```

#### Auto-Detection

`autoValidator()` detects the schema type automatically:

```typescript
import { autoValidator } from '@vinkius-core/mcp-fusion/schema';

// Works with any supported library
const validator = autoValidator(schema);
const result = validator.validate(input);
```

Detection order:
1. Standard Schema v1 (`~standard` property) — Valibot, ArkType, Zod v4
2. Zod-like (`.safeParse()` method) — Zod v3
3. Throws if unrecognized

#### Type Guards

```typescript
import { isStandardSchema } from '@vinkius-core/mcp-fusion/schema';

isStandardSchema(valibotSchema); // true
isStandardSchema(zodV4Schema);   // true (Zod v4 implements ~standard)
isStandardSchema({ random: 1 }); // false
```

---

### Subpath Exports — Tree-Shake to Zero

Import only what you use. The bundler ships only the modules you import.

```typescript
// Full framework (everything)
import { defineTool, createPresenter } from '@vinkius-core/mcp-fusion';

// Client only (~2kb)
import { createFusionClient } from '@vinkius-core/mcp-fusion/client';

// UI blocks only
import { ui } from '@vinkius-core/mcp-fusion/ui';

// Presenter only
import { definePresenter, createPresenter } from '@vinkius-core/mcp-fusion/presenter';

// Prompt engine only
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion/prompt';

// State Sync only
import { StateSyncLayer, detectOverlaps } from '@vinkius-core/mcp-fusion/state-sync';

// Observability only
import { createDebugObserver } from '@vinkius-core/mcp-fusion/observability';

// Dev tools (autoDiscover, DevServer)
import { autoDiscover, createDevServer } from '@vinkius-core/mcp-fusion/dev';

// Standard Schema adapters
import { autoValidator, toStandardValidator } from '@vinkius-core/mcp-fusion/schema';

// Testing utilities
import { createFusionTester } from '@vinkius-core/mcp-fusion/testing';
```

#### Bundle Impact

| Import Path | Approximate Size |
|---|---|
| `mcp-fusion/client` | ~2kb |
| `mcp-fusion/ui` | ~1kb |
| `mcp-fusion/schema` | ~2kb |
| `mcp-fusion/presenter` | ~4kb |
| `mcp-fusion/prompt` | ~3kb |
| `mcp-fusion` (full) | ~45kb |

---

## Migration Path

All new APIs are **additive**. Existing code continues to work unchanged.

| Before (v2.6) | After (v2.7) | Change |
|---|---|---|
| `createPresenter('X').schema(s).systemRules(r)` | `definePresenter({ name: 'X', schema: s, rules: r })` | Optional — both work |
| `createTool<Ctx>('x').action({ ... })` | `f.tool({ name: 'x.action', ... })` | Optional — both work |
| `defineTool<Ctx>('x', { ... })` | `f.defineTool('x', { ... })` | Optional — both work |
| Manual `import` per tool file | `autoDiscover(registry, './src/tools')` | Optional — both work |
| Restart LLM client on changes | `createDevServer({ ... })` | New capability |
| `new GroupedToolBuilder()` | `createGroup({ ... })` | Optional — both work |
| Zod-only validation | `autoValidator(anySchema)` | New capability |
| Single entry point | `import from 'mcp-fusion/client'` | New capability |

**None of these changes are breaking.** Every pre-2.7 API is fully preserved.

---

## Choosing Your API Style

| Style | Best For | Example |
|---|---|---|
| `f.tool()` | Most teams — clean, typed, zero generics | `f.tool({ name: 'billing.get', handler })` |
| `defineTool()` | Complex tools with groups and shared params | `defineTool('billing', { groups, shared })` |
| `createTool()` | Maximum control with fluent builder | `createTool('billing').action({ ... })` |
| `createGroup()` | Edge runtimes, functional style | `createGroup({ actions: { ... } })` |

All four produce compatible tool builders that work with `ToolRegistry`.

---

## When to Use Zod vs JSON Descriptors

| Feature | JSON Descriptors | Zod |
|---|---|---|
| **Setup** | Zero imports, zero config | `import { z } from 'zod'` |
| **String constraints** | `{ type: 'string', min: 1, max: 100 }` | `z.string().min(1).max(100)` |
| **Regex validation** | `{ type: 'string', regex: '^\\d+$' }` | `z.string().regex(/^\d+$/)` |
| **Enums** | `{ enum: ['a', 'b'] as const }` | `z.enum(['a', 'b'])` |
| **Arrays** | `{ array: 'string', min: 1 }` | `z.array(z.string()).min(1)` |
| **Transforms** | ❌ Not supported | `z.string().transform(s => s.trim())` |
| **Custom refinements** | ❌ Not supported | `z.number().refine(n => n % 2 === 0)` |
| **Nested objects** | ❌ Not supported | `z.object({ address: z.object({...}) })` |
| **Bundle size** | 0kb (built-in) | ~14kb (Zod) |

**Rule of thumb:** Start with JSON descriptors. Switch to Zod only when you need transforms, refinements, or deeply nested schemas. You can mix both in the same project — `f.tool()` and `defineTool()` accept either.

---

## Prompt Args — Same No-Zod Power

Prompt arguments follow the exact same descriptor syntax as tool inputs, with one constraint: **only flat primitives** (no arrays, no nested objects) because MCP clients render them as form fields.

```typescript
// Prompt with JSON descriptors — no Zod import
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
  handler: async (ctx, { meetingType, teamSize, projectName, includeMetrics, focusArea }) => ({
    messages: [
      PromptMessage.system(`You are preparing a ${meetingType} for a team of ${teamSize}.`),
      PromptMessage.user([
        `Project: ${projectName}`,
        includeMetrics ? 'Include velocity and burndown metrics.' : '',
        focusArea ? `Focus on: ${focusArea}` : '',
      ].filter(Boolean).join('\n')),
    ],
  }),
});
```

::: tip `as const` is Required for Type Inference
Always add `as const` to your `args` object when using JSON descriptors. Without it, TypeScript widens `{ enum: ['a', 'b'] }` to `{ enum: string[] }` and you lose literal type inference in the handler.
:::
