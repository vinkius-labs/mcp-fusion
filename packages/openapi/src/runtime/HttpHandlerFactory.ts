/**
 * HttpHandlerFactory — Runtime Fetch Proxy Builder
 *
 * Builds handler functions that proxy MCP tool calls to REST API endpoints.
 * Used by the runtime mode (`loadOpenAPI`).
 *
 * @module
 */
import type { ApiAction, ApiParam } from '../parser/types.js';

// ── Types ────────────────────────────────────────────────

/** Runtime context for HTTP proxy handlers */
export interface HttpContext {
    readonly baseUrl: string;
    readonly headers?: Record<string, string>;
    readonly fetchFn?: typeof fetch;
}

/** A tool handler function */
export type HandlerFn = (ctx: HttpContext, args: Record<string, unknown>) => Promise<unknown>;

// ── Factory ──────────────────────────────────────────────

/**
 * Build a handler function for a single API action.
 *
 * The handler:
 * 1. Interpolates path params into the URL
 * 2. Appends query params
 * 3. Sends JSON body for POST/PUT/PATCH
 * 4. Returns the JSON response
 *
 * @param action - The API action to build a handler for
 * @returns A handler function
 */
export function buildHandler(action: ApiAction): HandlerFn {
    const method = action.method.toUpperCase();

    return async (ctx: HttpContext, args: Record<string, unknown>): Promise<unknown> => {
        const fetchFn = ctx.fetchFn ?? globalThis.fetch;

        // Build URL with path param interpolation
        let url = `${ctx.baseUrl}${interpolatePath(action.path, args)}`;

        // Append query params
        const queryParams = action.params.filter(p => p.source === 'query');
        if (queryParams.length > 0) {
            const searchParams = new URLSearchParams();
            for (const qp of queryParams) {
                const value = args[qp.name];
                if (value !== undefined) {
                    searchParams.set(qp.name, String(value));
                }
            }
            const qs = searchParams.toString();
            if (qs.length > 0) {
                url += `?${qs}`;
            }
        }

        // Build request options
        const options: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...ctx.headers,
            },
        };

        // Attach body for methods that accept it
        if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
            const bodyArgs = extractBodyArgs(action, args);
            if (Object.keys(bodyArgs).length > 0) {
                options.body = JSON.stringify(bodyArgs);
            }
        }

        const response = await fetchFn(url, options);

        if (!response.ok) {
            throw new Error(`API ${response.status}: ${response.statusText}`);
        }

        // Parse response
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    };
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Replace `{param}` placeholders in a path with actual values.
 */
function interpolatePath(path: string, args: Record<string, unknown>): string {
    return path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
        const value = args[name];
        return value !== undefined ? encodeURIComponent(String(value)) : `{${name}}`;
    });
}

/**
 * Extract only the body-relevant args (exclude path/query params).
 */
function extractBodyArgs(action: ApiAction, args: Record<string, unknown>): Record<string, unknown> {
    const nonBodyKeys = new Set<string>();
    for (const p of action.params) {
        if (p.source !== 'body') {
            nonBodyKeys.add(p.name);
        }
    }

    const bodyArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
        if (!nonBodyKeys.has(key) && key !== 'action') {
            bodyArgs[key] = value;
        }
    }
    return bodyArgs;
}
