# Error Handling

MCP Fusion wraps every error in structured XML. LLMs parse XML reliably, and each error includes a code, message, and recovery instructions that tell the agent what to do next.

## error() {#simple}

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

```xml
<tool_error>
  <message>Project "proj_xyz" not found</message>
</tool_error>
```

## required() {#required}

Shortcut for missing fields — tells the agent exactly which parameter to add:

```typescript
import { required } from '@vinkius-core/mcp-fusion';

handler: async ({ input, ctx }) => {
  if (!input.workspace_id) return required('workspace_id');
}
```

```xml
<tool_error code="MISSING_REQUIRED_FIELD">
  <message>Required field "workspace_id" is missing.</message>
  <recovery>Provide the "workspace_id" parameter and retry.</recovery>
</tool_error>
```

## toolError() — Self-Healing Errors {#tool-error}

Tells the agent not just what went wrong, but how to fix it:

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

The agent reads `<available_actions>` and calls `projects.list` instead of retrying with the same invalid ID.

### Error Codes {#codes}

`toolError()` accepts canonical codes or any custom string: `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `TIMEOUT`, `INTERNAL_ERROR`, `DEPRECATED`, `SERVER_BUSY`, or a domain-specific code like `'InvoiceAlreadyPaid'`.

### Severity {#severity}

Default is `'error'`. Use `'warning'` for non-fatal advisories:

```typescript
return toolError('DEPRECATED', {
  message: 'This endpoint is deprecated. Use billing.invoices_v2 instead.',
  severity: 'warning',
  availableActions: ['billing.invoices_v2'],
});
```

Warnings set `isError: false` in the MCP response — the agent treats them as advisories. `'critical'` signals system-level failures requiring escalation.

### Structured Details {#details}

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

### Retry Hints {#retry}

```typescript
return toolError('RATE_LIMITED', {
  message: 'Too many requests.',
  retryAfter: 30,
});
```

## Automatic Validation Errors {#validation}

When the agent sends arguments that fail Zod validation, the framework generates per-field correction prompts:

```xml
<validation_error action="users/create">
  <field name="email">Invalid email. You sent: 'bad-email'. Expected: a valid email address (e.g. user@example.com).</field>
  <field name="role">Invalid enum value. Expected 'admin' | 'user', received 'superadmin'. You sent: 'superadmin'. Valid options: 'admin', 'user'.</field>
  <recovery>Fix the fields above and call the tool again. Do not explain the error.</recovery>
</validation_error>
```

Per-field `You sent:` values let the agent diff against expectations. The `<recovery>` tag instructs immediate retry instead of apologizing. Unrecognized keys are explicitly rejected:

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

## The Error Protocol {#protocol}

| Error Type | Source | Root Element | Trigger |
|---|---|---|---|
| `error()` | Handler | `<tool_error>` | Generic failures |
| `required()` | Handler | `<tool_error code="MISSING_REQUIRED_FIELD">` | Missing arguments |
| `toolError()` | Handler | `<tool_error code="...">` | Recoverable business errors |
| Validation | Automatic | `<validation_error action="...">` | Invalid arguments |
| Routing | Automatic | `<tool_error code="MISSING_DISCRIMINATOR\|UNKNOWN_ACTION">` | Bad discriminator |

All user-controlled data is XML-escaped automatically.

## Composing Errors with Result {#pipelines}

For multi-step operations, use the [Result monad](/result-monad):

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
