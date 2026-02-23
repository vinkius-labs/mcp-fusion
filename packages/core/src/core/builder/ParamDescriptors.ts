/**
 * ParamDescriptors — JSON-to-Zod Converter with TypeScript Inference
 *
 * Converts plain JSON-like param descriptors into Zod schemas internally.
 * Supports string shorthands, object descriptors with constraints, enums,
 * arrays, and examples for few-shot LLM prompting.
 *
 * @example
 * ```typescript
 * // String shorthand
 * { name: 'string' }  →  z.object({ name: z.string() })
 *
 * // Object descriptor with constraints
 * { name: { type: 'string', min: 3, max: 100, description: 'Name' } }
 *
 * // Enum
 * { status: { enum: ['active', 'archived'], optional: true } }
 *
 * // Examples for LLM few-shot
 * { cron: { type: 'string', examples: ['0 12 * * *'] } }
 * ```
 *
 * @internal
 * @module
 */
import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from 'zod';

// ============================================================================
// Param Descriptor Types (user-facing)
// ============================================================================

/** Primitive type strings accepted as shorthand */
type PrimitiveType = 'string' | 'number' | 'boolean';

/** String param descriptor */
export interface StringParamDef {
    readonly type: 'string';
    readonly description?: string;
    readonly optional?: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly regex?: string;
    readonly examples?: readonly string[];
}

/** Number param descriptor */
export interface NumberParamDef {
    readonly type: 'number';
    readonly description?: string;
    readonly optional?: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly int?: boolean;
    readonly examples?: readonly number[];
}

/** Boolean param descriptor */
export interface BooleanParamDef {
    readonly type: 'boolean';
    readonly description?: string;
    readonly optional?: boolean;
}

/** Enum param descriptor */
export interface EnumParamDef<V extends string = string> {
    readonly enum: readonly [V, ...V[]];
    readonly description?: string;
    readonly optional?: boolean;
    readonly examples?: readonly V[];
}

/** Array param descriptor */
export interface ArrayParamDef {
    readonly array: PrimitiveType;
    readonly description?: string;
    readonly optional?: boolean;
    readonly min?: number;
    readonly max?: number;
}

/** Any object-style param descriptor */
export type ObjectParamDef =
    | StringParamDef
    | NumberParamDef
    | BooleanParamDef
    | EnumParamDef<string>
    | ArrayParamDef;

/** Any valid param value: shorthand string or object descriptor */
export type ParamDef = PrimitiveType | ObjectParamDef;

/** Map of param names to their definitions */
export type ParamsMap = Record<string, ParamDef>;

// ============================================================================
// Type Inference — compile-time param types from descriptors
// ============================================================================

/** Infer the TypeScript type for a single param descriptor */
type InferSingleParam<T extends ParamDef> =
    T extends 'string' ? string :
    T extends 'number' ? number :
    T extends 'boolean' ? boolean :
    T extends { type: 'string' } ? string :
    T extends { type: 'number' } ? number :
    T extends { type: 'boolean' } ? boolean :
    T extends { enum: readonly (infer V)[] } ? V :
    T extends { array: 'string' } ? string[] :
    T extends { array: 'number' } ? number[] :
    T extends { array: 'boolean' } ? boolean[] :
    unknown;

/** Check if a param is optional */
type IsOptional<T extends ParamDef> =
    T extends { optional: true } ? true :
    T extends PrimitiveType ? false :
    T extends { optional?: false | undefined } ? false :
    false;

/** Required keys from a ParamsMap */
type RequiredKeys<T extends ParamsMap> = {
    [K in keyof T]: IsOptional<T[K]> extends true ? never : K;
}[keyof T];

/** Optional keys from a ParamsMap */
type OptionalKeys<T extends ParamsMap> = {
    [K in keyof T]: IsOptional<T[K]> extends true ? K : never;
}[keyof T];

/**
 * Infer the full args type from a ParamsMap.
 *
 * Required params become required properties, optional params become
 * optional properties with `| undefined`.
 */
export type InferParams<T extends ParamsMap> =
    { [K in RequiredKeys<T>]: InferSingleParam<T[K]> } &
    { [K in OptionalKeys<T>]?: InferSingleParam<T[K]> };

// ============================================================================
// Runtime Converter — JSON descriptors → Zod schema
// ============================================================================

/** Primitive string → Zod type. Single source of truth for all type resolution. */
const PRIMITIVE_ZOD: Record<PrimitiveType, () => ZodTypeAny> = {
    string:  () => z.string(),
    number:  () => z.number(),
    boolean: () => z.boolean(),
};

/**
 * Resolve a primitive type string to the corresponding Zod type.
 * @throws {Error} When the primitive type string is unknown
 */
function primitiveToZod(type: string, context: string): ZodTypeAny {
    if (!(type in PRIMITIVE_ZOD)) {
        throw new Error(`Unknown ${context} type: "${type}". Use 'string', 'number', or 'boolean'.`);
    }
    return PRIMITIVE_ZOD[type as PrimitiveType]();
}

/**
 * Finalize a Zod type by applying description and optionality.
 * DRY helper — every descriptor branch converges here.
 */
function finalize(zodType: ZodTypeAny, description?: string, optional?: boolean): ZodTypeAny {
    const described = description ? zodType.describe(description) : zodType;
    return optional === true ? described.optional() : described;
}

/**
 * Build a Zod description string, appending examples if present.
 * @internal
 */
function buildDescription(base?: string, examples?: readonly unknown[]): string | undefined {
    if (!base && (!examples || examples.length === 0)) return undefined;

    const parts: string[] = [];
    if (base) parts.push(base);
    if (examples && examples.length > 0) {
        const exStr = examples.map(e => `'${String(e)}'`).join(', ');
        parts.push(`(e.g. ${exStr})`);
    }
    return parts.join(' ');
}

// ── Per-descriptor converters ────────────────────────────

function convertEnum(def: EnumParamDef): ZodTypeAny {
    const desc = buildDescription(def.description, def.examples);
    return finalize(z.enum(def.enum as [string, ...string[]]), desc, def.optional);
}

function convertArray(def: ArrayParamDef): ZodTypeAny {
    let arrayType = z.array(primitiveToZod(def.array, 'array item'));
    if (def.min !== undefined) arrayType = arrayType.min(def.min);
    if (def.max !== undefined) arrayType = arrayType.max(def.max);
    return finalize(arrayType, def.description, def.optional);
}

function convertString(def: StringParamDef): ZodTypeAny {
    let s = z.string();
    if (def.min !== undefined) s = s.min(def.min);
    if (def.max !== undefined) s = s.max(def.max);
    if (def.regex !== undefined) s = s.regex(new RegExp(def.regex));
    const desc = buildDescription(def.description, def.examples);
    return finalize(s, desc, def.optional);
}

function convertNumber(def: NumberParamDef): ZodTypeAny {
    let n = z.number();
    if (def.int === true) n = n.int();
    if (def.min !== undefined) n = n.min(def.min);
    if (def.max !== undefined) n = n.max(def.max);
    const desc = buildDescription(def.description, def.examples);
    return finalize(n, desc, def.optional);
}

function convertBoolean(def: BooleanParamDef): ZodTypeAny {
    return finalize(z.boolean(), def.description, def.optional);
}

// ── Main converter (dispatch table) ──────────────────────

/**
 * Convert a single param descriptor to a Zod type.
 *
 * Dispatches to focused converter functions per descriptor kind.
 * Shorthand strings ('string', 'number', 'boolean') resolve directly.
 * @internal
 */
function descriptorToZod(value: ParamDef): ZodTypeAny {
    // Shorthand: 'string' | 'number' | 'boolean'
    if (typeof value === 'string') return primitiveToZod(value, 'shorthand');

    // Discriminated union dispatch
    if ('enum'  in value) return convertEnum(value);
    if ('array' in value) return convertArray(value);

    // Object descriptors: { type: 'string' | 'number' | 'boolean', ... }
    switch (value.type) {
        case 'string':  return convertString(value);
        case 'number':  return convertNumber(value);
        case 'boolean': return convertBoolean(value);
        default:
            throw new Error(`Unknown param type: "${(value as { type: string }).type}".`);
    }
}

/**
 * Convert a ParamsMap to a Zod object schema.
 *
 * @param params - Plain JSON param descriptors
 * @returns A ZodObject with full validation
 *
 * @example
 * ```typescript
 * const schema = convertParamsToZod({
 *     name: 'string',
 *     status: { enum: ['active', 'archived'], optional: true },
 *     limit: { type: 'number', min: 1, max: 100, optional: true },
 * });
 * // Equivalent to:
 * // z.object({
 * //     name: z.string(),
 * //     status: z.enum(['active','archived']).optional(),
 * //     limit: z.number().min(1).max(100).optional(),
 * // })
 * ```
 *
 * @internal
 */
export function convertParamsToZod(params: ParamsMap): ZodObject<ZodRawShape> {
    const shape: ZodRawShape = {};
    for (const [key, value] of Object.entries(params)) {
        shape[key] = descriptorToZod(value);
    }
    return z.object(shape);
}

