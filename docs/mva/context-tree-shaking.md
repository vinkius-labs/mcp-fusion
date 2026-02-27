# Context Tree-Shaking

The term is borrowed from JavaScript bundlers. In webpack and Rollup, tree-shaking removes unused code from the final bundle. In MVA, Context Tree-Shaking removes irrelevant domain rules from the agent's context window. The principle is identical: **include only what's needed, exactly when it's needed.**

## The Problem: Global System Prompts

Today, every serious MCP server compensates for the lack of a perception layer by stuffing domain rules into the global system prompt:

```text
System Prompt (sent on EVERY LLM call):

"When displaying invoices, amount_cents is in cents. Always divide by 100..."
"For users, mask email addresses for non-admin roles..."
"Task statuses use emojis: 🔄 In Progress, ✅ Done, ❌ Blocked..."
"Sprint velocity is calculated as completed story points / sprint days..."
"Project budgets are always in USD. Format as $XX,XXX.00..."
"When showing reports, always include the date range in the header..."
"Never display fields: tenant_id, password_hash, internal_flags..."
"Country codes follow ISO 3166-1 alpha-2..."
"Client addresses should be formatted for mailing..."
"Notification priorities: 🔴 urgent, 🟡 normal, 🔵 low..."
... (50+ rules for 15+ domain entities)

~2,000 tokens. Sent even when the agent is calling tasks.list
and needs NONE of these invoice, sprint, or budget rules.
```

This creates three compounding problems:

### Problem 1: Token Waste

Every LLM call pays for the full system prompt. Even a simple `tasks.list` bears the token cost of invoice formatting rules, sprint velocity formulas, and budget conventions. At scale:

```text
2,000 tokens (system prompt) sent on every call
= wasted input tokens on every request — regardless of relevance.

At 100,000 calls/day:
= 200,000,000 wasted tokens/day — just from the system prompt.
```

### Problem 2: Misapplication

When the agent sees invoice rules while working on tasks, it may accidentally apply those rules to the wrong domain. Observed failure modes include:

- Sprint velocity displayed as currency (`$23.5` instead of `23.5 points/sprint`)
- Task counts divided by 100 (the agent applied the "divide by 100" invoice rule to task data)
- User emails masked in admin views (the agent applied user masking rules globally)

These are not edge cases. They are **systematic errors** caused by the agent's inability to distinguish which rules apply to which domain when all rules are present simultaneously.

### Problem 3: Context Saturation

The LLM's context window is finite. Every token spent on irrelevant rules is a token unavailable for:

- The actual data being processed
- The agent's reasoning chain
- Conversation history
- Tool schemas

As the system prompt grows, the agent's effective reasoning capacity shrinks. This manifests as degraded accuracy on complex multi-step tasks.

## The Solution: JIT Rules via `.rules()` / `.systemRules()`

MVA's `.rules()` (shorthand for `.systemRules()`) attaches domain rules to the **Presenter**, not to the system prompt. Rules appear in the agent's context only when the corresponding domain entity is being processed.

```typescript
// Invoice rules — sent ONLY when the agent receives invoice data
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .rules([
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
        'Use currency format: $XX,XXX.00',
        'Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue',
    ]);

// Task rules — sent ONLY when the agent receives task data
const TaskPresenter = createPresenter('Task')
    .schema(taskSchema)
    .rules([
        'Use status emojis: 🔄 In Progress, ✅ Done, ❌ Blocked',
        'Estimates are in hours. Display as "Xh".',
        'Due dates in the past should be flagged as OVERDUE.',
    ]);

// Sprint rules — sent ONLY when the agent receives sprint data
const SprintPresenter = createPresenter('Sprint')
    .schema(sprintSchema)
    .rules([
        'Velocity is in story points per sprint. Never divide by 100.',
        'Display date ranges as "MMM DD – MMM DD".',
    ]);
```

**The flow:**

```text
Agent calls tasks.list:
→ TaskPresenter processes the response
→ Agent receives ONLY task rules:
  [DOMAIN RULES]:
  - Use status emojis: 🔄 In Progress, ✅ Done, ❌ Blocked
  - Estimates are in hours. Display as "Xh".
  - Due dates in the past should be flagged as OVERDUE.

(No invoice rules. No sprint rules. No budget rules.)

Agent calls billing.get_invoice:
→ InvoicePresenter processes the response
→ Agent receives ONLY invoice rules:
  [DOMAIN RULES]:
  - CRITICAL: amount_cents is in CENTS. Divide by 100.
  - Use currency format: $XX,XXX.00
  - Use status emojis: ✅ paid, ⏳ pending, 🔴 overdue

(No task rules. No sprint rules.)
```

Each tool call gets exactly the rules it needs — nothing more.

## Dynamic Rules with Context

Static rules handle most cases, but some rules depend on who's asking and what they're looking at. The function form of `.rules()` receives both the data and the request context:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(invoiceSchema)
    .rules((invoice, ctx) => [
        // Always present
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',

        // RBAC — different rules for different roles
        ctx?.user?.role === 'admin'
            ? 'Show complete financial details including margins.'
            : 'RESTRICTED: Mask exact totals. Show ranges only (e.g., "$400-500").',

        // Locale — adapt formatting
        `Format dates using ${ctx?.tenant?.locale ?? 'en-US'} conventions.`,
        `Display currency as ${ctx?.tenant?.currency ?? 'USD'}.`,

        // Data-driven — rules that depend on the actual data
        invoice.status === 'overdue'
            ? `WARNING: This invoice is overdue. Mention urgency proactively.`
            : null,

        invoice.amount_cents > 1000000  // Over $10,000
            ? 'IMPORTANT: High-value invoice. Recommend manager approval before any action.'
            : null,
    ]);
```

`null` values are filtered automatically. The agent receives only the rules that are relevant to both the current data and the current user context.

This enables:

| Pattern | How It's Implemented |
|---|---|
| **RBAC** | Return role-specific rules using `ctx.user.role` |
| **DLP** | Return masking rules for non-privileged users |
| **Localization** | Inject locale-specific formatting via `ctx.tenant.locale` |
| **Data-driven urgency** | Inject warnings based on data values (overdue, high-value) |
| **Feature flags** | Conditionally include rules based on `ctx.features` |

## Token Economics

Let's quantify the savings. Consider a SaaS product with 15 domain entities.

### Global System Prompt Approach

```text
15 entities × ~130 tokens per entity = ~2,000 tokens
Sent on every turn regardless of which domain is active.

Per 10-turn conversation:
  2,000 × 10 turns = 20,000 tokens spent on rules
  Of which 13/15 (87%) are irrelevant on any given turn.
  Wasted: ~17,400 tokens per conversation.
```

### MVA JIT Approach

```text
Each turn receives rules for 1-2 active domains only.
~130-260 tokens per turn.

Per 10-turn conversation:
  ~200 × 10 turns = ~2,000 tokens spent on rules
  Of which ~0% are irrelevant.
  Wasted: ~0 tokens per conversation.
```

**Savings per conversation: ~18,000 tokens.** At 10,000 conversations/day, that's **~180M fewer input tokens/day** — on system prompt alone.

But the savings extend beyond token cost. Fewer irrelevant rules means:

- **Higher accuracy** — the agent isn't distracted by inapplicable rules
- **Fewer retries** — no misapplication errors from wrong-domain rules
- **Faster reasoning** — less context to process on each turn

## The Compounding Effect

Context Tree-Shaking doesn't operate in isolation. It compounds with other MVA mechanisms.

## Pattern: Organizing Rules by Domain

At scale, centralize your Presenters in a domain-organized module structure:

```text
src/
└── presenters/
    ├── index.ts                    # Barrel export
    ├── billing/
    │   ├── InvoicePresenter.ts     # Invoice rules
    │   ├── PaymentPresenter.ts     # Payment rules
    │   └── RefundPresenter.ts      # Refund rules
    ├── projects/
    │   ├── ProjectPresenter.ts     # Project rules
    │   ├── SprintPresenter.ts      # Sprint rules
    │   └── TaskPresenter.ts        # Task rules
    └── users/
        ├── UserPresenter.ts        # User rules
        └── TeamPresenter.ts        # Team rules
```

Each Presenter file owns the domain rules for its entity. When a developer needs to update how invoices are interpreted, they go to `InvoicePresenter.ts` — not to a 200-line system prompt.

## Anti-Patterns

### ❌ Duplicating Rules Across Presenters

```typescript
// ❌ WRONG: Same rule duplicated
const InvoicePresenter = createPresenter('Invoice')
    .rules(['Format dates in ISO 8601.']);

const TaskPresenter = createPresenter('Task')
    .rules(['Format dates in ISO 8601.']);  // Duplicated!

// ✅ RIGHT: Use a shared constant or helper
const sharedRules = {
    dateFormat: 'Format dates in ISO 8601.',
};

const InvoicePresenter = createPresenter('Invoice')
    .rules([sharedRules.dateFormat, 'amount is in CENTS.']);

const TaskPresenter = createPresenter('Task')
    .rules([sharedRules.dateFormat, 'Estimates in hours.']);
```

### ❌ Putting Rules in Handlers

```typescript
// ❌ WRONG: Rules embedded in the handler
handler: async (ctx, args) => {
    const invoice = await ctx.db.invoices.findUnique(args.id);
    return success({
        ...invoice,
        _rules: 'amount_cents is in cents. Divide by 100.',  // Not structured!
    });
}

// ✅ RIGHT: Rules in the Presenter
const InvoicePresenter = createPresenter('Invoice')
    .rules(['amount_cents is in CENTS. Divide by 100.']);
```
