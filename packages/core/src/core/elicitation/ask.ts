/**
 * ask — Callable Namespace for MCP Elicitation
 *
 * The `ask` export is a **single symbol** that works as:
 * 1. A callable function: `await ask('message', { fields })`
 * 2. A DSL namespace: `ask.string()`, `ask.enum()`, `ask.boolean()`, `ask.number()`
 * 3. A URL redirect: `await ask.redirect('message', url)`
 *
 * The transport context (`sendRequest`) is bound per-request via
 * `AsyncLocalStorage` — the developer never sees it.
 *
 * @example
 * ```typescript
 * import { initMCPFusion, ask } from '@mcpfusion/core';
 *
 * const f = initMCPFusion<AppContext>();
 *
 * const deploy = f.mutation('infra.deploy')
 *     .withString('app_id', 'Application ID')
 *     .interactive()
 *     .handle(async (input) => {
 *         const prefs = await ask('Confirm deployment:', {
 *             region:  ask.enum(['us-east-1', 'eu-west-1'] as const, 'Region'),
 *             confirm: ask.boolean('I confirm this deployment'),
 *         });
 *
 *         if (prefs.declined) return f.error('CANCELLED', 'Aborted');
 *         return { region: prefs.data.region };
 *     });
 * ```
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
    type AskField,
    type AskResponse,
    type InferAskFields,
    type ElicitSink,
    type JsonSchemaProperty,
    AskStringField,
    AskNumberField,
    AskBooleanField,
    AskEnumField,
    ElicitationUnsupportedError,
    createAskResponse,
} from './types.js';

// ── AsyncLocalStorage (Per-Request Transport) ────────────

/**
 * Per-request storage for the elicitation transport function.
 *
 * Bound by `GroupedToolBuilder._executePipeline()` when the tool
 * declares `.interactive()` and the MCP SDK provides `sendRequest`.
 *
 * @internal
 */
export const _elicitStore = new AsyncLocalStorage<ElicitSink>();

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
 * The `ask` type — both a callable function and a namespace.
 *
 * This interface describes the shape of the `ask` export.
 * TypeScript sees it as `(message, fields) => Promise<AskResponse>` with
 * static methods `.string()`, `.number()`, `.boolean()`, `.enum()`, `.redirect()`.
 */
export interface AskFunction {
    /**
     * Ask the user for structured input via a client-rendered form.
     *
     * Fields are defined with `ask.*` descriptors — no raw JSON Schema.
     * Return type is fully inferred from the field descriptors.
     *
     * @deprecated Since MCP 2026-07-28 the server→client request channel this
     * relies on is removed. Prefer the return-based `requireInput()` + `readInput()`
     * model — it is stateless and serves both protocol eras. `ask()` keeps working
     * on 2025-era / streaming sessions during the deprecation window.
     *
     * @param message - Human-readable prompt shown to the user
     * @param fields  - Object of `ask.*` field descriptors
     * @returns `AskResponse<T>` with `.accepted`, `.declined`, `.data`
     *
     * @throws {ElicitationUnsupportedError} when called outside `.interactive()` context
     *
     * @example
     * ```typescript
     * const prefs = await ask('Configure your account:', {
     *     name: ask.string('Display name'),
     *     plan: ask.enum(['free', 'pro'] as const, 'Plan'),
     * });
     * ```
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T extends Record<string, AskField<any>>>(
        message: string,
        fields: T,
    ): Promise<AskResponse<InferAskFields<T>>>;

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

    /**
     * Redirect the user to an external URL (OAuth, payment, credentials).
     *
     * Use for sensitive operations that MUST NOT be handled via form fields.
     *
     * @deprecated Since MCP 2026-07-28. Prefer `requireInput({ inputRequests: { k:
     * requireInput.url(message, url) } })` and read the outcome with `inputResponse('k')`.
     *
     * @param message - Explanation of why the redirect is needed
     * @param url     - The URL to open in the user's browser
     * @returns `AskResponse<void>` with `.accepted` / `.declined`
     *
     * @throws {ElicitationUnsupportedError} when called outside `.interactive()` context
     *
     * @example
     * ```typescript
     * const auth = await ask.redirect('Authenticate with GitHub:', oauthUrl);
     * if (auth.declined) return f.error('CANCELLED', 'Auth cancelled');
     * ```
     */
    redirect(message: string, url: string): Promise<AskResponse<void>>;
}

/**
 * Resolve the `ElicitSink` from `AsyncLocalStorage`.
 * Throws `ElicitationUnsupportedError` if not in an `.interactive()` context.
 * @internal
 */
function getSink(): ElicitSink {
    const sink = _elicitStore.getStore();
    if (!sink) throw new ElicitationUnsupportedError();
    return sink;
}

/**
 * `ask` — The Callable Namespace for MCP Elicitation.
 *
 * Works as both a function (`await ask('msg', { fields })`) and a
 * namespace (`ask.string()`, `ask.enum()`, `ask.redirect()`).
 *
 * Transport context is bound via `AsyncLocalStorage` — zero `ctx` needed.
 *
 * @example
 * ```typescript
 * import { ask } from '@mcpfusion/core';
 *
 * // DSL — field descriptors
 * ask.string('Name')
 * ask.number('Age').min(18).max(120)
 * ask.boolean('Confirm').default(true)
 * ask.enum(['free', 'pro'] as const, 'Plan')
 *
 * // Form mode — request structured input
 * const result = await ask('Fill in:', { name: ask.string('Name') });
 *
 * // URL mode — redirect to external page
 * const auth = await ask.redirect('Authenticate:', oauthUrl);
 * ```
 */
 
export const ask: AskFunction = Object.assign(
    // ── Callable: await ask('message', { fields }) ──────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function ask<T extends Record<string, AskField<any>>>(
        message: string,
        fields: T,
    ): Promise<AskResponse<InferAskFields<T>>> {
        const sink = getSink();
        const schema = compileAskFields(fields);

        const raw = await sink({
            method: 'elicitation/create',
            params: {
                message,
                requestedSchema: schema,
            },
        }) as { action?: string; content?: unknown };

        return createAskResponse<InferAskFields<T>>(raw);
    },

    // ── Namespace: static field descriptor factories ────
    {
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

        async redirect(message: string, url: string): Promise<AskResponse<void>> {
            const sink = getSink();

            const raw = await sink({
                method: 'elicitation/create',
                params: { message, url },
            }) as { action?: string; content?: unknown };

            return createAskResponse<void>(raw);
        },
    },
);
