/**
 * GroupedToolBuilder — Core of the MCP Tool Consolidation Framework
 * 
 * Builds a single MCP tool from multiple actions with:
 * - Auto-generated 3-layer LLM-friendly descriptions
 * - Zod validation with type safety and parameter stripping
 * - Hierarchical grouping for 5,000+ endpoints
 * - Pre-compiled middleware chain
 * - Per-action annotation aggregation
 *
 * Internal strategies are delegated to pure-function modules:
 * - DescriptionGenerator — LLM description composition
 * - SchemaGenerator — JSON Schema from Zod
 * - AnnotationAggregator — Hint aggregation
 * - MiddlewareCompiler — Chain pre-compilation
 */
import { z, type ZodObject, type ZodRawShape } from 'zod';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, error } from './ResponseHelper.js';
import type { ToolBuilder, ActionMetadata } from './ToolBuilder.js';
import { generateDescription } from './strategies/DescriptionGenerator.js';
import { generateToonDescription } from './strategies/ToonDescriptionGenerator.js';
import { generateInputSchema } from './strategies/SchemaGenerator.js';
import { aggregateAnnotations } from './strategies/AnnotationAggregator.js';
import { compileMiddlewareChains, type CompiledChain } from './strategies/MiddlewareCompiler.js';
import type { InternalAction, MiddlewareFn } from './strategies/Types.js';
import { getActionRequiredFields } from './strategies/SchemaUtils.js';

// ============================================================================
// Types (re-exported for public API compatibility)
// ============================================================================

/** Configuration for a single action within a grouped tool */
export interface ActionConfig<TContext> {
    /** Action name (must not contain dots in flat mode) */
    name: string;
    /** Human-readable description of what this action does */
    description?: string;
    /** Zod schema for this action's specific parameters */
    schema?: ZodObject<ZodRawShape>;
    /** Whether this action is destructive */
    destructive?: boolean;
    /** Whether this action is idempotent */
    idempotent?: boolean;
    /** Whether this action is read-only */
    readOnly?: boolean;
    /** Handler function */
    handler: (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;
}

/** Callback for configuring actions within a group */
export type GroupConfigurator<TContext, TCommon extends Record<string, unknown> = Record<string, never>> = (g: ActionGroupBuilder<TContext, TCommon>) => void;

// Re-export strategy types for consumers
export type { MiddlewareFn } from './strategies/Types.js';

// ============================================================================
// ActionGroupBuilder (used in .group() callback)
// ============================================================================

export class ActionGroupBuilder<TContext, TCommon extends Record<string, unknown> = Record<string, never>> {
    /** @internal */
    readonly _actions: InternalAction<TContext>[] = [];
    private readonly _groupName: string;
    private readonly _groupDescription: string;
    private readonly _groupMiddlewares: MiddlewareFn<TContext>[] = [];

    constructor(groupName: string, description?: string) {
        this._groupName = groupName;
        this._groupDescription = description || '';
    }

    /** Add middleware scoped to this group */
    use(mw: MiddlewareFn<TContext>): this {
        this._groupMiddlewares.push(mw);
        return this;
    }

    /** Register an action within this group (typed: schema + commonSchema inference) */
    action<TSchema extends ZodObject<ZodRawShape>>(config: {
        name: string;
        description?: string;
        schema: TSchema;
        destructive?: boolean;
        idempotent?: boolean;
        readOnly?: boolean;
        handler: (ctx: TContext, args: TSchema["_output"] & TCommon) => Promise<ToolResponse>;
    }): this;
    /** Register an action within this group (untyped: no schema) */
    action(config: ActionConfig<TContext>): this;
    action(config: ActionConfig<TContext>): this {
        if (config.name.includes('.')) {
            throw new Error(
                `Action name "${config.name}" must not contain dots. ` +
                `The framework uses dots internally for group.action compound keys.`
            );
        }
        this._actions.push({
            key: `${this._groupName}.${config.name}`,
            groupName: this._groupName,
            groupDescription: this._groupDescription,
            actionName: config.name,
            description: config.description,
            schema: config.schema,
            destructive: config.destructive,
            idempotent: config.idempotent,
            readOnly: config.readOnly,
            handler: config.handler,
            middlewares: this._groupMiddlewares.length > 0
                ? [...this._groupMiddlewares] : undefined,
        });
        return this;
    }
}

// ============================================================================
// GroupedToolBuilder
// ============================================================================

export class GroupedToolBuilder<TContext = void, TCommon extends Record<string, unknown> = Record<string, never>> implements ToolBuilder<TContext> {
    private _name: string;
    private _description?: string;
    private _discriminator: string = 'action';
    private _annotations?: Record<string, unknown>;
    private _tags: string[] = [];
    private _commonSchema?: ZodObject<ZodRawShape>;
    private _middlewares: MiddlewareFn<TContext>[] = [];
    private _actions: InternalAction<TContext>[] = [];
    private _hasFlat = false;
    private _hasGroup = false;
    private _toonMode = false;
    private _frozen = false;

    // Cached build result
    private _cachedTool?: McpTool;
    private _compiledChain?: CompiledChain<TContext>;

    constructor(name: string) {
        this._name = name;
    }

    // ── Configuration (fluent) ──────────────────────────

    /** Set the discriminator field name (default: "action") */
    discriminator(field: string): this {
        this._assertNotFrozen();
        this._discriminator = field;
        return this;
    }

    /** Set the tool description (first line) */
    description(desc: string): this {
        this._assertNotFrozen();
        this._description = desc;
        return this;
    }

    /** Set MCP tool annotations */
    annotations(a: Record<string, unknown>): this {
        this._assertNotFrozen();
        this._annotations = a;
        return this;
    }

    /** Set capability tags for selective exposure */
    tags(...tags: string[]): this {
        this._assertNotFrozen();
        this._tags = tags;
        return this;
    }

    /** Set common schema shared by all actions (propagates types to handlers) */
    commonSchema<TSchema extends ZodObject<ZodRawShape>>(
        schema: TSchema,
    ): GroupedToolBuilder<TContext, TSchema["_output"]> {
        this._assertNotFrozen();
        this._commonSchema = schema;
        return this as unknown as GroupedToolBuilder<TContext, TSchema["_output"]>;
    }

    /**
     * Enable TOON-formatted descriptions for token optimization.
     *
     * Uses TOON (Token-Oriented Object Notation) to encode action metadata
     * in a compact tabular format, reducing description token count by ~30-50%.
     *
     * @example
     * ```typescript
     * new GroupedToolBuilder('projects')
     *   .description('Manage projects')
     *   .toonDescription()
     *   .action({ name: 'list', ... })
     * ```
     */
    toonDescription(): this {
        this._assertNotFrozen();
        this._toonMode = true;
        return this;
    }

    /** Add middleware to the chain */
    use(mw: MiddlewareFn<TContext>): this {
        this._assertNotFrozen();
        this._middlewares.push(mw);
        return this;
    }

    // ── Action Registration ─────────────────────────────

    /** Register a flat action (typed: schema + commonSchema inference) */
    action<TSchema extends ZodObject<ZodRawShape>>(config: {
        name: string;
        description?: string;
        schema: TSchema;
        destructive?: boolean;
        idempotent?: boolean;
        readOnly?: boolean;
        handler: (ctx: TContext, args: TSchema["_output"] & TCommon) => Promise<ToolResponse>;
    }): this;
    /** Register a flat action (untyped: no schema) */
    action(config: ActionConfig<TContext>): this;
    action(config: ActionConfig<TContext>): this {
        this._assertNotFrozen();
        if (this._hasGroup) {
            throw new Error(
                `Cannot use .action() and .group() on the same builder "${this._name}". ` +
                `Use .action() for flat tools OR .group() for hierarchical tools.`
            );
        }
        this._hasFlat = true;
        if (config.name.includes('.')) {
            throw new Error(
                `Action name "${config.name}" must not contain dots. ` +
                `The framework uses dots internally for group.action compound keys.`
            );
        }
        this._actions.push({
            key: config.name,
            actionName: config.name,
            description: config.description,
            schema: config.schema,
            destructive: config.destructive,
            idempotent: config.idempotent,
            readOnly: config.readOnly,
            handler: config.handler,
        });
        return this;
    }

    /** Register a group of actions */
    group(name: string, configure: GroupConfigurator<TContext, TCommon>): this;
    group(name: string, description: string, configure: GroupConfigurator<TContext, TCommon>): this;
    group(
        name: string,
        descriptionOrConfigure: string | GroupConfigurator<TContext, TCommon>,
        maybeConfigure?: GroupConfigurator<TContext, TCommon>,
    ): this {
        this._assertNotFrozen();

        const description = typeof descriptionOrConfigure === 'string'
            ? descriptionOrConfigure
            : undefined;

        const configure = typeof descriptionOrConfigure === 'function'
            ? descriptionOrConfigure
            : maybeConfigure!;

        if (this._hasFlat) {
            throw new Error(
                `Cannot use .group() and .action() on the same builder "${this._name}". ` +
                `Use .action() for flat tools OR .group() for hierarchical tools.`
            );
        }
        if (name.includes('.')) {
            throw new Error(`Group name "${name}" must not contain dots.`);
        }
        this._hasGroup = true;
        const groupBuilder = new ActionGroupBuilder<TContext, TCommon>(name, description);
        configure(groupBuilder);
        this._actions.push(...groupBuilder._actions);
        return this;
    }

    // ── Build ───────────────────────────────────────────

    /** Generate the MCP Tool definition. Caches result and freezes the builder. */
    buildToolDefinition(): McpTool {
        if (this._cachedTool) return this._cachedTool;

        if (this._actions.length === 0) {
            throw new Error(`Builder "${this._name}" has no actions registered.`);
        }

        // Delegate to strategy functions
        const descriptionFn = this._toonMode ? generateToonDescription : generateDescription;
        const description = descriptionFn(
            this._actions, this._name, this._description, this._hasGroup,
        );
        const inputSchema = generateInputSchema(
            this._actions, this._discriminator, this._hasGroup, this._commonSchema,
        );
        const annotations = aggregateAnnotations(this._actions, this._annotations);

        const tool: McpTool = {
            name: this._name,
            description,
            inputSchema,
        };

        if (annotations && Object.keys(annotations).length > 0) {
            (tool as Record<string, unknown>).annotations = annotations;
        }

        // Pre-compile middleware chains via strategy
        this._compiledChain = compileMiddlewareChains(this._actions, this._middlewares);

        // Cache, freeze builder, and seal actions array
        this._cachedTool = tool;
        this._frozen = true;
        Object.freeze(this._actions);

        return tool;
    }

    // ── Execute ─────────────────────────────────────────

    /** Route a call: validate → middleware → handler */
    async execute(ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> {
        // Ensure built
        if (!this._compiledChain) {
            this.buildToolDefinition();
        }

        // 1. Parse discriminator
        const discriminatorValue = args[this._discriminator] as string | undefined;
        if (!discriminatorValue) {
            return error(
                `Error: ${this._discriminator} is required. ` +
                `Available: ${this._actions.map(a => a.key).join(', ')}`
            );
        }

        // 2. Find action
        const action = this._actions.find(a => a.key === discriminatorValue);
        if (!action) {
            return error(
                `Error: Unknown ${this._discriminator} "${discriminatorValue}". ` +
                `Available: ${this._actions.map(a => a.key).join(', ')}`
            );
        }

        // 3. Validate & strip args with Zod
        const validationSchema = this._buildValidationSchema(action);
        if (validationSchema) {
            // Remove discriminator before validation
            const { [this._discriminator]: _, ...argsWithoutDiscriminator } = args;
            const result = validationSchema.safeParse(argsWithoutDiscriminator);
            if (!result.success) {
                const issues = result.error.issues
                    .map(i => `${i.path.join('.')}: ${i.message}`)
                    .join('; ');
                return error(`Validation failed: ${issues}`);
            }
            // Use validated + stripped args
            args = { ...result.data, [this._discriminator]: discriminatorValue };
        }

        // 4. Run pre-compiled middleware chain → handler
        const chain = this._compiledChain!.get(action.key)!;
        try {
            return await chain(ctx, args);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return error(`[${this._name}/${discriminatorValue}] ${message}`);
        }
    }

    // ── Introspection ───────────────────────────────────

    /** Get the tool name */
    getName(): string {
        return this._name;
    }

    /** Get the tags */
    getTags(): string[] {
        return [...this._tags];
    }

    /** Get all action keys */
    getActionNames(): string[] {
        return this._actions.map(a => a.key);
    }

    /** Get metadata for all registered actions (for enterprise observability) */
    getActionMetadata(): ActionMetadata[] {
        return this._actions.map(a => ({
            key: a.key,
            actionName: a.actionName,
            groupName: a.groupName,
            description: a.description,
            destructive: a.destructive ?? false,
            idempotent: a.idempotent ?? false,
            readOnly: a.readOnly ?? false,
            requiredFields: getActionRequiredFields(a),
            hasMiddleware: (a.middlewares?.length ?? 0) > 0,
        }));
    }

    // ── Private: Validation Schema Building ─────────────

    private _buildValidationSchema(action: InternalAction<TContext>): ZodObject<ZodRawShape> | null {
        if (!this._commonSchema && !action.schema) return null;

        if (this._commonSchema && action.schema) {
            return this._commonSchema.merge(action.schema).strip();
        }
        if (this._commonSchema) {
            return this._commonSchema.strip();
        }
        if (action.schema) {
            return action.schema.strip();
        }

        // Unreachable: all combinations covered above
        /* istanbul ignore next */
        return null;
    }

    // ── Private: Guards ─────────────────────────────────

    private _assertNotFrozen(): void {
        if (this._frozen) {
            throw new Error(
                `Builder "${this._name}" is frozen after buildToolDefinition(). ` +
                `Cannot modify a built tool.`
            );
        }
    }
}
