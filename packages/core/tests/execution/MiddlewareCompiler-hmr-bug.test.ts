/**
 * MiddlewareCompiler HMR Regression Tests (C2)
 *
 * BUG: `_warnedMiddlewares` was a module-scoped `const WeakSet` that
 * persisted across HMR reloads. After a hot reload, middleware functions
 * with the same identity would be silently skipped by the warning guard,
 * suppressing legitimate "forgot return next()" warnings.
 *
 * FIX: Changed to `let` + exported `resetMiddlewareWarnings()` so tests
 * and HMR tooling can clear the set between reloads.
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    wrapChain,
    compileMiddlewareChains,
    resetMiddlewareWarnings,
} from '../../src/core/execution/MiddlewareCompiler.js';
import type { InternalAction, MiddlewareFn } from '../../src/core/types.js';

// ── Helpers ──────────────────────────────────────────────

/** Create a minimal InternalAction for testing */
function makeAction(key: string, handler?: InternalAction<void>['handler']): InternalAction<void> {
    return {
        key,
        groupName: undefined,
        groupDescription: undefined,
        actionName: key,
        description: undefined,
        schema: undefined,
        destructive: undefined,
        idempotent: undefined,
        readOnly: undefined,
        middlewares: undefined,
        omitCommonFields: undefined,
        returns: undefined,
        handler: handler ?? (async () => ({ content: [{ type: 'text' as const, text: 'ok' }] })),
    };
}

// ── Tests ────────────────────────────────────────────────

describe('MiddlewareCompiler — HMR WeakSet leak (C2 regression)', () => {
    beforeEach(() => {
        // Reset the warning state before each test so that
        // middleware functions trigger warnings on first use.
        resetMiddlewareWarnings();
    });

    it('should warn when middleware returns undefined (forgot return next())', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const badMiddleware: MiddlewareFn<void> = async (_ctx, _args, _next) => {
            // Forgot `return next()` — returns undefined
        };

        const chain = wrapChain(
            async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            [badMiddleware],
        );

        await chain(undefined as void, {});
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('returned undefined'),
        );

        warnSpy.mockRestore();
    });

    it('should warn only ONCE per middleware function identity', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const badMiddleware: MiddlewareFn<void> = async (_ctx, _args, _next) => {
            // Forgot `return next()`
        };

        const chain = wrapChain(
            async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            [badMiddleware],
        );

        await chain(undefined as void, {});
        await chain(undefined as void, {});
        await chain(undefined as void, {});

        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('should warn again after resetMiddlewareWarnings() (HMR simulation)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const badMiddleware: MiddlewareFn<void> = async (_ctx, _args, _next) => {
            // Forgot `return next()`
        };

        let chain = wrapChain(
            async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            [badMiddleware],
        );
        await chain(undefined as void, {});
        expect(warnSpy).toHaveBeenCalledTimes(1);

        resetMiddlewareWarnings();
        chain = wrapChain(
            async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            [badMiddleware],
        );

        await chain(undefined as void, {});
        expect(warnSpy).toHaveBeenCalledTimes(2);

        warnSpy.mockRestore();
    });

    it('should NOT warn when middleware correctly returns next()', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const goodMiddleware: MiddlewareFn<void> = async (_ctx, _args, next) => {
            return next();
        };

        const chain = wrapChain(
            async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            [goodMiddleware],
        );

        await chain(undefined as void, {});
        expect(warnSpy).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('should warn independently for different middleware functions', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // badMw1 is outermost (applied right-to-left, so it wraps badMw2).
        // It forgets return next(), so badMw2 never executes.
        // Only 1 warning — the inner middleware is unreachable.
        const badMw1: MiddlewareFn<void> = async (_ctx, _args, _next) => {
            // forgot return — inner middleware never runs
        };
        const badMw2: MiddlewareFn<void> = async (_ctx, _args, _next) => {
            // unreachable because badMw1 doesn't call next()
        };

        const chain = wrapChain(
            async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            [badMw1, badMw2],
        );

        await chain(undefined as void, {});
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('compileMiddlewareChains should propagate warnings through compiled chains', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const badMiddleware: MiddlewareFn<void> = async (_ctx, _args, _next) => {
            // forgot return
        };

        const action = makeAction('test');
        const compiled = compileMiddlewareChains([action], [badMiddleware]);
        const chain = compiled.get('test')!;

        await chain(undefined as void, {});
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });
});
