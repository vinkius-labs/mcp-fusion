# Common Issues in Agentic Systems

::: info Prerequisites
Install MCP Fusion before following this guide: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

AI agents are stochastic — they hallucinate parameters, misformat inputs, retry blindly, and lose context between calls. A raw MCP server treats each tool call as independent, leaving your application vulnerable to data corruption, token waste, and unpredictable failures.

This page catalogs the most common failure modes in agentic systems and shows how MCP Fusion solves each one **at the framework level** — before they reach your application code.

- [Partial Failure in Multi-Step Operations](#partial-failure)
- [Parameter Hallucination](#parameter-hallucination)
- [Thundering Herd — Concurrent Duplicate Calls](#thundering-herd)
- [Context Window Overflow](#context-overflow)
- [Stale Data After Mutations](#stale-data)
- [Blind Retry Loops](#blind-retries)
- [Data Leaking to the LLM](#data-leaking)
- [Race Conditions on Destructive Operations](#race-conditions)

---

## Partial Failure in Multi-Step Operations {#partial-failure}

### The Problem

An agent executes a business workflow as three separate tool calls:

```
1. users.create     ✅ → Database has a new record
2. billing.charge   ✅ → Stripe charged the card
3. email.send       ❌ → Zod validation fails 3× → MCP timeout
```

The user was charged but never received their access credentials. The database is now in a corrupted state — a charge without a corresponding onboarding completion.

This happens because **AI is stochastic**. The agent can misformat Zod parameters, hallucinate field names, or hit a timeout. And the MCP protocol has no concept of a transaction spanning multiple tool calls.

### How MCP Fusion Solves It

**Compose the workflow into a single tool** using the Fluent API. The agent calls one tool — the server orchestrates all steps internally and handles failure atomically:

```typescript
import { initFusion, toolError, success } from '@vinkius-core/mcp-fusion';

const f = initFusion<AppContext>();

export default f.mutation('onboarding.provision')
  .describe('Provision a new user with billing and welcome email')
  .withString('email', 'User email address')
  .withNumber('plan_cents', 'Plan price in cents')
  .destructive()
  .handle(async (input, ctx) => {
    // Step 1: Create user
    const user = await ctx.db.user.create({
      data: { email: input.email, status: 'pending' },
    });

    // Step 2: Charge card — with rollback on failure
    let charge;
    try {
      charge = await ctx.payments.charge({
        customerId: user.stripeId,
        amount: input.plan_cents,
      });
    } catch (err) {
      // Rollback step 1
      await ctx.db.user.delete({ where: { id: user.id } });
      return f.error('PAYMENT_FAILED', 'Card charge failed')
        .suggest('Verify payment method and retry')
        .actions('onboarding.provision')
        .details({ userId: user.id, reason: String(err) });
    }

    // Step 3: Send welcome email — with rollback on failure
    try {
      await ctx.mailer.send({
        to: input.email,
        template: 'welcome',
        data: { userId: user.id },
      });
    } catch (err) {
      // Rollback steps 1 + 2
      await ctx.payments.refund({ chargeId: charge.id });
      await ctx.db.user.delete({ where: { id: user.id } });
      return f.error('EMAIL_FAILED', 'Welcome email could not be sent')
        .suggest('Email service may be temporarily unavailable. Retry in 30 seconds.')
        .actions('onboarding.provision')
        .retryAfter(30);
    }

    // All steps succeeded — activate
    await ctx.db.user.update({
      where: { id: user.id },
      data: { status: 'active' },
    });

    return { userId: user.id, charged: charge.id, status: 'active' };
  });
```

The agent sees **one tool** — `onboarding.provision`. If any step fails, the handler compensates all previous steps and returns a self-healing error with recovery instructions. No corrupted state.

> [!TIP]
> See the full pattern in the [Transactional Workflows](/cookbook/transactional-workflows) cookbook recipe.

---

## Parameter Hallucination {#parameter-hallucination}

### The Problem

The agent invents parameters that don't exist in the schema:

```json
{ "action": "create", "user_name": "Alice", "isAdmin": true, "priority": "high" }
```

None of these fields exist. A raw MCP server silently ignores them — or worse, passes them to the database.

### How MCP Fusion Solves It

Every tool schema is compiled with Zod `.strict()` at build time. Undeclared fields are **rejected before they reach your handler** with an actionable correction prompt:

```typescript
export default f.mutation('users.create')
  .describe('Create a new user')
  .withString('name', 'Full name')
  .withString('email', 'Email address')
  .handle(async (input, ctx) => {
    // input.name: string ✅ — typed and validated
    // input.email: string ✅ — typed and validated
    // input.isAdmin: ❌ never reaches here
    return ctx.db.user.create({ data: input });
  });
```

The agent receives:

```text
❌ Validation failed for 'users.create':
  • Unrecognized key(s): "user_name", "isAdmin", "priority".
    Valid fields: name, email.
  💡 Fix the fields above and call the action again.
```

The AI corrects itself on the next attempt — no blind retries, no leaked invalid data.

---

## Thundering Herd — Concurrent Duplicate Calls {#thundering-herd}

### The Problem

The LLM fires 5 identical `billing.charge` requests in the same millisecond. Without protection, all 5 execute concurrently — charging the customer 5 times.

### How MCP Fusion Solves It

Two complementary guards:

**1. Concurrency Guard** — per-tool semaphore with backpressure queue:

```typescript
export default f.mutation('billing.charge')
  .describe('Process a payment')
  .concurrency({ maxActive: 1, maxQueue: 3 })
  .withString('invoice_id', 'Invoice to charge')
  .handle(async (input, ctx) => {
    return ctx.payments.charge(input.invoice_id);
  });
```

Only 1 charge runs at a time. 3 more can queue. The rest receive `SERVER_BUSY` with a retry hint.

**2. Mutation Serializer** — automatic for all destructive operations:

```typescript
// Automatic — no configuration needed.
// f.mutation() sets destructive: true by default.
// The MutationSerializer ensures sequential execution per action key.
```

Concurrent calls to the same mutation are serialized in FIFO order. The second call waits for the first to complete before executing. Zero overhead for read-only operations.

---

## Context Window Overflow {#context-overflow}

### The Problem

An agent queries `tasks.list` and the database returns 10,000 rows. At ~500 tokens per row, that's **5,000,000 tokens** — enough to overflow the context window, trigger an OOM error, or cost hundreds of dollars in a single API call.

### How MCP Fusion Solves It

**Cognitive Guardrails** via Presenter `.limit()`:

```typescript
const TaskPresenter = createPresenter('Task')
  .schema({
    id:     t.string,
    title:  t.string,
    status: t.enum('open', 'in_progress', 'done'),
  })
  .limit(50)
  .suggest((task) => [
    task.status === 'open'
      ? suggest('tasks.assign', 'Assign to team member')
      : null,
  ].filter(Boolean));

export default f.query('tasks.list')
  .describe('List tasks')
  .returns(TaskPresenter)
  .handle(async (_, ctx) => ctx.db.tasks.findMany());
```

10,000 rows → 50 rows with a system guidance block: `[SYSTEM]: Showing 50 of 10,000 results. Use pagination or filters to narrow results.`

The Presenter validates, truncates, and strips undeclared fields — all in RAM before the response reaches the wire.

---

## Stale Data After Mutations {#stale-data}

### The Problem

The agent reads a project, updates it, but then acts on the cached (stale) version of the data. The AI doesn't know the data changed.

### How MCP Fusion Solves It

**State Sync** — RFC 7234-inspired cache invalidation at the protocol layer:

```typescript
export default f.mutation('projects.update')
  .describe('Update a project')
  .invalidates('projects.*', 'tasks.*')
  .withString('id', 'Project ID')
  .withString('name', 'New name')
  .handle(async (input, ctx) => {
    return ctx.db.projects.update({
      where: { id: input.id },
      data: { name: input.name },
    });
  });
```

After the mutation succeeds, the agent receives: `[System: Cache invalidated for projects.*, tasks.* — caused by projects.update]`. The AI knows to re-fetch before making further decisions.

For queries, declare data freshness:

```typescript
f.query('countries.list').cached().handle(...);  // immutable — safe to cache forever
f.query('tasks.list').stale().handle(...);        // volatile — always re-fetch
```

---

## Blind Retry Loops {#blind-retries}

### The Problem

An agent calls `billing.charge` with an invalid invoice ID. The raw MCP server returns `"Error: not found"`. The agent retries with the same ID. And again. And again. 3 retries wasted — and the agent still doesn't know what to do.

### How MCP Fusion Solves It

**Self-Healing Errors** with structured recovery instructions:

```typescript
export default f.mutation('billing.charge')
  .describe('Charge an invoice')
  .withString('invoice_id', 'Invoice ID')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
    });

    if (!invoice) {
      return f.error('NOT_FOUND', `Invoice "${input.invoice_id}" not found`)
        .suggest('Use billing.list_invoices to find valid IDs, then retry.')
        .actions('billing.list_invoices');
    }

    if (invoice.status === 'paid') {
      return f.error('CONFLICT', `Invoice "${input.invoice_id}" is already paid`)
        .suggest('No action needed. The invoice is settled.');
    }

    return ctx.payments.charge(invoice);
  });
```

The AI receives structured XML with the exact next step:

```xml
<tool_error code="NOT_FOUND" severity="error">
  <message>Invoice "INV-999" not found</message>
  <recovery>Use billing.list_invoices to find valid IDs, then retry.</recovery>
  <available_actions>
    <action>billing.list_invoices</action>
  </available_actions>
</tool_error>
```

The agent calls `billing.list_invoices`, finds the correct ID, and retries successfully — on the first attempt.

---

## Data Leaking to the LLM {#data-leaking}

### The Problem

A handler returns a full database record: password hash, internal flags, tenant IDs, API keys. All of it reaches the LLM context window — a privacy and security nightmare.

### How MCP Fusion Solves It

**Presenter Egress Firewall** — Zod `.strip()` validation removes undeclared fields in RAM before the response is serialized:

```typescript
const UserPresenter = createPresenter('User')
  .schema({
    id:    t.string,
    name:  t.string,
    email: t.string,
    role:  t.enum('admin', 'member', 'guest'),
  })
  .rules(['NEVER expose internal IDs or password hashes.']);
```

The handler can return the full database object — `{ id, name, email, role, password_hash, tenant_id, internal_flags }` — and the Presenter strips it to `{ id, name, email, role }`. The LLM never sees `password_hash`, `tenant_id`, or `internal_flags`.

---

## Race Conditions on Destructive Operations {#race-conditions}

### The Problem

Two concurrent requests: one deletes user `#42`, the other updates user `#42`. Without serialization, the update succeeds against a ghost record — or worse, re-creates a partial entry.

### How MCP Fusion Solves It

**Mutation Serializer** — zero-config for all `f.mutation()` tools:

```typescript
export default f.mutation('users.delete')
  .describe('Delete a user permanently')
  .withString('id', 'User ID')
  .handle(async (input, ctx) => {
    await ctx.db.user.delete({ where: { id: input.id } });
    return { deleted: input.id };
  });
```

The `MutationSerializer` serializes all destructive operations per action key:

```text
delete_user("42") → executes immediately
update_user("42") → waits for delete to complete → then executes
list_users()      → runs in parallel (readOnly — not serialized)
```

Promise-chaining per action key. No external locks. No shared memory. Zero overhead for read-only operations. Automatic garbage collection of completed chains.

---

## Summary

| Issue | Root Cause | MCP Fusion Mechanism |
|---|---|---|
| Partial failure in multi-step ops | No transaction across tool calls | Compose as single tool with manual compensation |
| Parameter hallucination | LLM generates invalid schema | Zod `.strict()` rejects undeclared fields |
| Thundering herd | LLM fires N identical calls | `ConcurrencyGuard` + `MutationSerializer` |
| Context window overflow | Unbounded response size | Presenter `.limit()` with system guidance |
| Stale data after mutations | No invalidation signal | State Sync `.invalidates()` |
| Blind retry loops | No recovery instructions in errors | `f.error()` with `.suggest()` and `.actions()` |
| Data leaking to LLM | No egress filtering | Presenter Egress Firewall (Zod `.strip()`) |
| Race conditions | Concurrent destructive mutations | `MutationSerializer` (automatic for mutations) |

> [!IMPORTANT]
> These are not edge cases — they are the **default behavior** of AI agents interacting with any MCP server. Building a production-grade MCP server without addressing them is building a system designed to fail.
