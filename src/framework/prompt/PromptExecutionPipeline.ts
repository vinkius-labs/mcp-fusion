/**
 * PromptExecutionPipeline — Prompt Hydration Pipeline
 *
 * Handles the complete lifecycle of a `prompts/get` request:
 *
 *   1. Schema-Informed Coercion (string → typed values)
 *   2. Zod Validation (.strict() + coaching errors)
 *   3. Middleware Chain execution
 *   4. Handler invocation
 *
 * Key feature: **Schema-Informed Boundary Coercion**
 * MCP transmits ALL prompt arguments as `Record<string, string>`.
 * This module reads the Zod schema AST to determine expected types
 * and coerces string values deterministically — no guessing.
 *
 * @module
 */
import { type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';
import { type PromptResult } from './PromptTypes.js';
import { type MiddlewareFn } from '../types.js';

// ── Flat Schema Guard ────────────────────────────────────

/** Zod type names that are NOT allowed in prompt argument schemas */
const FORBIDDEN_ZOD_TYPES = new Set([
    'ZodArray', 'ZodObject', 'ZodTuple', 'ZodRecord', 'ZodMap', 'ZodSet',
]);

/**
 * Get the base Zod type name, unwrapping Optional/Default/Nullable wrappers.
 * @internal
 */
function getZodBaseTypeName(schema: ZodTypeAny): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const def = (schema as any)._def;
    if (!def) return 'Unknown';

    const typeName: string = def.typeName ?? '';

    // Unwrap Optional, Default, Nullable, Effects to find the inner type
    if (
        typeName === 'ZodOptional' ||
        typeName === 'ZodDefault' ||
        typeName === 'ZodNullable'
    ) {
        return getZodBaseTypeName(def.innerType);
    }

    if (typeName === 'ZodEffects') {
        return getZodBaseTypeName(def.schema);
    }

    return typeName;
}

/**
 * Assert that a Zod schema only contains flat primitive fields.
 *
 * Throws a descriptive error if any field uses arrays, objects,
 * tuples, records, maps, or sets — types that MCP clients cannot
 * render as visual form fields.
 *
 * Called at **definition time** (in `definePrompt()`) to fail fast
 * and prevent runtime surprises.
 *
 * @param schema - The Zod schema to validate
 * @throws Error with coaching message if nested types are found
 */
export function assertFlatSchema(schema: ZodObject<ZodRawShape>): void {
    for (const [key, field] of Object.entries(schema.shape)) {
        const typeName = getZodBaseTypeName(field as ZodTypeAny);
        if (FORBIDDEN_ZOD_TYPES.has(typeName)) {
            throw new Error(
                `[definePrompt] Argument '${key}' uses type '${typeName}', which is not supported ` +
                `in MCP prompt arguments. MCP clients render prompt args as visual forms — only ` +
                `flat primitives (string, number, boolean, enum) are supported.\n` +
                `💡 If you need complex data, fetch it server-side inside the handler instead.`,
            );
        }
    }
}

// ── Schema-Informed Coercion ─────────────────────────────

/**
 * Schema-Informed Boundary Coercion.
 *
 * Reads the Zod schema AST to determine expected types,
 * then coerces string values from the MCP wire format.
 *
 * This is NOT guessing. The coercion is derived from the
 * developer's declared schema — it's deterministic.
 *
 * @param rawArgs - Raw string arguments from the MCP client
 * @param zodSchema - The validated Zod schema for this prompt
 * @returns Coerced argument values ready for Zod validation
 */
export function coercePromptArgs(
    rawArgs: Record<string, string>,
    zodSchema: ZodObject<ZodRawShape>,
): Record<string, unknown> {
    const coerced: Record<string, unknown> = {};
    const shape = zodSchema.shape;

    for (const [key, value] of Object.entries(rawArgs)) {
        const fieldSchema = shape[key] as ZodTypeAny | undefined;
        if (!fieldSchema) {
            // Unknown field — pass through, let Zod .strict() reject it
            coerced[key] = value;
            continue;
        }

        const typeName = getZodBaseTypeName(fieldSchema);

        switch (typeName) {
            case 'ZodBoolean':
                coerced[key] = value === 'true';
                break;
            case 'ZodNumber':
                coerced[key] = Number(value);
                break;
            case 'ZodEnum':
            case 'ZodString':
            default:
                coerced[key] = value;
                break;
        }
    }

    return coerced;
}

// ── Validation ───────────────────────────────────────────

/**
 * Format a Zod validation error into a coaching prompt.
 *
 * Returns a human+LLM readable error that guides the agent
 * (or the user via the MCP client) to correct the input.
 */
function formatPromptValidationError(issues: { path: (string | number)[]; message: string }[]): string {
    const lines = ['⚠️ PROMPT ARGUMENT VALIDATION FAILED:', ''];
    for (const issue of issues) {
        const field = issue.path.join('.') || '(root)';
        lines.push(`  • ${field} — ${issue.message}`);
    }
    lines.push('', '💡 Check the prompt definition for valid argument types and values.');
    return lines.join('\n');
}

// ── Middleware Compiler ──────────────────────────────────

/**
 * Compile middleware chain for a prompt handler.
 *
 * Wraps middlewares right-to-left around the handler function,
 * producing a ready-to-execute chain. Same pattern as tool
 * middleware compilation.
 *
 * @param handler - The prompt handler function
 * @param middlewares - Middleware stack (outermost first)
 * @returns The compiled chain function
 */
function compilePromptChain<TContext>(
    handler: (ctx: TContext, args: Record<string, unknown>) => Promise<PromptResult>,
    middlewares: readonly MiddlewareFn<TContext>[],
): (ctx: TContext, args: Record<string, unknown>) => Promise<unknown> {
    let chain: (ctx: TContext, args: Record<string, unknown>) => Promise<unknown> = handler;

    for (let i = middlewares.length - 1; i >= 0; i--) {
        const mw = middlewares[i];
        if (!mw) continue;
        const nextFn = chain;
        chain = (ctx: TContext, args: Record<string, unknown>) =>
            mw(ctx, args, () => nextFn(ctx, args));
    }

    return chain;
}

// ── Pipeline ─────────────────────────────────────────────

/**
 * Execute the full prompt hydration pipeline.
 *
 * Steps:
 * 1. Coerce string args to typed values using schema AST
 * 2. Validate with Zod (.strict() enforced)
 * 3. Run middleware chain
 * 4. Execute handler
 *
 * @returns Either a `PromptResult` or an error `PromptResult` with coaching
 */
export async function executePromptPipeline<TContext>(
    ctx: TContext,
    rawArgs: Record<string, string>,
    schema: ZodObject<ZodRawShape> | undefined,
    middlewares: readonly MiddlewareFn<TContext>[],
    handler: (ctx: TContext, args: Record<string, unknown>) => Promise<PromptResult>,
): Promise<PromptResult> {
    // Step 1 + 2: Coerce and validate
    let validatedArgs: Record<string, unknown> = rawArgs;

    if (schema) {
        const coerced = coercePromptArgs(rawArgs, schema);
        const result = schema.strict().safeParse(coerced);

        if (!result.success) {
            // Return a validation error as a user message
            return {
                messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text: formatPromptValidationError(result.error.issues),
                    },
                }],
            };
        }

        validatedArgs = result.data;
    }

    // Step 3 + 4: Middleware chain → handler
    if (middlewares.length > 0) {
        const chain = compilePromptChain(handler, middlewares);
        const result = await chain(ctx, validatedArgs);
        return result as PromptResult;
    }

    return handler(ctx, validatedArgs);
}
