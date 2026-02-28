/**
 * FluentRouter — Prefix Grouping for Fluent Tools
 *
 * Eliminates repetitive `'users.'` prefixes across dozens of tools.
 * A router shares a common prefix, description, and middleware chain
 * across all child tools.
 *
 * @example
 * ```typescript
 * const f = initFusion<AppContext>();
 *
 * const users = f.router('users')
 *     .describe('User management')
 *     .use(requireAuth);
 *
 * // Tool name: "users", action: "list"
 * const listUsers = users.query('list')
 *     .input({ limit: f.number() })
 *     .resolve(async ({ input }) => { ... });
 *
 * // Tool name: "users", action: "delete"
 * const deleteUser = users.mutation('delete')
 *     .input({ id: f.string() })
 *     .resolve(async ({ input }) => { ... });
 * ```
 *
 * @module
 */
import { type MiddlewareFn } from '../types.js';
import { type MiddlewareDefinition, resolveMiddleware } from '../middleware/ContextDerivation.js';
import {
    FluentToolBuilder,
    QUERY_DEFAULTS,
    MUTATION_DEFAULTS,
    ACTION_DEFAULTS,
} from './FluentToolBuilder.js';

/**
 * Fluent router that shares prefix, description, and middleware
 * across child tools created via `.query()`, `.mutation()`, `.action()`.
 *
 * @typeParam TContext - Base application context
 */
export class FluentRouter<TContext> {
    /** @internal */ readonly _prefix: string;
    /** @internal */ _description?: string;
    /** @internal */ _middlewares: MiddlewareFn<TContext>[] = [];
    /** @internal */ _tags: string[] = [];

    constructor(prefix: string) {
        this._prefix = prefix;
    }

    /**
     * Set the shared description for all tools in this router.
     *
     * @param text - Human-readable description
     * @returns `this` for chaining
     */
    describe(text: string): this {
        this._description = text;
        return this;
    }

    /**
     * Add middleware shared by all tools in this router.
     *
     * Accepts both `MiddlewareDefinition` from `f.middleware()` and
     * raw `MiddlewareFn` functions.
     *
     * @param mw - Middleware function or MiddlewareDefinition
     * @returns `this` for chaining
     */
    use(mw: MiddlewareFn<TContext> | MiddlewareDefinition<TContext, Record<string, unknown>>): this {
        this._middlewares.push(resolveMiddleware(mw));
        return this;
    }

    /**
     * Set capability tags shared by all tools in this router.
     *
     * @param tags - Tag strings for filtering
     * @returns `this` for chaining
     */
    tags(...tags: string[]): this {
        this._tags = tags;
        return this;
    }

    /**
     * Create a read-only query tool under this router's prefix.
     *
     * @param action - Action name (e.g. `'list'` → tool name `'prefix.list'`)
     * @returns A `FluentToolBuilder` with the prefixed name and inherited config
     */
    query(action: string): FluentToolBuilder<TContext> {
        return this._createBuilder(action, QUERY_DEFAULTS);
    }

    /**
     * Create a destructive mutation tool under this router's prefix.
     *
     * @param action - Action name (e.g. `'delete'` → tool name `'prefix.delete'`)
     * @returns A `FluentToolBuilder` with the prefixed name and inherited config
     */
    mutation(action: string): FluentToolBuilder<TContext> {
        return this._createBuilder(action, MUTATION_DEFAULTS);
    }

    /**
     * Create a neutral action tool under this router's prefix.
     *
     * @param action - Action name (e.g. `'update'` → tool name `'prefix.update'`)
     * @returns A `FluentToolBuilder` with the prefixed name and inherited config
     */
    action(action: string): FluentToolBuilder<TContext> {
        return this._createBuilder(action, ACTION_DEFAULTS);
    }

    /**
     * Create a FluentToolBuilder with inherited router config.
     * @internal
     */
    private _createBuilder(
        action: string,
        defaults: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean },
    ): FluentToolBuilder<TContext> {
        const builder = new FluentToolBuilder<TContext>(
            `${this._prefix}.${action}`,
            defaults,
        );

        // Inherit router middleware
        builder._middlewares.push(...this._middlewares);

        // Inherit router tags
        if (this._tags.length > 0) {
            builder._tags.push(...this._tags);
        }

        // Inherit router description as fallback
        if (this._description && !builder._description) {
            builder._description = this._description;
        }

        return builder;
    }
}
