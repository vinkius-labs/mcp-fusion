/**
 * FluentToolBuilder — Type-Chaining Builder for Semantic Verb Tools
 *
 * The core builder behind `f.query()`, `f.mutation()`, and `f.action()`.
 * Uses TypeScript generic accumulation so that each fluent step narrows
 * the types — the IDE "magically" knows the exact shape of `input` and
 * `ctx` inside `.handle()` without any manual Interface declaration.
 *
 * @example
 * ```typescript
 * const f = initFusion<AppContext>();
 *
 * const listUsers = f.query('users.list')
 *     .describe('List users from the database')
 *     .withNumber('limit', 'Max results to return')
 *     .withOptionalEnum('status', ['active', 'inactive'], 'Filter by status')
 *     .returns(UserPresenter)
 *     .handle(async (input, ctx) => {
 *         return ctx.db.user.findMany({ take: input.limit });
 *     });
 * ```
 *
 * @see {@link FluentRouter} for prefix grouping
 * @see {@link initFusion} for the factory that creates these builders
 *
 * @module
 */
import { z, type ZodType, type ZodObject, type ZodRawShape } from 'zod';
import { GroupedToolBuilder } from './GroupedToolBuilder.js';
import { type ToolResponse, type MiddlewareFn } from '../types.js';
import { success } from '../response.js';
import { type Presenter } from '../../presenter/Presenter.js';
import { type ConcurrencyConfig } from '../execution/ConcurrencyGuard.js';

// ── Semantic Verb Defaults ───────────────────────────────

/**
 * Semantic defaults applied by each verb.
 * @internal
 */
export interface SemanticDefaults {
    readonly readOnly?: boolean;
    readonly destructive?: boolean;
    readonly idempotent?: boolean;
}

/** Defaults for `f.query()` — read-only, no side effects */
export const QUERY_DEFAULTS: SemanticDefaults = { readOnly: true };

/** Defaults for `f.mutation()` — destructive, irreversible */
export const MUTATION_DEFAULTS: SemanticDefaults = { destructive: true };

/** Defaults for `f.action()` — neutral, no assumptions */
export const ACTION_DEFAULTS: SemanticDefaults = {};

// ── Array Item Type Resolution ───────────────────────────

/** Resolve Zod type from array item type string */
function resolveArrayItemType(itemType: 'string' | 'number' | 'boolean'): ZodType {
    switch (itemType) {
        case 'string': return z.string();
        case 'number': return z.number();
        case 'boolean': return z.boolean();
    }
}

// ── FluentToolBuilder ────────────────────────────────────

/**
 * Fluent builder that accumulates types at each step.
 *
 * @typeParam TContext - Base application context (from `initFusion<TContext>()`)
 * @typeParam TInput - Accumulated input type (built by `with*()` methods)
 * @typeParam TCtx - Accumulated context type (enriched by `.use()`)
 */
export class FluentToolBuilder<
    TContext,
    TInput = void,
    TCtx = TContext,
> {
    /** @internal */ readonly _name: string;
    /** @internal */ _description?: string;
    /** @internal */ _instructions?: string;
    /** @internal */ _inputSchema?: ZodObject<ZodRawShape>;
    /** @internal */ _withParams: Record<string, ZodType> = {};
    /** @internal */ _tags: string[] = [];
    /** @internal */ _middlewares: MiddlewareFn<TContext>[] = [];
    /** @internal */ _returns?: Presenter<unknown>;
    /** @internal */ _semanticDefaults: SemanticDefaults;
    /** @internal */ _readOnly?: boolean;
    /** @internal */ _destructive?: boolean;
    /** @internal */ _idempotent?: boolean;
    /** @internal */ _toonMode = false;
    /** @internal */ _annotations?: Record<string, unknown>;
    /** @internal */ _invalidatesPatterns: string[] = [];
    /** @internal */ _cacheControl?: 'no-store' | 'immutable';
    /** @internal */ _concurrency?: ConcurrencyConfig;
    /** @internal */ _egressMaxBytes?: number;

    /**
     * @param name - Tool name in `domain.action` format (e.g. `'users.list'`)
     * @param defaults - Semantic defaults from the verb (`query`, `mutation`, `action`)
     */
    constructor(name: string, defaults: SemanticDefaults = {}) {
        this._name = name;
        this._semanticDefaults = defaults;
    }

    // ── Configuration (fluent, each returns narrowed type) ──

    /**
     * Set the tool description shown to the LLM.
     *
     * @param text - Human-readable description
     * @returns `this` for chaining
     */
    describe(text: string): FluentToolBuilder<TContext, TInput, TCtx> {
        this._description = text;
        return this;
    }

    /**
     * Set AI-First instructions — injected as system-level guidance in the tool description.
     *
     * This is **Prompt Engineering embedded in the framework**. The instructions
     * tell the LLM WHEN and HOW to use this tool, reducing hallucination.
     *
     * @param text - System prompt for the tool
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('docs.search')
     *     .describe('Search internal documentation')
     *     .instructions('Use ONLY when the user asks about internal policies.')
     *     .withString('query', 'Search term')
     *     .handle(async (input) => { ... });
     * ```
     */
    instructions(text: string): FluentToolBuilder<TContext, TInput, TCtx> {
        this._instructions = text;
        return this;
    }

    // ── Parameter Declaration (with* methods) ────────────

    /**
     * Add a required string parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('projects.get')
     *     .withString('project_id', 'The project ID to retrieve')
     *     .handle(async (input) => { ... });
     * // input.project_id: string ✅
     * ```
     */
    withString<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, string>, TCtx> {
        this._withParams[name] = description ? z.string().describe(description) : z.string();
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, string>, TCtx>;
    }

    /**
     * Add an optional string parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalString<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, string>>, TCtx> {
        const base = description ? z.string().describe(description) : z.string();
        this._withParams[name] = base.optional();
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, string>>, TCtx>;
    }

    /**
     * Add a required number parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withNumber<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, number>, TCtx> {
        this._withParams[name] = description ? z.number().describe(description) : z.number();
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, number>, TCtx>;
    }

    /**
     * Add an optional number parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalNumber<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, number>>, TCtx> {
        const base = description ? z.number().describe(description) : z.number();
        this._withParams[name] = base.optional();
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, number>>, TCtx>;
    }

    /**
     * Add a required boolean parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withBoolean<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, boolean>, TCtx> {
        this._withParams[name] = description ? z.boolean().describe(description) : z.boolean();
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, boolean>, TCtx>;
    }

    /**
     * Add an optional boolean parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalBoolean<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, boolean>>, TCtx> {
        const base = description ? z.boolean().describe(description) : z.boolean();
        this._withParams[name] = base.optional();
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, boolean>>, TCtx>;
    }

    /**
     * Add a required enum parameter.
     *
     * @param name - Parameter name
     * @param values - Allowed enum values
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('invoices.list')
     *     .withEnum('status', ['draft', 'sent', 'paid'], 'Filter by status')
     *     .handle(async (input) => { ... });
     * // input.status: 'draft' | 'sent' | 'paid' ✅
     * ```
     */
    withEnum<K extends string, V extends string>(
        name: K,
        values: readonly [V, ...V[]],
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, V>, TCtx> {
        const schema = z.enum(values as [V, ...V[]]);
        this._withParams[name] = description ? schema.describe(description) : schema;
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, V>, TCtx>;
    }

    /**
     * Add an optional enum parameter.
     *
     * @param name - Parameter name
     * @param values - Allowed enum values
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalEnum<K extends string, V extends string>(
        name: K,
        values: readonly [V, ...V[]],
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, V>>, TCtx> {
        const schema = z.enum(values as [V, ...V[]]);
        this._withParams[name] = description ? schema.describe(description).optional() : schema.optional();
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, V>>, TCtx>;
    }

    /**
     * Add a required array parameter.
     *
     * @param name - Parameter name
     * @param itemType - Type of array items (`'string'`, `'number'`, `'boolean'`)
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.mutation('tasks.tag')
     *     .withString('task_id', 'The task to tag')
     *     .withArray('tags', 'string', 'Tags to apply')
     *     .handle(async (input) => { ... });
     * // input.tags: string[] ✅
     * ```
     */
    withArray<K extends string, I extends 'string' | 'number' | 'boolean'>(
        name: K,
        itemType: I,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>, TCtx> {
        const schema = z.array(resolveArrayItemType(itemType));
        this._withParams[name] = description ? schema.describe(description) : schema;
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>, TCtx>;
    }

    /**
     * Add an optional array parameter.
     *
     * @param name - Parameter name
     * @param itemType - Type of array items (`'string'`, `'number'`, `'boolean'`)
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalArray<K extends string, I extends 'string' | 'number' | 'boolean'>(
        name: K,
        itemType: I,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>>, TCtx> {
        const schema = z.array(resolveArrayItemType(itemType));
        this._withParams[name] = description ? schema.describe(description).optional() : schema.optional();
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>>, TCtx>;
    }

    // ── Middleware ────────────────────────────────────────

    /**
     * Add context-derivation middleware (tRPC-style).
     *
     * The middleware receives `{ ctx, next }` and can enrich the context
     * for downstream steps. The TypeScript type of `ctx` in `.handle()`
     * is automatically extended with the derived properties.
     *
     * @param mw - Middleware that returns enriched context
     * @returns A **new type** of `FluentToolBuilder` with `TCtx` enriched
     *
     * @example
     * ```typescript
     * f.mutation('users.delete')
     *     .use(async ({ ctx, next }) => {
     *         const admin = await requireAdmin(ctx.headers);
     *         return next({ ...ctx, adminUser: admin });
     *     })
     *     .withString('id', 'User ID to delete')
     *     .handle(async (input, ctx) => {
     *         // ctx.adminUser is typed! Zero casting.
     *         ctx.logger.info(`${ctx.adminUser.name} deleting ${input.id}`);
     *     });
     * ```
     */
    use<TDerived extends Record<string, unknown>>(
        mw: (args: { ctx: TCtx; next: (enrichedCtx: TCtx & TDerived) => Promise<ToolResponse> }) => Promise<ToolResponse>,
    ): FluentToolBuilder<TContext, TInput, TCtx & TDerived> {
        // Convert the fluent middleware signature to the standard MiddlewareFn
        const standardMw: MiddlewareFn<TContext> = async (ctx, args, next) => {
            const wrappedNext = async (enrichedCtx: unknown): Promise<ToolResponse> => {
                // Merge enriched properties into context
                Object.assign(ctx as Record<string, unknown>, enrichedCtx as Record<string, unknown>);
                return next() as Promise<ToolResponse>;
            };
            return mw({ ctx: ctx as unknown as TCtx, next: wrappedNext as never }) as Promise<ToolResponse>;
        };
        this._middlewares.push(standardMw);
        return this as unknown as FluentToolBuilder<TContext, TInput, TCtx & TDerived>;
    }

    /**
     * Set the MVA Presenter for automatic response formatting.
     *
     * When a Presenter is attached, the handler can return raw data
     * and the framework pipes it through schema validation, system rules,
     * and UI block generation.
     *
     * @param presenter - A Presenter instance
     * @returns `this` for chaining
     */
    returns(presenter: Presenter<unknown>): FluentToolBuilder<TContext, TInput, TCtx> {
        this._returns = presenter;
        return this;
    }

    /**
     * Add capability tags for selective tool exposure.
     *
     * Tags are accumulated — calling `.tags()` multiple times
     * (or inheriting from a router) appends rather than replaces.
     *
     * @param tags - Tag strings for filtering
     * @returns `this` for chaining
     */
    tags(...tags: string[]): FluentToolBuilder<TContext, TInput, TCtx> {
        this._tags.push(...tags);
        return this;
    }

    // ── Semantic Overrides ───────────────────────────────

    /** Override: mark this tool as read-only (no side effects) */
    readOnly(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._readOnly = true;
        return this;
    }

    /** Override: mark this tool as destructive (irreversible) */
    destructive(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._destructive = true;
        return this;
    }

    /** Override: mark this tool as idempotent (safe to retry) */
    idempotent(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._idempotent = true;
        return this;
    }

    /**
     * Enable TOON-formatted descriptions for token optimization.
     *
     * @returns `this` for chaining
     */
    toonDescription(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._toonMode = true;
        return this;
    }

    /**
     * Set MCP tool annotations.
     *
     * @param a - Annotation key-value pairs
     * @returns `this` for chaining
     */
    annotations(a: Record<string, unknown>): FluentToolBuilder<TContext, TInput, TCtx> {
        this._annotations = a;
        return this;
    }

    // ── State Sync (Fluent) ──────────────────────────────

    /**
     * Declare glob patterns invalidated when this tool succeeds.
     *
     * @param patterns - Glob patterns (e.g. `'sprints.*'`, `'tasks.*'`)
     * @returns `this` for chaining
     */
    invalidates(...patterns: string[]): FluentToolBuilder<TContext, TInput, TCtx> {
        this._invalidatesPatterns.push(...patterns);
        return this;
    }

    /**
     * Mark this tool's data as immutable (safe to cache forever).
     *
     * @returns `this` for chaining
     */
    cached(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._cacheControl = 'immutable';
        return this;
    }

    /**
     * Mark this tool's data as volatile (never cache).
     *
     * @returns `this` for chaining
     */
    stale(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._cacheControl = 'no-store';
        return this;
    }

    // ── Runtime Guards (Fluent) ──────────────────────────

    /**
     * Set concurrency limits for this tool (Semaphore + Queue pattern).
     *
     * @param config - Concurrency configuration
     * @returns `this` for chaining
     */
    concurrency(config: ConcurrencyConfig): FluentToolBuilder<TContext, TInput, TCtx> {
        this._concurrency = config;
        return this;
    }

    /**
     * Set maximum payload size for tool responses (Egress Guard).
     *
     * @param bytes - Maximum payload size in bytes
     * @returns `this` for chaining
     */
    egress(bytes: number): FluentToolBuilder<TContext, TInput, TCtx> {
        this._egressMaxBytes = bytes;
        return this;
    }

    // ── Terminal: handle() ───────────────────────────────

    /**
     * Set the handler and build the tool — the terminal step.
     *
     * The handler receives `(input, ctx)` with fully typed `TInput` and `TCtx`.
     * **Implicit `success()` wrapping**: if the handler returns raw data
     * (not a `ToolResponse`), the framework wraps it with `success()`.
     *
     * @param handler - Async function receiving typed `(input, ctx)`
     * @returns A `GroupedToolBuilder` ready for registration
     *
     * @example
     * ```typescript
     * const getProject = f.query('projects.get')
     *     .describe('Get a project by ID')
     *     .withString('project_id', 'The exact project ID')
     *     .handle(async (input, ctx) => {
     *         return await ctx.db.projects.findUnique({ where: { id: input.project_id } });
     *     });
     * ```
     */
    handle(
        handler: (
            input: TInput extends void ? Record<string, unknown> : TInput,
            ctx: TCtx,
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
        return this._build(handler);
    }

    /**
     * Alias for `.handle()` — for backward compatibility.
     * @internal
     */
    resolve(
        handler: (
            args: { input: TInput extends void ? Record<string, unknown> : TInput; ctx: TCtx },
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
        // Adapt { input, ctx } signature to (input, ctx)
        return this._build((input, ctx) => handler({ input, ctx } as never));
    }

    // ── Internal Build ───────────────────────────────────

    /** @internal */
    private _build(
        handler: (
            input: TInput extends void ? Record<string, unknown> : TInput,
            ctx: TCtx,
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
        // Build accumulated with* params into ZodObject
        if (Object.keys(this._withParams).length > 0) {
            this._inputSchema = z.object(this._withParams as ZodRawShape);
        }

        // Parse name: 'domain.action' → tool='domain', action='action'
        const dotIndex = this._name.indexOf('.');
        const toolName = dotIndex > 0 ? this._name.slice(0, dotIndex) : this._name;
        const actionName = dotIndex > 0 ? this._name.slice(dotIndex + 1) : 'default';

        // Compile description: instructions + description
        const descParts: string[] = [];
        if (this._instructions) {
            descParts.push(`[INSTRUCTIONS] ${this._instructions}`);
        }
        if (this._description) {
            descParts.push(this._description);
        }
        const compiledDescription = descParts.length > 0 ? descParts.join('\n\n') : undefined;

        // Resolve semantic defaults + overrides
        const readOnly = this._readOnly ?? this._semanticDefaults.readOnly;
        const destructive = this._destructive ?? this._semanticDefaults.destructive;
        const idempotent = this._idempotent ?? this._semanticDefaults.idempotent;

        // Wrap handler: (input, ctx) → (ctx, args)
        const resolvedHandler = handler;
        const wrappedHandler = async (ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> => {
            const result = await resolvedHandler(args as never, ctx as never);

            // Auto-wrap non-ToolResponse results (implicit success)
            if (
                typeof result === 'object' &&
                result !== null &&
                'content' in result &&
                Array.isArray((result as { content: unknown }).content)
            ) {
                return result as ToolResponse;
            }

            // Implicit success() — the dev just returns raw data!
            return success(result as string | object);
        };

        // Build via GroupedToolBuilder for consistency with existing pipeline
        const builder = new GroupedToolBuilder<TContext>(toolName);

        if (compiledDescription) builder.description(compiledDescription);
        if (this._tags.length > 0) builder.tags(...this._tags);
        if (this._toonMode) builder.toonDescription();
        if (this._annotations) builder.annotations(this._annotations);

        // Propagate state sync hints
        if (this._invalidatesPatterns.length > 0) {
            builder.invalidates(...this._invalidatesPatterns);
        }
        if (this._cacheControl) {
            this._cacheControl === 'immutable' ? builder.cached() : builder.stale();
        }

        // Propagate runtime guards
        if (this._concurrency) {
            builder.concurrency(this._concurrency);
        }
        if (this._egressMaxBytes !== undefined) {
            builder.maxPayloadBytes(this._egressMaxBytes);
        }

        // Apply middleware
        for (const mw of this._middlewares) {
            builder.use(mw);
        }

        // Register the single action
        builder.action({
            name: actionName,
            handler: wrappedHandler,
            ...(this._inputSchema ? { schema: this._inputSchema } : {}),
            ...(readOnly !== undefined ? { readOnly } : {}),
            ...(destructive !== undefined ? { destructive } : {}),
            ...(idempotent !== undefined ? { idempotent } : {}),
            ...(this._returns ? { returns: this._returns } : {}),
        });

        return builder;
    }
}
