/**
 * StateMachineGate — Temporal Anti-Hallucination Engine
 *
 * Zero-hallucination tool ordering via finite state machines.
 * Tools bound to FSM states are **physically removed** from
 * `tools/list` when the current state doesn't match — the LLM
 * cannot call what doesn't exist in its reality.
 *
 * Powered by XState v5 (optional peer dependency, lazy-loaded).
 *
 * @example
 * ```typescript
 * const gate = new StateMachineGate({
 *     id: 'checkout',
 *     initial: 'empty',
 *     states: {
 *         empty:     { on: { ADD_ITEM: 'has_items' } },
 *         has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
 *         payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
 *         confirmed: { on: { RESET: 'empty' } },
 *     },
 * });
 *
 * gate.bindTool('cart_add_item', ['empty', 'has_items'], 'ADD_ITEM');
 * gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
 * gate.bindTool('cart_pay', ['payment'], 'PAY');
 * ```
 *
 * ## Architecture
 *
 * ```
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Boot: StateMachineGate(config)                      │
 *   │                                                      │
 *   │  XState createMachine() → createActor() → .start()   │
 *   │       │                                              │
 *   │       ▼                                              │
 *   │  tools/list request                                  │
 *   │       │                                              │
 *   │       ▼                                              │
 *   │  gate.getVisibleTools(allTools)                      │
 *   │  → filter by current FSM state                       │
 *   │  → return only allowed tools                         │
 *   │       │                                              │
 *   │       ▼                                              │
 *   │  tools/call succeeds                                 │
 *   │  → gate.transition(event)                            │
 *   │  → FSM advances → list_changed notification          │
 *   └──────────────────────────────────────────────────────┘
 * ```
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

/**
 * Configuration for a finite state machine definition.
 *
 * Uses the same shape as XState v5 `createMachine()` config,
 * but only the subset needed for tool gating.
 */
export interface FsmConfig {
    /** Unique identifier for this state machine */
    id?: string;
    /** Initial state when a new session starts */
    initial: string;
    /** State definitions with event transitions */
    states: Record<string, {
        /** Events that trigger transitions: `{ EVENT_NAME: 'target_state' }` */
        on?: Record<string, string>;
        /** Set to `'final'` to mark a terminal state */
        type?: 'final';
    }>;
}

/**
 * Binding between a tool name and FSM state visibility.
 *
 * @internal
 */
interface FsmToolBinding {
    /** FSM states where this tool is visible in `tools/list` */
    allowedStates: Set<string>;
    /** Event to send to the FSM on successful execution (optional) */
    transitionEvent?: string;
}

/**
 * External state store for serverless/edge deployments.
 *
 * When MCP runs over Streamable HTTP (Vercel, Cloudflare Workers),
 * there is no persistent process — FSM state must be externalized.
 * The `sessionId` comes from the `Mcp-Session-Id` header.
 *
 * @example
 * ```typescript
 * const fsmStore: FsmStateStore = {
 *     load: async (sessionId) => {
 *         const data = await redis.get(`fsm:${sessionId}`);
 *         return data ? JSON.parse(data) : undefined;
 *     },
 *     save: async (sessionId, snapshot) => {
 *         await redis.set(`fsm:${sessionId}`, JSON.stringify(snapshot), { EX: 3600 });
 *     },
 * };
 * ```
 */
export interface FsmStateStore {
    /** Load persisted FSM state for a session. Returns `undefined` for new sessions. */
    load(sessionId: string): Promise<FsmSnapshot | undefined>;
    /** Save FSM state after a transition. */
    save(sessionId: string, snapshot: FsmSnapshot): Promise<void>;
}

/**
 * Serializable FSM state snapshot for persistence.
 */
export interface FsmSnapshot {
    /** Current FSM state value */
    state: string;
    /** Timestamp of last transition */
    updatedAt: number;
}

/**
 * Result of a state transition attempt.
 */
export interface TransitionResult {
    /** Whether the FSM state actually changed */
    changed: boolean;
    /** The FSM state before the transition */
    previousState: string;
    /** The FSM state after the transition */
    currentState: string;
}

// ── Lazy XState Loading ──────────────────────────────────

/** Cached XState module reference */
let xstateModule: typeof import('xstate') | null = null;
/** Whether we already attempted to load XState */
let xstateLoadAttempted = false;

/**
 * Lazily load the `xstate` module.
 *
 * Returns `null` if `xstate` is not installed — the framework
 * degrades gracefully (all tools remain visible, no gating).
 *
 * @internal
 */
async function loadXState(): Promise<typeof import('xstate') | null> {
    if (xstateLoadAttempted) return xstateModule;
    xstateLoadAttempted = true;

    try {
        xstateModule = await import('xstate');
        return xstateModule;
    } catch {
        return null;
    }
}

/**
 * Pre-load `xstate` at boot time (optional optimization).
 *
 * Call during server startup to avoid the first-use dynamic import latency.
 * Returns `true` if xstate is available, `false` otherwise.
 *
 * @example
 * ```typescript
 * import { initFsmEngine } from '@vinkius-core/mcp-fusion';
 * const available = await initFsmEngine();
 * if (!available) console.warn('xstate not installed — FSM gating disabled');
 * ```
 */
export async function initFsmEngine(): Promise<boolean> {
    return (await loadXState()) !== null;
}

// ── StateMachineGate ─────────────────────────────────────

/**
 * Temporal Anti-Hallucination Engine.
 *
 * Wraps an XState v5 finite state machine and controls which MCP tools
 * are visible to the LLM based on the current workflow state.
 *
 * **Hard constraint**: Tools not bound to the current state are removed
 * from `tools/list` entirely — the LLM physically cannot call them.
 *
 * **Soft constraint**: `suggestActions` (HATEOAS) continues to recommend
 * the best next action within the visible set. Zero conflict.
 */
export class StateMachineGate {
    private readonly _config: FsmConfig;
    private readonly _bindings = new Map<string, FsmToolBinding>();
    private readonly _transitionCallbacks: Array<() => void> = [];
    private _actor: import('xstate').Actor | null = null;
    private _currentState: string;
    private _initialized = false;

    /**
     * @param config - FSM definition (states, transitions, initial state)
     */
    constructor(config: FsmConfig) {
        this._config = config;
        this._currentState = config.initial;
    }

    // ── Initialization ───────────────────────────────────

    /**
     * Initialize the XState actor (lazy-loaded).
     *
     * Called automatically on first use. Can be called explicitly
     * at boot time for eager initialization.
     *
     * @returns `true` if XState is available and the actor started
     */
    async init(): Promise<boolean> {
        if (this._initialized) return this._actor !== null;

        const xstate = await loadXState();
        if (!xstate) {
            this._initialized = true;
            return false;
        }

        try {
            const machine = xstate.createMachine(this._config);
            this._actor = xstate.createActor(machine);
            this._actor.subscribe((snapshot) => {
                const newState = typeof snapshot.value === 'string'
                    ? snapshot.value
                    : Object.keys(snapshot.value)[0] ?? this._config.initial;

                if (newState !== this._currentState) {
                    this._currentState = newState;
                    for (const cb of this._transitionCallbacks) {
                        cb();
                    }
                }
            });
            this._actor.start();
            this._initialized = true;
            return true;
        } catch {
            this._initialized = true;
            return false;
        }
    }

    // ── Tool Binding ─────────────────────────────────────

    /**
     * Bind a tool to specific FSM states.
     *
     * The tool will only appear in `tools/list` when the FSM
     * is in one of the specified states.
     *
     * @param toolName - MCP tool name (flat: `cart_add_item`, grouped: `cart`)
     * @param allowedStates - FSM states where this tool is visible
     * @param transitionEvent - Event to send on successful execution (optional)
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * gate.bindTool('cart_add_item', ['empty', 'has_items'], 'ADD_ITEM');
     * gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
     * ```
     */
    bindTool(toolName: string, allowedStates: string[], transitionEvent?: string): StateMachineGate {
        const binding: FsmToolBinding = {
            allowedStates: new Set(allowedStates),
        };
        if (transitionEvent !== undefined) binding.transitionEvent = transitionEvent;
        this._bindings.set(toolName, binding);
        return this;
    }

    // ── State Queries ────────────────────────────────────

    /**
     * Get the current FSM state.
     */
    get currentState(): string {
        return this._currentState;
    }

    /**
     * Check if a specific tool is allowed in the current FSM state.
     *
     * Tools **not** registered via `bindTool()` are always visible
     * (ungated — they don't participate in FSM gating).
     *
     * @param toolName - MCP tool name to check
     * @returns `true` if the tool should appear in `tools/list`
     */
    isToolAllowed(toolName: string): boolean {
        const binding = this._bindings.get(toolName);
        if (!binding) return true; // Ungated tools are always visible
        return binding.allowedStates.has(this._currentState);
    }

    /**
     * Filter a list of tool names by the current FSM state.
     *
     * @param toolNames - All registered tool names
     * @returns Only the tools allowed in the current state
     */
    getVisibleToolNames(toolNames: string[]): string[] {
        return toolNames.filter(name => this.isToolAllowed(name));
    }

    /**
     * Get the transition event for a tool (if any).
     *
     * @param toolName - MCP tool name
     * @returns The event string, or `undefined` if no transition is bound
     */
    getTransitionEvent(toolName: string): string | undefined {
        return this._bindings.get(toolName)?.transitionEvent;
    }

    /**
     * Check if any tools are bound to this FSM gate.
     *
     * @returns `true` if at least one tool is state-gated
     */
    get hasBindings(): boolean {
        return this._bindings.size > 0;
    }

    // ── State Transitions ────────────────────────────────

    /**
     * Send an event to the FSM, potentially triggering a state transition.
     *
     * @param eventType - The event to send (e.g. `'ADD_ITEM'`, `'CHECKOUT'`)
     * @returns Result indicating whether the state changed
     */
    async transition(eventType: string): Promise<TransitionResult> {
        const previousState = this._currentState;

        // Ensure initialized
        if (!this._initialized) {
            await this.init();
        }

        if (this._actor) {
            // XState actor handles the transition
            this._actor.send({ type: eventType });
        } else {
            // Fallback: manual transition without XState
            this._transitionManual(eventType);
        }

        return {
            changed: this._currentState !== previousState,
            previousState,
            currentState: this._currentState,
        };
    }

    /**
     * Manual state transition fallback when XState is not installed.
     *
     * Reads the FSM config directly to determine the next state.
     * This provides basic FSM gating even without `xstate` installed,
     * though without XState's guards, actions, and advanced features.
     *
     * @internal
     */
    private _transitionManual(eventType: string): void {
        const stateConfig = this._config.states[this._currentState];
        if (!stateConfig?.on) return;

        const target = stateConfig.on[eventType];
        if (target && this._config.states[target]) {
            const previousState = this._currentState;
            this._currentState = target;
            if (previousState !== this._currentState) {
                for (const cb of this._transitionCallbacks) {
                    cb();
                }
            }
        }
    }

    // ── Transition Callbacks ─────────────────────────────

    /**
     * Register a callback that fires when the FSM state changes.
     *
     * Used by `ServerAttachment` to emit `notifications/tools/list_changed`
     * when a state transition makes tools appear or disappear.
     *
     * @param callback - Function to call on state change
     * @returns Unsubscribe function
     */
    onTransition(callback: () => void): () => void {
        this._transitionCallbacks.push(callback);
        return () => {
            const idx = this._transitionCallbacks.indexOf(callback);
            if (idx >= 0) this._transitionCallbacks.splice(idx, 1);
        };
    }

    // ── Persistence (Serverless/Edge) ────────────────────

    /**
     * Create a serializable snapshot of the current FSM state.
     *
     * Used with `FsmStateStore` for serverless deployments where
     * FSM state must survive across request boundaries.
     *
     * @returns Serializable snapshot
     */
    snapshot(): FsmSnapshot {
        return {
            state: this._currentState,
            updatedAt: Date.now(),
        };
    }

    /**
     * Restore FSM state from a persisted snapshot.
     *
     * @param snap - Previously saved snapshot
     */
    restore(snap: FsmSnapshot): void {
        if (this._config.states[snap.state]) {
            this._currentState = snap.state;
        }
    }

    // ── Cleanup ──────────────────────────────────────────

    /**
     * Stop the XState actor and release resources.
     */
    dispose(): void {
        if (this._actor) {
            this._actor.stop();
            this._actor = null;
        }
        this._transitionCallbacks.length = 0;
    }
}
