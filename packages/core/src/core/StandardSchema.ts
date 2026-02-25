/**
 * StandardSchema — Universal Schema Abstraction Layer
 *
 * Decouples the MCP Fusion validation engine from Zod specifically,
 * enabling support for any validator that implements the Standard Schema
 * specification (`@standard-schema/spec`).
 *
 * This allows users to choose lighter alternatives:
 * - **Zod** (~14kb min): Full-featured, most popular
 * - **Valibot** (~1kb min via tree-shaking): Ultra-lightweight
 * - **ArkType** (~5kb min): Fastest runtime validation
 * - **TypeBox** (~4kb min): JSON Schema native
 *
 * ## Standard Schema Spec
 *
 * Any object with `~standard` property conforming to:
 * ```typescript
 * interface StandardSchema {
 *   '~standard': {
 *     version: 1;
 *     vendor: string;
 *     validate: (value: unknown) => { value: T } | { issues: Issue[] };
 *   }
 * }
 * ```
 *
 * @see https://github.com/standard-schema/standard-schema
 *
 * @example
 * ```typescript
 * import { toStandardValidator } from '@vinkius-core/mcp-fusion';
 * import * as v from 'valibot';
 *
 * // Valibot schemas work natively via Standard Schema
 * const schema = v.object({ name: v.string(), age: v.number() });
 * const validator = toStandardValidator(schema);
 *
 * const result = validator.validate({ name: 'Alice', age: 30 });
 * // { success: true, data: { name: 'Alice', age: 30 } }
 * ```
 *
 * @module
 */

// ── Standard Schema Types ────────────────────────────────

/**
 * Issue reported by a Standard Schema validator.
 */
export interface StandardSchemaIssue {
    readonly message: string;
    readonly path?: readonly (string | number | symbol)[];
}

/**
 * Standard Schema v1 spec — the universal validator contract.
 *
 * Any schema library implementing this interface can be used with
 * MCP Fusion's validation pipeline.
 */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: TInput) =>
            | { readonly value: TOutput }
            | { readonly issues: readonly StandardSchemaIssue[] };
    };
}

/**
 * Infer the output type from a Standard Schema.
 */
export type InferStandardOutput<T> = T extends StandardSchemaV1<unknown, infer O> ? O : never;

// ── Fusion Validator ─────────────────────────────────────

/**
 * Fusion's internal validation result.
 */
export type ValidationResult<T> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly issues: readonly StandardSchemaIssue[] };

/**
 * Universal validator interface used internally by MCP Fusion.
 *
 * Wraps any schema library (Zod, Valibot, ArkType, etc.) into
 * a consistent validation contract.
 */
export interface FusionValidator<T = unknown> {
    /** Run validation and return a result (never throws) */
    validate(value: unknown): ValidationResult<T>;
    /** Vendor identifier (e.g. 'zod', 'valibot', 'arktype') */
    readonly vendor: string;
    /** Original schema reference (for introspection) */
    readonly schema: unknown;
}

// ── Adapters ─────────────────────────────────────────────

/**
 * Create a FusionValidator from a Standard Schema v1 compatible schema.
 *
 * This is the primary entry point for non-Zod validators. Any schema
 * library implementing the Standard Schema spec can be used directly.
 *
 * @param schema - A Standard Schema v1 compatible schema
 * @returns A {@link FusionValidator} wrapping the schema
 *
 * @example
 * ```typescript
 * import * as v from 'valibot'; // ~1kb tree-shaken
 *
 * const schema = v.object({ name: v.string() });
 * const validator = toStandardValidator(schema);
 *
 * const ok = validator.validate({ name: 'Alice' });
 * // { success: true, data: { name: 'Alice' } }
 *
 * const err = validator.validate({ name: 42 });
 * // { success: false, issues: [{ message: 'Expected string', path: ['name'] }] }
 * ```
 */
export function toStandardValidator<T>(
    schema: StandardSchemaV1<unknown, T>,
): FusionValidator<T> {
    const spec = schema['~standard'];

    return {
        validate(value: unknown): ValidationResult<T> {
            const result = spec.validate(value);

            if ('value' in result) {
                return { success: true, data: result.value };
            }

            return { success: false, issues: result.issues };
        },
        vendor: spec.vendor,
        schema,
    };
}

/**
 * Create a FusionValidator from a raw Zod schema.
 *
 * This adapter uses Zod's `.safeParse()` method and maps the result
 * to the standard FusionValidator interface.
 *
 * @param schema - A Zod schema (z.object, z.string, etc.)
 * @returns A {@link FusionValidator} wrapping the Zod schema
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.object({ name: z.string() });
 * const validator = fromZodSchema(schema);
 *
 * const ok = validator.validate({ name: 'Alice' });
 * // { success: true, data: { name: 'Alice' } }
 * ```
 */
export function fromZodSchema<T>(schema: ZodSchemaLike<T>): FusionValidator<T> {
    return {
        validate(value: unknown): ValidationResult<T> {
            const result = schema.safeParse(value);

            if (result.success) {
                return { success: true, data: result.data as T };
            }

            // Map Zod errors to StandardSchemaIssue
            const issues: StandardSchemaIssue[] = (result.error?.issues ?? []).map(
                (issue: { message: string; path?: (string | number)[] }) => {
                    const mapped: StandardSchemaIssue = { message: issue.message };
                    if (issue.path) {
                        (mapped as { path: readonly (string | number)[] }).path = issue.path;
                    }
                    return mapped;
                },
            );

            return { success: false, issues };
        },
        vendor: 'zod',
        schema,
    };
}

/**
 * Check if a value implements the Standard Schema v1 spec.
 *
 * @param value - Any value to check
 * @returns `true` if the value has a valid `~standard` property
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
    return (
        typeof value === 'object' &&
        value !== null &&
        '~standard' in value &&
        typeof (value as StandardSchemaV1)['~standard'] === 'object' &&
        (value as StandardSchemaV1)['~standard'] !== null &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        (value as StandardSchemaV1)['~standard'].version === 1
    );
}

/**
 * Auto-detect and create a FusionValidator from any supported schema.
 *
 * Detection order:
 * 1. Standard Schema v1 (Valibot, ArkType, etc.)
 * 2. Zod-like (has `.safeParse()`)
 * 3. Throws if unrecognized
 *
 * @param schema - Any supported schema
 * @returns A {@link FusionValidator}
 * @throws If the schema type is not recognized
 */
export function autoValidator<T = unknown>(schema: unknown): FusionValidator<T> {
    if (isStandardSchema(schema)) {
        return toStandardValidator(schema as StandardSchemaV1<unknown, T>);
    }

    if (isZodLike(schema)) {
        return fromZodSchema(schema as ZodSchemaLike<T>);
    }

    throw new Error(
        'Unsupported schema type. Expected a Standard Schema v1 (' +
        'Valibot, ArkType) or Zod schema. See: https://mcp-fusion.vinkius.com/docs/standard-schema'
    );
}

// ── Internal ─────────────────────────────────────────────

/** Duck-typed Zod schema interface */
interface ZodSchemaLike<T = unknown> {
    safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: { issues: Array<{ message: string; path?: (string | number)[] }> } };
    parse?(value: unknown): T;
}

/** Duck-type check for Zod-like schemas */
function isZodLike(value: unknown): value is ZodSchemaLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as ZodSchemaLike).safeParse === 'function'
    );
}
