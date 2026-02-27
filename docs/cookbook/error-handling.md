# Self-Healing Errors

- [Introduction](#introduction)
- [Simple Errors](#simple)
- [Structured Recovery with toolError()](#toolerror)
- [Business Logic Guards](#business-logic)
- [What the AI Sees](#ai-perspective)
- [Best Practices](#best-practices)

## Introduction {#introduction}

When an AI agent hits an error, the default behavior is to give up or hallucinate a workaround. MCP Fusion flips this by making errors **self-healing** — every error carries structured recovery instructions that tell the agent exactly what to do next.

Instead of a generic `"Invoice not found"` message that leaves the AI guessing, MCP Fusion produces machine-readable XML with a recovery path. The result: agents that fix their own mistakes on the first retry.

## Simple Errors {#simple}

For straightforward failures, use the `error()` helper. It wraps your message in the standard MCP `isError: true` response:

```typescript
import { initFusion, error, success } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const getProject = f.query('projects.get')
  .describe('Get a project by ID')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => {
    const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
    if (!project) return error(`Project "${input.id}" not found`);
    return success(project);
  });
```

This works, but the AI only sees a text message. It doesn't know *what to try next*. For that, you need `toolError()`.

## Structured Recovery with toolError() {#toolerror}

`toolError()` creates a rich error envelope with everything the AI needs to self-correct:

```typescript
import { initFusion, toolError, success } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by its ID')
  .withString('id', 'Invoice ID')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.id },
    });

    if (!invoice) {
      return toolError('InvoiceNotFound', {
        message: `Invoice "${input.id}" does not exist.`,
        suggestion: 'Call billing.list_invoices first to find valid IDs.',
        availableActions: ['billing.list_invoices'],
      });
    }

    return success(invoice);
  });
```

The agent receives structured XML that it can parse and act on:

```xml
<tool_error code="InvoiceNotFound">
  <message>Invoice "INV-999" does not exist.</message>
  <recovery>Call billing.list_invoices first to find valid IDs.</recovery>
  <available_actions>billing.list_invoices</available_actions>
</tool_error>
```

The AI reads this and immediately calls `billing.list_invoices` — no human intervention needed. The error is self-healing.

## Business Logic Guards {#business-logic}

Real applications have complex business rules. `toolError()` shines when you need to guide the agent through multi-step validation:

```typescript
export const chargeInvoice = f.mutation('billing.charge')
  .describe('Process a payment for an invoice')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Payment amount in cents')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
    });

    // Guard 1: Does the invoice exist?
    if (!invoice) {
      return toolError('InvoiceNotFound', {
        message: `Invoice "${input.invoice_id}" not found.`,
        suggestion: 'List invoices first, then retry with a valid ID.',
        availableActions: ['billing.list_invoices'],
      });
    }

    // Guard 2: Is it already settled?
    if (invoice.status === 'paid') {
      return toolError('AlreadyPaid', {
        message: `Invoice "${input.invoice_id}" is already paid.`,
        suggestion: 'No action needed. The invoice is settled.',
      });
    }

    // Guard 3: Is the amount valid?
    if (input.amount > invoice.amount_cents) {
      return toolError('OverPayment', {
        message: `Amount ${input.amount} exceeds invoice total ${invoice.amount_cents}.`,
        suggestion: `Use amount: ${invoice.amount_cents} for full payment.`,
      });
    }

    // All guards passed — execute the charge
    await ctx.db.payments.create({
      data: { invoiceId: input.invoice_id, amount: input.amount },
    });

    return success({ status: 'charged', amount: input.amount });
  });
```

Each guard returns a *different* error code with a *specific* recovery instruction. The AI never gets a generic "something went wrong" — it always knows the exact next step.

## What the AI Sees {#ai-perspective}

The difference in agent behavior is dramatic:

**Without `toolError()` — the agent gives up:**

```
AI: I need to charge invoice INV-999.
Tool: Error: Invoice not found.
AI: "I encountered an error trying to process the payment."
```

**With `toolError()` — the agent self-heals:**

```
AI: I need to charge invoice INV-999.
Tool: <tool_error code="InvoiceNotFound">
        <recovery>Call billing.list_invoices first.</recovery>
      </tool_error>
AI: Let me find the correct invoice first.
    → calls billing.list_invoices
    → finds INV-042
    → calls billing.charge with INV-042
AI: "Payment of $450.00 processed successfully."
```

## Best Practices {#best-practices}

1. **Always include `suggestion`** — it's the most important field. Tell the agent what to do, not just what went wrong.

2. **Use `availableActions`** for navigation errors — when the agent used the wrong ID, point it to the listing action.

3. **Use specific error codes** — `InvoiceNotFound`, `AlreadyPaid`, `OverPayment` are far more useful than `NOT_FOUND`, `BAD_REQUEST`.

4. **Layer your guards** — check existence first, then business rules, then authorization. Each returns a different recovery path.

5. **Don't use `toolError()` for validation errors** — Zod `.strict()` already handles parameter validation with actionable messages. Reserve `toolError()` for business logic.