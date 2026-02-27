# Select Reflection

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [The Problem — Over-Fetching](#problem)
- [Using Zod Shape Inspection](#api)
- [Database Integration](#database)

## Introduction {#introduction}

When the Presenter schema declares 5 fields but the handler's database query fetches 25 columns, you waste bandwidth and CPU processing data that will be stripped anyway. Select Reflection lets you introspect the Presenter's Zod schema at query time, so your handler only fetches the columns the AI will actually see.

## The Problem — Over-Fetching {#problem}

```typescript
// Handler fetches ALL columns
const user = await ctx.db.users.findUnique({
  where: { id: input.id },
});
// Returns: id, name, email, role, password_hash, stripe_id, internal_flags, ...

// Presenter keeps only 4 fields
// UserPresenter.schema: { id, name, email, role }
// Everything else is stripped by Zod .strict()
```

The Presenter already strips the extra fields — but you still paid for the database I/O and memory to fetch them.

## Using Zod Shape Inspection {#api}

Since Presenter schemas are standard Zod objects, you can extract the field names using Zod's `.shape` property:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

const UserPresenter = createPresenter('User')
  .schema({
    id:    t.string,
    name:  t.string,
    email: t.string,
    role:  t.enum('admin', 'member', 'guest'),
  });

// Extract declared field names from the Zod shape
const schema = UserPresenter.getSchema();
const selectKeys = Object.keys(schema.shape);
// ['id', 'name', 'email', 'role']

// Convert to Prisma select format
const select = Object.fromEntries(selectKeys.map(k => [k, true]));
// { id: true, name: true, email: true, role: true }
```

## Database Integration {#database}

Wire it into your handlers:

### Prisma

```typescript
export const getUser = f.query('users.get')
  .describe('Get a user by ID')
  .withString('id', 'User ID')
  .returns(UserPresenter)
  .handle(async (input, ctx) => {
    const shape = UserPresenter.getSchema().shape;
    const select = Object.fromEntries(
      Object.keys(shape).map(k => [k, true]),
    );

    return ctx.db.users.findUnique({
      where: { id: input.id },
      select,   // ← only fetch declared fields
    });
  });
```

### Raw SQL

```typescript
export const listUsers = f.query('users.list')
  .describe('List all users')
  .returns(UserPresenter)
  .handle(async (input, ctx) => {
    const columns = Object.keys(UserPresenter.getSchema().shape).join(', ');
    return ctx.db.query(`SELECT ${columns} FROM users`);
  });
```

> [!TIP]
> Select Reflection is optional. If your query needs extra fields for business logic (e.g., checking `role` before deciding what to return), fetch what you need — the Presenter strips the rest automatically.
