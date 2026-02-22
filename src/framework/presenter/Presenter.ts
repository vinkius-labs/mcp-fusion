/**
 * Presenter — MVA View Layer for AI Agents
 *
 * Domain-level "lens" that defines how data is presented to an LLM.
 * A Presenter validates data through a Zod schema, attaches JIT system
 * rules, and renders deterministic UI blocks — all at Node.js speed.
 *
 * The Presenter is **domain-level**, not tool-level. The same Presenter
 * (e.g. `InvoicePresenter`) can be reused across any tool that returns
 * invoices, guaranteeing consistent AI perception of the domain.
 *
 * ## Advanced Features
 *
 * - **Context-Aware**: Callbacks receive `TContext` for RBAC, DLP, locale
 * - **Cognitive Guardrails**: `.agentLimit()` truncates large arrays
 * - **Agentic Affordances**: `.suggestActions()` for HATEOAS-style hints
 * - **Composition**: `.embed()` nests child Presenters (DRY relational data)
 *
 * @example
 * ```typescript
 * import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
 * import { z } from 'zod';
 *
 * export const InvoicePresenter = createPresenter('Invoice')
 *     .schema(z.object({
 *         id: z.string(),
 *         amount_cents: z.number(),
 *         status: z.enum(['paid', 'pending']),
 *     }))
 *     .systemRules((invoice, ctx) => [
 *         'CRITICAL: amount_cents is in CENTS. Divide by 100.',
 *         ctx?.user?.role !== 'admin' ? 'Mask sensitive financial data.' : null,
 *     ])
 *     .uiBlocks((invoice) => [
 *         ui.echarts({
 *             series: [{ type: 'gauge', data: [{ value: invoice.amount_cents / 100 }] }],
 *         }),
 *     ])
 *     .agentLimit(50, (omitted) =>
 *         ui.summary(`⚠️ Dataset truncated. 50 shown, ${omitted} hidden.`)
 *     )
 *     .suggestActions((invoice) => {
 *         if (invoice.status === 'pending') {
 *             return [{ tool: 'billing.pay', reason: 'Offer immediate payment' }];
 *         }
 *         return [];
 *     });
 * ```
 *
 * @see {@link createPresenter} for the factory function
 * @see {@link ResponseBuilder} for manual response composition
 *
 * @module
 */
import { type ZodType, ZodError } from 'zod';
import { ResponseBuilder } from './ResponseBuilder.js';
import { type UiBlock } from './ui.js';
import { PresenterValidationError } from './PresenterValidationError.js';

// ── Brand ────────────────────────────────────────────────

const PRESENTER_BRAND = 'FusionPresenter' as const;

/**
 * Check if a value is a {@link Presenter} instance.
 *
 * Used by the execution pipeline to detect Presenters declared
 * via the `returns` field in action configuration.
 *
 * @param value - Any value
 * @returns `true` if the value is a Presenter
 */
export function isPresenter(value: unknown): value is Presenter<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__brand' in value &&
        (value as { __brand: unknown }).__brand === PRESENTER_BRAND
    );
}

// ── Types ────────────────────────────────────────────────

/** A suggested next action for HATEOAS-style agent guidance */
export interface ActionSuggestion {
    /** Tool name to suggest (e.g. 'billing.pay') */
    readonly tool: string;
    /** Human-readable reason for the suggestion */
    readonly reason: string;
}

/** An embedded child Presenter for relational composition */
interface EmbedEntry {
    readonly key: string;
    readonly presenter: Presenter<unknown>;
}

/** Agent limit configuration */
interface AgentLimitConfig {
    readonly max: number;
    readonly onTruncate: (omittedCount: number) => UiBlock;
}

/** Static rules (string array) OR dynamic rules with context (function) */
type RulesConfig<T> = readonly string[] | ((data: T, ctx?: unknown) => (string | null)[]);

/** UI blocks callback — with optional context */
type ItemUiBlocksFn<T> = (item: T, ctx?: unknown) => (UiBlock | null)[];

/** Collection UI blocks callback — with optional context */
type CollectionUiBlocksFn<T> = (items: T[], ctx?: unknown) => (UiBlock | null)[];

/** Suggest actions callback — with optional context */
type SuggestActionsFn<T> = (data: T, ctx?: unknown) => ActionSuggestion[];

// ── Presenter ────────────────────────────────────────────

/**
 * Domain-level Presenter — the "View" in MVA (Model-View-Agent).
 *
 * Encapsulates:
 * - **Schema** (Zod): Validates and filters data before it reaches the LLM
 * - **System Rules**: JIT context directives that travel with the data
 * - **UI Blocks**: SSR-rendered visual blocks (charts, diagrams, tables)
 * - **Agent Limit**: Smart truncation for large collections
 * - **Action Suggestions**: HATEOAS-style next-action hints
 * - **Embeds**: Relational Presenter composition (DRY)
 *
 * @typeParam T - The validated output type (inferred from the Zod schema)
 *
 * @see {@link createPresenter} for the factory function
 */
export class Presenter<T> {
    /** @internal Brand for type detection in the pipeline */
    readonly __brand = PRESENTER_BRAND;

    /** @internal Human-readable domain name (for debugging) */
    readonly name: string;

    private _schema?: ZodType<T>;
    private _rules: RulesConfig<T> = [];
    private _itemUiBlocks?: ItemUiBlocksFn<T>;
    private _collectionUiBlocks?: CollectionUiBlocksFn<T>;
    private _suggestActions?: SuggestActionsFn<T>;
    private _agentLimit?: AgentLimitConfig;
    private _embeds: EmbedEntry[] = [];
    private _sealed = false;

    /** @internal Use {@link createPresenter} factory instead */
    constructor(name: string) {
        this.name = name;
    }

    // ── Configuration Guards ─────────────────────────────

    /**
     * Ensure the Presenter is not sealed.
     * Throws a clear error if `.make()` has already been called.
     * @internal
     */
    private _assertNotSealed(): void {
        if (this._sealed) {
            throw new Error(
                `Presenter "${this.name}" is sealed after first .make() call. ` +
                `Configuration must be done before .make() is called.`
            );
        }
    }

    // ── Configuration (fluent) ───────────────────────────

    /**
     * Set the Zod schema for data validation and filtering.
     *
     * The schema acts as a **security contract**: only fields declared
     * in the schema will reach the LLM. Sensitive data (passwords,
     * tenant IDs, internal flags) is automatically stripped.
     *
     * @typeParam TSchema - Zod type with output type inference
     * @param zodSchema - A Zod schema (z.object, z.array, etc.)
     * @returns A narrowed Presenter with the schema's output type
     *
     * @example
     * ```typescript
     * createPresenter('Invoice')
     *     .schema(z.object({
     *         id: z.string(),
     *         amount_cents: z.number(),
     *     }))
     * // Presenter<{ id: string; amount_cents: number }>
     * ```
     */
    schema<TSchema extends ZodType>(
        zodSchema: TSchema,
    ): Presenter<TSchema['_output']> {
        this._assertNotSealed();
        const narrowed = this as unknown as Presenter<TSchema['_output']>;
        narrowed._schema = zodSchema;
        return narrowed;
    }

    /**
     * Set JIT system rules that travel with the data.
     *
     * Rules are **Context Tree-Shaking**: they only appear in the LLM's
     * context when this specific domain's data is returned.
     *
     * Accepts either a **static array** or a **dynamic function** that
     * receives the data and request context for RBAC/DLP/locale rules.
     * Return `null` from dynamic rules to conditionally exclude them.
     *
     * @param rules - Array of rule strings, or a function `(data, ctx?) => (string | null)[]`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * // Static rules
     * .systemRules(['CRITICAL: amounts in CENTS.'])
     *
     * // Dynamic context-aware rules (RBAC)
     * .systemRules((user, ctx) => [
     *     ctx?.user?.role !== 'admin' ? 'Mask email and phone.' : null,
     *     `Format dates using ${ctx?.tenant?.locale ?? 'en-US'}`
     * ])
     * ```
     */
    systemRules(rules: readonly string[] | ((data: T, ctx?: unknown) => (string | null)[])): this {
        this._assertNotSealed();
        this._rules = rules;
        return this;
    }

    /**
     * Define UI blocks generated for a **single data item**.
     *
     * The callback receives the validated data item and optionally the
     * request context. Return `null` for conditional blocks (filtered
     * automatically).
     *
     * @param fn - `(item, ctx?) => (UiBlock | null)[]`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * .uiBlocks((invoice, ctx) => [
     *     ui.echarts({ series: [...] }),
     *     ctx?.user?.department === 'finance' ? ui.echarts(advancedChart) : null,
     * ])
     * ```
     */
    uiBlocks(fn: ItemUiBlocksFn<T>): this {
        this._assertNotSealed();
        this._itemUiBlocks = fn;
        return this;
    }

    /**
     * Define aggregated UI blocks for a **collection** (array) of items.
     *
     * When the handler returns an array, this callback is called **once**
     * with the entire validated array. Prevents N individual charts
     * from flooding the LLM's context.
     *
     * @param fn - `(items[], ctx?) => (UiBlock | null)[]`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * .collectionUiBlocks((invoices) => [
     *     ui.echarts({ xAxis: { data: invoices.map(i => i.id) } }),
     *     ui.summary(`${invoices.length} invoices found.`),
     * ])
     * ```
     */
    collectionUiBlocks(fn: CollectionUiBlocksFn<T>): this {
        this._assertNotSealed();
        this._collectionUiBlocks = fn;
        return this;
    }

    /**
     * Set a cognitive guardrail that truncates large collections.
     *
     * Protects against context DDoS: if a tool returns thousands of
     * records, the Presenter automatically truncates the data array
     * and injects a summary block teaching the AI to use filters.
     *
     * @param max - Maximum items to keep in the data array
     * @param onTruncate - Callback that generates a warning UI block.
     *                     Receives the count of omitted items.
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * .agentLimit(50, (omitted) =>
     *     ui.summary(`⚠️ Truncated. 50 shown, ${omitted} hidden. Use filters.`)
     * )
     * ```
     */
    agentLimit(max: number, onTruncate: (omittedCount: number) => UiBlock): this {
        this._assertNotSealed();
        this._agentLimit = { max, onTruncate };
        return this;
    }

    /**
     * Define HATEOAS-style action suggestions based on data state.
     *
     * The callback inspects the data and returns suggested next tools,
     * guiding the AI through the business state machine. Eliminates
     * routing hallucinations by providing explicit next-step hints.
     *
     * @param fn - `(data, ctx?) => ActionSuggestion[]`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * .suggestActions((invoice, ctx) => {
     *     if (invoice.status === 'pending') {
     *         return [
     *             { tool: 'billing.pay', reason: 'Offer immediate payment' },
     *             { tool: 'billing.send_reminder', reason: 'Send reminder email' },
     *         ];
     *     }
     *     return [];
     * })
     * ```
     */
    suggestActions(fn: SuggestActionsFn<T>): this {
        this._assertNotSealed();
        this._suggestActions = fn;
        return this;
    }

    /**
     * Compose a child Presenter for a nested relation.
     *
     * When `data[key]` exists, the child Presenter's rules and UI blocks
     * are merged into the parent response. This is the DRY solution for
     * relational data: define `ClientPresenter` once, embed it everywhere.
     *
     * @param key - The property key containing the nested data
     * @param childPresenter - The Presenter to apply to `data[key]`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * import { ClientPresenter } from './ClientPresenter';
     *
     * export const InvoicePresenter = createPresenter('Invoice')
     *     .schema(invoiceSchema)
     *     .embed('client', ClientPresenter);
     * ```
     */
    embed(key: string, childPresenter: Presenter<unknown>): this {
        this._assertNotSealed();
        this._embeds.push({ key, presenter: childPresenter });
        return this;
    }

    // ── Introspection (read-only metadata accessors) ─────

    /**
     * Get the Zod schema's top-level keys.
     *
     * Returns the field names declared in the Presenter's schema.
     * Safe to call at any time — does NOT seal the Presenter.
     *
     * @returns Array of key names, or empty array if no schema is set
     */
    getSchemaKeys(): string[] {
        if (!this._schema) return [];
        // ZodType may not have `.shape` (e.g. z.array). Guard safely.
        const shape = (this._schema as { shape?: Record<string, unknown> }).shape;
        return shape ? Object.keys(shape) : [];
    }

    /**
     * Get which UI block factory methods were configured.
     *
     * Inspects the configuration callbacks to determine supported
     * UI block types. Does NOT execute any callbacks.
     *
     * @returns Array of UI block type labels
     */
    getUiBlockTypes(): string[] {
        const types: string[] = [];
        if (this._itemUiBlocks) types.push('item');
        if (this._collectionUiBlocks) types.push('collection');
        // Note: specific types (echarts, mermaid, etc.) are only known at
        // runtime when callbacks execute. We report callback presence here.
        return types;
    }

    /**
     * Whether the Presenter uses dynamic (context-aware) system rules.
     *
     * Static rules (string arrays) are NOT contextual.
     * Functions `(data, ctx?) => ...` ARE contextual.
     *
     * @returns `true` if rules are a function
     */
    hasContextualRules(): boolean {
        return typeof this._rules === 'function';
    }

    // ── Execution ────────────────────────────────────────

    /**
     * Compose a {@link ResponseBuilder} from raw data.
     *
     * Orchestrates: truncate → validate → embed → render UI → attach rules → suggest actions.
     * After the first call, the Presenter is sealed (immutable).
     *
     * **Auto-detection**: If `data` is an array, items are validated
     * individually and `collectionUiBlocks` is called (if defined).
     * Otherwise, `uiBlocks` is called for the single item.
     *
     * @param data - Raw data from the handler (object or array)
     * @param ctx - Optional request context (for RBAC, locale, etc.)
     * @returns A {@link ResponseBuilder} ready for chaining or `.build()`
     * @throws If Zod validation fails
     *
     * @example
     * ```typescript
     * // Automatic (via returns: Presenter — ctx injected by framework)
     * // Manual:
     * return InvoicePresenter.make(rawInvoice).build();
     * return InvoicePresenter.make(rawInvoice, ctx).build();
     * ```
     */
    make(data: T | T[], ctx?: unknown): ResponseBuilder {
        // Seal on first use — configuration is frozen from here
        this._sealed = true;

        const isArray = Array.isArray(data);

        // Step 0: Cognitive Guardrails — truncate if needed
        let truncationBlock: UiBlock | undefined;
        if (isArray && this._agentLimit && (data as T[]).length > this._agentLimit.max) {
            const fullLength = (data as T[]).length;
            const omitted = fullLength - this._agentLimit.max;
            data = (data as T[]).slice(0, this._agentLimit.max) as T[];
            truncationBlock = this._agentLimit.onTruncate(omitted);
        }

        // Step 1: Process embedded child Presenters (on RAW data, before validation)
        // Embeds access relational keys (e.g. `client`) that the parent schema
        // may not include — so they must run on pre-validation data.
        const rawForEmbeds = data;

        // Step 2: Validate
        const validated = this._validate(data, isArray);
        const builder = new ResponseBuilder(validated as string | object);

        // Step 2.5: Truncation warning (first UI block, before all others)
        if (truncationBlock) {
            builder.uiBlock(truncationBlock);
        }

        // Step 3: Merge embedded child Presenter blocks
        this._processEmbeds(builder, rawForEmbeds, isArray, ctx);

        // Step 4: Attach UI blocks
        this._attachUiBlocks(builder, validated, isArray, ctx);

        // Step 5: Attach rules
        this._attachRules(builder, validated, isArray, ctx);

        // Step 6: Attach action suggestions
        this._attachSuggestions(builder, validated, isArray, ctx);

        return builder;
    }

    // ── Private Decomposed Steps ─────────────────────────

    /**
     * Validate data through the Zod schema (if configured).
     * For arrays, each item is validated independently.
     * @internal
     */
    private _validate(data: T | T[], isArray: boolean): T | T[] {
        if (!this._schema) return data;

        try {
            if (isArray) {
                return (data as T[]).map(item => this._schema!.parse(item));
            }
            return this._schema.parse(data);
        } catch (err) {
            if (err instanceof ZodError) {
                throw new PresenterValidationError(this.name, err);
            }
            throw err;
        }
    }

    /**
     * Generate and attach UI blocks to the response builder.
     * Auto-detects single vs collection. Filters `null` blocks.
     * @internal
     */
    private _attachUiBlocks(builder: ResponseBuilder, data: T | T[], isArray: boolean, ctx?: unknown): void {
        if (isArray && this._collectionUiBlocks) {
            const blocks = this._collectionUiBlocks(data as T[], ctx).filter(Boolean) as UiBlock[];
            if (blocks.length > 0) builder.uiBlocks(blocks);
        } else if (!isArray && this._itemUiBlocks) {
            const blocks = this._itemUiBlocks(data as T, ctx).filter(Boolean) as UiBlock[];
            if (blocks.length > 0) builder.uiBlocks(blocks);
        }
    }

    /**
     * Resolve and attach domain rules to the response builder.
     * Supports both static arrays and dynamic context-aware functions.
     * Filters `null` rules automatically.
     * @internal
     */
    private _attachRules(builder: ResponseBuilder, data: T | T[], isArray: boolean, ctx?: unknown): void {
        if (typeof this._rules === 'function') {
            // Dynamic rules — resolve with data and context
            const singleData = isArray ? (data as T[])[0] : data as T;
            if (singleData !== undefined) {
                const resolved = this._rules(singleData, ctx)
                    .filter((r): r is string => r !== null && r !== undefined);
                if (resolved.length > 0) builder.systemRules(resolved);
            }
        } else if (this._rules.length > 0) {
            // Static rules — pass directly
            builder.systemRules(this._rules);
        }
    }

    /**
     * Evaluate and attach action suggestions to the response.
     * Generates a `[SYSTEM HINT]` block with recommended next tools.
     * @internal
     */
    private _attachSuggestions(builder: ResponseBuilder, data: T | T[], isArray: boolean, ctx?: unknown): void {
        if (!this._suggestActions) return;

        // For collections, evaluate suggestions on the first item (or skip)
        const singleData = isArray ? (data as T[])[0] : data as T;
        if (singleData === undefined) return;

        const suggestions = this._suggestActions(singleData, ctx);
        if (suggestions.length > 0) {
            builder.systemHint(suggestions);
        }
    }

    /**
     * Process embedded child Presenters for nested relational data.
     * Merges child UI blocks and rules into the parent builder.
     * @internal
     */
    private _processEmbeds(builder: ResponseBuilder, data: T | T[], isArray: boolean, ctx?: unknown): void {
        if (this._embeds.length === 0) return;

        const singleData = isArray ? (data as T[])[0] : data as T;
        if (singleData === undefined || typeof singleData !== 'object') return;

        for (const embed of this._embeds) {
            const nestedData = (singleData as Record<string, unknown>)[embed.key];
            if (nestedData === undefined || nestedData === null) continue;

            // Run the child Presenter and extract its blocks
            const childBuilder = embed.presenter.make(nestedData, ctx);
            const childResponse = childBuilder.build();

            // Skip the first block (data) — parent already has it
            // Merge remaining blocks (UI, rules, hints) into the parent
            for (let i = 1; i < childResponse.content.length; i++) {
                builder.rawBlock(childResponse.content[i]!.text);
            }
        }
    }
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a new domain-level Presenter.
 *
 * The Presenter defines how a specific domain model (Invoice, Task,
 * Project) is presented to AI agents. It is **reusable** across any
 * tool that returns that model.
 *
 * @param name - Human-readable domain name (for debugging/logging)
 * @returns A new {@link Presenter} ready for configuration
 *
 * @example
 * ```typescript
 * import { createPresenter, ui } from '@vinkius-core/mcp-fusion';
 *
 * export const TaskPresenter = createPresenter('Task')
 *     .schema(taskSchema)
 *     .systemRules(['Use emojis: 🔄 In Progress, ✅ Done'])
 *     .uiBlocks((task) => [ui.markdown(`**${task.title}**: ${task.status}`)]);
 * ```
 *
 * @see {@link Presenter} for the full API
 */
export function createPresenter(name: string): Presenter<unknown> {
    return new Presenter<unknown>(name);
}
