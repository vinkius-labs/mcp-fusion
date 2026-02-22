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

export function compileMiddlewareChains<TContext>(
    actions: readonly InternalAction<TContext>[],
    middlewares: readonly MiddlewareFn<TContext>[],
): CompiledChain<TContext> {
    const compiled: CompiledChain<TContext> = new Map();

    for (const action of actions) {
        // Wrap generator handlers in an envelope
        let chain: (ctx: TContext, args: Record<string, unknown>) => Promise<unknown>;

        if (isAsyncGeneratorFunction(action.handler)) {
            // Generator handler: invoke and wrap the generator in an envelope
            chain = (ctx: TContext, args: Record<string, unknown>): Promise<unknown> => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gen = (action.handler as any)(ctx, args) as AsyncGenerator<unknown, ToolResponse, undefined>;
                return Promise.resolve({ __brand: 'GeneratorResultEnvelope', generator: gen } as unknown);
            };
        } else {
            chain = action.handler;
        }

        // Per-action/group middleware (innermost, closest to handler)
        const actionMws = action.middlewares ?? [];
        for (let i = actionMws.length - 1; i >= 0; i--) {
            const mw = actionMws[i];
            if (!mw) continue;
            const nextFn = chain;
            chain = (ctx: TContext, args: Record<string, unknown>) =>
                mw(ctx, args, () => nextFn(ctx, args));
        }

        // Global middleware (outermost)
        for (let i = middlewares.length - 1; i >= 0; i--) {
            const mw = middlewares[i];
            if (!mw) continue;
            const nextFn = chain;
            chain = (ctx: TContext, args: Record<string, unknown>) =>
                mw(ctx, args, () => nextFn(ctx, args));
        }

        compiled.set(action.key, chain);
    }

    return compiled;
}

