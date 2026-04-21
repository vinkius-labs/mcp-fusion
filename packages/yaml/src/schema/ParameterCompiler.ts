/**
 * ParameterCompiler — YAML Parameters → JSON Schema
 *
 * Converts YAML tool parameter definitions into JSON Schema
 * objects compatible with the MCP `tools/list` response.
 *
 * @module
 */
import type { YamlParamDef } from '../schema/VurbYamlSpec.js';

/** JSON Schema property definition. */
interface JsonSchemaProperty {
    type: string;
    description?: string;
    enum?: readonly string[];
    default?: string | number | boolean;
}

/** Compiled JSON Schema for a tool's input. */
export interface CompiledInputSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
}

/**
 * Compile YAML parameter definitions into a JSON Schema object.
 *
 * @param params - Map of parameter name → definition
 * @returns JSON Schema compatible with MCP `inputSchema`
 *
 * @example
 * ```typescript
 * const schema = compileParameters({
 *   query: { type: 'string', required: true, description: 'Search query' },
 *   limit: { type: 'number', required: false, default: 10 },
 * });
 * // → { type: 'object', properties: { query: {...}, limit: {...} }, required: ['query'] }
 * ```
 */
export function compileParameters(
    params: Readonly<Record<string, YamlParamDef>>,
): CompiledInputSchema {
    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    for (const [name, def] of Object.entries(params)) {
        const prop: JsonSchemaProperty = { type: def.type };

        if (def.description) {
            prop.description = def.description;
        }

        if (def.enum) {
            prop.enum = def.enum;
        }

        if (def.default !== undefined) {
            prop.default = def.default;
        }

        properties[name] = prop;

        if (def.required) {
            required.push(name);
        }
    }

    return { type: 'object', properties, required };
}
