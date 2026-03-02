/**
 * Swagger2Converter — Swagger 2.0 → OpenAPI 3.0 Adapter
 *
 * Converts a Swagger 2.0 document into an OpenAPI 3.0-compatible
 * structure so the existing parser can handle both versions.
 *
 * Handles:
 * - `host` + `basePath` + `schemes` → `servers`
 * - `definitions` → `components.schemas`
 * - `parameters` with `in: body` → `requestBody`
 * - `produces`/`consumes` → per-operation `content` types
 * - `$ref` prefix rewrite (`#/definitions/` → `#/components/schemas/`)
 *
 * @module
 */

// ── Swagger 2.0 interfaces (minimal) ────────────────────

interface Swagger2Doc {
    swagger: string;
    info?: { title?: string; description?: string; version?: string };
    host?: string;
    basePath?: string;
    schemes?: string[];
    consumes?: string[];
    produces?: string[];
    paths?: Record<string, Record<string, Swagger2Operation>>;
    definitions?: Record<string, unknown>;
    tags?: Array<{ name?: string; description?: string }>;
}

interface Swagger2Operation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    parameters?: Swagger2Param[];
    responses?: Record<string, Swagger2Response>;
    consumes?: string[];
    produces?: string[];
}

interface Swagger2Param {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    type?: string;
    format?: string;
    enum?: unknown[];
    default?: unknown;
    items?: Record<string, unknown>;
    schema?: Record<string, unknown>;
}

interface Swagger2Response {
    description?: string;
    schema?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// ── Public ───────────────────────────────────────────────

/**
 * Returns `true` if the input looks like a Swagger 2.0 document.
 */
export function isSwagger2(raw: Record<string, unknown>): boolean {
    const ver = raw['swagger'];
    return typeof ver === 'string' && ver.startsWith('2.');
}

/**
 * Convert a Swagger 2.0 document into an OpenAPI 3.0-equivalent object.
 *
 * The output is NOT a valid 3.0 spec in every edge case, but it is
 * structurally close enough for the existing parser to produce a
 * correct {@link ApiSpec} IR.
 */
export function convertSwagger2ToV3(raw: Record<string, unknown>): AnyObj {
    const doc = raw as unknown as Swagger2Doc;

    const v3: AnyObj = {
        openapi: '3.0.0',
        info: doc.info ?? { title: 'Untitled', version: '0.0.0' },
        servers: buildServers(doc),
        paths: convertPaths(doc.paths ?? {}, doc.consumes, doc.produces),
        tags: doc.tags,
    };

    // Move definitions → components.schemas
    if (doc.definitions) {
        v3['components'] = { schemas: doc.definitions };
    }

    return v3;
}

// ── Internals ────────────────────────────────────────────

function buildServers(doc: Swagger2Doc): AnyObj[] {
    const host = doc.host ?? 'localhost';
    const basePath = doc.basePath ?? '/';
    const schemes = doc.schemes ?? ['https'];
    return schemes.map(s => ({ url: `${s}://${host}${basePath}`.replace(/\/+$/, '') }));
}

function convertPaths(
    paths: Record<string, Record<string, Swagger2Operation>>,
    globalConsumes?: string[],
    globalProduces?: string[],
): AnyObj {
    const converted: AnyObj = {};
    const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;

        const newPathItem: AnyObj = {};

        for (const [key, value] of Object.entries(pathItem)) {
            if (!httpMethods.has(key)) {
                // Copy non-HTTP keys (e.g. path-level parameters)
                if (key === 'parameters') {
                    newPathItem[key] = convertNonBodyParams(value as unknown as Swagger2Param[]);
                } else {
                    newPathItem[key] = value;
                }
                continue;
            }

            const op = value;
            const newOp: AnyObj = {
                operationId: op.operationId,
                summary: op.summary,
                description: op.description,
                tags: op.tags,
                deprecated: op.deprecated,
            };

            // Split parameters into body vs non-body
            const rawParams: Swagger2Param[] = op.parameters ?? [];
            const bodyParam = rawParams.find(p => p.in === 'body');
            const formParams = rawParams.filter(p => p.in === 'formData');
            const otherParams = rawParams.filter(p => p.in !== 'body' && p.in !== 'formData');

            // Convert non-body params (add schema wrapper for v2 type→schema)
            newOp['parameters'] = convertNonBodyParams(otherParams);

            // body → requestBody
            if (bodyParam) {
                const consumes = op.consumes ?? globalConsumes ?? ['application/json'];
                const content: AnyObj = {};
                for (const mime of consumes) {
                    content[mime] = { schema: rewriteRefs(bodyParam.schema ?? {}) };
                }
                newOp['requestBody'] = {
                    required: bodyParam.required ?? false,
                    ...(bodyParam.description ? { description: bodyParam.description } : {}),
                    content,
                };
            }

            // formData → requestBody (multipart or urlencoded)
            if (!bodyParam && formParams.length > 0) {
                const consumes = op.consumes ?? globalConsumes ?? ['application/x-www-form-urlencoded'];
                const properties: AnyObj = {};
                const required: string[] = [];
                for (const fp of formParams) {
                    properties[fp.name] = { type: fp.type ?? 'string' };
                    if (fp.description) properties[fp.name]['description'] = fp.description;
                    if (fp.required) required.push(fp.name);
                }
                const schema: AnyObj = { type: 'object', properties };
                if (required.length > 0) schema['required'] = required;

                const content: AnyObj = {};
                for (const mime of consumes) {
                    content[mime] = { schema };
                }
                newOp['requestBody'] = { content };
            }

            // Convert responses
            if (op.responses) {
                const produces = op.produces ?? globalProduces ?? ['application/json'];
                const newResponses: AnyObj = {};
                for (const [code, resp] of Object.entries(op.responses)) {
                    const newResp: AnyObj = {};
                    if (resp.description) newResp['description'] = resp.description;
                    if (resp.schema) {
                        newResp['content'] = {};
                        for (const mime of produces) {
                            newResp['content'][mime] = { schema: rewriteRefs(resp.schema) };
                        }
                    }
                    newResponses[code] = newResp;
                }
                newOp['responses'] = newResponses;
            }

            newPathItem[key] = newOp;
        }

        converted[path] = newPathItem;
    }

    return converted;
}

/**
 * Convert v2 parameters (which embed type directly) to v3 format (schema wrapper).
 */
function convertNonBodyParams(params: Swagger2Param[]): AnyObj[] {
    return params.map(p => {
        if (p.schema) return p; // Already has schema (v3 style)

        const schema: AnyObj = {};
        if (p.type) schema['type'] = p.type;
        if (p.format) schema['format'] = p.format;
        if (p.enum) schema['enum'] = p.enum;
        if (p.default !== undefined) schema['default'] = p.default;
        if (p.items) schema['items'] = p.items;

        const converted: AnyObj = {
            name: p.name,
            in: p.in,
            schema,
        };
        if (p.required !== undefined) converted['required'] = p.required;
        if (p.description) converted['description'] = p.description;

        return converted;
    });
}

/**
 * Deep-rewrite `$ref` paths from v2 format to v3 format.
 * `#/definitions/Pet` → `#/components/schemas/Pet`
 */
function rewriteRefs(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => rewriteRefs(item));
    }

    const result: AnyObj = {};
    for (const [key, value] of Object.entries(obj as AnyObj)) {
        if (key === '$ref' && typeof value === 'string') {
            result[key] = value.replace('#/definitions/', '#/components/schemas/');
        } else {
            result[key] = rewriteRefs(value);
        }
    }
    return result;
}
