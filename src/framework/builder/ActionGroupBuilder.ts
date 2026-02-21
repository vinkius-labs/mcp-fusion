/**
 * ActionGroupBuilder — Sub-builder for Hierarchical Action Groups
 *
 * Used within `.group()` callbacks to register actions under a named group.
 * Supports group-scoped middleware and generates compound keys (e.g., "group.action").
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import {
    type ToolResponse,
    type InternalAction,
    type MiddlewareFn,
    type ActionConfig,
} from '../types.js';

/** Callback for configuring actions within a group */
export type GroupConfigurator<TContext, TCommon extends Record<string, unknown>> =
    (group: ActionGroupBuilder<TContext, TCommon>) => void;

// ── ActionGroupBuilder ───────────────────────────────────

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
            description: config.description ?? undefined,
            schema: config.schema ?? undefined,
            destructive: config.destructive ?? undefined,
            idempotent: config.idempotent ?? undefined,
            readOnly: config.readOnly ?? undefined,
            handler: config.handler,
            middlewares: this._groupMiddlewares.length > 0
                ? [...this._groupMiddlewares] : undefined,
        });
        return this;
    }
}
