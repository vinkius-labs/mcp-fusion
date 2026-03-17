/**
 * Safely extract a human-readable error message from an unknown thrown value.
 *
 * TypeScript's `catch` clause types the error as `unknown`.
 * This utility avoids the duplicated `err instanceof Error ? err.message : String(err)`
 * pattern that appears across the codebase.
 *
 * @param err - Any thrown value
 * @returns A string message suitable for logging or error responses
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   return error(`Operation failed: ${toErrorMessage(err)}`);
 * }
 * ```
 */
export function toErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
