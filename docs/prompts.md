# Prompt Engine

MCP Prompts are server-side templates that return structured messages — instructions, fetched data, domain rules — as a ready-to-use array. Clients expose them as slash commands. The Prompt Engine is opt-in: skip the `prompts` option on `attachToServer()` and nothing runs.

Prompt arguments must be **flat primitives** (string, number, boolean, enum). MCP clients render them as form controls — a nested object can't become a text field. The engine enforces this at definition time.

## Defining a Prompt — Fluent Builder (Recommended) {#fluent}

The Fluent Prompt Builder provides a chainable API that mirrors the Fluent Tool Builder. Use `f.prompt(name)` (no config object) to start the chain:

```typescript
import { initFusion, PromptMessage } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const SummarizePrompt = f.prompt('summarize')
  .title('Summarize Text')
  .describe('Summarize text with a given style.')
  .tags('public', 'writing')
  .input({
    text: { type: 'string', description: 'The text to summarize' },
    style: { enum: ['brief', 'detailed', 'bullet-points'] as const },
  })
  .handler(async (ctx, { text, style }) => ({
    messages: [
      PromptMessage.system('You are a professional summarizer.'),
      PromptMessage.user(`Style: ${style}\n\nText:\n${text}`),
    ],
  }));
```

### Fluent Prompt Builder Methods

| Method | What It Does |
|---|---|
| `.title(text)` | Human-readable title for UI display |
| `.describe(text)` | Slash command palette description |
| `.icons({ light?, dark? })` | Theme-aware icons |
| `.tags(...tags)` | Capability tags for selective exposure |
| `.input(schema \| params)` | Accept Zod schema or JSON params (same as tool params) |
| `.use(...fns)` | Middleware — same `MiddlewareFn` as tools |
| `.timeout(ms)` | Hydration timeout in milliseconds |
| `.handler(fn)` | **Terminal** — sets `(ctx, args) => Promise<PromptResult>` handler |

### Real-World Example — Incident Analysis with All Features

```typescript
const IncidentAnalysis = f.prompt('incident_analysis')
  .title('Incident Analysis')
  .describe('Perform a structured analysis of a production incident')
  .icons({ light: '🔍', dark: '🔎' })
  .tags('engineering', 'ops')
  .input({
    incident_id: { type: 'string', description: 'Incident ticket ID' },
    severity: { enum: ['sev1', 'sev2', 'sev3'] as const },
    include_timeline: { type: 'boolean', description: 'Include event timeline' },
  })
  .use(requireAuth, requireRole('engineer'))
  .timeout(10_000) // 10s — data fetching may be slow
  .handler(async (ctx, { incident_id, severity, include_timeline }) => {
    const incident = await ctx.db.incidents.findUnique({ where: { id: incident_id } });
    const logs = include_timeline
      ? await ctx.monitoring.getTimeline(incident_id)
      : [];

    return {
      messages: [
        PromptMessage.system(
          `You are a Senior SRE performing a ${severity.toUpperCase()} incident analysis.\n` +
          `Follow the 5-Whys methodology. Be specific, not generic.`,
        ),
        ...PromptMessage.fromView(IncidentPresenter.make(incident, ctx)),
        ...(logs.length > 0
          ? [PromptMessage.user(`Timeline:\n${logs.map(l => `[${l.time}] ${l.event}`).join('\n')}`)]
          : []),
        PromptMessage.user('Begin the root cause analysis.'),
        PromptMessage.assistant('## Incident Analysis\n\n### Impact Assessment\n\n'),
      ],
    };
  });
```

This example combines: middleware (auth + role), timeout, multimodal messages, Presenter bridge (`fromView()`), conditional timeline, and multi-turn seeding.

## Defining a Prompt — Config-Bag (Alternative) {#config-bag}

Use `f.prompt(name, config)` or `definePrompt(name, config)` for the config-bag approach:

### JSON-First Args

```typescript
import { initFusion, PromptMessage, PromptRegistry } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const SummarizePrompt = f.prompt('summarize', {
  description: 'Summarize text with a given style.',
  args: {
    text: { type: 'string', description: 'The text to summarize' },
    style: { enum: ['brief', 'detailed', 'bullet-points'] as const },
  } as const,
  handler: async (ctx, { text, style }) => ({
    messages: [
      PromptMessage.system('You are a professional summarizer.'),
      PromptMessage.user(`Style: ${style}\n\nText:\n${text}`),
    ],
  }),
});
```

`as const` gives you full type inference — `style` is `'brief' | 'detailed' | 'bullet-points'`, not `string`. Shorthand works too: `{ name: 'string' }` equals `{ name: { type: 'string' } }`.

### Zod Args

Pass `z.object()` when you need transforms, defaults, or refinements:

```typescript
import { z } from 'zod';
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';

const AuditPrompt = definePrompt<AppContext>('audit_invoices', {
  description: 'Enterprise billing audit.',
  args: z.object({
    month: z.enum(['january', 'february', 'march', 'april', 'may', 'june',
                   'july', 'august', 'september', 'october', 'november', 'december']),
    year: z.number().min(2020).max(2030),
    strict_mode: z.boolean().default(true).describe('Strict validation'),
  }),
  handler: async (ctx, { month, year, strict_mode }) => {
    const invoices = await ctx.db.billing.getByMonth(month, year);
    return {
      messages: [
        PromptMessage.system(
          `You are a Financial Auditor.\n` +
          `Strict mode: ${strict_mode ? 'ON' : 'OFF'}`
        ),
        PromptMessage.user(`Audit ${invoices.length} invoices for ${month} ${year}.`),
      ],
    };
  },
});
```

Both paths enforce flat primitives. Passing `ZodArray`, `ZodObject`, `ZodTuple`, `ZodRecord`, `ZodMap`, or `ZodSet` fails at definition time with a descriptive error.

### Config Options

`title` (string), `description` (string), `icons` (`{ light?, dark? }`), `tags` (string[]), `middleware` (MiddlewareFn[]), `hydrationTimeout` (ms), `args` (PromptParamsMap | ZodObject), `handler` ((ctx, args) → Promise\<PromptResult\>).


## PromptMessage {#messages}

Turns verbose MCP payloads into one-liners.

```typescript
PromptMessage.user('Hello')
// replaces: { role: 'user', content: { type: 'text', text: 'Hello' } }
```

`.system(text)` and `.user(text)` both map to `user` role (MCP has no system role — clients treat the first message as system by convention). `.assistant(text)` seeds the assistant's opening response.

### Multi-Modal

```typescript
handler: async (ctx, { projectId }) => ({
  messages: [
    PromptMessage.system('You are a visual design reviewer.'),
    PromptMessage.image('user', await ctx.screenshots.get(projectId), 'image/png'),
    PromptMessage.resource('user', `file:///designs/${projectId}/spec.md`, {
      mimeType: 'text/markdown',
      text: await ctx.files.read(`designs/${projectId}/spec.md`),
    }),
    PromptMessage.user('Review this design against the spec.'),
  ],
})
```

`.image(role, data, mimeType)` for base64 images, `.audio(role, data, mimeType)` for audio, `.resource(role, uri, options?)` for embedded resources.

### Multi-Turn Seeding

```typescript
messages: [
  PromptMessage.system('You are a database migration specialist.'),
  PromptMessage.user('Analyze the schema changes and generate a migration plan.'),
  PromptMessage.assistant('I will analyze each table change systematically:\n\n1. '),
]
```

The third message forces the LLM to continue from that point — enforcing structure without verbose system instructions.

## PromptRegistry {#registry}

```typescript
import { PromptRegistry } from '@vinkius-core/mcp-fusion';

const prompts = new PromptRegistry<AppContext>();
prompts.register(SummarizePrompt);
prompts.register(AuditPrompt);
prompts.registerAll(SummarizePrompt, AuditPrompt, CodeReviewPrompt);
```

Duplicate names throw immediately. Pass the registry to `attachToServer()`:

```typescript
registry.attachToServer(server, {
  contextFactory: (extra) => createAppContext(extra),
  prompts,
});
```

This activates `prompts/list` and `prompts/get` handlers. When `prompts` is absent, nothing is registered.

### Filtering

```typescript
const AdminPrompt = definePrompt('admin_reset', {
  tags: ['admin', 'internal'],
  handler: async (ctx, args) => ({ /* ... */ }),
});

const result = await prompts.listPrompts({
  filter: { tags: ['public'] },
});
```

`tags` requires **all** listed tags (AND). `anyTag` requires **at least one** (OR). `exclude` rejects prompts with **any** listed tag (NOT).

### Pagination

```typescript
prompts.configurePagination({
  pageSize: 25,
  cursorMode: 'signed',
  cursorSecret: process.env['CURSOR_SECRET'],
});

const page1 = await prompts.listPrompts();
const page2 = await prompts.listPrompts({ cursor: page1.nextCursor });
```

## Schema-Informed Coercion {#coercion}

MCP transmits prompt arguments as `Record<string, string>`. The engine reads your Zod schema AST and coerces deterministically before validation:

```
Client sends:    { "limit": "50", "strict": "true", "month": "january" }
After coercion:  { "limit": 50,   "strict": true,   "month": "january" }
```

`ZodNumber` → `Number(value)`. `ZodBoolean` → `value === 'true'`. `ZodEnum` and `ZodString` pass through. If coerced values fail validation, the engine returns a structured XML error with per-field messages.

## Middleware {#middleware}

Same `MiddlewareFn` signature as tool middleware — share handlers between tools and prompts.

### Fluent Builder (Recommended)

```typescript
const SecureReport = f.prompt('secure_report')
  .describe('Generate a quarterly financial report')
  .tags('finance', 'internal')
  .input({
    quarter: { enum: ['Q1', 'Q2', 'Q3', 'Q4'] as const },
  })
  .use(requireAuth, requireRole('finance'))
  .handler(async (ctx, { quarter }) => {
    const data = await ctx.db.finance.getQuarterlyReport(quarter);
    return {
      messages: [
        PromptMessage.system('You are a financial analyst. Data is CONFIDENTIAL.'),
        PromptMessage.user(`Analyze ${quarter} performance:\n${JSON.stringify(data)}`),
      ],
    };
  });
```

### Config-Bag

```typescript
const SecurePrompt = definePrompt<AppContext>('secure_report', {
  middleware: [requireAuth, requireRole('finance')],
  args: { quarter: { enum: ['Q1', 'Q2', 'Q3', 'Q4'] as const } } as const,
  handler: async (ctx, { quarter }) => {
    const data = await ctx.db.finance.getQuarterlyReport(quarter);
    return {
      messages: [
        PromptMessage.system('You are a financial analyst. Data is CONFIDENTIAL.'),
        PromptMessage.user(`Analyze ${quarter} performance:\n${JSON.stringify(data)}`),
      ],
    };
  },
});
```

Middleware is pre-compiled at registration time. Outermost-first execution, no runtime allocation.

## Interceptors {#interceptors}

Run after the handler but before returning to the client. They inject content unconditionally — compliance footers, tenant context, RBAC constraints:

```typescript
prompts.useInterceptor(async (ctx, builder, meta) => {
  builder.appendUser(`--- Compliance Footer: Tenant ${ctx.tenantId} ---`);
  builder.prependSystem(`Security classification: ${ctx.securityLevel}`);
});
```

`InterceptorBuilder` methods: `prependSystem`, `appendSystem`, `prependUser`, `appendUser`, `appendAssistant`, `prependContext(tag, data)`, `appendContext(tag, data)`. The `meta` argument provides `name`, `description`, and `tags` of the executing prompt.

Interceptors run even after timeouts or errors, ensuring compliance content is always injected.

## Hydration Timeout {#timeout}

Wraps the handler in `Promise.race`. If the handler exceeds the deadline, the framework returns an XML alert and unblocks the UI:

### Fluent Builder (Recommended)

```typescript
const MorningBriefing = f.prompt('morning_briefing')
  .title('Morning Briefing')
  .describe('Prepare context for the daily standup')
  .timeout(3000) // 3s strict deadline
  .handler(async (ctx, args) => {
    const tickets = await ctx.invokeTool('jira.get_assigned', { user: ctx.user.id });
    const invoices = await ctx.invokeTool('billing.list_invoices', {});
    return {
      messages: [
        PromptMessage.system('Plan my day based on this context:'),
        PromptMessage.user(`Tickets:\n${tickets.text}\n\nInvoices:\n${invoices.text}`),
      ],
    };
  });
```

### Config-Bag

```typescript
const MorningBriefing = definePrompt<AppContext>('morning_briefing', {
  hydrationTimeout: 3000,
  handler: async (ctx, args) => {
    const tickets = await ctx.invokeTool('jira.get_assigned', { user: ctx.user.id });
    const invoices = await ctx.invokeTool('billing.list_invoices', {});
    return {
      messages: [
        PromptMessage.system('Plan my day based on this context:'),
        PromptMessage.user(`Tickets:\n${tickets.text}\n\nInvoices:\n${invoices.text}`),
      ],
    };
  },
});
```

Timeout response:

```xml
<hydration_alert>
  <status>TIMEOUT</status>
  <deadline_ms>3000</deadline_ms>
  <message>Prompt hydration did not complete within 3.0s.</message>
  <guidance>Proceed with available context. Do NOT retry automatically.</guidance>
</hydration_alert>
```

Set a global default with `prompts.setDefaultHydrationTimeout(5000)`. Individual prompts override it. When no timeout is configured, no timer or `Promise.race` is created.

## Lifecycle Sync {#lifecycle}

When the catalog changes at runtime, notify connected clients:

```typescript
featureFlags.on('beta-audit.enabled', () => {
  prompts.register(AuditPrompt);
  prompts.notifyChanged();
});
```

Multiple `notifyChanged()` calls within 100ms coalesce into one `notifications/prompts/list_changed`.

## fromView() {#from-view}

`PromptMessage.fromView()` decomposes a Presenter's `ResponseBuilder` into XML-tagged messages, eliminating duplication between tool responses and prompt context:

```typescript
handler: async (ctx, { period }) => {
  const flagged = await ctx.db.transactions.getRecent(period);
  return {
    messages: [
      PromptMessage.system('You are a Compliance Officer.'),
      ...PromptMessage.fromView(InvoicePresenter.make(flagged, ctx)),
      PromptMessage.user(`Review ${flagged.length} flagged transactions.`),
    ],
  };
}
```

`fromView()` extracts domain rules (`<domain_rules>`, system role), validated data + UI blocks (`<dataset>` + `<visual_context>`, user role), and affordances (`<system_guidance>`, system role) from the Presenter. When the Presenter's `systemRules()` change, both tool responses and prompt context update automatically.

Composes with all other `PromptMessage` methods:

```typescript
messages: [
  PromptMessage.system('You are a design reviewer.'),
  PromptMessage.image('user', screenshotBase64, 'image/png'),
  ...PromptMessage.fromView(ProjectPresenter.make(project, ctx)),
  PromptMessage.resource('user', 'file:///specs/design.md'),
  PromptMessage.user('Review the design against the spec.'),
]
```

## Execution Pipeline {#pipeline}

```text
1. Coercion     — Zod AST → "50" becomes 50, "true" becomes true
2. Validation   — .strict().safeParse(), rejects unknown fields
3. Middleware    — pre-compiled chain
4. Deadline     — Promise.race (if hydrationTimeout set)
5. Handler      — fetches data, builds messages
6. Interceptors — compliance injection (always runs)
```

Prompt lookup is O(1) (Map-based). Coercion and validation are O(N) where N = argument count. Middleware is O(1) (pre-compiled). `notifyChanged()` debounces at 100ms.

## API Reference {#api}

### `f.prompt(name)` — Fluent Builder (Recommended)

Returns `FluentPromptBuilder<TContext>`. Chain `.title()`, `.describe()`, `.icons()`, `.tags()`, `.input()`, `.use()`, `.timeout()`, `.handler()`.

### `f.prompt(name, config)` / `definePrompt(name, config)` — Config-Bag

Returns `PromptBuilder<TContext>`.

### `PromptMessage`

| Method | Description |
|---|---|
| `.system(text)` | System instruction (maps to `user` role) |
| `.user(text)` | User message |
| `.assistant(text)` | Seed assistant response |
| `.image(role, data, mimeType)` | Base64 image |
| `.audio(role, data, mimeType)` | Base64 audio |
| `.resource(role, uri, options?)` | Embedded resource |
| `.fromView(builder)` | Decompose Presenter into prompt messages |

### `PromptRegistry<TContext>`

| Method | Description |
|---|---|
| `register(builder)` | Register a single prompt |
| `registerAll(...builders)` | Register multiple prompts |
| `listPrompts(request?)` | Paginated list with filter and cursor |
| `routeGet(ctx, name, args)` | Route a `prompts/get` request |
| `useInterceptor(fn)` | Post-handler interceptor |
| `configurePagination(options)` | Page size, cursor mode, cursor secret |
| `setDefaultHydrationTimeout(ms)` | Global hydration deadline |
| `notifyChanged()` | Notify clients (debounced 100ms) |
| `has(name)` | Check if registered |
| `clear()` | Remove all |
| `size` | Count of registered prompts |

### Core Types

| Type | Shape |
|---|---|
| `PromptResult` | `{ description?, messages: PromptMessagePayload[] }` |
| `PromptMessagePayload` | `{ role: 'user' \| 'assistant', content: PromptContentBlock }` |
| `PromptContentBlock` | `TextContent \| ImageContent \| AudioContent \| ResourceContent` |
| `PromptFilter` | `{ tags?, anyTag?, exclude? }` |
| `PromptParamsMap` | `Record<string, PromptParamDef>` |
| `InferPromptArgs<T>` | Compile-time type inference from params map |
