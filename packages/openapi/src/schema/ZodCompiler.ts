/**
 * ZodCompiler — OpenAPI JSON Schema → Zod Code String
 *
 * Translates OpenAPI JSON Schema AST directly into Zod code strings.
 * No intermediate ParamsMap — the Zod AST is the compilation target.
 *
 * Key design decisions:
 * - Path/query params use `z.coerce.*` (URL params arrive as strings)
 * - Body params use standard `z.*` (JSON provides native types)
 * - `required: false` → `.optional()`
 * - Enum + format constraints are preserved
 *
 * @module
 */
import type { SchemaNode, ParamSource } from '../parser/types.js';

// ── Public API ───────────────────────────────────────────

/**
 * Compile an OpenAPI schema node into a Zod code string.
 *
 * @param schema - Normalized JSON Schema node
 * @param coerce - Whether to use `z.coerce.*` (for path/query params)
 * @returns Zod code string (e.g. `z.coerce.number().int()`)
 */
export function compileZod(schema: SchemaNode, coerce = false): string {
    const base = compileNode(schema, coerce);
    return base;
}

/**
 * Compile a list of API parameters into a `z.object({...})` code string.
 *
 * @param params - List of parameters (merged path + query + header)
 * @param bodySchema - Optional request body schema
 * @param requiredFields - List of required field names from parent
 * @returns Zod object code string
 */
export function compileInputSchema(
    params: ReadonlyArray<{ name: string; source: ParamSource; required: boolean; schema: SchemaNode; description?: string }>,
    bodySchema?: SchemaNode,
): string {
    const fields: string[] = [];

    // Path, query, header params
    for (const param of params) {
        const needsCoerce = param.source === 'path' || param.source === 'query';
        let zodCode = compileNode(param.schema, needsCoerce);

        // Add description if present
        const desc = param.description ?? param.schema.description;
        if (desc) {
            zodCode += `.describe(${escapeString(desc)})`;
        }

        // Optional
        if (!param.required) {
            zodCode += '.optional()';
        }

        fields.push(`        ${safeKey(param.name)}: ${zodCode},`);
    }

    // Body params (flattened into top-level if it's an object)
    if (bodySchema?.type === 'object' && bodySchema.properties) {
        const bodyRequired = new Set(bodySchema.required ?? []);
        for (const [name, propSchema] of Object.entries(bodySchema.properties)) {
            let zodCode = compileNode(propSchema, false);

            if (propSchema.description) {
                zodCode += `.describe(${escapeString(propSchema.description)})`;
            }

            if (!bodyRequired.has(name)) {
                zodCode += '.optional()';
            }

            fields.push(`        ${safeKey(name)}: ${zodCode},`);
        }
    } else if (bodySchema) {
        // Non-object body → wrap as `body` param
        let zodCode = compileNode(bodySchema, false);
        if (bodySchema.description) {
            zodCode += `.describe(${escapeString(bodySchema.description)})`;
        }
        fields.push(`        body: ${zodCode},`);
    }

    if (fields.length === 0) {
        return 'z.object({})';
    }

    return `z.object({\n${fields.join('\n')}\n    })`;
}

/**
 * Compile a response schema into a Zod code string for Presenter generation.
 *
 * @param schema - Response schema node
 * @returns Zod code string
 */
export function compileResponseSchema(schema: SchemaNode): string {
    return compileNode(schema, false);
}

// ── Core Compiler ────────────────────────────────────────

function compileNode(schema: SchemaNode, coerce: boolean): string {
    // Handle allOf (merge all schemas)
    if (schema.allOf && schema.allOf.length > 0) {
        return compileAllOf(schema.allOf, coerce);
    }

    // Handle oneOf/anyOf (union)
    if (schema.oneOf && schema.oneOf.length > 0) {
        return compileUnion(schema.oneOf, coerce);
    }
    if (schema.anyOf && schema.anyOf.length > 0) {
        return compileUnion(schema.anyOf, coerce);
    }

    // Handle enum (before type, since enum can exist without type)
    if (schema.enum && schema.enum.length > 0) {
        return compileEnum(schema.enum);
    }

    const type = schema.type ?? 'string';

    switch (type) {
        case 'string':  return compileString(schema, coerce);
        case 'integer': return compileInteger(schema, coerce);
        case 'number':  return compileNumber(schema, coerce);
        case 'boolean': return compileBoolean(coerce);
        case 'array':   return compileArray(schema, coerce);
        case 'object':  return compileObject(schema);
        default:        return 'z.unknown()';
    }
}

// ── Type Compilers ───────────────────────────────────────

function compileString(schema: SchemaNode, coerce: boolean): string {
    const prefix = coerce ? 'z.coerce.string()' : 'z.string()';
    let code = prefix;

    // Format-specific validators
    if (schema.format === 'uuid')      code = `${prefix}.uuid()`;
    if (schema.format === 'email')     code = `${prefix}.email()`;
    if (schema.format === 'uri' || schema.format === 'url') code = `${prefix}.url()`;
    if (schema.format === 'date-time') code = `${prefix}.datetime()`;

    // Constraints
    if (schema.minLength !== undefined) code += `.min(${schema.minLength})`;
    if (schema.maxLength !== undefined) code += `.max(${schema.maxLength})`;
    if (schema.pattern)                 code += `.regex(/${schema.pattern}/)`;

    return code;
}

function compileInteger(schema: SchemaNode, coerce: boolean): string {
    const prefix = coerce ? 'z.coerce.number()' : 'z.number()';
    let code = `${prefix}.int()`;

    if (schema.minimum !== undefined) code += `.min(${schema.minimum})`;
    if (schema.maximum !== undefined) code += `.max(${schema.maximum})`;

    return code;
}

function compileNumber(schema: SchemaNode, coerce: boolean): string {
    const prefix = coerce ? 'z.coerce.number()' : 'z.number()';
    let code = prefix;

    if (schema.minimum !== undefined) code += `.min(${schema.minimum})`;
    if (schema.maximum !== undefined) code += `.max(${schema.maximum})`;

    return code;
}

function compileBoolean(coerce: boolean): string {
    return coerce ? 'z.coerce.boolean()' : 'z.boolean()';
}

function compileArray(schema: SchemaNode, coerce: boolean): string {
    const itemsCode = schema.items ? compileNode(schema.items, coerce) : 'z.unknown()';
    let code = `z.array(${itemsCode})`;

    if (schema.minLength !== undefined) code += `.min(${schema.minLength})`;
    if (schema.maxLength !== undefined) code += `.max(${schema.maxLength})`;

    return code;
}

function compileObject(schema: SchemaNode): string {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return 'z.record(z.unknown())';
    }

    const requiredSet = new Set(schema.required ?? []);
    const fields: string[] = [];

    for (const [name, propSchema] of Object.entries(schema.properties)) {
        let code = compileNode(propSchema, false);

        if (propSchema.description) {
            code += `.describe(${escapeString(propSchema.description)})`;
        }

        if (!requiredSet.has(name)) {
            code += '.optional()';
        }

        fields.push(`    ${safeKey(name)}: ${code},`);
    }

    return `z.object({\n${fields.join('\n')}\n})`;
}

function compileEnum(values: readonly string[]): string {
    const escaped = values.map(v => `'${v.replace(/'/g, "\\'")}'`);
    return `z.enum([${escaped.join(', ')}])`;
}

function compileAllOf(schemas: readonly SchemaNode[], coerce: boolean): string {
    // Merge all schemas into a single object schema
    const merged: SchemaNode = {
        type: 'object',
        properties: {},
        required: [],
    };

    const props: Record<string, SchemaNode> = {};
    const required: string[] = [];

    for (const s of schemas) {
        if (s.properties) {
            for (const [k, v] of Object.entries(s.properties)) {
                props[k] = v;
            }
        }
        if (s.required) {
            required.push(...s.required);
        }
    }

    return compileNode(
        { ...merged, properties: props, required } as SchemaNode,
        coerce,
    );
}

function compileUnion(schemas: readonly SchemaNode[], coerce: boolean): string {
    if (schemas.length === 1) {
        return compileNode(schemas[0]!, coerce);
    }

    const members = schemas.map(s => compileNode(s, coerce));
    return `z.union([${members.join(', ')}])`;
}

// ── Helpers ──────────────────────────────────────────────

/** Quote a property key if it contains non-identifier characters */
function safeKey(name: string): string {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `'${name}'`;
}

function escapeString(str: string): string {
    const escaped = str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n');
    return `'${escaped}'`;
}
