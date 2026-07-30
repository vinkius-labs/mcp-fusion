/**
 * FluentToolBuilder — Type-Chaining Builder for Semantic Verb Tools
 *
 * The core builder behind `f.query()`, `f.mutation()`, and `f.action()`.
 * Uses TypeScript generic accumulation so that each fluent step narrows
 * the types — the IDE "magically" knows the exact shape of `input` and
 * `ctx` inside `.handle()` without any manual Interface declaration.
 *
 * @example
 * ```typescript
 * const f = initMCPFusion<AppContext>();
 *
 * const listUsers = f.query('users.list')
 *     .describe('List users from the database')
 *     .withNumber('limit', 'Max results to return')
 *     .withOptionalEnum('status', ['active', 'inactive'], 'Filter by status')
 *     .returns(UserPresenter)
 *     .handle(async (input, ctx) => {
 *         return ctx.db.user.findMany({ take: input.limit });
 *     });
 * ```
 *
 * @see {@link FluentRouter} for prefix grouping
 * @see {@link initMCPFusion} for the factory that creates these builders
 *
 * @module
 */
import { z, type ZodType, type ZodObject, type ZodRawShape } from 'zod';
import { type Model, compileFieldForInput } from '../../model/defineModel.js';
import type { GroupedToolBuilder } from './GroupedToolBuilder.js';
import { type ToolResponse, type MiddlewareFn } from '../types.js';
import { type Presenter } from '../../presenter/Presenter.js';
import { type ConcurrencyConfig } from '../execution/ConcurrencyGuard.js';
import { type SandboxConfig } from '../../sandbox/SandboxEngine.js';
import { type MiddlewareDefinition } from '../middleware/ContextDerivation.js';
import { type SemanticDefaults } from './SemanticDefaults.js';
import { createProxyHandler } from './ProxyHandler.js';
import { buildToolFromFluent } from './BuildPipeline.js';

// Re-export SemanticDefaults for backward compatibility
export { type SemanticDefaults, QUERY_DEFAULTS, MUTATION_DEFAULTS, ACTION_DEFAULTS } from './SemanticDefaults.js';

// ── Array Item Type Resolution ───────────────────────────

/** Resolve Zod type from array item type string */
function resolveArrayItemType(itemType: 'string' | 'number' | 'boolean'): ZodType {
    switch (itemType) {
        case 'string': return z.string();
        case 'number': return z.number();
        case 'boolean': return z.boolean();
    }
}

// ── Schema Description Helper ─────────────────────────────

/**
 * Apply a `.describe()` annotation to a Zod schema only when a description
 * is provided. Eliminates the repeated ternary in every `with*()` method:
 *   `description ? z.X().describe(description) : z.X()`
 * → `withDesc(z.X(), description)`
 *
 * @internal
 */
function withDesc<T extends ZodType>(schema: T, description?: string): T {
    return description ? (schema.describe(description) as T) : schema;
}

// ── FluentToolBuilder ────────────────────────────────────

/**
 * Fluent builder that accumulates types at each step.
 *
 * @typeParam TContext - Base application context (from `initMCPFusion<TContext>()`)
 * @typeParam TInput - Accumulated input type (built by `with*()` methods)
 * @typeParam TCtx - Accumulated context type (enriched by `.use()`)
 */
export class FluentToolBuilder<
    TContext,
     
    TInput = Record<string, never>,
    TCtx = TContext,
> {
    /** @internal */ readonly _name: string;
    /** @internal */ _description?: string;
    /** @internal */ _instructions?: string;
    /** @internal */ _inputSchema?: ZodObject<ZodRawShape>;
    /** @internal */ _withParams: Record<string, ZodType> = {};
    /** @internal */ _tags: string[] = [];
    /** @internal */ _modelRef?: Model;
    /**
     * @internal Map of parameter name → HTTP header name for `x-mcp-header`
     * annotation (MCP 2.0 — `2026-07-28`). Populated by `.withHeaderParam()`.
     */
    /** @internal */ _headerParams: Map<string, string> = new Map();
    /** @internal MCP 2.0 output schema for structured tool results. */
    /** @internal */ _outputSchema?: Record<string, unknown>;
    /** @internal MCP 2.0 human-readable display title. */
    /** @internal */ _title?: string;
    /** @internal MCP 2.0 icons array. */
    /** @internal */ _icons?: ReadonlyArray<{ src: string; mimeType?: string; sizes?: readonly string[]; theme?: 'light' | 'dark' }>;

    /**
     * @internal reject duplicate parameter names.
     * All `withXxx()` methods delegate to this instead of assigning directly.
     */
    private _addParam(name: string, schema: ZodType): void {
        if (!name || !name.trim()) {
            throw new Error(
                `Empty parameter name on tool "${this._name}". ` +
                `Each parameter must have a non-empty name.`,
            );
        }
        if (Object.prototype.hasOwnProperty.call(this._withParams, name)) {
            throw new Error(
                `Duplicate parameter name "${name}" on tool "${this._name}". ` +
                `Each parameter must have a unique name.`,
            );
        }
        this._withParams[name] = schema;
    }
    /** @internal */ _middlewares: MiddlewareFn<TContext>[] = [];
    /** @internal */ _returns?: Presenter<unknown>;
    /** @internal */ _semanticDefaults: SemanticDefaults;
    /** @internal */ _readOnly?: boolean;
    /** @internal */ _destructive?: boolean;
    /** @internal */ _idempotent?: boolean;
    /** @internal */ _toonMode = false;
    /** @internal */ _annotations?: Record<string, unknown>;
    /** @internal */ _invalidatesPatterns: string[] = [];
    /** @internal */ _cacheControl?: 'no-store' | 'immutable';
    /** @internal */ _concurrency?: ConcurrencyConfig;
    /** @internal */ _egressMaxBytes?: number;
    /** @internal */ _sandboxConfig?: SandboxConfig;
    /** @internal */ _handlerSet = false;
    /** @internal */ _fsmStates?: string[];
    /** @internal */ _fsmTransition?: string;
    /** @internal */ _interactive = false;
    /** @internal */ _compactDescription?: string;

    /**
     * @param name - Tool name in `domain.action` format (e.g. `'users.list'`)
     * @param defaults - Semantic defaults from the verb (`query`, `mutation`, `action`)
     */
    constructor(name: string, defaults: SemanticDefaults = {}) {
        if (!name || !name.trim()) {
            throw new Error(
                'Tool name must be a non-empty string. ' +
                'Use the "domain.action" format (e.g. "users.list").',
            );
        }
        this._name = name;
        this._semanticDefaults = defaults;
    }

    // ── Configuration (fluent, each returns narrowed type) ──

    /**
     * Set the tool description shown to the LLM.
     *
     * @param text - Human-readable description
     * @returns `this` for chaining
     */
    describe(text: string): FluentToolBuilder<TContext, TInput, TCtx> {
        this._description = text;
        return this;
    }

    /**
     * Set a compact description for FSM progressive disclosure.
     *
     * This short description (~200 chars) is shown during `tools/list` discovery
     * when the FSM is in 'compact' state. After the first successful call, the
     * FSM transitions to 'expert' state and the full `.describe()` content is
     * exposed via `listChanged` re-fetch.
     *
     * @param text - Short, functional description of what the tool does
     * @returns `this` for chaining
     */
    compactDescription(text: string): FluentToolBuilder<TContext, TInput, TCtx> {
        this._compactDescription = text;
        return this;
    }

    /**
     * Set AI-First instructions — injected as system-level guidance in the tool description.
     *
     * This is **Prompt Engineering embedded in the framework**. The instructions
     * tell the LLM WHEN and HOW to use this tool, reducing hallucination.
     *
     * @param text - System prompt for the tool
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('docs.search')
     *     .describe('Search internal documentation')
     *     .instructions('Use ONLY when the user asks about internal policies.')
     *     .withString('query', 'Search term')
     *     .handle(async (input) => { ... });
     * ```
     */
    instructions(text: string): FluentToolBuilder<TContext, TInput, TCtx> {
        this._instructions = text;
        return this;
    }

    // ── Parameter Declaration (with* methods) ────────────

    /**
     * Add a required string parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('projects.get')
     *     .withString('project_id', 'The project ID to retrieve')
     *     .handle(async (input) => { ... });
     * // input.project_id: string ✅
     * ```
     */
    withString<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, string>, TCtx> {
        this._addParam(name, withDesc(z.string(), description));
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, string>, TCtx>;
    }

    /**
     * Add a string parameter that is mirrored into an HTTP header on
     * Streamable HTTP transport (MCP 2.0 `x-mcp-header` — `2026-07-28`).
     *
     * The parameter is registered as a normal string input AND annotated
     * with `x-mcp-header` in the tool's `inputSchema`. When the client
     * calls this tool over Streamable HTTP, the parameter value is
     * automatically sent as the `Mcp-Param-{headerName}` HTTP header,
     * enabling network intermediaries (load balancers, proxies, WAFs)
     * to route requests without parsing the body.
     *
     * **Constraints** (per MCP 2.0 spec):
     * - MUST NOT be used for sensitive parameters (passwords, API keys, PII)
     * - Only applies to primitive types (string, integer, boolean — not number)
     * - Header name MUST match HTTP field-name token syntax (RFC 9110)
     *
     * @param name - Parameter name (also the tool argument key)
     * @param headerName - HTTP header name portion (results in `Mcp-Param-{headerName}`)
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * const executeSql = f.query('db.execute_sql')
     *     .withHeaderParam('region', 'Region', 'Cloud region for the query')
     *     .withString('query', 'SQL query to execute')
     *     .handle(async (input) => { /* ... *\/ });
     * ```
     *
     * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools#x-mcp-header
     */
    withHeaderParam<K extends string>(
        name: K,
        headerName: string,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, string>, TCtx> {
        if (!headerName || !headerName.trim()) {
            throw new Error(
                `Empty header name for x-mcp-header on parameter "${name}" of tool "${this._name}".`,
            );
        }
        this._addParam(name, withDesc(z.string(), description));
        this._headerParams.set(name, headerName);
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, string>, TCtx>;
    }

    /**
     * Set the output schema for structured tool results (MCP 2.0 — `2026-07-28`).
     *
     * When provided, the tool definition includes `outputSchema` so clients
     * and LLMs can validate structured results. Pair with `successStructured()`
     * to return `structuredContent` conforming to this schema.
     *
     * @param schema - JSON Schema object describing the tool's output structure
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * const getWeather = f.query('weather.get')
     *     .withString('location', 'City name')
     *     .withOutputSchema({
     *         type: 'object',
     *         properties: {
     *             temperature: { type: 'number' },
     *             conditions: { type: 'string' },
     *         },
     *         required: ['temperature', 'conditions'],
     *     })
     *     .handle(async (input) => successStructured({ temperature: 22.5, conditions: 'Partly cloudy' }));
     * ```
     *
     * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema
     */
    withOutputSchema(schema: Record<string, unknown>): this {
        this._outputSchema = schema;
        return this;
    }

    /**
     * Set a human-readable display title for the tool (MCP 2.0 — `2026-07-28`).
     *
     * Shown in client UIs alongside the tool name.
     *
     * @param title - Human-readable display name
     * @returns `this` for chaining
     *
     * @see https://modelcontextprotocol.io/specification/2026-07-28/server/tools
     */
    withTitle(title: string): this {
        this._title = title;
        return this;
    }

    /**
     * Set an icon for the tool (MCP 2.0 — `2026-07-28`).
     *
     * Visual identifier for display in client UIs.
     *
     * @param src - URI pointing to the icon resource (HTTPS or data URI)
     * @param opts - Optional MIME type, sizes, and theme
     * @returns `this` for chaining
     *
     * @see https://modelcontextprotocol.io/specification/2026-07-28/basic#index#icons
     */
    withIcon(
        src: string,
        opts?: { mimeType?: string; sizes?: readonly string[]; theme?: 'light' | 'dark' },
    ): this {
        const icon: { src: string; mimeType?: string; sizes?: readonly string[]; theme?: 'light' | 'dark' } = { src };
        if (opts?.mimeType) icon.mimeType = opts.mimeType;
        if (opts?.sizes) icon.sizes = opts.sizes;
        if (opts?.theme) icon.theme = opts.theme;
        this._icons = [...(this._icons ?? []), icon];
        return this;
    }

    /**
     * Add an optional string parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalString<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, string>>, TCtx> {
        this._addParam(name, withDesc(z.string(), description).optional());
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, string>>, TCtx>;
    }

    /**
     * Add a required number parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withNumber<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, number>, TCtx> {
        this._addParam(name, withDesc(z.number(), description));
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, number>, TCtx>;
    }

    /**
     * Add an optional number parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalNumber<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, number>>, TCtx> {
        this._addParam(name, withDesc(z.number(), description).optional());
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, number>>, TCtx>;
    }

    /**
     * Add a required boolean parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withBoolean<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, boolean>, TCtx> {
        this._addParam(name, withDesc(z.boolean(), description));
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, boolean>, TCtx>;
    }

    /**
     * Add an optional boolean parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalBoolean<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, boolean>>, TCtx> {
        this._addParam(name, withDesc(z.boolean(), description).optional());
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, boolean>>, TCtx>;
    }

    // ── Bulk Parameter Declaration ────────────────────────
    //
    // Batch variants accept a Record<string, string> where
    // keys are parameter names and values are descriptions.
    //
    // Before:
    //   .withOptionalString('title', 'Filter by title')
    //   .withOptionalString('status', 'Status filter')
    //
    // After:
    //   .withOptionalStrings({ title: 'Filter by title', status: 'Status filter' })

    /**
     * Add multiple required string parameters in bulk.
     *
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.get')
     *     .withStrings({
     *         company_slug: 'Workspace identifier',
     *         project_slug: 'Project identifier',
     *     })
     *     .handle(async (input) => { ... });
     * // input.company_slug: string ✅
     * // input.project_slug: string ✅
     * ```
     */
    withStrings<R extends Record<string, string>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: string }, TCtx> {
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.string(), description));
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: string }, TCtx>;
    }

    /**
     * Add multiple optional string parameters in bulk.
     *
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.filter')
     *     .withOptionalStrings({
     *         title:    'Filter by title (partial match)',
     *         workflow: 'Column name (e.g. "In Progress")',
     *         labels:   'Comma-separated label names',
     *     })
     *     .handle(async (input) => { ... });
     * // input.title?: string | undefined ✅
     * ```
     */
    withOptionalStrings<R extends Record<string, string>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: string | undefined }, TCtx> {
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.string(), description).optional());
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: string | undefined }, TCtx>;
    }

    /**
     * Add multiple required number parameters in bulk.
     *
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     */
    withNumbers<R extends Record<string, string>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: number }, TCtx> {
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.number(), description));
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: number }, TCtx>;
    }

    /**
     * Add multiple optional number parameters in bulk.
     *
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.filter')
     *     .withOptionalNumbers({
     *         per_page:  'Results per page (default: 50)',
     *         offset:    'Pagination offset',
     *     })
     *     .handle(async (input) => { ... });
     * // input.per_page?: number | undefined ✅
     * ```
     */
    withOptionalNumbers<R extends Record<string, string>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: number | undefined }, TCtx> {
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.number(), description).optional());
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: number | undefined }, TCtx>;
    }

    /**
     * Add multiple required boolean parameters in bulk.
     *
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     */
    withBooleans<R extends Record<string, string>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: boolean }, TCtx> {
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.boolean(), description));
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: boolean }, TCtx>;
    }

    /**
     * Add multiple optional boolean parameters in bulk.
     *
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.filter')
     *     .withOptionalBooleans({
     *         is_blocker:  'Only blockers',
     *         is_bug:      'Only bugs',
     *         unassigned:  'Only unassigned tasks',
     *         is_archived: 'Include archived tasks',
     *     })
     *     .handle(async (input) => { ... });
     * // input.is_blocker?: boolean | undefined ✅
     * ```
     */
    withOptionalBooleans<R extends Record<string, string>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: boolean | undefined }, TCtx> {
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.boolean(), description).optional());
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: boolean | undefined }, TCtx>;
    }

    /**
     * Add a required enum parameter.
     *
     * @param name - Parameter name
     * @param values - Allowed enum values
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('invoices.list')
     *     .withEnum('status', ['draft', 'sent', 'paid'], 'Filter by status')
     *     .handle(async (input) => { ... });
     * // input.status: 'draft' | 'sent' | 'paid' ✅
     * ```
     */
    withEnum<K extends string, V extends string>(
        name: K,
        values: readonly [V, ...V[]],
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, V>, TCtx> {
        this._addParam(name, withDesc(z.enum(values as [V, ...V[]]), description));
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, V>, TCtx>;
    }

    /**
     * Add an optional enum parameter.
     *
     * @param name - Parameter name
     * @param values - Allowed enum values
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalEnum<K extends string, V extends string>(
        name: K,
        values: readonly [V, ...V[]],
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, V>>, TCtx> {
        this._addParam(name, withDesc(z.enum(values as [V, ...V[]]), description).optional());
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, V>>, TCtx>;
    }

    /**
     * Add a required array parameter.
     *
     * @param name - Parameter name
     * @param itemType - Type of array items (`'string'`, `'number'`, `'boolean'`)
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.mutation('tasks.tag')
     *     .withString('task_id', 'The task to tag')
     *     .withArray('tags', 'string', 'Tags to apply')
     *     .handle(async (input) => { ... });
     * // input.tags: string[] ✅
     * ```
     */
    withArray<K extends string, I extends 'string' | 'number' | 'boolean'>(
        name: K,
        itemType: I,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>, TCtx> {
        this._addParam(name, withDesc(z.array(resolveArrayItemType(itemType)), description));
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>, TCtx>;
    }

    /**
     * Add an optional array parameter.
     *
     * @param name - Parameter name
     * @param itemType - Type of array items (`'string'`, `'number'`, `'boolean'`)
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalArray<K extends string, I extends 'string' | 'number' | 'boolean'>(
        name: K,
        itemType: I,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>>, TCtx> {
        this._addParam(name, withDesc(z.array(resolveArrayItemType(itemType)), description).optional());
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, (I extends 'string' ? string : I extends 'number' ? number : boolean)[]>>, TCtx>;
    }

    // ── JSON Object Parameters ─────────────────────────────

    /**
     * Add a required JSON object parameter.
     *
     * Accepts an arbitrary key–value object. Useful for tools that
     * receive structured payloads, configuration maps, or filter sets.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.action('reports.generate')
     *     .withJson('payload', 'Report configuration (dates, metrics, grouping)')
     *     .handle(async (input) => { ... });
     * // input.payload: Record<string, unknown> ✅
     * ```
     */
    withJson<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Record<K, Record<string, unknown>>, TCtx> {
        this._addParam(name, withDesc(z.record(z.string(), z.any()), description));
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<K, Record<string, unknown>>, TCtx>;
    }

    /**
     * Add an optional JSON object parameter.
     *
     * @param name - Parameter name
     * @param description - Human-readable description for the LLM
     * @returns Builder with narrowed `TInput` type
     */
    withOptionalJson<K extends string>(
        name: K,
        description?: string,
    ): FluentToolBuilder<TContext, TInput & Partial<Record<K, Record<string, unknown>>>, TCtx> {
        this._addParam(name, withDesc(z.record(z.string(), z.any()), description).optional());
        return this as unknown as FluentToolBuilder<TContext, TInput & Partial<Record<K, Record<string, unknown>>>, TCtx>;
    }

    // ── Bulk Enum & Array Declaration ─────────────────────

    /**
     * Add multiple required enum parameters in bulk.
     *
     * Each entry is `paramName: [allowedValues, description?]`.
     *
     * @param fields - Record of `{ paramName: [values, description?] }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.filter')
     *     .withEnums({
     *         status:   [['open', 'closed', 'archived'], 'Task status'],
     *         priority: [['low', 'medium', 'high'], 'Priority level'],
     *     })
     *     .handle(async (input) => { ... });
     * // input.status: 'open' | 'closed' | 'archived' ✅
     * ```
     */
    withEnums<R extends Record<string, readonly [readonly [string, ...string[]], string?]>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: R[K][0][number] }, TCtx> {
        for (const [name, [values, description]] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.enum(values as [string, ...string[]]), description));
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: R[K][0][number] }, TCtx>;
    }

    /**
     * Add multiple optional enum parameters in bulk.
     *
     * Each entry is `paramName: [allowedValues, description?]`.
     *
     * @param fields - Record of `{ paramName: [values, description?] }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.filter')
     *     .withOptionalEnums({
     *         status:   [['open', 'closed'], 'Filter by status'],
     *         priority: [['low', 'medium', 'high'], 'Filter by priority'],
     *     })
     *     .handle(async (input) => { ... });
     * // input.status?: 'open' | 'closed' | undefined ✅
     * ```
     */
    withOptionalEnums<R extends Record<string, readonly [readonly [string, ...string[]], string?]>>(
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: R[K][0][number] | undefined }, TCtx> {
        for (const [name, [values, description]] of Object.entries(fields)) {
            this._addParam(name, withDesc(z.enum(values as [string, ...string[]]), description).optional());
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: R[K][0][number] | undefined }, TCtx>;
    }

    /**
     * Add multiple required array parameters in bulk, sharing the same item type.
     *
     * @param itemType - Type of array items (`'string'`, `'number'`, `'boolean'`)
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.mutation('tasks.update')
     *     .withArrays('string', {
     *         tags:   'Tags to apply',
     *         labels: 'Category labels',
     *     })
     *     .handle(async (input) => { ... });
     * // input.tags: string[] ✅
     * // input.labels: string[] ✅
     * ```
     */
    withArrays<I extends 'string' | 'number' | 'boolean', R extends Record<string, string>>(
        itemType: I,
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: (I extends 'string' ? string : I extends 'number' ? number : boolean)[] }, TCtx> {
        const base = z.array(resolveArrayItemType(itemType));
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(base, description));
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]: (I extends 'string' ? string : I extends 'number' ? number : boolean)[] }, TCtx>;
    }

    /**
     * Add multiple optional array parameters in bulk, sharing the same item type.
     *
     * @param itemType - Type of array items (`'string'`, `'number'`, `'boolean'`)
     * @param fields - Record of `{ paramName: 'description' }`
     * @returns Builder with narrowed `TInput` type
     *
     * @example
     * ```typescript
     * f.query('tasks.filter')
     *     .withOptionalArrays('string', {
     *         tags:   'Filter by tags',
     *         labels: 'Filter by labels',
     *     })
     *     .handle(async (input) => { ... });
     * // input.tags?: string[] | undefined ✅
     * ```
     */
    withOptionalArrays<I extends 'string' | 'number' | 'boolean', R extends Record<string, string>>(
        itemType: I,
        fields: R,
    ): FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: (I extends 'string' ? string : I extends 'number' ? number : boolean)[] | undefined }, TCtx> {
        const base = z.array(resolveArrayItemType(itemType));
        for (const [name, description] of Object.entries(fields)) {
            this._addParam(name, withDesc(base, description).optional());
        }
        return this as unknown as FluentToolBuilder<TContext, TInput & { [K in keyof R & string]?: (I extends 'string' ? string : I extends 'number' ? number : boolean)[] | undefined }, TCtx>;
    }

    // ── Model Integration ─────────────────────────────────

    /**
     * Derive tool input parameters from a Model's fillable profile.
     *
     * Reads the specified operation from `model.input` (fillable profiles),
     * then adds each field as a parameter using the type and description from
     * the Model's casts. For `create`, fields respect their schema optionality.
     * For `update` and `filter`, all fields become optional.
     *
     * @param model - A `Model` from `defineModel()`
     * @param operation - The fillable profile name (e.g. `'create'`, `'update'`, `'filter'`)
     * @returns Builder with additional parameters from the Model
     *
     * @example
     * ```typescript
     * f.mutation('task.create')
     *   .fromModel(TaskModel, 'create')
     *   .withStrings({ company_slug: '...', project_slug: '...' })
     *   .handle(async (input, ctx) => { ... });
     * ```
     */
    fromModel<M extends Model>(
        model: M,
        operation: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Model fields are runtime-defined; `any` avoids forced casting
    ): FluentToolBuilder<TContext, TInput & Record<string, any>, TCtx> {
        const fieldNames = model.input[operation];
        if (!fieldNames) {
            throw new Error(
                `Model "${model.name}" has no fillable profile "${operation}". ` +
                `Available: ${Object.keys(model.input).join(', ') || 'none'}`,
            );
        }

        // Determine if all fields should be forced optional (update/filter semantics)
        const forceOptional = operation !== 'create';

        for (const fieldName of fieldNames) {
            const fieldDef = model.fields[fieldName];
            if (!fieldDef) {
                throw new Error(
                    `Model "${model.name}" fillable profile "${operation}" references ` +
                    `field "${fieldName}" which is not defined in casts.`,
                );
            }

            // Compile FieldDef → Zod schema for input context
            const schema = compileFieldForInput(fieldDef, forceOptional);
            this._addParam(fieldName, schema);
        }

        // Store Model reference for .proxy() alias resolution
        this._modelRef = model;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this as unknown as FluentToolBuilder<TContext, TInput & Record<string, any>, TCtx>;
    }

    // ── Middleware ────────────────────────────────────────

    /**
     * Add context-derivation middleware (tRPC-style).
     *
     * Accepts either:
     * - A `MiddlewareDefinition` from `f.middleware()` (recommended)
     * - An inline function `({ ctx, next }) => Promise<ToolResponse>`
     *
     * @param mw - Middleware definition or inline function
     * @returns A **new type** of `FluentToolBuilder` with `TCtx` enriched
     *
     * @example
     * ```typescript
     * // Option 1: f.middleware() (recommended)
     * const withAuth = f.middleware(async (ctx) => {
     *     if (ctx.role === 'GUEST') throw error('Unauthorized');
     *     return { verified: true };
     * });
     * f.mutation('users.delete')
     *     .use(withAuth)
     *     .handle(async (input, ctx) => { ... });
     *
     * // Option 2: inline
     * f.mutation('users.delete')
     *     .use(async ({ ctx, next }) => {
     *         const admin = await requireAdmin(ctx.headers);
     *         return next({ ...ctx, adminUser: admin });
     *     })
     *     .handle(async (input, ctx) => { ... });
     * ```
     */
    use<TDerived extends Record<string, unknown>>(
        mw: MiddlewareDefinition<TCtx, TDerived>,
    ): FluentToolBuilder<TContext, TInput, TCtx & TDerived>;
    use<TDerived extends Record<string, unknown>>(
        mw: (args: { ctx: TCtx; next: (enrichedCtx: TCtx & TDerived) => Promise<ToolResponse> }) => Promise<ToolResponse>,
    ): FluentToolBuilder<TContext, TInput, TCtx & TDerived>;
    use<TDerived extends Record<string, unknown>>(
        mw:
            | MiddlewareDefinition<TCtx, TDerived>
            | ((args: { ctx: TCtx; next: (enrichedCtx: TCtx & TDerived) => Promise<ToolResponse> }) => Promise<ToolResponse>),
    ): FluentToolBuilder<TContext, TInput, TCtx & TDerived> {
        // Handle MiddlewareDefinition from f.middleware()
        if (typeof mw !== 'function' && '__brand' in mw && (mw as { __brand: unknown }).__brand === 'MiddlewareDefinition') {
            const def = mw as MiddlewareDefinition<TCtx, TDerived>;
            this._middlewares.push(def.toMiddlewareFn() as unknown as MiddlewareFn<TContext>);
            return this as unknown as FluentToolBuilder<TContext, TInput, TCtx & TDerived>;
        }

        // Handle inline function
        const inlineMw = mw as (args: { ctx: TCtx; next: (enrichedCtx: TCtx & TDerived) => Promise<ToolResponse> }) => Promise<ToolResponse>;
        // Convert the fluent middleware signature to the standard MiddlewareFn
        const standardMw: MiddlewareFn<TContext> = async (ctx, args, next) => {
            const wrappedNext = async (enrichedCtx: unknown): Promise<ToolResponse> => {
                // sanitize enriched context before merging
                // to prevent prototype pollution via __proto__/constructor/prototype keys.
                const safe = enrichedCtx as Record<string, unknown>;
                const target = ctx as Record<string, unknown>;
                for (const key of Object.keys(safe)) {
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
                    target[key] = safe[key];
                }
                return next() as Promise<ToolResponse>;
            };
            return inlineMw({ ctx: ctx as unknown as TCtx, next: wrappedNext as never }) as Promise<ToolResponse>;
        };
        this._middlewares.push(standardMw);
        return this as unknown as FluentToolBuilder<TContext, TInput, TCtx & TDerived>;
    }

    /**
     * Set the MVA Presenter for automatic response formatting.
     *
     * When a Presenter is attached, the handler can return raw data
     * and the framework pipes it through schema validation, system rules,
     * and UI block generation.
     *
     * @param presenter - A Presenter instance
     * @returns `this` for chaining
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- covariant: accept any Presenter subtype
    returns(presenter: Presenter<any>): FluentToolBuilder<TContext, TInput, TCtx> {
        this._returns = presenter;
        return this;
    }

    /**
     * Add capability tags for selective tool exposure.
     *
     * Tags are accumulated — calling `.tags()` multiple times
     * (or inheriting from a router) appends rather than replaces.
     *
     * @param tags - Tag strings for filtering
     * @returns `this` for chaining
     */
    tags(...tags: string[]): FluentToolBuilder<TContext, TInput, TCtx> {
        this._tags.push(...tags);
        return this;
    }

    // ── Semantic Overrides ───────────────────────────────

    /** Override: mark this tool as read-only (no side effects) */
    readOnly(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._readOnly = true;
        return this;
    }

    /** Override: mark this tool as destructive (irreversible) */
    destructive(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._destructive = true;
        return this;
    }

    /** Override: mark this tool as idempotent (safe to retry) */
    idempotent(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._idempotent = true;
        return this;
    }

    /**
     * Enable TOON-formatted descriptions for token optimization.
     *
     * @returns `this` for chaining
     */
    toonDescription(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._toonMode = true;
        return this;
    }

    /**
     * Set MCP tool annotations.
     *
     * @param a - Annotation key-value pairs
     * @returns `this` for chaining
     */
    annotations(a: Record<string, unknown>): FluentToolBuilder<TContext, TInput, TCtx> {
        this._annotations = { ...this._annotations, ...a };
        return this;
    }

    // ── State Sync (Fluent) ──────────────────────────────

    /**
     * Declare glob patterns invalidated when this tool succeeds.
     *
     * @param patterns - Glob patterns (e.g. `'sprints.*'`, `'tasks.*'`)
     * @returns `this` for chaining
     */
    invalidates(...patterns: string[]): FluentToolBuilder<TContext, TInput, TCtx> {
        this._invalidatesPatterns.push(...patterns);
        return this;
    }

    /**
     * Mark this tool's data as immutable (safe to cache forever).
     *
     * @returns `this` for chaining
     */
    cached(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._cacheControl = 'immutable';
        return this;
    }

    /**
     * Mark this tool's data as volatile (never cache).
     *
     * @returns `this` for chaining
     */
    stale(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._cacheControl = 'no-store';
        return this;
    }

    // ── Runtime Guards (Fluent) ──────────────────────────

    /**
     * Set concurrency limits for this tool (Semaphore + Queue pattern).
     *
     * @param config - Concurrency configuration
     * @returns `this` for chaining
     */
    concurrency(config: ConcurrencyConfig): FluentToolBuilder<TContext, TInput, TCtx> {
        this._concurrency = config;
        return this;
    }

    /**
     * Set maximum payload size for tool responses (Egress Guard).
     *
     * @param bytes - Maximum payload size in bytes
     * @returns `this` for chaining
     */
    egress(bytes: number): FluentToolBuilder<TContext, TInput, TCtx> {
        this._egressMaxBytes = bytes;
        return this;
    }

    // ── Sandbox (Zero-Trust Compute) ─────────────────

    /**
     * Enable zero-trust sandboxed execution for this tool.
     *
     * When enabled:
     * 1. A `SandboxEngine` is lazily created on the `GroupedToolBuilder`
     * 2. A system instruction is auto-injected into the tool description
     *    (HATEOAS auto-prompting) so the LLM knows to send JS functions
     * 3. The handler can use `SandboxEngine.execute()` to run LLM code
     *    in a sealed V8 isolate (no process, require, fs, network)
     *
     * @param config - Optional sandbox configuration (timeout, memory, output size)
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * f.query('data.compute')
     *     .describe('Run safe computation on server data')
     *     .sandboxed({ timeout: 3000, memoryLimit: 64 })
     *     .withString('expression', 'JS arrow function: (data) => result')
     *     .handle(async (input, ctx) => {
     *         const data = await ctx.db.records.findMany();
     *         const engine = new SandboxEngine({ timeout: 3000 });
     *         const result = await engine.execute(input.expression, data);
     *         return result.ok ? result.value : { error: result.error };
     *     });
     * ```
     */
    sandboxed(config?: SandboxConfig): FluentToolBuilder<TContext, TInput, TCtx> {
        this._sandboxConfig = config ?? {};
        return this;
    }

    // ── Elicitation (Human-in-the-Loop) ──────────────────

    /**
     * Enable human-in-the-loop interaction for this tool.
     *
     * When enabled, the handler can use the return-based `requireInput()`
     * function to request user input via a client-rendered form, or
     * `requireInput.url()` to send the user to an external URL. Answers
     * are read on re-entry with `readInput()` / `inputResponse()`.
     *
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * import { ask, requireInput, readInput } from '@mcpfusion/core';
     *
     * const deploy = f.mutation('infra.deploy')
     *     .withString('app_id', 'Application ID')
     *     .interactive()
     *     .handle(async (input) => {
     *         const answers = readInput<{ region: string }>('deploy');
     *         if (!answers) {
     *             return requireInput({
     *                 inputRequests: {
     *                     deploy: requireInput.elicit('Confirm deployment:', {
     *                         region: ask.enum(['us-east-1', 'eu-west-1'] as const, 'Region'),
     *                     }),
     *                 },
     *             });
     *         }
     *         return { region: answers.region };
     *     });
     * ```
     */
    interactive(): FluentToolBuilder<TContext, TInput, TCtx> {
        this._interactive = true;
        return this;
    }

    // ── FSM State Gate (Temporal Anti-Hallucination) ─────

    /**
     * Bind this tool to specific FSM states.
     *
     * When a `StateMachineGate` is configured on the server, this tool
     * will only appear in `tools/list` when the FSM is in one of the
     * specified states. The LLM physically cannot call tools that
     * don't exist in its reality.
     *
     * @param states - FSM state(s) where this tool is visible
     * @param transition - Event to send to the FSM on successful execution
     * @returns `this` for chaining
     *
     * @example
     * ```typescript
     * // Visible only in 'has_items' state, sends CHECKOUT on success
     * const checkout = f.mutation('cart.checkout')
     *     .bindState('has_items', 'CHECKOUT')
     *     .handle(async (input, ctx) => { ... });
     *
     * // Visible in multiple states
     * const addItem = f.mutation('cart.add_item')
     *     .bindState(['empty', 'has_items'], 'ADD_ITEM')
     *     .handle(async (input, ctx) => { ... });
     * ```
     */
    bindState(
        states: string | string[],
        transition?: string,
    ): FluentToolBuilder<TContext, TInput, TCtx> {
        this._fsmStates = Array.isArray(states) ? states : [states];
        if (transition !== undefined) this._fsmTransition = transition;
        return this;
    }

    // ── Terminal: handle() ───────────────────────────────

    /**
     * Set the handler and build the tool — the terminal step.
     *
     * The handler receives `(input, ctx)` with fully typed `TInput` and `TCtx`.
     * **Implicit `success()` wrapping**: if the handler returns raw data
     * (not a `ToolResponse`), the framework wraps it with `success()`.
     *
     * @param handler - Async function receiving typed `(input, ctx)`
     * @returns A `GroupedToolBuilder` ready for registration
     *
     * @example
     * ```typescript
     * const getProject = f.query('projects.get')
     *     .describe('Get a project by ID')
     *     .withString('project_id', 'The exact project ID')
     *     .handle(async (input, ctx) => {
     *         return await ctx.db.projects.findUnique({ where: { id: input.project_id } });
     *     });
     * ```
     */
    handle(
        handler: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            input: [TInput] extends [Record<string, never>] ? Record<string, any> : TInput,
            ctx: TCtx,
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
        return this._build(handler);
    }

    // ── Terminal: proxy() ────────────────────────────────

    /**
     * Auto-generate a handler that proxies to `ctx.client` HTTP methods.
     *
     * Eliminates boilerplate by deriving the HTTP method from the semantic
     * verb (`query` → GET, `mutation` → POST) and passing model input
     * directly as query params or request body.
     *
     * For tools with non-trivial logic (data transformation, multi-step
     * calls, conditional behavior), use `.handle()` instead.
     *
     * @param endpoint - API path (e.g. `'companies/standup/summary'`)
     * @param options - Optional overrides
     * @param options.method - Force HTTP method (`'GET'`, `'POST'`, `'PUT'`, `'DELETE'`)
     * @param options.unwrap - Auto-unwrap `response.data` (default: `true`)
     * @returns A `GroupedToolBuilder` ready for registration
     *
     * @example
     * ```typescript
     * const pulse = analytics.query('pulse')
     *     .fromModel(AnalyticsModel, 'query')
     *     .proxy('companies/manager-dashboard/pulse');
     *
     * const create = note.mutation('create')
     *     .fromModel(NoteModel, 'create')
     *     .proxy('notes');
     *
     * const update = note.mutation('update')
     *     .fromModel(NoteModel, 'update')
     *     .proxy('notes/:uuid', { method: 'PUT' });
     * ```
     */
    proxy(
        endpoint: string,
        options?: {
            method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
            unwrap?: boolean;
        },
    ): GroupedToolBuilder<TContext> {
        const httpMethod = options?.method
            ?? (this._semanticDefaults.readOnly ? 'GET' : 'POST');
        const shouldUnwrap = options?.unwrap ?? true;

        const handler = createProxyHandler(endpoint, httpMethod, shouldUnwrap, this._modelRef);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this._build(handler as any);
    }

    /**
     * Alias for `.handle()` — for backward compatibility.
     * @internal
     */
    resolve(
        handler: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: { input: [TInput] extends [Record<string, never>] ? Record<string, any> : TInput; ctx: TCtx },
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
        // Adapt { input, ctx } signature to (input, ctx)
        return this._build((input, ctx) => handler({ input, ctx } as never));
    }

    // ── Internal Build ───────────────────────────────────

    /** @internal */
    private _build(
        handler: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            input: [TInput] extends [Record<string, never>] ? Record<string, any> : TInput,
            ctx: TCtx,
        ) => Promise<ToolResponse | unknown>,
    ): GroupedToolBuilder<TContext> {
        // guard against double-invocation of handle()/resolve()
        if (this._handlerSet) {
            throw new Error(
                `handle() already called on tool "${this._name}". ` +
                `Each FluentToolBuilder can only have one handler.`,
            );
        }
        this._handlerSet = true;

        return buildToolFromFluent({
            name: this._name,
            description: this._description,
            compactDescription: this._compactDescription,
            instructions: this._instructions,
            withParams: this._withParams,
            tags: this._tags,
            middlewares: this._middlewares,
            returns: this._returns,
            semanticDefaults: this._semanticDefaults,
            readOnly: this._readOnly,
            destructive: this._destructive,
            idempotent: this._idempotent,
            toonMode: this._toonMode,
            annotations: this._annotations,
            invalidatesPatterns: this._invalidatesPatterns,
            cacheControl: this._cacheControl,
            concurrency: this._concurrency,
            egressMaxBytes: this._egressMaxBytes,
            sandboxConfig: this._sandboxConfig,
            fsmStates: this._fsmStates,
            fsmTransition: this._fsmTransition,
            interactive: this._interactive,
            headerParams: this._headerParams,
            outputSchema: this._outputSchema,
            title: this._title,
            icons: this._icons,
            handler: handler as (input: Record<string, unknown>, ctx: TCtx) => Promise<ToolResponse | unknown>,
        });
    }
}
