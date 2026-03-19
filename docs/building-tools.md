# Building Tools

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Create a query tool with Zod validation, runtime guards, semantic verb annotations, and a Presenter for the response schema."</div>
<!-- Action Bar -->
<div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(192,132,252,0.08);flex-wrap:wrap;align-items:center">
<button onclick="navigator.clipboard.writeText('Read the framework architecture at https://vurb.vinkius.com/llms.txt. Based strictly on those patterns: Create a query tool with Zod validation, runtime guards, semantic verb annotations, and a Presenter for the response schema.');this.querySelector('span').textContent='Copied!';setTimeout(()=>this.querySelector('span').textContent='Copy Prompt',1500)" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;font-weight:500;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.5)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></svg><span>Copy Prompt</span></button>
<a href="https://claude.ai/new?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+query+tool+with+Zod+validation%2C+runtime+guards%2C+semantic+verb+annotations%2C+and+a+Presenter+for+the+response+schema." target="_blank" rel="noopener" style="background:rgba(217,119,87,0.06);border:1px solid rgba(217,119,87,0.15);color:rgba(217,119,87,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(217,119,87,0.12)';this.style.borderColor='rgba(217,119,87,0.3)';this.style.color='#D97757'" onmouseleave="this.style.background='rgba(217,119,87,0.06)';this.style.borderColor='rgba(217,119,87,0.15)';this.style.color='rgba(217,119,87,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-2.85-.933-1.86-6.078 3.54a.75.75 0 0 0-.345.893l1.578 4.674a.75.75 0 0 0 1.162.355l2.87-2.1zM8.68 7.2l4.398-2.85 2.65 1.95-4.397 2.85zm4.688 9.45l4.397-2.85 2.65 1.95-4.397 2.85zM16.01 8.505l4.397-2.85a.75.75 0 0 0 .345-.893L19.174.088a.75.75 0 0 0-1.162-.355l-2.87 2.1.933 1.86 2.652-1.94 1.035 3.065-3.685 2.389z"/></svg> Open in Claude</a>
<a href="https://chatgpt.com/?q=Read+the+framework+architecture+at+https%3A%2F%2Fvurb.vinkius.com%2Fllms.txt.+Based+strictly+on+those+patterns%3A+Create+a+query+tool+with+Zod+validation%2C+runtime+guards%2C+semantic+verb+annotations%2C+and+a+Presenter+for+the+response+schema." target="_blank" rel="noopener" style="background:rgba(16,163,127,0.06);border:1px solid rgba(16,163,127,0.15);color:rgba(16,163,127,0.8);padding:7px 14px;border-radius:8px;font-size:12px;text-decoration:none;font-weight:500;display:inline-flex;align-items:center;gap:7px;font-family:Inter,system-ui,sans-serif;letter-spacing:0.2px;transition:all 0.2s ease" onmouseenter="this.style.background='rgba(16,163,127,0.12)';this.style.borderColor='rgba(16,163,127,0.3)';this.style.color='#10A37F'" onmouseleave="this.style.background='rgba(16,163,127,0.06)';this.style.borderColor='rgba(16,163,127,0.15)';this.style.color='rgba(16,163,127,0.8)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.392 12.84l-2.02-1.164a.076.076 0 0 1-.038-.057V6.035a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.794 5.42a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg> Open in ChatGPT</a>
</div>
</div>

---

<!-- Editorial break: The problem -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">FLUENT API</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Declare intent, not infrastructure.<br><span style="color:rgba(255,255,255,0.25)">Schema, validation, types — all automatic.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Semantic verbs, chainable builders, and a terminal <code style="font-size:12px;color:rgba(34,211,238,0.6);background:rgba(34,211,238,0.06);padding:1px 5px;border-radius:3px">.handle()</code>. Your AI agent produces this from SKILL.md — works with every MCP client.</div>
</div>

## Quick Example {#introduction}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">agents/tasks.tool.ts</span>
</div>
<div style="padding:20px">

```typescript
import { initVurb } from '@vurb/core';

interface AppContext {
  db: DatabaseClient;
  tenantId: string;
}

const f = initVurb<AppContext>();

export const listTasks = f.query('tasks.list')
  .describe('Lists all tasks for the current user')
  .instructions('Use when the user asks for a summary of their work.')
  .withOptionalEnum('status', ['open', 'closed'] as const, 'Filter by status')
  .returns(TaskPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.tasks.findMany({
      where: { tenantId: ctx.tenantId, status: input.status },
    });
  });
```

</div>
</div>

Everything — `input.status`, `ctx.db`, `ctx.tenantId` — is fully typed, zero annotations. The handler returns raw data; the framework wraps it with `success()` automatically.

## Context Setup {#context}

Define the shared state every handler receives. Pass a generic to `initVurb()` and import `f` across all tool files:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/vurb.ts</span>
</div>
<div style="padding:20px">

```typescript
import { initVurb } from '@vurb/core';

interface AppContext {
  db: DatabaseClient;
  tenantId: string;
  userId: string;
}

export const f = initVurb<AppContext>();
```

</div>
</div>

> [!TIP]
> The generic parameter flows through every builder, middleware, and Presenter — zero annotations needed downstream.

---

<!-- Editorial break: Semantic Verbs -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">SEMANTIC VERBS</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Query. Action. Mutation.<br><span style="color:rgba(255,255,255,0.25)">The LLM knows the intent.</span></div>
</div>

## Semantic Verbs {#verbs}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">three verbs, three intentions</span>
</div>
<div style="padding:20px">

```typescript
// ── Query: Read-only, no side effects ──────────────────
const listUsers = f.query('users.list')
  .describe('List all users in the workspace')
  .handle(async (input, ctx) => { /* ... */ });

// ── Action: Creates or updates data (reversible) ───────
const createUser = f.action('users.create')
  .describe('Create a new user in the workspace')
  .withString('email', 'User email address')
  .handle(async (input, ctx) => { /* ... */ });

// ── Mutation: Destructive, irreversible ────────────────
const deleteUser = f.mutation('users.delete')
  .describe('Permanently delete a user and all their data')
  .withString('id', 'User ID to delete')
  .handle(async (input, ctx) => { /* ... */ });
```

</div>
</div>

| Verb | MCP Annotations | When to Use |
|---|---|---|
| `f.query()` | `readOnly: true` | Fetching data — lists, searches, lookups |
| `f.action()` | Neutral (no flags) | Creating or updating — reversible side effects |
| `f.mutation()` | `destructive: true` | Deleting, purging, revoking — irreversible |

MCP clients like Claude Desktop read these annotations and show confirmation dialogs before destructive operations — no prompt engineering needed.

## Parameter Declaration {#params}

Chainable `with*()` methods replace Zod schemas. Every method generates proper JSON Schema under the hood:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">parameter declaration</span>
</div>
<div style="padding:20px">

```typescript
const semanticSearch = f.query('search.semantic')
  .describe('Search across workspace using embeddings')
  .withString('query', 'The natural language search term')
  .withOptionalNumber('limit', 'Maximum results to return')
  .withOptionalEnum('priority', ['high', 'low', 'medium'] as const, 'Filter by priority')
  .withOptionalArray('tags', 'string', 'Filter by tags')
  .withOptionalBoolean('active_only', 'Only active items')
  .handle(async (input, ctx) => {
    // input.query: string          ← required
    // input.limit: number | undefined  ← optional
  });
```

</div>
</div>

| Method | Required | TypeScript Type |
|---|:-:|---|
| `.withString(name, desc)` | ✅ | `string` |
| `.withOptionalString(name, desc)` | ❌ | `string \| undefined` |
| `.withNumber(name, desc)` | ✅ | `number` |
| `.withOptionalNumber(name, desc)` | ❌ | `number \| undefined` |
| `.withBoolean(name, desc)` | ✅ | `boolean` |
| `.withOptionalBoolean(name, desc)` | ❌ | `boolean \| undefined` |
| `.withEnum(name, values, desc)` | ✅ | Union of values |
| `.withOptionalEnum(name, values, desc)` | ❌ | Union \| undefined |
| `.withArray(name, type, desc)` | ✅ | `T[]` |
| `.withOptionalArray(name, type, desc)` | ❌ | `T[] \| undefined` |

### Bulk Parameters <Badge type="tip" text="v3.5.0" />

When a tool has many parameters of the same type, bulk variants accept a `Record<string, string>`:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">bulk declaration — zero repetition</span>
</div>
<div style="padding:20px">

```typescript
const filterTasks = f.query('tasks.filter')
  .describe('Filter tasks with multiple criteria')
  .withStrings({
    company_slug: 'Workspace identifier',
    project_slug: 'Project identifier',
  })
  .withOptionalStrings({
    title:    'Filter by title (partial match)',
    workflow: 'Column name (e.g. "In Progress")',
  })
  .withOptionalBooleans({
    is_blocker: 'Only blockers',
    unassigned: 'Only unassigned tasks',
  })
  .handle(async (input, ctx) => {
    // All fields fully typed ✅
  });
```

</div>
</div>

> [!TIP]
> Mix singular and bulk methods freely. Use singular for one-off required fields and bulk for groups of optional filters.

### Model-Driven Parameters <Badge type="tip" text="v3.6.0" /> {#from-model}

When input fields map to a domain entity, `.fromModel()` reads the Model's `fillable` profile and generates the schema:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">model-driven params</span>
</div>
<div style="padding:20px">

```typescript
// Create — all fillable('create') fields are required
export const createTask = f.action('tasks.create')
  .describe('Create a new task')
  .fromModel(TaskModel, 'create')
  .returns(TaskPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.tasks.create({ data: input });
  });

// Update — all fillable('update') fields are optional
export const updateTask = f.action('tasks.update')
  .describe('Update an existing task')
  .fromModel(TaskModel, 'update')
  .withString('task_uuid', 'Task identifier')
  .returns(TaskPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.tasks.update(input.task_uuid, input);
  });
```

</div>
</div>

| Operation | Field Optionality | Use Case |
|---|---|---|
| `'create'` | All **required** | Creating a new entity |
| `'update'` | All **optional** | Partial updates |
| `'filter'` | All **optional** | Search / list filters |

---

## AI Instructions {#instructions}

`.instructions()` injects system-level guidance into the tool description — prompt engineering embedded in the framework:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">behavioral guidance</span>
</div>
<div style="padding:20px">

```typescript
export const searchDocs = f.query('docs.search')
  .describe('Search internal documentation')
  .instructions(
    'Use ONLY when the user asks about internal policies or procedures. ' +
    'Do NOT use for general knowledge questions.'
  )
  .withString('query', 'Search term')
  .handle(async (input, ctx) => {
    return ctx.docs.search(input.query);
  });
```

</div>
</div>

> [!TIP]
> Use `.instructions()` for **when to use** the tool. Use `.describe()` for **what** the tool does. Together they eliminate hallucinated tool calls.

## Semantic Overrides & Annotations {#annotations}

<!-- Feature Grid -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px"><code style="font-size:12px;color:rgba(129,140,248,0.7);background:rgba(129,140,248,0.08);padding:2px 6px;border-radius:3px">.readOnly()</code></div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Sets <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">readOnlyHint: true</code> — override any verb to declare no side effects.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px"><code style="font-size:12px;color:rgba(239,68,68,0.7);background:rgba(239,68,68,0.08);padding:2px 6px;border-radius:3px">.destructive()</code></div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Sets <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">destructiveHint: true</code> — triggers confirmation dialogs in MCP clients.</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px"><code style="font-size:12px;color:rgba(52,211,153,0.7);background:rgba(52,211,153,0.08);padding:2px 6px;border-radius:3px">.idempotent()</code></div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Sets <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">idempotentHint: true</code> — safe to retry, no duplicate side effects.</div>
</div>

</div>

Use `.tags('internal', 'admin')` for selective tool exposure and `.annotations({ openWorldHint: true })` for custom MCP metadata.

## Connecting a Presenter {#presenter}

`.returns()` attaches a [Presenter](/presenter) that controls exactly what the agent sees:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">Presenter + Tool integration</span>
</div>
<div style="padding:20px">

```typescript
const ProjectPresenter = createPresenter('Project')
  .schema({
    id:     t.string,
    name:   t.string,
    status: t.enum('active', 'archived'),
  })
  .limit(50);

export const listProjects = f.query('projects.list')
  .describe('List all projects in the workspace')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.projects.findMany({
      where: { tenantId: ctx.tenantId },
    });
  });
```

</div>
</div>

The handler returns raw database data. The Presenter **strips** undeclared fields, **validates** with Zod, **truncates** to 50 items, and **attaches** rules and affordances. See the full [Presenter guide](/presenter).

---

<!-- Editorial break: Middleware & Guards -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">PRODUCTION FEATURES</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Middleware. Guards. Streaming.<br><span style="color:rgba(255,255,255,0.25)">All inline on the builder.</span></div>
</div>

## Middleware — Context Derivation {#middleware}

`.use()` enriches context before it reaches the handler. Derived properties are automatically typed:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">auth middleware</span>
</div>
<div style="padding:20px">

```typescript
export const adminStats = f.query('admin.stats')
  .describe('Retrieve administrative system statistics')
  .use(async ({ ctx, next }) => {
    const session = await checkAuth(ctx.token);
    if (!session.isAdmin) throw new Error('Unauthorized');
    return next({ ...ctx, session });
  })
  .handle(async (input, ctx) => {
    // ctx.session is fully typed ✅
    return ctx.db.getStats(ctx.session.orgId);
  });
```

</div>
</div>

Stack multiple `.use()` calls for layered derivations (auth → permissions → tenant). See the full [Middleware guide](/middleware).

## State Sync — Cache & Invalidation {#state-sync}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">cache directives</span>
</div>
<div style="padding:20px">

```typescript
// Reference data — safe to cache forever
const listCountries = f.query('countries.list')
  .describe('List all country codes')
  .cached()
  .handle(async (input, ctx) => ctx.db.countries.findMany());

// Volatile data — always re-fetch
const listSprints = f.query('sprints.list')
  .describe('List workspace sprints')
  .stale()
  .handle(async (input, ctx) => ctx.db.sprints.findMany());

// Mutation — tells the agent what changed
const createSprint = f.mutation('sprints.create')
  .describe('Create a new sprint')
  .invalidates('sprints.*')
  .withString('name', 'Sprint name')
  .handle(async (input, ctx) => ctx.db.sprints.create({ data: input }));
```

</div>
</div>

| Method | Cache Directive | Use When |
|---|---|---|
| `.cached()` | `immutable` | Reference data — country codes, timezones |
| `.stale()` | `no-store` | Volatile data — always re-fetch |
| `.invalidates(...)` | Causal signal | Mutations — tell agent what data changed |

See the full [State Sync guide](/state-sync) for registry-level policies and cross-domain invalidation.

## Runtime Guards {#runtime-guards}

<!-- Feature Grid -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(245,158,11,0.8);padding:3px 10px;border:1px solid rgba(245,158,11,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">CONCURRENCY</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Concurrency Limits</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Prevent expensive tools from overwhelming your backend. <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">.concurrency({ max: 2, queueSize: 5 })</code></div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<span style="font-size:8px;color:rgba(239,68,68,0.8);padding:3px 10px;border:1px solid rgba(239,68,68,0.2);border-radius:4px;font-weight:600;letter-spacing:1px">EGRESS</span>
</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Egress Guards</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Cap max response payload to protect the LLM's context window. <code style="font-size:10px;color:rgba(129,140,248,0.6);background:rgba(129,140,248,0.06);padding:1px 5px;border-radius:3px">.egress(1_000_000)</code></div>
</div>

</div>

See the [Runtime Guards guide](/runtime-guards) for the full reference.

## Streaming Progress {#streaming}

Long-running operations report progress via generator handlers:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">async generator + progress</span>
</div>
<div style="padding:20px">

```typescript
import { progress } from '@vurb/core';

export const deploy = f.mutation('infra.deploy')
  .describe('Deploy infrastructure to the target environment')
  .withEnum('env', ['staging', 'production'] as const, 'Target')
  .handle(async function* (input, ctx) {
    yield progress(10, 'Cloning repository...');
    await cloneRepo(ctx.repoUrl);

    yield progress(90, 'Running integration tests...');
    const results = await runTests();

    yield progress(100, 'Done!');
    return results;
  });
```

</div>
</div>

> [!TIP]
> The final `return` goes through the normal Presenter pipeline. `yield` calls are side-channel progress notifications.

---

<!-- Editorial break: Deploy -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">DEPLOYMENT</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Register. Serve. Deploy.<br><span style="color:rgba(255,255,255,0.25)">Same code, any runtime.</span></div>
</div>

## Registering & Serving {#register}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/server.ts</span>
</div>
<div style="padding:20px">

```typescript
import { ToolRegistry } from '@vurb/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.registerAll(listTasks, deleteTask, listProjects, createSprint);

const server = new McpServer({ name: 'my-app', version: '1.0.0' });

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    db: getDatabaseClient(),
    tenantId: extra.session?.tenantId ?? 'default',
    userId: extra.session?.userId ?? 'anonymous',
  }),
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

</div>
</div>

> [!TIP]
> Use `autoDiscover()` for file-based routing — drop tool files in a directory and they're registered automatically. See [Routing & Groups](/routing).

## Deploy Your Tools {#deploy}

Every tool is transport-agnostic. The same `ToolRegistry` works on Stdio, SSE, and serverless runtimes.

<!-- Deploy cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="https://docs.vinkius.com/getting-started" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">MANAGED</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Vinkius Cloud</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif"><code style="font-size:10px;color:rgba(192,132,252,0.6);background:rgba(192,132,252,0.06);padding:1px 5px;border-radius:3px">vurb deploy</code> — global edge, built-in DLP, kill switch.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Learn more →</span>
</a>

<a href="/vercel-adapter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">VERCEL</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Vercel Edge</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">App Router endpoint — one line of code.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read guide →</span>
</a>

<a href="/cloudflare-adapter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">CLOUDFLARE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Cloudflare Workers</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Edge-native with D1, KV, and R2 access.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read guide →</span>
</a>

</div>

---

## Related Guides {#related}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/tool-exposition" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">EXPOSITION</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Tool Exposition</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Flat vs grouped strategies for tool registration.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/result-monad" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">ERRORS</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Result Monad</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Typed error unions with ok() / err().</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/context" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">CONTEXT</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Context & State</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Context derivation and request state management.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 0 32px">

<a href="/cancellation" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">LIFECYCLE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Cancellation</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Abort signal propagation and cleanup.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/dynamic-manifest" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">MANIFEST</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Dynamic Manifest</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">User-conditional prompts and tool lists.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/observability" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">MONITORING</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Observability</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Production monitoring and tracing.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

### Cookbook Recipes

- [CRUD Operations](/cookbook/crud) · [Hierarchical Groups](/cookbook/hierarchical-groups) · [Functional Groups](/cookbook/functional-groups)
- [Streaming](/cookbook/streaming) · [Cancellation](/cookbook/cancellation) · [Auth Middleware](/cookbook/auth-middleware)
- [Transactional Workflows](/cookbook/transactional-workflows) · [TOON Encoding](/cookbook/toon) · [Runtime Guards](/cookbook/runtime-guards)