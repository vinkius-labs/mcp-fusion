import { type SyncPolicy, type CacheDirective, type InvalidationEvent, type ResourceNotification } from './types.js';
import { StateSyncLayer } from './StateSyncLayer.js';

/**
 * Nested builder for configuring a single State Sync policy.
 */
export class PolicyBuilder {
    private _cacheControl?: CacheDirective;
    private _invalidates: string[] = [];

    /**
     * Mark matching tools as immutable (safe to cache forever).
     * Use for reference data: countries, currencies, ICD-10 codes.
     */
    cached(): this {
        this._cacheControl = 'immutable';
        return this;
    }

    /**
     * Mark matching tools as volatile (never cache).
     * Use for dynamic data that changes on every call.
     */
    stale(): this {
        this._cacheControl = 'no-store';
        return this;
    }

    /**
     * Declare which glob patterns are invalidated when these tools succeed.
     */
    invalidates(...patterns: string[]): this {
        this._invalidates = [...this._invalidates, ...patterns];
        return this;
    }

    /** @internal */
    build() {
        const result: { cacheControl?: CacheDirective; invalidates?: string[] } = {};
        if (this._cacheControl) result.cacheControl = this._cacheControl;
        if (this._invalidates.length > 0) result.invalidates = this._invalidates;
        return result;
    }
}

/**
 * Fluent builder for centralized State Sync configuration.
 * 
 * Typically accessed via `f.stateSync()` in the `initFusion` instance.
 */
export class StateSyncBuilder {
    private _policies: SyncPolicy[] = [];
    private _defaults: { cacheControl?: CacheDirective } = {};
    private _onInvalidation?: (event: InvalidationEvent) => void;
    private _notificationSink?: (notification: ResourceNotification) => void | Promise<void>;

    /**
     * Set global default cache-control directives.
     */
    defaults(fn: (p: Omit<PolicyBuilder, 'invalidates'>) => void): this {
        const builder = new PolicyBuilder();
        fn(builder);
        const built = builder.build();
        if (built.cacheControl) {
            this._defaults.cacheControl = built.cacheControl;
        }
        return this;
    }

    /**
     * Add a scoped policy for matching tools using a fluent nested builder.
     * 
     * @param match - Tool name or glob pattern (e.g. 'users.*', 'billing.create')
     * @param fn - Callback to configure the policy
     * 
     * @example
     * ```typescript
     * .policy('billing.*', p => p.noStore().invalidates('billing.*'))
     * ```
     */
    policy(match: string, fn: (p: PolicyBuilder) => void): this {
        const builder = new PolicyBuilder();
        fn(builder);
        this._policies.push({ match, ...builder.build() });
        return this;
    }

    /**
     * Set a hook for observability when invalidations occur.
     */
    onInvalidation(fn: (event: InvalidationEvent) => void): this {
        this._onInvalidation = fn;
        return this;
    }

    /**
     * Set the notification sink for protocol-level resource updates.
     */
    notificationSink(fn: (notification: ResourceNotification) => void | Promise<void>): this {
        this._notificationSink = fn;
        return this;
    }

    /**
     * Build the StateSyncLayer instance.
     */
    build(): StateSyncLayer {
        const config: {
            policies: SyncPolicy[];
            defaults: { cacheControl?: CacheDirective };
            onInvalidation?: (event: InvalidationEvent) => void;
            notificationSink?: (notification: ResourceNotification) => void | Promise<void>;
        } = {
            policies: this._policies,
            defaults: this._defaults,
        };
        if (this._onInvalidation) config.onInvalidation = this._onInvalidation;
        if (this._notificationSink) config.notificationSink = this._notificationSink;
        return new StateSyncLayer(config);
    }

    /**
     * Shortcut for build() to align with other builders.
     */
    get layer() { return this.build(); }
}
