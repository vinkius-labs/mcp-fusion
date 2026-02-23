# Prompt Engine

MCP Fusion's Prompt Engine brings the same **zero-Zod, enterprise-ready** DX of `defineTool()` to MCP Prompts — server-side hydrated templates that prepare context for LLMs. Define prompts declaratively, let the framework handle coercion, validation, middleware, and lifecycle sync.

**100% MCP Spec Compliant** — supports all `ContentBlock` types (text, image, audio, resource), `BaseMetadata` fields (`title`, `icons`), and full lifecycle notifications.

::: tip Zero Overhead
The Prompt Engine is fully opt-in. When not configured, **no code runs** — no handlers registered, no notifications sent. The engine only activates when you pass `prompts` to `attachToServer()`.
:::

---

## What Are MCP Prompts?

MCP Prompts are **server-side templates** that prepare structured context for LLM conversations. Unlike tools (which execute actions), prompts assemble messages with instructions, fetched data, and domain context — they're your **SOPs as Code**.

| Concept | Tools | Prompts |
|---|---|---|
| **MCP Protocol** | `tools/list` + `tools/call` | `prompts/list` + `prompts/get` |
| **Purpose** | Execute actions, return results | Assemble context, return messages |
| **Handler returns** | `ToolResponse` (data) | `PromptResult` (messages array) |
| **Client UX** | Function call | Slash command palette |
| **Arguments** | Any JSON shape (complex schemas) | **Flat primitives only** (forms) |

### The Insight

MCP clients like Claude Desktop and Cursor render prompt arguments as **visual forms** — text fields, dropdowns, toggles. Nested objects and arrays cannot be displayed as form controls. The Prompt Engine enforces this constraint at definition time, preventing runtime surprises.

---

## Quick Start

```typescript
import { definePrompt, PromptMessage, PromptRegistry } from '@vinkius-core/mcp-fusion';

// 1. Define a prompt — args are fully typed via `as const`
const SummarizePrompt = definePrompt('summarize', {
    description: 'Summarize text with a given style.',
    args: {
        text: { type: 'string', description: 'The text to summarize' },
        style: { enum: ['brief', 'detailed', 'bullet-points'] as const },
    } as const,
    handler: async (ctx, { text, style }) => ({
        //                  ^^^^  ^^^^^  ← fully typed!
        messages: [
            PromptMessage.system('You are a professional summarizer. Follow the given style precisely.'),
            PromptMessage.user(`Style: ${style}\n\nText:\n${text}`),
        ],
    }),
});

// 2. Register in a PromptRegistry
const prompts = new PromptRegistry();
prompts.register(SummarizePrompt);

// 3. Attach to server alongside tools
registry.attachToServer(server, {
    contextFactory: () => createContext(),
    prompts,  // ← opt-in
});
```

That's it. MCP clients can now discover the prompt via `prompts/list` and hydrate it via `prompts/get`.

---

## `definePrompt()` — Type-Safe Prompt Builder

The main factory for creating prompts. Uses **function overloads** for full TypeScript type inference — zero Zod imports for simple cases, full Zod power when needed.

### JSON-First Approach <Badge type="tip" text="Recommended" />

Declare args as plain objects. Add `as const` to unlock compile-time type inference:

```typescript
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';

const CodeReviewPrompt = definePrompt<AppContext>('code_review', {
    title: 'Request Code Review',  // ← MCP BaseMetadata
    description: 'Review code with configurable strictness.',
    icons: { light: '🔍', dark: '🔎' },  // ← MCP Icons
    args: {
        language: { enum: ['typescript', 'python', 'go', 'rust'] as const },
        strictness: { type: 'number', min: 1, max: 10, description: 'Review strictness (1-10)' },
        focus: { type: 'string', optional: true, description: 'Specific area to focus on' },
    } as const,
    middleware: [requireAuth],
    handler: async (ctx, { language, strictness, focus }) => {
        //                  ^^^^^^^^  ^^^^^^^^^^  ^^^^^  ← all typed!
        const guidelines = await ctx.db.codeGuidelines.findByLanguage(language);

        return {
            messages: [
                PromptMessage.system(
                    `You are a Senior Code Reviewer.\n` +
                    `Language: ${language}\n` +
                    `Strictness: ${strictness}/10\n\n` +
                    `Guidelines:\n${guidelines.map(g => `- ${g.rule}`).join('\n')}`
                ),
                PromptMessage.user(
                    focus
                        ? `Review the code with focus on: ${focus}`
                        : 'Review the code comprehensively.'
                ),
            ],
        };
    },
});
```

::: tip Type Inference
`definePrompt` uses function overloads to infer handler arg types:
- **JSON-first path:** `InferPromptArgs<T>` maps each descriptor to its TS type (`'string'` → `string`, `'number'` → `number`, etc.)
- **Zod path:** `z.infer<>` extracts the full output type from the Zod schema

Both paths give you **full autocomplete** in the handler — no casting needed.
:::

### Parameter Shorthand

Same shorthands as `defineTool()` — no verbose descriptors needed for simple params:

```typescript
// These are equivalent:
args: { name: 'string' }
args: { name: { type: 'string' } }

// Full descriptor with constraints:
args: {
    month: { enum: ['january', 'february', 'march'] as const },
    limit: { type: 'number', min: 1, max: 100 },
    verbose: 'boolean',
    email: { type: 'string', regex: '^[\\w-.]+@([\\w-]+\\.)+[\\w-]{2,4}$' },
    nickname: { type: 'string', optional: true },
}
```

### Zod Approach

When you need transforms, defaults, or custom refinements, pass a `z.object()` directly. Handler args are inferred via `z.infer<>`:

```typescript
import { z } from 'zod';

const AuditPrompt = definePrompt<AppContext>('audit_invoices', {
    description: 'Enterprise billing audit workflow.',
    args: z.object({
        month: z.enum(['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december']),
        year: z.number().min(2020).max(2030),
        strict_mode: z.boolean().default(true).describe('Enable strict validation rules'),
    }),
    middleware: [requireAuth, requireRole('auditor')],
    handler: async (ctx, { month, year, strict_mode }) => {
        //                  ^^^^^  ^^^^  ^^^^^^^^^^^  ← inferred from z.object!
        const invoices = await ctx.db.billing.getByMonth(month, year);
        const anomalies = invoices.filter(inv => inv.amount > 10000);

        return {
            messages: [
                PromptMessage.system(
                    'You are a Senior Financial Auditor at a Fortune 500 company.\n' +
                    'RULES:\n' +
                    '- All amounts are in CENTS — divide by 100 for display.\n' +
                    '- Flag any invoice > $10,000 for manual review.\n' +
                    `- Strict mode: ${strict_mode ? 'ON' : 'OFF'}`
                ),
                PromptMessage.user(
                    `Audit ${invoices.length} invoices for ${month} ${year}.\n` +
                    `${anomalies.length} anomalies detected.\n\n` +
                    `Data:\n${JSON.stringify(invoices, null, 2)}`
                ),
            ],
        };
    },
});
```

::: warning Flat Schema Constraint
Prompt arguments are restricted to **flat primitives only**: `string`, `number`, `boolean`, `enum`. Arrays and nested objects are rejected at definition time with a descriptive error:

```
[definePrompt] Argument 'filters' uses type 'ZodArray', which is not supported
in MCP prompt arguments. MCP clients render prompt args as visual forms — only
flat primitives (string, number, boolean, enum) are supported.
💡 If you need complex data, fetch it server-side inside the handler instead.
```

**Design principle:** If you need complex data (arrays of IDs, nested filters), fetch it server-side inside the handler using the `ctx` object — don't force the user to type JSON into a form field.
:::

---

## `PromptMessage` — Message Factory

The `PromptMessage` object provides ergonomic helpers for all MCP content types — text, image, audio, and embedded resources.

```typescript
import { PromptMessage } from '@vinkius-core/mcp-fusion';

// Instead of:
{ role: 'user', content: { type: 'text', text: 'Hello' } }

// Write:
PromptMessage.user('Hello')
```

### Text Methods

| Method | Description | MCP Role |
|---|---|---|
| `PromptMessage.system(text)` | System instruction (prepended to context) | `user` * |
| `PromptMessage.user(text)` | User message  | `user` |
| `PromptMessage.assistant(text)` | Seed assistant's first response | `assistant` |

::: info Why system() maps to `user` role
The MCP protocol only supports `user` and `assistant` roles in `PromptMessage`. System instructions are conveyed as the **first** user message by convention — MCP clients treat the first message as the system prompt.
:::

### Multi-Modal Methods

Full MCP `ContentBlock` support — embed images, audio, and server resources:

| Method | Signature | Content Type |
|---|---|---|
| `PromptMessage.image(role, data, mimeType)` | Base64 image | `{ type: 'image' }` |
| `PromptMessage.audio(role, data, mimeType)` | Base64 audio | `{ type: 'audio' }` |
| `PromptMessage.resource(role, uri, options?)` | Embedded resource | `{ type: 'resource' }` |

```typescript
handler: async (ctx, { projectId }) => ({
    messages: [
        PromptMessage.system('You are a visual design reviewer.'),
        // Embed a screenshot from the server
        PromptMessage.image('user', await ctx.screenshots.get(projectId), 'image/png'),
        // Embed a file from the resource system
        PromptMessage.resource('user', `file:///designs/${projectId}/spec.md`, {
            mimeType: 'text/markdown',
            text: await ctx.files.read(`designs/${projectId}/spec.md`),
        }),
        PromptMessage.user('Review this design against the spec.'),
    ],
})
```

### Example: Multi-Turn Seeding

```typescript
handler: async (ctx, args) => ({
    messages: [
        PromptMessage.system('You are a database migration specialist.'),
        PromptMessage.user('Analyze the schema changes and generate a migration plan.'),
        PromptMessage.assistant('I will analyze each table change systematically:\n\n1. '),
        // ↑ Seeds the assistant's initial response structure
    ],
})
```

---

## `PromptRegistry` — Registration & Routing

The `PromptRegistry` is the centralized catalog for all prompt builders. It handles registration, routing, RBAC filtering, and lifecycle sync.

```typescript
import { PromptRegistry } from '@vinkius-core/mcp-fusion';

const prompts = new PromptRegistry<AppContext>();
prompts.register(SummarizePrompt);
prompts.register(AuditPrompt);
prompts.register(CodeReviewPrompt);

// Or register multiple at once:
prompts.registerAll(SummarizePrompt, AuditPrompt, CodeReviewPrompt);
```

### Duplicate Detection

Attempting to register two prompts with the same name throws immediately:

```typescript
prompts.register(definePrompt('summarize', { /* ... */ }));
prompts.register(definePrompt('summarize', { /* ... */ }));
// ❌ Error: Prompt "summarize" is already registered.
```

### Tag-Based Filtering (RBAC)

Use tags to control which prompts are exposed to different user roles:

```typescript
const AdminPrompt = definePrompt('admin_reset', {
    description: 'Reset system caches.',
    tags: ['admin', 'internal'],
    handler: async (ctx, args) => ({ /* ... */ }),
});

const UserPrompt = definePrompt('help', {
    description: 'Get help with the platform.',
    tags: ['public'],
    handler: async (ctx, args) => ({ /* ... */ }),
});

// Attach with filter — only public prompts are visible
registry.attachToServer(server, {
    prompts,
    filter: { tags: ['public'] },
});
```

Filter options:

| Option | Logic | Example |
|---|---|---|
| `tags` | AND — prompt must have **all** specified tags | `{ tags: ['core', 'v2'] }` |
| `anyTag` | OR — prompt must have **at least one** of these tags | `{ anyTag: ['admin', 'ops'] }` |
| `exclude` | NOT — prompt must NOT have **any** of these tags | `{ exclude: ['internal'] }` |

---

## Schema-Informed Coercion

MCP transmits **all** prompt arguments as `Record<string, string>` — everything arrives as a string. The Prompt Engine reads the Zod schema AST and coerces values **deterministically** before validation.

```
MCP Client sends:  { "limit": "50", "strict": "true", "month": "january" }
After coercion:    { "limit": 50,   "strict": true,   "month": "january" }
Schema expected:   { limit: number, strict: boolean,  month: enum }
```

| Zod Type | Coercion Rule | Example |
|---|---|---|
| `ZodNumber` | `Number(value)` | `"50"` → `50` |
| `ZodBoolean` | `value === 'true'` | `"true"` → `true` |
| `ZodEnum` | Pass-through (already a string) | `"january"` → `"january"` |
| `ZodString` | Pass-through | `"hello"` → `"hello"` |

::: info NOT Guessing
This is not heuristic coercion. The engine reads the **developer's declared schema** to determine expected types. It's deterministic and cannot produce unexpected conversions.
:::

### Validation Errors

If coerced arguments fail Zod validation, the engine returns a coaching error message:

```xml
<validation_error>
<field name="limit">Number must be less than or equal to 100</field>
<field name="month">Invalid enum value. Expected 'january' | 'february' | ... | 'december', received 'foo'</field>
<recovery>Check the prompt definition for valid argument types and values.</recovery>
</validation_error>
```

---

## Middleware

Prompt middleware uses the **same `MiddlewareFn` signature** as tool middleware. This means you can share middleware between tools and prompts with zero changes.

```typescript
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';

const requireAuth: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    if (!ctx.session?.userId) {
        return { messages: [PromptMessage.user('⚠️ Authentication required.')] };
    }
    return next();
};

const SecurePrompt = definePrompt<AppContext>('secure_report', {
    description: 'Generate a confidential financial report.',
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

### Execution Order

```text
Middleware 1 → Middleware 2 → ... → Middleware N → Handler
(outermost)                                       (innermost)
```

Middleware is pre-compiled at registration time (same as tool middleware) — zero runtime array allocation.

---

## Hydration Timeout Sandbox <Badge type="tip" text="v1.10.0" />

Prompt handlers fetch data from external sources — APIs, databases, third-party services. If any source hangs (15s Jira timeout, API 500), the UI freezes and the user stares at a blank screen.

The **Hydration Timeout Sandbox** wraps the handler in a strict `Promise.race` deadline. If the handler doesn't complete in time, the framework cuts the Promise, unblocks the UI immediately, and returns a structured SYSTEM ALERT.

::: danger The Problem
```
User: /morning_briefing
  └── handler:
        ├── ctx.invokeTool('jira.get_assigned')  ← 15s timeout 💀
        ├── ctx.invokeTool('billing.invoices')   ← Stripe OK
        └── return { messages: [...] }           ← never reached

User staring at frozen screen for 15 seconds...
```
:::

### Per-Prompt Deadline

Set a strict deadline for individual prompts:

```typescript
const MorningBriefing = definePrompt<AppContext>('morning_briefing', {
    hydrationTimeout: 3000, // 3 seconds strict
    description: 'Daily briefing with Jira tickets and invoices.',
    handler: async (ctx, args) => {
        // If Jira takes 15s, the framework cuts at 3s
        const tickets = await ctx.invokeTool('jira.get_assigned', { user: ctx.user.id });
        const invoices = await ctx.invokeTool('billing.list_invoices', { date: args.date });

        return {
            messages: [
                PromptMessage.system('Plan my day based on this context:'),
                PromptMessage.user(`### Tickets\n${tickets.text}\n\n### Invoices\n${invoices.text}`),
            ],
        };
    },
});
```

### Registry-Level Default

Set a global safety net for ALL prompts. Individual prompts can still override:

```typescript
const prompts = new PromptRegistry<AppContext>();
prompts.setDefaultHydrationTimeout(5000); // 5s global safety net

// This prompt inherits the 5s default:
prompts.register(HelpPrompt);

// This prompt overrides with its own 3s deadline:
prompts.register(MorningBriefing); // hydrationTimeout: 3000
```

### Three Guarantees

The sandbox covers **three** scenarios — the UI ALWAYS unblocks:

| Scenario | Result | Alert |
|---|---|---|
| **Handler completes in time** | Returns `PromptResult` normally | None |
| **Handler exceeds deadline** | Returns structured TIMEOUT alert | `<hydration_alert><status>TIMEOUT</status>` |
| **Handler throws** (API error, crash) | Returns structured ERROR alert | `<hydration_alert><status>ERROR</status>` |

### The SYSTEM ALERT Format

When a timeout or error occurs, the framework returns an XML-structured alert:

```xml
<hydration_alert>
  <status>TIMEOUT</status>
  <deadline_ms>3000</deadline_ms>
  <message>Prompt hydration did not complete within 3.0s. External data sources (APIs, databases) did not respond within the deadline.</message>
  <guidance>Proceed with the conversation using available context. The user's request is still valid — answer with your general knowledge and inform the user that live data could not be fetched at this time. Do NOT retry the same prompt automatically.</guidance>
</hydration_alert>
```

::: info Why XML?
The same pattern used by `<tool_error>` and `<validation_error>` — frontier LLMs (Claude, GPT-4, Gemini) parse XML semantic boundaries deterministically. The LLM knows exactly what happened and how to proceed.
:::

### Interceptors Still Run

Even when the handler times out, **Prompt Interceptors still execute**. This ensures compliance headers, tenant context, and RBAC constraints are always injected:

```typescript
// This interceptor runs even after a timeout:
prompts.useInterceptor(async (ctx, builder) => {
    builder.appendUser('--- Compliance Footer ---');
});

// Result after timeout: [TIMEOUT ALERT, Compliance Footer]
```

### Design Influences

| Pattern | Source | Application |
|---|---|---|
| `context.WithDeadline` | Go stdlib | Structured cancellation per-call |
| gRPC Deadline Propagation | Google | Strict, per-RPC time limits |
| Resilience4j TimeLimiter | JVM | Circuit breaker timeout pattern |
| `Promise.race` | ECMAScript | Native race condition resolution |

::: tip Zero Overhead
When no `hydrationTimeout` is configured (neither per-prompt nor registry-level), no timer is created, no Promise.race is executed. The handler runs directly — zero overhead.
:::

---

## Lifecycle Sync

When the prompt catalog changes at runtime (e.g., RBAC update, feature flag toggle), connected clients need to re-fetch `prompts/list`. The `PromptRegistry` handles this via **debounced lifecycle notifications**.

```typescript
// In your RBAC webhook handler:
app.post('/webhooks/role-changed', async (req) => {
    await db.users.updateRole(req.userId, req.newRole);
    prompts.notifyChanged();  // → notifications/prompts/list_changed
});

// In your feature flag handler:
featureFlags.on('prompt.beta-workflow.enabled', () => {
    prompts.register(BetaWorkflowPrompt);
    prompts.notifyChanged();  // All connected clients refresh instantly
});
```

### How It Works

1. **`notifyChanged()` is called** on the `PromptRegistry`
2. **Debounce**: Multiple calls within 100ms are coalesced into a single notification
3. **`notifications/prompts/list_changed`** is sent via the MCP SDK
4. **MCP clients** receive the signal and re-fetch `prompts/list`

::: info Automatic Wiring
When you pass `prompts` to `attachToServer()`, the framework automatically wires the notification sink to the MCP SDK's `sendPromptListChanged()` method. No manual configuration required.
:::

---

## Server Integration

The Prompt Engine integrates with `attachToServer()` via the `prompts` option:

```typescript
import { ToolRegistry, PromptRegistry } from '@vinkius-core/mcp-fusion';

const toolRegistry = new ToolRegistry<AppContext>();
const promptRegistry = new PromptRegistry<AppContext>();

// Register tools and prompts
toolRegistry.registerAll(tasksTool, projectsTool);
promptRegistry.registerAll(SummarizePrompt, AuditPrompt, CodeReviewPrompt);

// Attach both to the server
toolRegistry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    prompts: promptRegistry,         // ← Prompt Engine activated
    stateSync: { /* ... */ },        // ← Composes with all features
    debug: createDebugObserver(),    // ← Observability works too
});
```

### What Gets Registered

| MCP Method | Handler | Description |
|---|---|---|
| `prompts/list` | Prompt list handler | Returns all (or filtered) prompt definitions |
| `prompts/get` | Prompt get handler | Hydrates a prompt: coercion → validation → middleware → handler |

---

## Architecture

The Prompt Engine is built from **5 modules**, each with a single responsibility:

```
prompt/
├── PromptTypes.ts              → Core types, contracts, InferPromptArgs<T> (zero runtime)
├── PromptMessage.ts            → Factory helpers: text, image, audio, resource
├── PromptExecutionPipeline.ts  → Coercion, validation, middleware, execution
├── HydrationSandbox.ts         → Structured deadline for handler execution
├── definePrompt.ts             → definePrompt() overloads + PromptBuilderImpl
└── index.ts                    → Barrel exports

registry/
└── PromptRegistry.ts           → Registration, routing, filtering, lifecycle sync
```

### Hydration Pipeline

When a `prompts/get` request arrives, the execution flows through:

```text
┌───────────────────────────────────────────────────────────┐
│ 1. Schema-Informed Coercion                               │
│    "50" → 50, "true" → true (reads Zod AST)              │
├───────────────────────────────────────────────────────────┤
│ 2. Zod Validation (.strict())                             │
│    Rejects unknown fields + validates constraints         │
├───────────────────────────────────────────────────────────┤
│ 3. Middleware Chain                                        │
│    auth → rbac → audit → ... (pre-compiled)               │
├───────────────────────────────────────────────────────────┤
│ 4. Hydration Deadline (if configured)                      │
│    Promise.race: handler vs timeout → SYSTEM ALERT        │
├───────────────────────────────────────────────────────────┤
│ 5. Handler Execution                                       │
│    Fetches data, builds messages, returns PromptResult     │
└───────────────────────────────────────────────────────────┘
```

### Performance Characteristics

| Operation | Complexity | Notes |
|---|---|---|
| Prompt lookup | O(1) | Map-based routing |
| Coercion | O(N) | N = number of arguments |
| Validation | O(N) | Zod .strict().safeParse() |
| Middleware | O(1) | Pre-compiled chain |
| Tag filtering | O(B×T) | B = builders, T = tags per builder |
| `notifyChanged()` | Debounced 100ms | Multiple calls coalesced |

---

## Real-World Patterns

### Onboarding Wizard

```typescript
const OnboardingPrompt = definePrompt<AppContext>('onboarding', {
    title: 'Personalized Onboarding',
    description: 'Generate a personalized onboarding plan.',
    args: {
        role: { enum: ['developer', 'designer', 'manager', 'executive'] as const },
        experience: { type: 'number', min: 0, max: 30, description: 'Years of experience' },
        focus: { type: 'string', optional: true, description: 'Specific area of interest' },
    } as const,
    handler: async (ctx, { role, experience, focus }) => {
        const team = await ctx.db.teams.getByRole(role);
        const resources = await ctx.db.resources.getOnboarding(role);

        return {
            messages: [
                PromptMessage.system(
                    `You are an Onboarding Specialist at ${ctx.company.name}.\n` +
                    `Team size: ${team.length} members.\n` +
                    `Available resources: ${resources.length} guides.`
                ),
                PromptMessage.user(
                    `Create a personalized 30-day onboarding plan for a ${role} ` +
                    `with ${experience} years of experience.` +
                    (focus ? `\nFocus area: ${focus}` : '')
                ),
            ],
        };
    },
});
```

---

## MVA-Driven Prompts — `fromView()` <Badge type="tip" text="NEW" />

The most powerful DX feature in **MCP Fusion**: **reuse your entire Presenter layer inside Prompts** — zero text assembly, zero duplication.

### The Problem

Without `fromView()`, Prompt handlers duplicate everything the Presenter already knows:

```typescript
// ❌ BEFORE: Manual assembly — rules are DUPLICATED from the Presenter
handler: async (ctx, { period, threshold }) => {
    const flagged = await ctx.db.transactions.getRecent(period);
    const view = InvoicePresenter.make(flagged, ctx).build();

    return {
        messages: [
            PromptMessage.system(
                'You are a Compliance Officer.\n' +
                'RULES:\n' +                                      // ← DUPLICATED!
                '- All amounts are in CENTS.\n' +                 // ← Already in Presenter
                '- Flag transactions without documentation.\n'   // ← Already in Presenter
            ),
            PromptMessage.user(
                `Review transactions:\n\n` +
                view.content.map(c => c.text).join('\n')          // ← Leaky abstraction
            ),
        ],
    };
}
```

### The Solution

```typescript
// ✅ AFTER: Zero-text assembly — Presenter IS the source of truth
handler: async (ctx, { period, threshold }) => {
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

::: info Single Source of Truth
If a Presenter's `systemRules()` change, both the Tool response **and** the Prompt update automatically — zero duplication, zero drift.
:::

### How Decomposition Works

`fromView()` reads the `ResponseBuilder`'s internal layers and decomposes them into XML-tagged prompt messages optimized for frontier LLMs (Claude, GPT-4, Gemini):

```text
Presenter.make(data, ctx) → ResponseBuilder
    ↓
PromptMessage.fromView(builder)
    ↓
    ┌──────────────────────────────────────────────────────┐
    │ 1. <domain_rules>     → system message              │
    │    Presenter's systemRules(), RBAC-filtered          │
    ├──────────────────────────────────────────────────────┤
    │ 2. <dataset>          → user message                 │
    │    Validated JSON in ```json``` fence                │
    │    <visual_context>   → same user message            │
    │    UI blocks (ECharts, Mermaid, tables)              │
    ├──────────────────────────────────────────────────────┤
    │ 3. <system_guidance>  → system message               │
    │    LLM hints + HATEOAS action suggestions            │
    └──────────────────────────────────────────────────────┘
```

| Layer | XML Tag | MCP Role | Source |
|---|---|---|---|
| Domain Rules | `<domain_rules>` | system | `Presenter.systemRules()` |
| Data | `<dataset>` | user | Validated + filtered JSON |
| Visuals | `<visual_context>` | user | `Presenter.uiBlocks()` |
| Affordances | `<system_guidance>` | system | `suggestActions()` + `llmHint()` |

::: tip Why XML Tags?
Frontier models (especially Claude 3.5+) are strongly optimized for reading XML-tagged blocks. The semantic tags (`<domain_rules>`, `<dataset>`, `<system_guidance>`) prevent **context leakage** — the LLM never confuses rules with data, or data with hints.
:::

### Full Example

```typescript
import { definePrompt, PromptMessage } from '@vinkius-core/mcp-fusion';
import { InvoicePresenter } from './presenters/InvoicePresenter';

const CompliancePrompt = definePrompt<AppContext>('compliance_check', {
    title: 'Transaction Compliance Check',
    description: 'Run a compliance check on recent transactions.',
    args: {
        period: { enum: ['7d', '30d', '90d'] as const, description: 'Lookback period' },
        threshold: { type: 'number', min: 0, description: 'Amount threshold in cents' },
    } as const,
    middleware: [requireAuth, requireRole('compliance')],
    handler: async (ctx, { period, threshold }) => {
        const transactions = await ctx.db.transactions.getRecent(period);
        const flagged = transactions.filter(t => t.amount > threshold);

        return {
            messages: [
                PromptMessage.system('You are a Compliance Officer.'),
                ...PromptMessage.fromView(InvoicePresenter.make(flagged, ctx)),
                PromptMessage.user(
                    `Review ${flagged.length} flagged transactions ` +
                    `(threshold: $${(threshold / 100).toFixed(2)}).`
                ),
            ],
        };
    },
});
```

### Composability

`fromView()` returns a plain `PromptMessagePayload[]` — it composes naturally with all other `PromptMessage` methods:

```typescript
messages: [
    PromptMessage.system('You are a design reviewer.'),
    PromptMessage.image('user', screenshotBase64, 'image/png'),    // ← image
    ...PromptMessage.fromView(ProjectPresenter.make(project, ctx)), // ← Presenter
    PromptMessage.resource('user', 'file:///specs/design.md'),      // ← resource
    PromptMessage.user('Review the design against the spec.'),
]
```

### Dynamic Prompt Registration

```typescript
// Register prompts based on feature flags
const prompts = new PromptRegistry<AppContext>();
prompts.register(SummarizePrompt);
prompts.register(CodeReviewPrompt);

if (featureFlags.isEnabled('beta-audit')) {
    prompts.register(AuditPrompt);
}

// Later, when a feature flag changes:
featureFlags.on('beta-audit.enabled', () => {
    prompts.register(AuditPrompt);
    prompts.notifyChanged();
});
```

---

## API Reference

### `definePrompt(name, config)`

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Unique prompt identifier (slash command name) |
| `config.title` | `string?` | Human-readable display title (MCP `BaseMetadata`) |
| `config.description` | `string?` | Human-readable description |
| `config.icons` | `{ light?: string; dark?: string }?` | Theme icons (MCP `Icons`) |
| `config.args` | `PromptParamsMap \| ZodObject?` | Argument definitions (flat only) |
| `config.tags` | `string[]?` | Capability tags for RBAC filtering |
| `config.middleware` | `MiddlewareFn[]?` | Middleware chain |
| `config.hydrationTimeout` | `number?` | Maximum hydration time in ms. Returns SYSTEM ALERT on timeout. |
| `config.handler` | `(ctx, args) => Promise<PromptResult>` | Hydration handler (args are **fully typed**) |
| **Returns** | `PromptBuilder<TContext>` | Ready for `PromptRegistry.register()` |

### `PromptMessage`

| Method | Signature | Description |
|---|---|---|
| `.system(text)` | `(string) => PromptMessagePayload` | System instruction |
| `.user(text)` | `(string) => PromptMessagePayload` | User message |
| `.assistant(text)` | `(string) => PromptMessagePayload` | Seed assistant response |
| `.image(role, data, mimeType)` | `(Role, string, string) => PromptMessagePayload` | Base64 image |
| `.audio(role, data, mimeType)` | `(Role, string, string) => PromptMessagePayload` | Base64 audio |
| `.resource(role, uri, options?)` | `(Role, string, Options?) => PromptMessagePayload` | Embedded resource |
| `.fromView(builder)` | `(ResponseBuilder) => PromptMessagePayload[]` | Decompose a Presenter view into XML-tagged prompt messages |

### `PromptRegistry<TContext>`

| Method | Description |
|---|---|
| `register(builder)` | Register a single prompt builder |
| `registerAll(...builders)` | Register multiple prompt builders |
| `getAllPrompts()` | Get all prompt definitions for `prompts/list` |
| `getPrompts(filter)` | Get filtered prompt definitions |
| `routeGet(ctx, name, args)` | Route a `prompts/get` request to the correct builder |
| `setDefaultHydrationTimeout(ms)` | Set global hydration deadline for all prompts |
| `setNotificationSink(sink)` | Set the lifecycle sync callback (internal) |
| `notifyChanged()` | Notify clients that the catalog changed (debounced) |
| `has(name)` | Check if a prompt is registered |
| `clear()` | Remove all registered prompts |
| `size` | Number of registered prompts |

### Types

| Type | Description |
|---|---|
| `PromptResult` | `{ description?: string, messages: PromptMessagePayload[] }` |
| `PromptMessagePayload` | `{ role: 'user' \| 'assistant', content: PromptContentBlock }` |
| `PromptContentBlock` | `PromptTextContent \| PromptImageContent \| PromptAudioContent \| PromptResourceContent` |
| `PromptTextContent` | `{ type: 'text', text: string }` |
| `PromptImageContent` | `{ type: 'image', data: string, mimeType: string }` |
| `PromptAudioContent` | `{ type: 'audio', data: string, mimeType: string }` |
| `PromptResourceContent` | `{ type: 'resource', resource: { uri, mimeType?, text?, blob? } }` |
| `PromptParamDef` | Union of flat primitive descriptors (string, number, boolean, enum) |
| `PromptParamsMap` | `Record<string, PromptParamDef>` |
| `InferPromptArgs<T>` | Compile-time type inference from `PromptParamsMap` |
| `PromptBuilder<T>` | DIP interface for prompt builders |
| `PromptConfig<T>` | Configuration object for `definePrompt()` |
| `PromptFilter` | Filter options: `tags`, `anyTag`, `exclude` |

---

## Combining with Other Features

The Prompt Engine composes orthogonally with all Fusion features:

```typescript
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    debug: createDebugObserver(),        // ← Observability
    filter: { tags: ['core'] },          // ← Tag filtering
    stateSync: {                         // ← State Sync
        defaults: { cacheControl: 'no-store' },
        policies: [
            { match: 'tasks.update', invalidates: ['tasks.*'] },
        ],
    },
    prompts: promptRegistry,             // ← Prompt Engine
});
```

Each feature operates at a different layer of the protocol pipeline — they never interfere with each other.

---

## Next Steps

- [Building Tools →](/building-tools) — The `defineTool()` API that inspired `definePrompt()`
- [Middleware →](/middleware) — Shared middleware works in both tools and prompts
- [Presenter (MVA View) →](/presenter) — Reuse Presenters inside prompt handlers
- [Context & Dependency Injection →](/context)
