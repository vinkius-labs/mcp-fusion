/**
 * PromptBuilderImpl — Internal Prompt Builder Implementation
 *
 * Implements the {@link PromptBuilder} interface for use by
 * `definePrompt()` and `PromptRegistry`.
 *
 * Responsibilities:
 * - Stores prompt metadata (name, description, tags, middleware)
 * - Compiles Zod schema from ParamsMap (or uses raw Zod)
 * - Validates flat schema constraint at construction time
 * - Builds MCP Prompt definition for `prompts/list`
 * - Delegates hydration to `PromptExecutionPipeline`
 *
 * @internal
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import {
    type PromptBuilder,
    type PromptResult,
    type PromptParamsMap,
    type PromptParamDef,
    type InferPromptArgs,
} from './PromptTypes.js';
import { type MiddlewareFn } from '../types.js';
import { convertParamsToZod, type ParamsMap } from '../builder/ParamDescriptors.js';
import { assertFlatSchema, executePromptPipeline } from './PromptExecutionPipeline.js';

// ── Helpers ──────────────────────────────────────────────

/**
 * Detect whether the args value is a ParamsMap (JSON descriptors)
 * or a Zod schema.
 */
function isZodSchema(value: unknown): value is ZodObject<ZodRawShape> {
    return (
        typeof value === 'object' &&
        value !== null &&
        '_def' in value &&
        typeof (value as { _def: unknown })._def === 'object'
    );
}

/**
 * Extract argument metadata from a Zod schema for `prompts/list`.
 *
 * Reads field names, descriptions, and optionality from the schema shape
 * to build the MCP `PromptArgument[]` array.
 */
function extractArgumentMeta(
    schema: ZodObject<ZodRawShape>,
): Array<{ name: string; description?: string; required?: boolean }> {
    const args: Array<{ name: string; description?: string; required?: boolean }> = [];

    for (const [key, field] of Object.entries(schema.shape)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const def = (field as any)._def;
        const isOptional = def?.typeName === 'ZodOptional' || def?.typeName === 'ZodDefault';
        const description = (field as { description?: string }).description ?? def?.description;

        const argMeta: { name: string; description?: string; required?: boolean } = {
            name: key,
            required: !isOptional,
        };
        if (typeof description === 'string') {
            argMeta.description = description;
        }
        args.push(argMeta);
    }

    return args;
}

// ── PromptBuilderImpl ────────────────────────────────────

export class PromptBuilderImpl<TContext = void> implements PromptBuilder<TContext> {
    private readonly _name: string;
    private readonly _title: string | undefined;
    private readonly _description: string | undefined;
    private readonly _icons: { light?: string; dark?: string } | undefined;
    private readonly _tags: string[];
    private readonly _middlewares: readonly MiddlewareFn<TContext>[];
    private readonly _schema: ZodObject<ZodRawShape> | undefined;
    private readonly _handler: (ctx: TContext, args: Record<string, unknown>) => Promise<PromptResult>;

    constructor(
        name: string,
        config: {
            title?: string;
            description?: string;
            icons?: { light?: string; dark?: string };
            tags?: string[];
            middleware?: MiddlewareFn<TContext>[];
            schema?: ZodObject<ZodRawShape>;
            handler: (ctx: TContext, args: Record<string, unknown>) => Promise<PromptResult>;
        },
    ) {
        this._name = name;
        this._title = config.title;
        this._description = config.description;
        this._icons = config.icons;
        this._tags = config.tags ?? [];
        this._middlewares = config.middleware ?? [];
        this._schema = config.schema;
        this._handler = config.handler;
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

    buildPromptDefinition(): {
        name: string;
        title?: string;
        description?: string;
        icons?: { light?: string; dark?: string };
        arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    } {
        const def: {
            name: string;
            title?: string;
            description?: string;
            icons?: { light?: string; dark?: string };
            arguments?: Array<{ name: string; description?: string; required?: boolean }>;
        } = { name: this._name };

        if (this._title) {
            def.title = this._title;
        }

        if (this._description) {
            def.description = this._description;
        }

        if (this._icons) {
            def.icons = this._icons;
        }

        if (this._schema) {
            def.arguments = extractArgumentMeta(this._schema);
        }

        return def;
    }

    async execute(ctx: TContext, args: Record<string, string>): Promise<PromptResult> {
        return executePromptPipeline(
            ctx,
            args,
            this._schema,
            this._middlewares,
            this._handler,
        );
    }
}

// ── Shared Config Shape ──────────────────────────────────

interface PromptConfigBase<TContext> {
    title?: string;
    description?: string;
    icons?: { light?: string; dark?: string };
    tags?: string[];
    middleware?: MiddlewareFn<TContext>[];
}

// ── definePrompt() Overloads ─────────────────────────────

/**
 * Overload 1: Zod schema — full type inference via `z.infer<>`
 *
 * ```typescript
 * definePrompt<AppContext>('audit', {
 *     args: z.object({ month: z.string(), strict: z.boolean() }),
 *     handler: async (ctx, { month, strict }) => { ... }
 *     //                     ^^^^^  ^^^^^^  ← fully typed!
 * });
 * ```
 */
export function definePrompt<TContext = void, S extends ZodRawShape = ZodRawShape>(
    name: string,
    config: PromptConfigBase<TContext> & {
        args: ZodObject<S>;
        handler: (ctx: TContext, args: ZodObject<S>["_output"]) => Promise<PromptResult>;
    },
): PromptBuilder<TContext>;

/**
 * Overload 2: JSON-first descriptors — type inference via `InferPromptArgs<>`
 *
 * ```typescript
 * definePrompt('greet', {
 *     args: {
 *         name: { type: 'string', required: true },
 *         age:  'number',
 *     } as const,
 *     handler: async (ctx, { name, age }) => { ... }
 *     //                     ^^^^  ^^^  ← name: string, age: number!
 * });
 * ```
 *
 * > 💡 Use `as const` on the args object for full literal type inference.
 */
export function definePrompt<TContext = void, T extends Record<string, PromptParamDef> = Record<string, PromptParamDef>>(
    name: string,
    config: PromptConfigBase<TContext> & {
        args: T;
        handler: (ctx: TContext, args: InferPromptArgs<T>) => Promise<PromptResult>;
    },
): PromptBuilder<TContext>;

// ── Implementation ───────────────────────────────────────

export function definePrompt<TContext = void>(
    name: string,
    config: PromptConfigBase<TContext> & {
        args?: PromptParamsMap | ZodObject<ZodRawShape>;
        handler: (ctx: TContext, args: Record<string, unknown>) => Promise<PromptResult>;
    },
): PromptBuilder<TContext> {
    // Compile args to Zod schema
    let schema: ZodObject<ZodRawShape> | undefined;

    if (config.args) {
        if (isZodSchema(config.args)) {
            schema = config.args;
        } else {
            schema = convertParamsToZod(config.args as ParamsMap);
        }

        // Enforce flat schema constraint at definition time
        assertFlatSchema(schema);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new PromptBuilderImpl<TContext>(name, {
        title: config.title,
        description: config.description,
        icons: config.icons,
        tags: config.tags,
        middleware: config.middleware,
        schema,
        handler: config.handler,
    } as any);
}
