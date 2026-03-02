import { describe, it, expect } from 'vitest';
import { isSwagger2, convertSwagger2ToV3 } from '../../src/parser/Swagger2Converter.js';
import { parseOpenAPI } from '../../src/parser/OpenApiParser.js';

// ============================================================================
// Swagger2Converter Tests
// ============================================================================

// ── Minimal Swagger 2.0 Spec ─────────────────────────────

const SWAGGER2_MINIMAL = {
    swagger: '2.0',
    info: { title: 'Petstore', version: '1.0.0' },
    host: 'petstore.swagger.io',
    basePath: '/v2',
    schemes: ['https'],
    paths: {
        '/pets': {
            get: {
                operationId: 'listPets',
                summary: 'List all pets',
                tags: ['pet'],
                parameters: [
                    { name: 'limit', in: 'query', type: 'integer', required: false },
                ],
                responses: {
                    '200': {
                        description: 'A list of pets',
                        schema: {
                            type: 'array',
                            items: { '$ref': '#/definitions/Pet' },
                        },
                    },
                },
            },
        },
    },
    definitions: {
        Pet: {
            type: 'object',
            properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
            },
            required: ['id', 'name'],
        },
    },
    tags: [{ name: 'pet', description: 'Pet operations' }],
};

// ── Swagger 2.0 with body parameter ─────────────────────

const SWAGGER2_BODY = {
    swagger: '2.0',
    info: { title: 'Body API', version: '1.0.0' },
    host: 'api.example.com',
    basePath: '/',
    consumes: ['application/json'],
    produces: ['application/json'],
    paths: {
        '/pets': {
            post: {
                operationId: 'createPet',
                summary: 'Create a pet',
                tags: ['pet'],
                parameters: [
                    {
                        name: 'body',
                        in: 'body',
                        required: true,
                        description: 'Pet to create',
                        schema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                tag: { type: 'string' },
                            },
                            required: ['name'],
                        },
                    },
                ],
                responses: {
                    '201': { description: 'Created' },
                },
            },
        },
    },
};

// ── Swagger 2.0 with formData ───────────────────────────

const SWAGGER2_FORMDATA = {
    swagger: '2.0',
    info: { title: 'Upload API', version: '1.0.0' },
    host: 'api.example.com',
    basePath: '/',
    paths: {
        '/upload': {
            post: {
                operationId: 'uploadFile',
                tags: ['files'],
                consumes: ['multipart/form-data'],
                parameters: [
                    { name: 'file', in: 'formData', type: 'file', required: true, description: 'File to upload' },
                    { name: 'label', in: 'formData', type: 'string', required: false },
                ],
                responses: {
                    '200': { description: 'Success' },
                },
            },
        },
    },
};

// ── Swagger 2.0 with path parameters ────────────────────

const SWAGGER2_PATH_PARAMS = {
    swagger: '2.0',
    info: { title: 'Users API', version: '1.0.0' },
    host: 'api.example.com',
    basePath: '/v1',
    schemes: ['https', 'http'],
    paths: {
        '/users/{userId}': {
            get: {
                operationId: 'getUser',
                tags: ['users'],
                parameters: [
                    { name: 'userId', in: 'path', type: 'integer', required: true },
                ],
                responses: {
                    '200': { description: 'OK' },
                },
            },
            delete: {
                operationId: 'deleteUser',
                tags: ['users'],
                deprecated: true,
                parameters: [
                    { name: 'userId', in: 'path', type: 'integer', required: true },
                ],
                responses: {
                    '204': { description: 'Deleted' },
                },
            },
        },
    },
};

// ============================================================================
// Tests
// ============================================================================

describe('Swagger2Converter', () => {

    // ── Detection ──

    describe('isSwagger2', () => {
        it('should detect Swagger 2.0 documents', () => {
            expect(isSwagger2({ swagger: '2.0' })).toBe(true);
        });

        it('should detect Swagger 2.x variants', () => {
            expect(isSwagger2({ swagger: '2.1' })).toBe(true);
        });

        it('should reject OpenAPI 3.x documents', () => {
            expect(isSwagger2({ openapi: '3.0.0' })).toBe(false);
        });

        it('should reject documents without swagger field', () => {
            expect(isSwagger2({ info: { title: 'Test' } })).toBe(false);
        });

        it('should reject documents with non-string swagger field', () => {
            expect(isSwagger2({ swagger: 2 })).toBe(false);
        });
    });

    // ── Server Conversion ──

    describe('Server Conversion', () => {
        it('should convert host + basePath + schemes to servers array', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            expect(v3['servers']).toHaveLength(1);
            expect(v3['servers'][0].url).toBe('https://petstore.swagger.io/v2');
        });

        it('should handle multiple schemes', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_PATH_PARAMS as Record<string, unknown>);
            expect(v3['servers']).toHaveLength(2);
            expect(v3['servers'][0].url).toBe('https://api.example.com/v1');
            expect(v3['servers'][1].url).toBe('http://api.example.com/v1');
        });

        it('should default to https://localhost/ when host is missing', () => {
            const v3 = convertSwagger2ToV3({ swagger: '2.0', info: {}, paths: {} });
            expect(v3['servers'][0].url).toBe('https://localhost');
        });
    });

    // ── OpenAPI Version ──

    describe('Version Marker', () => {
        it('should set openapi to 3.0.0', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            expect(v3['openapi']).toBe('3.0.0');
        });
    });

    // ── Definitions → Components ──

    describe('Definitions Conversion', () => {
        it('should move definitions to components.schemas', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            expect(v3['components']).toBeDefined();
            expect(v3['components']['schemas']).toBeDefined();
            expect(v3['components']['schemas']['Pet']).toBeDefined();
        });

        it('should omit components when no definitions exist', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_BODY as Record<string, unknown>);
            expect(v3['components']).toBeUndefined();
        });
    });

    // ── $ref Rewriting ──

    describe('$ref Rewriting', () => {
        it('should rewrite #/definitions/ to #/components/schemas/', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            const getOp = v3['paths']['/pets']['get'];
            const responseSchema = getOp['responses']['200']['content']['application/json']['schema'];
            expect(responseSchema['items']['$ref']).toBe('#/components/schemas/Pet');
        });
    });

    // ── Parameter Conversion ──

    describe('Parameter Conversion', () => {
        it('should wrap v2 type in schema object', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            const params = v3['paths']['/pets']['get']['parameters'];
            expect(params).toHaveLength(1);
            expect(params[0]['name']).toBe('limit');
            expect(params[0]['in']).toBe('query');
            expect(params[0]['schema']).toEqual({ type: 'integer' });
        });

        it('should convert path parameters with required flag', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_PATH_PARAMS as Record<string, unknown>);
            const params = v3['paths']['/users/{userId}']['get']['parameters'];
            expect(params[0]['name']).toBe('userId');
            expect(params[0]['required']).toBe(true);
            expect(params[0]['schema']).toEqual({ type: 'integer' });
        });
    });

    // ── Body → RequestBody ──

    describe('Body Parameter Conversion', () => {
        it('should convert body param to requestBody', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_BODY as Record<string, unknown>);
            const post = v3['paths']['/pets']['post'];
            expect(post['requestBody']).toBeDefined();
            expect(post['requestBody']['required']).toBe(true);
            expect(post['requestBody']['description']).toBe('Pet to create');
        });

        it('should place body schema under content/application/json', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_BODY as Record<string, unknown>);
            const post = v3['paths']['/pets']['post'];
            const jsonSchema = post['requestBody']['content']['application/json']['schema'];
            expect(jsonSchema['type']).toBe('object');
            expect(jsonSchema['properties']['name']['type']).toBe('string');
        });

        it('should remove body param from parameters array', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_BODY as Record<string, unknown>);
            const params = v3['paths']['/pets']['post']['parameters'];
            expect(params).toHaveLength(0);
        });
    });

    // ── FormData → RequestBody ──

    describe('FormData Conversion', () => {
        it('should convert formData params to requestBody with object schema', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_FORMDATA as Record<string, unknown>);
            const post = v3['paths']['/upload']['post'];
            expect(post['requestBody']).toBeDefined();
            const content = post['requestBody']['content'];
            expect(content['multipart/form-data']).toBeDefined();
        });

        it('should merge formData params into properties', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_FORMDATA as Record<string, unknown>);
            const schema = v3['paths']['/upload']['post']['requestBody']['content']['multipart/form-data']['schema'];
            expect(schema['type']).toBe('object');
            expect(schema['properties']['file']).toBeDefined();
            expect(schema['properties']['label']).toBeDefined();
        });

        it('should set required array from required formData params', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_FORMDATA as Record<string, unknown>);
            const schema = v3['paths']['/upload']['post']['requestBody']['content']['multipart/form-data']['schema'];
            expect(schema['required']).toContain('file');
            expect(schema['required']).not.toContain('label');
        });
    });

    // ── Response Conversion ──

    describe('Response Conversion', () => {
        it('should wrap response schema in content/application/json', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            const resp = v3['paths']['/pets']['get']['responses']['200'];
            expect(resp['description']).toBe('A list of pets');
            expect(resp['content']['application/json']['schema']).toBeDefined();
        });

        it('should handle responses with no schema', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_PATH_PARAMS as Record<string, unknown>);
            const resp = v3['paths']['/users/{userId}']['delete']['responses']['204'];
            expect(resp['description']).toBe('Deleted');
            expect(resp['content']).toBeUndefined();
        });
    });

    // ── Deprecated Flag ──

    describe('Deprecated Flag', () => {
        it('should preserve deprecated flag on operations', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_PATH_PARAMS as Record<string, unknown>);
            expect(v3['paths']['/users/{userId}']['delete']['deprecated']).toBe(true);
        });
    });

    // ── Tags Passthrough ──

    describe('Tags', () => {
        it('should preserve tags array', () => {
            const v3 = convertSwagger2ToV3(SWAGGER2_MINIMAL as Record<string, unknown>);
            expect(v3['tags']).toHaveLength(1);
            expect(v3['tags'][0]['name']).toBe('pet');
            expect(v3['tags'][0]['description']).toBe('Pet operations');
        });
    });
});

// ============================================================================
// Integration: parseOpenAPI with Swagger 2.0 input
// ============================================================================

describe('parseOpenAPI with Swagger 2.0', () => {
    it('should parse a Swagger 2.0 JSON object', () => {
        const spec = parseOpenAPI(SWAGGER2_MINIMAL);
        expect(spec.title).toBe('Petstore');
        expect(spec.version).toBe('1.0.0');
    });

    it('should extract groups from Swagger 2.0 tags', () => {
        const spec = parseOpenAPI(SWAGGER2_MINIMAL);
        expect(spec.groups).toHaveLength(1);
        expect(spec.groups[0]!.tag).toBe('pet');
    });

    it('should extract servers from host/basePath/schemes', () => {
        const spec = parseOpenAPI(SWAGGER2_MINIMAL);
        expect(spec.servers).toHaveLength(1);
        expect(spec.servers[0]!.url).toBe('https://petstore.swagger.io/v2');
    });

    it('should parse operations with query parameters', () => {
        const spec = parseOpenAPI(SWAGGER2_MINIMAL);
        const params = spec.groups[0]!.actions[0]!.params;
        expect(params).toHaveLength(1);
        expect(params[0]!.name).toBe('limit');
        expect(params[0]!.source).toBe('query');
        expect(params[0]!.schema.type).toBe('integer');
    });

    it('should parse body parameters as requestBody', () => {
        const spec = parseOpenAPI(SWAGGER2_BODY);
        const action = spec.groups[0]!.actions[0]!;
        expect(action.requestBody).toBeDefined();
        expect(action.requestBody!.type).toBe('object');
    });

    it('should parse response schemas from Swagger 2.0', () => {
        const spec = parseOpenAPI(SWAGGER2_MINIMAL);
        const responses = spec.groups[0]!.actions[0]!.responses;
        const r200 = responses.find(r => r.statusCode === '200');
        expect(r200).toBeDefined();
        expect(r200!.schema).toBeDefined();
    });

    it('should parse deprecated operations', () => {
        const spec = parseOpenAPI(SWAGGER2_PATH_PARAMS);
        const deleteAction = spec.groups[0]!.actions.find(a => a.method === 'DELETE');
        expect(deleteAction!.deprecated).toBe(true);
    });

    it('should parse a Swagger 2.0 JSON string', () => {
        const jsonStr = JSON.stringify(SWAGGER2_MINIMAL);
        const spec = parseOpenAPI(jsonStr);
        expect(spec.title).toBe('Petstore');
        expect(spec.groups).toHaveLength(1);
    });

    it('should parse a Swagger 2.0 YAML string', () => {
        const yaml = `
swagger: "2.0"
info:
  title: YAML Swagger
  version: "2.0.0"
host: api.test.com
basePath: /v1
schemes:
  - https
paths:
  /items:
    get:
      operationId: listItems
      tags:
        - items
      parameters:
        - name: page
          in: query
          type: integer
      responses:
        "200":
          description: OK
          schema:
            type: array
            items:
              type: object
`;
        const spec = parseOpenAPI(yaml);
        expect(spec.title).toBe('YAML Swagger');
        expect(spec.servers[0]!.url).toBe('https://api.test.com/v1');
        expect(spec.groups).toHaveLength(1);
        expect(spec.groups[0]!.actions[0]!.params[0]!.name).toBe('page');
    });
});
