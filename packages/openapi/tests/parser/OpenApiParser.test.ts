import { describe, it, expect } from 'vitest';
import { parseOpenAPI } from '../../src/parser/OpenApiParser.js';

// ============================================================================
// OpenApiParser Tests
// ============================================================================

const MINIMAL_SPEC = `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      summary: List all pets
      tags:
        - pets
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
      responses:
        "200":
          description: A list of pets
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: integer
                    name:
                      type: string
    post:
      operationId: createPet
      summary: Create a pet
      tags:
        - pets
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  description: Pet name
                tag:
                  type: string
              required:
                - name
      responses:
        "201":
          description: Created
`;

const MULTI_TAG_SPEC = `
openapi: "3.0.0"
info:
  title: Multi Tag API
  version: "2.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      tags:
        - pets
      responses:
        "200":
          description: OK
  /store/inventory:
    get:
      operationId: getInventory
      tags:
        - store
      responses:
        "200":
          description: OK
`;

describe('OpenApiParser', () => {
    // ── Basic Parsing ──

    describe('Basic YAML Parsing', () => {
        it('should parse spec title and version', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            expect(spec.title).toBe('Test API');
            expect(spec.version).toBe('1.0.0');
        });

        it('should parse groups from tags', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            expect(spec.groups).toHaveLength(1);
            expect(spec.groups[0]!.tag).toBe('pets');
        });

        it('should parse all actions in a group', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const group = spec.groups[0]!;
            expect(group.actions).toHaveLength(2);
        });
    });

    // ── Action Details ──

    describe('Action Details', () => {
        it('should parse operationId', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const actions = spec.groups[0]!.actions;
            expect(actions[0]!.operationId).toBe('listPets');
            expect(actions[1]!.operationId).toBe('createPet');
        });

        it('should parse HTTP method in UPPERCASE', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const actions = spec.groups[0]!.actions;
            expect(actions[0]!.method).toBe('GET');
            expect(actions[1]!.method).toBe('POST');
        });

        it('should parse path', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            expect(spec.groups[0]!.actions[0]!.path).toBe('/pets');
        });

        it('should parse summary', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            expect(spec.groups[0]!.actions[0]!.summary).toBe('List all pets');
        });
    });

    // ── Parameters ──

    describe('Parameters', () => {
        it('should parse query parameters', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const params = spec.groups[0]!.actions[0]!.params;
            expect(params).toHaveLength(1);
            expect(params[0]!.name).toBe('limit');
            expect(params[0]!.source).toBe('query');
            expect(params[0]!.required).toBe(false);
        });

        it('should parse parameter schema', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const schema = spec.groups[0]!.actions[0]!.params[0]!.schema;
            expect(schema.type).toBe('integer');
        });
    });

    // ── Request Body ──

    describe('Request Body', () => {
        it('should parse request body schema', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const body = spec.groups[0]!.actions[1]!.requestBody;
            expect(body).toBeDefined();
            expect(body!.type).toBe('object');
            expect(body!.properties).toBeDefined();
            expect(body!.properties!['name']).toBeDefined();
        });

        it('should preserve required fields', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const body = spec.groups[0]!.actions[1]!.requestBody;
            expect(body!.required).toContain('name');
        });

        it('should preserve description on body properties', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const body = spec.groups[0]!.actions[1]!.requestBody;
            expect(body!.properties!['name']!.description).toBe('Pet name');
        });
    });

    // ── Responses ──

    describe('Responses', () => {
        it('should parse successful response schemas', () => {
            const spec = parseOpenAPI(MINIMAL_SPEC);
            const responses = spec.groups[0]!.actions[0]!.responses;
            expect(responses.length).toBeGreaterThan(0);
            const r200 = responses.find(r => r.statusCode === '200');
            expect(r200).toBeDefined();
            expect(r200!.schema).toBeDefined();
            expect(r200!.schema!.type).toBe('array');
        });
    });

    // ── Multi-Tag ──

    describe('Multi-Tag Grouping', () => {
        it('should create separate groups for different tags', () => {
            const spec = parseOpenAPI(MULTI_TAG_SPEC);
            expect(spec.groups).toHaveLength(2);
            const tags = spec.groups.map(g => g.tag).sort();
            expect(tags).toEqual(['pets', 'store']);
        });
    });

    // ── JSON Support ──

    describe('JSON Input', () => {
        it('should parse JSON strings', () => {
            const json = JSON.stringify({
                openapi: '3.0.0',
                info: { title: 'JSON API', version: '1.0.0' },
                paths: {
                    '/items': {
                        get: {
                            operationId: 'listItems',
                            tags: ['items'],
                            responses: { '200': { description: 'OK' } },
                        },
                    },
                },
            });
            const spec = parseOpenAPI(json);
            expect(spec.title).toBe('JSON API');
            expect(spec.groups).toHaveLength(1);
        });
    });

    // ── Edge Cases & Error Handling ──

    describe('Error Handling', () => {
        it('should throw on empty input', () => {
            expect(() => parseOpenAPI('')).toThrow();
        });

        it('should throw on invalid YAML', () => {
            expect(() => parseOpenAPI('{{{{not yaml')).toThrow();
        });

        it('should use fallback title/version if info is incomplete', () => {
            const spec = parseOpenAPI('openapi: "3.0.0"\ninfo: {}\npaths: {}');
            expect(spec.title).toBe('Untitled API');
            expect(spec.version).toBe('0.0.0');
        });

        it('should produce empty groups for spec with no paths', () => {
            const spec = parseOpenAPI('openapi: "3.0.0"\ninfo:\n  title: Empty\n  version: "1.0.0"\npaths: {}');
            expect(spec.groups).toHaveLength(0);
        });
    });

    // ── Malformed / Edge-Case OpenAPI Specs ──

    describe('Malformed & Edge-Case Specs', () => {
        it('should handle operation with no tags → default group', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: No Tags
  version: "1.0.0"
paths:
  /items:
    get:
      operationId: listItems
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            expect(spec.groups).toHaveLength(1);
            expect(spec.groups[0]!.tag).toBe('default');
        });

        it('should handle operation with empty responses', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Empty Responses
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: healthCheck
      tags:
        - health
      responses: {}
`;
            const spec = parseOpenAPI(yaml);
            expect(spec.groups[0]!.actions[0]!.responses).toEqual([]);
        });

        it('should handle multiple tags on single operation (uses first)', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Multi Tag Op
  version: "1.0.0"
paths:
  /both:
    get:
      operationId: bothEndpoint
      tags:
        - pets
        - store
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            // Should be grouped under first tag only
            const petGroup = spec.groups.find(g => g.tag === 'pets');
            expect(petGroup).toBeDefined();
            expect(petGroup!.actions).toHaveLength(1);
        });

        it('should handle path with path parameters', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Path Params
  version: "1.0.0"
paths:
  /users/{userId}/posts/{postId}:
    get:
      operationId: getUserPost
      tags:
        - users
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: integer
        - name: postId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            const params = spec.groups[0]!.actions[0]!.params;
            expect(params).toHaveLength(2);
            expect(params[0]!.name).toBe('userId');
            expect(params[0]!.source).toBe('path');
            expect(params[1]!.name).toBe('postId');
        });

        it('should handle deprecated operation', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Deprecated
  version: "1.0.0"
paths:
  /old:
    get:
      operationId: oldEndpoint
      deprecated: true
      tags:
        - legacy
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            expect(spec.groups[0]!.actions[0]!.deprecated).toBe(true);
        });

        it('should handle response with no content/schema', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: No Content
  version: "1.0.0"
paths:
  /void:
    delete:
      operationId: deleteItem
      tags:
        - items
      responses:
        "204":
          description: No Content
`;
            const spec = parseOpenAPI(yaml);
            const r204 = spec.groups[0]!.actions[0]!.responses.find(r => r.statusCode === '204');
            expect(r204).toBeDefined();
            expect(r204!.schema).toBeUndefined();
        });

        it('should handle spec with servers list', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: With Servers
  version: "1.0.0"
servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://staging.example.com/v1
paths:
  /ok:
    get:
      tags:
        - misc
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            expect(spec.servers).toHaveLength(2);
            expect(spec.servers[0]!.url).toBe('https://api.example.com/v1');
            expect(spec.servers[0]!.description).toBe('Production');
        });

        it('should handle request body with no content type', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: No Content Type
  version: "1.0.0"
paths:
  /test:
    post:
      operationId: testPost
      tags:
        - test
      requestBody:
        required: true
        content: {}
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            // Should not crash, requestBody should be undefined since no JSON content
            expect(spec.groups[0]!.actions[0]!.requestBody).toBeUndefined();
        });

        it('should handle operation with only header/cookie params', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Headers
  version: "1.0.0"
paths:
  /protected:
    get:
      operationId: protectedEndpoint
      tags:
        - auth
      parameters:
        - name: X-Api-Key
          in: header
          required: true
          schema:
            type: string
        - name: session
          in: cookie
          required: false
          schema:
            type: string
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            const params = spec.groups[0]!.actions[0]!.params;
            // header and cookie params should be captured
            expect(params.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle path item with only unsupported methods', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Trace
  version: "1.0.0"
paths:
  /debug:
    trace:
      operationId: traceDebug
      tags:
        - debug
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            // trace is a valid HTTP method in OpenAPI, may or may not be supported
            // The parser should not crash
            expect(spec.groups).toBeDefined();
        });

        it('should handle missing operationId', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: No OpId
  version: "1.0.0"
paths:
  /items:
    get:
      tags:
        - items
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            expect(spec.groups[0]!.actions[0]!.operationId).toBeUndefined();
        });

        it('should handle enum in parameter schema', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Enum Params
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: findByStatus
      tags:
        - pets
      parameters:
        - name: status
          in: query
          required: true
          schema:
            type: string
            enum:
              - available
              - pending
              - sold
      responses:
        "200":
          description: OK
`;
            const spec = parseOpenAPI(yaml);
            const param = spec.groups[0]!.actions[0]!.params[0]!;
            expect(param.schema.enum).toEqual(['available', 'pending', 'sold']);
        });

        it('should handle deeply nested response schema', () => {
            const yaml = `
openapi: "3.0.0"
info:
  title: Nested
  version: "1.0.0"
paths:
  /nested:
    get:
      operationId: getNested
      tags:
        - data
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        id:
                          type: integer
                        meta:
                          type: object
                          properties:
                            created:
                              type: string
                              format: date-time
`;
            const spec = parseOpenAPI(yaml);
            const schema = spec.groups[0]!.actions[0]!.responses[0]!.schema!;
            expect(schema.type).toBe('object');
            expect(schema.properties!['data']!.type).toBe('array');
            expect(schema.properties!['data']!.items!.properties!['meta']!.properties!['created']!.format).toBe('date-time');
        });
    });
});
