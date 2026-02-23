/**
 * SchemaUtils — Shared Schema Inspection & Validation Utilities
 *
 * Extracted helpers for inspecting Zod schema metadata and
 * asserting JSON Schema field compatibility across actions.
 *
 * Used by: SchemaGenerator, DescriptionGenerator, ToonDescriptionGenerator.
 *
 * Pure-function module: no state, no side effects.
 */
import { type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';
import { type InternalAction } from '../types.js';

// ── Zod Type Guards ──────────────────────────────────────

/**
 * Check if a value is a Zod schema (has `_def` property).
 *
 * Used by `defineTool` and `definePrompt` to distinguish
 * Zod schemas from JSON descriptor objects.
 */
export function isZodSchema(value: unknown): value is ZodObject<ZodRawShape> {
    return (
        typeof value === 'object' &&
        value !== null &&
        '_def' in value &&
        typeof (value as { _def: unknown })._def === 'object'
    );
}

// ── Schema Inspection ────────────────────────────────────

/**
 * Get the list of required field names from an action's Zod schema.
 * Returns an empty array if the action has no schema.
 */
export function getActionRequiredFields<TContext>(action: InternalAction<TContext>): string[] {
    if (!action.schema) return [];
    const shape = action.schema.shape;
    const required: string[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!(fieldSchema as ZodTypeAny).isOptional()) {
            required.push(key);
        }
    }
    return required;
}

// ── Schema Compatibility ─────────────────────────────────

/**
 * Normalize JSON Schema type for compatibility comparison.
 * "integer" is treated as compatible with "number" (integer IS-A number).
 */
const normalizeType = (t: string | undefined): string | undefined =>
    t === 'integer' ? 'number' : t;

/** Build a consistently-formatted conflict error. */
function conflictError(field: string, actionKey: string, detail: string): Error {
    return new Error(
        `Schema conflict for field "${field}" in action "${actionKey}": ` +
        `${detail}. All actions sharing a field name must use the same type.`
    );
}

/**
 * Assert that an incoming JSON Schema field is compatible with an existing one.
 *
 * Check hierarchy (fail-fast):
 *   1. Base type — e.g. "string" vs "boolean", "number" vs "array"
 *   2. Enum presence — enum vs non-enum of same base type
 *   3. Enum values — enum with different value sets
 *
 * @throws Error with actionable message when types conflict.
 */
/** Minimal shape of a JSON Schema node for field compatibility checking */
interface JsonSchemaNode {
    readonly type?: string;
    readonly enum?: readonly unknown[];
    [key: string]: unknown;
}

export function assertFieldCompatibility(
    existing: object,
    incoming: object,
    field: string,
    actionKey: string,
): void {
    const ex: JsonSchemaNode = existing as JsonSchemaNode;
    const inc: JsonSchemaNode = incoming as JsonSchemaNode;

    const exType = ex.type;
    const incType = inc.type;
    const exEnum = ex.enum;
    const incEnum = inc.enum;

    // 1. Base type mismatch (with integer ≈ number normalization)
    if (
        exType !== undefined && incType !== undefined &&
        normalizeType(exType) !== normalizeType(incType)
    ) {
        throw conflictError(field, actionKey,
            `type "${incType}" conflicts with previously declared type "${exType}"`);
    }

    // 2. Enum presence mismatch (enum vs plain string, for example)
    const exHasEnum = exEnum !== undefined;
    const incHasEnum = incEnum !== undefined;
    if (exHasEnum !== incHasEnum) {
        throw conflictError(field, actionKey,
            `${incHasEnum ? 'enum' : 'non-enum'} declaration conflicts with ` +
            `previously declared ${exHasEnum ? 'enum' : 'non-enum'}`);
    }

    // 3. Enum value-set mismatch
    if (
        exHasEnum && incHasEnum &&
        JSON.stringify(exEnum) !== JSON.stringify(incEnum)
    ) {
        throw conflictError(field, actionKey,
            `enum values ${JSON.stringify(incEnum)} conflict with previously declared ` +
            `enum values ${JSON.stringify(exEnum)}`);
    }
}
