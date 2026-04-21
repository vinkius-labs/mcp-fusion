/**
 * ToolCompiler — YAML Tool Definitions → Compiled Tool Handlers
 *
 * Converts declarative YAML tool definitions into executable tool
 * objects with JSON Schema input, HTTP execution config, and the
 * tool trichotomy (description / instruction / rules).
 *
 * @module
 */
import type { YamlToolDef } from '../schema/VurbYamlSpec.js';
import { compileParameters, type CompiledInputSchema } from '../schema/ParameterCompiler.js';
import type { ResolvedConnection } from './ConnectionResolver.js';

/** A compiled tool ready for MCP registration. */
export interface CompiledTool {
    /** Tool name (snake_case). */
    readonly name: string;

    /**
     * O QUE faz — short description for `tools/list`.
     * Maps to: McpTool.description
     */
    readonly description: string;

    /**
     * COMO usar — detailed instruction for the LLM.
     * Maps to: McpTool.custom_description
     */
    readonly instruction?: string;

    /**
     * RESTRIÇÕES — guardrail rules.
     * Maps to: McpTool.system_rules
     */
    readonly rules?: readonly string[];

    /** Grouping tag for tool exposition. */
    readonly tag?: string;

    /** MCP tool annotations. */
    readonly annotations?: Record<string, boolean>;

    /** JSON Schema for the tool's input parameters. */
    readonly inputSchema: CompiledInputSchema;

    /** Resolved connection for HTTP execution. */
    readonly connection: ResolvedConnection;

    /** HTTP execution config (method, path, query, body templates). */
    readonly execute: {
        readonly method: string;
        readonly pathTemplate: string;
        readonly queryTemplates?: Readonly<Record<string, string>>;
        readonly bodyTemplate?: unknown;
    };

    /** Response transform config. */
    readonly response?: YamlToolDef['response'];
}

/**
 * Compile a single YAML tool definition into a {@link CompiledTool}.
 *
 * @param def - YAML tool definition
 * @param connections - Resolved connection map
 * @returns Compiled tool ready for registration
 * @throws When the referenced connection does not exist
 */
export function compileTool(
    def: YamlToolDef,
    connections: ReadonlyMap<string, ResolvedConnection>,
): CompiledTool {
    const connection = connections.get(def.execute.connection);
    if (!connection) {
        throw new Error(
            `Tool "${def.name}" references connection "${def.execute.connection}" but it was not resolved`,
        );
    }

    const inputSchema = def.parameters
        ? compileParameters(def.parameters)
        : { type: 'object' as const, properties: {}, required: [] };

    const execute: CompiledTool['execute'] = {
        method: def.execute.method,
        pathTemplate: def.execute.path,
    };
    if (def.execute.query !== undefined) {
        (execute as { queryTemplates: typeof def.execute.query }).queryTemplates = def.execute.query;
    }
    if (def.execute.body !== undefined) {
        (execute as { bodyTemplate: unknown }).bodyTemplate = def.execute.body;
    }

    const result: CompiledTool = {
        name: def.name,
        description: def.description,
        inputSchema,
        connection,
        execute,
    };
    if (def.instruction !== undefined) {
        (result as { instruction: string }).instruction = def.instruction;
    }
    if (def.rules !== undefined) {
        (result as { rules: readonly string[] }).rules = def.rules;
    }
    if (def.tag !== undefined) {
        (result as { tag: string }).tag = def.tag;
    }
    if (def.annotations !== undefined) {
        (result as { annotations: Record<string, boolean> }).annotations = { ...def.annotations };
    }
    if (def.response !== undefined) {
        (result as { response: typeof def.response }).response = def.response;
    }
    return result;
}

/**
 * Compile all YAML tool definitions.
 *
 * @param tools - Array of YAML tool definitions
 * @param connections - Resolved connection map
 * @returns Array of compiled tools
 */
export function compileAllTools(
    tools: readonly YamlToolDef[] | undefined,
    connections: ReadonlyMap<string, ResolvedConnection>,
): readonly CompiledTool[] {
    if (!tools) return [];
    return tools.map(def => compileTool(def, connections));
}
