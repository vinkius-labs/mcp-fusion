/**
 * EndpointMapper — OpenAPI Actions → Named MCP Actions
 *
 * Applies the naming cascade:
 *   1. operationId → snake_case (absolute priority)
 *   2. Fallback: method_lastPathSegment (only if no operationId)
 *
 * Also infers MCP annotations from HTTP methods.
 *
 * @module
 */
import type { ApiSpec, ApiGroup, ApiAction } from '../parser/types.js';
import { toSnakeCase } from '../emitter/TemplateHelpers.js';

// ── Public API ───────────────────────────────────────────

/**
 * Apply naming and annotation inference to all actions in the spec.
 *
 * @param spec - Parsed OpenAPI IR (actions may have empty names)
 * @returns A new spec with fully resolved action names and annotations
 */
export function mapEndpoints(spec: ApiSpec): ApiSpec {
    const usedNames = new Set<string>();

    const groups: ApiGroup[] = spec.groups.map(group => ({
        ...group,
        actions: group.actions.map(action => {
            const name = resolveActionName(action, usedNames);
            usedNames.add(name);
            return {
                ...action,
                name,
            };
        }),
    }));

    return { ...spec, groups };
}

// ── Naming Cascade ───────────────────────────────────────

/**
 * Resolve the action name using the naming cascade.
 *
 * Priority 1: operationId → snake_case
 * Priority 2: method + last path segment
 *
 * Deduplicates by appending _2, _3, etc.
 */
function resolveActionName(action: ApiAction, usedNames: Set<string>): string {
    let candidate: string;

    if (action.operationId) {
        // Priority 1: operationId → snake_case
        candidate = toSnakeCase(action.operationId);
    } else {
        // Priority 2: method + last meaningful path segment
        candidate = inferFromMethodAndPath(action.method, action.path);
    }

    // Deduplicate
    return deduplicate(candidate, usedNames);
}

/**
 * Infer a name from HTTP method and path.
 *
 * @example
 * ('GET', '/pets')          → 'list_pets'
 * ('POST', '/pets')         → 'create_pets'
 * ('GET', '/pets/{petId}')  → 'get_pets'
 * ('DELETE', '/pets/{petId}') → 'delete_pets'
 * ('PUT', '/pets/{petId}')  → 'update_pets'
 */
function inferFromMethodAndPath(method: string, path: string): string {
    const segments = path.split('/').filter(s => s.length > 0 && !s.startsWith('{'));
    const entity = segments[segments.length - 1] ?? 'resource';

    const verb = METHOD_TO_VERB[method.toUpperCase()] ?? method.toLowerCase();
    return toSnakeCase(`${verb}_${entity}`);
}

/** HTTP method → CRUD verb mapping */
const METHOD_TO_VERB: Record<string, string> = {
    GET:     'list',
    POST:    'create',
    PUT:     'update',
    PATCH:   'update',
    DELETE:  'delete',
    HEAD:    'head',
    OPTIONS: 'options',
};

/** Deduplicate by appending suffix */
function deduplicate(name: string, used: Set<string>): string {
    if (!used.has(name)) return name;
    let i = 2;
    while (used.has(`${name}_${i}`)) i++;
    return `${name}_${i}`;
}

// ── Annotation Inference ─────────────────────────────────

/**
 * Infer MCP action annotations from the HTTP method.
 */
export function inferAnnotations(method: string): {
    readOnly?: boolean;
    destructive?: boolean;
    idempotent?: boolean;
} {
    const upper = method.toUpperCase();

    switch (upper) {
        case 'GET':
        case 'HEAD':
        case 'OPTIONS':
            return { readOnly: true };
        case 'DELETE':
            return { destructive: true };
        case 'PUT':
            return { idempotent: true };
        default:
            return {};
    }
}
