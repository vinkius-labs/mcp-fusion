/**
 * ConcurrencyGuard — Per-Tool Semaphore with Backpressure Queue
 *
 * Implements the Semaphore pattern to prevent thundering-herd scenarios
 * where an LLM fires N concurrent tool calls in the same millisecond.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────┐
 *   │  Incoming tool call                             │
 *   │                                                 │
 *   │  ┌───────────┐  slot free?  ┌──────────────┐   │
 *   │  │  acquire() ├────YES────► │  run handler  │   │
 *   │  │           │              └──────────────┘   │
 *   │  │           │  queue has    ┌──────────────┐   │
 *   │  │           ├──space?──YES─►│  enqueue()   │   │
 *   │  │           │              └──────────────┘   │
 *   │  │           │  both full    ┌──────────────┐   │
 *   │  │           ├──────NO──────►│ load shedding│   │
 *   │  └───────────┘              └──────────────┘   │
 *   └─────────────────────────────────────────────────┘
 *
 * Properties:
 * - Zero overhead when not configured (guard is `undefined`)
 * - O(1) acquire/release with deque-based pending queue
 * - Cooperative with AbortSignal: queued waiters are rejected on abort
 * - Pure module: no side effects, no dependencies
 *
 * @module
 * @internal
 */

// ── Configuration ────────────────────────────────────────

/**
 * Concurrency configuration for a tool builder.
 *
 * @example
 * ```typescript
 * createTool<AppContext>('billing')
 *     .concurrency({ maxActive: 5, maxQueue: 20 })
 *     .action({ name: 'process_invoice', handler: ... });
 * ```
 */
export interface ConcurrencyConfig {
    /**
     * Maximum number of concurrent executions allowed.
     * When all slots are occupied, new calls enter the queue.
     *
     * @minimum 1
     */
    readonly maxActive: number;

    /**
     * Maximum number of calls waiting in the backpressure queue.
     * When the queue is full, new calls are immediately rejected
     * with a load-shedding error.
     *
     * @minimum 0
     * @default 0
     */
    readonly maxQueue?: number;
}

// ── Guard Implementation ─────────────────────────────────

/** Pending waiter: resolved when a slot becomes available, rejected on abort/shed */
interface PendingWaiter {
    readonly resolve: () => void;
    readonly reject: (reason: Error) => void;
}

/**
 * A concurrency guard that limits simultaneous tool executions.
 *
 * Created once per builder via `createConcurrencyGuard()`.
 * Used by `GroupedToolBuilder.execute()` to gate entry.
 */
export class ConcurrencyGuard {
    private readonly _maxActive: number;
    private readonly _maxQueue: number;
    private _active = 0;
    private readonly _pending: PendingWaiter[] = [];

    constructor(config: ConcurrencyConfig) {
        this._maxActive = Math.max(1, Math.floor(config.maxActive));
        this._maxQueue = Math.max(0, Math.floor(config.maxQueue ?? 0));
    }

    // ── Public API ───────────────────────────────────────

    /**
     * Attempt to acquire an execution slot.
     *
     * - If a slot is free: increments active count, resolves immediately.
     * - If queue has space: enqueues and returns a promise that resolves when a slot opens.
     * - If both full: returns `null` (load shedding signal).
     *
     * @param signal - Optional AbortSignal for cooperative cancellation of queued waiters.
     * @returns A release function (call when execution completes) or `null` for load shedding.
     */
    acquire(signal?: AbortSignal): Promise<(() => void)> | null {
        // Fast path: slot available
        if (this._active < this._maxActive) {
            this._active++;
            return Promise.resolve(this._createRelease());
        }

        // Queue path: check capacity
        if (this._pending.length >= this._maxQueue) {
            return null; // Load shedding
        }

        // Enqueue waiter
        return new Promise<() => void>((resolve, reject) => {
            const waiter: PendingWaiter = {
                resolve: () => resolve(this._createRelease()),
                reject,
            };
            this._pending.push(waiter);

            // If signal is already aborted, reject immediately
            if (signal?.aborted) {
                this._removePending(waiter);
                reject(new Error('Request cancelled while queued.'));
                return;
            }

            // Listen for abort while queued
            if (signal) {
                const onAbort = () => {
                    this._removePending(waiter);
                    reject(new Error('Request cancelled while queued.'));
                };
                signal.addEventListener('abort', onAbort, { once: true });

                // Clean up listener when waiter resolves normally
                const originalResolve = waiter.resolve;
                (waiter as { resolve: () => void }).resolve = () => {
                    signal.removeEventListener('abort', onAbort);
                    originalResolve();
                };
            }
        });
    }

    /**
     * Current number of active (in-flight) executions.
     */
    get active(): number {
        return this._active;
    }

    /**
     * Current number of waiters in the backpressure queue.
     */
    get queued(): number {
        return this._pending.length;
    }

    // ── Private ──────────────────────────────────────────

    private _createRelease(): () => void {
        let released = false;
        return () => {
            if (released) return; // Idempotent
            released = true;
            this._active--;
            this._drainNext();
        };
    }

    private _drainNext(): void {
        if (this._pending.length > 0 && this._active < this._maxActive) {
            this._active++;
            const next = this._pending.shift()!;
            next.resolve();
        }
    }

    private _removePending(waiter: PendingWaiter): void {
        const idx = this._pending.indexOf(waiter);
        if (idx !== -1) {
            this._pending.splice(idx, 1);
        }
    }
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a ConcurrencyGuard from configuration.
 *
 * Returns `undefined` when no configuration is provided,
 * ensuring zero overhead on the fast path.
 *
 * @internal
 */
export function createConcurrencyGuard(
    config?: ConcurrencyConfig,
): ConcurrencyGuard | undefined {
    if (!config) return undefined;
    return new ConcurrencyGuard(config);
}
