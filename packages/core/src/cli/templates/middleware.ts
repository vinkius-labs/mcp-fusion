/**
 * Middleware Template — RBAC guard example
 * @module
 */

/** Generate `src/middleware/auth.ts` — RBAC middleware */
export function authMiddlewareTs(): string {
    return `/**
 * Auth Middleware — RBAC Guard
 *
 * Demonstrates middleware with tRPC-style context derivation.
 * Rejects GUEST requests with a structured error.
 *
 * In production, replace this with JWT validation,
 * API key checks, or OAuth token verification.
 */
import { error } from '@vinkius-core/mcp-fusion';
import type { AppContext } from '../context.js';

export async function authGuard<TArgs>(
    ctx: AppContext,
    _args: TArgs,
    next: () => Promise<unknown>,
): Promise<unknown> {
    if (ctx.role === 'GUEST') {
        return error('Access denied. Authentication required.');
    }
    return next();
}
`;
}
