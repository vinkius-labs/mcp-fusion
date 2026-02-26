# Error Handling

When an MCP tool call fails, the agent receives the error as text. In a raw MCP server, that text is whatever you put in the response — usually a string like `"Not found"` or, worse, a full stack trace. The agent can't distinguish between a missing record and a database crash. It can't tell which field was invalid or which tool to call instead.

MCP Fusion wraps every error — from simple failures to multi-field validation issues — in structured XML. LLMs parse XML reliably because they're pre-trained on millions of XML documents. Each error includes a code, a human-readable message, and (when appropriate) recovery instructions that tell the agent what to do next.

---

## Simple Errors with `error()` {#simple}

The most basic error helper. Use it when the failure is clear and there's no specific recovery path:

```typescript
import { error, success } from '@vinkius-core/mcp-fusion';

const getProject = f.tool({
  name: 'projects.get',
  description: 'Get a project by ID',
  input: z.object({ id: z.string() }),
  handler: async ({ input, ctx }) => {
    const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
    if (!project) return error(`Project "${input.id}" not found`);
    return success(project);
  },
});
```

The agent receives:

```xml
<tool_error>
  <message>Project "proj_xyz" not found</message>
</tool_error>
```

The XML envelope tells the agent this is an error (not data), and the MCP response sets `isError: true` so the LLM runtime distinguishes errors from successful calls.

---

## Missing Field Errors with `required()` {#required}

A convenience shortcut for the specific case where a required field is absent. This matters because the error tells the agent _exactly which field_ to add:

```typescript
import { required } from '@vinkius-core/mcp-fusion';

handler: async ({ input, ctx }) => {
  if (!input.workspace_id) return required('workspace_id');
  // ...
}
```

```xml
<tool_error code="MISSING_REQUIRED_FIELD">
  <message>Required field "workspace_id" is missing.</message>
  <recovery>Provide the "workspace_id" parameter and retry.</recovery>
</tool_error>
```

The `code` attribute lets the agent match on `MISSING_REQUIRED_FIELD` structurally. The `<recovery>` tag tells it exactly what to do — provide the field and retry. No guessing, no hallucinating workarounds.

---

## Self-Healing Errors with `toolError()` {#tool-error}

This is where MCP Fusion's error handling diverges from every other framework. `toolError()` doesn't just report what went wrong — it tells the agent how to fix it:

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

handler: async ({ input, ctx }) => {
  const project = await ctx.db.projects.findUnique({ where: { id: input.project_id } });

  if (!project) {
    return toolError('ProjectNotFound', {
      message: `Project '${input.project_id}' does not exist.`,
      suggestion: 'Call projects.list first to get valid IDs, then retry.',
      availableActions: ['projects.list'],
    });
  }

  return success(project);
}
```

```xml
<tool_error code="ProjectNotFound" severity="error">
  <message>Project 'proj_xyz' does not exist.</message>
  <recovery>Call projects.list first to get valid IDs, then retry.</recovery>
  <available_actions>
    <action>projects.list</action>
  </available_actions>
</tool_error>
```

The agent reads `<available_actions>` and calls `projects.list` instead of retrying with the same invalid ID. This is self-healing behavior — the error contains the instructions to recover from it.

### Error Codes {#codes}

`toolError()` accepts canonical codes or any custom string:

| Code | When to use |
|---|---|
| `NOT_FOUND` | Entity doesn't exist |
| `VALIDATION_ERROR` | Business rule violation |
| `UNAUTHORIZED` | Missing credentials |
| `FORBIDDEN` | Insufficient permissions |
| `CONFLICT` | Duplicate or state conflict |
| `RATE_LIMITED` | Too many requests |
| `TIMEOUT` | Operation timed out |
| `INTERNAL_ERROR` | Unexpected server error |
| `DEPRECATED` | Feature being removed |
| `SERVER_BUSY` | Concurrency limit reached |
| *Custom string* | Any domain-specific code (e.g., `'InvoiceAlreadyPaid'`) |

### Severity Levels {#severity}

By default, errors have `severity: 'error'`. For non-fatal advisories (deprecation warnings, soft limits), use `'warning'`:

```typescript
return toolError('DEPRECATED', {
  message: 'This endpoint is deprecated. Use billing.invoices_v2 instead.',
  severity: 'warning',
  availableActions: ['billing.invoices_v2'],
});
```

Warnings set `isError: false` in the MCP response — the agent treats them as advisories, not failures.

| Severity | `isError` | Use case |
|---|---|---|
| `warning` | `false` | Deprecation notices, soft limits |
| `error` | `true` | Recoverable failures (default) |
| `critical` | `true` | System-level failures requiring escalation |

### Structured Details {#details}

Attach key-value metadata for richer context. The agent uses these to narrow the problem without making additional calls:

```typescript
return toolError('NOT_FOUND', {
  message: 'Invoice not found.',
  details: {
    entity_id: 'inv_123',
    entity_type: 'invoice',
    searched_workspace: 'ws_42',
  },
});
```

```xml
<tool_error code="NOT_FOUND" severity="error">
  <message>Invoice not found.</message>
  <details>
    <detail key="entity_id">inv_123</detail>
    <detail key="entity_type">invoice</detail>
    <detail key="searched_workspace">ws_42</detail>
  </details>
</tool_error>
```

### Retry Hints {#retry}

For transient failures, include a retry delay so the agent waits instead of hammering the endpoint:

```typescript
return toolError('RATE_LIMITED', {
  message: 'Too many requests.',
  retryAfter: 30,
});
```

```xml
<tool_error code="RATE_LIMITED" severity="error">
  <message>Too many requests.</message>
  <retry_after>30 seconds</retry_after>
</tool_error>
```

---

## Automatic Validation Errors {#validation}

You never write validation error formatting yourself. When the agent sends arguments that fail Zod validation, the framework generates a per-field correction prompt automatically:

```xml
<validation_error action="users/create">
  <field name="email">Invalid email. You sent: 'bad-email'. Expected: a valid email address (e.g. user@example.com).</field>
  <field name="role">Invalid enum value. Expected 'admin' | 'user', received 'superadmin'. You sent: 'superadmin'. Valid options: 'admin', 'user'.</field>
  <recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

Three design decisions make this format effective for agents:

1. **Per-field `You sent:` values** — the agent sees exactly what it passed, so it can diff against what's expected.
2. **Expected types and valid options** — the agent knows what to send instead, not just that it was wrong.
3. **Anti-apology `<recovery>`** — instructs the agent to retry immediately instead of producing a lengthy explanation to the user.

When the agent sends fields not declared in the schema, they're explicitly rejected (not silently stripped):

```xml
<validation_error action="billing/create">
  <field name="(root)">Unrecognized key(s) in object: 'hallucinated_param'. Remove or correct unrecognized fields: 'hallucinated_param'. Check for typos.</field>
  <recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

This teaches the agent which fields actually exist, enabling self-correction on retry.

---

## Automatic Routing Errors {#routing}

The framework also generates routing errors when the agent omits or misspells the discriminator field in grouped tools:

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

Both errors list the valid actions, so the agent knows what to choose. Typos like `"destory"` are common with smaller models — the error corrects them in one round-trip.

---

## The Error Protocol {#protocol}

Every error in the system follows the same structural contract:

| Error Type | Source | Root Element | Trigger |
|---|---|---|---|
| `error()` | Your handler | `<tool_error>` | Generic failures |
| `required()` | Your handler | `<tool_error code="MISSING_REQUIRED_FIELD">` | Missing arguments |
| `toolError()` | Your handler | `<tool_error code="...">` | Recoverable business errors |
| Validation | Automatic | `<validation_error action="...">` | Invalid arguments |
| Routing | Automatic | `<tool_error code="MISSING_DISCRIMINATOR\|UNKNOWN_ACTION">` | Missing or invalid action |

All user-controlled data in error outputs is XML-escaped automatically. Element content escapes `&` and `<`. Attribute values escape all five XML special characters (`&`, `<`, `>`, `"`, `'`).

---

## Composing Errors in Pipelines {#pipelines}

For multi-step operations where each step can fail, use the [Result monad](/result-monad) to compose error handling without `try/catch`:

```typescript
import { succeed, fail, error, type Result } from '@vinkius-core/mcp-fusion';

function findUser(db: Database, id: string): Result<User> {
  const user = db.users.get(id);
  return user ? succeed(user) : fail(error(`User "${id}" not found`));
}

function checkPermission(user: User, action: string): Result<User> {
  return user.can(action)
    ? succeed(user)
    : fail(error(`User "${user.id}" cannot ${action}`));
}

handler: async ({ input, ctx }) => {
  const user = findUser(ctx.db, input.user_id);
  if (!user.ok) return user.response;

  const authorized = checkPermission(user.value, 'delete');
  if (!authorized.ok) return authorized.response;

  await ctx.db.projects.delete({ where: { id: input.project_id } });
  return success('Deleted');
}
```

Each step returns `Result<T>` — either `{ ok: true, value: T }` or `{ ok: false, response: ToolResponse }`. Failures short-circuit with an early return. Successes narrow the type for the next step. See [Result Monad](/result-monad) for the full API.

---

## Where to Go Next {#next-steps}

- [Result Monad](/result-monad) — `succeed()`, `fail()`, pipeline composition patterns
- [Building Tools](/building-tools) — `toolError()` usage with `f.tool()`, `defineTool()`, `createTool()`
- [Middleware](/middleware) — cross-cutting error boundaries
