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

/**
 * Convert a single param descriptor to a Zod type.
 * @internal
 */
function descriptorToZod(value: ParamDef): ZodTypeAny {
    // String shorthand: 'string' | 'number' | 'boolean'
    if (typeof value === 'string') {
        switch (value) {
            case 'string': return z.string();
            case 'number': return z.number();
            case 'boolean': return z.boolean();
            default:
                throw new Error(`Unknown shorthand type: "${value}". Use 'string', 'number', or 'boolean'.`);
        }
    }

    // Enum descriptor: { enum: ['a', 'b'] }
    if ('enum' in value) {
        const desc = buildDescription(value.description, value.examples);
        let zodType: ZodTypeAny = z.enum(value.enum as [string, ...string[]]);
        if (desc) zodType = zodType.describe(desc);
        return value.optional ? zodType.optional() : zodType;
    }

    // Array descriptor: { array: 'string' }
    if ('array' in value) {
        let itemType: ZodTypeAny;
        switch (value.array) {
            case 'string': itemType = z.string(); break;
            case 'number': itemType = z.number(); break;
            case 'boolean': itemType = z.boolean(); break;
            default:
                throw new Error(`Unknown array item type: "${value.array}". Use 'string', 'number', or 'boolean'.`);
        }
        let arrayType = z.array(itemType);
        if (value.min !== undefined) arrayType = arrayType.min(value.min);
        if (value.max !== undefined) arrayType = arrayType.max(value.max);

        let zodType: ZodTypeAny = arrayType;
        if (value.description) zodType = zodType.describe(value.description);
        return value.optional ? zodType.optional() : zodType;
    }

    // Object descriptor: { type: 'string' | 'number' | 'boolean', ... }
    const desc = buildDescription(
        value.description,
        'examples' in value ? value.examples as readonly unknown[] : undefined,
    );

    let zodType: ZodTypeAny;

    switch (value.type) {
        case 'string': {
            let s = z.string();
            if ((value as StringParamDef).min !== undefined) s = s.min((value as StringParamDef).min!);
            if ((value as StringParamDef).max !== undefined) s = s.max((value as StringParamDef).max!);
            if ((value as StringParamDef).regex) s = s.regex(new RegExp((value as StringParamDef).regex!));
            zodType = s;
            break;
        }
        case 'number': {
            let n = z.number();
            if ((value as NumberParamDef).int) n = n.int();
            if ((value as NumberParamDef).min !== undefined) n = n.min((value as NumberParamDef).min!);
            if ((value as NumberParamDef).max !== undefined) n = n.max((value as NumberParamDef).max!);
            zodType = n;
            break;
        }
        case 'boolean': {
            zodType = z.boolean();
            break;
        }
        default:
            throw new Error(`Unknown param type: "${(value as { type: string }).type}".`);
    }

    if (desc) zodType = zodType.describe(desc);
    return value.optional ? zodType.optional() : zodType;
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
