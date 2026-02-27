# Result Monad

A lightweight `Result<T>` type following Railway-Oriented Programming. Every step returns `Success<T>` or `Failure`, and TypeScript narrows the type at each checkpoint.

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
  readonly response: ToolResponse;
}
```

```typescript
const result: Result<User> = findUser(id);

if (!result.ok) return result.response;  // Early return
const user = result.value;               // Narrowed to User
```

`Failure` carries a `ToolResponse` (same type that `error()` and `toolError()` return), so you can return it directly from a handler.

## Constructors {#constructors}

```typescript
import { succeed, fail, error, toolError } from '@vinkius-core/mcp-fusion';

succeed(42);
succeed({ id: 'user_1', name: 'Alice' });

fail(error('User not found'));
fail(toolError('NOT_FOUND', {
  message: 'User not found.',
  availableActions: ['users.list'],
}));
```

`error()` returns a `ToolResponse` for direct handler returns. `fail()` wraps it into a `Result` for composition in pipelines. Use `error()` in handlers, `fail(error(...))` in reusable service functions.

## Database Lookup {#lookup}

```typescript
import { succeed, fail, error, success, type Result } from '@vinkius-core/mcp-fusion';

function findProject(db: Database, id: string): Result<Project> {
  const project = db.projects.findFirst({ where: { id } });
  return project ? succeed(project) : fail(error(`Project '${id}' not found`));
}

.handle(async (input, ctx) => {
  const result = findProject(ctx.db, input.project_id);
  if (!result.ok) return result.response;

  const project = result.value;
  return success(project);
}
```

## Validation Chain {#validation}

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

.handle(async (input, ctx) => {
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

Each validation function is reusable across handlers. The pattern scales to any number of steps — each adds one `if (!result.ok)` guard.

## Service Layer Composition {#service}

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

```typescript
.handle(async (input, ctx) => {
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

## Self-Healing Errors {#tool-error}

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

## API Reference {#api}

| Export | Type | Description |
|---|---|---|
| `Result<T>` | `type` | `Success<T> \| Failure` |
| `Success<T>` | `interface` | `{ ok: true, value: T }` |
| `Failure` | `interface` | `{ ok: false, response: ToolResponse }` |
| `succeed(value)` | `function` | Creates `Success<T>` |
| `fail(response)` | `function` | Creates `Failure` from a `ToolResponse` |