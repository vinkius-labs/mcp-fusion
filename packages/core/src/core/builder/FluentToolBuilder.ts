/**
 * FluentToolBuilder — Type-Chaining Builder for Semantic Verb Tools
 *
 * The core builder behind `f.query()`, `f.mutation()`, and `f.action()`.
 * Uses TypeScript generic accumulation so that each fluent step narrows
 * the types — the IDE "magically" knows the exact shape of `input` and
 * `ctx` inside `.resolve()` without any manual Interface declaration.
 *
 * @example
 * ```typescript
 * const f = initFusion<AppContext>();
 *
 * // f.query() → readOnly implicit, f.mutation() → destructive implicit
 * const listUsers = f.query('users.list')
 *     .describe('List users from the database')
 *     .instructions('Use when the user asks about team members')
 *     .input({
 *         limit:  f.number().min(1).max(100).default(10).describe('Max results'),
 *         status: f.enum('active', 'inactive').optional(),
 *     })
 *     .returns(UserPresenter)
 *     .resolve(async ({ input, ctx }) => {
 *         // input: { limit: number; status?: 'active' | 'inactive' }
 *         // ctx: AppContext — fully typed!
 *         return ctx.db.user.findMany({ take: input.limit });
 *     });
 * ```
 *
 * @see {@link FluentRouter} for prefix grouping
 * @see {@link initFusion} for the factory that creates these builders
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { GroupedToolBuilder } from './GroupedToolBuilder.js';
import { type ToolResponse, type MiddlewareFn } from '../types.js';
import { success } from '../response.js';
import { type Presenter } from '../../presenter/Presenter.js';
import { isZodSchema } from '../schema/SchemaUtils.js';
import { convertParamsToZod, type ParamsMap } from './ParamDescriptors.js';
import {
    type FluentParamsMap,
    type InferFluentParams,
    resolveFluentParams,
    isFluentDescriptor,
} from './FluentSchemaHelpers.js';
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

// ── Input Type Resolution ────────────────────────────────

/**
 * Resolve the TypeScript type of an input schema.
 *
 * Supports:
 * - FluentParamsMap (fluent helpers) → InferFluentParams
 * - ZodObject → Zod's inferred output type
 * - ParamsMap (JSON descriptors) → Record<string, unknown> (runtime-only typing)
 *
 * @internal
 */
export type InferInputSchema<T> =
    T extends ZodObject<ZodRawShape> ? T['_output'] :
    T extends Record<string, unknown> ? InferFluentParams<T> :
    void;

// ── FluentToolBuilder ────────────────────────────────────

/**
 * Fluent builder that accumulates types at each step.
 *
 * @typeParam TContext - Base application context (from `initFusion<TContext>()`)
 * @typeParam TInput - Accumulated input type (set by `.input()`)
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
    /** @internal */ _rawInput?: unknown;
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
     *     .input({ query: f.string() })
     *     .resolve(async ({ input }) => { ... });
     * ```
     */
    instructions(text: string): FluentToolBuilder<TContext, TInput, TCtx> {
        this._instructions = text;
        return this;
    }

    /**
     * Define the input schema — the **type-chaining magic** happens here.
     *
     * Accepts three formats (Interoperability Door):
     * 1. **Fluent helpers** — `{ limit: f.number().min(1) }` (zero Zod import)
     * 2. **ParamsMap** — `{ limit: 'number' }` (JSON shorthand)
     * 3. **Zod schema** — `z.object({ limit: z.number() })` (native interop)
     *
     * The return type narrows `TInput` to the inferred schema type, so
     * `.resolve()` receives fully typed `input` — zero manual interfaces.
     *
     * @param schema - Input schema (fluent, JSON, or Zod)
     * @returns A **new type** of `FluentToolBuilder` with `TInput` narrowed
     */
    input<TSchema extends ZodObject<ZodRawShape>>(
        schema: TSchema,
    ): FluentToolBuilder<TContext, TSchema['_output'], TCtx>;
    input<TSchema extends Record<string, unknown>>(
        schema: TSchema,
    ): FluentToolBuilder<TContext, InferFluentParams<TSchema>, TCtx>;
    input(schema: unknown): FluentToolBuilder<TContext, unknown, TCtx> {
        this._rawInput = schema;

        // Resolve to ZodObject at runtime
        if (isZodSchema(schema)) {
            this._inputSchema = schema as ZodObject<ZodRawShape>;
        } else if (typeof schema === 'object' && schema !== null) {
            // Check if any values are FluentDescriptors
            const entries = Object.entries(schema as Record<string, unknown>);
            const hasFluentDescriptors = entries.some(([, v]) => isFluentDescriptor(v));

            if (hasFluentDescriptors) {
                // Resolve FluentDescriptors → ParamDef → Zod
                const resolved = resolveFluentParams(schema as FluentParamsMap);
                this._inputSchema = convertParamsToZod(resolved);
            } else {
                // Plain ParamsMap → Zod
                this._inputSchema = convertParamsToZod(schema as ParamsMap);
            }
        }

        return this as unknown as FluentToolBuilder<TContext, unknown, TCtx>;
    }

    /**
     * Add context-derivation middleware (tRPC-style).
     *
     * The middleware receives `{ ctx, next }` and can enrich the context
     * for downstream steps. The TypeScript type of `ctx` in `.resolve()`
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
     *     .input({ id: f.string() })
     *     .resolve(async ({ input, ctx }) => {
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
     * Set capability tags for selective tool exposure.
     *
     * @param tags - Tag strings for filtering
     * @returns `this` for chaining
     */
    tags(...tags: string[]): FluentToolBuilder<TContext, TInput, TCtx> {
        this._tags = tags;
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
     * Uses TOON (Token-Oriented Object Notation) to encode action metadata
     * in a compact tabular format, reducing description token count by ~30-50%.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('users.list')
     *     .toonDescription()
     *     .resolve(async ({ ctx }) => ctx.db.users.findMany());
     * ```
     *
     * @see {@link toonSuccess} for TOON-encoded responses
     */
    toonDescription(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._toonMode = true;
        return this;
    }

    /**
     * Set MCP tool annotations.
     *
     * Manual override for tool-level annotations. If not set,
     * annotations are automatically aggregated from per-action
     * semantic properties (readOnly, destructive, idempotent).
     *
     * @param a - Annotation key-value pairs
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('admin.stats')
     *     .annotations({ openWorldHint: true, returnDirect: false })
     *     .resolve(async ({ ctx }) => ctx.db.getStats());
     * ```
     *
     * @see {@link https://modelcontextprotocol.io/specification/2025-03-26/server/tools#annotations | MCP Tool Annotations}
     */
    annotations(a: Record<string, unknown>): FluentToolBuilder<TContext, TInput, TCtx> {
        this._annotations = a;
        return this;
    }

    // ── State Sync (Fluent) ──────────────────────────────

    /**
     * Declare glob patterns invalidated when this tool succeeds.
     *
     * Eliminates manual `stateSync.policies` configuration —
     * the framework auto-collects hints from all builders.
     *
     * @param patterns - Glob patterns (e.g. `'sprints.*'`, `'tasks.*'`)
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.mutation('tasks.update')
     *     .invalidates('tasks.*', 'sprints.*')
     *     .input({ id: f.string(), title: f.string() })
     *     .resolve(async ({ input, ctx }) => {
     *         return ctx.db.tasks.update(input.id, { title: input.title });
     *     });
     * ```
     *
     * @see {@link StateSyncConfig} for centralized configuration
     */
    invalidates(...patterns: string[]): FluentToolBuilder<TContext, TInput, TCtx> {
        this._invalidatesPatterns.push(...patterns);
        return this;
    }

    /**
     * Mark this tool's data as immutable (safe to cache forever).
     *
     * Use for reference data: countries, currencies, ICD-10 codes.
     * The LLM sees `[Cache-Control: immutable]` in the description.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('countries.list')
     *     .cached()
     *     .resolve(async ({ ctx }) => ctx.db.countries.findMany());
     * ```
     */
    cached(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._cacheControl = 'immutable';
        return this;
    }

    /**
     * Mark this tool's data as volatile (never cache).
     *
     * Use for dynamic data that changes frequently.
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
     * Prevents thundering-herd scenarios where the LLM fires N
     * concurrent calls in the same millisecond.
     *
     * @param config - Concurrency configuration
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.mutation('billing.process')
     *     .concurrency({ maxActive: 5, maxQueue: 20 })
     *     .resolve(...)
     * ```
     */
    concurrency(config: ConcurrencyConfig): FluentToolBuilder<TContext, TInput, TCtx> {
        this._concurrency = config;
        return this;
    }

    /**
     * Set maximum payload size for tool responses (Egress Guard).
     *
     * Prevents oversized responses from crashing the process or
     * overflowing the LLM context window.
     *
     * @param bytes - Maximum payload size in bytes
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('logs.search')
     *     .egress(2 * 1024 * 1024) // 2MB
     *     .resolve(...)
     * ```
     */
    egress(bytes: number): FluentToolBuilder<TContext, TInput, TCtx> {
        this._egressMaxBytes = bytes;
        return this;
    }

    // ── Terminal: resolve() ──────────────────────────────

    /**
     * Set the handler and build the tool — the terminal step.
     *
     * The handler receives `{ input, ctx }` with fully typed `TInput` and `TCtx`.
     * **Implicit `success()` wrapping**: if the handler returns raw data
     * (not a `ToolResponse`), the framework wraps it with `success()`.
     *
     * @param handler - Async function receiving typed `{ input, ctx }`
     * @returns A `GroupedToolBuilder` ready for registration
     */
    resolve(
        handler: (
            args: { input: TInput extends void ? Record<string, unknown> : TInput; ctx: TCtx },
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
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

        // Wrap handler: { input, ctx } → (ctx, args) + implicit success()
        const resolvedHandler = handler;
        const wrappedHandler = async (ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> => {
            const result = await resolvedHandler({ input: args, ctx } as never);

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
