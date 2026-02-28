---
outline: deep
---

# FSM State Gate — Temporal Anti-Hallucination

LLMs are chaotic. Even with HATEOAS `suggestActions`, a model can ignore the suggestion and call `cart.pay` with an empty cart. Zod validates the **format** — but the **timing** (state) is wrong. The AI enters an error loop.

MCP Fusion's FSM State Gate makes temporal hallucination **physically impossible**: if the workflow state is `empty`, the `cart.pay` tool doesn't exist in `tools/list`. The LLM literally cannot call it. When the user adds an item, the FSM advances, the framework emits `notifications/tools/list_changed`, and `cart.pay` magically appears.

> [!IMPORTANT]
> **The first framework where it is physically impossible for an AI to execute tools out of order.**
> You don't "suggest" the right order — you *enforce* it at the protocol level.

## The Thesis: Three Layers of Anti-Hallucination

MCP Fusion now has three complementary layers that, together, make temporal hallucination nearly impossible:

| Layer | Tech | What It Does |
|---|---|---|
| **Layer 1 — Format** | Zod / Standard Schema | Validates the **shape** of input data |
| **Layer 2 — Guidance** | `suggestActions` (HATEOAS) | **Suggests** the next tool — LLM can ignore |
| **Layer 3 — Gate** | FSM State Gate (XState) | **Physically removes** tools from `tools/list` — LLM cannot call them |

State Sync (`.invalidates()`, `.cached()`) tells the LLM *when data is stale*. The FSM State Gate tells the LLM *what it can do right now*. They are complementary — not competing.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Boot: f.fsm(config) → StateMachineGate                      │
│                                                               │
│  XState v5 createMachine() → createActor() → start()          │
│  (or manual fallback if XState is not installed)              │
│                                                               │
│  ┌─────────────┐   ┌──────────────────┐   ┌───────────────┐ │
│  │ tools/list   │──▸│ isToolAllowed()  │──▸│ Filter tools  │ │
│  │ request      │   │ per FSM state    │   │ → response    │ │
│  └─────────────┘   └──────────────────┘   └───────────────┘ │
│                                                               │
│  ┌─────────────┐   ┌──────────────────┐   ┌───────────────┐ │
│  │ tools/call   │──▸│ transition()     │──▸│ list_changed  │ │
│  │ succeeds     │   │ advance FSM      │   │ notification  │ │
│  └─────────────┘   └──────────────────┘   └───────────────┘ │
│                                                               │
│  ✔ Serverless: snapshot() / restore() + fsmStore             │
│  ✔ Zero overhead when fsm is not configured                  │
└───────────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **Boot** — `f.fsm(config)` creates a `StateMachineGate`. Tools are bound to states via `.bindState()`.
2. **`tools/list`** — The framework calls `gate.isToolAllowed(toolName)` for every registered tool. Unbound tools pass through; bound tools are filtered by the current FSM state.
3. **`tools/call`** — After the handler runs successfully, the framework calls `gate.transition(event)`. If the state changes, the framework emits `notifications/tools/list_changed` — the LLM's client re-fetches the tool list and sees the new tools.
4. **Serverless** — On every request, the FSM state is restored from `fsmStore` (Redis, KV, etc.). After transition, the new state is persisted.

## Installation

`xstate` is an **optional** peer dependency. Install it for full state machine power:

```bash
npm install xstate
```

> **Note:** Without XState, the FSM State Gate uses a built-in manual fallback engine. The manual engine supports the same `FsmConfig` format and is sufficient for simple linear workflows. Install XState when you need parallel states, guards, or advanced statechart features.

## Quick Start

### Step 1 — Define the FSM

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';

interface AppContext { db: PrismaClient; userId: string }
export const f = initFusion<AppContext>();

// Define the checkout workflow
const gate = f.fsm({
    id: 'checkout',
    initial: 'empty',
    states: {
        empty:     { on: { ADD_ITEM: 'has_items' } },
        has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
        payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
        confirmed: { type: 'final' },
    },
});
```

### Step 2 — Bind Tools to States

```typescript
// Visible in 'empty' and 'has_items' — triggers ADD_ITEM on success
const addItem = f.mutation('cart.add_item')
    .describe('Add a product to the cart')
    .bindState(['empty', 'has_items'], 'ADD_ITEM')
    .withString('product_id', 'Product ID')
    .handle(async (input, ctx) => {
        return ctx.db.cartItems.create({ data: { productId: input.product_id } });
    });

// Visible ONLY in 'has_items' — triggers CHECKOUT on success
const checkout = f.mutation('cart.checkout')
    .describe('Proceed to payment')
    .bindState('has_items', 'CHECKOUT')
    .handle(async (input, ctx) => {
        return ctx.db.orders.create({ data: { userId: ctx.userId } });
    });

// Visible ONLY in 'payment' — triggers PAY on success
const pay = f.mutation('cart.pay')
    .describe('Process payment')
    .bindState('payment', 'PAY')
    .withString('payment_method', 'Payment method ID')
    .handle(async (input, ctx) => {
        return ctx.db.payments.process(input.payment_method);
    });

// No .bindState() — visible in ALL states (ungated)
const viewCart = f.query('cart.view')
    .describe('View current cart contents')
    .handle(async (input, ctx) => {
        return ctx.db.cartItems.findMany({ where: { userId: ctx.userId } });
    });
```

### Step 3 — Attach to Server

```typescript
const registry = f.registry();
registry.registerAll(addItem, checkout, pay, viewCart);

registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    fsm: gate, // ← pass the FSM gate
});
```

That's it. The framework handles everything:

| State | Visible Tools |
|---|---|
| `empty` | `cart.add_item`, `cart.view` |
| `has_items` | `cart.add_item`, `cart.checkout`, `cart.view` |
| `payment` | `cart.pay`, `cart.view` |
| `confirmed` | `cart.view` |

## `.bindState()` API

```typescript
.bindState(states: string | string[], transition?: string)
```

| Parameter | Type | Description |
|---|---|---|
| `states` | `string \| string[]` | FSM state(s) where this tool is visible |
| `transition` | `string` (optional) | Event to send to the FSM on successful execution |

When `transition` is provided, the framework automatically calls `gate.transition(event)` after the handler returns a non-error response. If the transition changes the FSM state, `notifications/tools/list_changed` is emitted.

## Serverless / Edge Deployment

MCP is stateless by nature. On platforms like Vercel or Cloudflare Workers, the FSM state must survive across requests. The framework provides `fsmStore` for this:

```typescript
import type { FsmStateStore } from '@vinkius-core/mcp-fusion';

// Redis-backed state store
const fsmStore: FsmStateStore = {
    async load(sessionId: string) {
        const raw = await redis.get(`fsm:${sessionId}`);
        return raw ? JSON.parse(raw) : undefined;
    },
    async save(sessionId: string, snapshot) {
        await redis.set(`fsm:${sessionId}`, JSON.stringify(snapshot), 'EX', 3600);
    },
};

registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
    fsm: gate,
    fsmStore, // ← external persistence
});
```

### How it works

1. On every `tools/list` and `tools/call`, the framework extracts `sessionId` from the request `extra` object (typically `Mcp-Session-Id` from Streamable HTTP transport).
2. Before processing, `fsmStore.load(sessionId)` restores the FSM state.
3. After a successful transition, `fsmStore.save(sessionId, snapshot)` persists the new state.
4. If no `fsmStore` is provided, the FSM state lives in-memory (suitable for stdio/SSE transports).

> [!WARNING]
> **Cloudflare Workers / Vercel Functions**: You MUST provide an `fsmStore` backed by Durable Objects, KV, Upstash Redis, or similar. In-memory state is lost between invocations.

### `FsmStateStore` Interface

```typescript
interface FsmStateStore {
    load(sessionId: string): Promise<FsmSnapshot | undefined>;
    save(sessionId: string, snapshot: FsmSnapshot): Promise<void>;
}

interface FsmSnapshot {
    state: string;
    updatedAt: number;
}
```

## How It Complements `suggestActions`

| Feature | suggestActions (HATEOAS) | FSM State Gate |
|---|---|---|
| **Mechanism** | Soft guidance — "you should call X next" | Hard constraint — "X doesn't exist yet" |
| **LLM can ignore?** | Yes — suggestions are hints | No — tool is physically absent from `tools/list` |
| **Best for** | Optional next steps, contextual shortcuts | Mandatory sequential workflows |
| **Works without?** | Yes | Yes |

Use both together for maximum reliability:

```typescript
const addItem = f.mutation('cart.add_item')
    .bindState(['empty', 'has_items'], 'ADD_ITEM')
    .returns(
        createPresenter('CartItem')
            .schema(cartItemSchema)
            .suggestActions((item) => [
                { tool: 'cart.checkout', reason: 'Ready to pay?' }
            ])
    )
    .handle(async (input, ctx) => { /* ... */ });
```

After `add_item` succeeds:
1. The FSM transitions to `has_items` → `cart.checkout` appears in `tools/list`
2. `suggestActions` hints the LLM to call `cart.checkout` next
3. Double reinforcement — gate + suggestion

## Boot-Time Initialization

For maximum performance, pre-load the XState engine at application bootstrap:

```typescript
import { initFsmEngine } from '@vinkius-core/mcp-fusion';

// Call once at boot — loads xstate into memory
const hasXState = await initFsmEngine();
console.log(`XState available: ${hasXState}`);
```

This ensures the dynamic `import('xstate')` is resolved before the first request, avoiding first-call latency.

## Advanced: Standalone `StateMachineGate`

For custom pipelines or testing, use `StateMachineGate` directly:

```typescript
import { StateMachineGate } from '@vinkius-core/mcp-fusion';

const gate = new StateMachineGate({
    id: 'approval',
    initial: 'draft',
    states: {
        draft:     { on: { SUBMIT: 'review' } },
        review:    { on: { APPROVE: 'approved', REJECT: 'draft' } },
        approved:  { type: 'final' },
    },
});

// Manual binding
gate.bindTool('doc_submit', ['draft'], 'SUBMIT');
gate.bindTool('doc_approve', ['review'], 'APPROVE');
gate.bindTool('doc_reject', ['review'], 'REJECT');

// Check visibility
gate.isToolAllowed('doc_approve'); // false (in 'draft')

// Transition
const result = await gate.transition('SUBMIT');
// → { changed: true, previousState: 'draft', currentState: 'review' }

gate.isToolAllowed('doc_approve'); // true (in 'review')

// Persistence
const snapshot = gate.snapshot();
// → { state: 'review', updatedAt: 1709... }

// Restore from persistence
const gate2 = new StateMachineGate(config);
gate2.restore(snapshot);
```

## Best Practices

### 1. Keep Ungated Tools Ungated

Not every tool needs FSM gating. Tools that are always valid (view, list, search) should remain ungated:

```typescript
// ✔ Good — always visible
const viewCart = f.query('cart.view').handle(/* ... */);

// ✔ Good — gated to specific workflow states
const pay = f.mutation('cart.pay').bindState('payment', 'PAY').handle(/* ... */);
```

### 2. One FSM Per Workflow, Not One FSM Per Server

Use separate FSM instances for independent workflows:

```typescript
const checkoutGate = f.fsm(checkoutConfig);
const approvalGate = f.fsm(approvalConfig);

// Attach the right gate to the right registry
checkoutRegistry.attachToServer(server, { fsm: checkoutGate });
```

### 3. Always Provide `fsmStore` in Serverless

```typescript
// ✘ Dangerous — state lost between invocations
registry.attachToServer(server, { fsm: gate });

// ✔ Safe — state persisted externally
registry.attachToServer(server, { fsm: gate, fsmStore: redisStore });
```

### 4. Test Workflows End-to-End

Use `StateMachineGate` directly in tests to validate workflow correctness:

```typescript
it('should complete checkout flow', async () => {
    const gate = new StateMachineGate(checkoutConfig);
    gate.bindTool('cart_add', ['empty', 'has_items'], 'ADD_ITEM');
    gate.bindTool('cart_pay', ['payment'], 'PAY');

    expect(gate.isToolAllowed('cart_pay')).toBe(false);

    await gate.transition('ADD_ITEM');
    await gate.transition('CHECKOUT');
    expect(gate.isToolAllowed('cart_pay')).toBe(true);

    await gate.transition('PAY');
    expect(gate.currentState).toBe('confirmed');
});
```

## API Reference

### `f.fsm(config)`

```typescript
fsm(config: FsmConfig): StateMachineGate
```

Creates a new `StateMachineGate` instance. The gate manages FSM state and tool visibility.

### `FsmConfig`

```typescript
interface FsmConfig {
    id?: string;
    initial: string;
    states: Record<string, {
        on?: Record<string, string>;
        type?: 'final';
    }>;
}
```

### `StateMachineGate`

| Method | Returns | Description |
|---|---|---|
| `bindTool(name, states, event?)` | `this` | Bind a tool to FSM state(s) with optional transition event |
| `isToolAllowed(name)` | `boolean` | Check if tool is visible in current state |
| `getVisibleToolNames(allTools)` | `string[]` | Filter tool list by current state |
| `getTransitionEvent(name)` | `string \| undefined` | Get the transition event for a tool |
| `transition(event)` | `Promise<TransitionResult>` | Send event to FSM, potentially changing state |
| `onTransition(callback)` | `() => void` | Register callback for state changes; returns unsubscribe |
| `snapshot()` | `FsmSnapshot` | Serialize current state for persistence |
| `restore(snapshot)` | `void` | Restore state from a persisted snapshot |
| `dispose()` | `void` | Clean up callbacks and resources |
| `currentState` | `string` | Current FSM state (getter) |
| `hasBindings` | `boolean` | Whether any tools are bound (getter) |

### `TransitionResult`

```typescript
interface TransitionResult {
    changed: boolean;
    previousState: string;
    currentState: string;
}
```

### `initFsmEngine()`

```typescript
async function initFsmEngine(): Promise<boolean>
```

Pre-loads the `xstate` module into memory. Returns `true` if XState is available, `false` if using the manual fallback.
