/**
 * FusionClient — Type-Safe MCP Client (tRPC-style)
 *
 * Provides end-to-end type safety from server to client.
 * The server exports its router type, and the client consumes it
 * with full autocomplete and compile-time validation.
 *
 * @example
 * ```typescript
 * // ── SERVER (mcp-server.ts) ──
 * export const registry = new ToolRegistry<AppContext>();
 * registry.register(projects);
 * registry.register(billing);
 * export type AppRouter = InferRouter<typeof registry>;
 *
 * // ── CLIENT (agent.ts) ──
 * import { createFusionClient } from '@vinkius-core/mcp-fusion/client';
 * import type { AppRouter } from './mcp-server';
 *
 * const client = createFusionClient<AppRouter>(transport);
 * const result = await client.execute('projects.create', { name: 'Vinkius V2' });
 * //                                   ^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^
 * //                                   autocomplete!       typed args!
 * ```
 *
 * @module
 */
import { type ToolResponse } from '../core/response.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Transport interface for the fusion client.
 * This abstracts the MCP transport layer (stdio, HTTP, WebSocket, etc.)
 */
export interface FusionTransport {
    /** Call a tool by name with arguments */
    callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse>;
}

/**
 * Router type inferred from a ToolRegistry.
 *
 * Maps tool names to their action names and argument shapes.
 * This type is used at compile-time only — zero runtime cost.
 *
 * @example
 * ```typescript
 * type MyRouter = {
 *     'projects.list': { workspace_id: string; status?: string };
 *     'projects.create': { workspace_id: string; name: string };
 *     'billing.refund': { invoice_id: string; amount: number };
 * };
 * ```
 */
export type RouterMap = Record<string, Record<string, unknown>>;

/**
 * Type-safe client that provides autocomplete and compile-time
 * validation for MCP tool calls.
 *
 * @typeParam TRouter - The router map inferred from the server's registry
 */
export interface FusionClient<TRouter extends RouterMap> {
    /**
     * Execute a tool action with full type safety.
     *
     * @param action - Full action path (e.g. 'projects.create')
     * @param args - Typed arguments matching the action's schema
     * @returns The tool response
     */
    execute<TAction extends keyof TRouter & string>(
        action: TAction,
        args: TRouter[TAction],
    ): Promise<ToolResponse>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a type-safe MCP client.
 *
 * The client provides full autocomplete for action names and
 * compile-time validation for arguments based on the server's
 * router type.
 *
 * @typeParam TRouter - The router map (use `InferRouter<typeof registry>`)
 * @param transport - The MCP transport layer
 * @returns A typed {@link FusionClient}
 *
 * @example
 * ```typescript
 * import type { AppRouter } from './mcp-server';
 *
 * const client = createFusionClient<AppRouter>(transport);
 *
 * // Full autocomplete + type validation:
 * await client.execute('projects.create', { name: 'Vinkius V2' });
 *
 * // TS error: 'projects.nonexistent' is not a valid action
 * await client.execute('projects.nonexistent', {});
 *
 * // TS error: missing required arg 'name'
 * await client.execute('projects.create', {});
 * ```
 */
export function createFusionClient<TRouter extends RouterMap>(
    transport: FusionTransport,
): FusionClient<TRouter> {
    return {
        async execute<TAction extends keyof TRouter & string>(
            action: TAction,
            args: TRouter[TAction],
        ): Promise<ToolResponse> {
            // Parse "toolName.actionName" from the action path
            const dotIndex = action.indexOf('.');
            if (dotIndex === -1) {
                return transport.callTool(action, args);
            }

            const toolName = action.substring(0, dotIndex);
            const actionName = action.substring(dotIndex + 1);

            return transport.callTool(toolName, {
                action: actionName,
                ...args,
            });
        },
    };
}
