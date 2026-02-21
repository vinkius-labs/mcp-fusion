/**
 * MiddlewareCompiler — Middleware Chain Pre-Compilation Strategy
 *
 * Wraps middlewares right-to-left around each action handler,
 * producing a ready-to-execute chain per action key.
 *
 * Pure-function module: no state, no side effects.
 */
import { type ToolResponse } from '../ResponseHelper.js';
import { type InternalAction, type MiddlewareFn } from './Types.js';

// ── Public API ───────────────────────────────────────────

export type CompiledChain<TContext> = Map<
    string,
    (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>
>;

export function compileMiddlewareChains<TContext>(
    actions: readonly InternalAction<TContext>[],
    middlewares: readonly MiddlewareFn<TContext>[],
): CompiledChain<TContext> {
    const compiled: CompiledChain<TContext> = new Map();

    for (const action of actions) {
        // Build the chain: global middlewares → group/action middlewares → handler
        let chain = action.handler;

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
