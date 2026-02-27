/**
 * Middleware Template — RBAC guard example (Fluent API)
 * @module
 */

/** Generate `src/middleware/auth.ts` — RBAC middleware */
export function authMiddlewareTs(): string {
    return `/**
 * Auth Middleware — RBAC Guard (Fluent API)
 *
 * Demonstrates f.middleware() — tRPC-style context derivation.
 * Rejects GUEST requests with a structured error.
 *
 * Usage in tools:
 *   f.query('users.list')
 *     .use(withAuth)
 *     .handle(async (input, ctx) => {
 *       // ctx now has ctx.role guaranteed non-GUEST
 *     });
 *
 * In production, replace with JWT validation,
 * API key checks, or OAuth token verification.
 */
import { f } from '../fusion.js';
import { error } from '@vinkius-core/mcp-fusion';

export const withAuth = f.middleware(async (ctx) => {
    if (ctx.role === 'GUEST') {
        throw error('Access denied. Authentication required.');
    }
    return { verified: true as const };
});
`;
}
