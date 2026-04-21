/**
 * BasicToolExecutor — Plain HTTP Tool Execution
 *
 * Executes YAML-defined tools via plain `fetch()` calls.
 * This is the **open-source** executor — no SSRF guard, no retry,
 * no circuit breaker. Good enough for local development.
 *
 * The Vinkius Engine replaces this with `EnterpriseToolExecutor`
 * that adds safeFetch, retry, circuit breaker, and DLP wrapping.
 *
 * @module
 */
import type { CompiledTool } from '../compiler/ToolCompiler.js';
import { applyResponseTransform } from '../compiler/ResponseTransformer.js';

/** Regex matching {{param}} placeholders in strings. */
const PARAM_PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Built-in variables available in execute blocks. */
const BUILT_INS: Record<string, () => string> = {
    '__NOW_ISO__': () => new Date().toISOString(),
    '__NOW_EPOCH__': () => String(Math.floor(Date.now() / 1000)),
    '__REQUEST_ID__': () => crypto.randomUUID(),
};

/**
 * Interpolate `{{param}}` placeholders in a string.
 *
 * @param template - String with `{{param}}` placeholders
 * @param args - Tool input arguments from the LLM
 * @returns Interpolated string
 */
export function interpolateParams(
    template: string,
    args: Readonly<Record<string, unknown>>,
): string {
    return template.replace(PARAM_PLACEHOLDER, (match, key: string) => {
        // Built-in variables first
        const builtIn = BUILT_INS[key];
        if (builtIn) return builtIn();
        // Then tool arguments
        const value = args[key];
        return value !== undefined ? String(value) : match;
    });
}

/**
 * Deep-interpolate `{{param}}` placeholders in any value.
 * Recursively walks objects and arrays.
 */
export function interpolateDeep(
    value: unknown,
    args: Readonly<Record<string, unknown>>,
): unknown {
    if (typeof value === 'string') {
        return interpolateParams(value, args);
    }
    if (Array.isArray(value)) {
        return value.map(item => interpolateDeep(item, args));
    }
    if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = interpolateDeep(v, args);
        }
        return result;
    }
    return value;
}

/**
 * MCP-compliant tool result content.
 */
export interface ToolCallResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

/**
 * Execute a compiled YAML tool with the given arguments.
 *
 * @param tool - Compiled tool definition
 * @param args - Input arguments from the LLM
 * @param fetchFn - Fetch function (defaults to global fetch)
 * @returns MCP-compliant tool result
 */
export async function executeYamlTool(
    tool: CompiledTool,
    args: Readonly<Record<string, unknown>>,
    fetchFn: typeof fetch = globalThis.fetch,
): Promise<ToolCallResult> {
    try {
        // ── 1. Interpolate path ──────────────────────────
        const path = interpolateParams(tool.execute.pathTemplate, args);
        const url = new URL(path, tool.connection.baseUrl);

        // ── 2. Interpolate query params ──────────────────
        if (tool.execute.queryTemplates) {
            for (const [key, template] of Object.entries(tool.execute.queryTemplates)) {
                url.searchParams.set(key, interpolateParams(template, args));
            }
        }

        // ── 3. Build request options ─────────────────────
        const headers = new Headers(tool.connection.headers);
        const init: RequestInit = {
            method: tool.execute.method,
            headers,
        };

        // ── 4. Interpolate body ──────────────────────────
        if (tool.execute.bodyTemplate && tool.execute.method !== 'GET') {
            const body = interpolateDeep(tool.execute.bodyTemplate, args);
            init.body = JSON.stringify(body);
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }
        }

        // ── 5. Execute request ───────────────────────────
        const response = await fetchFn(url.toString(), init);
        const responseText = await response.text();

        if (!response.ok) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: true,
                        status: response.status,
                        statusText: response.statusText,
                        body: responseText,
                    }),
                }],
                isError: true,
            };
        }

        // ── 6. Parse & transform response ────────────────
        let data: unknown;
        try {
            data = JSON.parse(responseText);
        } catch {
            // Non-JSON response — return as plain text
            data = responseText;
        }

        const transformed = applyResponseTransform(data, tool.response);

        return {
            content: [{
                type: 'text',
                text: typeof transformed === 'string'
                    ? transformed
                    : JSON.stringify(transformed, null, 2),
            }],
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: true,
                    message: error instanceof Error ? error.message : String(error),
                }),
            }],
            isError: true,
        };
    }
}
