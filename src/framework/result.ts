/**
 * Result<T> — Railway-Oriented Programming for MCP Fusion
 *
 * A lightweight, zero-overhead discriminated union for expressing
 * success/failure pipelines without exception throwing.
 *
 * Follows the "Result Monad" pattern used in Rust, Haskell, and F#.
 * Each step in a pipeline returns Result<T>: either Success<T> or Failure.
 *
 * @example
 * ```typescript
 * function parseId(input: string): Result<number> {
 *     const id = parseInt(input, 10);
 *     return isNaN(id) ? fail(error('Invalid ID')) : succeed(id);
 * }
 * ```
 */
import { type ToolResponse } from './response.js';

// ── Discriminated Union ──────────────────────────────────

/** Successful result containing a value */
export interface Success<T> {
    readonly ok: true;
    readonly value: T;
}

/** Failed result containing an error response */
export interface Failure {
    readonly ok: false;
    readonly response: ToolResponse;
}

/** Discriminated union: either Success<T> or Failure */
export type Result<T> = Success<T> | Failure;

// ── Constructors ─────────────────────────────────────────

/** Create a successful result */
export function succeed<T>(value: T): Success<T> {
    return { ok: true, value };
}

/** Create a failed result from a ToolResponse */
export function fail(response: ToolResponse): Failure {
    return { ok: false, response };
}
