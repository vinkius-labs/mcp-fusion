# Request Lifecycle

- [Introduction](#introduction)
- [The Full Pipeline](#pipeline)
- [Middleware Phase](#middleware)
- [Validation Phase](#validation)
- [Handler Phase](#handler)
- [Presenter Phase](#presenter)
- [Error Handling](#errors)

## Introduction {#introduction}

Understanding the request lifecycle helps you debug issues, design middleware correctly, and optimize performance. Every `tools/call` invocation follows the same pipeline — from raw MCP request to formatted response.

## The Full Pipeline {#pipeline}

```text
MCP tools/call request
    ↓
1. Context Factory          → build AppContext from session
    ↓
2. Signal Check             → abort if already cancelled
    ↓
3. Input Validation         → Zod parse against tool schema
    ↓
4. Middleware Chain          → run .use() middleware in order
    ↓
5. Handler Execution        → run .handle() callback
    ↓
6. Presenter Pipeline       → validate, slice, rules, UI, affordances
    ↓
7. State Sync               → prepend invalidation signals
    ↓
8. Response Serialization   → build ToolResponse
    ↓
MCP tools/call response
```

Each phase can short-circuit the pipeline. If validation fails, the handler never runs. If middleware throws, the handler never runs. If the signal fires, everything stops.

## Middleware Phase {#middleware}

Middleware runs in the order declared via `.use()`. Each middleware receives `ctx` and returns an object to merge:

```text
.use(withAuth)         → ctx = { ...ctx, user: { ... } }
.use(requireAdmin)     → ctx = { ...ctx, isAdmin: true }
.use(withTenant)       → ctx = { ...ctx, tenantDb: ... }
```

If any middleware throws, the chain stops and the error becomes the response. The handler and Presenter never execute.

## Validation Phase {#validation}

Input validation uses the accumulated schema from `.withString()`, `.withNumber()`, `.withEnum()`, etc. The framework builds a Zod object schema internally:

```typescript
// This chain:
f.query('users.get')
  .withString('id', 'User ID')
  .withOptionalEnum('format', ['json', 'toon'] as const, 'Output format')

// Produces this Zod schema internally:
z.object({
  id: z.string().describe('User ID'),
  format: z.enum(['json', 'toon']).optional().describe('Output format'),
}).strict()
```

`.strict()` rejects undeclared fields — if the LLM sends `{ id: "1", hack: true }`, validation fails with a clear error message.

## Handler Phase {#handler}

The handler receives two arguments: `input` (validated parameters) and `ctx` (enriched by middleware):

```typescript
.handle(async (input, ctx) => {
  // input: { id: string, format?: 'json' | 'toon' }
  // ctx: { db, tenantId, user, tenantDb, ... }
  return data;
})
```

The return value can be:
- **Raw data** → auto-wrapped in `success()`
- **`success(data)`** → explicit success response
- **`error(msg)`** → error response with `isError: true`
- **`toolError(code, opts)`** → structured recovery envelope
- **`response(data).build()`** → custom response with UI blocks

## Presenter Phase {#presenter}

When `.returns(Presenter)` is configured, the handler's return value goes through the Presenter pipeline:

```text
handler return value
    ↓
1. Array Detection         → single-item or collection path
2. .limit() Truncation     → slice BEFORE validation
3. Zod .parse() (strict)   → strip undeclared fields
4. Embed Resolution        → run child Presenters on nested keys
5. System Rules            → merge static + dynamic rules
6. UI Blocks               → render ECharts, Mermaid, markdown
7. Suggested Actions       → compute affordances from data state
8. ResponseBuilder         → assemble final ToolResponse
```

## Error Handling {#errors}

Errors at each phase produce different responses:

| Phase | Error Type | Response |
|---|---|---|
| Context Factory | Exception | `isError: true`, generic error |
| Validation | Zod validation error | `isError: true`, detailed field errors |
| Middleware | Thrown exception | `isError: true`, middleware error message |
| Handler | Thrown exception | `isError: true`, handler error message |
| Handler | `error()` / `toolError()` | `isError: true`, structured response |
| Presenter | Zod parse failure | `isError: true`, schema validation error |

> [!NOTE]
> Unhandled exceptions in the handler are caught by the framework and returned as `isError: true` responses. They never crash the MCP server.