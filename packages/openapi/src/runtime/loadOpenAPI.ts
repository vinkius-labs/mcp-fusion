/**
 * loadOpenAPI — Runtime Mode Entry Point
 *
 * Parses an OpenAPI spec and creates live `GroupedToolBuilder` instances
 * that can be registered directly into a `ToolRegistry`. Each action
 * handler proxies HTTP calls to the real API at runtime.
 *
 * @example
 * ```typescript
 * import { loadOpenAPI } from '@vinkius-core/openapi-gen';
 * import { ToolRegistry } from '@vinkius-core/mcp-fusion';
 *
 * const tools = loadOpenAPI(specYaml, { baseUrl: 'https://api.example.com' });
 * const registry = new ToolRegistry();
 * registry.registerAll(...tools);
 * ```
 *
 * @module
 */
import { parseOpenAPI } from '../parser/OpenApiParser.js';
import { mapEndpoints } from '../mapper/EndpointMapper.js';
import { buildHandler, type HttpContext } from './HttpHandlerFactory.js';

// ── Types ────────────────────────────────────────────────

/** Configuration for runtime mode */
export interface LoadConfig {
    /** Base URL for API calls */
    readonly baseUrl: string;
    /** Default headers sent with every request */
    readonly headers?: Record<string, string>;
    /** Custom fetch function (default: globalThis.fetch) */
    readonly fetchFn?: typeof fetch;
}

/** A runtime tool definition ready for registration */
export interface RuntimeTool {
    readonly name: string;
    readonly description: string;
    readonly actions: RuntimeAction[];
}

/** A single action in a runtime tool */
export interface RuntimeAction {
    readonly name: string;
    readonly description: string;
    readonly method: string;
    readonly path: string;
    readonly handler: (ctx: HttpContext, args: Record<string, unknown>) => Promise<unknown>;
}

// ── Public API ───────────────────────────────────────────

/**
 * Parse an OpenAPI spec and build runtime tool definitions.
 *
 * Returns an array of `RuntimeTool` objects. Each tool corresponds
 * to one OpenAPI tag. Each action has a pre-wired handler that
 * proxies to the REST API.
 *
 * @param input - YAML/JSON string or pre-parsed OpenAPI object
 * @param config - Runtime configuration (baseUrl, headers, fetchFn)
 * @returns Array of runtime tool definitions
 */
export function loadOpenAPI(input: string | object, config: LoadConfig): RuntimeTool[] {
    const spec = parseOpenAPI(input);
    const mapped = mapEndpoints(spec);

    return mapped.groups.map(group => ({
        name: group.tag,
        description: group.description ?? `${group.tag} operations`,
        actions: group.actions.map(action => ({
            name: action.name,
            description: action.summary ?? action.description ?? `${action.method} ${action.path}`,
            method: action.method,
            path: action.path,
            handler: buildHandler(action),
        })),
    }));
}
