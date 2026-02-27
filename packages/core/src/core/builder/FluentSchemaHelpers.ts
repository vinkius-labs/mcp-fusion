/**
 * FluentSchemaHelpers — Chainable Parameter Declarations
 *
 * Provides `f.string()`, `f.number()`, `f.boolean()`, `f.enum()`, `f.array()`
 * that build ParamDescriptors via fluent method chaining.
 *
 * These are syntax sugar over the existing `ParamDescriptors` system.
 * At build time, `.toDescriptor()` produces the same JSON descriptor
 * that `convertParamsToZod()` already knows how to convert.
 *
 * @example
 * ```typescript
 * const f = initFusion<AppContext>();
 *
 * f.query('users.list')
 *   .input({
 *     limit:  f.number().min(1).max(100).default(10).describe('Max results'),
 *     status: f.enum('active', 'inactive').optional(),
 *     name:   f.string().min(3).example('Alice').describe('Search by name'),
 *   })
 *   .resolve(async ({ input, ctx }) => { ... });
 * ```
 *
 * @module
 */
import type {
    ParamDef,
    StringParamDef,
    NumberParamDef,
    BooleanParamDef,
    EnumParamDef,
    ArrayParamDef,
} from './ParamDescriptors.js';

// ── Sentinel for fluent descriptor detection ──────────────

/**
 * Symbol used to detect fluent schema helpers at runtime.
 * @internal
 */
export const FLUENT_DESCRIPTOR = Symbol.for('mcp-fusion.fluent-descriptor');

/**
 * Base interface for all fluent descriptors.
 * @internal
 */
export interface FluentDescriptor {
    readonly [FLUENT_DESCRIPTOR]: true;
    /** Convert the fluent descriptor to a plain ParamDef for ParamDescriptors. */
    toDescriptor(): ParamDef;
}

/**
 * Type guard: is this value a FluentDescriptor?
 * @internal
 */
export function isFluentDescriptor(value: unknown): value is FluentDescriptor {
    return (
        typeof value === 'object' &&
        value !== null &&
        FLUENT_DESCRIPTOR in value &&
        (value as Record<symbol, unknown>)[FLUENT_DESCRIPTOR] === true
    );
}

// ── Type Inference ───────────────────────────────────────

/**
 * Infer whether a fluent descriptor is optional.
 * @internal
 */
type IsFluentOptional<T> =
    T extends { _optional: true } ? true :
    T extends FluentString | FluentNumber | FluentBoolean | FluentEnum<string> | FluentArray ? false :
    false;

/**
 * Infer the TypeScript type from a single fluent descriptor or ParamDef.
 * @internal
 */
type InferSingleFluent<T> =
    T extends FluentString  ? string :
    T extends FluentNumber  ? number :
    T extends FluentBoolean ? boolean :
    T extends FluentEnum<infer V> ? V :
    T extends FluentArray   ? (
        T extends { _itemType: 'string' }  ? string[] :
        T extends { _itemType: 'number' }  ? number[] :
        T extends { _itemType: 'boolean' } ? boolean[] :
        unknown[]
    ) :
    // Fall through to ParamDef inference
    T extends 'string'  ? string :
    T extends 'number'  ? number :
    T extends 'boolean' ? boolean :
    T extends { type: 'string' }  ? string :
    T extends { type: 'number' }  ? number :
    T extends { type: 'boolean' } ? boolean :
    T extends { enum: readonly (infer V)[] } ? V :
    T extends { array: 'string' }  ? string[] :
    T extends { array: 'number' }  ? number[] :
    T extends { array: 'boolean' } ? boolean[] :
    unknown;

/**
 * Check if a fluent/param value is optional.
 * @internal
 */
type IsFieldOptional<T> =
    T extends { _optional: true } ? true :
    T extends { optional: true }  ? true :
    false;

/** Required keys from a FluentParamsMap */
type FluentRequiredKeys<T extends Record<string, unknown>> = {
    [K in keyof T]: IsFieldOptional<T[K]> extends true ? never : K;
}[keyof T];

/** Optional keys from a FluentParamsMap */
type FluentOptionalKeys<T extends Record<string, unknown>> = {
    [K in keyof T]: IsFieldOptional<T[K]> extends true ? K : never;
}[keyof T];

/**
 * Infer the full TypeScript type from a FluentParamsMap.
 *
 * Required params become required properties, optional params become
 * optional properties with `| undefined`.
 *
 * @example
 * ```typescript
 * const schema = {
 *   limit: f.number().min(1).max(100),           // required: number
 *   status: f.enum('active', 'inactive').optional(), // optional: 'active' | 'inactive'
 * };
 * type T = InferFluentParams<typeof schema>;
 * // { limit: number; status?: 'active' | 'inactive' }
 * ```
 */
export type InferFluentParams<T extends Record<string, unknown>> =
    { [K in FluentRequiredKeys<T>]: InferSingleFluent<T[K]> } &
    { [K in FluentOptionalKeys<T>]?: InferSingleFluent<T[K]> };

// ── String Helper ────────────────────────────────────────

export class FluentString implements FluentDescriptor {
    readonly [FLUENT_DESCRIPTOR] = true as const;
    private _desc?: string;
    /** @internal */ _optional = false;
    private _min?: number;
    private _max?: number;
    private _regex?: string;
    private _default?: string;
    private _examples?: string[];

    /** Set minimum string length */
    min(n: number): this { this._min = n; return this; }
    /** Set maximum string length */
    max(n: number): this { this._max = n; return this; }
    /** Set regex validation pattern */
    regex(pattern: string): this { this._regex = pattern; return this; }
    /** Mark as optional */
    optional(): FluentString & { _optional: true } {
        this._optional = true;
        return this as FluentString & { _optional: true };
    }
    /** Set human-readable description */
    describe(text: string): this { this._desc = text; return this; }
    /** Set default value (appended to description for LLM) */
    default(value: string): this { this._default = value; return this; }
    /** Add a single LLM few-shot example (AI-First DX) */
    example(value: string): this {
        if (!this._examples) this._examples = [];
        this._examples.push(value);
        return this;
    }
    /** Set multiple LLM few-shot examples */
    examples(...values: string[]): this { this._examples = values; return this; }

    toDescriptor(): StringParamDef {
        const desc = this._default !== undefined
            ? (this._desc ? `${this._desc} (default: '${this._default}')` : `(default: '${this._default}')`)
            : this._desc;

        return {
            type: 'string' as const,
            ...(desc && { description: desc }),
            ...(this._optional && { optional: true as const }),
            ...(this._min !== undefined && { min: this._min }),
            ...(this._max !== undefined && { max: this._max }),
            ...(this._regex !== undefined && { regex: this._regex }),
            ...(this._examples && { examples: this._examples }),
        };
    }
}

// ── Number Helper ────────────────────────────────────────

export class FluentNumber implements FluentDescriptor {
    readonly [FLUENT_DESCRIPTOR] = true as const;
    private _desc?: string;
    /** @internal */ _optional = false;
    private _min?: number;
    private _max?: number;
    private _int = false;
    private _default?: number;
    private _examples?: number[];

    /** Set minimum value */
    min(n: number): this { this._min = n; return this; }
    /** Set maximum value */
    max(n: number): this { this._max = n; return this; }
    /** Restrict to integers */
    int(): this { this._int = true; return this; }
    /** Mark as optional */
    optional(): FluentNumber & { _optional: true } {
        this._optional = true;
        return this as FluentNumber & { _optional: true };
    }
    /** Set human-readable description */
    describe(text: string): this { this._desc = text; return this; }
    /** Set default value (appended to description for LLM) */
    default(value: number): this { this._default = value; return this; }
    /** Add a single LLM few-shot example (AI-First DX) */
    example(value: number): this {
        if (!this._examples) this._examples = [];
        this._examples.push(value);
        return this;
    }
    /** Set multiple LLM few-shot examples */
    examples(...values: number[]): this { this._examples = values; return this; }

    toDescriptor(): NumberParamDef {
        const desc = this._default !== undefined
            ? (this._desc ? `${this._desc} (default: ${this._default})` : `(default: ${this._default})`)
            : this._desc;

        return {
            type: 'number' as const,
            ...(desc && { description: desc }),
            ...(this._optional && { optional: true as const }),
            ...(this._min !== undefined && { min: this._min }),
            ...(this._max !== undefined && { max: this._max }),
            ...(this._int && { int: true as const }),
            ...(this._examples && { examples: this._examples }),
        };
    }
}

// ── Boolean Helper ───────────────────────────────────────

export class FluentBoolean implements FluentDescriptor {
    readonly [FLUENT_DESCRIPTOR] = true as const;
    private _desc?: string;
    /** @internal */ _optional = false;
    private _default?: boolean;

    /** Mark as optional */
    optional(): FluentBoolean & { _optional: true } {
        this._optional = true;
        return this as FluentBoolean & { _optional: true };
    }
    /** Set human-readable description */
    describe(text: string): this { this._desc = text; return this; }
    /** Set default value (appended to description for LLM) */
    default(value: boolean): this { this._default = value; return this; }

    toDescriptor(): BooleanParamDef {
        const desc = this._default !== undefined
            ? (this._desc ? `${this._desc} (default: ${this._default})` : `(default: ${this._default})`)
            : this._desc;

        return {
            type: 'boolean' as const,
            ...(desc && { description: desc }),
            ...(this._optional && { optional: true as const }),
        };
    }
}

// ── Enum Helper ──────────────────────────────────────────

export class FluentEnum<V extends string = string> implements FluentDescriptor {
    readonly [FLUENT_DESCRIPTOR] = true as const;
    private _desc?: string;
    /** @internal */ _optional = false;
    private _examples?: V[];
    private _default?: V;
    private readonly _values: readonly [V, ...V[]];

    constructor(...values: [V, ...V[]]) {
        this._values = values;
    }

    /** Mark as optional */
    optional(): FluentEnum<V> & { _optional: true } {
        this._optional = true;
        return this as FluentEnum<V> & { _optional: true };
    }
    /** Set human-readable description */
    describe(text: string): this { this._desc = text; return this; }
    /** Set default value (appended to description for LLM) */
    default(value: V): this { this._default = value; return this; }
    /** Add a single LLM few-shot example (AI-First DX) */
    example(value: V): this {
        if (!this._examples) this._examples = [];
        this._examples.push(value);
        return this;
    }
    /** Set multiple LLM few-shot examples */
    examples(...values: V[]): this { this._examples = values; return this; }

    toDescriptor(): EnumParamDef<V> {
        const desc = this._default !== undefined
            ? (this._desc ? `${this._desc} (default: '${this._default}')` : `(default: '${this._default}')`)
            : this._desc;

        return {
            enum: this._values,
            ...(desc && { description: desc }),
            ...(this._optional && { optional: true as const }),
            ...(this._examples && { examples: this._examples }),
        };
    }
}

// ── Array Helper ─────────────────────────────────────────

type PrimitiveType = 'string' | 'number' | 'boolean';

export class FluentArray implements FluentDescriptor {
    readonly [FLUENT_DESCRIPTOR] = true as const;
    private _desc?: string;
    /** @internal */ _optional = false;
    private _min?: number;
    private _max?: number;
    /** @internal */ readonly _itemType: PrimitiveType;

    constructor(itemType: PrimitiveType) {
        this._itemType = itemType;
    }

    /** Set minimum array length */
    min(n: number): this { this._min = n; return this; }
    /** Set maximum array length */
    max(n: number): this { this._max = n; return this; }
    /** Mark as optional */
    optional(): FluentArray & { _optional: true } {
        this._optional = true;
        return this as FluentArray & { _optional: true };
    }
    /** Set human-readable description */
    describe(text: string): this { this._desc = text; return this; }

    toDescriptor(): ArrayParamDef {
        return {
            array: this._itemType,
            ...(this._desc && { description: this._desc }),
            ...(this._optional && { optional: true as const }),
            ...(this._min !== undefined && { min: this._min }),
            ...(this._max !== undefined && { max: this._max }),
        };
    }
}

// ── Fluent Input Map ─────────────────────────────────────

/**
 * A map where values can be either classic ParamDef or FluentDescriptor.
 * The FluentToolBuilder resolves these to ParamDef at build time.
 */
export type FluentParamsMap = Record<string, ParamDef | FluentDescriptor>;

/**
 * Resolve a FluentParamsMap to a plain ParamsMap by calling .toDescriptor()
 * on any FluentDescriptor values.
 * @internal
 */
export function resolveFluentParams(
    input: FluentParamsMap,
): Record<string, ParamDef> {
    const resolved: Record<string, ParamDef> = {};
    for (const [key, value] of Object.entries(input)) {
        resolved[key] = isFluentDescriptor(value)
            ? value.toDescriptor()
            : value;
    }
    return resolved;
}
