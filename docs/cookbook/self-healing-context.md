# Self-Healing Context

- [Introduction](#introduction)
- [Intent Recovery](#intent)
- [Context Injection](#injection)
- [Combined Pattern](#combined)

## Introduction {#introduction}

When the AI makes a reasoning error — calling the wrong tool, using incorrect parameters, or misunderstanding data — a naive MCP server returns a generic error. The AI either gives up or retries blindly.

Self-Healing Context combines [structured errors](/cookbook/error-handling) with [agentic affordances](/cookbook/agentic-affordances) to create a feedback loop: errors carry recovery instructions, and responses carry next-action hints. The AI corrects itself without human intervention.

## Intent Recovery {#intent}

When the AI's **intent** is correct but its **method** is wrong, guide it to the right tool:

```typescript
const f = initFusion<AppContext>();

export const searchUsers = f.query('users.search')
  .describe('Search users by name, email, or department')
  .withString('query', 'Search query')
  .handle(async (input, ctx) => {
    const results = await ctx.db.users.search(input.query);

    if (results.length === 0) {
      return toolError('NoResults', {
        message: `No users found matching "${input.query}".`,
        suggestion: 'Try a broader search term, or use users.list to see all users.',
        availableActions: ['users.list'],
      });
    }

    if (results.length > 100) {
      return toolError('TooManyResults', {
        message: `${results.length} results for "${input.query}" — too broad.`,
        suggestion: 'Narrow the search with a more specific term. Try department names or exact email addresses.',
      });
    }

    return success(results);
  });
```

## Context Injection {#injection}

After a mutation, inject context about what changed so the AI doesn't operate on stale mental models:

```typescript
export const updateProjectStatus = f.action('projects.update_status')
  .describe('Update a project\'s status')
  .withString('id', 'Project ID')
  .withEnum('status', ['active', 'paused', 'archived'] as const, 'New status')
  .handle(async (input, ctx) => {
    const previous = await ctx.db.projects.findUnique({ where: { id: input.id } });
    
    await ctx.db.projects.update({
      where: { id: input.id },
      data: { status: input.status },
    });

    return response({
      updated: true,
      previousStatus: previous.status,
      newStatus: input.status,
    })
    .llmHint(
      `Project "${input.id}" changed from "${previous.status}" to "${input.status}". ` +
      `All cached project data is now stale.`
    )
    .build();
  });
```

The `llmHint` tells the AI that its mental model of this project is outdated — it should re-fetch before making further decisions.

## Combined Pattern {#combined}

The most powerful pattern combines structured errors, affordances, and context injection. Here's a complete billing workflow:

```typescript
import { createPresenter, t, suggest, toolError, success } from '@vinkius-core/mcp-fusion';

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('CENTS. Divide by 100.'),
    status:       t.enum('draft', 'pending', 'paid', 'overdue'),
  })
  .suggest((inv) => {
    const hints = [];
    if (inv.status === 'draft') hints.push(suggest('billing.finalize', 'Finalize and send'));
    if (inv.status === 'pending') hints.push(suggest('billing.charge', 'Process payment'));
    if (inv.status === 'overdue') hints.push(suggest('billing.escalate', 'Escalate to collections'));
    return hints;
  });

export const chargeInvoice = f.mutation('billing.charge')
  .describe('Process payment for an invoice')
  .withString('id', 'Invoice ID')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({ where: { id: input.id } });

    if (!invoice) {
      return toolError('NotFound', {
        message: `Invoice "${input.id}" not found.`,
        suggestion: 'List invoices first.',
        availableActions: ['billing.list'],
      });
    }

    if (invoice.status === 'draft') {
      return toolError('NotFinalized', {
        message: 'Invoice is still a draft.',
        suggestion: 'Finalize the invoice before charging.',
        availableActions: ['billing.finalize'],
      });
    }

    if (invoice.status === 'paid') {
      return toolError('AlreadyPaid', {
        message: 'Invoice is already paid.',
        suggestion: 'No action needed.',
      });
    }

    await ctx.db.payments.charge(invoice);
    return success({ charged: true, amount: invoice.amount_cents });
  });
```

The AI navigates a complete state machine: `draft → finalize → pending → charge → paid`. At every step, it receives either suggested actions (what to do next) or structured errors (how to recover). No blind retries. No hallucinated tool names.