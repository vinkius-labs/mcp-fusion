/**
 * SelectUtils — Zod Reflection & Shallow Field Filter
 *
 * Utilities for the `_select` context window optimization feature.
 *
 * - `extractZodKeys()`: Recursively unwraps Zod wrappers (Optional,
 *   Nullable, Default, Effects, Array) to reach the inner ZodObject
 *   and extract its top-level keys. Fails gracefully (returns [])
 *   for schemas without a discoverable shape.
 *
 * - `pickFields()`: Shallow (top-level only) field filter. Keeps
 *   only the keys requested by the AI's `_select` parameter.
 *   Nested objects are returned whole — no recursive GraphQL-style
 *   traversal. This resolves 95% of real-world overfetching.
 *
 * @module
 * @internal
 */
import { type ZodType } from 'zod';

// ── Zod Key Extraction ───────────────────────────────────

/**
 * Recursively unwrap a Zod schema to extract the top-level object keys.
 *
 * Peels through layers of modifiers (Optional → Nullable → Default →
 * Effects → Array) until it finds a ZodObject, then returns
 * `Object.keys(shape)`.
 *
 * Returns `[]` for schemas that don't resolve to an object shape
 * (e.g. `z.string()`, `z.any()`, `z.record()`), which gracefully
 * disables `_select` injection for that Presenter.
 *
 * @param schema - Any Zod schema (ZodType)
 * @returns Array of top-level key names, or `[]` if not extractable
 *
 * @example
 * ```typescript
 * extractZodKeys(z.object({ id: z.string(), name: z.string() }))
 * // → ['id', 'name']
 *
 * extractZodKeys(z.object({ id: z.string() }).optional().array())
 * // → ['id']
 *
 * extractZodKeys(z.string())
 * // → []
 * ```
 */
export function extractZodKeys(schema: ZodType): string[] {
    let current: unknown = schema;

    // Safety: iterate up to 20 layers to prevent infinite loops
    // on pathological or circular Zod constructions.
    for (let depth = 0; depth < 20; depth++) {
        if (!current || typeof current !== 'object') return [];

        const def = (current as { _def?: Record<string, unknown> })._def;
        if (!def) return [];

        const typeName = def['typeName'] as string | undefined;

        switch (typeName) {
            // ── Modifier Wrappers ─────────────────────────
            case 'ZodOptional':
            case 'ZodNullable':
            case 'ZodDefault':
            case 'ZodReadonly':
            case 'ZodBranded':
            case 'ZodCatch':
            case 'ZodLazy':
                current = def['innerType'];
                continue;

            // ── Effects (Refine, Transform, Preprocess) ───
            case 'ZodEffects':
                current = (def as Record<string, unknown>)['schema'];
                continue;

            // ── Array → extract element type ──────────────
            case 'ZodArray':
                current = def['type'];
                continue;

            // ── Pipeline → follow through ─────────────────
            case 'ZodPipeline':
                current = def['out'];
                continue;

            // ── Object → extract keys ─────────────────────
            case 'ZodObject': {
                const shape = (current as { shape?: Record<string, unknown> }).shape;
                return shape ? Object.keys(shape) : [];
            }

            // ── Terminal: cannot extract keys ─────────────
            default:
                return [];
        }
    }

    return [];
}

// ── Field Filtering ──────────────────────────────────────

/**
 * Shallow (top-level only) field picker.
 *
 * Keeps only the keys present in `selectSet`. Nested objects are
 * returned whole — no recursive path traversal. This is by design:
 * the `_select` enum only lists root-level keys, matching 95% of
 * real-world overfetching scenarios with O(1) complexity.
 *
 * @param data - The validated object to filter
 * @param selectSet - Set of top-level keys to keep
 * @returns A new object with only the selected keys
 *
 * @example
 * ```typescript
 * pickFields({ id: '1', status: 'paid', amount: 100 }, new Set(['status']))
 * // → { status: 'paid' }
 * ```
 */
export function pickFields(
    data: Record<string, unknown>,
    selectSet: Set<string>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of selectSet) {
        // Defense-in-depth: only copy OWN properties, blocking
        // prototype chain access (__proto__, constructor, etc.)
        if (Object.hasOwn(data, key)) {
            result[key] = data[key];
        }
    }
    return result;
}

/**
 * Apply `_select` filtering to validated data.
 *
 * Handles both single objects and arrays. When `isArray` is true,
 * each item in the array is filtered independently.
 *
 * @param data - Validated data (single object or array)
 * @param selectFields - Array of top-level keys to keep
 * @param isArray - Whether `data` is an array
 * @returns The filtered data (same shape as input, fewer fields)
 */
export function applySelectFilter<T>(
    data: T | T[],
    selectFields: string[],
    isArray: boolean,
): T | T[] {
    const selectSet = new Set(selectFields);

    if (isArray) {
        return (data as T[]).map(item =>
            pickFields(item as Record<string, unknown>, selectSet) as T,
        );
    }

    return pickFields(data as Record<string, unknown>, selectSet) as T;
}
