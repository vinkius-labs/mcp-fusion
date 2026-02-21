/**
 * ToolBuilder — Interface for MCP Tool Builders
 *
 * Abstraction that allows ToolRegistry to accept any builder implementation,
 * not just GroupedToolBuilder. This follows the Dependency Inversion Principle.
 *
 * @template TContext - The context type passed to handlers on each call.
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse } from './ResponseHelper.js';

/** Metadata for a single action (used for enterprise observability / introspection) */
export interface ActionMetadata {
    /** Full action key (e.g. "admin.create" for grouped, "list" for flat) */
    readonly key: string;
    /** Action name within its group */
    readonly actionName: string;
    /** Group name (undefined for flat actions) */
    readonly groupName?: string;
    /** Human-readable description */
    readonly description?: string;
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
