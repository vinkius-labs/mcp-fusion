# Transactional Workflows

::: info Prerequisites
Install MCP Fusion before following this recipe: `npm install @vinkius-core/mcp-fusion @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx fusion create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [The Problem](#problem)
- [Solution: Compose Into a Single Tool](#solution)
- [Pattern 1: Sequential with Compensation](#sequential)
- [Pattern 2: Check-Then-Act](#check-then-act)
- [Pattern 3: Idempotent Retry-Safe Operations](#idempotent)
- [Combining with Runtime Guards](#runtime-guards)
- [Best Practices](#best-practices)

## Introduction {#introduction}

AI agents are stochastic. When a business workflow requires multiple steps — create a user, charge a card, send an email — the agent treats each step as an independent tool call. If any step fails, the previous steps have already executed. The result: corrupted data, phantom charges, and orphaned records.

MCP Fusion solves this **without any new abstraction**. The key insight: don't expose multi-step workflows as separate tools. Compose them into a single `f.mutation()` with manual compensation logic in the handler.

## The Problem {#problem}

A raw MCP server exposes three independent tools:

```
Agent → users.create   ✅ → DB has a new user
Agent → billing.charge  ✅ → Stripe charged the card
Agent → email.send      ❌ → Zod fails 3× → timeout
```

The agent made 3 tool calls. The first two succeeded, the third failed. The customer was charged but never received access. The server has no way to compensate — those tool calls are independent, fire-and-forget operations.

This is not an edge case. It is the **default behavior** of every AI agent interacting with independent MCP tools.

## Solution: Compose Into a Single Tool {#solution}

Instead of 3 tools, expose **1 tool** that handles the entire workflow. The agent makes one call. The server orchestrates all steps internally. If any step fails, the handler compensates all previous steps before returning a self-healing error.

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

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

    // Step 2: Charge card
    let charge;
    try {
      charge = await ctx.payments.charge({
        customerId: user.stripeId,
        amount: input.plan_cents,
      });
    } catch (err) {
      // Compensate step 1
      await ctx.db.user.delete({ where: { id: user.id } });
      return f.error('PAYMENT_FAILED', 'Card charge failed')
        .suggest('Verify the payment method and retry onboarding.provision')
        .actions('onboarding.provision')
        .details({ reason: String(err) });
    }

    // Step 3: Send welcome email
    try {
      await ctx.mailer.send({
        to: input.email,
        template: 'welcome',
        data: { userId: user.id },
      });
    } catch (err) {
      // Compensate steps 1 + 2
      await ctx.payments.refund({ chargeId: charge.id });
      await ctx.db.user.delete({ where: { id: user.id } });
      return f.error('EMAIL_FAILED', 'Welcome email could not be sent')
        .suggest('Email service may be temporarily unavailable. Retry in 30 seconds.')
        .actions('onboarding.provision')
        .retryAfter(30);
    }

    // All succeeded — activate the account
    await ctx.db.user.update({
      where: { id: user.id },
      data: { status: 'active' },
    });

    return { userId: user.id, chargeId: charge.id, status: 'active' };
  });
```

The agent calls **one tool**. If any step fails, the handler compensates everything and returns a self-healing error. No corrupted state. No orphaned records.

> [!IMPORTANT]
> The agent doesn't know that 3 operations happen internally. It sees one tool, one input, one response. Atomicity is a property of the server, not the client.

## Pattern 1: Sequential with Compensation {#sequential}

The most common pattern. Each step depends on the previous, and each has a compensation action for rollback:

```typescript
export default f.mutation('subscription.activate')
  .describe('Activate a subscription with payment and notifications')
  .withString('user_id', 'User ID')
  .withString('plan_id', 'Plan ID')
  .destructive()
  .handle(async (input, ctx) => {
    // ── Step 1: Create subscription record ──
    const sub = await ctx.db.subscription.create({
      data: {
        userId: input.user_id,
        planId: input.plan_id,
        status: 'provisioning',
      },
    });

    // ── Step 2: Set up recurring billing ──
    let billing;
    try {
      billing = await ctx.payments.createSubscription({
        customerId: input.user_id,
        priceId: input.plan_id,
      });
    } catch (err) {
      await ctx.db.subscription.delete({ where: { id: sub.id } });
      return f.error('BILLING_SETUP_FAILED', 'Could not set up recurring billing')
        .suggest('Payment provider may be unavailable. Retry shortly.')
        .actions('subscription.activate')
        .retryAfter(10);
    }

    // ── Step 3: Grant feature access ──
    try {
      await ctx.features.grant(input.user_id, input.plan_id);
    } catch (err) {
      await ctx.payments.cancelSubscription({ id: billing.id });
      await ctx.db.subscription.delete({ where: { id: sub.id } });
      return f.error('FEATURE_GRANT_FAILED', 'Could not grant plan features')
        .suggest('Internal error. Retry or escalate to support.')
        .actions('subscription.activate')
        .critical();
    }

    // ── All succeeded ──
    await ctx.db.subscription.update({
      where: { id: sub.id },
      data: { status: 'active', billingId: billing.id },
    });

    return { subscriptionId: sub.id, status: 'active' };
  });
```

Each `catch` block undoes all previous steps in reverse order, then returns a `f.error()` with recovery instructions specific to the failure point.

## Pattern 2: Check-Then-Act {#check-then-act}

Validate all preconditions **before** making any changes. This eliminates the need for compensation in most validation failures:

```typescript
export default f.mutation('billing.process_refund')
  .describe('Process a full refund for an invoice')
  .withString('invoice_id', 'Invoice ID to refund')
  .destructive()
  .handle(async (input, ctx) => {
    // ── Preflight checks (no side effects) ──
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
    });

    if (!invoice) {
      return f.error('NOT_FOUND', `Invoice "${input.invoice_id}" not found`)
        .suggest('Use billing.list_invoices to find valid IDs.')
        .actions('billing.list_invoices');
    }

    if (invoice.status !== 'paid') {
      return f.error('CONFLICT', `Invoice is "${invoice.status}" — only paid invoices can be refunded`)
        .suggest(`Current status: ${invoice.status}. No action needed.`);
    }

    if (invoice.refundedAt) {
      return f.error('CONFLICT', 'Invoice was already refunded')
        .suggest('No action needed.')
        .details({ refundedAt: invoice.refundedAt.toISOString() });
    }

    // ── All checks passed — execute atomically ──
    const refund = await ctx.payments.refund({ chargeId: invoice.chargeId });

    await ctx.db.invoices.update({
      where: { id: invoice.id },
      data: { status: 'refunded', refundedAt: new Date(), refundId: refund.id },
    });

    // Revoke access granted by this purchase
    await ctx.features.revoke(invoice.userId, invoice.planId);

    return { refundId: refund.id, status: 'refunded' };
  });
```

> [!TIP]
> Place all validation before the first mutation. If every business rule check happens before the first `await ctx.db.update(...)`, you never need compensation for validation errors — which are the most common failure mode with AI agents.

## Pattern 3: Idempotent Retry-Safe Operations {#idempotent}

Design workflows to be safely retried without double-execution. Use idempotency keys or status checks:

```typescript
export default f.mutation('orders.fulfill')
  .describe('Fulfill a pending order')
  .withString('order_id', 'Order ID')
  .idempotent()
  .handle(async (input, ctx) => {
    const order = await ctx.db.orders.findUnique({
      where: { id: input.order_id },
    });

    if (!order) {
      return f.error('NOT_FOUND', `Order "${input.order_id}" not found`)
        .suggest('Use orders.list to find valid order IDs.')
        .actions('orders.list');
    }

    // Idempotency: already fulfilled — return success without re-executing
    if (order.status === 'fulfilled') {
      return {
        orderId: order.id,
        status: 'fulfilled',
        note: 'Already fulfilled — no action taken.',
      };
    }

    if (order.status !== 'pending') {
      return f.error('CONFLICT', `Order is "${order.status}" — only pending orders can be fulfilled`)
        .suggest('Check order status with orders.get before retrying.');
    }

    // Execute fulfillment
    await ctx.shipping.createShipment({ orderId: order.id });
    await ctx.db.orders.update({
      where: { id: order.id },
      data: { status: 'fulfilled', fulfilledAt: new Date() },
    });

    return { orderId: order.id, status: 'fulfilled' };
  });
```

The `.idempotent()` annotation tells the LLM this operation is safe to retry. The handler enforces it by checking the current status before executing.

## Combining with Runtime Guards {#runtime-guards}

Layer the [concurrency guard](/cookbook/runtime-guards) on top for defense in depth:

```typescript
export default f.mutation('onboarding.provision')
  .describe('Provision a new user account')
  .concurrency({ maxActive: 3, maxQueue: 10 })
  .withString('email', 'User email')
  .withNumber('plan_cents', 'Plan price in cents')
  .destructive()
  .invalidates('users.*', 'billing.*')
  .handle(async (input, ctx) => {
    // ... sequential compensation pattern
  });
```

| Guard | What it prevents |
|---|---|
| `.destructive()` | `MutationSerializer` serializes concurrent calls to this tool |
| `.concurrency()` | At most 3 onboarding flows run simultaneously |
| `.invalidates()` | After success, agent knows users and billing data is stale |
| `f.error().retryAfter()` | On failure, agent waits before retrying |

## Best Practices {#best-practices}

1. **One tool per business workflow** — if it's a workflow, it's a single tool. Don't expose internal steps.

2. **Compensate in reverse order** — undo the most recent step first, working backwards.

3. **Check-then-act** — validate all preconditions before the first mutation to minimize compensation paths.

4. **Use `f.error()` with specific diagnostics** — different failure points get different error codes, suggestions, and retry policies.

5. **Mark as `.destructive()`** — the `MutationSerializer` automatically prevents concurrent execution of the same workflow.

6. **Add `.invalidates()`** — after a successful workflow, stale-data signals tell the agent to re-fetch affected domains.

7. **Design for idempotency** — if the agent retries, the handler should detect the previous execution and return success without re-executing.

8. **Use `.concurrency()` for rate-sensitive workflows** — billing and payment workflows should limit concurrent executions.

> [!WARNING]
> Never expose the individual steps of a business workflow as separate tools. The AI will call them independently, and **you cannot guarantee ordering or atomicity across separate tool calls**. This is the single most common source of data corruption in agentic systems.
