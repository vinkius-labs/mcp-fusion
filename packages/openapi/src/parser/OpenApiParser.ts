/**
 * OpenApiParser — OpenAPI 3.x / Swagger 2.0 → IR Converter
 *
 * Accepts YAML or JSON input (string or pre-parsed object) and produces
 * a normalized {@link ApiSpec} intermediate representation. Resolves all
 * `$ref` pointers and extracts operations, parameters, request bodies,
 * and response schemas.
 *
 * @module
 */
import { parse as parseYaml } from 'yaml';
import { resolveRefs } from './RefResolver.js';
import { isSwagger2, convertSwagger2ToV3 } from './Swagger2Converter.js';
import type {
    ApiSpec, ApiGroup, ApiAction, ApiParam,
    ApiResponseSchema, ApiServer, SchemaNode, ParamSource,
} from './types.js';

// ── Public Types ─────────────────────────────────────────

export type { ApiSpec, ApiGroup, ApiAction, ApiParam, ApiResponseSchema, ApiServer, SchemaNode };

// ── Raw OpenAPI Types (internal) ─────────────────────────

interface RawOpenApi {
    openapi?: string;
    info?: { title?: string; description?: string; version?: string };
    servers?: Array<{ url?: string; description?: string }>;
    paths?: Record<string, Record<string, RawOperation>>;
    tags?: Array<{ name?: string; description?: string }>;
    components?: { schemas?: Record<string, unknown> };
}

interface RawOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    parameters?: RawParameter[];
    requestBody?: RawRequestBody;
    responses?: Record<string, RawResponse>;
}

interface RawParameter {
    name?: string;
    in?: string;
    required?: boolean;
    description?: string;
    schema?: Record<string, unknown>;
}

interface RawRequestBody {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: Record<string, unknown> }>;
}

interface RawResponse {
    description?: string;
    content?: Record<string, { schema?: Record<string, unknown> }>;
}

// ── HTTP Methods ─────────────────────────────────────────

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

// ── Parser ───────────────────────────────────────────────

/**
 * Parse an OpenAPI 3.x or Swagger 2.0 specification into the normalized IR.
 *
 * Swagger 2.0 documents are automatically converted to OpenAPI 3.0
 * format before processing.
 *
 * @param input - YAML string, JSON string, or pre-parsed object
 * @returns Normalized {@link ApiSpec}
 * @throws If the input is not a valid OpenAPI document
 */
export function parseOpenAPI(input: string | object): ApiSpec {
    let raw: RawOpenApi = typeof input === 'string' ? parseInput(input) : input as RawOpenApi;

    // Auto-convert Swagger 2.0 → OpenAPI 3.0
    if (isSwagger2(raw as Record<string, unknown>)) {
        raw = convertSwagger2ToV3(raw as Record<string, unknown>) as RawOpenApi;
    }

    // Validate OpenAPI version
    if (!raw.openapi?.startsWith('3.')) {
        throw new Error(
            `Unsupported OpenAPI version: "${raw.openapi ?? 'missing'}". OpenAPI 3.x or Swagger 2.0 required.`
        );
    }

    // Resolve all $ref pointers in-place
    resolveRefs(raw as Record<string, unknown>);

    // Build tag description lookup
    const tagDescriptions = new Map<string, string>();
    if (raw.tags) {
        for (const tag of raw.tags) {
            if (tag.name) {
                tagDescriptions.set(tag.name, tag.description ?? '');
            }
        }
    }

    // Extract servers
    const servers: ApiServer[] = (raw.servers ?? [])
        .filter(s => typeof s.url === 'string')
        .map(s => ({
            url: s.url!,
            ...(s.description ? { description: s.description } : {}),
        }));

    // Group operations by tag
    const groupMap = new Map<string, ApiAction[]>();

    if (raw.paths) {
        for (const [path, pathItem] of Object.entries(raw.paths)) {
            if (!pathItem || typeof pathItem !== 'object') continue;

            // Extract path-level parameters
            const pathParams = Array.isArray((pathItem as Record<string, unknown>)['parameters'])
                ? extractParams((pathItem as Record<string, unknown>)['parameters'] as RawParameter[])
                : [];

            for (const [method, operation] of Object.entries(pathItem)) {
                if (!HTTP_METHODS.has(method)) continue;
                if (!operation || typeof operation !== 'object') continue;

                const op = operation as RawOperation;
                const tag = op.tags?.[0] ?? 'default';

                // Merge path-level + operation-level params
                const operationParams = op.parameters ? extractParams(op.parameters) : [];
                const mergedParams = mergeParams(pathParams, operationParams);

                // Extract request body
                const requestBody = extractRequestBody(op.requestBody);

                // Extract responses
                const responses = extractResponses(op.responses);

                const action: ApiAction = {
                    ...(op.operationId ? { operationId: op.operationId } : {}),
                    name: '', // Filled by EndpointMapper
                    method: method.toUpperCase(),
                    path,
                    ...(op.description ? { description: op.description } : {}),
                    ...(op.summary ? { summary: op.summary } : {}),
                    params: mergedParams,
                    ...(requestBody ? { requestBody } : {}),
                    responses,
                    tags: op.tags ?? ['default'],
                    ...(op.deprecated ? { deprecated: true } : {}),
                };

                if (!groupMap.has(tag)) {
                    groupMap.set(tag, []);
                }
                groupMap.get(tag)!.push(action);
            }
        }
    }

    // Build groups
    const groups: ApiGroup[] = [];
    for (const [tag, actions] of groupMap) {
        const desc = tagDescriptions.get(tag);
        groups.push({
            tag,
            ...(desc ? { description: desc } : {}),
            actions,
        });
    }

    return {
        title: raw.info?.title ?? 'Untitled API',
        ...(raw.info?.description ? { description: raw.info.description } : {}),
        version: raw.info?.version ?? '0.0.0',
        servers,
        groups,
    };
}

// ── Helpers ──────────────────────────────────────────────

/** Parse YAML or JSON string input */
function parseInput(input: string): RawOpenApi {
    const trimmed = input.trim();

    // Try JSON first (much faster)
    if (trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed) as RawOpenApi;
        } catch {
            // Fall through to YAML
        }
    }

    // Parse as YAML (supports JSON as well)
    return parseYaml(trimmed) as RawOpenApi;
}

/** Extract parameters from raw OpenAPI parameter list */
function extractParams(rawParams: RawParameter[]): ApiParam[] {
    return rawParams
        .filter(p => p.name && p.in)
        .map(p => ({
            name: p.name!,
            source: p.in as ParamSource,
            required: p.required ?? (p.in === 'path'), // Path params are always required
            schema: (p.schema ?? { type: 'string' }) as SchemaNode,
            ...(p.description ? { description: p.description } : {}),
        }));
}

/**
 * Merge path-level and operation-level params.
 * Operation params override path-level params by name + source.
 */
function mergeParams(pathParams: ApiParam[], opParams: ApiParam[]): ApiParam[] {
    const opKeys = new Set(opParams.map(p => `${p.source}:${p.name}`));
    const unique = pathParams.filter(p => !opKeys.has(`${p.source}:${p.name}`));
    return [...unique, ...opParams];
}

/** Extract request body schema */
function extractRequestBody(body: RawRequestBody | undefined): SchemaNode | undefined {
    if (!body?.content) return undefined;

    const jsonContent = body.content['application/json'];
    if (jsonContent?.schema) {
        return jsonContent.schema as SchemaNode;
    }

    // Fallback: any media type
    const firstContent = Object.values(body.content)[0];
    return firstContent?.schema as SchemaNode | undefined;
}

/** Extract response schemas */
function extractResponses(raw: Record<string, RawResponse> | undefined): ApiResponseSchema[] {
    if (!raw) return [];

    const responses: ApiResponseSchema[] = [];
    for (const [statusCode, response] of Object.entries(raw)) {
        const schema = response.content?.['application/json']?.schema as SchemaNode | undefined;
        responses.push({
            statusCode,
            ...(response.description ? { description: response.description } : {}),
            ...(schema ? { schema } : {}),
        });
    }
    return responses;
}
