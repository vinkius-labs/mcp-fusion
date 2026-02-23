/**
 * MutationSerializer — Per-Action Intent Mutex for Destructive Operations
 *
 * When an LLM hallucinates and fires two `delete_user` calls for the same ID
 * in the same millisecond, this serializer ensures they execute sequentially —
 * not concurrently. Transactional isolation at the framework level.
 *
 * Architecture:
 *   ┌────────────────────────────────────────────────────┐
 *   │  delete_user(id: "42")  ──► serialize("delete")   │
 *   │  delete_user(id: "42")  ──► queue behind first    │
 *   │  list_users()           ──► pass-through (readOnly)│
 *   │  create_user(...)       ──► pass-through (not destr)│
 *   └────────────────────────────────────────────────────┘
 *
 * Mechanism:
 *   Uses promise-chaining per action key. Each destructive call
 *   awaits the previous call's completion before starting.
 *   This is the idiomatic async mutex pattern in JavaScript:
 *   no external locks, no shared memory, no OS primitives.
 *
 * Properties:
 *   - Zero overhead for non-destructive actions (never called)
 *   - O(1) setup per serialized call (promise chain append)
 *   - Automatic GC: completed chains are pruned from the map
 *   - Cooperative with AbortSignal: cancelled while waiting
 *   - Per action-key isolation: `billing.delete` ≠ `users.delete`
 *
 * @module
 * @internal
 */

// ── Serializer Implementation ────────────────────────────

/**
 * An async mutex that serializes destructive operations by action key.
 *
 * Created once per builder during `buildToolDefinition()` — only when
 * at least one action is marked `destructive: true`. Otherwise the
 * field stays `undefined` (zero overhead).
 *
 * Used by `_executePipeline()` to wrap `runChain()` for destructive actions.
 *
 * @example
 * ```
 * // Concurrent calls to `billing.delete`:
 * //   Call A → executes immediately
 * //   Call B → waits for A to complete → then executes
 * //   Call C → waits for B to complete → then executes
 * //
 * // Concurrent calls to `billing.list` (readOnly):
 * //   All execute in parallel (serializer not invoked)
 * ```
 */
export class MutationSerializer {
    /**
     * Active promise chains keyed by action key.
     * Each entry represents the "tail" of the serialization queue.
     * When the tail resolves, the next waiter starts.
     */
    private readonly _chains = new Map<string, Promise<void>>();

    // ── Public API ───────────────────────────────────────

    /**
     * Serialize execution of `fn` for the given action key.
     *
     * Concurrent calls with the **same key** are queued and executed
     * strictly in FIFO order. Different keys are fully independent.
     *
     * @param key - Action key (e.g., `"delete"` or `"billing.refund"`)
     * @param fn - The async function to serialize (typically `runChain()`)
     * @param signal - Optional AbortSignal for cooperative cancellation while waiting
     * @returns The result of `fn()`
     * @throws Error if the AbortSignal fires while waiting in queue
     */
    async serialize<T>(
        key: string,
        fn: () => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        // Append to the chain for this key
        const prev = this._chains.get(key) ?? Promise.resolve();

        let releaseLock!: () => void;
        const lock = new Promise<void>(resolve => { releaseLock = resolve; });
        this._chains.set(key, lock);

        try {
            // Wait for previous operation on this key to complete
            await prev;

            // Check if cancelled while waiting in the serialization queue
            if (signal?.aborted) {
                throw new Error('Request cancelled while waiting for mutation lock.');
            }

            return await fn();
        } finally {
            releaseLock();

            // GC: if this was the last link in the chain, prune the entry
            // so the map doesn't grow unboundedly with resolved promises.
            if (this._chains.get(key) === lock) {
                this._chains.delete(key);
            }
        }
    }

    // ── Diagnostics ──────────────────────────────────────

    /**
     * Number of action keys with active serialization chains.
     * Used for testing and debugging — should be 0 when idle.
     */
    get activeChains(): number {
        return this._chains.size;
    }
}
