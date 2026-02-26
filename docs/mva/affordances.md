# Agentic Affordances & HATEOAS for AI

After receiving data, every AI agent faces the same question: *"What should I do next?"*

Without guidance, agents hallucinate tool names. They call tools that don't exist. They skip valid actions because they don't know those actions are available. Each wrong decision is a wasted round-trip — tokens spent, latency added, accuracy degraded.

**Agentic Affordances** solve this by embedding explicit, state-driven next-action hints directly in the response. The agent doesn't guess. It reads the affordances and acts.

## The HATEOAS Lineage

The concept originates from REST's **HATEOAS** (Hypermedia as the Engine of Application State) — the principle that the server should tell the client what it can do next by embedding links in the response.

The principle is identical: **the server tells the client what's possible.** But the implementation is fundamentally different:

| Aspect | REST HATEOAS | MVA Affordances |
|---|---|---|
| **Target consumer** | Browser / HTTP client | AI agent / LLM |
| **Format** | URLs to HTTP endpoints | Tool names with semantic reasons |
| **State-driven** | Sometimes (link presence based on state) | Always (function receives current data) |
| **Semantic context** | None (just a URL) | Reason string explains *why* the action is relevant |
| **Protocol** | HTTP | MCP (Model Context Protocol) |
| **Discovery** | Client follows links | Agent reads `[SYSTEM HINT]` block |

## The API: `.suggestActions()`

`.suggestActions()` is a method on the Presenter that receives the current data (and optionally the request context) and returns an array of suggested actions.

### Basic Usage

```typescript
const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: invoiceSchema,
    suggestActions: (invoice) => {
        if (invoice.status === 'pending') {
            return [
                { tool: 'billing.pay', reason: 'Process immediate payment' },
                { tool: 'billing.send_reminder', reason: 'Send payment reminder to client' },
            ];
        }
        if (invoice.status === 'overdue') {
            return [
                { tool: 'billing.escalate', reason: 'Escalate to collections' },
                { tool: 'billing.send_final_notice', reason: 'Send final payment notice' },
            ];
        }
        if (invoice.status === 'paid') {
            return [
                { tool: 'billing.archive', reason: 'Archive completed invoice' },
                { tool: 'reports.generate_receipt', reason: 'Generate payment receipt' },
            ];
        }
        return [];
    },
});
```

The agent receives one of these blocks depending on the invoice's state:

```text
// When status === 'pending':
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.pay: Process immediate payment
  → billing.send_reminder: Send payment reminder to client

// When status === 'overdue':
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.escalate: Escalate to collections
  → billing.send_final_notice: Send final payment notice

// When status === 'paid':
[SYSTEM HINT]: Based on the current state, recommended next tools:
  → billing.archive: Archive completed invoice
  → reports.generate_receipt: Generate payment receipt
```

### Context-Aware Affordances

Affordances can use the request context for RBAC-aware suggestions:

```typescript
.suggestActions((invoice, ctx) => {
    const actions = [];

    if (invoice.status === 'pending') {
        actions.push({ tool: 'billing.pay', reason: 'Process payment' });

        // Only admins can apply discounts
        if (ctx?.user?.role === 'admin') {
            actions.push({
                tool: 'billing.apply_discount',
                reason: 'Apply a discount before payment',
            });
        }
    }

    if (invoice.status === 'overdue') {
        actions.push({ tool: 'billing.escalate', reason: 'Escalate to collections' });

        // Only finance team can write off debt
        if (ctx?.user?.permissions?.includes('finance:write-off')) {
            actions.push({
                tool: 'billing.write_off',
                reason: 'Write off as bad debt',
            });
        }
    }

    return actions;
})
```

A regular user sees: `→ billing.pay`. An admin sees: `→ billing.pay` + `→ billing.apply_discount`. The affordances adapt to the actor's permissions.

## Emergent Workflows

The most powerful property of affordances is that **multi-step workflows emerge from individual data-driven hints**. You don't need to hardcode a workflow engine. The agent follows affordances one step at a time, and the correct workflow materializes.

### Example: Invoice Resolution Workflow

Consider an AI agent tasked with resolving overdue invoices. The workflow is not coded anywhere. It emerges from affordances on three Presenters:

```typescript
// Step 1: Agent calls billing.list_invoices with status: 'overdue'
// InvoicePresenter suggests:
//   → billing.escalate (for each overdue invoice)
//   → billing.send_final_notice

// Step 2: Agent calls billing.escalate for INV-001
// EscalationPresenter suggests:
//   → notifications.send (notify the account manager)
//   → billing.get_invoice (check updated status)

// Step 3: Agent calls notifications.send
// NotificationPresenter suggests:
//   → billing.list_invoices (continue processing remaining invoices)

// Step 4: Agent calls billing.list_invoices again
// ...cycle continues for next overdue invoice
```

No workflow engine. No state machine. No orchestration layer. The agent simply follows the affordances, and the correct workflow emerges from the data state transitions.

## Affordances vs. Static Tool Lists

Without affordances, the agent must choose from all available tools based on name matching and context guessing:

```text
Available tools: billing.list, billing.get, billing.create, billing.pay,
billing.refund, billing.archive, billing.escalate, billing.send_reminder,
billing.send_final_notice, billing.apply_discount, billing.write_off,
reports.generate, reports.export, users.list, users.get, ...

Agent: "The invoice is pending... I think I should call... billing.process_payment?"
→ Tool does not exist. Error. Retry.

Agent: "Maybe billing.complete_payment?"
→ Tool does not exist. Error. Retry.

Agent: "billing.pay?"
→ ✅ Success! (Third attempt. Two wasted round-trips.)
```

With affordances:

```text
Received: Invoice INV-001 (status: pending)
[SYSTEM HINT]: → billing.pay: Process immediate payment

Agent: "I'll call billing.pay."
→ ✅ Success! (First attempt. Zero wasted round-trips.)
```

**The cost difference compounds.** Every avoided retry saves input tokens (tool schemas + prompt) + output tokens (agent reasoning) + latency. In a 10-step workflow, avoiding even one retry per step saves 10 full round-trips.

## The Affordance Contract

Each affordance is a simple object:

```typescript
interface ActionSuggestion {
    tool: string;    // Fully-qualified tool name (e.g., 'billing.pay')
    reason: string;  // Human-readable explanation (e.g., 'Process payment')
}
```

**The `tool` field** must match an actual tool registered in the `ToolRegistry`. This is not validated at compile time (the Presenter doesn't know about the registry), so it's the developer's responsibility to keep affordances in sync with available tools.

**The `reason` field** is critical. It provides semantic context that helps the agent choose between multiple affordances:

```typescript
// ❌ Vague reasons — the agent doesn't know which to pick
{ tool: 'billing.pay', reason: 'Pay' }
{ tool: 'billing.send_reminder', reason: 'Remind' }

// ✅ Descriptive reasons — the agent can make an informed decision
{ tool: 'billing.pay', reason: 'Process immediate payment for this pending invoice' }
{ tool: 'billing.send_reminder', reason: 'Send email reminder to client before escalating' }
```

## Patterns

### Pattern: Empty Affordances for Terminal States

When no actions are appropriate, return an empty array. This signals to the agent that the current entity is in a terminal state:

```typescript
.suggestActions((invoice) => {
    if (invoice.status === 'cancelled') return [];  // Terminal — nothing to do
    if (invoice.status === 'refunded') return [];   // Terminal — nothing to do
    // ...
})
```

### Pattern: Cross-Domain Affordances

Affordances can suggest tools from other domains. This is how cross-domain workflows emerge:

```typescript
// In TaskPresenter:
.suggestActions((task) => {
    if (task.status === 'completed') {
        return [
            { tool: 'tasks.close', reason: 'Close this task' },
            { tool: 'sprints.refresh_velocity', reason: 'Recalculate sprint velocity after completion' },
            { tool: 'notifications.send', reason: 'Notify the team about task completion' },
        ];
    }
    return [];
})
```

The task Presenter suggests sprint and notification tools. The agent follows these cross-domain hints, building a cohesive workflow across multiple domains.

### Pattern: Conditional Affordances by Data Value

Use the data to compute precise affordances:

```typescript
.suggestActions((invoice) => {
    const actions = [];

    if (invoice.amount_cents > 100000) { // Over $1,000
        actions.push({
            tool: 'billing.request_approval',
            reason: 'High-value invoice requires manager approval before payment',
        });
    } else {
        actions.push({
            tool: 'billing.pay',
            reason: 'Process immediate payment',
        });
    }

    return actions;
})
```
