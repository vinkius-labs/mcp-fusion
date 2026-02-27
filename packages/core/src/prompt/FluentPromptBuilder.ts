/**
 * FluentPromptBuilder — Chainable Prompt Definition API
 *
 * Provides a builder-pattern alternative to the config-bag `definePrompt()`.
 * Follows the same architectural pattern as `FluentToolBuilder`.
 *
 * @example
 * ```typescript
 * const greet = f.prompt('greet')
 *     .describe('Greet a user by name')
 *     .input({ name: f.string() })
 *     .handler(async (ctx, { name }) => ({
 *         messages: [PromptMessage.user(`Hello ${name}!`)],
 *     }));
 * ```
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import {
    type PromptBuilder,
    type PromptResult,
    type PromptParamsMap,
    type LoopbackContext,
} from './types.js';
import { type MiddlewareFn } from '../core/types.js';
import { definePrompt } from './definePrompt.js';

// ============================================================================
// FluentPromptBuilder
// ============================================================================

/**
 * Chainable builder for MCP Prompts.
 *
 * Each setter returns `this` for chaining. Finalisation happens lazily
 * when the `PromptBuilder` interface methods are accessed — this means
 * you can pass a `FluentPromptBuilder` directly to `PromptRegistry.register()`.
 *
 * @typeParam TContext - Application context type (inherited from `initFusion`)
 * @typeParam TArgs - Inferred argument type from the schema
 */
export class FluentPromptBuilder<TContext = void, TArgs extends Record<string, unknown> = Record<string, unknown>>
    implements PromptBuilder<TContext>
{
    private readonly _name: string;
    private _title?: string;
    private _description?: string;
    private _icons?: { light?: string; dark?: string };
    private _tags: string[] = [];
    private _middlewares: MiddlewareFn<TContext>[] = [];
    private _args?: PromptParamsMap | ZodObject<ZodRawShape>;
    private _hydrationTimeout?: number;
    private _handler?: (ctx: TContext & LoopbackContext, args: TArgs) => Promise<PromptResult>;

    /** @internal Cached delegate built on first access to PromptBuilder methods */
    private _delegate: PromptBuilder<TContext> | undefined;

    constructor(name: string) {
        this._name = name;
    }

    // ── Chainable Setters ────────────────────────────────

    /**
     * Set a human-readable title for UI display.
     *
     * @param title - The prompt title
     * @returns `this` for chaining
     */
    title(title: string): this {
        this._title = title;
        this._delegate = undefined;
        return this;
    }

    /**
     * Set the prompt description shown in the slash command palette.
     *
     * @param description - Human-readable description
     * @returns `this` for chaining
     */
    describe(description: string): this {
        this._description = description;
        this._delegate = undefined;
        return this;
    }

    /**
     * Set icons for light/dark themes.
     *
     * @param icons - Icon paths for light and/or dark themes
     * @returns `this` for chaining
     */
    icons(icons: { light?: string; dark?: string }): this {
        this._icons = icons;
        this._delegate = undefined;
        return this;
    }

    /**
     * Set capability tags for selective exposure.
     *
     * @param tags - Tag strings for filtering
     * @returns `this` for chaining
     */
    tags(...tags: string[]): this {
        this._tags = tags;
        this._delegate = undefined;
        return this;
    }

    /**
     * Define the input schema for prompt arguments.
     *
     * Accepts the same formats as `FluentToolBuilder.input()`:
     * - Fluent param descriptors (`f.string()`, `f.number()`, etc.) — zero imports
     * - Zod schema for power users
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * // Fluent descriptors (recommended — zero Zod imports)
     * f.prompt('greet')
     *     .input({ name: f.string(), age: f.number().optional() })
     *     .handler(async (ctx, { name, age }) => ({ ... }));
     *
     * // Zod schema (advanced)
     * f.prompt('search')
     *     .input(z.object({ query: z.string().min(1) }))
     *     .handler(async (ctx, { query }) => ({ ... }));
     * ```
     */
    input<S extends ZodRawShape>(schema: ZodObject<S>): FluentPromptBuilder<TContext, ZodObject<S>['_output']>;
    input(params: PromptParamsMap): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input(schemaOrParams: ZodObject<ZodRawShape> | PromptParamsMap): any {
        this._args = schemaOrParams;
        this._delegate = undefined;
        return this;
    }

    /**
     * Add middleware to the prompt's execution pipeline.
     *
     * Middleware runs in registration order around the handler
     * (same onion model as tool middleware).
     *
     * @param fns - Middleware functions
     * @returns `this` for chaining
     */
    use(...fns: MiddlewareFn<TContext>[]): this {
        this._middlewares.push(...fns);
        this._delegate = undefined;
        return this;
    }

    /**
     * Set the maximum hydration time in milliseconds.
     *
     * If the handler doesn't complete within this time,
     * the framework returns a graceful SYSTEM ALERT.
     *
     * @param ms - Timeout in milliseconds
     * @returns `this` for chaining
     */
    timeout(ms: number): this {
        this._hydrationTimeout = ms;
        this._delegate = undefined;
        return this;
    }

    /**
     * Set the hydration handler.
     *
     * This is the terminal method — after calling `.handler()`,
     * the builder is ready to be registered.
     *
     * @param fn - Handler function receiving `(ctx, args)` → `PromptResult`
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * .handler(async (ctx, { name }) => ({
     *     messages: [PromptMessage.user(`Hello ${name}!`)],
     * }))
     * ```
     */
    handler(fn: (ctx: TContext & LoopbackContext, args: TArgs) => Promise<PromptResult>): this {
        this._handler = fn;
        this._delegate = undefined;
        return this;
    }

    // ── PromptBuilder Interface (delegation) ─────────────

    /** @internal Build the underlying PromptBuilder delegate lazily */
    private _build(): PromptBuilder<TContext> {
        if (this._delegate) return this._delegate;

        if (!this._handler) {
            throw new Error(
                `FluentPromptBuilder('${this._name}'): .handler() must be called before the prompt can be used.`,
            );
        }

        this._delegate = definePrompt<TContext>(this._name, {
            title: this._title,
            description: this._description,
            icons: this._icons,
            tags: this._tags.length > 0 ? this._tags : undefined,
            middleware: this._middlewares.length > 0 ? this._middlewares : undefined,
            args: this._args,
            hydrationTimeout: this._hydrationTimeout,
            handler: this._handler,
        } as never);

        return this._delegate;
    }

    getName(): string {
        return this._name;
    }

    getDescription(): string | undefined {
        return this._description;
    }

    getTags(): string[] {
        return this._tags;
    }

    hasMiddleware(): boolean {
        return this._middlewares.length > 0;
    }

    getHydrationTimeout(): number | undefined {
        return this._hydrationTimeout;
    }

    buildPromptDefinition() {
        return this._build().buildPromptDefinition();
    }

    execute(ctx: TContext, args: Record<string, string>): Promise<PromptResult> {
        return this._build().execute(ctx, args);
    }
}
