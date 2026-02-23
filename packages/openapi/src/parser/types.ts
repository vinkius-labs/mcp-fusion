/**
 * Intermediate Representation Types
 *
 * Normalized data structures produced by the OpenAPI parser.
 * These types are the single contract between the parser, mapper,
 * Zod compiler, and code emitter — no OpenAPI specifics leak past this boundary.
 *
 * @module
 */

// ── Parameter Source ─────────────────────────────────────

/** Where the parameter originated in the OpenAPI spec */
export type ParamSource = 'path' | 'query' | 'header' | 'cookie' | 'body';

// ── Schema Node (OpenAPI JSON Schema subset) ─────────────

/**
 * Normalized JSON Schema node extracted from an OpenAPI document.
 *
 * All `$ref` pointers are already resolved by the parser.
 * This is the input to the Zod AST Compiler.
 */
export interface SchemaNode {
    readonly type?: string;
    readonly format?: string;
    readonly description?: string;
    readonly enum?: readonly string[];
    readonly items?: SchemaNode;
    readonly properties?: Readonly<Record<string, SchemaNode>>;
    readonly required?: readonly string[];
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly pattern?: string;
    readonly default?: unknown;
    readonly nullable?: boolean;
    /** For allOf/oneOf/anyOf composition */
    readonly allOf?: readonly SchemaNode[];
    readonly oneOf?: readonly SchemaNode[];
    readonly anyOf?: readonly SchemaNode[];
}

// ── Action Parameter ─────────────────────────────────────

/** A single parameter for an API action */
export interface ApiParam {
    readonly name: string;
    readonly source: ParamSource;
    readonly required: boolean;
    readonly schema: SchemaNode;
    readonly description?: string;
}

// ── Response Schema ──────────────────────────────────────

/** Extracted response schema for Presenter generation */
export interface ApiResponseSchema {
    readonly statusCode: string;
    readonly description?: string;
    readonly schema?: SchemaNode;
}

// ── Action (single operation) ────────────────────────────

/** A single API operation, mapped from an OpenAPI path + method */
export interface ApiAction {
    readonly operationId?: string;
    readonly name: string;
    readonly method: string;
    readonly path: string;
    readonly description?: string;
    readonly summary?: string;
    readonly params: readonly ApiParam[];
    readonly requestBody?: SchemaNode;
    readonly responses: readonly ApiResponseSchema[];
    readonly tags: readonly string[];
    readonly deprecated?: boolean;
}

// ── Group (tag-level aggregation) ────────────────────────

/** A group of actions sharing a common tag */
export interface ApiGroup {
    readonly tag: string;
    readonly description?: string;
    readonly actions: readonly ApiAction[];
}

// ── Spec (top-level) ─────────────────────────────────────

/** Normalized representation of the entire OpenAPI document */
export interface ApiSpec {
    readonly title: string;
    readonly description?: string;
    readonly version: string;
    readonly servers: readonly ApiServer[];
    readonly groups: readonly ApiGroup[];
}

/** A server entry from the OpenAPI spec */
export interface ApiServer {
    readonly url: string;
    readonly description?: string;
}
