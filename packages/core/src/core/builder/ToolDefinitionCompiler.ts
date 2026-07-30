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
import type { Tool as McpTool } from "@modelcontextprotocol/server";
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
    readonly selectEnabled: boolean;
    readonly hasGroup: boolean;
    readonly actions: readonly InternalAction<TContext>[];
    readonly middlewares: readonly MiddlewareFn<TContext>[];
    readonly commonSchema: ZodObject<ZodRawShape> | undefined;
    readonly annotations: Record<string, unknown> | undefined;
    /**
     * Optional JSON Schema for the tool's output (MCP 2.0 — `2026-07-28`).
     *
     * When provided, the tool definition includes `outputSchema` so clients
     * and LLMs can validate structured results. Pair with `successStructured()`
     * to return `structuredContent` conforming to this schema.
     *
     * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema
     */
    readonly outputSchema?: Record<string, unknown> | undefined;
    /**
     * Optional human-readable display title for the tool (MCP 2.0 — `2026-07-28`).
     * Shown in client UIs alongside the tool name.
     */
    readonly title?: string | undefined;
    /**
     * Optional icons for the tool (MCP 2.0 — `2026-07-28`).
     * Array of icon objects with `src`, `mimeType?`, `sizes?`, `theme?`.
     */
    readonly icons?: ReadonlyArray<{ src: string; mimeType?: string; sizes?: readonly string[]; theme?: 'light' | 'dark' }> | undefined;
    /**
     * MCP 2.0 x-mcp-header parameter map. Keys are parameter names,
     * values are HTTP header names. Injected into inputSchema properties
     * during compilation so they survive cache invalidation.
     */
    readonly headerParams?: ReadonlyMap<string, string> | undefined;
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
    const { name, actions, middlewares, discriminator, commonSchema, annotations: explicitAnnotations } = input;

    if (actions.length === 0) {
        throw new Error(`Builder "${name}" has no actions registered.`);
    }

    // ── Build-time strategies ────────────────────────────
    const descriptionFn = input.toonMode ? generateToonDescription : generateDescription;
    const description = descriptionFn(actions, name, input.description, input.hasGroup, discriminator);
    const inputSchema = generateInputSchema(actions, discriminator, input.hasGroup, commonSchema, input.selectEnabled);
    const annotations = aggregateAnnotations(actions, explicitAnnotations);

    const tool: McpTool = { name, description, inputSchema };
    if (Object.keys(annotations).length > 0) {
        Object.defineProperty(tool, 'annotations', { value: annotations, enumerable: true });
    }
    // MCP 2.0: include outputSchema when provided (structured tool outputs)
    if (input.outputSchema && Object.keys(input.outputSchema).length > 0) {
        Object.defineProperty(tool, 'outputSchema', { value: input.outputSchema, enumerable: true });
    }
    // MCP 2.0: include title when provided (human-readable display name)
    if (input.title) {
        Object.defineProperty(tool, 'title', { value: input.title, enumerable: true });
    }
    // MCP 2.0: include icons when provided (visual identifiers for UI)
    if (input.icons && input.icons.length > 0) {
        Object.defineProperty(tool, 'icons', { value: [...input.icons], enumerable: true });
    }
    // MCP 2.0: inject x-mcp-header annotations into inputSchema properties.
    // Done during compilation (not post-build) so annotations survive cache invalidation.
    if (input.headerParams && input.headerParams.size > 0) {
        const props = tool.inputSchema?.properties as Record<string, Record<string, unknown>> | undefined;
        if (props) {
            for (const [paramName, headerName] of input.headerParams) {
                if (props[paramName]) {
                    props[paramName] = { ...props[paramName], 'x-mcp-header': headerName };
                }
            }
        }
    }

    // ── Pre-compiled caches ──────────────────────────────
    const compiledChain = compileMiddlewareChains(actions, middlewares);
    const actionMap = new Map(actions.map(a => [a.key, a]));
    const actionKeysString = actions.map(a => a.key).join(', ');
    const validationSchemaCache = new Map(
        actions.map(a => [a.key, buildValidationSchema(a, commonSchema)] as const),
    );

    const executionContext: ExecutionContext<TContext> = {
        actionMap, compiledChain, validationSchemaCache,
        actionKeysString, discriminator, toolName: name,
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
    return merged.strict();
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
         
        omitFields!
            .filter(f => f in schema.shape)
            .map(f => [f, true]),
    ) as { [k: string]: true };

    if (Object.keys(omitMask).length === 0) return schema;

    const reduced = schema.omit(omitMask);
    return Object.keys(reduced.shape).length > 0 ? reduced : undefined;
}
