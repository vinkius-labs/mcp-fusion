/**
 * Type Helpers — Zod-Backed Namespace for Presenter Schemas
 *
 * Inspired by ElysiaJS (`t.String`), Convex (`v.string()`), and
 * Encore.ts (native TS types). Provides a compact namespace that
 * eliminates the need to import Zod directly.
 *
 * Every `t.*` value IS a ZodType — zero abstraction leakage.
 * Developers who need advanced Zod features can use `t.zod` escape hatch
 * or mix `t.*` with raw Zod schemas freely.
 *
 * @example
 * ```typescript
 * import { createPresenter, t, ui } from '@vinkius-core/mcp-fusion';
 *
 * const InvoicePresenter = createPresenter('Invoice')
 *     .schema({
 *         id:           t.string,
 *         amount_cents: t.number.describe('CENTS — divide by 100'),
 *         status:       t.enum('draft', 'sent', 'paid', 'overdue'),
 *         tags:         t.array(t.string),
 *         metadata:     t.optional(t.record(t.string)),
 *     });
 * ```
 *
 * @module
 */
import { z, type ZodType, type ZodRawShape } from 'zod';

// ── Type Helpers Namespace ─────────────────────────────────

/**
 * Compact type namespace for Presenter schema definitions.
 *
 * Eliminates `import { z } from 'zod'` for 95% of use cases.
 * Every value is a real ZodType — `.describe()`, `.optional()`,
 * `.nullable()`, `.default()` all work natively.
 *
 * @example
 * ```typescript
 * .schema({
 *     id:     t.string,
 *     count:  t.number,
 *     active: t.boolean,
 *     role:   t.enum('admin', 'user', 'guest'),
 *     tags:   t.array(t.string),
 * })
 * ```
 */
export const t = {
    // ── Primitives (singleton instances) ──────────────────

    /** String type — equivalent to `z.string()` */
    string: z.string(),

    /** Number type — equivalent to `z.number()` */
    number: z.number(),

    /** Boolean type — equivalent to `z.boolean()` */
    boolean: z.boolean(),

    /** Date type — equivalent to `z.date()` */
    date: z.date(),

    // ── Composites (factory functions) ────────────────────

    /**
     * Create an enum type from string literals.
     *
     * @param values - At least one enum value
     * @returns A Zod enum schema
     *
     * @example
     * ```typescript
     * t.enum('active', 'archived')  // z.enum(['active', 'archived'])
     * ```
     */
    enum: <V extends string>(...values: [V, ...V[]]) =>
        z.enum(values),

    /**
     * Create an array type.
     *
     * @param item - The schema for array items
     * @returns A Zod array schema
     *
     * @example
     * ```typescript
     * t.array(t.string)       // z.array(z.string())
     * t.array(t.number)       // z.array(z.number())
     * ```
     */
    array: <T extends ZodType>(item: T) =>
        z.array(item),

    /**
     * Create a nested object type.
     *
     * @param shape - Object shape with ZodType values
     * @returns A Zod object schema
     *
     * @example
     * ```typescript
     * t.object({ lat: t.number, lng: t.number })  // z.object({...})
     * ```
     */
    object: <T extends ZodRawShape>(shape: T) =>
        z.object(shape),

    /**
     * Create a record (dictionary) type.
     *
     * @param valueType - Schema for record values
     * @returns A Zod record schema
     *
     * @example
     * ```typescript
     * t.record(t.string)  // z.record(z.string())
     * ```
     */
    record: <T extends ZodType>(valueType: T) =>
        z.record(valueType),

    // ── Modifiers (wrappers) ─────────────────────────────

    /**
     * Make a type optional.
     *
     * @param type - Any ZodType to make optional
     * @returns An optional variant of the given type
     *
     * @example
     * ```typescript
     * t.optional(t.string)   // z.string().optional()
     * t.optional(t.number)   // z.number().optional()
     * ```
     */
    optional: <T extends ZodType>(type: T) =>
        type.optional(),

    /**
     * Make a type nullable.
     *
     * @param type - Any ZodType to make nullable
     * @returns A nullable variant of the given type
     *
     * @example
     * ```typescript
     * t.nullable(t.string)   // z.string().nullable()
     * ```
     */
    nullable: <T extends ZodType>(type: T) =>
        type.nullable(),

    // ── Escape Hatch ─────────────────────────────────────

    /**
     * Direct access to Zod for advanced use cases.
     *
     * Use when `t.*` helpers don't cover your needs:
     * regex, transforms, refinements, unions, discriminated unions, etc.
     *
     * @example
     * ```typescript
     * .schema({
     *     id:    t.string,
     *     email: t.zod.string().email().min(5),  // Zod power features
     *     role:  t.zod.union([t.zod.literal('admin'), t.zod.literal('user')]),
     * })
     * ```
     */
    zod: z,
} as const;
