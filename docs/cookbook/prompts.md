# Prompts

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

Use `f.prompt()` to define a prompt. Arguments use the same declarative syntax as tool parameters — no Zod needed for simple cases:

```typescript
import { initFusion, PromptMessage } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

const codeReview = f.prompt({
  name: 'code-review',
  description: 'Review code for quality and suggest improvements',
  args: {
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
  } as const,
  handler: async ({ args }) => {
    const focusHint = args.focus ? ` Focus specifically on ${args.focus}.` : '';
    const severity = args.severity ?? 'moderate';
    return [
      PromptMessage.user(
        `You are a ${severity} code reviewer for ${args.language}.${focusHint}\n\n` +
        `Review the code I'm about to share. For each issue found:\n` +
        `1. Describe the problem\n` +
        `2. Explain the impact\n` +
        `3. Provide the corrected code`
      ),
    ];
  },
});

const registry = f.registry();
registry.registerPrompt(codeReview);
```

The user selects "code-review" in their MCP client, fills in `language` and (optionally) `focus` and `severity`, and the LLM receives the generated message.

## Multi-Modal Prompts {#multi-modal}

Prompts can include images and resource references for multi-modal context:

```typescript
const debugUI = f.prompt({
  name: 'debug-ui',
  description: 'Debug a UI issue from a screenshot',
  args: {
    component: { type: 'string', description: 'Component name' },
    framework: { enum: ['react', 'vue', 'svelte'] as const },
  } as const,
  handler: async ({ args }) => [
    PromptMessage.user(
      `I have a ${args.framework} component "${args.component}" with a visual bug. ` +
      `Analyze the screenshot and the component source code below.`
    ),
    PromptMessage.image('https://screenshots.example.com/bug-report.png', 'image/png'),
    PromptMessage.resource(`file:///src/components/${args.component}.tsx`, 'text/typescript'),
  ],
});
```

## Presenter Bridge — fromView() {#presenter-bridge}

The real power of prompts comes when you connect them to your MVA Presenters. `PromptMessage.fromView()` decomposes a Presenter's output into prompt messages — the same schema, rules, and affordances that your tools use:

```typescript
import { createPresenter, PromptMessage } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

const ProjectPresenter = createPresenter('Project')
  .schema(z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['active', 'archived']).describe('Use emojis: 🟢 active, 📦 archived'),
    budget_cents: z.number().describe('CRITICAL: Value is in CENTS. Divide by 100.'),
  }));

const planSprint = f.prompt({
  name: 'plan-sprint',
  description: 'Plan the next sprint based on project state',
  args: { project_id: 'string' } as const,
  handler: async ({ args, ctx }) => {
    const project = await ctx.db.projects.findUnique({
      where: { id: args.project_id },
    });

    return [
      PromptMessage.user('Plan the next 2-week sprint for this project:'),
      PromptMessage.fromView(project, ProjectPresenter),
      PromptMessage.user(
        'Consider the budget, current status, and team velocity. ' +
        'Output a sprint backlog as a markdown table.'
      ),
    ];
  },
});
```

Same Presenter, same schema, same rules — in both tools and prompts. Define it once, use it everywhere.

## Prompts with Zod Args {#zod-args}

For complex argument validation, pass a Zod schema instead of the declarative syntax:

```typescript
import { z } from 'zod';

const sqlHelper = f.prompt({
  name: 'sql-helper',
  description: 'Generate SQL queries from natural language',
  args: z.object({
    dialect: z.enum(['postgresql', 'mysql', 'sqlite']),
    tables: z.string().describe('Comma-separated table names to query'),
    intent: z.string().describe('What you want to query in plain English'),
  }),
  handler: async ({ args }) => [
    PromptMessage.user(
      `You are a ${args.dialect} expert. Available tables: ${args.tables}.\n\n` +
      `Generate an optimized SQL query for: "${args.intent}"\n\n` +
      `Rules:\n` +
      `- Use CTEs for complex queries\n` +
      `- Add comments explaining each section\n` +
      `- Include an EXPLAIN plan estimate`
    ),
  ],
});
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