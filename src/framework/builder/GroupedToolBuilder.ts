/**
 * GroupedToolBuilder — Fluent API for MCP Tool Construction
 *
 * Thin orchestrator that delegates each responsibility to a dedicated module:
 * - ActionGroupBuilder — Sub-builder for hierarchical groups
 * - ToolDefinitionCompiler — Build-time compilation strategy
 * - ExecutionPipeline — Runtime execution pipeline (Result monad)
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { error } from '../response.js';
import {
    type ToolResponse,
    type ToolBuilder,
    type ActionMetadata,
    type InternalAction,
    type MiddlewareFn,
    type ActionConfig,
} from '../types.js';
import { getActionRequiredFields } from '../schema/SchemaUtils.js';
import {
    parseDiscriminator, resolveAction, validateArgs, runChain,
    type ExecutionContext,
} from '../execution/ExecutionPipeline.js';
import { compileToolDefinition } from './ToolDefinitionCompiler.js';
import {
    ActionGroupBuilder,
    type GroupConfigurator,
} from './ActionGroupBuilder.js';

// ── Re-exports for Public API Compatibility ──────────────

export { ActionGroupBuilder } from './ActionGroupBuilder.js';
export type { GroupConfigurator } from './ActionGroupBuilder.js';

// ============================================================================
// GroupedToolBuilder
// ============================================================================

export class GroupedToolBuilder<TContext = void, TCommon extends Record<string, unknown> = Record<string, never>> implements ToolBuilder<TContext> {
    private readonly _name: string;
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
    private _executionContext?: ExecutionContext<TContext>;

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
            groupName: undefined,
            groupDescription: undefined,
            actionName: config.name,
            description: config.description ?? undefined,
            schema: config.schema ?? undefined,
            destructive: config.destructive ?? undefined,
            idempotent: config.idempotent ?? undefined,
            readOnly: config.readOnly ?? undefined,
            handler: config.handler,
            middlewares: undefined,
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
            : maybeConfigure;

        if (!configure) {
            throw new Error(`Group "${name}" requires a configure callback.`);
        }

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

    // ── Build (delegates to ToolDefinitionCompiler) ─────

    /** Generate the MCP Tool definition. Caches result and freezes the builder. */
    buildToolDefinition(): McpTool {
        if (this._cachedTool) return this._cachedTool;

        const result = compileToolDefinition({
            name: this._name,
            description: this._description,
            discriminator: this._discriminator,
            toonMode: this._toonMode,
            hasGroup: this._hasGroup,
            actions: this._actions,
            middlewares: this._middlewares,
            commonSchema: this._commonSchema,
            annotations: this._annotations,
        });

        this._cachedTool = result.tool;
        this._executionContext = result.executionContext;
        this._frozen = true;
        Object.freeze(this._actions);

        return result.tool;
    }

    // ── Execute (delegates to ExecutionPipeline) ────────

    /** Route a call: validate → middleware → handler */
    async execute(ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse> {
        if (!this._executionContext) {
            this.buildToolDefinition();
        }
        const execCtx = this._executionContext;
        if (!execCtx) {
            return error(`Builder "${this._name}" failed to initialize.`);
        }

        const disc = parseDiscriminator(execCtx, args);
        if (!disc.ok) return disc.response;

        const resolved = resolveAction(execCtx, disc.value);
        if (!resolved.ok) return resolved.response;

        const validated = validateArgs(execCtx, resolved.value, args);
        if (!validated.ok) return validated.response;

        return runChain(execCtx, resolved.value, ctx, validated.value);
    }

    // ── Introspection ───────────────────────────────────

    getName(): string { return this._name; }
    getTags(): string[] { return [...this._tags]; }
    getActionNames(): string[] { return this._actions.map(a => a.key); }

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

    // ── Private ─────────────────────────────────────────

    private _assertNotFrozen(): void {
        if (this._frozen) {
            throw new Error(
                `Builder "${this._name}" is frozen after buildToolDefinition(). ` +
                `Cannot modify a built tool.`
            );
        }
    }
}
