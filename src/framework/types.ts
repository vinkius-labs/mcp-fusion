/**
 * Framework Contracts & Shared Types
 *
 * Single-file type definitions following the consolidated contracts pattern.
 * All interfaces, type aliases, and shared contracts live here.
 *
 * This module has ZERO runtime code — only type declarations.
 * It may be imported by any module without circular dependency risk.
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape } from 'zod';

// ── Re-export from canonical source ──────────────────────

export type { ToolResponse } from './response.js';
import { type ToolResponse } from './response.js';

// ── Builder Contract (DIP) ───────────────────────────────

/** Interface for MCP tool builders */
export interface ToolBuilder<TContext = void> {
    /** Get the tool name (used as the registration key) */
    getName(): string;

    /** Get the capability tags for selective exposure */
    getTags(): string[];

    /** Get all registered action keys */
    getActionNames(): string[];

    /** Get metadata for all registered actions (for enterprise observability) */
    getActionMetadata(): ActionMetadata[];

    /** Build and return the MCP Tool definition. May cache internally. */
    buildToolDefinition(): McpTool;

    /** Execute a tool call with the given context and arguments */
    execute(ctx: TContext, args: Record<string, unknown>): Promise<ToolResponse>;
}

// ── Action Metadata (Observability) ──────────────────────

/** Metadata for a single action (used for enterprise observability / introspection) */
export interface ActionMetadata {
    /** Full action key (e.g. "admin.create" for grouped, "list" for flat) */
    readonly key: string;
    /** Action name within its group */
    readonly actionName: string;
    /** Group name (undefined for flat actions) */
    readonly groupName: string | undefined;
    /** Human-readable description */
    readonly description: string | undefined;
    /** Whether this action is destructive */
    readonly destructive: boolean;
    /** Whether this action is idempotent */
    readonly idempotent: boolean;
    /** Whether this action is read-only */
    readonly readOnly: boolean;
    /** Required field names from the Zod schema */
    readonly requiredFields: readonly string[];
    /** Whether this action has group/action-level middleware */
    readonly hasMiddleware: boolean;
}

// ── Internal Action (Strategy Input) ─────────────────────

/** Internal representation of a registered action */
export interface InternalAction<TContext> {
    /** Full key: "name" (flat) or "group.name" (grouped) */
    readonly key: string;
    /** Group name (undefined for flat actions) */
    readonly groupName: string | undefined;
    /** Group description */
    readonly groupDescription: string | undefined;
    /** Action name within the group */
    readonly actionName: string;
    /** Description */
    readonly description: string | undefined;
    /** Zod schema */
    readonly schema: ZodObject<ZodRawShape> | undefined;
    /** Whether this action is destructive */
    readonly destructive: boolean | undefined;
    /** Whether this action is idempotent */
    readonly idempotent: boolean | undefined;
    /** Whether this action is read-only */
    readonly readOnly: boolean | undefined;
    /** Per-action/group middleware (applied after global middleware) */
    readonly middlewares: readonly MiddlewareFn<TContext>[] | undefined;
    /** Handler */
    readonly handler: (ctx: TContext, args: Record<string, unknown>) => Promise<ToolResponse>;
}

// ── Middleware ────────────────────────────────────────────

/** Middleware function signature (Express/Koa pattern) */
export type MiddlewareFn<TContext> = (
    ctx: TContext,
    args: Record<string, unknown>,
    next: () => Promise<ToolResponse>
) => Promise<ToolResponse>;

// ── Action Configuration ─────────────────────────────────

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
