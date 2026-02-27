# Select Reflection

When an AI agent calls a tool that returns a rich domain object, the entire object is serialized to the wire — even if the agent only needs one or two fields. A 15-field invoice costs tokens for every field, every time. At scale, this compounds into thousands of wasted tokens per conversation.

Select Reflection is the MVA mechanism that lets the agent declare which response fields it needs. The framework filters the wire payload to include only those fields, while preserving full data for all Presenter callbacks.

## The Problem: Response Overfetching

Consider a simple interaction — the agent wants to check if an invoice is paid:

```text
Agent needs: "Is invoice INV-001 paid?"

Agent receives:
{ id, status, amount_cents, client, address, tax_id, currency,
  line_items, notes, created_at, updated_at, due_date, ... }

Result: ~400 tokens for a yes/no question.
```

This happens on every tool call. In a 10-turn conversation querying invoices, the agent receives the full object 10 times — even when each turn only needs one or two fields.

The cost compounds:

| Scenario | Without _select | With _select |
|---|---|---|
| Check invoice status | ~400 tokens | ~15 tokens |
| List 50 invoices, read IDs only | ~20,000 tokens | ~2,500 tokens |
| 10-turn conversation | ~200,000 tokens | ~25,000 tokens |

## The Solution: `.enableSelect()`

Select Reflection is disabled by default — no tool exposes `_select` unless the developer explicitly opts in. This ensures zero breaking changes and full control over which tools support field selection.

```typescript
// ❌ Default — full objects on every response, no _select in schema
const billing = createTool<AppContext>('billing')
    .action({
        name: 'get_invoice',
        returns: InvoicePresenter,
        handler: async (ctx, args) => await ctx.db.invoices.findUnique(args.id),
    });

// ✅ With .enableSelect() — agents can pick fields
const billing = createTool<AppContext>('billing')
    .enableSelect()
    .action({
        name: 'get_invoice',
        returns: InvoicePresenter,
        handler: async (ctx, args) => await ctx.db.invoices.findUnique(args.id),
    });
// Input schema now includes: _select: { enum: ['amount_cents', 'client', 'id', 'status'] }
// Agent sends _select: ['status'] → receives { status: 'paid' }
```

The handler is unchanged in both cases. It returns the full object. When `.enableSelect()` is present, the framework automatically:

1. **Reflects** the Presenter's Zod schema keys into the input schema as an enum
2. **Strips** `_select` before Zod validation (so handlers never see it)
3. **Filters** the wire response to include only the selected fields
4. **Preserves** full data for UI blocks, system rules, and action suggestions

Here is a complete example with Presenter and tool definition:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(z.object({
        id: z.string(),
        status: z.enum(['paid', 'pending', 'overdue']),
        amount_cents: z.number(),
        client: z.object({ name: z.string(), email: z.string() }),
    }));

const billing = createTool<AppContext>('billing')
    .enableSelect()
    .action({
        name: 'get_invoice',
        schema: z.object({ id: z.string() }),
        returns: InvoicePresenter,
        handler: async (ctx, args) => await ctx.db.invoices.findUnique(args.id),
    });
```

### Generated Input Schema

The framework injects `_select` as an optional array property with an enum of all top-level Presenter schema keys:

```json
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "enum": ["get_invoice"] },
    "id": { "type": "string" },
    "_select": {
      "type": "array",
      "description": "⚡ Context optimization: select only the response fields you need. Omit to receive all fields.",
      "items": {
        "type": "string",
        "enum": ["amount_cents", "client", "id", "status"]
      }
    }
  }
}
```

The enum is derived from the Presenter's Zod schema at build time. The agent cannot request fields that don't exist in the schema.

### Wire Behavior

| AI Request | Response |
|---|---|
| `{ action: 'get_invoice', id: '123' }` | Full invoice (all fields) |
| `{ action: 'get_invoice', id: '123', _select: ['status'] }` | `{ status: 'paid' }` |
| `{ action: 'get_invoice', id: '123', _select: ['status', 'client'] }` | `{ status: 'paid', client: { name: 'Acme', email: '...' } }` |

When `_select` is omitted, the response is unfiltered — full backward compatibility.

## The Late Guillotine Pattern

The key design constraint: **UI blocks, system rules, and action suggestions must always see the full data.** A chart that renders `amount_cents` cannot break because the agent only selected `status`. A system rule that checks `invoice.amount_cents > 1000000` cannot receive `undefined`.

The solution is the **Late Guillotine** — filtering happens *after* all Presenter callbacks have executed:

```text
Handler returns full data
    ↓
Zod validates (full object)
    rules(fullData)           ← sees ALL fields
    ui(fullData)              ← sees ALL fields
    suggest(fullData)         ← sees ALL fields
    ↓
──── Late Guillotine ────
    ↓
Wire data filtered by _select
    ↓
ResponseBuilder.build()
```

This ensures zero breakage in the Presenter pipeline. The Egress Firewall, cognitive guardrails, affordances, and embedded Presenters all operate on the complete validated data. Only the final wire payload — the data block the agent reads — is filtered.

### Why Not Filter Before Callbacks?

If filtering happened before the Presenter callbacks:

```typescript
// ❌ This would break:
.ui((inv) => [
    ui.echarts({ data: [{ value: inv.amount_cents / 100 }] })
    //                          ^ undefined if agent selected only 'status'
])

.rules((inv) => [
    inv.amount_cents > 1000000 ? 'High-value invoice' : null
    //                ^ undefined — rule logic breaks silently
])

.suggest((inv) => [
    inv.status === 'pending' ? suggest('billing.pay', 'Pay') : null
    //       ^ works only if agent happened to select 'status'
])
```

Every Presenter callback would need defensive `?.` checks against every possible field combination. The Late Guillotine eliminates this problem entirely — callbacks always receive the full, validated object.

## Shallow Filtering

`_select` operates at the **top level only**. When an agent selects a nested object, it is returned whole:

```typescript
// Schema: { id, status, client: { name, email } }

_select: ['client']
// → { client: { name: 'Acme', email: 'billing@acme.com' } }
// Entire client object returned — not individual sub-fields
```

This is intentional. Top-level filtering covers 95% of real-world overfetching scenarios with O(1) complexity. Recursive GraphQL-style field selection would require:

- Schema-aware recursive type walkers
- Dot-path or nested-object `_select` syntax
- Complex validation logic per nesting level
- Risk of breaking embedded Presenters that expect complete sub-objects

The cost/benefit ratio doesn't justify the complexity. Shallow filtering solves the primary problem — reducing the number of top-level fields — without introducing fragility.

## Flat Exposition

`_select` works identically in flat exposition mode. When a tool is compiled to flat (one MCP tool per action), each atomic tool gets its own `_select` enum derived from that action's Presenter:

```text
Grouped mode:
  billing → { action: 'get_invoice', id: '123', _select: ['status'] }

Flat mode:
  billing_get_invoice → { id: '123', _select: ['status'] }
```

Both produce the same filtered response. The `ExpositionCompiler` handles `_select` injection for each atomic schema independently.

## Security

Select Reflection is secure through multiple layers of defense-in-depth:

| Layer | Protection |
|---|---|
| **Enum whitelist** | Only Presenter schema keys appear in the `_select` enum. The agent cannot request fields outside the declared schema — the same Zod schema that powers the Egress Firewall also constrains `_select`. |
| **`Object.hasOwn()`** | The `pickFields()` function uses own-property checks, blocking prototype chain access (`__proto__`, `constructor`). Even if a malicious client bypasses the JSON schema, prototype pollution is structurally impossible. |
| **Subtractive only** | `_select` can only *remove* fields from the response. It never adds data, never executes logic, and never modifies the underlying validated object. The worst case is selecting non-existent fields — they are silently ignored. |
| **Opt-in** | Disabled by default. A tool without `.enableSelect()` never exposes `_select` in its input schema. |
| **Type validation** | `_select` must be an `Array<string>`. Non-array values are silently ignored during argument extraction. |

## Patterns

### Pattern: High-Frequency Tools

Tools called frequently benefit the most from `_select`. The token savings multiply with call frequency:

```typescript
const tasks = createTool<AppContext>('tasks')
    .enableSelect()
    .action({
        name: 'list',
        readOnly: true,
        returns: TaskPresenter,
        handler: async (ctx, args) => await ctx.db.tasks.findMany(),
    });

// Agent listing tasks to check statuses:
// { action: 'list', _select: ['id', 'status'] }
// Instead of 15 fields × 50 tasks = 750 values
// → 2 fields × 50 tasks = 100 values (87% reduction)
```

### Pattern: Dashboard Aggregation

When an agent builds a dashboard by calling multiple tools, each call only needs a subset:

```typescript
// Step 1: Get invoice count by status
{ action: 'list', _select: ['status'] }

// Step 2: Get total revenue
{ action: 'list', _select: ['amount_cents'] }

// Step 3: Get client names for overdue invoices
{ action: 'list', _select: ['client', 'status'] }
```

Each call pays for only the fields it needs, instead of loading the full invoice object three times.

### Pattern: Selective Composition

When building prompts with `PromptMessage.fromView()`, the Presenter uses full data — `_select` only affects the wire response to the agent, not prompt composition:

```typescript
// In a prompt handler — fromView() always works with full data
...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx))
// Domain rules, UI blocks, and suggestions are complete
```

## When to Use

| Scenario | Recommendation |
|---|---|
| Large domain objects (10+ fields) | Enable — significant token savings |
| High-frequency tools | Enable — savings multiply with call volume |
| Small objects (1-3 fields) | Skip — overhead exceeds benefit |
| Tools without Presenters | No effect — `_select` requires a Presenter schema to derive the enum |
