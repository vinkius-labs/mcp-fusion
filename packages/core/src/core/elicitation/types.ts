/**
 * Elicitation — Human-in-the-Loop Interaction Types
 *
 * MCP Elicitation (Form + URL modes) type declarations.
 * Provides the `AskField<T>` phantom-typed field descriptors and the
 * `AskResponse<T>` result wrapper with boolean guards.
 *
 * @module
 */

// ── Field Descriptor Base ────────────────────────────────

/**
 * Internal JSON Schema property produced by `_compile()`.
 * Maps 1:1 to the MCP `elicitation/create` `requestedSchema.properties[key]`.
 * @internal
 */
export interface JsonSchemaProperty {
    type: 'string' | 'number' | 'integer' | 'boolean';
    title?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
}

/**
 * Base class for all `ask.*` field descriptors.
 *
 * Uses a phantom `__type` brand so TypeScript can infer the
 * concrete type from the DSL without manual generic annotations.
 *
 * @typeParam T - The inferred TypeScript type for this field
 *
 * @example
 * ```typescript
 * // The developer never interacts with this class directly.
 * // They use `ask.string()`, `ask.number()`, etc.
 * ```
 */
export abstract class AskField<T> {
    /** Phantom brand for type inference — never accessed at runtime */
    declare readonly __type: T;

    /** @internal */
    protected _description: string | undefined;
    /** @internal */
    protected _defaultValue: T | undefined;

    constructor(description: string | undefined) {
        this._description = description;
    }

    /**
     * Set a default value for this field.
     *
     * @param value - Default value shown pre-filled in the client form
     * @returns `this` for chaining
     */
    default(value: T): this {
        this._defaultValue = value;
        return this;
    }

    /**
     * Set or override the field description.
     *
     * @param desc - Human-readable label/description
     * @returns `this` for chaining
     */
    describe(desc: string): this {
        this._description = desc;
        return this;
    }

    /**
     * Compile this descriptor to a JSON Schema property.
     * @internal
     */
    abstract _compile(): JsonSchemaProperty;
}

// ── Concrete Field Descriptors ───────────────────────────

/** String field descriptor — `ask.string('Name')` */
export class AskStringField extends AskField<string> {
    /** @internal */
    _compile(): JsonSchemaProperty {
        return {
            type: 'string',
            ...(this._description ? { description: this._description } : {}),
            ...(this._defaultValue !== undefined ? { default: this._defaultValue } : {}),
        };
    }
}

/** Number field descriptor — `ask.number('Age').min(18).max(120)` */
export class AskNumberField extends AskField<number> {
    /** @internal */
    private _min: number | undefined;
    /** @internal */
    private _max: number | undefined;

    /**
     * Set the minimum value constraint.
     * @param n - Minimum (inclusive)
     * @returns `this` for chaining
     */
    min(n: number): this {
        this._min = n;
        return this;
    }

    /**
     * Set the maximum value constraint.
     * @param n - Maximum (inclusive)
     * @returns `this` for chaining
     */
    max(n: number): this {
        this._max = n;
        return this;
    }

    /** @internal */
    _compile(): JsonSchemaProperty {
        return {
            type: 'number',
            ...(this._description ? { description: this._description } : {}),
            ...(this._defaultValue !== undefined ? { default: this._defaultValue } : {}),
            ...(this._min !== undefined ? { minimum: this._min } : {}),
            ...(this._max !== undefined ? { maximum: this._max } : {}),
        };
    }
}

/** Boolean field descriptor — `ask.boolean('Confirm').default(true)` */
export class AskBooleanField extends AskField<boolean> {
    /** @internal */
    _compile(): JsonSchemaProperty {
        return {
            type: 'boolean',
            ...(this._description ? { description: this._description } : {}),
            ...(this._defaultValue !== undefined ? { default: this._defaultValue } : {}),
        };
    }
}

/**
 * Enum field descriptor — `ask.enum(['a', 'b'] as const, 'Choose one')`
 *
 * @typeParam V - Literal union type inferred from the values array
 */
export class AskEnumField<V extends string> extends AskField<V> {
    /** @internal */
    private readonly _values: readonly V[];

    constructor(values: readonly [V, ...V[]], description: string | undefined) {
        super(description);
        this._values = values;
    }

    /** @internal */
    _compile(): JsonSchemaProperty {
        return {
            type: 'string',
            enum: [...this._values],
            ...(this._description ? { description: this._description } : {}),
            ...(this._defaultValue !== undefined ? { default: this._defaultValue } : {}),
        };
    }
}

// ── Type Inference ───────────────────────────────────────

/**
 * Extract the TypeScript type from a record of `AskField<T>` descriptors.
 *
 * This is the core type-level magic that makes `ask()` fully typed
 * without manual generic annotations.
 *
 * @example
 * ```typescript
 * const fields = {
 *     name: ask.string(),
 *     plan: ask.enum(['free', 'pro'] as const),
 * };
 * // InferAskFields<typeof fields> = { name: string; plan: 'free' | 'pro' }
 * ```
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferAskFields<T extends Record<string, AskField<any>>> = {
    [K in keyof T]: T[K] extends AskField<infer V> ? V : never;
};

// ── AskResponse ──────────────────────────────────────────

/** User's chosen action after seeing the elicitation form */
export type ElicitationAction = 'accept' | 'decline' | 'cancel';

/**
 * Response from an elicitation form (used internally by the runtime).
 *
 * Provides boolean guards (`.accepted`, `.declined`, `.cancelled`)
 * instead of string comparisons. `.data` throws if not accepted
 * (fail-fast pattern — no silent `undefined` bugs).
 *
 * @typeParam T - The inferred data shape from the form fields
 *
 * @example
 * ```typescript
 * const result = createAskResponse<{ name: string }>({ action: 'accept', content: { name: 'Alice' } });
 *
 * if (result.declined) return f.error('CANCELLED', 'Aborted');
 *
 * console.log(result.data.name); // string — fully typed, safe
 * ```
 */
export interface AskResponse<T> {
    /** Raw MCP action string */
    readonly action: ElicitationAction;
    /** True when the user submitted the form */
    readonly accepted: boolean;
    /** True when the user explicitly declined */
    readonly declined: boolean;
    /** True when the user dismissed without choosing */
    readonly cancelled: boolean;
    /**
     * The submitted data — populated when `accepted === true`.
     *
     * **Fail-fast**: Accessing `.data` when `declined` or `cancelled`
     * throws `ElicitationDeclinedError` to prevent silent bugs.
     */
    readonly data: T;
}

// ── AskResponse Factory ─────────────────────────────────

/**
 * Create an `AskResponse<T>` from the raw MCP elicitation result.
 *
 * The `.data` getter uses a fail-fast pattern: accessing it when
 * the user declined/cancelled throws `ElicitationDeclinedError`.
 *
 * @internal
 */
export function createAskResponse<T>(raw: { action?: string; content?: unknown }): AskResponse<T> {
    const action = (raw.action ?? 'cancel') as ElicitationAction;
    const accepted = action === 'accept';
    const declined = action === 'decline';
    const cancelled = action === 'cancel';
    const content = raw.content as T;

    return {
        action,
        accepted,
        declined,
        cancelled,
        get data(): T {
            if (!accepted) {
                throw new ElicitationDeclinedError(action);
            }
            return content;
        },
    };
}

// ── Errors ───────────────────────────────────────────────

/**
 * Thrown when elicitation is requested but no transport context is
 * available (e.g. stateless connection without a client driver), or
 * when the MCP client doesn't support elicitation.
 */
export class ElicitationUnsupportedError extends Error {
    constructor() {
        super(
            '[mcpfusion] Elicitation requested but no transport context is available. ' +
            'Ensure the tool uses `.interactive()` and the MCP client declares ' +
            '`{ capabilities: { elicitation: {} } }` during initialization.',
        );
        this.name = 'ElicitationUnsupportedError';
    }
}

/**
 * Thrown when `.data` is accessed on an `AskResponse` that the user
 * declined or cancelled. Prevents silent `undefined` propagation.
 */
export class ElicitationDeclinedError extends Error {
    constructor(action: string) {
        super(
            `[mcpfusion] Cannot access .data — the user ${action === 'decline' ? 'declined' : 'cancelled'} the elicitation. ` +
            `Check .declined or .cancelled before accessing .data.`,
        );
        this.name = 'ElicitationDeclinedError';
    }
}

// ── ElicitSink (Internal Transport Type) ─────────────────

/**
 * Internal transport function signature.
 * Bound via `AsyncLocalStorage` during handler execution.
 * @internal
 */
export type ElicitSink = (request: { method: string; params: unknown }) => Promise<unknown>;
