/**
 * ask — Field Descriptor Namespace for MCP Elicitation
 *
 * The `ask` export is a **namespace only** (no callable). It provides the
 * `ask.*` field descriptor factories used by both:
 *
 *  - **`requireInput.elicit(message, fields)`** — the 2026-native return-based
 *    elicitation model. This is the supported path.
 *
 * The imperative callable form `await ask('message', { fields })` and
 * `await ask.redirect('message', url)` were **removed** in MCP Fusion 5.0
 * (MCP `2026-07-28`). They depended on a persistent server→client request
 * channel that the stateless protocol removes. Migrate to `requireInput()` +
 * `readInput()`.
 *
 * @example
 * ```typescript
 * import { initMCPFusion, ask, requireInput, readInput } from '@mcpfusion/core';
 *
 * const f = initMCPFusion<AppContext>();
 *
 * const deploy = f.mutation('infra.deploy')
 *     .withString('app_id', 'Application ID')
 *     .interactive()
 *     .handle(async (input) => {
 *         const answers = readInput<{ region: string; confirm: boolean }>('deploy');
 *
 *         if (!answers) {
 *             return requireInput({
 *                 inputRequests: {
 *                     deploy: requireInput.elicit('Confirm deployment:', {
 *                         region:  ask.enum(['us-east-1', 'eu-west-1'] as const, 'Region'),
 *                         confirm: ask.boolean('I confirm this deployment'),
 *                     }),
 *                 },
 *             });
 *         }
 *
 *         if (!answers.confirm) return f.error('CANCELLED', 'Aborted');
 *         return { region: answers.region };
 *     });
 * ```
 *
 * @module
 */
import {
    type AskField,
    type JsonSchemaProperty,
    AskStringField,
    AskNumberField,
    AskBooleanField,
    AskEnumField,
} from './types.js';

// ── Field Compiler ───────────────────────────────────────

/**
 * Compile a record of `AskField<T>` descriptors into a JSON Schema
 * object suitable for `elicitation/create`.
 *
 * @param fields - Object of `ask.*` field descriptors
 * @returns JSON Schema `{ type: 'object', properties, required }`
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compileAskFields(fields: Record<string, AskField<any>>): {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
} {
    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    for (const [key, field] of Object.entries(fields)) {
        properties[key] = field._compile();
        // All fields are required by default (no optional fields in elicitation forms)
        required.push(key);
    }

    return { type: 'object', properties, required };
}

// ── Callable Namespace ───────────────────────────────────

/**
 * The `ask` namespace type — field descriptor factories only.
 *
 * The callable form (`await ask(...)`) was removed in MCP Fusion 5.0.
 * Use `requireInput()` + `readInput()` for human-in-the-loop flows, and
 * `ask.*` to build the field descriptors passed to `requireInput.elicit()`.
 */
export interface AskNamespace {
    /**
     * Create a string field descriptor.
     *
     * @param description - Human-readable label
     * @returns `AskStringField` for chaining
     *
     * @example `ask.string('Your full name')`
     */
    string(description?: string): AskStringField;

    /**
     * Create a number field descriptor.
     *
     * @param description - Human-readable label
     * @returns `AskNumberField` with `.min()`, `.max()` chainable
     *
     * @example `ask.number('Team size').min(1).max(500)`
     */
    number(description?: string): AskNumberField;

    /**
     * Create a boolean field descriptor.
     *
     * @param description - Human-readable label
     * @returns `AskBooleanField` for chaining
     *
     * @example `ask.boolean('Accept terms').default(true)`
     */
    boolean(description?: string): AskBooleanField;

    /**
     * Create an enum field descriptor with type-safe literal union inference.
     *
     * @param values - Allowed values (`as const` for literal types)
     * @param description - Human-readable label
     * @returns `AskEnumField<V>` for chaining
     *
     * @example `ask.enum(['us-east-1', 'eu-west-1'] as const, 'Region')`
     */
    enum<V extends string>(values: readonly [V, ...V[]], description?: string): AskEnumField<V>;
}

/**
 * `ask` — Field Descriptor Namespace for MCP Elicitation.
 *
 * Provides `ask.string()`, `ask.number()`, `ask.boolean()`, `ask.enum()`
 * field factories used by `requireInput.elicit()`.
 *
 * The callable form (`await ask(...)`) and `ask.redirect()` were removed in
 * MCP Fusion 5.0 (MCP `2026-07-28`). Migrate to `requireInput()` +
 * `readInput()`.
 *
 * @example
 * ```typescript
 * import { ask } from '@mcpfusion/core';
 *
 * // DSL — field descriptors (reused by requireInput.elicit)
 * ask.string('Name')
 * ask.number('Age').min(18).max(120)
 * ask.boolean('Confirm').default(true)
 * ask.enum(['free', 'pro'] as const, 'Plan')
 * ```
 */
export const ask: AskNamespace = {
    string(description?: string): AskStringField {
        return new AskStringField(description);
    },

    number(description?: string): AskNumberField {
        return new AskNumberField(description);
    },

    boolean(description?: string): AskBooleanField {
        return new AskBooleanField(description);
    },

    enum<V extends string>(values: readonly [V, ...V[]], description?: string): AskEnumField<V> {
        return new AskEnumField<V>(values, description);
    },
};
