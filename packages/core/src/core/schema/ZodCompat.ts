/**
 * ZodCompat — Zod 3/4 JSON Schema Compatibility Layer
 *
 * Provides a unified `zodToJson()` wrapper that works with both
 * Zod 3 (via `zod-to-json-schema`) and Zod 4 (via native `z.toJSONSchema()`).
 *
 * Zod 4 changed its internal representation — `_def.typeName` no longer
 * exists and `zod-to-json-schema` v3.x returns empty schemas for Zod 4
 * types. This module detects the Zod version at runtime and delegates
 * to the correct conversion function.
 *
 * @module
 * @internal
 */
import * as zModule from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Shape of an object-level JSON Schema */
interface JsonSchemaResult {
    type?: string;
    properties?: Record<string, object>;
    required?: string[];
    $schema?: string;
    additionalProperties?: boolean;
    [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zAny = zModule as any;

/**
 * Detect Zod 4 by checking for the native `toJSONSchema` function.
 *
 * Zod 4 ships `z.toJSONSchema()` as a built-in conversion method.
 * Zod 3 does not have this function.
 */
const isZod4: boolean = typeof zAny['toJSONSchema'] === 'function';

/**
 * Convert a Zod schema to a plain JSON Schema object.
 *
 * - **Zod 3**: Delegates to `zod-to-json-schema` with `target: 'jsonSchema7'`.
 * - **Zod 4**: Uses the native `z.toJSONSchema()` and strips metadata fields
 *   (`$schema`, `additionalProperties`) for compatibility with the existing
 *   schema merging pipeline.
 *
 * @param schema - Any Zod schema (ZodObject, ZodArray, etc.)
 * @returns A plain JSON Schema object with `properties` and `required`
 */
export function zodToJson(schema: unknown): JsonSchemaResult {
    if (isZod4) {
        try {
            // Zod 4 native conversion — accessed via bracket notation
            // because the type definitions may not include `toJSONSchema`.
            const result = zAny['toJSONSchema'](schema) as JsonSchemaResult;

            // Strip $schema metadata — consumers only need properties/required/type
            const { $schema, ...rest } = result;

            return rest;
        } catch {
            // Fallback to zod-to-json-schema if native fails
        }
    }

    // Zod 3 path (or Zod 4 fallback)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return zodToJsonSchema(schema as any, {
        target: 'jsonSchema7',
    }) as JsonSchemaResult;
}

/**
 * Convert a Zod schema to JSON Schema with custom zod-to-json-schema options.
 *
 * Used by `JsonSerializer` which needs `$refStrategy: 'none'`.
 * Falls back to `zodToJson()` for Zod 4.
 *
 * @param schema - Any Zod schema
 * @param options - Options passed to `zod-to-json-schema` (ignored for Zod 4)
 * @returns A plain JSON Schema object
 */
export function zodToJsonWithOptions(
    schema: unknown,
    options: Record<string, unknown> = {},
): JsonSchemaResult {
    if (isZod4) {
        // Zod 4: native conversion ignores zod-to-json-schema options
        return zodToJson(schema);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return zodToJsonSchema(schema as any, {
        target: 'jsonSchema7',
        ...options,
    }) as JsonSchemaResult;
}
