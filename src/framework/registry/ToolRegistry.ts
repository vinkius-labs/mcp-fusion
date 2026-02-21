/**
 * ToolRegistry — Centralized Tool Registration & Routing
 *
 * Thin orchestrator that delegates:
 * - ToolFilterEngine — Tag-based filtering
 * - ServerAttachment — MCP Server handler registration
 */
import { type Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { type ToolResponse, error } from '../response.js';
import { type ToolBuilder } from '../types.js';
import { filterTools, type ToolFilter } from './ToolFilterEngine.js';
import {
    attachToServer as attachToServerStrategy,
    type AttachOptions, type DetachFn,
} from '../server/ServerAttachment.js';

// ── Re-exports ───────────────────────────────────────────

export type { ToolFilter } from './ToolFilterEngine.js';
export type { AttachOptions, DetachFn } from '../server/ServerAttachment.js';

// ============================================================================
// ToolRegistry
// ============================================================================

export class ToolRegistry<TContext = void> {
    private readonly _builders = new Map<string, ToolBuilder<TContext>>();

    register(builder: ToolBuilder<TContext>): void {
        const name = builder.getName();
        if (this._builders.has(name)) {
            throw new Error(`Tool "${name}" is already registered.`);
        }
        builder.buildToolDefinition();
        this._builders.set(name, builder);
    }

    registerAll(...builders: ToolBuilder<TContext>[]): void {
        for (const builder of builders) {
            this.register(builder);
        }
    }

    getAllTools(): McpTool[] {
        const tools: McpTool[] = [];
        for (const builder of this._builders.values()) {
            tools.push(builder.buildToolDefinition());
        }
        return tools;
    }

    getTools(filter: ToolFilter): McpTool[] {
        return filterTools(this._builders.values(), filter);
    }

    async routeCall(
        ctx: TContext,
        name: string,
        args: Record<string, unknown>,
    ): Promise<ToolResponse> {
        const builder = this._builders.get(name);
        if (!builder) {
            const available = Array.from(this._builders.keys()).join(', ');
            return error(`Unknown tool: "${name}". Available tools: ${available}`);
        }
        return builder.execute(ctx, args);
    }

    attachToServer(
        server: unknown,
        options: AttachOptions<TContext> = {},
    ): DetachFn {
        return attachToServerStrategy(server, this, options);
    }

    has(name: string): boolean { return this._builders.has(name); }
    clear(): void { this._builders.clear(); }
    get size(): number { return this._builders.size; }
}
