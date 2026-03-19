# Prompt Engine

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create a prompt called 'incident_analysis' with auth middleware, Zod-typed args (incident_id, severity enum), and a handler that fetches from the database and seeds a structured SRE analysis."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create a prompt called \'incident_analysis\' with auth middleware, Zod-typed args (incident_id, severity enum), and a handler that fetches from the database and seeds a structured SRE analysis.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+prompt+called+'incident_analysis'+with+auth+middleware%2C+Zod-typed+args+(incident_id%2C+severity+enum)%2C+and+a+handler+that+fetches+from+the+database+and+seeds+a+structured+SRE+analysis." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+prompt+called+'incident_analysis'+with+auth+middleware%2C+Zod-typed+args+(incident_id%2C+severity+enum)%2C+and+a+handler+that+fetches+from+the+database+and+seeds+a+structured+SRE+analysis." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">SERVER-SIDE TEMPLATES</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Slash commands for agents.<br><span style="color:rgba(255,255,255,0.25)">Data-hydrated, middleware-secured.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">MCP Prompts return structured messages — instructions, fetched data, domain rules — as a ready-to-use array. Clients expose them as slash commands. The Prompt Engine is opt-in.</div>
</div>

Prompt arguments must be **flat primitives** (string, number, boolean, enum). MCP clients render them as form controls — the engine enforces this at definition time.
## Defining a Prompt — Fluent Builder (Recommended) {#fluent}

The Fluent Prompt Builder provides a chainable API that mirrors the Fluent Tool Builder. Use `f.prompt(name)` (no config object) to start the chain:

```typescript
import { initVurb, PromptMessage } from '@vurb/core';

const f = initVurb<AppContext>();

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
import { initVurb, PromptMessage, PromptRegistry } from '@vurb/core';

const f = initVurb<AppContext>();

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
import { definePrompt, PromptMessage } from '@vurb/core';

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
import { PromptRegistry } from '@vurb/core';

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
