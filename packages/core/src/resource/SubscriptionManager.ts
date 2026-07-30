/**
 * SubscriptionManager — Push Notification Tracking
 *
 * Tracks which resource URIs are subscribed and routes
 * `notifications/resources/updated` to the MCP transport layer.
 *
 * Designed to be embedded within {@link ResourceRegistry}.
 * Supports both in-process usage (framework) and external
 * delegation (runtime Redis bridge).
 *
 * @see {@link ResourceRegistry} for the public API
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

/**
 * Notification sink for `notifications/resources/updated`.
 *
 * Set by ServerAttachment to bridge into the MCP transport.
 */
export type ResourceNotificationSink = (uri: string) => void | Promise<void>;

/**
 * MCP 2.0 (`2026-07-28`) subscription filter for `subscriptions/listen`.
 *
 * A client declares which notification categories it wants to receive
 * on a subscription stream. The server honors the subset it supports.
 */
export interface SubscriptionFilter {
    /** Request `notifications/tools/list_changed` on this stream */
    readonly toolsListChanged?: boolean;
    /** Request `notifications/prompts/list_changed` on this stream */
    readonly promptsListChanged?: boolean;
    /** Request `notifications/resources/list_changed` on this stream */
    readonly resourcesListChanged?: boolean;
    /** Request `notifications/resources/updated` for these specific URIs */
    readonly resourceSubscriptions?: readonly string[];
}

/**
 * A registered subscription stream with its filter and notification sink.
 */
interface SubscriptionStream {
    readonly id: string;
    readonly filter: SubscriptionFilter;
    readonly sink: (notification: unknown) => void | Promise<void>;
}

// ── Manager ──────────────────────────────────────────────

export class SubscriptionManager {
    private readonly _subscribed = new Set<string>();
    private _sink?: ResourceNotificationSink;
    /** MCP 2.0 subscription streams keyed by subscription ID */
    private readonly _streams = new Map<string, SubscriptionStream>();

    /**
     * Subscribe to push notifications for a resource URI.
     *
     * @param uri - The resource URI to subscribe to
     */
    subscribe(uri: string): void {
        this._subscribed.add(uri);
    }

    /**
     * Unsubscribe from push notifications for a resource URI.
     *
     * @param uri - The resource URI to unsubscribe from
     */
    unsubscribe(uri: string): void {
        this._subscribed.delete(uri);
    }

    /**
     * Check if a URI is currently subscribed.
     *
     * @param uri - The URI to check
     */
    isSubscribed(uri: string): boolean {
        return this._subscribed.has(uri);
    }

    /**
     * Get all currently subscribed URIs.
     */
    getSubscriptions(): ReadonlySet<string> {
        return this._subscribed;
    }

    /**
     * Emit a `notifications/resources/updated` for a URI.
     *
     * Only emits if the URI is subscribed AND a sink is configured.
     * Errors in the sink are swallowed (best-effort delivery).
     *
     * @param uri - The URI of the resource that changed
     */
    async notify(uri: string): Promise<void> {
        if (!this._sink || !this._subscribed.has(uri)) return;

        try {
            const result = this._sink(uri);
            if (result instanceof Promise) {
                await result;
            }
        } catch {
            /* best-effort — sink must not break the pipeline */
        }
    }

    /**
     * Set the notification sink.
     *
     * @param sink - Callback that emits the MCP notification
     * @internal
     */
    setSink(sink: ResourceNotificationSink): void {
        this._sink = sink;
    }

    /** Number of active subscriptions. */
    get size(): number { return this._subscribed.size; }

    // ── MCP 2.0 subscriptions/listen ────────────────────

    /**
     * Register a MCP 2.0 subscription stream with its filter.
     *
     * Called by `subscriptions/listen` handler. The stream's sink
     * receives notifications matching its filter.
     *
     * @param id - Subscription ID (from the listen request)
     * @param filter - The subscription filter declaring desired notifications
     * @param sink - Function to push notifications onto the stream
     */
    registerStream(id: string, filter: SubscriptionFilter, sink: (notification: unknown) => void | Promise<void>): void {
        this._streams.set(id, { id, filter, sink });
        // Also register resource URIs in the legacy set for backward compat
        if (filter.resourceSubscriptions) {
            for (const uri of filter.resourceSubscriptions) {
                this._subscribed.add(uri);
            }
        }
    }

    /**
     * Remove a MCP 2.0 subscription stream.
     *
     * @param id - Subscription ID to remove
     */
    unregisterStream(id: string): void {
        const stream = this._streams.get(id);
        if (stream) {
            // Clean up resource URIs from the legacy set
            if (stream.filter.resourceSubscriptions) {
                for (const uri of stream.filter.resourceSubscriptions) {
                    const stillNeeded = [...this._streams.values()]
                        .some(s => s.id !== id && s.filter.resourceSubscriptions?.includes(uri));
                    if (!stillNeeded) this._subscribed.delete(uri);
                }
            }
            this._streams.delete(id);
        }
    }

    /**
     * Push a notification to all streams whose filter matches.
     *
     * @param method - The notification method (e.g. 'notifications/tools/list_changed')
     * @param params - The notification params
     */
    async pushNotification(method: string, params?: unknown): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const stream of this._streams.values()) {
            if (this._filterMatches(stream.filter, method, params)) {
                promises.push(
                    (async () => {
                        try {
                            const result = stream.sink({ method, params });
                            if (result instanceof Promise) await result;
                        } catch { /* best-effort */ }
                    })(),
                );
            }
        }
        await Promise.all(promises);
    }

    /**
     * Check if a notification method matches a subscription filter.
     */
    private _filterMatches(filter: SubscriptionFilter, method: string, params?: unknown): boolean {
        switch (method) {
            case 'notifications/tools/list_changed':
                return filter.toolsListChanged === true;
            case 'notifications/prompts/list_changed':
                return filter.promptsListChanged === true;
            case 'notifications/resources/list_changed':
                return filter.resourcesListChanged === true;
            case 'notifications/resources/updated': {
                if (!filter.resourceSubscriptions) return false;
                const uri = (params as { uri?: string } | undefined)?.uri;
                return uri !== undefined && filter.resourceSubscriptions.includes(uri);
            }
            default:
                return false;
        }
    }

    /** Get the count of active MCP 2.0 subscription streams. */
    get streamCount(): number { return this._streams.size; }

    /** Remove all subscriptions. */
    clear(): void {
        this._subscribed.clear();
        this._streams.clear();
    }
}
