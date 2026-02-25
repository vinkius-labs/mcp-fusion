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
 * import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
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
    readonly schema?: ZodType<T>;

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
 * @see {@link createPresenter} for the legacy fluent builder API
 * @see {@link Presenter} for the full Presenter class documentation
 */
export function definePresenter<TSchema extends ZodType>(
    config: PresenterConfig<TSchema['_output']> & { schema: TSchema },
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

    if (config.schema) {
        presenter.schema(config.schema);
    }

    // ── Zod-Driven Prompts: auto-extract .describe() annotations ──
    const autoRules = config.autoRules !== false; // default: true
    const zodDescriptions = (autoRules && config.schema)
        ? extractZodDescriptions(config.schema)
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

    return presenter;
}
