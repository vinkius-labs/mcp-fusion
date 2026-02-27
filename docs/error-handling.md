# Error Handling

- [Introduction](#introduction)
- [error() — Simple Errors](#simple)
- [required() — Missing Parameters](#required)
- [toolError() — Self-Healing Errors](#tool-error)
- [ErrorBuilder — Fluent Error Chain](#error-builder)
- [Severity Levels](#severity)
- [Structured Details & Retry Hints](#details)
- [Automatic Validation Errors](#validation)
- [Automatic Routing Errors](#routing)
- [Composing Errors with Result](#pipelines)
- [The Error Protocol](#protocol)

## Introduction {#introduction}

When an AI agent hits an error, the default behavior is to give up or hallucinate a workaround. A generic `"Not found"` message leaves the LLM guessing — it might retry with the same invalid input, apologize to the user, or invent a tool name that doesn't exist.

MCP Fusion makes errors **self-healing**. Every error carries structured XML with a code, message, recovery instructions, and available next actions. The agent reads the structured envelope and immediately follows the recovery path — no human intervention needed.

```text
Without structured errors:
  AI: "I encountered an error. The project was not found."  ← gives up

With MCP Fusion errors:
  AI reads: <recovery>Call projects.list first</recovery>
  AI: → calls projects.list → finds the correct ID → retries successfully
```

## error() — Simple Errors {#simple}

For straightforward failures, the `error()` helper wraps your message in a standard MCP `isError: true` response:

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

```xml
<tool_error>
  <message>Project "proj_xyz" not found</message>
</tool_error>
```

This works, but the AI only sees a text message — it doesn't know what to try next. For recovery guidance, use `toolError()` or the `ErrorBuilder`.

## required() — Missing Parameters {#required}

Shortcut for missing fields — tells the agent exactly which parameter to provide:

```typescript
import { required } from '@vinkius-core/mcp-fusion';

.handle(async (input, ctx) => {
  if (!input.workspace_id) return required('workspace_id');
  // ...
})
```

```xml
<tool_error code="MISSING_REQUIRED_FIELD">
  <message>Required field "workspace_id" is missing.</message>
  <recovery>Provide the "workspace_id" parameter and retry.</recovery>
</tool_error>
```

## toolError() — Self-Healing Errors {#tool-error}

`toolError()` creates a rich error envelope with everything the AI needs to self-correct:

```typescript
import { toolError, success } from '@vinkius-core/mcp-fusion';

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

```xml
<tool_error code="InvoiceNotFound" severity="error">
  <message>Invoice "INV-999" does not exist.</message>
  <recovery>Call billing.list_invoices first to find valid IDs.</recovery>
  <available_actions>
    <action>billing.list_invoices</action>
  </available_actions>
</tool_error>
```

The agent reads `<available_actions>` and calls `billing.list_invoices` instead of retrying with the same invalid ID.

### Error Codes {#codes}

`toolError()` accepts canonical codes or any custom string: `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `TIMEOUT`, `INTERNAL_ERROR`, `DEPRECATED`, `SERVER_BUSY`, or domain-specific codes like `'InvoiceAlreadyPaid'`.

> [!TIP]
> Use domain-specific codes (`InvoiceNotFound`, `AlreadyPaid`, `OverPayment`) instead of generic ones. They're far more useful for debugging and make error logs self-documenting.

## ErrorBuilder — Fluent Error Chain {#error-builder}

For maximum readability, use the fluent `ErrorBuilder` via `f.error()`. It chains naturally and returns directly from handlers:

```typescript
const f = initFusion<AppContext>();

export const chargeInvoice = f.mutation('billing.charge')
  .describe('Process a payment for an invoice')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Payment amount in cents')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
    });

    if (!invoice) {
      return f.error('InvoiceNotFound', `Invoice "${input.invoice_id}" not found`)
        .suggest('List invoices first, then retry with a valid ID.')
        .actions('billing.list_invoices');
    }

    if (invoice.status === 'paid') {
      return f.error('AlreadyPaid', `Invoice "${input.invoice_id}" is already settled`)
        .suggest('No action needed. The invoice is settled.')
        .warning();   // ← non-fatal advisory
    }

    if (input.amount > invoice.amount_cents) {
      return f.error('OverPayment', `Amount ${input.amount} exceeds total ${invoice.amount_cents}`)
        .suggest(`Use amount: ${invoice.amount_cents} for full payment.`)
        .details({ invoiceTotal: invoice.amount_cents, attempted: input.amount });
    }

    await ctx.db.payments.create({
      data: { invoiceId: input.invoice_id, amount: input.amount },
    });
    return { status: 'charged', amount: input.amount };
  });
```

### ErrorBuilder Methods

| Method | Purpose |
|---|---|
| `.suggest(text)` | Recovery instruction for the LLM agent |
| `.actions(...names)` | Tool names the agent should try instead |
| `.warning()` | Non-fatal advisory (`isError: false`) |
| `.critical()` | System-level failure requiring escalation |
| `.severity(level)` | `'error'` (default), `'warning'`, or `'critical'` |
| `.details(data)` | Structured metadata (`Record<string, string>`) |
| `.retryAfter(seconds)` | Suggest delay for transient errors |

## Severity Levels {#severity}

Default severity is `'error'`. Use `'warning'` for non-fatal advisories and `'critical'` for system-level failures:

```typescript
// Warning — non-fatal advisory (isError: false)
return f.error('DEPRECATED', 'This endpoint is deprecated')
  .suggest('Use billing.invoices_v2 instead.')
  .actions('billing.invoices_v2')
  .warning();

// Critical — system failure requiring escalation
return f.error('INTERNAL_ERROR', 'Database connection pool exhausted')
  .suggest('Retry after 30 seconds or contact support.')
  .retryAfter(30)
  .critical();
```

Warnings set `isError: false` in the MCP response — the agent treats them as advisories rather than failures.

## Structured Details & Retry Hints {#details}

Add machine-readable metadata for richer error context:

```typescript
return f.error('NOT_FOUND', 'Invoice not found')
  .details({
    entity_id: 'inv_123',
    entity_type: 'invoice',
    searched_workspace: 'ws_42',
  });

return f.error('RATE_LIMITED', 'Too many requests')
  .retryAfter(30);
```

## Automatic Validation Errors {#validation}

When the agent sends arguments that fail Zod validation, the framework generates per-field correction prompts automatically — no code needed:

```xml
<validation_error action="users/create">
  <field name="email">Invalid email. You sent: 'bad-email'. Expected: a valid email address (e.g. user@example.com).</field>
  <field name="role">Invalid enum value. Expected 'admin' | 'user', received 'superadmin'. You sent: 'superadmin'. Valid options: 'admin', 'user'.</field>
  <recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

Per-field `You sent:` values let the agent diff against expectations. The `<recovery>` tag instructs immediate retry. Unrecognized keys are explicitly rejected:

```xml
<validation_error action="billing/create">
  <field name="(root)">Unrecognized key(s) in object: 'hallucinated_param'. Remove or correct unrecognized fields: 'hallucinated_param'. Check for typos.</field>
  <recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

## Automatic Routing Errors {#routing}

Missing or misspelled discriminators produce structured corrections:

```xml
<tool_error code="MISSING_DISCRIMINATOR">
  <message>The required field "action" is missing.</message>
  <available_actions>list, create, delete</available_actions>
  <recovery>Add the "action" field and call the tool again.</recovery>
</tool_error>
```

```xml
<tool_error code="UNKNOWN_ACTION">
  <message>The action "destory" does not exist.</message>
  <available_actions>list, create, delete</available_actions>
  <recovery>Choose a valid action from available_actions and call the tool again.</recovery>
</tool_error>
```

## Composing Errors with Result {#pipelines}

For multi-step operations, use the [Result monad](/result-monad) to compose validation chains:

```typescript
import { succeed, fail, error, success, type Result } from '@vinkius-core/mcp-fusion';

function findUser(db: Database, id: string): Result<User> {
  const user = db.users.get(id);
  return user ? succeed(user) : fail(error(`User "${id}" not found`));
}

function checkPermission(user: User, action: string): Result<User> {
  return user.can(action)
    ? succeed(user)
    : fail(error(`User "${user.id}" cannot ${action}`));
}

.handle(async (input, ctx) => {
  const user = findUser(ctx.db, input.user_id);
  if (!user.ok) return user.response;

  const authorized = checkPermission(user.value, 'delete');
  if (!authorized.ok) return authorized.response;

  await ctx.db.projects.delete({ where: { id: input.project_id } });
  return success('Deleted');
})
```

## The Error Protocol {#protocol}

| Error Type | Source | Root Element | Trigger |
|---|---|---|---|
| `error()` | Handler | `<tool_error>` | Generic failures |
| `required()` | Handler | `<tool_error code="MISSING_REQUIRED_FIELD">` | Missing arguments |
| `toolError()` | Handler | `<tool_error code="...">` | Recoverable business errors |
| `f.error()` | Handler | `<tool_error code="...">` | Fluent builder chain |
| Validation | Automatic | `<validation_error action="...">` | Invalid arguments |
| Routing | Automatic | `<tool_error code="MISSING_DISCRIMINATOR\|UNKNOWN_ACTION">` | Bad discriminator |

All user-controlled data is XML-escaped automatically.