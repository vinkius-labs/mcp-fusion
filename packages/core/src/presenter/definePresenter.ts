/**
 * definePresenter() — Declarative Presenter Definition
 *
 * Zero-friction object-config API for creating Presenters.
 * Replaces the fluent builder pattern with a single object literal
 * that enables instant Ctrl+Space autocomplete and zero generic noise.
 *
 * The `schema` field drives type inference: the `ui`, `rules`, and
 * `suggestActions` callbacks automatically receive the inferred type,
 * so the developer never writes a generic parameter manually.
 *
 * @example
 * ```typescript
 * import { definePresenter, ui } from '@vurb/core';
 * import { z } from 'zod';
 *
 * export const InvoicePresenter = definePresenter({
 *   name: 'Invoice',
 *   schema: z.object({
 *     id: z.string(),
 *     amount_cents: z.number().describe('CRITICAL: in CENTS. Divide by 100.'),
 *     status: z.enum(['paid', 'pending']),
 *   }),
 *   rules: ['CRITICAL: Divide amount_cents by 100 before displaying.'],
 *   ui: (inv) => [ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] })],
 *   suggestActions: (inv) =>
 *     inv.status === 'pending'
 *       ? [{ tool: 'billing.pay', reason: 'Offer immediate payment' }]
 *       : [],
 * });
 * ```
 *
 * @module
 */
import { type ZodType } from 'zod';
import { Presenter, type ActionSuggestion } from './Presenter.js';
import { type UiBlock } from './ui.js';
import { extractZodDescriptions } from './ZodDescriptionExtractor.js';

// ── Config Types ─────────────────────────────────────────

/**
 * Agent limit configuration for cognitive guardrails.
 */
export interface AgentLimitDef {
    /** Maximum items to keep when data is an array */
    readonly max: number;
    /** Callback that produces a warning block when items are truncated */
    readonly onTruncate: (omittedCount: number) => UiBlock;
}

/**
 * Embedded child Presenter definition for relational composition.
 */
export interface EmbedDef {
    /** Property key in the parent data that contains the nested data */
    readonly key: string;
    /** The child Presenter to apply to the nested data */
    readonly presenter: Presenter<unknown>;
}

/**
 * Full declarative configuration for `definePresenter()`.
 *
 * @typeParam T - Inferred from the `schema` field's output type
 */
export interface PresenterConfig<T> {
    /** Human-readable domain name (for debugging and introspection) */
    readonly name: string;

    /** Zod schema for data validation and field filtering */
    readonly schema?: ZodType<any, any, any>;

    /**
     * System rules that travel with the data.
     *
     * - **Static**: `string[]` — always injected
     * - **Dynamic**: `(data, ctx?) => (string | null)[]` — context-aware (RBAC, DLP, locale)
     *
     * Return `null` from dynamic rules to conditionally exclude them.
     */
    readonly rules?: readonly string[] | ((data: T, ctx?: unknown) => (string | null)[]);

    /**
     * UI blocks for a **single data item**.
     *
     * Return `null` for conditional blocks (filtered automatically).
     */
    readonly ui?: (item: T, ctx?: unknown) => (UiBlock | null)[];

    /**
     * Aggregated UI blocks for a **collection** (array) of items.
     *
     * Called once with the entire validated array. Prevents N individual
     * charts from flooding the LLM's context.
     */
    readonly collectionUi?: (items: T[], ctx?: unknown) => (UiBlock | null)[];

    /**
     * Cognitive guardrail that truncates large collections.
     *
     * Protects against context DDoS by limiting returned array length
     * and injecting a summary block.
     */
    readonly agentLimit?: AgentLimitDef;

    /**
     * HATEOAS-style next-action suggestions based on data state.
     *
     * Eliminates routing hallucinations by providing explicit next-step hints.
     */
    readonly suggestActions?: (data: T, ctx?: unknown) => ActionSuggestion[];

    /**
     * Embedded child Presenters for nested relational data.
     *
     * Define once, embed everywhere. Each embed's `key` is looked up on
     * the parent data, and the child Presenter renders its own blocks/rules.
     */
    readonly embeds?: readonly EmbedDef[];

    /**
     * HATEOAS-style suggestions for **collections** (arrays).
     *
     * Unlike `suggestActions`, this callback receives the **entire array**
     * of validated items, enabling aggregate-level suggestions like batch
     * operations, bulk approvals, or summary insights.
     *
     * Return `null` for conditional suggestions (filtered automatically).
     *
     * When both `suggestActions` and `collectionSuggestions` are set,
     * only `collectionSuggestions` is used for arrays.
     */
    readonly collectionSuggestions?: (items: T[], ctx?: unknown) => (ActionSuggestion | null)[];

    /**
     * Collection-level system rules evaluated with the **entire array**.
     *
     * Use for aggregate context (totals, counts, mixed-status warnings)
     * that cannot be derived from a single item.
     *
     * Both per-item `rules` and `collectionRules` are merged in the response.
     *
     * - **Static**: `string[]` — always injected for collections
     * - **Dynamic**: `(items[], ctx?) => (string | null)[]` — context-aware
     */
    readonly collectionRules?: readonly string[] | ((items: T[], ctx?: unknown) => (string | null)[]);

    /**
     * Automatically extract `.describe()` annotations from the Zod schema
     * and merge them with `rules` as system rules.
     *
     * When `true` (the default), field-level `.describe()` annotations
     * become system rules, ensuring documentation never drifts from the
     * actual data shape. Set to `false` to opt out.
     *
     * @default true
     */
    readonly autoRules?: boolean;

    /**
     * PII redaction paths for DLP compliance.
     *
     * Compiles object paths into V8-optimized masking functions
     * using `fast-redact`. Masked data reaches the LLM, while
     * UI blocks and system rules see the full unmasked data.
     *
     * Requires `fast-redact` as an optional peer dependency.
     *
     * @example
     * ```typescript
     * redactPII: {
     *     paths: ['*.ssn', 'credit_card.number', 'patients[*].diagnosis'],
     *     censor: '[REDACTED]',
     * }
     * ```
     */
    readonly redactPII?: {
        readonly paths: string[];
        readonly censor?: string | ((value: unknown) => string);
    };

    // ── Async Callbacks (consumed by makeAsync) ──────────

    /**
     * Async UI blocks for a **single data item**.
     *
     * Used when UI generation requires I/O (database, API, etc.).
     * Ignored by sync `make()` — only consumed by `makeAsync()`.
     */
    readonly asyncUi?: (item: T, ctx?: unknown) => Promise<(UiBlock | null)[]>;

    /**
     * Async UI blocks for a **collection** of items.
     */
    readonly asyncCollectionUi?: (items: T[], ctx?: unknown) => Promise<(UiBlock | null)[]>;

    /**
     * Async system rules generation.
     */
    readonly asyncRules?: (data: T, ctx?: unknown) => Promise<(string | null)[]>;

    /**
     * Async action suggestions generation.
     */
    readonly asyncSuggestActions?: (data: T, ctx?: unknown) => Promise<(ActionSuggestion | null)[]>;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Define a domain-level Presenter using a declarative config object.
 *
 * This is the recommended, zero-friction API. The `schema` field drives
 * full type inference — `ui`, `rules`, and `suggestActions` callbacks
 * all receive correctly-typed parameters without any explicit generics.
 *
 * @typeParam TSchema - Zod type (inferred from the `schema` field)
 * @param config - Declarative presenter configuration
 * @returns A fully-configured {@link Presenter} ready for use
 *
 * @example
 * ```typescript
 * // Minimal
 * const TaskPresenter = definePresenter({
 *   name: 'Task',
 *   schema: z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
 *   rules: ['Use ✅ for done, 🔄 for in-progress.'],
 *   ui: (task) => [ui.markdown(`**${task.title}**: ${task.done ? '✅' : '🔄'}`)],
 * });
 *
 * // With embeds, agent limit, and dynamic rules
 * const OrderPresenter = definePresenter({
 *   name: 'Order',
 *   schema: orderSchema,
 *   rules: (order, ctx) => [
 *     ctx?.locale === 'pt-BR' ? 'Formate datas em DD/MM/YYYY' : null,
 *   ],
 *   agentLimit: { max: 100, onTruncate: (n) => ui.summary(`⚠️ ${n} orders hidden`) },
 *   embeds: [{ key: 'customer', presenter: CustomerPresenter }],
 *   suggestActions: (order) =>
 *     order.status === 'pending'
 *       ? [{ tool: 'orders.approve', reason: 'Ready for approval' }]
 *       : [],
 * });
 * ```
 *
 * @example Mutation pattern (create/update/delete confirmation):
 * ```typescript
 * const CreateOrderPresenter = definePresenter({
 *   name: 'CreateOrder',
 *   schema: orderSchema,
 *   rules: ['Order was created successfully. Show confirmation to the user.'],
 *   suggestActions: (order) => [
 *     { tool: 'orders.get', reason: 'View order details' },
 *     { tool: 'orders.list', reason: 'View all orders' },
 *     { tool: 'payments.create', reason: 'Process payment' },
 *   ],
 * });
 * ```
 *
 * @see {@link createPresenter} for the legacy fluent builder API
 * @see {@link Presenter} for the full Presenter class documentation
 */
export function definePresenter<TSchema extends ZodType<any, any, any>>(
    config: Omit<PresenterConfig<TSchema['_output']>, 'schema'> & { schema: TSchema },
): Presenter<TSchema['_output']>;

/**
 * Define a Presenter without a schema (untyped data passthrough).
 *
 * @param config - Configuration without a schema field
 * @returns A Presenter that passes data through without validation
 */
export function definePresenter(
    config: PresenterConfig<unknown> & { schema?: undefined },
): Presenter<unknown>;

/**
 * Implementation
 * @internal
 */
export function definePresenter(config: PresenterConfig<unknown>): Presenter<unknown> {
    const presenter = new Presenter<unknown>(config.name);

    // Resolve the Zod schema (supports both raw ZodType and Model objects)
    let resolvedSchema: ZodType | undefined;
    if (config.schema) {
        // Support passing a Model object directly (duck-type detection)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — duck-type detection for Model vs raw ZodType
        const schemaVal = config.schema as any;
        if (schemaVal && typeof schemaVal === 'object' && 'fields' in schemaVal && 'schema' in schemaVal) {
            resolvedSchema = schemaVal.schema;
        } else {
            resolvedSchema = config.schema;
        }
        presenter.schema(resolvedSchema!);
    }

    // ── Zod-Driven Prompts: auto-extract .describe() annotations ──
    const autoRules = config.autoRules !== false; // default: true
    const zodDescriptions = (autoRules && resolvedSchema)
        ? extractZodDescriptions(resolvedSchema)
        : [];

    if (config.rules) {
        if (typeof config.rules === 'function') {
            // Dynamic rules — wrap to prepend Zod descriptions
            if (zodDescriptions.length > 0) {
                const dynamicFn = config.rules;
                presenter.systemRules((data: unknown, ctx?: unknown) => [
                    ...zodDescriptions,
                    ...dynamicFn(data, ctx),
                ]);
            } else {
                presenter.systemRules(config.rules as (data: unknown, ctx?: unknown) => (string | null)[]);
            }
        } else {
            // Static rules — merge with Zod descriptions
            const merged = [...zodDescriptions, ...config.rules];
            presenter.systemRules(merged);
        }
    } else if (zodDescriptions.length > 0) {
        // No explicit rules — use Zod descriptions alone
        presenter.systemRules(zodDescriptions);
    }

    if (config.ui) {
        presenter.uiBlocks(config.ui);
    }

    if (config.collectionUi) {
        presenter.collectionUiBlocks(config.collectionUi);
    }

    if (config.agentLimit) {
        presenter.agentLimit(config.agentLimit.max, config.agentLimit.onTruncate);
    }

    if (config.suggestActions) {
        presenter.suggestActions(config.suggestActions);
    }

    if (config.embeds) {
        for (const embed of config.embeds) {
            presenter.embed(embed.key, embed.presenter);
        }
    }

    if (config.redactPII) {
        presenter.redactPII(config.redactPII.paths, config.redactPII.censor);
    }

    if (config.collectionSuggestions) {
        presenter.collectionSuggestActions(config.collectionSuggestions);
    }

    if (config.collectionRules) {
        presenter.collectionRules(config.collectionRules);
    }

    // Async callbacks
    if (config.asyncUi) {
        presenter.asyncUiBlocks(config.asyncUi as (item: unknown, ctx?: unknown) => Promise<(UiBlock | null)[]>);
    }
    if (config.asyncCollectionUi) {
        presenter.asyncCollectionUiBlocks(config.asyncCollectionUi as (items: unknown[], ctx?: unknown) => Promise<(UiBlock | null)[]>);
    }
    if (config.asyncRules) {
        presenter.asyncRules(config.asyncRules as (data: unknown, ctx?: unknown) => Promise<(string | null)[]>);
    }
    if (config.asyncSuggestActions) {
        presenter.asyncSuggestActions(config.asyncSuggestActions as (data: unknown, ctx?: unknown) => Promise<(ActionSuggestion | null)[]>);
    }

    return presenter;
}

// ── Composition ──────────────────────────────────────────

/**
 * Merge strategy for `extendPresenter()`:
 *
 * | Field                 | Strategy                                 |
 * |---|---|
 * | `name`                | Override wins (required)                 |
 * | `schema`              | Override wins (required)                 |
 * | `rules`               | Merge: base static + override. Chain if both dynamic |
 * | `ui` / `collectionUi` | Override wins (if defined)               |
 * | `agentLimit`          | Override wins (if defined)               |
 * | `suggestActions`      | Override wins (if defined)               |
 * | `collectionSuggestions` | Override wins (if defined)             |
 * | `embeds`              | Merge: `[...base, ...override]`          |
 * | `redactPII`           | Merge paths: `[...base, ...override]`    |
 * | `collectionRules`     | Override wins (if defined)               |
 * | `autoRules`           | Override wins (if defined)               |
 */

/**
 * Create a Presenter by extending a base config with overrides.
 *
 * This is the Presenter composition pattern — reuse rules, redaction,
 * embeds, and other config from a shared base without repetition.
 *
 * @typeParam TSchema - Zod schema type (inferred from overrides)
 * @param base - Base Presenter config to inherit from
 * @param overrides - Override config (name and schema required)
 * @returns A fully-configured {@link Presenter} with merged config
 *
 * @example
 * ```typescript
 * const BaseFinancial = {
 *   rules: ['CRITICAL: amounts in CENTS. Divide by 100.'],
 *   redactPII: { paths: ['*.ssn'] },
 * };
 *
 * const InvoicePresenter = extendPresenter(BaseFinancial, {
 *   name: 'Invoice',
 *   schema: invoiceSchema,
 *   ui: (inv) => [ui.echarts(...)],
 * });
 * // → rules from BaseFinancial + schema/ui from overrides
 * ```
 */
export function extendPresenter<TSchema extends ZodType<any, any, any>>(
    base: Partial<PresenterConfig<any>>,
    overrides: Partial<PresenterConfig<TSchema['_output']>> & { schema: TSchema; name: string },
): Presenter<TSchema['_output']>;

/**
 * Extend without a schema (the override must still provide `name`).
 */
export function extendPresenter(
    base: Partial<PresenterConfig<any>>,
    overrides: Partial<PresenterConfig<unknown>> & { name: string; schema?: undefined },
): Presenter<unknown>;

/**
 * Implementation
 * @internal
 */
export function extendPresenter(
    base: Partial<PresenterConfig<unknown>>,
    overrides: Partial<PresenterConfig<unknown>> & { name: string },
): Presenter<unknown> {
    const merged: Record<string, unknown> = {
        // Name and schema: override always wins
        name: overrides.name,

        // Auto-rules: override wins when explicitly set
        autoRules: overrides.autoRules ?? base.autoRules,

        // Rules: merge strategy
        rules: _mergeRules(base.rules, overrides.rules),

        // UI: override wins if defined
        ui: overrides.ui ?? base.ui,
        collectionUi: overrides.collectionUi ?? base.collectionUi,

        // Agent limit: override wins if defined
        agentLimit: overrides.agentLimit ?? base.agentLimit,

        // Suggestions: override wins if defined
        suggestActions: overrides.suggestActions ?? base.suggestActions,
        collectionSuggestions: overrides.collectionSuggestions ?? base.collectionSuggestions,

        // Collection rules: override wins if defined
        collectionRules: overrides.collectionRules ?? base.collectionRules,

        // Embeds: merge (additive)
        embeds: [
            ...(base.embeds ?? []),
            ...(overrides.embeds ?? []),
        ],

        // Redaction: merge paths
        redactPII: _mergeRedactPII(base.redactPII, overrides.redactPII),

        // Async callbacks: override wins if defined
        asyncUi: overrides.asyncUi ?? base.asyncUi,
        asyncCollectionUi: overrides.asyncCollectionUi ?? base.asyncCollectionUi,
        asyncRules: overrides.asyncRules ?? base.asyncRules,
        asyncSuggestActions: overrides.asyncSuggestActions ?? base.asyncSuggestActions,
    };

    // Schema: override wins, set only if defined (exactOptionalPropertyTypes)
    const schema = overrides.schema ?? base.schema;
    if (schema) merged['schema'] = schema;

    // Remove undefined values to satisfy exactOptionalPropertyTypes
    for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) delete merged[key];
    }

    return definePresenter(merged as unknown as PresenterConfig<unknown> & { schema: any });
}

/**
 * Merge two rules configs: static arrays are concatenated, dynamic functions are chained.
 * @internal
 */
function _mergeRules(
    base?: PresenterConfig<unknown>['rules'],
    override?: PresenterConfig<unknown>['rules'],
): PresenterConfig<unknown>['rules'] {
    if (!base) return override;
    if (!override) return base;

    const baseIsStatic = typeof base !== 'function';
    const overrideIsStatic = typeof override !== 'function';

    // Both static: concatenate
    if (baseIsStatic && overrideIsStatic) {
        return [...(base as readonly string[]), ...(override as readonly string[])];
    }

    // Mix or both dynamic: chain
    const baseFn = baseIsStatic
        ? () => [...(base as readonly string[])]
        : base as (data: unknown, ctx?: unknown) => (string | null)[];
    const overrideFn = overrideIsStatic
        ? () => [...(override as readonly string[])]
        : override as (data: unknown, ctx?: unknown) => (string | null)[];

    return (data: unknown, ctx?: unknown) => [
        ...baseFn(data, ctx),
        ...overrideFn(data, ctx),
    ];
}

/**
 * Merge two redactPII configurations by concatenating paths.
 * The override's censor function takes priority.
 * @internal
 */
function _mergeRedactPII(
    base?: PresenterConfig<unknown>['redactPII'],
    override?: PresenterConfig<unknown>['redactPII'],
): PresenterConfig<unknown>['redactPII'] {
    if (!base) return override;
    if (!override) return base;

    const result: { paths: string[]; censor?: string | ((value: unknown) => string) } = {
        paths: [...base.paths, ...override.paths],
    };
    const censor = override.censor ?? base.censor;
    if (censor !== undefined) result.censor = censor;
    return result;
}
