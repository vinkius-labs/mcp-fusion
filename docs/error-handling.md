# Error Handling

MCP Fusion provides a layered error handling system designed for both human debugging and LLM agent self-correction.

## The Error Hierarchy

```
error()        → Simple error message (human-readable)
required()     → Missing field shortcut
toolError()    → Self-healing error with recovery instructions
Result<T>      → Pipeline-oriented success/failure composition
```

## Simple Errors

Use `error()` for straightforward failures:

```typescript
import { error } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    const project = await ctx.db.projects.findUnique(args.id);
    if (!project) return error(`Project "${args.id}" not found`);
    return success(project);
}
```

## Missing Field Errors

`required()` is a convenience shortcut for validation:

```typescript
import { required } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    if (!args.workspace_id) return required('workspace_id');
    // ...
}
```

## Self-Healing Errors (Agent Experience)

`toolError()` provides structured recovery instructions so LLM agents can self-correct instead of hallucinating:

```typescript
import { toolError } from '@vinkius-core/mcp-fusion';

handler: async (ctx, args) => {
    const project = await ctx.db.get(args.project_id);

    if (!project) {
        return toolError('ProjectNotFound', {
            message: `Project '${args.project_id}' does not exist.`,
            suggestion: 'Call projects.list first to get valid IDs, then retry.',
            availableActions: ['projects.list'],
        });
    }

    return success(project);
}
```

**What the LLM sees:**

```
[ProjectNotFound] Project 'proj_xyz' does not exist.

💡 Suggestion: Call projects.list first to get valid IDs, then retry.

📋 Try: projects.list
```

This structured format helps the agent:
1. **Understand the error** — via the error code
2. **Know what to do** — via the suggestion
3. **Know which actions exist** — via the available actions list

### When to use each

| Helper | Use Case | LLM Benefit |
|---|---|---|
| `error()` | Generic failures, auth errors | Basic retry trigger |
| `required()` | Missing arguments | Tells LLM which field to add |
| `toolError()` | Recoverable failures | Full self-healing with next steps |

## Result Monad — Pipeline Composition

For complex multi-step operations, use the `Result<T>` monad to compose error handling without try/catch:

```typescript
import { succeed, fail, error, type Result } from '@vinkius-core/mcp-fusion';

function findUser(id: string): Result<User> {
    const user = db.users.get(id);
    return user ? succeed(user) : fail(error(`User "${id}" not found`));
}

function checkPermission(user: User, action: string): Result<User> {
    return user.can(action)
        ? succeed(user)
        : fail(error(`User "${user.id}" cannot ${action}`));
}

// Pipeline composition
handler: async (ctx, args) => {
    const user = findUser(args.user_id);
    if (!user.ok) return user.response;       // Early exit

    const authorized = checkPermission(user.value, 'delete');
    if (!authorized.ok) return authorized.response;  // Early exit

    await ctx.db.projects.delete(args.project_id);
    return success('Deleted');
}
```

### Pipeline Pattern Summary

```typescript
const step1 = someOperation();
if (!step1.ok) return step1.response;  // ← Failure short-circuits

const step2 = nextOperation(step1.value);  // ← Success narrows type
if (!step2.ok) return step2.response;

return success(step2.value);  // ← Final success
```

> **See also:** [Result Monad](/result-monad) for the complete API reference and advanced patterns.

## Combining with Middleware

Middleware can handle cross-cutting error concerns:

```typescript
const errorBoundary: MiddlewareFn<AppContext> = async (ctx, args, next) => {
    try {
        return await next();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError('UnhandledException', {
            message,
            suggestion: 'This is an unexpected error. Please report it.',
        });
    }
};

const tool = createTool<AppContext>('projects')
    .use(errorBoundary)
    .action({ name: 'list', handler: listProjects });
```

## Best Practices

1. **Prefer `toolError()` over `error()`** for any failure the LLM could recover from
2. **Use `Result<T>` for multi-step pipelines** to avoid nested try/catch
3. **Include `availableActions`** so the LLM knows which tool calls can fix the issue
4. **Keep error messages concise** — LLMs process shorter text more accurately
5. **Never expose internal stack traces** — use error codes like `'DatabaseError'`, not raw SQL errors
