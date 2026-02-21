/**
 * Shared internal types for strategy modules.
 *
 * Extracted from GroupedToolBuilder so that strategy functions
 * can operate on action data without depending on the builder class.
 */
import { type ZodObject, type ZodRawShape } from 'zod';
import { type ToolResponse } from '../ResponseHelper.js';

/** Internal representation of a registered action */
export interface InternalAction<TContext> {
    /** Full key: "name" (flat) or "group.name" (grouped) */
    readonly key: string;
    /** Group name (undefined for flat actions) */
    readonly groupName?: string;
    /** Group description */
    readonly groupDescription?: string;
    /** Action name within the group */
    readonly actionName: string;
    /** Description */
    readonly description?: string;
    /** Zod schema */
    readonly schema?: ZodObject<ZodRawShape>;
    /** Annotations */
    readonly destructive?: boolean;
    readonly idempotent?: boolean;
    readonly readOnly?: boolean;
    /** Per-action/group middleware (applied after global middleware) */
    readonly middlewares?: readonly MiddlewareFn<TContext>[];
    /** Handler */
    readonly handler: (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;
}

/** Middleware function signature (Express/Koa pattern) */
export type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<ToolResponse>
) => Promise<ToolResponse>;
