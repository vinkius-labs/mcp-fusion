# Prompts

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Defining a Prompt](#defining)
- [Multi-Modal Prompts](#multi-modal)
- [Presenter Bridge — fromView()](#presenter-bridge)
- [Prompts with Zod Args](#zod-args)
- [Tools vs Prompts](#comparison)

## Introduction {#introduction}

Prompts are reusable context templates that inject structured instructions into the conversation. Unlike tools (which the LLM calls during reasoning), prompts are **user-triggered** — they appear as selectable templates in MCP clients. Users pick a prompt, fill in the arguments, and the LLM receives a pre-built conversation with system messages, context data, and instructions.

Think of prompts as slash commands: `/code-review --language=typescript --focus=security`.

## Defining a Prompt {#defining}

Use `f.prompt(name)` to start a chainable builder. Arguments use the same declarative syntax as tool parameters — no Zod needed for simple cases:

```typescript
import { initFusion, PromptMessage } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const codeReview = f.prompt('code-review')
  .title('Code Review')
  .describe('Review code for quality and suggest improvements')
  .tags('engineering', 'quality')
  .input({
    language: { enum: ['typescript', 'python', 'go', 'rust'] as const },
    focus: {
      type: 'string',
      description: 'Area to focus on: performance, security, readability',
      optional: true,
    },
    severity: {
      enum: ['strict', 'moderate', 'lenient'] as const,
      description: 'How strict the review should be',
      optional: true,
    },
  })
  .handler(async (ctx, args) => {
    const focusHint = args.focus ? ` Focus specifically on ${args.focus}.` : '';
    const severity = args.severity ?? 'moderate';
    return {
      messages: [
        PromptMessage.user(
          `You are a ${severity} code reviewer for ${args.language}.${focusHint}\n\n` +
          `Review the code I'm about to share. For each issue found:\n` +
          `1. Describe the problem\n` +
          `2. Explain the impact\n` +
          `3. Provide the corrected code`
        ),
      ],
    };
  });

const registry = f.registry();
registry.registerPrompt(codeReview);
```

The user selects "code-review" in their MCP client, fills in `language` and (optionally) `focus` and `severity`, and the LLM receives the generated message.

## Multi-Modal Prompts {#multi-modal}

Prompts can include images and resource references for multi-modal context:

```typescript
const debugUI = f.prompt('debug-ui')
  .describe('Debug a UI issue from a screenshot')
  .input({
    component: { type: 'string', description: 'Component name' },
    framework: { enum: ['react', 'vue', 'svelte'] as const },
  })
  .handler(async (ctx, args) => ({
    messages: [
      PromptMessage.user(
        `I have a ${args.framework} component "${args.component}" with a visual bug. ` +
        `Analyze the screenshot and the component source code below.`
      ),
      PromptMessage.image('user', await ctx.screenshots.get(args.component), 'image/png'),
      PromptMessage.resource('user', `file:///src/components/${args.component}.tsx`, {
        mimeType: 'text/typescript',
      }),
    ],
  }));
```

## Presenter Bridge — fromView() {#presenter-bridge}

The real power of prompts comes when you connect them to your MVA Presenters. `PromptMessage.fromView()` decomposes a Presenter's output into prompt messages — the same schema, rules, and affordances that your tools use:

```typescript
import { createPresenter, PromptMessage, t } from '@vinkius-core/mcp-fusion';

const ProjectPresenter = createPresenter('Project')
  .schema({
    id:           t.string,
    name:         t.string,
    status:       t.enum('active', 'archived').describe('Use emojis: 🟢 active, 📦 archived'),
    budget_cents: t.number.describe('CRITICAL: Value is in CENTS. Divide by 100.'),
  });

const planSprint = f.prompt('plan-sprint')
  .title('Sprint Planner')
  .describe('Plan the next sprint based on project state')
  .input({ project_id: { type: 'string', description: 'Project ID' } })
  .use(requireAuth)
  .timeout(8000) // data fetching may be slow
  .handler(async (ctx, { project_id }) => {
    const project = await ctx.db.projects.findUnique({
      where: { id: project_id },
    });

    return {
      messages: [
        PromptMessage.system('You are a Senior Agile Coach.'),
        ...PromptMessage.fromView(ProjectPresenter.make(project, ctx)),
        PromptMessage.user(
          'Plan the next 2-week sprint. Consider budget, status, and team velocity. ' +
          'Output a sprint backlog as a markdown table.'
        ),
        PromptMessage.assistant('## Sprint Plan\n\n### Goals\n\n'),
      ],
    };
  });
```

Same Presenter, same schema, same rules — in both tools and prompts. Define it once, use it everywhere. The `fromView()` bridge ensures domain rules, validated data, and action affordances travel from Presenter to prompt automatically.

## Prompts with Zod Args {#zod-args}

For complex argument validation, pass a Zod schema to `.input()` instead of the declarative syntax:

```typescript
import { z } from 'zod';

const sqlHelper = f.prompt('sql-helper')
  .title('SQL Query Generator')
  .describe('Generate SQL queries from natural language')
  .tags('database', 'productivity')
  .input(z.object({
    dialect: z.enum(['postgresql', 'mysql', 'sqlite']),
    tables: z.string().describe('Comma-separated table names to query'),
    intent: z.string().describe('What you want to query in plain English'),
  }))
  .handler(async (ctx, args) => ({
    messages: [
      PromptMessage.system(
        `You are a ${args.dialect} expert. Available tables: ${args.tables}.`
      ),
      PromptMessage.user(
        `Generate an optimized SQL query for: "${args.intent}"\n\n` +
        `Rules:\n` +
        `- Use CTEs for complex queries\n` +
        `- Add comments explaining each section\n` +
        `- Include an EXPLAIN plan estimate`
      ),
      PromptMessage.assistant('```sql\n'),
    ],
  }));
```

## Tools vs Prompts {#comparison}

| Use Case | Use |
|---|---|
| Execute an action (CRUD, API call) | `f.query()` / `f.mutation()` / `f.action()` |
| Pre-fill LLM context with instructions | `f.prompt()` |
| User-triggered template (slash command) | `f.prompt()` |
| Automated by the LLM during reasoning | `f.query()` / `f.mutation()` / `f.action()` |
| Appears in MCP client menu as a template | `f.prompt()` |

Tools are called by the LLM during reasoning. Prompts are selected by the user before the conversation begins. Both share the same context system, the same Presenters, and the same registry.