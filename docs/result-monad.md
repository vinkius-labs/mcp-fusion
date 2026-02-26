# Result Monad

MCP handlers often need to look up a record that might not exist, validate data that might be invalid, and compose several of these steps before returning. Without a consistent pattern, this leads to deeply nested `if/else` blocks or ambiguous `try/catch` chains where it's unclear which step failed.

MCP Fusion exports a lightweight `Result<T>` type that follows the Railway-Oriented Programming pattern used in Rust, Haskell, and F#. Every step returns either `Success<T>` or `Failure`, and TypeScript narrows the type at each checkpoint.

---

## The Type {#type}

```typescript
import { type Result, type Success, type Failure } from '@vinkius-core/mcp-fusion';

type Result<T> = Success<T> | Failure;

interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

interface Failure {
  readonly ok: false;
  readonly response: ToolResponse;  // Ready to return from a handler
}
```

Check `result.ok` to narrow the type:

```typescript
const result: Result<User> = findUser(id);

if (!result.ok) return result.response;  // Early return — Failure
const user = result.value;               // Narrowed to User
```

The `Failure` variant carries a `ToolResponse` (the same type that `error()` and `toolError()` return), so you can return it directly from a handler without any transformation.

---

## Constructors {#constructors}

### `succeed(value)` {#succeed}

Wraps a value into `Success<T>`:

```typescript
import { succeed } from '@vinkius-core/mcp-fusion';

return succeed(42);
return succeed({ id: 'user_1', name: 'Alice' });
```

### `fail(response)` {#fail}

Wraps a `ToolResponse` into `Failure`:

```typescript
import { fail, error, toolError } from '@vinkius-core/mcp-fusion';

return fail(error('User not found'));
return fail(toolError('NOT_FOUND', {
  message: 'User not found.',
  availableActions: ['users.list'],
}));
```

::: tip Why `fail(error(...))` instead of just `error()`?
`error()` returns a `ToolResponse` — it's meant for handlers that return immediately. `fail()` wraps it into a `Result`, so you can compose it with other `Result`-returning functions in a pipeline. Use `error()` in handlers, `fail(error(...))` in reusable service functions.
:::

---

## Database Lookup {#lookup}

The most common pattern. Wrap a database query in a function that returns `Result<T>`, then use it in a handler with a one-line guard:

```typescript
import { succeed, fail, error, success, type Result } from '@vinkius-core/mcp-fusion';

function findProject(db: Database, id: string): Result<Project> {
  const project = db.projects.findFirst({ where: { id } });
  return project ? succeed(project) : fail(error(`Project '${id}' not found`));
}

handler: async ({ input, ctx }) => {
  const result = findProject(ctx.db, input.project_id);
  if (!result.ok) return result.response;

  const project = result.value;  // TypeScript knows this is Project
  return success(project);
}
```

The handler reads linearly — fetch, check, use. No nesting. If `findProject` fails, the error response is returned directly. If it succeeds, `result.value` is narrowed to `Project`.

---

## Validation Chain {#validation}

Compose multiple validation steps where each can independently fail. Each step either succeeds and passes its value forward, or short-circuits with an error:

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

handler: async ({ input, ctx }) => {
  const emailResult = validateEmail(input.email);
  if (!emailResult.ok) return emailResult.response;

  const ageResult = validateAge(input.age);
  if (!ageResult.ok) return ageResult.response;

  const user = await ctx.db.users.create({
    email: emailResult.value,
    age: ageResult.value,
  });
  return success(user);
}
```

Each validation function is reusable across handlers. The pattern scales to any number of steps — each adds one `if (!result.ok)` guard line.

---

## Service Layer Composition {#service}

Build reusable service classes that return `Result<T>`. Each method encapsulates one fallible operation:

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
```

The handler composes them into a pipeline:

```typescript
handler: async ({ input, ctx }) => {
  const svc = new ProjectService(ctx.db);

  const found = svc.find(input.project_id);
  if (!found.ok) return found.response;

  const owned = svc.validateOwnership(found.value, ctx.user.id);
  if (!owned.ok) return owned.response;

  const archived = svc.archive(owned.value);
  if (!archived.ok) return archived.response;

  return success(archived.value);
}
```

Three steps — find, validate ownership, archive — each with its own error message. The handler reads as a sequence of business operations, not a tangle of `try/catch` blocks.

---

## Combining with `toolError()` {#tool-error}

For self-healing errors that include recovery instructions, use `fail()` with `toolError()`:

```typescript
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

The agent receives structured XML with recovery instructions, and the calling handler gets a clean early-return path.

---

## API Reference {#api}

| Export | Type | Description |
|---|---|---|
| `Result<T>` | `type` | `Success<T> \| Failure` |
| `Success<T>` | `interface` | `{ ok: true, value: T }` |
| `Failure` | `interface` | `{ ok: false, response: ToolResponse }` |
| `succeed(value)` | `function` | Creates `Success<T>` |
| `fail(response)` | `function` | Creates `Failure` from a `ToolResponse` |

---

## Where to Go Next {#next-steps}

- [Error Handling](/error-handling) — `error()`, `required()`, `toolError()`, automatic validation errors
- [Building Tools](/building-tools) — tool APIs where `Result<T>` is used in handlers
