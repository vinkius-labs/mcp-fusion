/**
 * ResourceCompiler — YAML Resource Definitions → Compiled Resources
 *
 * Converts declarative YAML resource definitions into executable
 * resource objects for MCP `resources/list` and `resources/read`.
 *
 * Supports three execution strategies:
 * - `fetch`: Direct URL fetch
 * - `static`: Inline content embedded in YAML
 * - `connection`: Route through a named connection
 *
 * @module
 */
import type { YamlResourceDef } from '../schema/VurbYamlSpec.js';
import type { ResolvedConnection } from './ConnectionResolver.js';
import { interpolateSecrets } from '../schema/SecretInterpolator.js';

/** A compiled resource ready for MCP registration. */
export interface CompiledResource {
    /** Resource name. */
    readonly name: string;

    /** Resource URI or URI template. */
    readonly uri: string;

    /** Description for AI agents. */
    readonly description?: string;

    /** MIME type of the content. */
    readonly mimeType: string;

    /** Whether this is a URI template (contains `{param}`). */
    readonly isTemplate: boolean;

    /** Execution strategy. */
    readonly execute: CompiledResourceExecute;

    /** Response transform config. */
    readonly response?: YamlResourceDef['response'];
}

/** Resolved execution strategy. */
export type CompiledResourceExecute =
    | { readonly type: 'fetch'; readonly url: string; readonly headers: Record<string, string> }
    | { readonly type: 'static'; readonly content: string }
    | { readonly type: 'connection'; readonly connection: ResolvedConnection; readonly method: string; readonly path: string };

/**
 * Compile a single YAML resource definition.
 *
 * @param def - YAML resource definition
 * @param connections - Resolved connection map
 * @param secrets - Resolved secret values (for fetch headers)
 * @returns Compiled resource
 */
export function compileResource(
    def: YamlResourceDef,
    connections: ReadonlyMap<string, ResolvedConnection>,
    secrets: Readonly<Record<string, string>>,
): CompiledResource {
    const isTemplate = def.uri.includes('{');
    let execute: CompiledResourceExecute;

    switch (def.execute.type) {
        case 'static': {
            execute = {
                type: 'static',
                content: def.execute.content ?? '',
            };
            break;
        }
        case 'fetch': {
            const headers: Record<string, string> = {};
            if (def.execute.headers) {
                for (const [key, value] of Object.entries(def.execute.headers)) {
                    headers[key] = interpolateSecrets(value, secrets);
                }
            }
            execute = {
                type: 'fetch',
                url: def.execute.url ?? '',
                headers,
            };
            break;
        }
        case 'connection': {
            const conn = connections.get(def.execute.connection ?? '');
            if (!conn) {
                throw new Error(
                    `Resource "${def.name}" references connection "${def.execute.connection}" but it was not resolved`,
                );
            }
            execute = {
                type: 'connection',
                connection: conn,
                method: def.execute.method ?? 'GET',
                path: def.execute.path ?? '/',
            };
            break;
        }
    }

    const result: CompiledResource = {
        name: def.name,
        uri: def.uri,
        mimeType: def.mime_type ?? 'application/json',
        isTemplate,
        execute,
    };
    if (def.description !== undefined) {
        (result as { description: string }).description = def.description;
    }
    if (def.response !== undefined) {
        (result as { response: typeof def.response }).response = def.response;
    }
    return result;
}

/**
 * Compile all YAML resource definitions.
 */
export function compileAllResources(
    resources: readonly YamlResourceDef[] | undefined,
    connections: ReadonlyMap<string, ResolvedConnection>,
    secrets: Readonly<Record<string, string>>,
): readonly CompiledResource[] {
    if (!resources) return [];
    return resources.map(def => compileResource(def, connections, secrets));
}
