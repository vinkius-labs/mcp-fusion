# Result Monad

MCP Fusion exports a lightweight `Result<T>` type that follows the **Railway-Oriented Programming** pattern used in Rust, Haskell, and F#. Instead of scattering `try/catch` blocks or returning raw response objects, express success/failure as a discriminated union and compose operations into clean pipelines.

---

## Why Result?

In MCP handlers, you frequently need to:

1. Look up a record that might not exist
2. Validate data that might be invalid
3. Compose multiple fallible steps before returning

Without `Result<T>`, this leads to deeply nested conditionals or ambiguous error handling. With it, every step returns either `Success<T>` or `Failure`, and TypeScript narrows the type automatically.

---

## The Type

```typescript
import { type Result, type Success, type Failure } from '@vinkius-core/mcp-fusion';

// Success<T> — contains the value
interface Success<T> {
    readonly ok: true;
    readonly value: T;
}

// Failure — contains a ToolResponse (ready to return)
interface Failure {
    readonly ok: false;
    readonly response: ToolResponse;
}

// Result<T> = Success<T> | Failure
type Result<T> = Success<T> | Failure;
```

Check `result.ok` to narrow:

```typescript
const result: Result<User> = findUser(id);

if (!result.ok) return result.response;  // Early return → Failure
const user = result.value;               // Narrowed → User
```

---

## Constructors

### `succeed(value)`

Wraps a value into a `Success<T>`:

```typescript
import { succeed } from '@vinkius-core/mcp-fusion';

return succeed(42);
return succeed({ id: 'user_1', name: 'Alice' });
```

### `fail(response)`

Wraps a `ToolResponse` into a `Failure`:

```typescript
import { fail, error, required } from '@vinkius-core/mcp-fusion';

return fail(error('User not found'));
return fail(required('email'));
```

::: tip Why `fail(error(...))` instead of just `error()`?
`error()` returns a `ToolResponse` directly — it's meant for handlers that return immediately. `fail()` wraps it into a `Result`, so you can compose it with other `Result`-returning functions in a pipeline.
:::

---

## Real-World Patterns

### Pattern 1: Database Lookup

The most common pattern — validate, fetch, and return in a clean pipeline:

```typescript
import { succeed, fail, error, success, type Result } from '@vinkius-core/mcp-fusion';

function findProject(db: Database, id: string): Result<Project> {
    const project = db.projects.findFirst({ where: { id } });
    return project ? succeed(project) : fail(error(`Project '${id}' not found`));
}

// In a handler:
handler: async (ctx, args) => {
    const result = findProject(ctx.db, args.project_id);
    if (!result.ok) return result.response;  // ← Clean early return

    const project = result.value;  // ← TypeScript knows this is Project
    return success(project);
}
```

### Pattern 2: Validation Chain

Compose multiple validation steps. Each step either succeeds or short-circuits:

```typescript
function validateEmail(email: string): Result<string> {
    const regex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
    return regex.test(email) 
        ? succeed(email) 
        : fail(error(`Invalid email format: ${email}`));
}

function validateAge(age: number): Result<number> {
    return age >= 0 && age <= 150 
        ? succeed(age) 
        : fail(error(`Age must be 0–150, got: ${age}`));
}

handler: async (ctx, args) => {
    const emailResult = validateEmail(args.email);
    if (!emailResult.ok) return emailResult.response;

    const ageResult = validateAge(args.age);
    if (!ageResult.ok) return ageResult.response;

    // Both validated — proceed with confidence
    const user = await ctx.db.users.create({
        email: emailResult.value,
        age: ageResult.value,
    });
    return success(user);
}
```

### Pattern 3: Service Layer Composition

Build reusable service functions that return `Result<T>`:

```typescript
class ProjectService {
    constructor(private db: Database) {}

    find(id: string): Result<Project> {
        const project = this.db.projects.find(id);
        return project ? succeed(project) : fail(error(`Project '${id}' not found`));
    }

    validateOwnership(project: Project, userId: string): Result<Project> {
        return project.ownerId === userId
            ? succeed(project)
            : fail(error('You do not own this project'));
    }

    archive(project: Project): Result<Project> {
        if (project.archived) return fail(error('Project already archived'));
        const updated = this.db.projects.update(project.id, { archived: true });
        return succeed(updated);
    }
}

// Clean, readable pipeline:
handler: async (ctx, args) => {
    const svc = new ProjectService(ctx.db);

    const found = svc.find(args.project_id);
    if (!found.ok) return found.response;

    const owned = svc.validateOwnership(found.value, ctx.userId);
    if (!owned.ok) return owned.response;

    const archived = svc.archive(owned.value);
    if (!archived.ok) return archived.response;

    return success(archived.value);
}
```

### Pattern 4: Combining with `toolError()`

Use `fail()` with structured error recovery:

```typescript
import { fail, toolError, type Result } from '@vinkius-core/mcp-fusion';

function resolveUser(db: Database, id: string): Result<User> {
    const user = db.users.find(id);
    if (!user) {
        return fail(toolError('UserNotFound', {
            message: `User '${id}' does not exist.`,
            suggestion: 'Call users.list to see available IDs.',
            availableActions: ['users.list'],
        }));
    }
    return succeed(user);
}
```

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `Result<T>` | `type` | Discriminated union: `Success<T> \| Failure` |
| `Success<T>` | `interface` | `{ ok: true, value: T }` |
| `Failure` | `interface` | `{ ok: false, response: ToolResponse }` |
| `succeed(value)` | `function` | Creates `Success<T>` |
| `fail(response)` | `function` | Creates `Failure` from a `ToolResponse` |

---

## When to Use Result vs Direct Returns

| Scenario | Use |
|---|---|
| Simple handler with one operation | `return success(data)` or `return error(msg)` |
| Handler with multiple fallible steps | `Result<T>` pipeline |
| Reusable service/validation functions | `Result<T>` return type |
| Integration with `toolError()` | `fail(toolError(...))` |
