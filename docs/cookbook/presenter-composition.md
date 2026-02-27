# Presenter Composition

- [Introduction](#introduction)
- [Embedding Child Presenters](#embed)
- [Multi-Level Embeds](#multi-level)
- [Shared Base Schema](#shared-base)
- [How Embeds Compose](#how)

## Introduction {#introduction}

Real-world data has relationships. An invoice has a client. A project has tasks. An order has line items and a shipping address. Instead of flattening everything into one giant schema, MCP Fusion lets you **compose Presenters** — each entity gets its own schema, rules, and affordances, and they merge automatically when embedded.

Define `ClientPresenter` once. Embed it in `InvoicePresenter`, `OrderPresenter`, and `ProjectPresenter`. Change a rule on the client — it updates everywhere.

## Embedding Child Presenters {#embed}

Use `.embed(key, ChildPresenter)` to declare that a field in the handler's output should be processed by a child Presenter:

```typescript
import { createPresenter, t } from '@vinkius-core/mcp-fusion';

// ── Client Presenter (reusable) ────────────────────────────
const ClientPresenter = createPresenter('Client')
  .schema({
    id:      t.string,
    name:    t.string,
    tier:    t.enum('free', 'pro', 'enterprise'),
  })
  .rules([
    'Display company name prominently.',
    'Tier determines available features.',
  ]);

// ── Invoice Presenter (embeds Client) ──────────────────────
const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number.describe('CENTS — divide by 100'),
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .rules(['Use currency format: $XX,XXX.00'])
  .embed('client', ClientPresenter);
```

When the handler returns `{ id: 'INV-1', amount_cents: 45000, status: 'pending', client: { id: 'C-1', name: 'Acme Corp', tier: 'pro' } }`:

1. The **Invoice** schema validates the top-level fields
2. The **Client** Presenter validates and processes the `client` field
3. Both sets of rules merge into the response
4. Both sets of affordances merge into the response

The AI sees a unified perception package with rules from both entities.

## Multi-Level Embeds {#multi-level}

Embeds nest to any depth. An invoice with line items, each with a product:

```typescript
const ProductPresenter = createPresenter('Product')
  .schema({
    id:    t.string,
    name:  t.string,
    price: t.number.describe('Price in CENTS'),
  });

const LineItemPresenter = createPresenter('LineItem')
  .schema({
    id:       t.string,
    quantity: t.number,
    subtotal: t.number.describe('Subtotal in CENTS'),
  })
  .embed('product', ProductPresenter)
  .limit(20);

const InvoicePresenter = createPresenter('Invoice')
  .schema({
    id:           t.string,
    amount_cents: t.number,
    status:       t.enum('paid', 'pending', 'overdue'),
  })
  .embed('client', ClientPresenter)
  .embed('line_items', LineItemPresenter);
```

The `line_items` array is truncated to 20 items (`.limit(20)`) before each item's `product` is processed by `ProductPresenter`. Rules from Product, LineItem, Client, and Invoice all merge into one response.

## Shared Base Schema {#shared-base}

For entities with common fields (id, timestamps), define a base schema and extend it:

```typescript
import { z } from 'zod';

const baseEntity = z.object({
  id:         z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const InvoicePresenter = createPresenter('Invoice')
  .schema(baseEntity.extend({
    amount_cents: z.number().describe('Value in CENTS. Divide by 100.'),
    status: z.enum(['paid', 'pending', 'overdue']),
  }));

const ProjectPresenter = createPresenter('Project')
  .schema(baseEntity.extend({
    name: z.string(),
    status: z.enum(['active', 'archived']),
  }));
```

> [!TIP]
> Raw Zod schemas still work with `createPresenter()`. Use the `t` namespace for new Presenters and `z.object()` when extending shared base schemas.

## How Embeds Compose {#how}

When the framework processes a response with embedded Presenters, it follows this pipeline:

```text
handler return value
    ↓
1. Array Detection         → single-item or collection path
2. agentLimit (arrays)     → slice BEFORE validation
3. Zod .parse() (strict)   → strip undeclared fields
4. Embed Resolution        → run child Presenters on nested keys
5. System Rules            → merge parent + child rules
6. UI Blocks               → merge parent + child UI blocks
7. Suggested Actions       → merge parent + child affordances
8. ResponseBuilder.build() → final ToolResponse
```

Every stage is optional. A Presenter with only `name` and `schema` is a pure egress whitelist — it strips undeclared fields and nothing more. Add `.rules()`, `.ui()`, `.suggest()`, and `.embed()` only when you need them.