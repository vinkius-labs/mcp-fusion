/**
 * MiddlewareCompiler — Middleware Chain Pre-Compilation Strategy
 *
 * Wraps middlewares right-to-left around each action handler,
 * producing a ready-to-execute chain per action key.
 *
 * Supports both regular async handlers and async generator handlers.
 * Generator handlers are wrapped in a {@link GeneratorResultEnvelope}
 * so the pipeline can drain progress events from them.
 *
 * Pure-function module: no state, no side effects.
 */
import { type ToolResponse } from '../response.js';
import { type InternalAction, type MiddlewareFn } from '../types.js';

// ── Public API ───────────────────────────────────────────

export type CompiledChain<TContext> = Map<
    string,
    (ctx: TContext, args: Record<string, unknown>) => Promise<unknown>
>;

/** Generic handler function signature used in middleware chains. */
type ChainFn<TContext> = (ctx: TContext, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Check if a function is an async generator function.
 * Uses Symbol.toStringTag which survives minification (unlike constructor.name).
 * @internal
 */
function isAsyncGeneratorFunction(fn: unknown): boolean {
    if (typeof fn !== 'function') return false;
    // Symbol.toStringTag is set by the engine on async generator functions
    return (fn as { [Symbol.toStringTag]?: string })[Symbol.toStringTag] === 'AsyncGeneratorFunction'
        || fn.constructor.name === 'AsyncGeneratorFunction';
}

/**
 * Wrap a handler with a middleware stack (right-to-left composition).
 *
 * This is the single canonical implementation of the middleware
 * wrapping pattern. No other file should duplicate this loop.
 *
 * @param handler - The innermost function to wrap
 * @param middlewares - Middleware stack (outermost first, applied right-to-left)
 * @returns The compiled chain function
 */
export function wrapChain<TContext>(
    handler: ChainFn<TContext>,
    middlewares: readonly MiddlewareFn<TContext>[],
): ChainFn<TContext> {
    let chain = handler;

    for (let i = middlewares.length - 1; i >= 0; i--) {
        const mw = middlewares[i];
        if (!mw) continue;
        const nextFn = chain;
        chain = (ctx: TContext, args: Record<string, unknown>) =>
            mw(ctx, args, () => nextFn(ctx, args));
    }

    return chain;
}

/**
 * Pre-compile middleware chains for all actions in a builder.
 *
 * For each action:
 * 1. Wraps generator handlers in a GeneratorResultEnvelope
 * 2. Applies per-action middlewares (innermost)
 * 3. Applies global middlewares (outermost)
 *
 * @param actions - Registered actions with their handlers and local middleware
 * @param middlewares - Global middleware stack
 * @returns Map from action key to compiled chain
 */
export function compileMiddlewareChains<TContext>(
    actions: readonly InternalAction<TContext>[],
    middlewares: readonly MiddlewareFn<TContext>[],
): CompiledChain<TContext> {
    const compiled: CompiledChain<TContext> = new Map();

    for (const action of actions) {
        // Step 1: Resolve the base handler (regular or generator-wrapped)
        let handler: ChainFn<TContext>;

        if (isAsyncGeneratorFunction(action.handler)) {
            handler = (ctx: TContext, args: Record<string, unknown>): Promise<unknown> => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gen = (action.handler as any)(ctx, args) as AsyncGenerator<unknown, ToolResponse, undefined>;
                return Promise.resolve({ __brand: 'GeneratorResultEnvelope', generator: gen } as unknown);
            };
        } else {
            handler = action.handler;
        }

        // Step 2: Wrap with per-action middleware (innermost), then global (outermost)
        const actionMws = action.middlewares ?? [];
        const chain = wrapChain(
            wrapChain(handler, actionMws),
            middlewares,
        );

        compiled.set(action.key, chain);
    }

    return compiled;
}
