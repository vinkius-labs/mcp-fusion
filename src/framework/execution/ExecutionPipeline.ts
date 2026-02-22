/**
 * ExecutionPipeline — Orchestrates MCP Tool Execution Steps
 *
 * Breaks the monolithic execute() flow into discrete, testable steps
 * using the Result monad for railway-oriented error handling.
 *
 * Each step either succeeds (passes data to the next step) or fails
 * (short-circuits with an error response).
 *
 * Pipeline: ensureBuilt → parseDiscriminator → resolveAction → validateArgs → runChain
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type ToolResponse, error } from '../response.js';
import { formatValidationError } from './ValidationErrorFormatter.js';
import { type Result, succeed, fail } from '../result.js';
import { type InternalAction } from '../types.js';
import { type CompiledChain } from './MiddlewareCompiler.js';
import { type ProgressSink, isProgressEvent } from './ProgressHelper.js';

// ── Types ────────────────────────────────────────────────

/** Pre-built runtime context needed for execution */
export interface ExecutionContext<TContext> {
    readonly actionMap: Map<string, InternalAction<TContext>>;
    readonly compiledChain: CompiledChain<TContext>;
    readonly validationSchemaCache: Map<string, ZodObject<ZodRawShape> | null>;
    readonly actionKeysString: string;
    readonly discriminator: string;
    readonly toolName: string;
}

/** Resolved action with its discriminator value */
interface ResolvedAction<TContext> {
    readonly action: InternalAction<TContext>;
    readonly discriminatorValue: string;
}

// ── Pipeline Steps (pure functions) ──────────────────────

/** Step 1: Parse discriminator value from raw args */
export function parseDiscriminator<TContext>(
    execCtx: ExecutionContext<TContext>,
    args: Record<string, unknown>,
): Result<string> {
    const value = args[execCtx.discriminator] as string | undefined;
    if (!value) {
        return fail(error(
            `Error: ${execCtx.discriminator} is required. ` +
            `Available: ${execCtx.actionKeysString}`
        ));
    }
    return succeed(value);
}

/** Step 2: Resolve the action by discriminator value — O(1) lookup */
export function resolveAction<TContext>(
    execCtx: ExecutionContext<TContext>,
    discriminatorValue: string,
): Result<ResolvedAction<TContext>> {
    const action = execCtx.actionMap.get(discriminatorValue);
    if (!action) {
        return fail(error(
            `Error: Unknown ${execCtx.discriminator} "${discriminatorValue}". ` +
            `Available: ${execCtx.actionKeysString}`
        ));
    }
    return succeed({ action, discriminatorValue });
}

/** Step 3: Validate and strip args using pre-cached Zod schema */
export function validateArgs<TContext>(
    execCtx: ExecutionContext<TContext>,
    resolved: ResolvedAction<TContext>,
    args: Record<string, unknown>,
): Result<Record<string, unknown>> {
    const validationSchema = execCtx.validationSchemaCache.get(resolved.action.key);

    if (!validationSchema) {
        // No schema — pass through unchanged
        return succeed(args);
    }

    // Remove discriminator before validation
    const { [execCtx.discriminator]: _, ...argsWithoutDiscriminator } = args;
    const result = validationSchema.safeParse(argsWithoutDiscriminator);

    if (!result.success) {
        const message = formatValidationError(
            result.error.issues,
            `${execCtx.toolName}/${resolved.discriminatorValue}`,
            argsWithoutDiscriminator,
        );
        return fail(error(message));
    }

    // Mutate directly — zero-copy re-injection of discriminator
    const validated = result.data as Record<string, unknown>;
    validated[execCtx.discriminator] = resolved.discriminatorValue;
    return succeed(validated);
}

/** Step 4: Run pre-compiled middleware chain → handler */
export async function runChain<TContext>(
    execCtx: ExecutionContext<TContext>,
    resolved: ResolvedAction<TContext>,
    ctx: TContext,
    args: Record<string, unknown>,
    progressSink?: ProgressSink,
): Promise<ToolResponse> {
    const chain = execCtx.compiledChain.get(resolved.action.key);
    if (!chain) {
        return error(`No compiled chain for action "${resolved.action.key}".`);
    }

    try {
        const result = await chain(ctx, args);

        // If the middleware chain returned a generator result envelope, drain it
        if (isGeneratorResultEnvelope(result)) {
            return await drainGenerator(result.generator, progressSink);
        }

        return result;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return error(`[${execCtx.toolName}/${resolved.discriminatorValue}] ${message}`);
    }
}

// ============================================================================
// Generator Support
// ============================================================================

/**
 * An envelope that wraps an async generator from a handler.
 * The middleware compiler detects generator handlers and wraps
 * their return value in this envelope so the pipeline can drain them.
 */
export interface GeneratorResultEnvelope {
    readonly __brand: 'GeneratorResultEnvelope';
    readonly generator: AsyncGenerator<unknown, ToolResponse, undefined>;
}

/** @internal */
function isGeneratorResultEnvelope(value: unknown): value is GeneratorResultEnvelope {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__brand' in value &&
        (value as GeneratorResultEnvelope).__brand === 'GeneratorResultEnvelope'
    );
}

/**
 * Drain an async generator, forwarding ProgressEvents to the sink
 * and returning the final ToolResponse.
 * @internal
 */
async function drainGenerator(
    gen: AsyncGenerator<unknown, ToolResponse, undefined>,
    progressSink?: ProgressSink,
): Promise<ToolResponse> {
    let result = await gen.next();

    while (!result.done) {
        if (progressSink && isProgressEvent(result.value)) {
            progressSink(result.value);
        }
        result = await gen.next();
    }

    return result.value;
}
