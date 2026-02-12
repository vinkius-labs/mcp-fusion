/**
 * Shared internal types for strategy modules.
 *
 * Extracted from GroupedToolBuilder so that strategy functions
 * can operate on action data without depending on the builder class.
 */
import type { ZodObject, ZodRawShape } from 'zod';
import type { ToolResponse } from '../ResponseHelper.js';

/** Internal representation of a registered action */
export interface InternalAction<TContext> {
    /** Full key: "name" (flat) or "group.name" (grouped) */
    key: string;
    /** Group name (undefined for flat actions) */
    groupName?: string;
    /** Group description */
    groupDescription?: string;
    /** Action name within the group */
    actionName: string;
    /** Description */
    description?: string;
    /** Zod schema */
    schema?: ZodObject<ZodRawShape>;
    /** Annotations */
    destructive?: boolean;
    idempotent?: boolean;
    readOnly?: boolean;
    /** Per-action/group middleware (applied after global middleware) */
    middlewares?: MiddlewareFn<TContext>[];
    /** Handler */
    handler: (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;
}

/** Middleware function signature (Express/Koa pattern) */
export type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<ToolResponse>
) => Promise<ToolResponse>;
