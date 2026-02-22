/**
 * ResponseBuilder — Fluent Multi-Block Response Composer
 *
 * Standalone builder for composing rich, multi-content-block MCP
 * responses. Each semantic layer (data, UI blocks, system rules,
 * LLM hints) becomes a separate content block in the response array,
 * following MCP's multimodal content design.
 *
 * Inspired by Next.js's `NextResponse` — the builder is a standalone
 * function, keeping `ctx` pure and the response testable.
 *
 * @example
 * ```typescript
 * import { response, ui } from '@vinkius-core/mcp-fusion';
 *
 * // Simple data response (equivalent to success())
 * return response({ id: '123', amount: 4500 }).build();
 *
 * // Rich multi-block response
 * return response(data)
 *     .uiBlock(ui.echarts(chartConfig))
 *     .llmHint('Divide amounts by 100 before displaying.')
 *     .systemRules(['Use $ for currency', 'Emojis: ✅ Paid'])
 *     .build();
 * ```
 *
 * @see {@link response} for the factory function
 * @see {@link Presenter} for automatic response composition
 *
 * @module
 */
import { type ToolResponse } from '../response.js';
import { type UiBlock } from './ui.js';

/** A suggested next action for HATEOAS-style agent guidance */
export interface ActionSuggestion {
    readonly tool: string;
    readonly reason: string;
}

// ── Brand ────────────────────────────────────────────────

const RESPONSE_BUILDER_BRAND = 'FusionResponseBuilder' as const;

/**
 * Check if a value is a {@link ResponseBuilder} instance.
 *
 * Used by the execution pipeline to auto-call `.build()` when
 * a handler returns a builder without explicitly calling `.build()`.
 *
 * @param value - Any value returned by a handler
 * @returns `true` if the value is a ResponseBuilder
 */
export function isResponseBuilder(value: unknown): value is ResponseBuilder {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__brand' in value &&
        (value as { __brand: unknown }).__brand === RESPONSE_BUILDER_BRAND
    );
}

// ── ResponseBuilder ──────────────────────────────────────

/**
 * Fluent builder for multi-content-block MCP responses.
 *
 * Each method appends a semantic layer. The final `.build()` compiles
 * all layers into an array of `{ type: "text", text: "..." }` blocks,
 * one per layer, following MCP's multimodal content specification.
 *
 * Content block order:
 * 1. Data (JSON-serialized raw data)
 * 2. UI Blocks (fenced code blocks from Presenter/manual)
 * 3. Raw Blocks (merged from embedded child Presenters)
 * 4. LLM Hints (inline directives)
 * 5. System Rules (domain-level `[DOMAIN RULES]` block)
 * 6. Action Suggestions (HATEOAS-style `[SYSTEM HINT]` block)
 *
 * @see {@link response} for the factory function
 */
export class ResponseBuilder {
    /** @internal Brand for instanceof-free detection in the pipeline */
    readonly __brand = RESPONSE_BUILDER_BRAND;

    private readonly _data: string;
    private readonly _uiBlocks: UiBlock[] = [];
    private readonly _hints: string[] = [];
    private readonly _rules: string[] = [];
    private readonly _suggestions: ActionSuggestion[] = [];
    private readonly _rawBlocks: string[] = [];

    /** @internal Use {@link response} factory instead */
    constructor(data: string | object) {
        this._data = typeof data === 'string'
            ? (data || 'OK')
            : JSON.stringify(data, null, 2);
    }

    /**
     * Append a UI block to the response.
     *
     * Each UI block becomes a separate content entry in the MCP response,
     * with a system instruction for the LLM to pass it through unchanged.
     *
     * Accepts either a {@link UiBlock} object (recommended) or a manual
     * `(type, content)` pair.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * // ✅ Recommended: pass a UiBlock directly
     * response(data).uiBlock(ui.echarts(chartConfig)).build();
     *
     * // Also valid: manual type + content
     * response(data).uiBlock('echarts', '```echarts\n{...}\n```').build();
     * ```
     */
    uiBlock(block: UiBlock): this;
    uiBlock(type: string, content: string): this;
    uiBlock(blockOrType: UiBlock | string, content?: string): this {
        if (typeof blockOrType === 'object') {
            this._uiBlocks.push(blockOrType);
        } else {
            this._uiBlocks.push({ type: blockOrType, content: content! });
        }
        return this;
    }

    /**
     * Append pre-built UI blocks (from a Presenter's SSR layer).
     *
     * @param blocks - Array of {@link UiBlock} objects
     * @returns `this` for chaining
     *
     * @internal Used by the Presenter engine
     */
    uiBlocks(blocks: readonly UiBlock[]): this {
        this._uiBlocks.push(...blocks);
        return this;
    }

    /**
     * Append an inline LLM hint to the response.
     *
     * Hints are action-specific directives that guide the LLM's
     * behavior for this particular response. Unlike system rules,
     * hints are typically added manually in handlers for dynamic context.
     *
     * @param hint - Directive text for the LLM
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * response(invoice)
     *     .llmHint('This client has an overdue balance. Mention it.')
     *     .build();
     * ```
     */
    llmHint(hint: string): this {
        this._hints.push(hint);
        return this;
    }

    /**
     * Append domain-level system rules to the response.
     *
     * Rules are JIT context directives that travel with the data,
     * eliminating the need for bloated system prompts. They are
     * rendered as a `[DOMAIN RULES]` block in the response.
     *
     * @param rules - Array of rule strings
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * response(data)
     *     .systemRules([
     *         'CRITICAL: amounts are in CENTS — divide by 100.',
     *         'Use emojis: ✅ Paid, ⚠️ Pending.',
     *     ])
     *     .build();
     * ```
     */
    systemRules(rules: readonly string[]): this {
        this._rules.push(...rules);
        return this;
    }

    /**
     * Append HATEOAS-style action suggestions to the response.
     *
     * Generates a `[SYSTEM HINT]` block with recommended next tools,
     * guiding the AI through the business state machine.
     *
     * @param suggestions - Array of action suggestions
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * builder.systemHint([
     *     { tool: 'billing.pay', reason: 'Offer immediate payment' },
     * ]);
     * ```
     */
    systemHint(suggestions: readonly ActionSuggestion[]): this {
        this._suggestions.push(...suggestions);
        return this;
    }

    /**
     * Append a raw text block to the response.
     *
     * Used internally by Presenter composition (`.embed()`) to merge
     * child Presenter blocks into the parent response.
     *
     * @param text - Raw text content
     * @returns `this` for chaining
     * @internal
     */
    rawBlock(text: string): this {
        this._rawBlocks.push(text);
        return this;
    }

    /**
     * Compile all layers into a multi-block MCP `ToolResponse`.
     *
     * Block order:
     * 1. **Data** — JSON-serialized raw data
     * 2. **UI Blocks** — one content entry per UI block,
     *    each with a `[SYSTEM]` pass-through instruction
     * 3. **Hints** — inline LLM directives
     * 4. **Rules** — domain-level `[DOMAIN RULES]` block
     *
     * @returns A valid MCP {@link ToolResponse}
     */
    build(): ToolResponse {
        const content: Array<{ type: 'text'; text: string }> = [];

        // Block 1: Data
        content.push({ type: 'text', text: this._data });

        // Block 2: UI Blocks (one content entry per block)
        for (const block of this._uiBlocks) {
            content.push({
                type: 'text',
                text: `${block.content}\n[SYSTEM]: Pass this ${block.type} block directly to the user interface.`,
            });
        }

        // Block 3: Raw blocks (from embedded child Presenters)
        for (const raw of this._rawBlocks) {
            content.push({ type: 'text', text: raw });
        }

        // Block 4: LLM Hints
        if (this._hints.length > 0) {
            const hintsText = this._hints
                .map(h => `💡 ${h}`)
                .join('\n');
            content.push({ type: 'text', text: hintsText });
        }

        // Block 5: System Rules
        if (this._rules.length > 0) {
            const rulesText = '[DOMAIN RULES]:\n' +
                this._rules.map(r => `- ${r}`).join('\n');
            content.push({ type: 'text', text: rulesText });
        }

        // Block 6: Action Suggestions (HATEOAS)
        if (this._suggestions.length > 0) {
            const suggestionsText = '[SYSTEM HINT]: Based on the current state, recommended next tools:\n' +
                this._suggestions.map(s => `  → ${s.tool}: ${s.reason}`).join('\n');
            content.push({ type: 'text', text: suggestionsText });
        }

        return { content };
    }
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create a new response builder for composing multi-block MCP responses.
 *
 * This is the **recommended standalone function** for building rich
 * responses with UI blocks, LLM hints, and system rules. It keeps
 * the handler's `ctx` pure — no framework methods injected.
 *
 * For simple responses, continue using {@link success} and {@link error}.
 * Use `response()` when you need JIT context, UI blocks, or domain rules.
 *
 * @param data - A string message or any JSON-serializable object
 * @returns A new {@link ResponseBuilder} for chaining
 *
 * @example
 * ```typescript
 * import { response, ui } from '@vinkius-core/mcp-fusion';
 *
 * // Simple (equivalent to success())
 * return response('Task created').build();
 *
 * // Rich multi-block response
 * return response(sprintData)
 *     .uiBlock(ui.echarts(burndownConfig))
 *     .llmHint('Summarize the sprint progress analytically.')
 *     .systemRules(['Use tables for task lists.'])
 *     .build();
 * ```
 *
 * @see {@link ResponseBuilder} for all available methods
 * @see {@link Presenter} for automatic response composition
 */
export function response(data: string | object): ResponseBuilder {
    return new ResponseBuilder(data);
}

/**
 * Build a complete response in one call.
 *
 * Shorthand for `response(data).build()` — the fastest path
 * to a valid multi-block response.
 *
 * @param data - A string message or JSON-serializable object
 * @returns A ready-to-return {@link ToolResponse}
 *
 * @example
 * ```typescript
 * return response.ok('Task created');
 * return response.ok({ id: '123', name: 'Acme' });
 * ```
 */
response.ok = function ok(data: string | object): ReturnType<ResponseBuilder['build']> {
    return new ResponseBuilder(data).build();
};

/**
 * Build a response with domain rules in one call.
 *
 * Shorthand for `response(data).systemRules(rules).build()`.
 *
 * @param data - A string message or JSON-serializable object
 * @param rules - Array of domain rule strings
 * @returns A ready-to-return {@link ToolResponse}
 *
 * @example
 * ```typescript
 * return response.withRules(invoiceData, [
 *     'CRITICAL: amounts are in CENTS — divide by 100.',
 *     'Use emojis: ✅ Paid, ⚠️ Pending.',
 * ]);
 * ```
 */
response.withRules = function withRules(
    data: string | object,
    rules: readonly string[],
): ReturnType<ResponseBuilder['build']> {
    return new ResponseBuilder(data).systemRules(rules).build();
};
