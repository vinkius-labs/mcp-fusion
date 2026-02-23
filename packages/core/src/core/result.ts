/**
 * Result\<T\> — Railway-Oriented Programming for MCP Fusion
 *
 * A lightweight, zero-overhead discriminated union for expressing
 * success/failure pipelines without exception throwing.
 *
 * Follows the "Result Monad" pattern used in Rust, Haskell, and F#.
 * Each step in a pipeline returns `Result<T>`: either `Success<T>` or `Failure`.
 *
 * @example
 * ```typescript
 * import { succeed, fail, error, type Result } from '@vinkius-core/mcp-fusion';
 *
 * function parseId(input: string): Result<number> {
 *     const id = parseInt(input, 10);
 *     return isNaN(id) ? fail(error('Invalid ID')) : succeed(id);
 * }
 *
 * // Usage in a pipeline:
 * const result = parseId(args.id);
 * if (!result.ok) return result.response;  // Early return on failure
 * const userId = result.value;             // Narrowed to number
 * ```
 *
 * @see {@link succeed} for creating successful results
 * @see {@link fail} for creating failure results
 *
 * @module
 */
import { type ToolResponse } from './response.js';

// ── Discriminated Union ──────────────────────────────────

/**
 * Successful result containing a typed value.
 *
 * @typeParam T - The success value type
 */
export interface Success<T> {
    readonly ok: true;
    readonly value: T;
}

/**
 * Failed result containing an error response.
 *
 * The `response` field is a standard {@link ToolResponse} that can
 * be returned directly from a handler.
 */
export interface Failure {
    readonly ok: false;
    readonly response: ToolResponse;
}

/**
 * Discriminated union: either `Success<T>` or `Failure`.
 *
 * Check `result.ok` to narrow the type:
 *
 * @example
 * ```typescript
 * const result: Result<User> = findUser(id);
 * if (!result.ok) return result.response;  // Failure path
 * const user = result.value;               // Success path — typed as User
 * ```
 */
export type Result<T> = Success<T> | Failure;

// ── Constructors ─────────────────────────────────────────

/**
 * Create a successful result.
 *
 * @typeParam T - The value type
 * @param value - The success value
 * @returns A `Success<T>` with `ok: true`
 *
 * @example
 * ```typescript
 * return succeed(42);
 * return succeed({ id: 'user_1', name: 'Alice' });
 * ```
 */
export function succeed<T>(value: T): Success<T> {
    return { ok: true, value };
}

/**
 * Create a failed result from a ToolResponse.
 *
 * @param response - An error {@link ToolResponse} (typically from `error()`)
 * @returns A `Failure` with `ok: false`
 *
 * @example
 * ```typescript
 * return fail(error('User not found'));
 * return fail(required('email'));
 * ```
 *
 * @see {@link error} for creating error responses
 * @see {@link required} for missing field errors
 */
export function fail(response: ToolResponse): Failure {
    return { ok: false, response };
}
