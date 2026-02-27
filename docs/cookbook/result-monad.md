# Result Monad

- [Introduction](#introduction)
- [success() and error()](#basics)
- [toolError() — Structured Recovery](#toolerror)
- [Response Builder — Full Control](#response-builder)
- [Pattern Summary](#summary)

## Introduction {#introduction}

MCP tool handlers need to communicate success and failure without relying on JavaScript exceptions. MCP Fusion provides a Result Monad pattern: `success()` wraps data into a `ToolResponse`, `error()` wraps failures with `isError: true`, and `toolError()` creates structured recovery envelopes.

You don't *have* to use them — returning raw data from a handler auto-wraps it in `success()`. But when you need explicit error branches or structured recovery, the monad helpers make intent crystal clear.

## success() and error() {#basics}

The simplest pattern: return `success(data)` on the happy path, `error(message)` on failure:

```typescript
import { initFusion, success, error } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export const getProject = f.query('projects.get')
  .describe('Get a project by ID')
  .withString('id', 'Project ID')
  .returns(ProjectPresenter)
  .handle(async (input, ctx) => {
    const project = await ctx.db.projects.findUnique({
      where: { id: input.id },
    });
    if (!project) return error(`Project "${input.id}" not found`);
    return success(project);
  });
```

`success(data)` creates a `ToolResponse` with `isError: false` and the data serialized as text content. `error(message)` creates a `ToolResponse` with `isError: true`.

> [!TIP]
> For simple happy paths, you can skip `success()` entirely — just `return project`. The framework wraps it automatically. Use `success()` when the handler has explicit `error()` branches for clarity.

## toolError() — Structured Recovery {#toolerror}

When a simple error message isn't enough, `toolError()` creates a machine-readable error envelope with recovery instructions. See the [Self-Healing Errors](/cookbook/error-handling) cookbook for the full pattern.

```typescript
import { toolError, success } from '@vinkius-core/mcp-fusion';

export const chargeInvoice = f.mutation('billing.charge')
  .describe('Process a payment')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Amount in cents')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
    });

    if (!invoice) {
      return toolError('InvoiceNotFound', {
        message: `Invoice "${input.invoice_id}" not found.`,
        suggestion: 'Call billing.list_invoices first.',
        availableActions: ['billing.list_invoices'],
      });
    }

    await ctx.db.payments.create({ data: { invoiceId: input.invoice_id, amount: input.amount } });
    return success({ status: 'charged', amount: input.amount });
  });
```

## Response Builder — Full Control {#response-builder}

For complex responses that need UI blocks, rules, and hints, use the `response()` builder. See the [Custom Responses](/cookbook/custom-responses) cookbook for the full pattern.

```typescript
import { response, ui } from '@vinkius-core/mcp-fusion';

export const getDashboard = f.query('analytics.dashboard')
  .describe('Get analytics dashboard')
  .handle(async (input, ctx) => {
    const stats = await ctx.db.analytics.getDashboard(ctx.tenantId);

    return response(stats)
      .uiBlock(ui.echarts({ /* chart config */ }))
      .rules(['Revenue is in CENTS. Divide by 100.'])
      .build();
  });
```

## Pattern Summary {#summary}

| Pattern | Use When |
|---|---|
| `return data` | Simple happy path — auto-wrapped in `success()` |
| `return success(data)` | Explicit happy path alongside `error()` branches |
| `return error(msg)` | Simple failure message |
| `return toolError(code, opts)` | Structured recovery — tells the AI what to do next |
| `return response(data).build()` | Complex response — UI blocks, rules, hints |