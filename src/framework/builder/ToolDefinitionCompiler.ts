/**
 * ToolDefinitionCompiler — Build-Time Tool Compilation Strategy
 *
 * Compiles the internal state of a GroupedToolBuilder into an MCP Tool definition.
 * Orchestrates all build-time strategies (description, schema, annotations, middleware)
 * and produces the pre-cached execution context.
 *
 * Pure-function module: receives config, returns compiled result.
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type InternalAction, type MiddlewareFn } from '../types.js';
import { type ExecutionContext } from '../execution/ExecutionPipeline.js';
import { type CompiledChain, compileMiddlewareChains } from '../execution/MiddlewareCompiler.js';
import { generateDescription } from '../schema/DescriptionGenerator.js';
import { generateToonDescription } from '../schema/ToonDescriptionGenerator.js';
import { generateInputSchema } from '../schema/SchemaGenerator.js';
import { aggregateAnnotations } from '../schema/AnnotationAggregator.js';

// ── Types ────────────────────────────────────────────────

/** Input configuration for the compiler */
export interface CompilerInput<TContext> {
    readonly name: string;
    readonly description: string | undefined;
    readonly discriminator: string;
    readonly toonMode: boolean;
    readonly hasGroup: boolean;
    readonly actions: readonly InternalAction<TContext>[];
    readonly middlewares: readonly MiddlewareFn<TContext>[];
    readonly commonSchema: ZodObject<ZodRawShape> | undefined;
    readonly annotations: Record<string, unknown> | undefined;
}

/** Output of the compiler: the tool definition + execution-time caches */
export interface CompilerOutput<TContext> {
    readonly tool: McpTool;
    readonly executionContext: ExecutionContext<TContext>;
    readonly compiledChain: CompiledChain<TContext>;
    readonly actionMap: Map<string, InternalAction<TContext>>;
    readonly validationSchemaCache: Map<string, ZodObject<ZodRawShape> | null>;
}

// ── Compiler ─────────────────────────────────────────────

export function compileToolDefinition<TContext>(
    input: CompilerInput<TContext>,
): CompilerOutput<TContext> {
    if (input.actions.length === 0) {
        throw new Error(`Builder "${input.name}" has no actions registered.`);
    }

    const descriptionFn = input.toonMode ? generateToonDescription : generateDescription;
    const description = descriptionFn(
        input.actions as InternalAction<TContext>[],
        input.name,
        input.description,
        input.hasGroup,
    );
    const inputSchema = generateInputSchema(
        input.actions as InternalAction<TContext>[],
        input.discriminator,
        input.hasGroup,
        input.commonSchema,
    );
    const annotations = aggregateAnnotations(
        input.actions as InternalAction<TContext>[],
        input.annotations,
    );

    const tool: McpTool = { name: input.name, description, inputSchema };
    if (Object.keys(annotations).length > 0) {
        Object.defineProperty(tool, 'annotations', { value: annotations, enumerable: true });
    }

    const compiledChain = compileMiddlewareChains(
        input.actions as InternalAction<TContext>[],
        input.middlewares as MiddlewareFn<TContext>[],
    );

    const actionMap = new Map(input.actions.map(a => [a.key, a]));

    const validationSchemaCache = new Map<string, ZodObject<ZodRawShape> | null>();
    for (const action of input.actions) {
        validationSchemaCache.set(action.key, buildValidationSchema(action, input.commonSchema));
    }

    const actionKeysString = input.actions.map(a => a.key).join(', ');

    const executionContext: ExecutionContext<TContext> = {
        actionMap, compiledChain, validationSchemaCache,
        actionKeysString, discriminator: input.discriminator, toolName: input.name,
    };

    return { tool, executionContext, compiledChain, actionMap, validationSchemaCache };
}

function buildValidationSchema<TContext>(
    action: InternalAction<TContext>,
    commonSchema: ZodObject<ZodRawShape> | undefined,
): ZodObject<ZodRawShape> | null {
    const base = applyCommonSchemaOmit(commonSchema, action.omitCommonFields);
    const specific = action.schema;
    if (!base && !specific) return null;
    const merged = base && specific ? base.merge(specific) : (base ?? specific);
    if (!merged) return null;
    return merged.strip();
}

/**
 * Apply surgical field omission to the common schema.
 *
 * Returns `undefined` if all common fields were omitted or if
 * the common schema is undefined.
 */
function applyCommonSchemaOmit(
    schema: ZodObject<ZodRawShape> | undefined,
    omitFields: readonly string[] | undefined,
): ZodObject<ZodRawShape> | undefined {
    if (!schema || (omitFields?.length ?? 0) === 0) return schema;

    const omitMask = Object.fromEntries(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        omitFields!
            .filter(f => f in schema.shape)
            .map(f => [f, true]),
    ) as { [k: string]: true };

    if (Object.keys(omitMask).length === 0) return schema;

    const reduced = schema.omit(omitMask);
    return Object.keys(reduced.shape).length > 0 ? reduced : undefined;
}
