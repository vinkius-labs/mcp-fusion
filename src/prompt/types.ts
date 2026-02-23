/**
 * Prompt Engine — Types & Contracts
 *
 * Type-only module defining the core contracts for the Prompt Engine.
 * Follows the same "zero runtime code" pattern as `core/types.ts`.
 *
 * Key design decisions:
 * - `PromptParamDef` restricts to flat primitives only (no arrays, no nested objects)
 *   because MCP clients render prompt arguments as visual forms.
 * - `PromptResult` mirrors MCP SDK's `GetPromptResult` shape.
 * - `PromptBuilder` is the DIP interface that `PromptRegistry` depends on.
 *
 * @module
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type MiddlewareFn } from '../core/types.js';
import {
    type StringParamDef,
    type NumberParamDef,
    type BooleanParamDef,
    type EnumParamDef,
} from '../core/builder/ParamDescriptors.js';
import { type ToolResponse } from '../core/response.js';

// ── Internal Loopback Dispatcher ─────────────────────────

/**
 * Result of an internal Tool invocation from within a Prompt handler.
 *
 * Returned by `ctx.invokeTool()`. Provides the Presenter-rendered text
 * and error status without exposing MCP wire format internals.
 *
 * @example
 * ```typescript
 * const result = await ctx.invokeTool('billing.list_invoices', { date: '2026-01' });
 * if (result.isError) {
 *     // Handle gracefully — result.text contains the error message
 * }
 * // result.text contains the full Presenter-rendered output
 * ```
 */
export interface ToolInvocationResult {
    /** The full Presenter-rendered text output of the Tool */
    readonly text: string;
    /** Whether the Tool returned an error (`isError: true` in ToolResponse) */
    readonly isError: boolean;
    /** The original ToolResponse for advanced use cases */
    readonly raw: ToolResponse;
}

/**
 * Context extension injected by ServerAttachment when a PromptRegistry is attached.
 *
 * Enables **Internal Loopback Dispatch** — Prompt handlers can invoke Tools
 * in-memory without an LLM round-trip. The Tool's full pipeline runs:
 * middleware → validation → handler → Presenter. RBAC is enforced.
 *
 * **Design**: The Prompt acts as a server-side macro, aggregating data from
 * multiple Tools into a single prompt. The dev codes the extraction logic
 * once in the Tool, and the Prompt reuses the rendered result.
 *
 * @example
 * ```typescript
 * handler: async (ctx, args) => {
 *     const invoices = await ctx.invokeTool('billing.list_invoices', { date: args.date });
 *     const tickets  = await ctx.invokeTool('jira.get_assigned', { user_id: ctx.user.id });
 *
 *     return {
 *         messages: [
 *             PromptMessage.system('Plan my day based on this context:'),
 *             PromptMessage.user(`### Invoices\n${invoices.text}\n\n### Tickets\n${tickets.text}`),
 *         ],
 *     };
 * }
 * ```
 */
export interface LoopbackContext {
    /**
     * Invoke a Tool internally, in-memory.
     *
     * Runs the Tool's full pipeline (middleware → validate → handler → Presenter)
     * with the **same context** as the current Prompt request. RBAC is enforced.
     *
     * @param name - Tool name in canonical dot-notation (e.g. `'billing.list_invoices'`)
     * @param args - Arguments passed to the Tool handler (default: `{}`)
     * @returns The rendered Tool output
     */
    invokeTool(name: string, args?: Record<string, unknown>): Promise<ToolInvocationResult>;
}

// ── Prompt Interceptors ──────────────────────────────────

/**
 * Read-only metadata about the prompt being executed.
 *
 * Passed to interceptor callbacks so they can conditionally inject
 * context based on the prompt's identity, tags, or description.
 */
export interface PromptMeta {
    /** The prompt's registered name */
    readonly name: string;
    /** The prompt description (if provided) */
    readonly description?: string;
    /** The prompt's capability tags */
    readonly tags: readonly string[];
}

/**
 * Mutable builder-pattern facade for Prompt Interceptors.
 *
 * Interceptors use this to inject messages into the prompt result
 * without touching the developer's handler code. Multiple interceptors
 * compose cleanly — prepends stack in registration order (first registered
 * ends up at the very top), appends stack in registration order.
 *
 * @example
 * ```typescript
 * registry.useInterceptor(async (ctx, builder, meta) => {
 *     builder.prependSystem(
 *         `[COMPLIANCE] Tenant: ${ctx.tenant.id} | User: ${ctx.user.role}`
 *     );
 *     builder.appendUser('--- End of automated context ---');
 * });
 * ```
 */
export interface InterceptorBuilder {
    /** Prepend a system message at the TOP of the prompt messages */
    prependSystem(text: string): void;
    /** Prepend a user message at the TOP of the prompt messages */
    prependUser(text: string): void;
    /** Append a system message at the END of the prompt messages */
    appendSystem(text: string): void;
    /** Append a user message at the END of the prompt messages */
    appendUser(text: string): void;
    /** Append an assistant message at the END (for seeded responses) */
    appendAssistant(text: string): void;

    /**
     * Prepend structured context with XML semantic boundary (MX-optimized).
     *
     * Auto-wraps the data in `<{tag}_context>` XML tags, giving the LLM
     * a clear semantic boundary. Best for compliance, tenant, and RBAC context.
     *
     * @param tag - Semantic tag name (e.g. 'compliance', 'tenant', 'rbac')
     * @param data - Key-value pairs to inject
     *
     * @example
     * ```typescript
     * builder.prependContext('compliance', {
     *     role: ctx.user.role,
     *     tenant: ctx.tenant.id,
     * });
     * // LLM receives:
     * // <compliance_context>
     * //   role: admin
     * //   tenant: acme-corp
     * // </compliance_context>
     * ```
     */
    prependContext(tag: string, data: Record<string, string | number | boolean>): void;

    /**
     * Append structured context with XML semantic boundary (MX-optimized).
     *
     * Same as {@link prependContext} but appended at the END of messages.
     *
     * @param tag - Semantic tag name
     * @param data - Key-value pairs to inject
     */
    appendContext(tag: string, data: Record<string, string | number | boolean>): void;
}

/**
 * Prompt Interceptor callback signature.
 *
 * Interceptors run AFTER the handler produces its result and BEFORE
 * the result is returned to the MCP client. They can inject compliance
 * headers, tenant context, RBAC constraints, or any global context
 * that should wrap every prompt — without modifying individual handlers.
 *
 * The enterprise answer to "every prompt must include tenant context":
 * write it once, enforce it everywhere.
 *
 * @typeParam TContext - Application context type
 *
 * @example
 * ```typescript
 * // Register once — applies to ALL 50 prompts in the company:
 * promptRegistry.useInterceptor(async (ctx, builder, meta) => {
 *     builder.prependSystem(
 *         `[ENTERPRISE COMPLIANCE LAYER]\n` +
 *         `User Role: ${ctx.user.role} (Tenant ID: ${ctx.tenant.id})\n` +
 *         `Server Time: ${new Date().toISOString()}`
 *     );
 * });
 * ```
 */
export type PromptInterceptorFn<TContext> = (
    ctx: TContext,
    builder: InterceptorBuilder,
    meta: PromptMeta,
) => void | Promise<void>;

// ── PromptMessage Content Types (MCP ContentBlock) ───────

/**
 * Text content block — the most common prompt message type.
 */
export interface PromptTextContent {
    readonly type: 'text';
    readonly text: string;
}

/**
 * Image content block — base64-encoded image data.
 */
export interface PromptImageContent {
    readonly type: 'image';
    readonly data: string;
    readonly mimeType: string;
}

/**
 * Audio content block — base64-encoded audio data.
 */
export interface PromptAudioContent {
    readonly type: 'audio';
    readonly data: string;
    readonly mimeType: string;
}

/**
 * Embedded resource content block — references a server-side resource.
 */
export interface PromptResourceContent {
    readonly type: 'resource';
    readonly resource: {
        readonly uri: string;
        readonly mimeType?: string;
        readonly text?: string;
        readonly blob?: string;
    };
}

/**
 * Union of all MCP-compliant content types for prompt messages.
 *
 * Matches `ContentBlock` from the MCP spec:
 * `TextContent | ImageContent | AudioContent | ResourceLink | EmbeddedResource`
 */
export type PromptContentBlock =
    | PromptTextContent
    | PromptImageContent
    | PromptAudioContent
    | PromptResourceContent;

// ── PromptMessage (wire format) ──────────────────────────

/**
 * A single message within a hydrated prompt result.
 *
 * Fully MCP-compliant: supports text, image, audio, and
 * embedded resource content types.
 *
 * @see https://modelcontextprotocol.io/docs/concepts/prompts#promptmessage
 */
export interface PromptMessagePayload {
    readonly role: 'user' | 'assistant';
    readonly content: PromptContentBlock;
}

/**
 * The result of hydrating a prompt via `prompts/get`.
 *
 * Mirrors the MCP SDK `GetPromptResult` shape.
 */
export interface PromptResult {
    readonly description?: string;
    readonly messages: readonly PromptMessagePayload[];
}

// ── Flat Schema Constraint ───────────────────────────────

/**
 * Prompt-safe param descriptors: only flat primitives allowed.
 *
 * **Why?** MCP clients (Claude Desktop, Cursor) render prompt arguments
 * as native visual forms. Nested objects and arrays cannot be rendered
 * by any current MCP client — allowing them produces invisible or
 * broken form fields.
 *
 * Allowed: `'string'`, `'number'`, `'boolean'`, `StringParamDef`,
 * `NumberParamDef`, `BooleanParamDef`, `EnumParamDef`.
 *
 * ❌ `ArrayParamDef` — cannot be rendered as a form field.
 * ❌ Nested `ZodObject` — cannot be rendered as a form field.
 *
 * @see {@link PromptParamsMap} for the full prompt args type
 */
export type PromptParamDef =
    | 'string'
    | 'number'
    | 'boolean'
    | StringParamDef
    | NumberParamDef
    | BooleanParamDef
    | EnumParamDef<string>;

/**
 * Map of prompt argument names to their flat-only definitions.
 *
 * @example
 * ```typescript
 * const args: PromptParamsMap = {
 *     month: { enum: ['january', 'february'] },
 *     limit: { type: 'number', min: 1, max: 100 },
 *     verbose: 'boolean',
 * };
 * ```
 */
export type PromptParamsMap = Record<string, PromptParamDef>;

// ── Type Inference for Prompt Args ───────────────────────

/**
 * Infer the TypeScript type from a single `PromptParamDef`.
 *
 * Maps JSON descriptor shorthand to its corresponding TS type:
 * - `'string'` → `string`
 * - `'number'` → `number`
 * - `'boolean'` → `boolean`
 * - `StringParamDef` → `string`
 * - `NumberParamDef` → `number`
 * - `BooleanParamDef` → `boolean`
 * - `EnumParamDef<T>` → `T` (union of literal strings)
 */
type InferPromptParamType<T extends PromptParamDef> =
    T extends 'string' ? string :
    T extends 'number' ? number :
    T extends 'boolean' ? boolean :
    T extends StringParamDef ? string :
    T extends NumberParamDef ? number :
    T extends BooleanParamDef ? boolean :
    T extends EnumParamDef<infer E> ? E :
    unknown;

/**
 * Infer the full typed args object from a `PromptParamsMap`.
 *
 * Gives developers full autocomplete and type safety on handler args
 * when using the JSON-first descriptor approach — zero Zod imports needed.
 *
 * @example
 * ```typescript
 * const args = {
 *     name: { type: 'string', required: true },
 *     age:  { type: 'number' },
 * } as const;
 *
 * // InferPromptArgs<typeof args> = { name: string; age: number }
 * ```
 */
export type InferPromptArgs<T extends Record<string, PromptParamDef>> = {
    [K in keyof T]: InferPromptParamType<T[K]>;
};

// ── PromptBuilder Contract (DIP) ─────────────────────────

/**
 * Interface that all prompt builders must implement.
 *
 * This is the abstraction that {@link PromptRegistry} depends on,
 * following the Dependency Inversion Principle.
 *
 * @typeParam TContext - Application context passed to every handler
 */
export interface PromptBuilder<TContext = void> {
    /** Get the prompt name (used as the registration key) */
    getName(): string;

    /** Get the prompt description */
    getDescription(): string | undefined;

    /** Get the capability tags for selective exposure */
    getTags(): string[];

    /** Whether this prompt has middleware */
    hasMiddleware(): boolean;

    /**
     * Build and return the MCP Prompt definition (for `prompts/list`).
     *
     * Returns the prompt metadata including name, description,
     * and argument definitions.
     */
    buildPromptDefinition(): {
        name: string;
        description?: string;
        arguments?: Array<{
            name: string;
            description?: string;
            required?: boolean;
        }>;
    };

    /**
     * Execute the prompt hydration with the given context and arguments.
     *
     * Performs: coercion → validation → middleware → handler.
     *
     * @param ctx - Application context (from contextFactory)
     * @param args - Raw string arguments from the MCP client
     * @returns The hydrated prompt result with messages
     */
    execute(ctx: TContext, args: Record<string, string>): Promise<PromptResult>;
}

// ── PromptConfig (definePrompt input) ────────────────────

/**
 * Configuration for `definePrompt()`.
 *
 * @typeParam TContext - Application context type
 * @typeParam TArgs - Validated args type (inferred from `args`)
 */
export interface PromptConfig<TContext, TArgs extends Record<string, unknown> = Record<string, unknown>> {
    /** Human-readable title for display in UI (MCP spec `BaseMetadata.title`) */
    title?: string;

    /** Human-readable description shown in the slash command palette */
    description?: string;

    /** Icons for light/dark themes (MCP spec `Icons`) */
    icons?: { light?: string; dark?: string };

    /**
     * Argument definitions.
     *
     * Accepts either:
     * - `PromptParamsMap` (JSON descriptors) — zero Zod imports needed
     * - `ZodObject` — for power users who need full Zod control
     *
     * **Constraint:** Only flat primitives allowed. Arrays and nested
     * objects will fail with a runtime error at definition time.
     */
    args?: PromptParamsMap | ZodObject<ZodRawShape>;

    /** Capability tags for selective exposure */
    tags?: string[];

    /** Middleware chain (same signature as tool middleware) */
    middleware?: MiddlewareFn<TContext>[];

    /**
     * The hydration handler.
     *
     * Receives validated, typed, coerced args and returns a `PromptResult`.
     * This is where server-side data fetching and Presenter calls happen.
     *
     * **DX**: `ctx` is typed as `TContext & LoopbackContext` — `invokeTool()`
     * appears in autocomplete without any manual cast.
     */
    handler: (ctx: TContext & LoopbackContext, args: TArgs) => Promise<PromptResult>;
}
